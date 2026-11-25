import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PoolClient } from 'pg';
import bcrypt from 'bcryptjs';
import { createPostgresFirstUser } from '../src/services/postgres-first-user.js';

const password = 'Test-e\u0301-123';
function mock(mode = 'success') {
  const calls: { sql: string; values?: string[] }[] = [];
  const client = { async query(sql: string, values?: string[]) {
    calls.push({ sql, values });
    if ((mode === 'set-error' && sql.startsWith('SET LOCAL statement_timeout')) ||
        (mode === 'show-error' && sql === 'SHOW statement_timeout') ||
        (mode === 'insert-error' && sql.startsWith('INSERT'))) throw new Error('PRIVATE_DRIVER_DETAILS');
    if (sql === 'SHOW statement_timeout') return { rows: mode === 'missing' ? [] : [{ statement_timeout: mode === 'wrong' ? '2min' : '15s' }] };
    if (sql.startsWith('SELECT 1')) return { rows: mode === 'existing' ? [{ exists: 1 }] : [] };
    return { rows: [{ id_usuario: 1 }] };
  } } as unknown as Pick<PoolClient, 'query'>;
  return { client, calls };
}

test('first PG user verifies local timeout before lock/INSERT, preserves bcrypt12 and parameterization', async () => {
  const { client, calls } = mock();
  assert.equal(await createPostgresFirstUser(client, 'Jose\u0301', 'USER@example.test', password, password), 1);
  assert.deepEqual(calls.slice(0, 7).map(call => call.sql), [
    'BEGIN', 'SET LOCAL ROLE dc_migrator', "SET LOCAL statement_timeout = '15s'", 'SHOW statement_timeout',
    "SET LOCAL lock_timeout = '5s'", 'LOCK TABLE app.usuario IN EXCLUSIVE MODE', 'SELECT 1 FROM app.usuario LIMIT 1',
  ]);
  const insert = calls.find(call => call.sql.startsWith('INSERT'))!;
  assert.deepEqual(insert.values?.slice(0, 2), ['José', 'user@example.test']);
  const hash = insert.values![2];
  assert.equal(bcrypt.getRounds(hash), 12);
  assert.ok(await bcrypt.compare(password, hash));
  assert.equal(await bcrypt.compare(password.normalize('NFC'), hash), false);
  assert.ok(!calls.some(call => call.sql.includes(hash) || call.sql.includes(password)));
  assert.equal(calls.at(-1)?.sql, 'COMMIT');
});

test('first PG user rolls back on SET/SHOW failure, missing/wrong timeout or existing user without INSERT', async () => {
  for (const mode of ['set-error', 'show-error', 'missing', 'wrong', 'existing']) {
    const { client, calls } = mock(mode);
    await assert.rejects(createPostgresFirstUser(client, 'Test', 'test@example.test', password, password), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Conta não criada/);
      assert.ok(!error.message.includes('PRIVATE_DRIVER_DETAILS'));
      return true;
    });
    assert.ok(!calls.some(call => /^(INSERT|COMMIT)/.test(call.sql)));
    assert.equal(calls.at(-1)?.sql, 'ROLLBACK');
  }
});

test('first PG user rolls back INSERT error and rejects invalid password before any SQL', async () => {
  const failed = mock('insert-error');
  await assert.rejects(createPostgresFirstUser(failed.client, 'Test', 'test@example.test', password, password), /Conta não criada/);
  assert.equal(failed.calls.at(-1)?.sql, 'ROLLBACK');
  assert.ok(!failed.calls.some(call => call.sql === 'COMMIT'));
  const invalid = mock();
  await assert.rejects(createPostgresFirstUser(invalid.client, 'Test', 'test@example.test', 'short', 'short'));
  assert.equal(invalid.calls.length, 0);
});
