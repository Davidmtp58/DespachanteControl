import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionData } from 'express-session';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import { startCluster } from '../../../database/postgresql/tests/cluster.mjs';
import { migrate } from '../../../database/postgresql/tests/migrate.mjs';
import { PostgresDatabase } from '../../src/database/postgres.js';
import { PostgresSessionStore, PostgresLoginStore } from '../../src/services/auth-state.js';
import { createApp } from '../../src/app.js';
import { createNetlifyHandler } from '../../src/netlify-adapter.js';
import { testConfig, testPassword, testUser } from '../auth-helper.js';

test('shared auth on real disposable PostgreSQL only', async t => {
  const cluster = await startCluster();
  const admin = new Pool(cluster.connection());
  const databases: PostgresDatabase[] = [];
  try {
    await cluster.sql(await readFile(new URL('../../../database/postgresql/bootstrap.sql', import.meta.url), 'utf8'));
    await migrate(cluster.sql);
    const password = randomBytes(32).toString('hex');
    await admin.query(`CREATE ROLE auth_test_runtime LOGIN PASSWORD '${password}'; GRANT dc_api TO auth_test_runtime`);
    // Dedicated runtime identity within the disposable cluster, no permanent DB.
    const connection = cluster.connection();
    const runtime = () => {
      const db = new PostgresDatabase(() => ({ ...connection, user: 'auth_test_runtime', password, statement_timeout: 15000 }));
      databases.push(db);
      return db;
    };
    // Runtime privileges tested with a separate client under session authorization.
    const permissionClient = await admin.connect();
    await permissionClient.query('SET SESSION AUTHORIZATION auth_test_runtime');
    const executor = { async query<T>(sql: string, values?: unknown[]) { return (await permissionClient.query(sql, values)).rows as T[]; } };
    const config = testConfig({ loginLimit: 3 });
    const newInstance = (db = runtime()) => createNetlifyHandler(createApp(async () => {}, undefined, undefined, undefined, undefined, undefined, {
      config, sessionStore: new PostgresSessionStore(db, config.secret),
      loginStore: new PostgresLoginStore(db, config.secret, config.loginWindowMs),
      usuarios: { async byEmail() { return testUser; }, async byId() { return testUser; } },
    }));
    const request = async (handler: ReturnType<typeof newInstance>, path: string, method = 'GET', headers = {}, body: string | null = null) =>
      await handler({ path: '/api/auth/' + path, httpMethod: method, headers, body,
        requestContext: { identity: { sourceIp: '127.0.0.1' } } }, {}) as {
        statusCode: number; body: string; headers: Record<string,string>; multiValueHeaders?: Record<string,string[]>;
      };
    const login = (handler: ReturnType<typeof newInstance>) => request(handler, 'login', 'POST',
      { 'content-type': 'application/json', 'x-requested-with': 'DespachanteControl' }, JSON.stringify({ email: testUser.email, senha: testPassword }));
    let a = newInstance(), b = newInstance();
    let cookie = '', csrf = '';
    await t.test('login in A survives a new pool and instance B; CSRF is shared', async () => {
      const r = await login(a); assert.equal(r.statusCode, 200);
      cookie = (r.multiValueHeaders?.['set-cookie']?.[0] ?? r.headers['set-cookie']).split(';')[0];
      csrf = JSON.parse(r.body).csrfToken;
      await databases[0].close();
      const me = await request(b, 'me', 'GET', { cookie }); assert.equal(me.statusCode, 200);
      assert.equal(JSON.parse(me.body).csrfToken, csrf);
      assert.equal((await request(b, 'logout', 'POST', { cookie })).statusCode, 403);
      assert.equal((await request(b, 'logout', 'POST', { cookie, 'x-csrf-token': 'f'.repeat(64) })).statusCode, 403);
    });
    await t.test('logout in B revokes session for a newly created instance', async () => {
      assert.equal((await request(b, 'logout', 'POST', { cookie, 'x-csrf-token': csrf })).statusCode, 204);
      a = newInstance(); assert.equal((await request(a, 'me', 'GET', { cookie })).statusCode, 401);
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM dc_auth.sessions WHERE NOT revoked')).rows[0].n, 0);
    });
    await t.test('limiter counts survive instances; concurrent increments are atomic', async () => {
      assert.equal((await login(a)).statusCode, 200); assert.equal((await login(b)).statusCode, 200);
      assert.equal((await login(newInstance())).statusCode, 429);
      const stores = [new PostgresLoginStore(runtime(), config.secret, 60000), new PostgresLoginStore(runtime(), config.secret, 60000)];
      const hits = await Promise.all(Array.from({ length: 20 }, (_, i) => stores[i % 2].increment('concurrency-key')));
      assert.deepEqual(hits.map(h => h.totalHits).sort((x,y) => x-y), Array.from({ length: 20 }, (_, i) => i+1));
    });
    await t.test('independent connections serialize save/logout in both lock orders', async () => {
      for (const revokeFirst of [false, true]) {
        const ca = await admin.connect(), cb = await admin.connect();
        try {
          await ca.query('SET ROLE auth_test_runtime'); await cb.query('SET ROLE auth_test_runtime');
          const wrap = (client: typeof ca) => ({ async query<T>(sql: string, values?: unknown[]) {
            return (await client.query(sql, values)).rows as T[];
          } });
          const sa = new PostgresSessionStore(wrap(ca), config.secret);
          const sb = new PostgresSessionStore(wrap(cb), config.secret);
          const sid = 'race-' + revokeFirst;
          const payload = { expiresAt: Date.now()+60000 } as SessionData;
          const save = (s: PostgresSessionStore) => new Promise<unknown>(resolve => s.set(sid,payload,resolve));
          const revoke = (s: PostgresSessionStore) => new Promise<unknown>(resolve => s.destroy(sid,resolve));
          await ca.query('BEGIN');
          assert.equal(await (revokeFirst ? revoke(sa) : save(sa)), undefined);
          const pid = (await cb.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
          const pending = revokeFirst ? save(sb) : revoke(sb);
          let waiting = false;
          for (let attempt=0; attempt<100; attempt++) {
            waiting = (await admin.query("SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock') AS waiting",[pid])).rows[0].waiting;
            if (waiting) break;
            await new Promise(resolve => setTimeout(resolve,10));
          }
          assert.equal(waiting,true,'Second independent connection must wait on the first transaction');
          await ca.query('COMMIT');
          const outcome = await pending;
          if (revokeFirst) assert.equal((outcome as { status: number }).status,503);
          else assert.equal(outcome,undefined);
          const restored = await new Promise<SessionData | null | undefined>((resolve,reject) =>
            sb.get(sid,(error,data) => error ? reject(error) : resolve(data)));
          assert.equal(restored,null);
          assert.equal((await save(sb) as { status: number }).status,503);
        } finally {
          await ca.query('ROLLBACK'); await ca.query('RESET ROLE'); await cb.query('RESET ROLE');
          ca.release(); cb.release();
        }
      }
    });
    await t.test('expired tombstones are reclaimed; expired delayed saves remain rejected', async () => {
      const store = new PostgresSessionStore(runtime(),config.secret);
      await admin.query("UPDATE dc_auth.sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE revoked");
      const expired = { expiresAt: Date.now()-1 } as SessionData;
      const failure = await new Promise<unknown>(resolve => store.set('race-true',expired,resolve));
      assert.equal((failure as { status:number }).status,503);
      await new Promise<void>((resolve,reject) => store.destroy('cleanup-trigger',err => err ? reject(err) : resolve()));
      assert.equal((await admin.query("SELECT count(*)::int AS n FROM dc_auth.sessions WHERE revoked AND expires_at<=clock_timestamp()")).rows[0].n,0);
      assert.equal((await admin.query("SELECT count(*)::int AS n FROM dc_auth.sessions WHERE revoked AND data <> '{}'::jsonb")).rows[0].n,0);
    });
    await t.test('expired sessions are rejected and expired counters restart', async () => {
      await admin.query("UPDATE dc_auth.sessions SET expires_at=clock_timestamp()-interval '1 second'");
      const r = await request(b, 'me', 'GET', { cookie }); assert.equal(r.statusCode, 401);
      await admin.query("UPDATE dc_auth.login_limits SET expires_at=clock_timestamp()-interval '1 second'");
      const logged = await login(b); assert.equal(logged.statusCode, 200);
      cookie = (logged.multiValueHeaders?.['set-cookie']?.[0] ?? logged.headers['set-cookie']).split(';')[0];
      await admin.query("UPDATE dc_auth.sessions SET expires_at=clock_timestamp()-interval '1 second'");
      assert.equal((await request(newInstance(), 'me', 'GET', { cookie })).statusCode, 401);
    });
    await t.test('runtime has only required table permissions, no DDL or user writes', async () => {
      const limiter = new PostgresLoginStore(executor, config.secret, 1000);
      assert.equal((await limiter.increment('runtime-key')).totalHits, 1);
      await limiter.decrement('runtime-key'); await limiter.resetKey('runtime-key');
      await assert.rejects(permissionClient.query('CREATE TABLE dc_auth.forbidden(id int)'), { code: '42501' });
      await assert.rejects(permissionClient.query('DELETE FROM app.usuario'), { code: '42501' });
      await assert.rejects(permissionClient.query('SELECT * FROM dc_migrations.history'), { code: '42501' });
    });
    await permissionClient.query('RESET SESSION AUTHORIZATION'); permissionClient.release();
    await t.test('failed session save cannot produce a successful login', async () => {
      await admin.query('REVOKE INSERT ON dc_auth.sessions FROM dc_api');
      try {
        const r = await login(newInstance());
        assert.equal(r.statusCode, 503);
        assert.equal(JSON.parse(r.body).error.code, 'AUTH_STORAGE_UNAVAILABLE');
        assert.equal(Boolean(r.headers['set-cookie']), false);
        assert.equal(Boolean(r.multiValueHeaders?.['set-cookie']), false);
      } finally { await admin.query('GRANT INSERT ON dc_auth.sessions TO dc_api'); }
    });
    await t.test('missing SELECT permission fails closed with safe 503', async () => {
      await admin.query('REVOKE SELECT ON dc_auth.sessions FROM dc_api');
      try {
        const r = await request(newInstance(), 'me', 'GET', { cookie });
        assert.equal(r.statusCode, 503);
        assert.equal(JSON.parse(r.body).error.code, 'AUTH_STORAGE_UNAVAILABLE');
        assert.doesNotMatch(r.body, /dc_auth|permission denied|SELECT/);
      } finally { await admin.query('GRANT SELECT ON dc_auth.sessions TO dc_api'); }
    });
    await t.test('failed logout is not reported as success; recovery revokes across instances', async () => {
      await admin.query('DELETE FROM dc_auth.login_limits');
      const logged = await login(newInstance()); assert.equal(logged.statusCode, 200);
      const activeCookie = (logged.multiValueHeaders?.['set-cookie']?.[0] ?? logged.headers['set-cookie']).split(';')[0];
      const token = JSON.parse(logged.body).csrfToken;
      await admin.query('REVOKE UPDATE ON dc_auth.sessions FROM dc_api');
      try {
        const failed = await request(newInstance(), 'logout', 'POST', { cookie: activeCookie, 'x-csrf-token': token });
        assert.equal(failed.statusCode, 503);
        assert.equal(JSON.parse(failed.body).error.code, 'AUTH_STORAGE_UNAVAILABLE');
      } finally { await admin.query('GRANT UPDATE ON dc_auth.sessions TO dc_api'); }
      assert.equal((await request(newInstance(), 'logout', 'POST', { cookie: activeCookie, 'x-csrf-token': token })).statusCode, 204);
      assert.equal((await request(newInstance(), 'me', 'GET', { cookie: activeCookie })).statusCode, 401);
    });
    await t.test('technical schema has no exposure to public Supabase identities', async () => {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        await admin.query(`CREATE ROLE ${role} NOLOGIN`);
        const rights = await admin.query(`SELECT has_schema_privilege($1,'dc_auth','USAGE') AS schema,
          has_table_privilege($1,'dc_auth.sessions','SELECT') AS sessions,
          has_table_privilege($1,'dc_auth.login_limits','SELECT') AS limits`, [role]);
        assert.deepEqual(rights.rows[0], { schema: false, sessions: false, limits: false });
      }
    });
    await t.test('business tables remain empty and seed types unchanged', async () => {
      for (const table of ['cliente','veiculo','servico','despesa_servico','usuario']) {
        assert.equal((await admin.query(`SELECT count(*)::int AS n FROM app.${table}`)).rows[0].n, 0);
      }
      assert.equal((await admin.query('SELECT count(*)::int AS n FROM app.tipo_servico')).rows[0].n, 4);
    });
  } finally { for (const db of databases) await db.close(); await admin.end(); await cluster.stop(); }
});
