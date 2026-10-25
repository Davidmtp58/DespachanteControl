import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import bcrypt from 'bcryptjs';
import sql from 'mssql';
import { createApp } from '../src/app.js';
import { readAuthConfig, type AuthConfig } from '../src/config/auth.js';
import { SqlUsuarioRepository, type UsuarioRecord, type UsuarioRepository } from '../src/repositories/usuario-repository.js';
import { SqlClienteRepository } from '../src/repositories/cliente-repository.js';
import { SqlVeiculoRepository } from '../src/repositories/veiculo-repository.js';
import { SqlServicoRepository } from '../src/repositories/servico-repository.js';
import { SqlDespesaRepository } from '../src/repositories/despesa-repository.js';
import { SqlFinanceiroRepository } from '../src/repositories/financeiro-repository.js';
import type { QueryExecutor, SqlParameter } from '../src/database/connection.js';
import { prepareFirstUser } from '../src/services/first-user.js';
import { login, testConfig, testPassword, testUser } from './auth-helper.js';

async function api(run: (url: string, state: { user: UsuarioRecord | undefined; calls: number }) => Promise<void>, config: Partial<AuthConfig> = {}, repository?: UsuarioRepository) {
  const state = { user: { ...testUser } as UsuarioRecord | undefined, calls: 0 };
  const usuarios = repository ?? { async byEmail(email: string) { return state.user?.email === email ? state.user : undefined; }, async byId() { return state.user; } };
  const db: QueryExecutor = { async query<T>() { state.calls++; return [] as T[]; } };
  const app = createApp(async () => {}, new SqlClienteRepository(db), new SqlVeiculoRepository(db), new SqlServicoRepository(db), new SqlDespesaRepository(db), new SqlFinanceiroRepository(db), { config: testConfig(config), usuarios });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, state); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
async function session(url: string) {
  const response = await login(url);
  assert.equal(response.status, 200);
  const body = await response.json();
  return { response, body, cookie: response.headers.get('set-cookie')!.split(';')[0] };
}

test('auth: login, cookie HttpOnly/Strict, me sem hash, CSRF e logout revogam sessão', async () => {
  await api(async url => {
    const { response, body, cookie } = await session(url);
    assert.match(response.headers.get('set-cookie')!, /HttpOnly/);
    assert.match(response.headers.get('set-cookie')!, /SameSite=Strict/);
    assert.match(response.headers.get('set-cookie')!, /Expires=/);
    assert.equal(body.usuario.email, testUser.email);
    assert.ok(!JSON.stringify(body).includes('senha_hash'));
    assert.ok(!JSON.stringify(body).includes(testUser.senha_hash));
    const me = await fetch(`${url}/api/auth/me`, { headers: { Cookie: cookie } });
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), body);
    assert.equal((await fetch(`${url}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } })).status, 403);
    const logout = await fetch(`${url}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': body.csrfToken } });
    assert.equal(logout.status, 204);
    assert.equal(await logout.text(), '');
    assert.match(logout.headers.get('set-cookie')!, /Expires=Thu, 01 Jan 1970/);
    assert.equal((await fetch(`${url}/api/auth/me`, { headers: { Cookie: cookie } })).status, 401);
  });
});

test('auth: proteção de todas as rotas de negócio e ausência de registro público', async () => {
  await api(async (url, state) => {
    for (const path of ['/clientes', '/clientes/1', '/veiculos', '/servicos', '/tipos-servico', '/despesas',
      '/servicos/1/despesas', '/dashboard/resumo', '/financeiro/servicos', '/servicos/1/resumo-financeiro']) {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
        assert.equal((await fetch(`${url}/api${path}`, { method })).status, 401, `${method} ${path}`);
      }
    }
    assert.equal(state.calls, 0);
    assert.equal((await fetch(`${url}/api/auth/register`, { method: 'POST' })).status, 401);
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
    assert.equal((await fetch(`${url}/api/health/db`)).status, 200);
  });
});

test('auth: sem dependências de autenticação não há liberação implícita', async () => {
  const app = createApp(async () => {});
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/clientes`);
    assert.equal(response.status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('auth: senha errada, e-mail ausente, conta inativa e hash inválido têm erro genérico', async () => {
  await api(async (url, state) => {
    const expected = { error: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.' } };
    for (const [senha, email] of [['errada', testUser.email], [testPassword, 'ausente@example.com'], ['x'.repeat(73), testUser.email]]) {
      const response = await login(url, senha, email);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), expected);
      assert.equal(response.headers.get('set-cookie'), null);
    }
    state.user!.ativo = false;
    const inactive = await login(url);
    assert.equal(inactive.status, 401); assert.deepEqual(await inactive.json(), expected);
    state.user!.ativo = true; state.user!.senha_hash = 'texto-puro-invalido';
    const malformed = await login(url);
    assert.equal(malformed.status, 401); assert.deepEqual(await malformed.json(), expected);
  });
});

test('auth: renovação no login invalida cookie anterior; cookie adulterado é recusado', async () => {
  await api(async url => {
    const first = await session(url);
    const again = await login(url, testPassword, testUser.email, first.cookie);
    assert.equal(again.status, 200);
    assert.notEqual(again.headers.get('set-cookie')!.split(';')[0], first.cookie);
    assert.equal((await fetch(`${url}/api/auth/me`, { headers: { Cookie: first.cookie } })).status, 401);
    assert.equal((await fetch(`${url}/api/auth/me`, { headers: { Cookie: 'dc.sid=invalido' } })).status, 401);
  });
});

test('auth: expiração absoluta e conta desativada/removida/senha alterada encerram acesso', async () => {
  await api(async url => {
    const { cookie } = await session(url);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal((await fetch(`${url}/api/auth/me`, { headers: { Cookie: cookie } })).status, 401);
  }, { ttlMs: 50 });
  for (const change of ['inactive', 'removed', 'password']) {
    await api(async (url, state) => {
      const { cookie } = await session(url);
      if (change === 'inactive') state.user!.ativo = false;
      if (change === 'removed') state.user = undefined;
      if (change === 'password') state.user!.senha_hash = await bcrypt.hash('outra-senha-testes', 4);
      assert.equal((await fetch(`${url}/api/clientes`, { headers: { Cookie: cookie } })).status, 401);
      assert.equal(state.calls, 0);
    });
  }
});

test('auth: limita tentativas por IP e ignora X-Forwarded-For não confiável', async () => {
  await api(async url => {
    assert.equal((await login(url, 'errada')).status, 401);
    assert.equal((await login(url, 'errada')).status, 401);
    const response = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-Requested-With': 'DespachanteControl', 'X-Forwarded-For': '8.8.8.8',
    }, body: JSON.stringify({ email: testUser.email, senha: testPassword }) });
    assert.equal(response.status, 429);
    assert.ok(response.headers.has('retry-after'));
    assert.equal((await response.json()).error.code, 'LOGIN_RATE_LIMIT');
  }, { loginLimit: 2 });
});

test('auth: CORS exato, login com cabeçalho obrigatório e CSRF antes de negócio', async () => {
  await api(async (url, state) => {
    const denied = await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { Origin: 'https://malicioso.example' } });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
    assert.equal((await fetch(`${url}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
    const preflight = await fetch(`${url}/api/auth/login`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5173' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://127.0.0.1:5173');
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
    const { cookie, body } = await session(url);
    for (const token of ['', 'a'.repeat(64), 'é'.repeat(64)]) {
      const response = await fetch(`${url}/api/clientes`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': token } });
      assert.equal(response.status, 403);
    }
    assert.equal(state.calls, 0);
    assert.equal((await fetch(`${url}/api/clientes`, { headers: { Cookie: cookie } })).status, 200);
    // CSRF válido passa à validação do contrato; corpo ausente resulta em 400.
    assert.equal((await fetch(`${url}/api/clientes`, { method: 'POST', headers: { Cookie: cookie, 'X-CSRF-Token': body.csrfToken } })).status, 400);
  });
});

test('auth: falha do repositório não expõe hash/credenciais', async () => {
  await api(async url => {
    const response = await login(url);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Erro interno da API.' } });
  }, {}, { async byEmail() { throw new Error('senha_hash=segredo'); }, async byId() { throw new Error('segredo'); } });
});

test('auth: repositório só consulta Usuario com parâmetros', async () => {
  const calls: Array<{ statement: string; parameters?: SqlParameter[] }> = [];
  const repo = new SqlUsuarioRepository({ async query<T>(statement: string, parameters?: SqlParameter[]) {
    calls.push({ statement, parameters }); return [testUser] as T[];
  } });
  const email = "x' OR 1=1 --@example.com";
  await repo.byEmail(email); await repo.byId(7);
  assert.ok(calls.every(c => c.statement.startsWith('SELECT') && c.statement.includes('FROM dbo.Usuario')));
  assert.ok(!calls[0].statement.includes(email));
  assert.deepEqual(calls[0].parameters, [{ name: 'email', type: sql.VarChar(150), value: email }]);
  assert.deepEqual(calls[1].parameters, [{ name: 'id', type: sql.Int(), value: 7 }]);
});

test('auth: configuração exige segredo e origens locais exatas', () => {
  assert.throws(() => readAuthConfig({}), /SESSION_SECRET/);
  const base = { SESSION_SECRET: testConfig().secret };
  assert.equal(readAuthConfig(base).ttlMs, 1800000);
  for (const AUTH_ALLOWED_ORIGINS of ['*', 'null', 'https://example.com', 'http://localhost:5173/path']) {
    assert.throws(() => readAuthConfig({ ...base, AUTH_ALLOWED_ORIGINS }), /AUTH_ALLOWED_ORIGINS/);
  }
  assert.throws(() => readAuthConfig({ ...base, SESSION_TTL_MINUTES: '0' }));
  assert.throws(() => readAuthConfig({ ...base, SESSION_COOKIE_SECURE: 'yes' }));
});

test('primeiro usuário: gera SQL com bcrypt 12, sem senha clara e sem executar banco', async () => {
  const senha = 'SenhaFicticia!12345';
  const result = await prepareFirstUser("Teste O'Nome", 'TESTE@example.com', senha, senha);
  assert.ok(!result.includes(senha));
  assert.match(result, /Teste O''Nome/);
  assert.match(result, /teste@example.com/);
  assert.match(result, /UPDLOCK, HOLDLOCK/);
  const hash = result.match(/\$2b\$12\$[./A-Za-z0-9]{53}/)?.[0];
  assert.ok(hash);
  assert.ok(await bcrypt.compare(senha, hash));
  await assert.rejects(prepareFirstUser('Teste', 'teste@example.com', 'curta', 'curta'));
  await assert.rejects(prepareFirstUser('Teste', 'teste@example.com', 'é'.repeat(40), 'é'.repeat(40)));
  await assert.rejects(prepareFirstUser('Teste', 'teste@example.com', senha, 'diferente'));
});
