import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import type { ServicoRepository } from '../../src/repositories/servico-repository.js';
import { PostgresServicoRepository } from '../../src/repositories/postgres-servicos.js';
import type { PostgresDatabase } from '../../src/database/postgres.js';

export function serviceTests(context: () => {
  admin: Pool; repository: ServicoRepository; database: PostgresDatabase;
  request: (path: string, method?: string, body?: unknown, authenticated?: boolean) => Promise<Response>;
  url: string; cookie: string;
}) {
  let owner: number, applicant: number, vehicle: number, type: number, id: number;
  const body = () => ({ id_cliente: applicant, id_veiculo: vehicle, id_tipo_servico: type,
    data_inicio: '2026-10-28T00:00:00', data_conclusao: null as string | null, status: 'EM_ANDAMENTO',
    valor_recebido: '150.01', observacoes: null as string | null });
  test('PG serviços: tipos ordenados inclusive inativos; lista vazia e solicitante diferente do proprietário', async () => {
    const { admin, request } = context();
    const clients = await admin.query(`INSERT INTO app.cliente(tipo_pessoa,nome_razao_social,cpf_cnpj,telefone)
      VALUES ('PF','Dono sintético','00000000301','000'),('PF','Solicitante sintético','00000000302','000') RETURNING id_cliente`);
    [owner, applicant] = clients.rows.map(row => row.id_cliente);
    vehicle = (await admin.query(`INSERT INTO app.veiculo(id_cliente_proprietario,placa,tipo_veiculo,marca,modelo,renavam)
      VALUES ($1,'SVC1A23','Teste','Teste','Teste','00000000401') RETURNING id_veiculo`, [owner])).rows[0].id_veiculo;
    type = (await admin.query(`INSERT INTO app.tipo_servico(nome,descricao,ativo) VALUES ($1,NULL,false) RETURNING id_tipo_servico`, ['Tipo sintético inativo'])).rows[0].id_tipo_servico;
    const types = await request('/api/tipos-servico'); assert.equal(types.status, 200);
    const rows = await types.json();
    assert.deepEqual(rows.map((row: { id_tipo_servico: number }) => row.id_tipo_servico), [...rows.map((row: { id_tipo_servico: number }) => row.id_tipo_servico)].sort((a: number, b: number) => a-b));
    assert.deepEqual(rows.find((row: { id_tipo_servico: number }) => row.id_tipo_servico === type), { id_tipo_servico: type, nome: 'Tipo sintético inativo', descricao: null, ativo: false });
    assert.deepEqual(await (await request('/api/servicos')).json(), []);
    const response = await request('/api/servicos', 'POST', { ...body(), observacoes: 'é'.repeat(500).normalize('NFD') });
    assert.equal(response.status, 201); const created = await response.json(); id = created.id_servico;
    assert.equal(response.headers.get('location'), `/api/servicos/${id}`);
    assert.equal(created.id_cliente, applicant); assert.notEqual(applicant, owner);
    assert.equal(created.id_veiculo, vehicle); assert.equal(created.id_tipo_servico, type);
    assert.equal(created.valor_recebido, '150.01'); assert.equal(created.data_inicio, body().data_inicio);
    assert.equal(created.data_conclusao, null); assert.equal(created.observacoes, 'é'.repeat(500));
    assert.match(created.data_cadastro, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?$/);
    assert.deepEqual(Object.keys(created).sort(), ['id_servico','id_cliente','id_veiculo','id_tipo_servico','data_inicio','data_conclusao','status','valor_recebido','observacoes','data_cadastro'].sort());
    assert.deepEqual(await (await request(`/api/servicos/${id}`)).json(), created);
    assert.deepEqual(await (await request('/api/servicos')).json(), [created]);
  });
  test('PG serviços: edição, conclusão, cancelamento e reabertura preservam regras existentes', async () => {
    const { request } = context();
    const original = await (await request(`/api/servicos/${id}`)).json();
    assert.equal((await request(`/api/servicos/${id}`, 'PUT', { ...body(), status: 'CONCLUIDO' })).status, 400);
    for (const status of ['CONCLUIDO', 'CANCELADO', 'EM_ANDAMENTO']) {
      const data = { ...body(), status, data_conclusao: status === 'CONCLUIDO' ? body().data_inicio : null, valor_recebido: '420.00', observacoes: "Teste'); DROP TABLE app.servico;--" };
      const response = await request(`/api/servicos/${id}`, 'PUT', data); assert.equal(response.status, 200);
      const result = await response.json(); assert.equal(result.status, status);
      assert.equal(result.valor_recebido, '420.00'); assert.equal(result.data_cadastro, original.data_cadastro);
      assert.equal(result.observacoes, data.observacoes);
    }
    assert.equal((await request('/api/servicos/999999')).status, 404);
    assert.equal((await request('/api/servicos/999999', 'PUT', body())).status, 404);
    assert.equal((await request(`/api/servicos/${id}`, 'PUT', { status: 'CANCELADO' })).status, 400);
    assert.equal((await request(`/api/servicos/${id}`, 'DELETE')).status, 404);
  });
  test('PG serviços: seis casas exatas, sem fuso, sete casas rejeitadas mesmo zero', async () => {
    const { request, admin, repository } = context();
    const input = { ...body(), data_inicio: '2026-10-28T23:59:59.123456', data_conclusao: '2026-10-28T23:59:59.123457', status: 'CONCLUIDO' };
    const response = await request('/api/servicos', 'POST', input); assert.equal(response.status, 201);
    const result = await response.json(); assert.equal(result.data_inicio, input.data_inicio); assert.equal(result.data_conclusao, input.data_conclusao);
    for (const field of ['data_inicio', 'data_conclusao']) for (const value of ['2026-10-28T00:00:00.1234560', '2026-10-28T00:00:00.1234567', '2026-10-28T00:00:00Z', '2026-10-28', '2026-02-30T00:00:00']) {
      for (const [path, method] of [['/api/servicos', 'POST'], [`/api/servicos/${id}`, 'PUT']]) {
        const bad = await request(path, method, { ...body(), [field]: value }); assert.equal(bad.status, 400);
        assert.equal((await bad.json()).error.code, 'VALIDATION_ERROR');
      }
    }
    assert.equal((await request('/api/servicos', 'POST', { ...input, data_conclusao: '2026-10-28T23:59:59.123455' })).status, 400);
    const client = await admin.connect();
    try {
      await client.query('BEGIN'); await client.query("SET LOCAL TIME ZONE 'Pacific/Auckland'");
      const otherZone = new PostgresServicoRepository({ async query<T>(sql: string, parameters?: unknown[]) { return (await client.query(sql, parameters)).rows as T[]; } });
      assert.deepEqual(await otherZone.find(result.id_servico), await repository.find(result.id_servico));
    } finally { await client.query('ROLLBACK'); client.release(); }
  });
  test('PG serviços: dinheiro exato, limites, zero e entradas inválidas sem arredondamento', async () => {
    const { request } = context();
    for (const [value, expected] of [['0', '0.00'], [350.5, '350.50'], ['0.01', '0.01'], ['99999999.99', '99999999.99']] as const) {
      const response = await request('/api/servicos', 'POST', { ...body(), status: 'CANCELADO', valor_recebido: value });
      assert.equal(response.status, 201); assert.equal((await response.json()).valor_recebido, expected);
    }
    for (const patch of [{ valor_recebido: '0.001' }, { valor_recebido: '-1' }, { valor_recebido: '100000000.00' }, { valor_recebido: 'NaN' },
      { status: 'ABERTO' }, { status: 'CONCLUIDO' }, { observacoes: 'é'.repeat(501).normalize('NFD') }, { data_inicio: '2026-10-28T24:00:00' }]) {
      assert.equal((await request('/api/servicos', 'POST', { ...body(), ...patch })).status, 400);
    }
    const rows = await (await request('/api/servicos')).json();
    assert.ok(rows.some((row: { status: string }) => row.status === 'CANCELADO'));
    assert.deepEqual(rows.map((row: { id_servico: number }) => row.id_servico), [...rows.map((row: { id_servico: number }) => row.id_servico)].sort((a: number, b: number) => a-b));
  });
  test('PG serviços: três relacionamentos e FKs reais após pré-consulta', async () => {
    const { request, repository, database } = context();
    for (const field of ['id_cliente', 'id_veiculo', 'id_tipo_servico']) {
      const response = await request('/api/servicos', 'POST', { ...body(), [field]: 999999 });
      assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'INVALID_REFERENCE');
    }
    const original = repository.missingReference;
    repository.missingReference = async () => undefined;
    try {
      for (const field of ['id_cliente', 'id_veiculo', 'id_tipo_servico']) for (const [path, method] of [['/api/servicos', 'POST'], [`/api/servicos/${id}`, 'PUT']]) {
        const response = await request(path, method, { ...body(), [field]: 999999 });
        assert.equal(response.status, 400); assert.equal((await response.json()).error.code, 'INTEGRITY_ERROR');
      }
    } finally { repository.missingReference = original; }
    await assert.rejects(database.query('DELETE FROM app.servico WHERE false'), { code: '42501' });
    await assert.rejects(database.query('UPDATE app.tipo_servico SET ativo=true WHERE false'), { code: '42501' });
  });
  test('PG serviços: proteção HTTP, CSRF e erros seguros para serviços/tipos', async () => {
    const { request, admin, url, cookie } = context();
    for (const path of ['/api/servicos', `/api/servicos/${id}`, '/api/tipos-servico']) assert.equal((await request(path, 'GET', undefined, false)).status, 401);
    assert.equal((await fetch(url + '/api/servicos', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body()) })).status, 403);
    for (const [table, path] of [['servico', '/api/servicos'], ['tipo_servico', '/api/tipos-servico']]) {
      await admin.query(`REVOKE SELECT ON app.${table} FROM dc_api`);
      try { const response = await request(path); assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Erro interno da API.' } });
      } finally { await admin.query(`GRANT SELECT ON app.${table} TO dc_api`); }
    }
  });
}
