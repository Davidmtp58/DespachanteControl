import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Only used by the disposable harness. No environment URLs or remote connections.
export async function migrate(sql) {
  const directory = new URL('../migrations/', import.meta.url);
  const names = (await readdir(directory)).filter(name => /^\d{3}_[a-z_]+\.sql$/.test(name)).sort();
  let batch = `BEGIN; SET LOCAL ROLE dc_migrator;
    SELECT pg_advisory_xact_lock(74102901);
    CREATE SCHEMA IF NOT EXISTS dc_migrations AUTHORIZATION dc_migrator;
    REVOKE ALL ON SCHEMA dc_migrations FROM PUBLIC;
    CREATE TABLE IF NOT EXISTS dc_migrations.history(version text PRIMARY KEY, checksum text NOT NULL);
  `;
  for (const name of names) {
    const source = await readFile(new URL(name, directory), 'utf8');
    const digest = createHash('sha256').update(source).digest('hex');
    if (source.includes('$migration_source$') || source.includes('$migration$')) throw new Error('Reserved migration delimiter.');
    batch += `DO $migration$ BEGIN
      IF EXISTS (SELECT FROM dc_migrations.history WHERE version = '${name}' AND checksum <> '${digest}') THEN
        RAISE EXCEPTION 'Applied migration checksum mismatch';
      ELSIF NOT EXISTS (SELECT FROM dc_migrations.history WHERE version = '${name}') THEN
        EXECUTE $migration_source$${source}$migration_source$;
        INSERT INTO dc_migrations.history VALUES ('${name}', '${digest}');
      END IF;
    END $migration$;\n`;
  }
  await sql(batch + 'COMMIT;');
}
