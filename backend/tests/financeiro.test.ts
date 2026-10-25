import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import sql from 'mssql';
import { createTestApp as createApp, authenticatedFetch as fetch } from './auth-helper.js';
import type { QueryExecutor, SqlParameter } from '../src/database/connection.js';
import { SqlFinanceiroRepository } from '../src/repositories/financeiro-repository.js';
import { SqlServicoRepository } from '../src/repositories/servico-repository.js';

const summary = { receita_total: '150.00', custos_totais: '200.00', resultado_liquido: '-50.00', quantidade_servicos: 2, servicos_em_andamento: 1 };
const service = { id_servico: 4, cliente: 'Teste', placa: 'ABC1234', tipo_servico: 'Transferência', status: 'CANCELADO', valor_recebido: '150.00', custo_total: '0.00', resultado_liquido: '150.00' };
const item = { ...service, data_inicio: '2026-01-01T10:00:00', data_conclusao: null };
type Call = { statement: string; parameters: SqlParameter[] };
async function api(handler: (call: Call) => unknown[], run: (url: string, calls: Call[]) => Promise<void>) {
  const calls: Call[] = [];
  const db: QueryExecutor = { async query<T>(statement: string, parameters: SqlParameter[] = []) {
    const call = { statement, parameters }; calls.push(call); return handler(call) as T[];
  } };
  const server = createApp(async () => {}, undefined, undefined, new SqlServicoRepository(db), undefined, new SqlFinanceiroRepository(db)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`, calls); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('financeiro: dashboard retorna exatamente os agregados SQL, inclusive resultado negativo', async () => {
  await api(() => [summary], async (url, calls) => {
    const response = await fetch(`${url}/dashboard/resumo`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), summary);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(calls[0].statement, /FROM dbo.vw_DashboardResumo/);
    assert.doesNotMatch(calls[0].statement, /SUM\(|WHERE|FROM dbo.Servico/i);
  });
});

test('financeiro: dashboard vazio de dados mantém zeros fornecidos pela view', async () => {
  const empty = { receita_total: '0.00', custos_totais: '0.00', resultado_liquido: '0.00', quantidade_servicos: 0, servicos_em_andamento: 0 };
  await api(() => [empty], async url => {
    const response = await fetch(`${url}/dashboard/resumo`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), empty);
  });
});

test('financeiro: lista preserva cancelados, custo zero e valores grandes sem coerção numérica', async () => {
  const rows = [item, { ...item, id_servico: 5, custo_total: '9007199254740993.01', resultado_liquido: '-9007199254740843.01' }];
  await api(() => rows, async (url, calls) => {
    const response = await fetch(`${url}/financeiro/servicos`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), rows);
    assert.match(calls[0].statement, /FROM dbo.vw_ResumoFinanceiroServico ORDER BY id_servico/);
    assert.match(calls[0].statement, /varchar\(41\)/);
    assert.doesNotMatch(calls[0].statement, /SUM\(|WHERE/i);
  });
  await api(() => [], async url => { assert.deepEqual(await (await fetch(`${url}/financeiro/servicos`)).json(), []); });
});

test('financeiro: resumo executa procedure com parâmetro Int e mantém serviço sem despesas', async () => {
  await api(() => [service], async (url, calls) => {
    const response = await fetch(`${url}/servicos/4/resumo-financeiro`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), service);
    assert.match(calls[0].statement, /EXEC dbo.sp_ResumoFinanceiroServico @id_servico = @id/);
    assert.deepEqual(calls[0].parameters, [{ name: 'id', type: sql.Int(), value: 4 }]);
    assert.match(calls[0].statement, /INSERT INTO @resumo/);
    assert.doesNotMatch(calls[0].statement, /SUM\(|INSERT INTO dbo\.|UPDATE |DELETE |CREATE |ALTER /i);
  });
});

test('financeiro: procedure sem linhas retorna 404 e IDs inválidos não chegam ao SQL', async () => {
  await api(() => [], async (url, calls) => {
    assert.equal((await fetch(`${url}/servicos/4/resumo-financeiro`)).status, 404);
    const before = calls.length;
    for (const id of ['0', '-1', '1.5', '2147483648', '1 OR 1=1', 'abc']) {
      assert.equal((await fetch(`${url}/servicos/${encodeURIComponent(id)}/resumo-financeiro`)).status, 400);
    }
    assert.equal(calls.length, before);
  });
});

test('financeiro: falha do banco retorna 500 sem credenciais ou SQL', async () => {
  await api(() => { throw new Error('password=segredo SELECT interno'); }, async url => {
    for (const path of ['/dashboard/resumo', '/financeiro/servicos', '/servicos/4/resumo-financeiro']) {
      const response = await fetch(url + path);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Erro interno da API.' } });
    }
  });
  await api(() => [], async url => { assert.equal((await fetch(`${url}/dashboard/resumo`)).status, 500); });
});

test('financeiro: rotas não oferecem operações de escrita', async () => {
  await api(() => [], async (url, calls) => {
    for (const path of ['/dashboard/resumo', '/financeiro/servicos', '/servicos/4/resumo-financeiro']) {
      for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await fetch(url + path, { method })).status, 404);
    }
    assert.equal(calls.length, 0);
  });
});
