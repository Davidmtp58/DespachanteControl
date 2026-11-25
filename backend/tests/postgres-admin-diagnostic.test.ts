import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PoolClient } from 'pg';
import { adminFailure, AdminError } from '../src/services/admin-errors.js';
import { diagnosePostgresAdmin } from '../src/services/postgres-admin-diagnostic.js';
import { createPostgresFirstUser } from '../src/services/postgres-first-user.js';

test('administrative errors expose only stage and allowlisted code', () => {
  for (const code of ['28P01', '42501', '57014', '23505', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
    const message = adminFailure({ code, message: 'SECRET', detail: 'SECRET', password: 'SECRET', query: 'SECRET' }, 'connect');
    assert.ok(message.includes(code)); assert.ok(!message.includes('SECRET'));
  }
  assert.ok(adminFailure({ code: 'SECRET', message: 'SECRET' }, 'connect').includes('UNCLASSIFIED'));
  assert.ok(!adminFailure({ code: 'SECRET' }, 'connect').includes('SECRET'));
});

test('administrative diagnostic uses read-only transaction without creation, lock or personal data', async () => {
  for (const failure of ['', 'role', 'timeout', 'permissions']) {
    const calls: string[] = [];
    const client = { async query(sql: string) {
      calls.push(sql);
      if ((failure === 'role' && sql.startsWith('SET LOCAL ROLE')) ||
          (failure === 'permissions' && sql.includes('has_schema_privilege'))) throw { code: '42501', message: 'SECRET' };
      if (sql.includes('pg_has_role')) return { rows: [{ database_name: 'postgres', session_user: 'postgres', read_only: 'on', secret: 'SECRET' }] };
      if (sql === 'SHOW statement_timeout') return { rows: [{ statement_timeout: failure === 'timeout' ? '2min' : '15s' }] };
      return { rows: [{ effective_role: 'dc_migrator', users_count: '0', secret: 'SECRET' }] };
    } } as unknown as Pick<PoolClient, 'query'>;
    if (failure) await assert.rejects(diagnosePostgresAdmin(client), error => error instanceof AdminError && error.stage === failure);
    else assert.ok(!JSON.stringify(await diagnosePostgresAdmin(client)).includes('SECRET'));
    assert.equal(calls[0], 'BEGIN READ ONLY'); assert.equal(calls.at(-1), 'ROLLBACK');
    assert.ok(calls.every(sql => /^(BEGIN READ ONLY|SELECT|SET LOCAL ROLE dc_migrator|SET LOCAL statement_timeout = '15s'|SHOW statement_timeout|ROLLBACK)/.test(sql)));
    assert.ok(!calls.some(sql => /\b(INSERT|UPDATE|DELETE|GRANT|LOCK|CREATE)\b/.test(sql.replace(/'[^']*'/g, ''))));
  }
});

test('creation errors preserve role failure stage/code after rollback, without attempting INSERT', async () => {
  const calls: string[] = [];
  const client = { async query(sql: string) {
    calls.push(sql);
    if (sql === 'SET LOCAL ROLE dc_migrator') throw { code: '42501', detail: 'SECRET' };
    return { rows: [] };
  } } as unknown as Pick<PoolClient, 'query'>;
  await assert.rejects(createPostgresFirstUser(client, 'Synthetic', 'synthetic@example.test', 'Test-only123', 'Test-only123'), error => {
    assert.ok(error instanceof AdminError);
    assert.equal(error.stage, 'role'); assert.equal(error.code, '42501');
    assert.ok(!JSON.stringify(error).includes('SECRET')); return true;
  });
  assert.deepEqual(calls, ['BEGIN', 'SET LOCAL ROLE dc_migrator', 'ROLLBACK']);
});
