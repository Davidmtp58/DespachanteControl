import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startCluster } from './cluster.mjs';
import { fileURLToPath } from 'node:url';

test('UTF8 read-only psql file, without bootstrap or migrations', async () => {
  const cluster = await startCluster();
  try {
    const path = fileURLToPath(new URL('../deployment/check-encoding.psql', import.meta.url)).replaceAll('\\', '/');
    const output = await cluster.sql(`SET default_transaction_read_only=on;\n\\i '${path}'`);
    assert.ok(output.includes('UTF8'));
    assert.equal(await cluster.sql("SELECT count(*) FROM pg_namespace WHERE nspname IN ('app','dc_migrations');"), '0');
    // Same bytes as the reported error: invalid as UTF8, valid as WIN1252.
    await assert.rejects(cluster.sql("BEGIN READ ONLY; SELECT convert_from(decode('e7e36f','hex'),'UTF8'); COMMIT;"));
    assert.equal(await cluster.sql("BEGIN READ ONLY; SELECT encode(convert_to(convert_from(decode('e7e36f','hex'),'WIN1252'),'UTF8'),'hex'); COMMIT;"), 'c3a7c3a36f');
    const script = await readFile(new URL('../deployment/invoke-hml.ps1', import.meta.url), 'utf8');
    assert.ok(/^[\x00-\x7f]*$/.test(script));
  } finally { await cluster.stop(); }
});
