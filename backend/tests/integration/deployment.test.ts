import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import { startCluster } from '../../../database/postgresql/tests/cluster.mjs';
import { createPostgresFirstUser } from '../../src/services/postgres-first-user.js';

test('implantação: administrador sem SUPERUSER, bootstrap, migrações atômicas, runtime e primeira conta segura', async () => {
  const cluster = await startCluster();
  const client = new Client(cluster.connection());
  try {
    await client.connect();
    await client.query('CREATE ROLE managed_admin LOGIN CREATEROLE NOSUPERUSER NOCREATEDB NOBYPASSRLS');
    await client.query('GRANT CREATE, CONNECT ON DATABASE postgres TO managed_admin WITH GRANT OPTION');
    await client.query('SET SESSION AUTHORIZATION managed_admin');
    assert.equal((await client.query('SELECT rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0].rolsuper, false);
    const root = new URL('../../../database/postgresql/', import.meta.url);
    const bootstrap = await readFile(new URL('bootstrap.sql', root), 'utf8');
    // A preexisting unsafe identity is rejected before creating dc_migrator.
    await client.query('CREATE ROLE dc_api LOGIN');
    await assert.rejects(client.query(bootstrap));
    assert.equal((await client.query("SELECT to_regrole('dc_migrator') AS role")).rows[0].role, null);
    await client.query('DROP ROLE dc_api');
    // Expand only trusted checked-in psql includes; equivalent SQL transaction.
    let script = await readFile(new URL('deployment/apply.psql', root), 'utf8');
    script = script.replace(/^\\set .*$/m, '');
    for (const match of [...script.matchAll(/^\\ir (.+)$/gm)]) {
      const source = await readFile(new URL(match[1].trim(), new URL('deployment/', root)), 'utf8');
      if (match[1].includes('/migrations/')) assert.ok(script.includes(createHash('sha256').update(source).digest('hex')));
      script = script.replace(match[0], () => source);
    }
    await assert.rejects(client.query(script.replace('COMMIT;', 'SELECT 1/0; COMMIT;')));
    await client.query('ROLLBACK');
    assert.equal((await client.query("SELECT to_regnamespace('app') AS schema")).rows[0].schema, null);
    await client.query(script);
    assert.equal((await client.query('SELECT pg_has_role(current_user,\'dc_migrator\',\'SET\') AS allowed')).rows[0].allowed, true);
    await assert.rejects(client.query(script)); await client.query('ROLLBACK');
    const runtime = await readFile(new URL('deployment/runtime.sql', root), 'utf8');
    await client.query(runtime);
    await assert.rejects(client.query(runtime));
    await client.query('RESET SESSION AUTHORIZATION');
    await client.query('SET SESSION AUTHORIZATION dc_runtime');
    await client.query('SELECT * FROM app.vw_dashboard_resumo');
    for (const query of ['SET ROLE dc_migrator', 'SET ROLE dc_api', 'CREATE TABLE app.forbidden(id int)',
      "INSERT INTO app.usuario(nome,email,senha_hash) VALUES ('x','x','x')", 'DELETE FROM app.cliente']) {
      await assert.rejects(client.query(query), { code: '42501' });
    }
    await client.query('RESET SESSION AUTHORIZATION'); await client.query('SET SESSION AUTHORIZATION managed_admin');
    const password = 'Test-only123';
    const id = await createPostgresFirstUser(client, 'Jose\u0301', 'TEST@example.test', password, password);
    assert.ok(id > 0);
    await client.query('SET ROLE dc_migrator');
    const row = (await client.query('SELECT * FROM app.usuario')).rows[0];
    assert.equal(row.nome, 'José'); assert.equal(row.email, 'test@example.test');
    assert.ok(await bcrypt.compare(password, row.senha_hash)); assert.equal(bcrypt.getRounds(row.senha_hash), 12);
    await client.query('RESET ROLE');
    await assert.rejects(createPostgresFirstUser(client, 'Other', 'other@example.test', password, password), /Conta não criada/);
    await assert.rejects(createPostgresFirstUser(client, 'Other', 'other@example.test', 'short', 'short'), /Senha inválida/);
  } finally { await client.end(); await cluster.stop(); }
});
