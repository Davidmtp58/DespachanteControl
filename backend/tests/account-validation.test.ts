import assert from 'node:assert/strict';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import { prepareFirstUser } from '../src/services/first-user.js';
import { createPostgresFirstUser } from '../src/services/postgres-first-user.js';
import { validateFirstAccount } from '../src/services/account-validation.js';
import { AccountValidationError, adminFailure } from '../src/services/admin-errors.js';

for (const provider of ['sqlserver', 'postgres']) {
  for (const length of [7, 8, 12, 13]) {
    test(`${provider}: password length ${length} follows shared policy with bcrypt12`, async () => {
      const password = 'X'.repeat(length);
      let hash = ''; const calls: string[] = [];
      const client = { async query(sql: string, values?: string[]) {
        calls.push(sql);
        if (sql === 'SHOW statement_timeout') return { rows: [{ statement_timeout: '15s' }] };
        if (sql.startsWith('INSERT')) { hash = values![2]; return { rows: [{ id_usuario: 1 }] }; }
        return { rows: [] };
      } } as unknown as Pick<PoolClient, 'query'>;
      const run = async () => {
        if (provider === 'postgres') await createPostgresFirstUser(client, 'Test', 'test@example.test', password, password);
        else hash = (await prepareFirstUser('Test', 'test@example.test', password, password)).match(/\$2b\$12\$[./A-Za-z0-9]{53}/)![0];
      };
      if (length === 7 || length === 13) {
        await assert.rejects(run, error => error instanceof AccountValidationError && error.code === 'PASSWORD_LENGTH');
        assert.deepEqual(calls, []);
      } else {
        await run(); assert.equal(bcrypt.getRounds(hash), 12); assert.ok(await bcrypt.compare(password, hash));
      }
    });
  }
  test(`${provider}: invalid email and confirmation have safe specific codes before SQL`, async () => {
    const client = { query() { assert.fail('Validation must precede SQL'); } } as unknown as Pick<PoolClient, 'query'>;
    for (const [email, confirmation, code] of [
      ['invalid-private-email', 'Test-only123', 'INVALID_EMAIL'],
      ['test@example.test', 'private-mismatch', 'PASSWORD_CONFIRMATION_MISMATCH'],
    ]) {
      const args = ['Test', email, 'Test-only123', confirmation] as const;
      await assert.rejects(provider === 'postgres' ? createPostgresFirstUser(client, ...args) : prepareFirstUser(...args), error => {
        assert.ok(error instanceof AccountValidationError);
        assert.equal(error.stage, 'validation'); assert.equal(error.code, code);
        const message = adminFailure(error, 'input');
        assert.ok(message.includes(error.message)); assert.ok(!message.includes('UNCLASSIFIED'));
        for (const secret of [email, confirmation, 'Test-only123']) assert.ok(!message.includes(secret));
        return true;
      });
    }
  });
}

test('password length counts code points without normalization or trimming', () => {
  assert.doesNotThrow(() => validateFirstAccount('Test', 'test@example.test', '😀'.repeat(8), '😀'.repeat(8)));
  assert.throws(() => validateFirstAccount('Test', 'test@example.test', 'e\u0301'.repeat(7), 'e\u0301'.repeat(7)), { code: 'PASSWORD_LENGTH' });
  assert.throws(() => validateFirstAccount('Test', 'test@example.test', ' Test123', 'Test123 '), { code: 'PASSWORD_CONFIRMATION_MISMATCH' });
});
