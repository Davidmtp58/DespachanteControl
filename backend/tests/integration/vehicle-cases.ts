import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import type { VeiculoRepository } from '../../src/repositories/veiculo-repository.js';
import type { PostgresDatabase } from '../../src/database/postgres.js';

export function vehicleTests(context: () => {
  admin: Pool; repository: VeiculoRepository; database: PostgresDatabase;
  request: (path: string, method?: string, body?: unknown, authenticated?: boolean) => Promise<Response>;
  url: string; cookie: string;
}) {
  let owner: number, otherOwner: number, id: number;
  const base = { placa: 'TST1A23', tipo_veiculo: 'Automóvel', marca: 'Sintética', modelo: 'Teste', ano: 2020, renavam: '00000000001' };
  const body = () => ({ ...base, id_cliente_proprietario: owner });
  test('PG veículos: lista vazia, cadastro, detalhes, NFC antes dos limites e formato público', async () => {
    const { admin, request } = context();
    const owners = await admin.query(`INSERT INTO app.cliente(tipo_pessoa,nome_razao_social,cpf_cnpj,telefone)
      VALUES ('PF','Proprietário sintético','00000000001','000'),('PF','Outro sintético','00000000002','000') RETURNING id_cliente`);
    [owner, otherOwner] = owners.rows.map(row => row.id_cliente);
    assert.deepEqual(await (await request('/api/veiculos')).json(), []);
    const response = await request('/api/veiculos', 'POST', { ...body(), tipo_veiculo: base.tipo_veiculo.normalize('NFD'),
      marca: 'é'.repeat(50).normalize('NFD'), modelo: 'á'.repeat(80).normalize('NFD') });
    assert.equal(response.status, 201);
    const created = await response.json(); id = created.id_veiculo;
    assert.equal(response.headers.get('location'), `/api/veiculos/${id}`);
    assert.equal(created.marca, 'é'.repeat(50)); assert.equal(created.modelo, 'á'.repeat(80));
    assert.equal(created.tipo_veiculo, base.tipo_veiculo);
    assert.equal(created.renavam, '00000000001'); assert.equal(created.ano, 2020);
    assert.equal(created.id_cliente_proprietario, owner);
    assert.match(created.data_cadastro, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    assert.deepEqual(Object.keys(created).sort(), ['ano','data_cadastro','id_cliente_proprietario','id_veiculo','marca','modelo','placa','renavam','tipo_veiculo'].sort());
    assert.deepEqual(await (await request(`/api/veiculos/${id}`)).json(), created);
    assert.deepEqual(await (await request('/api/veiculos')).json(), [created]);
  });
  test('PG veículos: PUT próprio, troca de proprietário, ano nulo e parâmetros seguros', async () => {
    const { request } = context();
    const before = await (await request(`/api/veiculos/${id}`)).json();
    const { ano: _ano, ...withoutYear } = body();
    const response = await request(`/api/veiculos/${id}`, 'PUT', { ...withoutYear, id_cliente_proprietario: otherOwner, modelo: "Teste'); DROP TABLE app.veiculo;--" });
    assert.equal(response.status, 200);
    const updated = await response.json();
    assert.equal(updated.id_veiculo, id); assert.equal(updated.data_cadastro, before.data_cadastro);
    assert.equal(updated.ano, null); assert.equal(updated.id_cliente_proprietario, otherOwner);
    assert.equal(updated.modelo, "Teste'); DROP TABLE app.veiculo;--");
    assert.equal((await request(`/api/veiculos/${id}`, 'PUT', body())).status, 200);
    assert.equal((await request('/api/veiculos/999999')).status, 404);
    assert.equal((await request('/api/veiculos/999999', 'PUT', body())).status, 404);
    assert.equal((await request(`/api/veiculos/${id}`, 'DELETE')).status, 404);
    assert.equal((await request(`/api/veiculos/${id}`, 'PUT', { modelo: 'Parcial' })).status, 400);
  });
  test('PG veículos: placa, RENAVAM e ambos duplicados no POST/PUT, inclusive registros diferentes', async () => {
    const { request } = context();
    const second = await request('/api/veiculos', 'POST', { ...body(), placa: 'abc-1234', renavam: '00000000002' });
    assert.equal(second.status, 201);
    const row = await second.json(); assert.equal(row.placa, 'ABC1234');
    const cases = [
      [{ ...body(), placa: 'tst1a23', renavam: '00000000003' }, 'DUPLICATE_PLATE'],
      [{ ...body(), placa: 'ZZZ1A23' }, 'DUPLICATE_RENAVAM'],
      [body(), 'DUPLICATE_PLATE_AND_RENAVAM'],
      [{ ...body(), renavam: '00000000002' }, 'DUPLICATE_PLATE_AND_RENAVAM'],
    ] as const;
    for (const [input, code] of cases) {
      const response = await request('/api/veiculos', 'POST', input);
      assert.equal(response.status, 409); assert.equal((await response.json()).error.code, code);
    }
    for (const [input, code] of cases.slice(0, 3)) {
      const response = await request(`/api/veiculos/${row.id_veiculo}`, 'PUT', input);
      assert.equal(response.status, 409); assert.equal((await response.json()).error.code, code);
    }
    assert.equal((await (await request(`/api/veiculos/${row.id_veiculo}`)).json()).placa, 'ABC1234');
  });
  test('PG veículos: validações, proprietário ausente e FK real concorrente', async () => {
    const { request, repository, admin, database } = context();
    for (const patch of [{ placa: 'inválida' }, { renavam: '123' }, { marca: '' }, { modelo: '' },
      { tipo_veiculo: '' }, { marca: 'é'.repeat(51).normalize('NFD') }, { ano: 20 }, { id_cliente_proprietario: 0 }]) {
      assert.equal((await request('/api/veiculos', 'POST', { ...body(), ...patch })).status, 400);
    }
    const missing = { ...body(), id_cliente_proprietario: 999999, placa: 'FKT1A23', renavam: '00000000009' };
    assert.equal((await (await request('/api/veiculos', 'POST', missing)).json()).error.code, 'OWNER_NOT_FOUND');
    // Force the pre-check/writing race, but let the real FK reject the actual INSERT/UPDATE.
    const original = repository.ownerExists;
    repository.ownerExists = async () => true;
    try {
      for (const [path, method] of [['/api/veiculos', 'POST'], [`/api/veiculos/${id}`, 'PUT']]) {
        const response = await request(path, method, missing);
        assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'OWNER_NOT_FOUND');
      }
    } finally { repository.ownerExists = original; }
    await assert.rejects(admin.query('DELETE FROM app.cliente WHERE id_cliente=$1', [owner]), { code: '23503' });
    await assert.rejects(database.query('DELETE FROM app.veiculo WHERE false'), { code: '42501' });
    assert.equal((await (await request(`/api/veiculos/${id}`)).json()).id_cliente_proprietario, owner);
  });
  test('PG veículos: UNIQUE real arbitra POSTs concorrentes após pré-consultas sem conflito', async () => {
    const { request, repository } = context();
    for (const [index, expected] of ['DUPLICATE_PLATE', 'DUPLICATE_RENAVAM', 'DUPLICATE_PLATE_AND_RENAVAM'].entries()) {
      const original = repository.conflicts;
      let count = 0, release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const timeout = setTimeout(release, 5000);
      repository.conflicts = async (...args) => {
        const found = await original.apply(repository, args);
        if (++count <= 2) { if (count === 2) release(); await gate; }
        return found;
      };
      const first = { ...body(), placa: `RAC${index}A01`, renavam: `0000000010${index}` };
      const second = { ...first, ...(index === 0 ? { renavam: '00000000200' } : {}), ...(index === 1 ? { placa: 'RAC9A99' } : {}) };
      try {
        const responses = await Promise.all([request('/api/veiculos', 'POST', first), request('/api/veiculos', 'POST', second)]);
        assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
        assert.equal((await responses.find(r => r.status === 409)!.json()).error.code, expected);
        assert.ok(count >= 3, 'reconsulta após UNIQUE real');
      } finally { clearTimeout(timeout); release(); repository.conflicts = original; }
    }
  });
  test('PG veículos: autenticação, CSRF e permissão de leitura preservados', async () => {
    const { request, admin, url, cookie } = context();
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) assert.equal((await request('/api/veiculos', method, undefined, false)).status, 401);
    assert.equal((await fetch(url + '/api/veiculos', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body()) })).status, 403);
    await admin.query('REVOKE SELECT ON app.veiculo FROM dc_api');
    try {
      const response = await request('/api/veiculos'); assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Erro interno da API.' } });
    } finally { await admin.query('GRANT SELECT ON app.veiculo TO dc_api'); }
  });
}
