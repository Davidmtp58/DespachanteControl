import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tiposVeiculo, validateVeiculo, type Veiculo } from '../src/services/veiculo-validation.js';
import { VeiculoService } from '../src/services/veiculo-service.js';
import type { VeiculoRepository } from '../src/repositories/veiculo-repository.js';

const input = { id_cliente_proprietario: 1, placa: 'HML1A01', renavam: '90000000001',
  tipo_veiculo: 'Automóvel', marca: 'TESTE', modelo: 'TESTE', ano: 2020 };

test('vehicle types accept all nine standardized values and reject arbitrary values', () => {
  assert.equal(tiposVeiculo.length, 9);
  for (const tipo of tiposVeiculo) assert.equal(validateVeiculo({ ...input, tipo_veiculo: tipo }).tipo_veiculo, tipo);
  for (const tipo of ['', ' ', 'Carro', 'automóvel', 'AVIAO', null, 3]) {
    assert.throws(() => validateVeiculo({ ...input, tipo_veiculo: tipo }), { status: 400, code: 'VALIDATION_ERROR' });
  }
});

test('legacy type is readable and only allowed unchanged on its own vehicle; can migrate explicitly', async () => {
  let writes = 0;
  let current: Veiculo = { ...input, tipo_veiculo: 'Utilitário antigo', id_veiculo: 7, data_cadastro: new Date(0) };
  const repository: VeiculoRepository = {
    async list() { return [current]; }, async find(id) { return id === 7 ? current : undefined; },
    async ownerExists() { return true; }, async conflicts() { return { placa: false, renavam: false }; },
    async create(data) { writes++; return { ...current, ...data }; },
    async update(_id, data) { writes++; current = { ...current, ...data }; return current; },
  };
  const service = new VeiculoService(repository);
  assert.equal((await service.find('7')).tipo_veiculo, 'Utilitário antigo');
  assert.equal((await service.list())[0].tipo_veiculo, 'Utilitário antigo');
  await assert.rejects(service.create({ ...input, tipo_veiculo: 'Utilitário antigo' }), { status: 400 });
  await assert.rejects(service.update('7', { ...input, tipo_veiculo: 'Outra categoria' }), { status: 400 });
  assert.equal(writes, 0);
  await service.update('7', { ...input, tipo_veiculo: 'Utilitário antigo', ano: 2021 });
  assert.equal(current.tipo_veiculo, 'Utilitário antigo');
  await service.update('7', { ...input, tipo_veiculo: 'Outros' });
  await assert.rejects(service.update('7', { ...input, tipo_veiculo: 'Utilitário antigo' }), { status: 400 });
  assert.equal(writes, 2);
  await assert.rejects(service.update('999', input), { status: 404 });
});
