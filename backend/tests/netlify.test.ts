import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { createNetlifyHandler } from '../src/netlify-adapter.js';
import { testConfig, testPassword, testUser } from './auth-helper.js';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { readAuthConfig } from '../src/config/auth.js';
import { readDeploymentConfig } from '../src/config/deployment.js';

// Isolated configuration, synthetic user and in-memory session store. No .env or DB.
function hostedAdapter() {
  const env = { APP_MODE: 'hosted', TRUST_PROXY_HOPS: '1', SESSION_COOKIE_SECURE: 'true',
    SESSION_SECRET: randomBytes(32).toString('hex'), AUTH_ALLOWED_ORIGINS: 'https://pilot.example.test' };
  const app = createApp(async () => {}, undefined, undefined, undefined, undefined, undefined,
    { config: readAuthConfig(env), usuarios: { async byEmail() { return testUser; }, async byId() { return testUser; } } },
    readDeploymentConfig(env));
  assert.equal(app.get('trust proxy'), 1);
  const invoke = createNetlifyHandler(app);
  return async (path: string, method = 'GET', headers: Record<string,string> = {}, body: string | null = null,
    protocol: 'https' | 'http' | 'missing' = 'https') => {
    return await invoke({ path, httpMethod: method,
      headers: { host: 'pilot.example.test', origin: env.AUTH_ALLOWED_ORIGINS,
        'x-forwarded-for': '203.0.113.25',
        ...(protocol === 'missing' ? {} : { 'x-forwarded-proto': protocol }), ...headers },
      body, isBase64Encoded: false, queryStringParameters: {},
      requestContext: { identity: { sourceIp: '127.0.0.1' } } }, {}) as {
      statusCode: number; body: string; headers: Record<string,string>;
      multiValueHeaders?: Record<string,string[]>;
    };
  };
}

type HostedResponse = Awaited<ReturnType<ReturnType<typeof hostedAdapter>>>;
function responseCookies(response: HostedResponse): string[] {
  return response.multiValueHeaders?.['set-cookie'] ?? (response.headers['set-cookie'] ? [response.headers['set-cookie']] : []);
}

for (const prefix of ['/api', '/.netlify/functions/api']) {
  test(`Netlify hosted HTTPS: secure cookie, session and CSRF via ${prefix}`, async () => {
    const request = hostedAdapter();
    assert.equal((await request(prefix + '/auth/me')).statusCode, 401);
    const login = await request(prefix + '/auth/login', 'POST',
      { 'content-type': 'application/json', 'x-requested-with': 'DespachanteControl' },
      JSON.stringify({ email: testUser.email, senha: testPassword }));
    assert.equal(login.statusCode, 200);
    const cookies = responseCookies(login);
    assert.equal(cookies.length, 1);
    // Boolean assertions keep cookie values and tokens out of failure reports.
    for (const attribute of ['Secure','HttpOnly','SameSite=Strict','Path=/']) {
      assert.equal(cookies[0].split(';').map(part => part.trim()).includes(attribute), true, attribute);
    }
    const cookie = cookies[0].split(';')[0];
    const { csrfToken } = JSON.parse(login.body);
    assert.equal(typeof csrfToken, 'string');
    for (const route of ['/api', '/.netlify/functions/api']) {
      const me = await request(route + '/auth/me', 'GET', { cookie });
      assert.equal(me.statusCode, 200);
      assert.equal(JSON.parse(me.body).usuario.id_usuario, testUser.id_usuario);
      assert.equal(JSON.parse(me.body).csrfToken === csrfToken, true);
      const root = await request(route, 'GET', { cookie });
      assert.equal(root.statusCode, 404);
      assert.equal(JSON.parse(root.body).error.code, 'NOT_FOUND');
      assert.equal(/json/.test(root.headers['content-type']), true);
    }
    for (const token of [undefined, '0'.repeat(64)]) {
      const denied = await request(prefix + '/auth/logout', 'POST',
        { cookie, ...(token ? { 'x-csrf-token': token } : {}) });
      assert.equal(denied.statusCode, 403);
      assert.equal(JSON.parse(denied.body).error.code, 'CSRF_INVALID');
      assert.equal((await request(prefix + '/auth/me', 'GET', { cookie })).statusCode, 200);
    }
    const logout = await request(prefix + '/auth/logout', 'POST', { cookie, 'x-csrf-token': csrfToken });
    assert.equal(logout.statusCode, 204);
    assert.equal((await request('/api/auth/me', 'GET', { cookie })).statusCode, 401);
    assert.equal((await request('/.netlify/functions/api/auth/me', 'GET', { cookie })).statusCode, 401);
  });

  for (const protocol of ['http', 'missing'] as const) {
    test(`Netlify hosted rejects authenticated cookie without HTTPS (${protocol}) via ${prefix}`, async () => {
      const request = hostedAdapter();
      const response = await request(prefix + '/auth/login', 'POST',
        { 'content-type': 'application/json', 'x-requested-with': 'DespachanteControl' },
        JSON.stringify({ email: testUser.email, senha: testPassword }), protocol);
      assert.ok([200, 400, 403].includes(response.statusCode), 'Expected login or explicit transport rejection');
      assert.equal(responseCookies(response).length, 0, 'No authenticated cookie without verified HTTPS event');
    });
  }
}

test('Netlify adapter: JSON routes, direct function URL, session, CSRF and unknown API routes', async () => {
  let checks = 0;
  const app = createApp(async () => { checks++; }, undefined, undefined, undefined, undefined, undefined,
    { config: testConfig(), usuarios: { async byEmail() { return testUser; }, async byId() { return testUser; } } });
  const invoke = createNetlifyHandler(app);
  async function request(path: string, httpMethod = 'GET', headers = {}, body: string | null = null) {
    return await invoke({ path, httpMethod, headers, body, isBase64Encoded: false,
      queryStringParameters: {}, requestContext: { identity: { sourceIp: '127.0.0.1' } } }, {}) as {
      statusCode: number; body: string; headers: Record<string,string>; multiValueHeaders: Record<string,string[]>;
    };
  }
  for (const path of ['/api/health', '/.netlify/functions/api/health']) {
    const r = await request(path); assert.equal(r.statusCode, 200); assert.match(r.headers['content-type'], /json/);
  }
  assert.equal((await request('/api/health/db')).statusCode, 200);
  assert.equal(checks, 1);
  assert.equal((await request('/api/clientes')).statusCode, 401);
  const login = await request('/api/auth/login', 'POST', { 'content-type': 'application/json', 'x-requested-with': 'DespachanteControl' }, JSON.stringify({ email: testUser.email, senha: testPassword }));
  assert.equal(login.statusCode, 200);
  const cookie = (login.multiValueHeaders?.['set-cookie']?.[0] ?? login.headers['set-cookie']).split(';')[0];
  const { csrfToken } = JSON.parse(login.body);
  for (const path of ['/api', '/api/', '/api/missing', '/.netlify/functions/api/missing']) {
    const r = await request(path, 'GET', { cookie });
    assert.equal(r.statusCode, 404); assert.equal(JSON.parse(r.body).error.code, 'NOT_FOUND');
    assert.match(r.headers['content-type'], /json/); assert.equal(r.headers['cache-control'], 'no-store');
  }
  assert.equal((await request('/api/auth/me', 'GET', { cookie })).statusCode, 200);
  assert.equal((await request('/api/auth/logout', 'POST', { cookie })).statusCode, 403);
  assert.equal((await request('/api/auth/logout', 'POST', { cookie, 'x-csrf-token': csrfToken })).statusCode, 204);
  assert.equal((await request('/api/auth/me', 'GET', { cookie })).statusCode, 401);
});

test('Netlify adapter: health failure remains JSON 503', async () => {
  const invoke = createNetlifyHandler(createApp(async () => { throw new Error('mock only'); }));
  const r = await invoke({ path: '/api/health/db', httpMethod: 'GET', headers: {}, body: null }, {}) as { statusCode: number; body: string };
  assert.equal(r.statusCode, 503); assert.ok(JSON.parse(r.body));
});

test('Netlify configuration preserves API priority, isolated build and local entry', () => {
  const config = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');
  assert.ok(config.indexOf('from = "/api"') < config.indexOf('from = "/login"'));
  assert.ok(config.indexOf('from = "/api/*"') < config.indexOf('from = "/login"'));
  assert.ok(config.includes('publish = "../frontend/dist"'));
  assert.ok(config.includes('functions = "dist/netlify-functions"'));
  const entry = readFileSync(new URL('../src/netlify-functions/api.ts', import.meta.url), 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(entry, /server\.js|dotenv|\.listen\(|process\.on\(/);
  assert.ok(entry.includes('createPersistence'));
});
