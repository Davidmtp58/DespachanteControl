import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { validateServico } from '../src/services/servico-validation.js';
import { money } from '../src/services/validation.js';
import { HttpError } from '../src/middleware/error-handler.js';
import type { ServicoRepository } from '../src/repositories/servico-repository.js';
import type { FinanceiroRepository } from '../src/repositories/financeiro-repository.js';
import { createTestApp, authenticatedFetch } from './auth-helper.js';

// Caracterização do contrato atual. Sem driver, .env, SQL ou rede externa.
const input = { id_cliente: 9, id_veiculo: 5, id_tipo_servico: 1,
  data_inicio: '2026-10-26T00:00:00.1234567', status: 'EM_ANDAMENTO', valor_recebido: '350.50' };
const validationError = (error: unknown) => error instanceof HttpError && error.status === 400 && error.code === 'VALIDATION_ERROR';

test('contrato: sétima casa de timestamp permanece significativa', () => {
  assert.equal(validateServico(input).data_inicio, input.data_inicio);
  assert.throws(() => validateServico({ ...input, status: 'CONCLUIDO',
    data_conclusao: '2026-10-26T00:00:00.1234566' }), validationError);
  assert.equal(validateServico({ ...input, status: 'CONCLUIDO',
    data_conclusao: input.data_inicio }).data_conclusao, input.data_inicio);
});

test('contrato: timestamp sem fuso normaliza fração, mas não aceita data isolada ou timezone', () => {
  assert.equal(validateServico({ ...input, data_inicio: '2026-10-26T00:00:00' }).data_inicio,
    '2026-10-26T00:00:00.0000000');
  for (const data_inicio of ['2026-10-26', '2026-10-26T00:00:00Z', '2026-10-26T00:00:00-03:00',
    '2026-10-26T00:00:00.12345678', '2026-02-30T00:00:00']) {
    assert.throws(() => validateServico({ ...input, data_inicio }), validationError);
  }
});

test('contrato: moeda aceita número/string decimal e normaliza sem cálculo float', () => {
  for (const [value, expected] of [[0, '0.00'], [350.5, '350.50'], ['350.50', '350.50'],
    ['99999999.99', '99999999.99']] as const) assert.equal(money(value, 'valor'), expected);
  for (const value of ['350,50', '-0.01', '1.001', '100000000', 'NaN', '1e2']) {
    assert.throws(() => money(value, 'valor'), validationError);
  }
  assert.throws(() => money('0.00', 'valor', true), validationError);
});

test('contrato: conclusão obrigatória e PUT não é atualização parcial', () => {
  assert.throws(() => validateServico({ ...input, status: 'CONCLUIDO' }), validationError);
  assert.throws(() => validateServico({ status: 'CANCELADO' }), validationError);
  for (const status of ['EM_ANDAMENTO', 'CANCELADO']) {
    assert.equal(validateServico({ ...input, status }).data_conclusao, null);
  }
});

test('contrato HTTP: arrays, objeto, Location, erro e dinheiro exato com repositórios simulados', async () => {
  const row = { ...validateServico(input), id_servico: 41, data_cadastro: '2026-10-26T12:00:00.1234567' };
  const repository: ServicoRepository = {
    async list() { return [row]; }, async find(id) { return id === 41 ? row : undefined; },
    async types() { return [{ id_tipo_servico: 1, nome: 'Teste', descricao: null, ativo: false }]; },
    async missingReference() { return undefined; },
    async create(data) { return { ...row, ...data }; }, async update(_id, data) { return { ...row, ...data }; },
  };
  const dashboard = { receita_total: '9007199254740993.01', custos_totais: '10.02',
    resultado_liquido: '9007199254740982.99', quantidade_servicos: 1, servicos_em_andamento: 1 };
  const financeiro: FinanceiroRepository = { async dashboard() { return dashboard; },
    async list() { return []; }, async find() { return undefined; } };
  const server = createTestApp(async () => {}, undefined, undefined, repository, undefined, financeiro)
    .listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  try {
    assert.equal((await globalThis.fetch(`${url}/servicos`)).status, 401);
    assert.deepEqual(await (await authenticatedFetch(`${url}/servicos`)).json(), [row]);
    assert.deepEqual(await (await authenticatedFetch(`${url}/servicos/41`)).json(), row);
    for (const method of ['POST', 'PUT']) {
      const response = await authenticatedFetch(`${url}/servicos${method === 'PUT' ? '/41' : ''}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
      });
      assert.equal(response.status, method === 'POST' ? 201 : 200);
      if (method === 'POST') assert.equal(response.headers.get('location'), '/api/servicos/41');
      assert.deepEqual(await response.json(), row);
    }
    const missing = await authenticatedFetch(`${url}/servicos/42`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: { code: 'SERVICE_NOT_FOUND', message: 'Serviço não encontrado.' } });
    assert.deepEqual(await (await authenticatedFetch(`${url}/dashboard/resumo`)).json(), dashboard);
    assert.deepEqual(await (await authenticatedFetch(`${url}/financeiro/servicos`)).json(), []);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
