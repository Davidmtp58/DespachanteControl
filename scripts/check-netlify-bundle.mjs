// Local packaging smoke test, not a deploy or a Netlify-runtime emulation.
// Uses the esbuild already locked by the backend's tsx development toolchain.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const backendRequire = createRequire(new URL('../backend/package.json', import.meta.url));
const { build } = createRequire(backendRequire.resolve('tsx'))('esbuild');
const config = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8');
const external = JSON.parse(/external_node_modules = (\[[^\n]+\])/.exec(config)[1]);
const output = new URL('../backend/dist/netlify-smoke/api.mjs', import.meta.url);
await build({
  entryPoints: [fileURLToPath(new URL('../backend/dist/netlify-functions/api.js', import.meta.url))],
  outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm',
  target: 'node22', external,
});
// Explicit synthetic process environment: no dotenv and no database operation.
process.env.APP_MODE = 'hosted';
process.env.TRUST_PROXY_HOPS = '1';
process.env.SESSION_SECRET = randomBytes(32).toString('hex');
process.env.SESSION_COOKIE_SECURE = 'true';
process.env.AUTH_ALLOWED_ORIGINS = 'https://pilot.example.test';
process.env.DB_PROVIDER = 'postgres';
process.env.AUTH_STATE_STORE = 'postgres';
for (const name of Object.keys(process.env)) if (name.startsWith('PG')) delete process.env[name];
const { handler } = await import(output.href);
// No PG configuration: protected requests must fail closed, never fall back.
for (const [path, status] of [['/api/health', 200], ['/api/clientes', 503]]) {
  const result = await handler({ path, httpMethod: 'GET', headers: {}, body: null }, {});
  assert.equal(result.statusCode, status);
  assert.match(result.headers['content-type'], /json/);
  JSON.parse(result.body);
}
console.log('Netlify bundle smoke: PASS (synthetic environment; no database access).');
