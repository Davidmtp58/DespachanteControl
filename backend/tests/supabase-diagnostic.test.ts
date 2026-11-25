import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnosticConfig, loadDiagnosticConfig, runDiagnostic, type DiagnosticClient } from '../src/services/supabase-diagnostic.js';
import { mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('diagnostic config is isolated, requires PG_PASSWORD and verified HML runtime TLS', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'dc-diagnostic-'));
  const ca = path.join(directory, 'ca.crt');
  writeFileSync(ca, 'synthetic-ca');
  const source = `DB_PROVIDER=postgres\nPG_HOST=aws-0-us-east-2.pooler.supabase.com\nPG_PORT=5432\nPG_DATABASE=postgres\nPG_USER=dc_runtime.zhonseyahndqlzoygolr\nPG_SSL_MODE=verify-full\nPG_SSL_CA_FILE=${ca}\nPG_PASSWORD="synthetic#password"`;
  const previous = process.env.PG_PASSWORD;
  try {
    process.env.PG_PASSWORD = 'must-not-be-used';
    const config = diagnosticConfig(source);
    assert.equal(config.password, 'synthetic#password');
    assert.deepEqual(config.ssl, { rejectUnauthorized: true, ca: 'synthetic-ca' });
    assert.match(config.options!, /default_transaction_read_only=on/);
    assert.throws(() => diagnosticConfig(source.replace(/\nPG_PASSWORD=.*$/, '')));
    for (const [before, after] of [['verify-full', 'disable'], ['dc_runtime.', 'postgres.'], ['DB_PROVIDER=postgres', 'DB_PROVIDER=sqlserver']]) {
      assert.throws(() => diagnosticConfig(source.replace(before, after)));
    }
    assert.throws(() => loadDiagnosticConfig('.env'));
    assert.equal(process.env.PG_PASSWORD, 'must-not-be-used');
  } finally {
    if (previous === undefined) delete process.env.PG_PASSWORD; else process.env.PG_PASSWORD = previous;
    // Only files created by this test; no recursive deletion.
    rmSync(ca); rmdirSync(directory);
  }
});

test('diagnostic uses one connection, read-only queries, limited output and closes on failure', async () => {
  for (const mode of ['success', 'query-error', 'set-error', 'not-applied', 'not-restored']) {
    const statements: string[] = [];
    let closed = false, connections = 0, local = false, rolledBack = false;
    const client: DiagnosticClient = {
      async connect() { connections++; }, on() {}, async end() { closed = true; },
      async query(sql) {
        statements.push(sql);
        if (sql.startsWith('SET LOCAL')) {
          if (mode === 'set-error') throw new Error('NEVER_OUTPUT');
          local = true;
        }
        if (sql === 'ROLLBACK') { local = false; rolledBack = true; }
        if (sql === 'SHOW statement_timeout') return { rows: [{ statement_timeout: mode === 'not-applied' ? '2min' : '15s' }] };
        if (sql.includes('FROM pg_settings')) return { rows: [{ name: 'statement_timeout',
          setting: local || (rolledBack && mode === 'not-restored') ? '15000' : '120000',
          unit: 'ms', source: local ? 'session' : 'configuration file', reset_val: '120000', secret: 'NEVER_OUTPUT' }] };
        if (sql.includes('current_database')) return { rows: [{ database_name: 'postgres', user_name: 'dc_runtime', session_user: 'dc_runtime', transaction_read_only: 'on', client_encoding: 'UTF8', password: 'NEVER_OUTPUT' }] };
        if (sql.includes('tipo_servico') && mode === 'query-error') throw new Error('NEVER_OUTPUT');
        return { rows: [{ tipos_servico: '4', usuarios: '0', receita_total: '0.00' }] };
      },
    };
    const operation = runDiagnostic({ statement_timeout: 15000 }, () => client);
    if (mode !== 'success') await assert.rejects(operation); else {
      const result = await operation;
      assert.ok(!JSON.stringify(result).includes('NEVER_OUTPUT'));
      assert.equal(result.timeout.before.setting, '120000');
      assert.equal(result.timeout.local.setting, '15000');
      assert.equal(result.timeout.show_after_set_local, '15s');
      assert.equal(result.timeout.after_rollback.setting, '120000');
      assert.equal(result.timeout.restored, true);
      assert.equal(statements.at(-2), 'ROLLBACK');
    }
    assert.equal(statements[0], 'BEGIN READ ONLY');
    assert.ok(statements.every(sql => /^(SELECT|BEGIN READ ONLY|ROLLBACK|SHOW statement_timeout$|SET LOCAL statement_timeout = '15s'$)/.test(sql)));
    if (mode === 'set-error' || mode === 'not-applied') assert.ok(!statements.some(sql => sql.includes('tipo_servico')));
    assert.equal(connections, 1); assert.equal(closed, true);
  }
});
