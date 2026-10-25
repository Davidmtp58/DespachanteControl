import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createTestApp as createApp, authenticatedFetch as fetch } from './auth-helper.js';
import { SqlClienteRepository } from '../src/repositories/cliente-repository.js';
import type { QueryExecutor, SqlParameter } from '../src/database/connection.js';
import { validateCliente } from '../src/services/cliente-validation.js';
import { readServerConfig } from '../src/config/env.js';

const input = { tipo_pessoa: 'PF', nome_razao_social: 'Cliente Teste', cpf_cnpj: '529.982.247-25', telefone: '(85) 99999-0000' };
const row = { ...input, cpf_cnpj: '52998224725', id_cliente: 7, email: null, data_nascimento: null, data_cadastro: '2026-01-01T00:00:00.000Z' };
type Call = { statement: string; parameters: SqlParameter[] };

async function api(handler: (call: Call) => unknown[], run: (url: string, calls: Call[]) => Promise<void>) {
  const calls: Call[] = [];
  const executor: QueryExecutor = {
    async query<T>(statement: string, parameters: SqlParameter[] = []) {
      const call = { statement, parameters };
      calls.push(call);
      return handler(call) as T[];
    },
  };
  const server = createApp(async () => {}, new SqlClienteRepository(executor)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/clientes`, calls); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('clientes: listagem, detalhe e lista vazia usam SELECT no banco simulado', async () => {
  await api(() => [row], async (url, calls) => {
    const list = await fetch(url);
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), [row]);
    assert.match(calls[0].statement, /FROM dbo.Cliente ORDER BY id_cliente/);
    const detail = await fetch(`${url}/7`);
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), row);
    assert.match(calls[1].statement, /WHERE id_cliente = @id/);
    assert.equal(calls[1].parameters[0].value, 7);
  });
  await api(() => [], async url => { assert.deepEqual(await (await fetch(url)).json(), []); });
});

test('clientes: POST retorna 201 e Location; valores são parametrizados e normalizados', async () => {
  const name = "Teste'; DROP TABLE dbo.Cliente; --";
  await api(() => [{ ...row, nome_razao_social: name }], async (url, calls) => {
    const response = await fetch(url, json('POST', { ...input, nome_razao_social: name, data_nascimento: '2000-02-29' }));
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('location'), '/api/clientes/7');
    assert.equal((await response.json()).id_cliente, 7);
    const { statement, parameters } = calls[0];
    assert.match(statement, /INSERT INTO dbo.Cliente/);
    assert.match(statement, /OUTPUT INSERTED.id_cliente/);
    assert.ok(!statement.includes(name));
    assert.equal(parameters.find(p => p.name === 'nome')?.value, name);
    assert.equal(parameters.find(p => p.name === 'documento')?.value, '52998224725');
    assert.equal(parameters.find(p => p.name === 'email')?.value, null);
    assert.equal((parameters.find(p => p.name === 'nascimento')?.value as Date).toISOString(), '2000-02-29T00:00:00.000Z');
    assert.equal(parameters.length, 6);
  });
});

test('clientes: PUT substitui campos editáveis e preserva campos gerados no banco', async () => {
  await api(() => [row], async (url, calls) => {
    const response = await fetch(`${url}/7`, json('PUT', input));
    assert.equal(response.status, 200);
    const { statement, parameters } = calls[0];
    assert.match(statement, /UPDATE dbo.Cliente SET/);
    assert.match(statement, /WHERE id_cliente = @id/);
    assert.doesNotMatch(statement, /data_cadastro\s*=|id_cliente\s*=(?! @id)/);
    assert.equal(parameters.find(p => p.name === 'id')?.value, 7);
    assert.equal(parameters.find(p => p.name === 'nascimento')?.value, null);
  });
});

test('clientes: registro ausente retorna 404 em GET e PUT; DELETE não existe', async () => {
  await api(() => [], async (url, calls) => {
    assert.equal((await fetch(`${url}/7`)).status, 404);
    assert.equal((await fetch(`${url}/7`, json('PUT', input))).status, 404);
    assert.equal((await fetch(`${url}/7`, { method: 'DELETE' })).status, 404);
    assert.equal(calls.length, 2);
  });
});

test('clientes: IDs inválidos e tentativas de SQL injection no ID não consultam banco', async () => {
  await api(() => { throw new Error('Não deveria consultar'); }, async (url, calls) => {
    for (const id of ['0', '-1', '1.5', '2147483648', '1 OR 1=1', 'abc']) {
      assert.equal((await fetch(`${url}/${encodeURIComponent(id)}`)).status, 400);
      assert.equal((await fetch(`${url}/${encodeURIComponent(id)}`, json('PUT', input))).status, 400);
    }
    assert.equal(calls.length, 0);
  });
});

test('clientes: campos inválidos, extras, obrigatórios e JSON malformado retornam 400', async () => {
  await api(() => [], async (url, calls) => {
    const invalid = [null, [], {}, { ...input, tipo_pessoa: 'XX' }, { ...input, nome_razao_social: ' ' },
      { ...input, nome_razao_social: 'x'.repeat(151) }, { ...input, telefone: '' }, { ...input, telefone: '1'.repeat(21) },
      { ...input, cpf_cnpj: '52998224724' }, { ...input, cpf_cnpj: 52998224725 }, { ...input, cpf_cnpj: '11111111111' },
      { ...input, email: 'invalido' }, { ...input, email: 'a'.repeat(151) }, { ...input, data_nascimento: '2025-02-29' },
      { ...input, data_nascimento: '2024-13-01' }, { ...input, data_nascimento: '0000-01-01' },
      { ...input, id_cliente: 9 }, { ...input, data_cadastro: '2026-01-01' }];
    for (const body of invalid) {
      assert.equal((await fetch(url, json('POST', body))).status, 400, JSON.stringify(body));
    }
    const malformed = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{senha_secreta' });
    assert.equal(malformed.status, 400);
    assert.ok(!(await malformed.text()).includes('senha_secreta'));
    assert.equal((await fetch(url, json('POST', { ...input, nome_razao_social: 'a'.repeat(17000) }))).status, 400);
    assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify(input) })).status, 400);
    assert.equal(calls.length, 0);
  });
});

test('clientes: UNIQUE 2601/2627 gera 409 no POST e PUT sem expor erro SQL', async () => {
  for (const number of [2601, 2627]) {
    await api(() => { throw { number, message: 'segredo SQL host password' }; }, async url => {
      for (const [path, method] of [[url, 'POST'], [`${url}/7`, 'PUT']]) {
        const response = await fetch(path, json(method, input));
        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), { error: { code: 'DUPLICATE_DOCUMENT', message: 'CPF/CNPJ já cadastrado.' } });
      }
    });
  }
});

test('clientes: erro inesperado no banco retorna 500 genérico em todas as operações', async () => {
  await api(() => { throw new Error('password=segredo; SELECT interno'); }, async url => {
    for (const [path, options] of [[url, undefined], [`${url}/7`, undefined], [url, json('POST', input)], [`${url}/7`, json('PUT', input)]] as const) {
      const response = await fetch(path, options);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Erro interno da API.' } });
    }
  });
});

test('documentos: valida CPF, CNPJ numérico e alfanumérico, com e sem máscara', () => {
  for (const cpf_cnpj of ['11.222.333/0001-81', '11222333000181', '12.ABC.345/01DE-35', '12abc34501de35']) {
    const result = validateCliente({ ...input, tipo_pessoa: 'PJ', cpf_cnpj });
    assert.equal(result.cpf_cnpj.length, 14);
    assert.match(result.cpf_cnpj, /^[A-Z0-9]{12}\d{2}$/);
  }
  for (const cpf_cnpj of ['11222333000182', '12ABC34501DE36', '00000000000000', '52998224725', '11-222333000181']) {
    assert.throws(() => validateCliente({ ...input, tipo_pessoa: 'PJ', cpf_cnpj }));
  }
  assert.throws(() => validateCliente({ ...input, cpf_cnpj: '11222333000181' }));
});

test('servidor: permite somente loopback, inclusive com configuração explícita', () => {
  for (const HOST of ['127.0.0.1', '::1', 'localhost']) assert.equal(readServerConfig({ HOST }).host, HOST);
  for (const HOST of ['0.0.0.0', '::', '192.168.1.2', 'example.com']) assert.throws(() => readServerConfig({ HOST }), /loopback/);
});
