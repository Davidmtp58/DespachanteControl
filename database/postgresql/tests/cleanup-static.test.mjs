// Static regression checks only: no database client, connection or SQL execution.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const sql = readFileSync(new URL('../deployment/cleanup-hml-f42f.psql', import.meta.url), 'utf8');
const doc = readFileSync(new URL('../deployment/HML-F42F-CLEANUP.md', import.meta.url), 'utf8');
const start = sql.indexOf('-- Exact per-ID manifest');
const end = sql.indexOf("RAISE EXCEPTION 'Exact per-ID manifest mismatch");
const manifest = sql.slice(start, end);
const expected = [
  ['cliente', 'id_cliente = 1', 'nome_razao_social COLLATE "C" = \'TESTE_HML_F42F_CLIENTE_A_EDITADO\''],
  ['cliente', 'id_cliente = 3', 'nome_razao_social COLLATE "C" = \'TESTE_HML_F42F_EMPRESA_B\''],
  ['veiculo', 'id_veiculo = 1', 'modelo COLLATE "C" = \'TESTE_HML_F42F_V1\'', 'id_cliente_proprietario = 1'],
  ['veiculo', 'id_veiculo = 2', 'modelo COLLATE "C" = \'TESTE_HML_F42F_V2\'', 'id_cliente_proprietario = 3'],
  ['servico', 'id_servico = 1', 'observacoes COLLATE "C" = \'TESTE_HML_F42F_S1\'', 'id_cliente = 3', 'id_veiculo = 1', 'status COLLATE "C" = \'EM_ANDAMENTO\'', 'valor_recebido = 150.01::numeric'],
  ['servico', 'id_servico = 2', 'observacoes COLLATE "C" = \'TESTE_HML_F42F_S2\'', 'id_cliente = 1', 'id_veiculo = 2', 'status COLLATE "C" = \'CONCLUIDO\'', 'valor_recebido = 350.51::numeric'],
  ['servico', 'id_servico = 3', 'observacoes COLLATE "C" = \'TESTE_HML_F42F_S3\'', 'id_cliente = 1', 'id_veiculo = 1', 'status COLLATE "C" = \'CANCELADO\'', 'valor_recebido = 0.00::numeric'],
  ['despesa_servico', 'id_despesa = 1', 'descricao COLLATE "C" = \'TESTE_HML_F42F_D1\'', 'id_servico = 1', 'valor = 10.02::numeric'],
  ['despesa_servico', 'id_despesa = 2', 'descricao COLLATE "C" = \'TESTE_HML_F42F_D2\'', 'id_servico = 1', 'valor = 5.98::numeric'],
  ['despesa_servico', 'id_despesa = 3', 'descricao COLLATE "C" = \'TESTE_HML_F42F_D3\'', 'id_servico = 3', 'valor = 5.00::numeric'],
];
const clauses = [...manifest.matchAll(/NOT EXISTS \(SELECT FROM app\.(\w+) WHERE ([^)]*)\)/g)];
test('both rejection branches raise errors before the transaction instead of quitting successfully', () => {
  const preamble = sql.slice(0, sql.indexOf('\nBEGIN;'));
  assert.doesNotMatch(sql, /\\quit\b/);
  assert.match(preamble, /\\if :target_ok\s+\\else\s+\\echo[^\n]*\s+DO \$\$ BEGIN RAISE EXCEPTION 'Unexpected connection destination'; END \$\$;/);
  assert.match(preamble, /\\if :authorized\s+\\else\s+\\echo[^\n]*\s+DO \$\$ BEGIN RAISE EXCEPTION 'Cleanup not authorized'; END \$\$;/);
});
for (const [table, ...predicates] of expected) {
  test(`manifest binds ${table} ${predicates[0]} to every approved attribute`, () => {
    const match = clauses.find(m => m[1] === table && m[2].trim().startsWith(predicates[0] + '\n'));
    assert.ok(match);
    assert.deepEqual(match[2].trim().split(/\s+AND\s+/), predicates);
  });
}
test('all manifest checks abort before any DELETE', () => {
  assert.equal(clauses.length, 10);
  assert.ok(start > 0 && end > start && end < sql.indexOf('DELETE FROM'));
  assert.ok(!manifest.includes("'TESTE_HML_F42F_CLIENTE_A'"));
});
test('deletion is limited to explicit IDs and correct order', () => {
  const deletes = [...sql.matchAll(/DELETE FROM app\.\w+ WHERE \w+ IN \([\d,]+\);/g)].map(m => m[0]);
  assert.deepEqual(deletes, [
    'DELETE FROM app.despesa_servico WHERE id_despesa IN (1,2,3);',
    'DELETE FROM app.servico WHERE id_servico IN (1,2,3);',
    'DELETE FROM app.veiculo WHERE id_veiculo IN (1,2);',
    'DELETE FROM app.cliente WHERE id_cliente IN (1,3);',
  ]);
  const code = sql.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(code, /\b(TRUNCATE|CASCADE|CREATE|ALTER|DROP|GRANT|REVOKE|setval|RESTART)\b/i);
});
test('transaction, identity, preservation and post-checks remain', () => {
  for (const guard of ['\\set ON_ERROR_STOP on', '\\conninfo', "session_user <> 'postgres'",
    "pg_has_role(session_user, 'dc_migrator', 'SET')", 'SET LOCAL ROLE dc_migrator;',
    'SHARE ROW EXCLUSIVE MODE', 'saved_users IS DISTINCT FROM', 'saved_types IS DISTINCT FROM',
    'saved_history IS DISTINCT FROM', 'Unexpected dependency or delete behavior']) assert.ok(sql.includes(guard));
  assert.ok(sql.indexOf('Post-cleanup verification failed') < sql.indexOf('COMMIT;'));
});
test('documented connection and backup do not rely on manual psql target variables', () => {
  assert.ok(doc.includes("Where-Object Name -Like 'PG*'"));
  assert.ok(doc.includes('psql -X -W --dbname="host=aws-0-us-east-2.pooler.supabase.com port=5432 dbname=postgres user=postgres.zhonseyahndqlzoygolr sslmode=verify-full'));
  assert.ok(doc.includes("sslrootcert='C:/Users/David Mangueira/supabase/prod-ca-2021.crt'"));
  assert.ok(doc.includes('--format=custom --schema=app --schema=dc_migrations'));
  assert.ok(doc.includes('pg_restore --exit-on-error --single-transaction'));
  assert.doesNotMatch(doc, /password=\S+/i);
});
