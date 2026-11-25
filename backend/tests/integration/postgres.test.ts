import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { startCluster } from '../../../database/postgresql/tests/cluster.mjs';
import { migrate } from '../../../database/postgresql/tests/migrate.mjs';
import { createPersistence } from '../../src/database/persistence.js';
import { createApp } from '../../src/app.js';
import { testConfig } from '../auth-helper.js';
import { vehicleTests } from './vehicle-cases.js';
import { serviceTests } from './service-cases.js';
import { expenseTests } from './expense-cases.js';
import { PostgresDatabase } from '../../src/database/postgres.js';

let cluster: Awaited<ReturnType<typeof startCluster>>;
let admin: Pool;
let persistence: ReturnType<typeof createPersistence>;
let server: Server;
let url: string;
let cookie: string;
let csrf: string;
const password = randomBytes(20).toString('hex') + 'e\u0301';
const email = 'usuário@example.test';
const input = { tipo_pessoa: 'PF', nome_razao_social: 'Sintético', cpf_cnpj: '52998224725',
  telefone: '0000000000', email: null, data_nascimento: '2000-02-29' };
function request(path: string, method = 'GET', body?: unknown, authenticated = true) {
  return fetch(url + path, { method, headers: { 'Content-Type': 'application/json',
    'X-Requested-With': 'DespachanteControl', ...(authenticated ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function login(senha = password, address = email.normalize('NFD')) {
  return request('/api/auth/login', 'POST', { email: address, senha }, false);
}
before(async () => {
  cluster = await startCluster();
  console.log('Integração HTTP PostgreSQL descartável:', await cluster.sql('SHOW server_version;'));
  await cluster.sql(await readFile(new URL('../../../database/postgresql/bootstrap.sql', import.meta.url), 'utf8'));
  await migrate(cluster.sql);
  const connection = cluster.connection();
  admin = new Pool(connection);
  const apiPassword = randomBytes(32).toString('hex');
  // Generated hex only; role DDL does not support bind parameters.
  await admin.query(`CREATE ROLE dc_test_api LOGIN PASSWORD '${apiPassword}'; GRANT dc_api TO dc_test_api`);
  await admin.query('INSERT INTO app.usuario(nome,email,senha_hash,data_cadastro) VALUES ($1,$2,$3,$4)',
    ['Usuário sintético', email, await bcrypt.hash(password, 4), '2026-01-02T03:04:05.123456Z']);
  persistence = createPersistence({ DB_PROVIDER: 'postgres', APP_MODE: 'local', PG_HOST: connection.host,
    PG_PORT: String(connection.port), PG_DATABASE: connection.database, PG_USER: 'dc_test_api', PG_PASSWORD: apiPassword, PG_SSL_MODE: 'disable' });
  server = createApp(() => persistence.database.check(), persistence.clientes, persistence.veiculos, persistence.servicos, persistence.despesas, persistence.financeiro,
    { config: testConfig(), usuarios: persistence.usuarios }, undefined, persistence.provider).listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const response = await login();
  assert.equal(response.status, 200);
  cookie = response.headers.get('set-cookie')!.split(';')[0];
  csrf = (await response.json()).csrfToken;
});
after(async () => {
  try {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (persistence) await persistence.database.close();
    if (admin) await admin.end();
  } finally { if (cluster) await cluster.stop(); }
});

test('PG: login NFD, cookie e timestamp público UTC; hash não sai da API', async () => {
  const response = await login();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie')!, /HttpOnly/);
  assert.match(response.headers.get('set-cookie')!, /SameSite=Strict/);
  const body = await response.json();
  assert.equal(body.usuario.email, email);
  assert.equal(body.usuario.data_cadastro, '2026-01-02T03:04:05.123Z');
  assert.deepEqual(Object.keys(body.usuario).sort(), ['ativo', 'data_cadastro', 'email', 'id_usuario', 'nome']);
  assert.equal((await login(password.normalize('NFC'))).status, 401);
  assert.equal((await login(password, 'ausente@example.test')).status, 401);
});
test('PG: cadastro NFC antes do limite, consulta, edição, duplicidade e datas', async () => {
  const name = 'é'.repeat(150);
  const response = await request('/api/clientes', 'POST', { ...input, nome_razao_social: name.normalize('NFD') });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.nome_razao_social, name);
  assert.equal(created.data_nascimento, '2000-02-29');
  assert.match(created.data_cadastro, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.equal(response.headers.get('location'), `/api/clientes/${created.id_cliente}`);
  assert.deepEqual(await (await request(`/api/clientes/${created.id_cliente}`)).json(), created);
  assert.equal((await (await request('/api/clientes')).json()).length, 1);
  const duplicate = await request('/api/clientes', 'POST', input);
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, 'DUPLICATE_DOCUMENT');
  const updated = await request(`/api/clientes/${created.id_cliente}`, 'PUT', { ...input, nome_razao_social: "José'); DROP TABLE app.cliente;--", data_nascimento: null });
  assert.equal(updated.status, 200);
  const edited = await updated.json();
  assert.equal(edited.data_cadastro, created.data_cadastro);
  assert.equal(edited.data_nascimento, null);
  assert.equal(edited.nome_razao_social, "José'); DROP TABLE app.cliente;--");
  assert.equal((await request('/api/clientes/999999')).status, 404);
  assert.equal((await request('/api/clientes/999999', 'PUT', input)).status, 404);
  assert.equal((await request(`/api/clientes/${created.id_cliente}`, 'PUT', { nome_razao_social: 'Parcial' })).status, 400);
});
test('PG: validações continuam 400; duplicidade na edição não altera o registro', async () => {
  for (const patch of [{ tipo_pessoa: 'X' }, { nome_razao_social: '' }, { nome_razao_social: 'é'.repeat(151).normalize('NFD') },
    { cpf_cnpj: '123' }, { data_nascimento: '2026-02-30' }]) {
    assert.equal((await request('/api/clientes', 'POST', { ...input, ...patch })).status, 400);
  }
  const second = await request('/api/clientes', 'POST', { ...input, cpf_cnpj: '11144477735' });
  assert.equal(second.status, 201);
  const id = (await second.json()).id_cliente;
  const duplicate = await request(`/api/clientes/${id}`, 'PUT', input);
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error.code, 'DUPLICATE_DOCUMENT');
  assert.equal((await (await request(`/api/clientes/${id}`)).json()).cpf_cnpj, '11144477735');
});
test('PG: unicidade e consulta Unicode usam a mesma chave; acentos permanecem distintos', async () => {
  assert.ok(await persistence.usuarios.byEmail(email.toUpperCase().normalize('NFD') + ' '));
  assert.equal(await persistence.usuarios.byEmail('usuario@example.test'), undefined);
  await assert.rejects(admin.query('INSERT INTO app.usuario(nome,email,senha_hash) VALUES ($1,$2,$3)',
    ['Teste', email.normalize('NFD'), 'não é credencial']), { code: '23505' });
});
test('PG: permissões mínimas negam escrita de usuário, exclusão de cliente e DDL', async () => {
  for (const sql of ['UPDATE app.usuario SET ativo=false WHERE false', 'DELETE FROM app.cliente WHERE false',
    'CREATE TABLE app.proibida(id integer)', 'SELECT * FROM dc_migrations.history']) {
    await assert.rejects(persistence.database instanceof Object && 'query' in persistence.database
      ? persistence.database.query(sql) : Promise.reject(), { code: '42501' });
  }
  assert.equal((await request('/api/health/db', 'GET', undefined, false)).status, 200);
});
test('PG: financeiro integrado permanece protegido, sem fallback SQL Server', async () => {
  for (const path of ['/servicos/1/resumo-financeiro', '/dashboard/resumo', '/financeiro/servicos']) {
    assert.equal((await request('/api' + path, 'GET', undefined, false)).status, 401);
    const response = await request('/api' + path);
    assert.equal(response.status, path.includes('/servicos/1/') ? 404 : 200);
  }
});
test('PG: falha real de permissão vira 500 seguro e não revela SQL', async () => {
  await admin.query('REVOKE SELECT ON app.cliente FROM dc_api');
  try {
    const response = await request('/api/clientes');
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Erro interno da API.' } });
  } finally { await admin.query('GRANT SELECT ON app.cliente TO dc_api'); }
});
vehicleTests(() => {
  assert.ok(persistence.database instanceof PostgresDatabase);
  return { admin, repository: persistence.veiculos, database: persistence.database, request, url, cookie };
});

serviceTests(() => {
  assert.ok(persistence.database instanceof PostgresDatabase);
  return { admin, repository: persistence.servicos, database: persistence.database, request, url, cookie };
});

expenseTests(() => ({ admin, repository: persistence.despesas, request, url, cookie }));

test('PG: usuário inativo revoga sessão e nega login', async () => {
  await admin.query('UPDATE app.usuario SET ativo=false');
  try {
    assert.equal((await request('/api/auth/me')).status, 401);
    assert.equal((await login()).status, 401);
  } finally { await admin.query('UPDATE app.usuario SET ativo=true'); }
});
test('PG: CSRF preservado e logout encerra sessão', async () => {
  const response = await login();
  cookie = response.headers.get('set-cookie')!.split(';')[0];
  csrf = (await response.json()).csrfToken;
  assert.equal((await fetch(url + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } })).status, 403);
  assert.equal((await request('/api/auth/logout', 'POST')).status, 204);
  assert.equal((await request('/api/auth/me')).status, 401);
});
test('PG: pool encerrado mantém health 503 sem fallback e sem detalhes', async () => {
  await persistence.database.close();
  const response = await request('/api/health/db', 'GET', undefined, false);
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.error.code, 'DATABASE_UNAVAILABLE');
  assert.ok(!JSON.stringify(body).includes('dc_test'));
});
