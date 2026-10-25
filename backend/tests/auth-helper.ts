import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import type { AuthConfig } from '../src/config/auth.js';
import type { UsuarioRecord } from '../src/repositories/usuario-repository.js';

// Dados exclusivamente sintéticos: nenhuma leitura de .env ou SQL real.
export const testPassword = 'SenhaSomenteTeste!123';
export const testUser: UsuarioRecord = { id_usuario: 1, nome: 'Teste', email: 'teste@example.com',
  senha_hash: bcrypt.hashSync(testPassword, 4), ativo: true, data_cadastro: new Date('2026-01-01T00:00:00Z') };
export function testConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return { secret: randomBytes(32).toString('hex'), ttlMs: 60000, secureCookie: false,
    origins: ['http://127.0.0.1:5173'], loginWindowMs: 60000, loginLimit: 1000, ...overrides };
}
export function createTestApp(...args: Parameters<typeof createApp>) {
  args[6] = { config: testConfig(), usuarios: { async byEmail() { return testUser; }, async byId() { return testUser; } } };
  return createApp(...args);
}
export async function login(url: string, senha = testPassword, email = testUser.email, cookie?: string) {
  return globalThis.fetch(`${url}/api/auth/login`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-Requested-With': 'DespachanteControl', ...(cookie ? { Cookie: cookie } : {}),
  }, body: JSON.stringify({ email, senha }) });
}
const sessions = new Map<string, Promise<{ cookie: string; csrf: string }>>();
export async function authenticatedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const origin = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).origin;
  if (!sessions.has(origin)) sessions.set(origin, (async () => {
    const response = await login(origin);
    if (response.status !== 200) throw new Error('Falha no login de teste.');
    return { cookie: response.headers.get('set-cookie')!.split(';')[0], csrf: (await response.json()).csrfToken as string };
  })());
  const session = await sessions.get(origin)!;
  const headers = new Headers(init?.headers);
  headers.set('Cookie', session.cookie);
  headers.set('X-CSRF-Token', session.csrf);
  return globalThis.fetch(input, { ...init, headers });
}
