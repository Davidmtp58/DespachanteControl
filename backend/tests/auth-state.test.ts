import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAuthStores, PostgresSessionStore, PostgresLoginStore } from '../src/services/auth-state.js';
import { createApp } from '../src/app.js';
import { createNetlifyHandler } from '../src/netlify-adapter.js';
import { testConfig, testUser, testPassword } from './auth-helper.js';
import type { SessionData } from 'express-session';

test('shared auth selection fails closed; local SQL Server remains memory by default', () => {
  assert.deepEqual(createAuthStores({}, 'test', 1000), {});
  assert.throws(() => createAuthStores({}, 'test', 1000, undefined, true));
  assert.throws(() => createAuthStores({ AUTH_STATE_STORE: 'memory' }, 'test', 1000, undefined, true));
  assert.throws(() => createAuthStores({ AUTH_STATE_STORE: 'postgres', DB_PROVIDER: 'sqlserver' }, 'test', 1000));
  assert.throws(() => createAuthStores({ AUTH_STATE_STORE: 'typo' }, 'test', 1000));
});

test('session failures are safe and touch cannot resurrect a revoked session', async () => {
  let calls = 0;
  const store = new PostgresSessionStore({ async query() { calls++; throw new Error('private SQL/password'); } }, 'secret');
  const get = await new Promise<unknown>(resolve => store.get('sensitive-sid', error => resolve(error)));
  assert.equal((get as { status: number }).status, 503);
  assert.doesNotMatch(String(get), /private|password|sensitive-sid/);
  await new Promise<void>(resolve => store.touch('revoked', {} as SessionData, () => resolve()));
  assert.equal(calls, 1);
  const expired = await new Promise<unknown>(resolve => store.set('sid', { expiresAt: 0 } as SessionData, resolve));
  assert.equal((expired as { status: number }).status, 503);
  assert.equal(calls, 1);
});

test('shared limiter storage failure denies login before credential lookup', async () => {
  let lookups = 0;
  const config = testConfig();
  const app = createApp(async () => {}, undefined, undefined, undefined, undefined, undefined, {
    config, loginStore: new PostgresLoginStore({ async query() { throw new Error('private data'); } }, config.secret, 1000),
    usuarios: { async byEmail() { lookups++; return testUser; }, async byId() { return testUser; } },
  });
  const result = await createNetlifyHandler(app)({ path: '/api/auth/login', httpMethod: 'POST',
    requestContext: { identity: { sourceIp: '127.0.0.1' } },
    headers: { 'content-type': 'application/json', 'x-requested-with': 'DespachanteControl' },
    body: JSON.stringify({ email: testUser.email, senha: testPassword }) }, {}) as { statusCode: number; body: string };
  assert.equal(result.statusCode, 503); assert.equal(lookups, 0);
  assert.equal(JSON.parse(result.body).error.code, 'AUTH_STORAGE_UNAVAILABLE');
  assert.doesNotMatch(result.body, /private data/);
});

test('session SID and limiter IP are HMAC keys, never interpolated into SQL', async () => {
  const calls: unknown[][] = [];
  const db = { async query<T>(sql: string, values: unknown[] = []) { calls.push([sql, ...values]); return [] as T[]; } };
  await new Promise<void>(resolve => new PostgresSessionStore(db, 'test').destroy('raw-session', () => resolve()));
  await new PostgresLoginStore(db, 'test', 1000).resetKey('203.0.113.42');
  for (const [sql, key] of calls.filter(c => c.length > 1)) { assert.match(String(key), /^[a-f0-9]{64}$/); assert.match(String(sql), /\$1/); }
  assert.doesNotMatch(JSON.stringify(calls), /raw-session|203\.0\.113\.42/);
});
