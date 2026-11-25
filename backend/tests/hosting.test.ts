import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { readServerConfig } from '../src/config/env.js';
import { readAuthConfig } from '../src/config/auth.js';
import { readDeploymentConfig } from '../src/config/deployment.js';
import { testConfig, testUser, testPassword } from './auth-helper.js';

const hosted = { APP_MODE: 'hosted', PORT: '10000', SESSION_SECRET: 'a'.repeat(64),
  SESSION_COOKIE_SECURE: 'true', AUTH_ALLOWED_ORIGINS: 'https://pilot.example.test', TRUST_PROXY_HOPS: '1' };

test('hosted: configuration is explicit and local defaults stay unchanged', () => {
  assert.deepEqual(readServerConfig({}), { host: '127.0.0.1', port: 3001 });
  assert.throws(() => readServerConfig({ HOST: '0.0.0.0' }));
  assert.deepEqual(readServerConfig(hosted), { host: '0.0.0.0', port: 10000 });
  assert.throws(() => readServerConfig({ ...hosted, PORT: undefined }));
  assert.throws(() => readServerConfig({ ...hosted, HOST: 'localhost' }));
  assert.throws(() => readDeploymentConfig({ APP_MODE: 'typo' }));
  assert.deepEqual(readDeploymentConfig({}), { hosted: false, trustProxy: false });
  assert.equal(readDeploymentConfig(hosted).trustProxy, 1);
  for (const TRUST_PROXY_HOPS of [undefined, 'true', '0', '2']) assert.throws(() => readDeploymentConfig({ ...hosted, TRUST_PROXY_HOPS }));
  assert.equal(readAuthConfig(hosted).secureCookie, true);
  for (const SESSION_COOKIE_SECURE of [undefined, 'false']) assert.throws(() => readAuthConfig({ ...hosted, SESSION_COOKIE_SECURE }));
  for (const AUTH_ALLOWED_ORIGINS of [undefined, '*', 'https://*.example.test', 'http://pilot.example.test', 'https://localhost', 'https://pilot.example.test/', 'https://pilot.example.test,https://other.example.test', 'https://user:pass@pilot.example.test']) {
    assert.throws(() => readAuthConfig({ ...hosted, AUTH_ALLOWED_ORIGINS }));
  }
});

test('hosted: static routes, secure sessions, CSRF, API contracts and restricted proxy', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dc-hosted-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>React fixture</title>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("fixture")');
  writeFileSync(join(dir, '.env'), 'DO_NOT_SERVE');
  const config = testConfig({ ...readAuthConfig(hosted), loginLimit: 2 });
  const app = createApp(async () => { throw new Error('simulated db unavailable'); }, undefined, undefined, undefined, undefined, undefined,
    { config, usuarios: { async byEmail() { return testUser; }, async byId() { return testUser; } } },
    { trustProxy: 1, frontendDirectory: dir });
  const trust = app.get('trust proxy fn') as (ip: string, index: number) => boolean;
  assert.equal(trust('127.0.0.1', 0), true);
  assert.equal(trust('203.0.113.9', 1), false);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const proxy = { 'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '203.0.113.7', Origin: hosted.AUTH_ALLOWED_ORIGINS };
  const login = (extra: Record<string, string> = {}) => fetch(base + '/api/auth/login', { method: 'POST', headers: { ...proxy,
    'Content-Type': 'application/json', 'X-Requested-With': 'DespachanteControl', ...extra },
    body: JSON.stringify({ email: testUser.email, senha: testPassword }) });
  try {
    for (const path of ['/', '/login', '/dashboard', '/clientes', '/veiculos/', '/servicos', '/despesas']) {
      const r = await fetch(base + path); assert.equal(r.status, 200); assert.match(r.headers.get('content-type')!, /text\/html/);
    }
    assert.equal((await fetch(base + '/assets/app.js')).status, 200);
    for (const path of ['/assets/missing.js', '/unknown', '/.env', '/backend/.env']) assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await fetch(base + '/api/health')).status, 200);
    assert.equal((await fetch(base + '/api/health/db')).status, 503);
    const blocked = await fetch(base + '/api/clientes'); assert.equal(blocked.status, 401); assert.match(blocked.headers.get('content-type')!, /json/);
    assert.equal((await login({ Origin: 'https://evil.example.test' })).status, 403);
    const insecure = await login({ 'X-Forwarded-Proto': 'http', 'X-Forwarded-For': '203.0.113.8' });
    assert.equal(insecure.headers.get('set-cookie'), null);
    const response = await login(); assert.equal(response.status, 200);
    const header = response.headers.get('set-cookie')!;
    for (const attr of ['Secure', 'HttpOnly', 'SameSite=Strict']) assert.ok(header.includes(attr));
    const cookie = header.split(';')[0]; const { csrfToken } = await response.json();
    const headers = { ...proxy, Cookie: cookie };
    assert.equal((await fetch(base + '/api/auth/me', { headers })).status, 200);
    const missing = await fetch(base + '/api/missing', { headers }); assert.equal(missing.status, 404); assert.match(missing.headers.get('content-type')!, /json/);
    assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers })).status, 403);
    assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { ...headers, 'X-CSRF-Token': csrfToken } })).status, 204);
    assert.equal((await fetch(base + '/api/auth/me', { headers })).status, 401);
    assert.equal((await login({ 'X-Forwarded-For': '198.51.100.1, 203.0.113.7' })).status, 200);
    // Changing attacker-controlled leftmost IP cannot bypass the nearest-hop IP limit.
    assert.equal((await login({ 'X-Forwarded-For': '198.51.100.2, 203.0.113.7' })).status, 429);
    assert.equal((await login({ 'X-Forwarded-For': '203.0.113.9' })).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});
