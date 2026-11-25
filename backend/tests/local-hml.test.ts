import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadLocalHmlEnvironment } from '../src/config/local-hml.js';
import { readPostgresConfig } from '../src/config/postgres.js';
import { readAuthConfig } from '../src/config/auth.js';
import { readServerConfig } from '../src/config/env.js';

test('private HML launch isolates environment, pins runtime TLS and loopback HTTP, generates private secret', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dc-hml-'));
  const ca = path.join(dir, 'ca.crt'), file = path.join(dir, 'private.env');
  const previous = process.env.PG_PASSWORD;
  try {
    writeFileSync(ca, 'synthetic-ca');
    const source = `DB_PROVIDER=postgres\nPG_HOST=aws-0-us-east-2.pooler.supabase.com\nPG_PORT=5432\nPG_DATABASE=postgres\nPG_USER=dc_runtime.zhonseyahndqlzoygolr\nPG_SSL_MODE=verify-full\nPG_SSL_CA_FILE=${ca}\nPG_PASSWORD=synthetic\nAPP_MODE=hosted\nHOST=0.0.0.0\nPORT=9999`;
    writeFileSync(file, source); process.env.PG_PASSWORD = 'ignored';
    const env = loadLocalHmlEnvironment(file);
    assert.equal(env.PG_PASSWORD, 'synthetic'); assert.equal(process.env.PG_PASSWORD, 'ignored');
    assert.deepEqual(readServerConfig(env), { host: '127.0.0.1', port: 3001 });
    assert.equal(readAuthConfig(env).secureCookie, false);
    assert.equal(readPostgresConfig(env).statement_timeout, 15000);
    assert.deepEqual(readPostgresConfig(env).ssl, { rejectUnauthorized: true, ca: 'synthetic-ca' });
    assert.match(env.SESSION_SECRET!, /^[a-f0-9]{64}$/);
    assert.notEqual(loadLocalHmlEnvironment(file).SESSION_SECRET, env.SESSION_SECRET);
    writeFileSync(file, source.replace('PG_PASSWORD=synthetic', ''));
    assert.throws(() => loadLocalHmlEnvironment(file));
    writeFileSync(file, source.replace('dc_runtime.', 'postgres.'));
    assert.throws(() => loadLocalHmlEnvironment(file));
    assert.throws(() => loadLocalHmlEnvironment('.env'));
  } finally {
    if (previous === undefined) delete process.env.PG_PASSWORD; else process.env.PG_PASSWORD = previous;
    unlinkSync(file); unlinkSync(ca); rmdirSync(dir);
  }
});
