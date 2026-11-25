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
import { PostgresFinanceiroRepository } from '../../src/repositories/postgres-financeiro.js';
import { testConfig } from '../auth-helper.js';
import { financialEmpty, financialExpected, financialRows, financialScenarios, financialSummary } from '../financial-fixtures.js';

let cluster: Awaited<ReturnType<typeof startCluster>>;
let admin: Pool, persistence: ReturnType<typeof createPersistence>, server: Server;
let url: string, cookie: string, csrf: string, clientId: number, vehicleId: number, typeId: number;
const expenses: number[] = [];
const password = randomBytes(24).toString('hex');
async function request(path: string, method = 'GET', body?: unknown, authenticated = true) {
  return fetch(url + '/api' + path, { method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'DespachanteControl',
    ...(authenticated ? { Cookie: cookie, 'X-CSRF-Token': csrf } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
before(async () => {
  cluster = await startCluster();
  console.log('Financeiro PostgreSQL descartável:', await cluster.sql('SHOW server_version;'));
  await cluster.sql(await readFile(new URL('../../../database/postgresql/bootstrap.sql', import.meta.url), 'utf8'));
  await migrate(cluster.sql);
  const connection = cluster.connection(); admin = new Pool(connection);
  const apiPassword = randomBytes(32).toString('hex');
  await admin.query(`CREATE ROLE dc_finance_test LOGIN PASSWORD '${apiPassword}'; GRANT dc_api TO dc_finance_test`);
  await admin.query('INSERT INTO app.usuario(nome,email,senha_hash) VALUES ($1,$2,$3)', ['Teste', 'financeiro@example.test', await bcrypt.hash(password, 4)]);
  persistence = createPersistence({ DB_PROVIDER: 'postgres', APP_MODE: 'local', PG_HOST: connection.host, PG_PORT: String(connection.port),
    PG_DATABASE: connection.database, PG_USER: 'dc_finance_test', PG_PASSWORD: apiPassword, PG_SSL_MODE: 'disable' });
  server = createApp(() => persistence.database.check(), persistence.clientes, persistence.veiculos, persistence.servicos, persistence.despesas, persistence.financeiro,
    { config: testConfig(), usuarios: persistence.usuarios }, undefined, persistence.provider).listen(0, '127.0.0.1');
  await once(server, 'listening'); url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const response = await request('/auth/login', 'POST', { email: 'financeiro@example.test', senha: password }, false);
  assert.equal(response.status, 200); cookie = response.headers.get('set-cookie')!.split(';')[0]; csrf = (await response.json()).csrfToken;
});
after(async () => {
  try {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (persistence) await persistence.database.close(); if (admin) await admin.end();
  } finally { if (cluster) await cluster.stop(); }
});
const serviceInput = (index: number) => ({ id_cliente: clientId, id_veiculo: vehicleId, id_tipo_servico: typeId,
  status: financialScenarios[index].status, valor_recebido: financialScenarios[index].amount,
  data_inicio: financialRows[index].data_inicio, data_conclusao: financialRows[index].data_conclusao });
const expenseInput = (service: number, amount: string) => ({ id_servico: service, descricao: 'Despesa sintética', valor: amount, data_despesa: '2024-02-29' });
async function summary(expected: typeof financialExpected) {
  const response = await request('/dashboard/resumo'); assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.deepEqual(await response.json(), expected);
}
test('PG financeiro: banco vazio tem zeros exatos, array vazio e função inexistente 404', async () => {
  await summary(financialEmpty);
  assert.deepEqual(await (await request('/financeiro/servicos')).json(), []);
  const response = await request('/servicos/99999/resumo-financeiro'); assert.equal(response.status, 404);
  assert.equal((await response.json()).error.code, 'SERVICE_NOT_FOUND');
});
test('PG financeiro: cenários compartilhados, cancelados, concluídos, zero e múltiplas despesas via HTTP', async () => {
  clientId = (await admin.query(`INSERT INTO app.cliente(tipo_pessoa,nome_razao_social,cpf_cnpj,telefone) VALUES ('PF','Solicitante sintético','00000000501','000') RETURNING id_cliente`)).rows[0].id_cliente;
  vehicleId = (await admin.query(`INSERT INTO app.veiculo(id_cliente_proprietario,placa,tipo_veiculo,marca,modelo,renavam) VALUES ($1,'FIN1A23','Teste','Teste','Teste','00000000501') RETURNING id_veiculo`, [clientId])).rows[0].id_veiculo;
  typeId = (await admin.query(`INSERT INTO app.tipo_servico(nome) VALUES ('Tipo sintético') RETURNING id_tipo_servico`)).rows[0].id_tipo_servico;
  for (const [index, scenario] of financialScenarios.entries()) {
    const response = await request('/servicos', 'POST', serviceInput(index)); assert.equal(response.status, 201);
    const id = (await response.json()).id_servico; assert.equal(id, index + 1);
    for (const amount of scenario.expenses) {
      const expense = await request('/despesas', 'POST', expenseInput(id, amount)); assert.equal(expense.status, 201);
      expenses.push((await expense.json()).id_despesa);
    }
  }
  await summary(financialExpected);
  const list = await request('/financeiro/servicos'); assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), financialRows);
  for (const row of financialRows) {
    const response = await request(`/servicos/${row.id_servico}/resumo-financeiro`); assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), financialSummary(row));
  }
});
test('PG financeiro: Views/função reais, tipos contadores, datas imunes ao fuso e grants mínimos', async () => {
  const raw = (await admin.query('SELECT * FROM app.vw_dashboard_resumo')).rows[0];
  assert.deepEqual(raw, { ...financialExpected, quantidade_servicos: '4', servicos_em_andamento: '2' });
  for (const row of financialRows) {
    const direct = (await admin.query('SELECT * FROM app.resumo_financeiro_servico($1)', [row.id_servico])).rows[0];
    assert.deepEqual(direct, financialSummary(row));
  }
  const client = await admin.connect();
  try {
    await client.query('BEGIN'); await client.query("SET LOCAL TIME ZONE 'Pacific/Auckland'");
    const repository = new PostgresFinanceiroRepository({ async query<T>(sql: string, values?: unknown[]) { return (await client.query(sql, values)).rows as T[]; } });
    assert.deepEqual(await repository.list(), financialRows);
  } finally { await client.query('ROLLBACK'); client.release(); }
  const permission = await admin.query(`SELECT has_function_privilege('dc_finance_test','app.resumo_financeiro_servico(integer)','EXECUTE') AS execute,
    has_table_privilege('dc_finance_test','app.vw_dashboard_resumo','SELECT') AS read,
    has_schema_privilege('dc_finance_test','app','CREATE') AS ddl`);
  assert.deepEqual(permission.rows[0], { execute: true, read: true, ddl: false });
});
test('PG financeiro: editar/excluir/cadastrar despesas e alterar serviço atualiza indicadores', async () => {
  assert.equal((await request(`/despesas/${expenses[0]}`, 'PUT', expenseInput(1, '20.03'))).status, 200);
  await summary({ ...financialExpected, custos_totais: '23.09', resultado_liquido: '146.94' });
  assert.equal((await request(`/despesas/${expenses[1]}`, 'DELETE')).status, 204);
  await summary({ ...financialExpected, custos_totais: '23.06', resultado_liquido: '146.97' });
  assert.equal((await request('/servicos/3', 'PUT', { ...serviceInput(2), status: 'EM_ANDAMENTO', valor_recebido: '30.03' })).status, 200);
  await summary({ ...financialExpected, receita_total: '180.04', custos_totais: '23.06', resultado_liquido: '156.98', servicos_em_andamento: 3 });
  assert.equal((await request('/despesas', 'POST', expenseInput(4, '0.02'))).status, 201);
  await summary({ ...financialExpected, receita_total: '180.04', custos_totais: '23.08', resultado_liquido: '156.96', servicos_em_andamento: 3 });
  const row = await (await request('/servicos/4/resumo-financeiro')).json();
  assert.equal(row.custo_total, '0.02'); assert.equal(row.resultado_liquido, '-0.02');
});
test('PG financeiro: máximo DECIMAL de cada registro e soma além de numeric(10,2) sem overflow ou float', async () => {
  const response = await request('/servicos', 'POST', { ...serviceInput(2), valor_recebido: '99999999.99' }); assert.equal(response.status, 201);
  const id = (await response.json()).id_servico;
  for (let i = 0; i < 2; i++) assert.equal((await request('/despesas', 'POST', expenseInput(id, '99999999.99'))).status, 201);
  const row = await (await request(`/servicos/${id}/resumo-financeiro`)).json();
  assert.equal(row.valor_recebido, '99999999.99'); assert.equal(row.custo_total, '199999999.98'); assert.equal(row.resultado_liquido, '-99999999.99');
  await summary({ receita_total: '100000180.03', custos_totais: '200000023.06', resultado_liquido: '-99999843.03', quantidade_servicos: 5, servicos_em_andamento: 3 });
});
test('PG financeiro: autenticação, CSRF, IDs inválidos e ausência de rotas de escrita', async () => {
  for (const path of ['/dashboard/resumo', '/financeiro/servicos', '/servicos/1/resumo-financeiro']) {
    assert.equal((await request(path, 'GET', undefined, false)).status, 401);
    assert.equal((await fetch(url + '/api' + path, { method: 'POST', headers: { Cookie: cookie } })).status, 403);
    for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await request(path, method)).status, 404);
  }
  for (const id of ['0', '-1', '2147483648', '1 OR 1=1']) assert.equal((await request(`/servicos/${encodeURIComponent(id)}/resumo-financeiro`)).status, 400);
});
test('PG financeiro: falta de permissão nas Views/função resulta em 500 seguro', async () => {
  for (const [object, privilege, path] of [
    ['TABLE app.vw_dashboard_resumo', 'SELECT', '/dashboard/resumo'],
    ['TABLE app.vw_resumo_financeiro_servico', 'SELECT', '/financeiro/servicos'],
    ['FUNCTION app.resumo_financeiro_servico(integer)', 'EXECUTE', '/servicos/1/resumo-financeiro'],
  ]) {
    await admin.query(`REVOKE ${privilege} ON ${object} FROM dc_api`);
    try {
      const response = await request(path); assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Erro interno da API.' } });
    } finally { await admin.query(`GRANT ${privilege} ON ${object} TO dc_api`); }
  }
});
