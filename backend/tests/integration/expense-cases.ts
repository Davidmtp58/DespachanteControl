import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import type { DespesaRepository } from '../../src/repositories/despesa-repository.js';
import { PostgresDespesaRepository } from '../../src/repositories/postgres-despesas.js';

export function expenseTests(context: () => {
  admin: Pool; repository: DespesaRepository;
  request: (path: string, method?: string, body?: unknown, authenticated?: boolean) => Promise<Response>;
  url: string; cookie: string;
}) {
  let services: number[], id: number;
  const body = () => ({ id_servico: services[0], descricao: 'Despesa sintética', valor: '10.02', data_despesa: '2024-02-29', observacoes: null as string | null });
  test('PG despesas: lista vazia, cadastro NFC, consulta e filtro por serviço', async () => {
    const { admin, request } = context();
    services = [];
    for (const status of ['EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO']) {
      services.push((await admin.query(`INSERT INTO app.servico(id_cliente,id_veiculo,id_tipo_servico,data_inicio,data_conclusao,status,valor_recebido)
        SELECT id_cliente,id_veiculo,id_tipo_servico,'2026-10-28'::timestamp,
        CASE WHEN $1='CONCLUIDO' THEN '2026-10-28'::timestamp ELSE NULL END,$1,150.01
        FROM app.servico ORDER BY id_servico LIMIT 1 RETURNING id_servico`, [status])).rows[0].id_servico);
    }
    assert.deepEqual(await (await request('/api/despesas')).json(), []);
    assert.deepEqual(await (await request(`/api/servicos/${services[0]}/despesas`)).json(), []);
    const response = await request('/api/despesas', 'POST', { ...body(), descricao: 'é'.repeat(150).normalize('NFD'), observacoes: 'á'.repeat(300).normalize('NFD') });
    assert.equal(response.status, 201); const created = await response.json(); id = created.id_despesa;
    assert.equal(response.headers.get('location'), `/api/despesas/${id}`);
    assert.deepEqual(created, { ...body(), id_despesa: id, descricao: 'é'.repeat(150), observacoes: 'á'.repeat(300) });
    assert.deepEqual(await (await request(`/api/despesas/${id}`)).json(), created);
    assert.deepEqual(await (await request(`/api/servicos/${services[0]}/despesas`)).json(), [created]);
    assert.deepEqual(await (await request(`/api/servicos/${services[1]}/despesas`)).json(), []);
  });
  test('PG despesas: aceita concluído/cancelado, edição transfere vínculo e preserva ID', async () => {
    const { request } = context();
    for (const service of services.slice(1)) {
      const response = await request('/api/despesas', 'POST', { ...body(), id_servico: service });
      assert.equal(response.status, 201);
      assert.equal((await response.json()).id_servico, service);
    }
    const response = await request(`/api/despesas/${id}`, 'PUT', { ...body(), id_servico: services[2], valor: '350.50', descricao: "Teste'); DROP TABLE app.despesa_servico;--", observacoes: undefined });
    assert.equal(response.status, 200); const updated = await response.json();
    assert.equal(updated.id_despesa, id); assert.equal(updated.id_servico, services[2]);
    assert.equal(updated.valor, '350.50'); assert.equal(updated.observacoes, null);
    assert.equal(updated.descricao, "Teste'); DROP TABLE app.despesa_servico;--");
    assert.deepEqual(await (await request(`/api/servicos/${services[0]}/despesas`)).json(), []);
    assert.equal((await (await request(`/api/servicos/${services[2]}/despesas`)).json()).length, 2);
    assert.equal((await request(`/api/despesas/${id}`, 'PUT', { valor: '1.00' })).status, 400);
  });
  test('PG despesas: centavos/limites exatos e DATE sem conversão de fuso', async () => {
    const { request, admin, repository } = context();
    for (const [value, expected] of [['0.01', '0.01'], [350.5, '350.50'], ['99999999.99', '99999999.99']] as const) {
      const response = await request('/api/despesas', 'POST', { ...body(), valor: value });
      assert.equal(response.status, 201); assert.equal((await response.json()).valor, expected);
    }
    const connection = await admin.connect();
    try {
      await connection.query('BEGIN'); await connection.query("SET LOCAL TIME ZONE 'Pacific/Auckland'");
      const otherZone = new PostgresDespesaRepository({ async query<T>(sql: string, values?: unknown[]) { return (await connection.query(sql, values)).rows as T[]; } });
      assert.deepEqual(await otherZone.find(id), await repository.find(id));
    } finally { await connection.query('ROLLBACK'); connection.release(); }
    for (const patch of [{ valor: 0 }, { valor: '-1' }, { valor: '0.001' }, { valor: '100000000.00' }, { valor: 'NaN' },
      { data_despesa: '2026-02-29' }, { data_despesa: '2024-02-29T00:00:00Z' }, { descricao: '' },
      { descricao: 'é'.repeat(151).normalize('NFD') }, { observacoes: 'é'.repeat(301).normalize('NFD') }, { id_servico: 0 }]) {
      for (const [path, method] of [['/api/despesas', 'POST'], [`/api/despesas/${id}`, 'PUT']]) {
        const response = await request(path, method, { ...body(), ...patch }); assert.equal(response.status, 400);
        assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
      }
    }
    const rows = await (await request('/api/despesas')).json();
    assert.deepEqual(rows.map((row: { id_despesa: number }) => row.id_despesa), [...rows.map((row: { id_despesa: number }) => row.id_despesa)].sort((a: number, b: number) => a-b));
  });
  test('PG despesas: serviço inexistente, FK concorrente real e ausência de cascata', async () => {
    const { request, repository, admin } = context();
    const missing = await request('/api/servicos/999999/despesas'); assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'SERVICE_NOT_FOUND');
    for (const [path, method] of [['/api/despesas', 'POST'], [`/api/despesas/${id}`, 'PUT']]) {
      const response = await request(path, method, { ...body(), id_servico: 999999 }); assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'INVALID_REFERENCE');
    }
    const original = repository.serviceExists;
    repository.serviceExists = async () => true;
    try {
      for (const [path, method] of [['/api/despesas', 'POST'], [`/api/despesas/${id}`, 'PUT']]) {
        const response = await request(path, method, { ...body(), id_servico: 999999 }); assert.equal(response.status, 400);
        assert.equal((await response.json()).error.code, 'INTEGRITY_ERROR');
      }
    } finally { repository.serviceExists = original; }
    await assert.rejects(admin.query('DELETE FROM app.servico WHERE id_servico=$1', [services[2]]), { code: '23503' });
    assert.equal((await request('/api/despesas/999999', 'PUT', body())).status, 404);
  });
  test('PG despesas: autenticação/CSRF protegem escrita e DELETE; permissão falha com erro seguro', async () => {
    const { request, url, cookie, admin } = context();
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const path = method === 'POST' ? '/api/despesas' : `/api/despesas/${id}`;
      assert.equal((await request(path, method, body(), false)).status, 401);
      const response = await fetch(url + path, { method, headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body()) });
      assert.equal(response.status, 403);
    }
    assert.equal((await request(`/api/despesas/${id}`)).status, 200);
    await admin.query('REVOKE DELETE ON app.despesa_servico FROM dc_api');
    try {
      const response = await request(`/api/despesas/${id}`, 'DELETE'); assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Erro interno da API.' } });
    } finally { await admin.query('GRANT DELETE ON app.despesa_servico TO dc_api'); }
    assert.equal((await request(`/api/despesas/${id}`)).status, 200);
  });
  test('PG despesas: DELETE real retorna 204 vazio, depois GET/DELETE retornam 404', async () => {
    const { request, admin } = context();
    const response = await request(`/api/despesas/${id}`, 'DELETE'); assert.equal(response.status, 204); assert.equal(await response.text(), '');
    assert.equal((await admin.query('SELECT id_despesa FROM app.despesa_servico WHERE id_despesa=$1', [id])).rowCount, 0);
    for (const method of ['GET', 'DELETE']) {
      const missing = await request(`/api/despesas/${id}`, method); assert.equal(missing.status, 404);
      assert.equal((await missing.json()).error.code, 'EXPENSE_NOT_FOUND');
    }
    assert.equal((await request('/api/despesas/999999', 'DELETE')).status, 404);
    const filtered = await (await request(`/api/servicos/${services[2]}/despesas`)).json();
    assert.ok(filtered.every((row: { id_despesa: number }) => row.id_despesa !== id));
  });
}
