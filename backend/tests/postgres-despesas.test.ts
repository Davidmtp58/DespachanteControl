import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PostgresDespesaRepository } from '../src/repositories/postgres-despesas.js';
import { DespesaService } from '../src/services/despesa-service.js';
import type { DespesaRepository } from '../src/repositories/despesa-repository.js';
import { normalizeDespesa } from '../src/services/unicode.js';

const input = { id_servico: 1, descricao: 'Teste', valor: '10.02', data_despesa: '2024-02-29', observacoes: null };
test('PG despesas: parâmetros de escrita/exclusão, dinheiro string, DATE textual e filtro por serviço', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const repository = new PostgresDespesaRepository({ async query<T>(sql: string, values: unknown[] = []) {
    calls.push({ sql, values }); return [{ ...input, id_despesa: 1 }] as T[];
  } });
  await repository.list(); await repository.list(2); await repository.find(3); await repository.serviceExists(4);
  await repository.create(input); await repository.update(5, input); assert.equal(await repository.delete(6), true);
  assert.deepEqual(calls.map(call => call.values), [[], [2], [3], [4], [1,'Teste','10.02','2024-02-29',null], [1,'Teste','10.02','2024-02-29',null,5], [6]]);
  assert.match(calls[0].sql, /ORDER BY id_despesa/); assert.doesNotMatch(calls[0].sql, /WHERE/);
  assert.match(calls[1].sql, /WHERE id_servico=\$1/);
  assert.match(calls[4].sql, /valor::text/); assert.match(calls[4].sql, /to_char\(data_despesa,'YYYY-MM-DD'\)/);
  assert.match(calls[6].sql, /DELETE FROM app.despesa_servico WHERE id_despesa=\$1 RETURNING id_despesa/);
  const empty = new PostgresDespesaRepository({ async query() { return []; } });
  assert.equal(await empty.delete(99), false); assert.equal(await empty.update(99, input), undefined);
});
test('PG despesas: integridade/PK conhecidos mantêm contrato; erros desconhecidos propagam', async () => {
  for (const [error, expected] of [
    [{ code: '23503', constraint: 'fk_despesa_servico' }, { status: 400, code: 'INTEGRITY_ERROR' }],
    [{ code: '23514', constraint: 'ck_despesa_valor' }, { status: 400, code: 'INTEGRITY_ERROR' }],
    [{ code: '23502', table: 'despesa_servico' }, { status: 400, code: 'INTEGRITY_ERROR' }],
    [{ code: '23505', constraint: 'despesa_servico_pkey' }, { status: 409, code: 'DUPLICATE_EXPENSE' }],
    [{ code: '42501' }, { code: '42501' }],
    [{ code: '23503', constraint: 'other' }, { code: '23503', constraint: 'other' }],
  ] as const) {
    const repository: DespesaRepository = { async list() { return []; }, async find() { return { ...input, id_despesa: 1 }; },
      async serviceExists() { return true; }, async create() { throw error; }, async update() { throw error; }, async delete() { throw error; } };
    const service = new DespesaService(repository);
    await assert.rejects(service.create(input), expected); await assert.rejects(service.update('1', input), expected);
    await assert.rejects(service.delete('1'), expected);
  }
});
test('PG despesas: NFC antes dos limites, sem alterar SQL Server ou outros campos', async () => {
  const repository: DespesaRepository = { async list() { return []; }, async find() { return undefined; },
    async serviceExists() { return true; }, async create(data) { return { ...data, id_despesa: 1 }; }, async update() { return undefined; }, async delete() { return false; } };
  const data = { ...input, descricao: 'é'.repeat(150).normalize('NFD') };
  assert.equal((await new DespesaService(repository, normalizeDespesa).create(data)).descricao, 'é'.repeat(150));
  await assert.rejects(new DespesaService(repository).create(data), { status: 400 });
  const untouched = { valor: 'e\u0301', data_despesa: 'e\u0301', token: 'e\u0301' };
  assert.deepEqual(normalizeDespesa(untouched), untouched);
});
