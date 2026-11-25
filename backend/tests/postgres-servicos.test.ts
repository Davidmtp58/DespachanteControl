import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePostgresServico } from '../src/services/postgres-servico-validation.js';
import { validateServico } from '../src/services/servico-validation.js';
import { PostgresServicoRepository } from '../src/repositories/postgres-servicos.js';
import { ServicoService } from '../src/services/servico-service.js';
import type { ServicoRepository } from '../src/repositories/servico-repository.js';

const input = { id_cliente: 1, id_veiculo: 2, id_tipo_servico: 3, data_inicio: '2026-10-28T00:00:00.123456', status: 'EM_ANDAMENTO', valor_recebido: '150.01' };
test('PG serviços: limite temporal explícito preserva SQL Server e não arredonda entradas', () => {
  assert.equal(validatePostgresServico(input).data_inicio, input.data_inicio);
  assert.equal(validateServico(input).data_inicio, input.data_inicio + '0');
  for (const fraction of ['1234560', '1234567']) {
    const body = { ...input, data_inicio: '2026-10-28T00:00:00.' + fraction };
    assert.throws(() => validatePostgresServico(body), { status: 400, code: 'VALIDATION_ERROR' });
    assert.equal(validateServico(body).data_inicio, body.data_inicio);
  }
  assert.equal(validatePostgresServico({ ...input, data_inicio: '2026-10-28T00:00:00' }).data_inicio, '2026-10-28T00:00:00');
  assert.equal(validatePostgresServico({ ...input, observacoes: 'é'.repeat(500).normalize('NFD') }).observacoes, 'é'.repeat(500));
  assert.throws(() => validatePostgresServico({ ...input, status: 'ABERTO' }), { status: 400 });
});
test('PG serviços: SQL parametrizado, dinheiro string e timestamps originais no parser SQL', async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const repository = new PostgresServicoRepository({ async query<T>(sql: string, values: unknown[] = []) {
    calls.push({ sql, values }); return [{ id_servico: 1 }] as T[];
  } });
  const data = validatePostgresServico({ ...input, observacoes: "Texto'; DROP TABLE app.servico;--" });
  await repository.create(data); await repository.update(8, data);
  assert.equal(calls[0].values[3], input.data_inicio);
  assert.equal(calls[0].values[4], null);
  assert.equal(calls[0].values[6], '150.01');
  assert.deepEqual(calls[1].values, [...calls[0].values, 8]);
  assert.match(calls[0].sql, /app.parse_timestamp\(\$4::text\)/);
  assert.match(calls[0].sql, /valor_recebido::text/);
  assert.match(calls[0].sql, /data_cadastro AT TIME ZONE 'UTC'/);
  assert.ok(!calls[0].sql.includes(data.observacoes!));
  assert.equal(await repository.missingReference(data), undefined);
  assert.deepEqual(calls.slice(2).map(call => call.values), [[1], [2], [3]]);
  await repository.types(); assert.match(calls.at(-1)!.sql, /ORDER BY id_tipo_servico/);
  assert.doesNotMatch(calls.at(-1)!.sql, /WHERE/);
});
test('PG serviços: mapeia somente integridade conhecida e mantém erros desconhecidos internos', async () => {
  for (const [error, expected] of [
    [{ code: '23505', constraint: 'servico_pkey' }, { status: 409, code: 'DUPLICATE_SERVICE' }],
    [{ code: '23503', constraint: 'fk_servico_tipo' }, { status: 400, code: 'INTEGRITY_ERROR' }],
    [{ code: '23514', constraint: 'ck_servico_valor' }, { status: 400, code: 'INTEGRITY_ERROR' }],
    [{ code: '23502', table: 'servico' }, { status: 400, code: 'INTEGRITY_ERROR' }],
    [{ code: '22007' }, { status: 400, code: 'VALIDATION_ERROR' }],
    [{ code: '42501' }, { code: '42501' }],
    [{ code: '23503', constraint: 'other' }, { code: '23503', constraint: 'other' }],
  ] as const) {
    const repository: ServicoRepository = { async list() { return []; }, async types() { return []; },
      async find() { return { ...validatePostgresServico(input), id_servico: 1, data_cadastro: '2026-10-28T00:00:00' }; },
      async missingReference() { return undefined; }, async create() { throw error; }, async update() { throw error; } };
    const service = new ServicoService(repository, validatePostgresServico);
    await assert.rejects(service.create(input), expected);
    await assert.rejects(service.update('1', input), expected);
  }
});
