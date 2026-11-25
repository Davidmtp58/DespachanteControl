import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PostgresVeiculoRepository } from '../src/repositories/postgres-veiculos.js';
import { VeiculoService } from '../src/services/veiculo-service.js';
import type { VeiculoRepository } from '../src/repositories/veiculo-repository.js';
import { normalizeVeiculo } from '../src/services/unicode.js';

const input = { id_cliente_proprietario: 1, placa: 'ABC1D23', renavam: '00000000001', tipo_veiculo: 'Automóvel', marca: 'Teste', modelo: 'Teste', ano: 2020 };
const vehicle = { ...input, id_veiculo: 1, data_cadastro: new Date() };
test('PG veículos: parâmetros, projeção, igualdade dos índices e exclusão do próprio ID', async () => {
  const calls: Array<{ statement: string; values: unknown[] }> = [];
  const repository = new PostgresVeiculoRepository({ async query<T>(statement: string, values: unknown[] = []) {
    calls.push({ statement, values }); return [vehicle] as T[];
  } });
  await repository.list(); await repository.find(7); await repository.ownerExists(8);
  await repository.conflicts(input); await repository.conflicts(input, 9);
  await repository.create(input); await repository.update(9, input);
  assert.deepEqual(calls[1].values, [7]); assert.deepEqual(calls[2].values, [8]);
  assert.deepEqual(calls[3].values, [input.placa, input.renavam, null]);
  assert.deepEqual(calls[4].values, [input.placa, input.renavam, 9]);
  assert.match(calls[4].statement, /id_veiculo<>\$3/);
  assert.match(calls[4].statement, /app.text_key\(placa\) COLLATE app.ci_as/);
  assert.deepEqual(calls[5].values, [1, input.placa, input.tipo_veiculo, input.marca, input.modelo, 2020, input.renavam]);
  assert.deepEqual(calls[6].values, [...calls[5].values, 9]);
  for (const call of calls) assert.ok(!call.statement.includes(input.placa));
});
test('PG veículos: UNIQUE concorrente mantém fallback seguro se reconsulta falhar ou conflito desaparecer', async () => {
  for (const constraint of ['uq_veiculo_placa', 'uq_veiculo_renavam']) for (const fails of [true, false]) {
    let lookups = 0;
    const repository: VeiculoRepository = {
      async list() { return []; }, async find() { return vehicle; }, async ownerExists() { return true; },
      async conflicts() { if (++lookups > 1 && fails) throw new Error('private'); return { placa: false, renavam: false }; },
      async create() { throw { code: '23505', constraint, detail: 'private' }; },
      async update() { throw { code: '23505', constraint, detail: 'private' }; },
    };
    const service = new VeiculoService(repository);
    for (const operation of [() => service.create(input), () => service.update('1', input)]) {
      lookups = 0;
      await assert.rejects(operation(), { status: 409, code: 'DUPLICATE_VEHICLE' });
    }
  }
});
test('PG veículos: constraints desconhecidas e permissão não são falsos conflitos', async () => {
  for (const error of [{ code: '23505', constraint: 'other' }, { code: '23503', constraint: 'other' }, { code: '42501' }]) {
    const repository: VeiculoRepository = {
      async list() { return []; }, async find() { return vehicle; }, async ownerExists() { return true; },
      async conflicts() { return { placa: false, renavam: false }; },
      async create() { throw error; }, async update() { throw error; },
    };
    await assert.rejects(new VeiculoService(repository).create(input), error);
  }
});
test('PG veículos: NFC somente na allowlist e limites após normalização', async () => {
  const data = { ...input, marca: 'é'.repeat(50).normalize('NFD'), modelo: 'á'.repeat(80).normalize('NFD') };
  const repository: VeiculoRepository = {
    async list() { return []; }, async find() { return vehicle; }, async ownerExists() { return true; },
    async conflicts() { return { placa: false, renavam: false }; },
    async create(input) { return { ...vehicle, ...input }; }, async update(_id, input) { return { ...vehicle, ...input }; },
  };
  const result = await new VeiculoService(repository, normalizeVeiculo).create(data);
  assert.equal(result.marca, 'é'.repeat(50)); assert.equal(result.modelo, 'á'.repeat(80));
  await assert.rejects(new VeiculoService(repository).create(data), { status: 400 }); // SQL Server unchanged.
  const secret = 'e\u0301';
  assert.deepEqual(normalizeVeiculo({ senha: secret, token: secret, data_cadastro: secret }), { senha: secret, token: secret, data_cadastro: secret });
});
