import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const sql = read('../deployment/apply-006.psql');
const ps = read('../deployment/apply-006.ps1');
test('only migration 006 is included; no initial bootstrap or business writes', () => {
  assert.deepEqual(sql.match(/^\\ir .+$/gm), ['\\ir ../migrations/006_auth_state.sql']);
  assert.doesNotMatch(sql, /(?:DELETE FROM|UPDATE|INSERT INTO|ALTER TABLE|DROP TABLE)\s+app\./i);
  assert.doesNotMatch(sql, /\\quit|runtime\.sql|bootstrap\.sql/);
});
test('all six file checksums match pinned deployment values', () => {
  for (const [name, hash] of [...ps.matchAll(/'([0-9]{3}_[^']+\.sql)'='([a-f0-9]{64})'/g)].map(m => [m[1], m[2]])) {
    const bytes = readFileSync(new URL('../migrations/' + name, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, name);
    assert.ok(sql.includes(hash));
  }
  assert.equal([...ps.matchAll(/'([0-9]{3}_[^']+\.sql)'='([a-f0-9]{64})'/g)].length, 6);
});
test('transaction serializes history and validates before commit', () => {
  const fragments = ['\\set ON_ERROR_STOP on', 'BEGIN;', 'pg_advisory_xact_lock(74102901)',
    'SET LOCAL ROLE dc_migrator;', 'LOCK TABLE dc_migrations.history',
    'Migration history mismatch', '\\ir ../migrations/006_auth_state.sql',
    'INSERT INTO dc_migrations.history', 'Post-migration structure/ownership/history mismatch',
    'Data API role access detected', 'COMMIT;'];
  let previous = -1;
  for (const fragment of fragments) { const index = sql.indexOf(fragment); assert.ok(index > previous, fragment); previous = index; }
});
test('launcher pins real endpoint and full TLS verification; prompts password without retry', () => {
  for (const fragment of [String.raw`& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -X -W`, 'host=aws-0-us-east-2.pooler.supabase.com', 'port=5432',
    'dbname=postgres', 'user=postgres.zhonseyahndqlzoygolr', 'sslmode=verify-full',
    "sslrootcert='$ca'", 'gssencmode=disable', 'Get-FileHash', 'ON_ERROR_STOP=1', '$LASTEXITCODE -ne 0']) assert.ok(ps.includes(fragment));
  assert.doesNotMatch(ps, /PGPASSWORD|sslmode=require|Start-Process|Invoke-Expression/);
});
test('client connection is reported before SQL; upstream SSL is not a client TLS gate', () => {
  assert.match(sql, /^\\conninfo$/m);
  assert.ok(sql.indexOf('\\conninfo') < sql.indexOf('SELECT'));
  assert.ok(sql.indexOf('\\conninfo') < sql.indexOf('BEGIN;'));
  assert.doesNotMatch(sql, /FROM\s+pg_stat_ssl|Server connection requires TLS/i);
  assert.doesNotMatch(sql, /^\\(?:connect|c)\s/gm);
  assert.equal([...ps.matchAll(/& 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql\.exe'/g)].length, 1);
  assert.match(ps, /sslmode=verify-full sslrootcert='\$ca' gssencmode=disable/);
  assert.doesNotMatch(ps, /sslmode=(?:disable|allow|prefer|require|verify-ca)\b/);
});
test('launcher rejects missing PostgreSQL 17 executable before connecting', () => {
  const guard = String.raw`if (-not (Test-Path -LiteralPath 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -PathType Leaf))`;
  const invocation = String.raw`& 'C:\Program Files\PostgreSQL\17\bin\psql.exe'`;
  assert.ok(ps.includes(guard));
  assert.ok(ps.indexOf(guard) < ps.indexOf(invocation));
  assert.match(ps.slice(ps.indexOf(guard), ps.indexOf(invocation)), /throw 'PostgreSQL 17 psql\.exe not found/);
  assert.doesNotMatch(ps, /&\s+psql\s/);
});
