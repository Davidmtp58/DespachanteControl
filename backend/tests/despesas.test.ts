import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import sql from 'mssql';
import { createTestApp as createApp, authenticatedFetch as fetch } from './auth-helper.js';
import type { QueryExecutor, SqlParameter } from '../src/database/connection.js';
import { SqlDespesaRepository } from '../src/repositories/despesa-repository.js';
import { SqlServicoRepository } from '../src/repositories/servico-repository.js';
import { validateDespesa } from '../src/services/despesa-validation.js';

const input = { id_servico: 4, descricao: 'Taxa de teste', valor: '25.50', data_despesa: '2026-01-15' };
const row = { ...input, id_despesa: 8, observacoes: null };
type Call = { statement: string; parameters: SqlParameter[] };
const normal = (call: Call): unknown[] => call.statement.includes('FROM dbo.Servico ') ? [{ id_servico: 4, status: 'CANCELADO' }] : [row];
async function api(handler: (call: Call) => unknown[], run: (url: string, calls: Call[]) => Promise<void>) {
  const calls: Call[] = [];
  const db: QueryExecutor = { async query<T>(statement: string, parameters: SqlParameter[] = []) {
    const call = { statement, parameters }; calls.push(call); return handler(call) as T[];
  } };
  const server = createApp(async () => {}, undefined, undefined, new SqlServicoRepository(db), new SqlDespesaRepository(db)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`, calls); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('despesas: lista, detalhe e filtro por serviço com parâmetros', async () => {
  await api(normal, async (url, calls) => {
    const list = await fetch(`${url}/despesas`);
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), [row]);
    const detail = await fetch(`${url}/despesas/8`);
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), row);
    const filtered = await fetch(`${url}/servicos/4/despesas`);
    assert.equal(filtered.status, 200);
    assert.deepEqual(await filtered.json(), [row]);
    assert.match(calls.at(-1)!.statement, /WHERE id_servico = @id/);
    assert.equal(calls.at(-1)!.parameters[0].value, 4);
  });
  await api(call => call.statement.includes('FROM dbo.Servico ') ? [{ id_servico: 4 }] : [], async url => {
    assert.deepEqual(await (await fetch(`${url}/despesas`)).json(), []);
    assert.deepEqual(await (await fetch(`${url}/servicos/4/despesas`)).json(), []);
    assert.equal((await fetch(`${url}/despesas/8`)).status, 404);
  });
});

test('despesas: POST aceita serviços concluídos/cancelados e parametriza todos os valores', async () => {
  for (const status of ['CONCLUIDO', 'CANCELADO']) {
    await api(call => call.statement.includes('FROM dbo.Servico ') ? [{ id_servico: 4, status }] : [row], async (url, calls) => {
      const descricao = "Teste'; DROP TABLE dbo.DespesaServico; --";
      const response = await fetch(`${url}/despesas`, json('POST', { ...input, descricao }));
      assert.equal(response.status, 201);
      assert.equal(response.headers.get('location'), '/api/despesas/8');
      assert.equal((await response.json()).valor, '25.50');
      const write = calls.at(-1)!;
      assert.match(write.statement, /INSERT INTO dbo.DespesaServico/);
      assert.ok(!write.statement.includes(descricao));
      assert.deepEqual(write.parameters[2].type, sql.Decimal(10, 2));
      assert.deepEqual(write.parameters[3].type, sql.Date());
      assert.equal(write.parameters[1].value, descricao);
      assert.equal(write.parameters[2].value, 25.5);
      assert.equal((write.parameters[3].value as Date).toISOString(), '2026-01-15T00:00:00.000Z');
      assert.equal(write.parameters[4].value, null);
      assert.doesNotMatch(write.statement, /custo_total|resultado_liquido/);
    });
  }
});

test('despesas: PUT permite trocar serviço e preserva ID; ausência concorrente retorna 404', async () => {
  await api(normal, async (url, calls) => {
    assert.equal((await fetch(`${url}/despesas/8`, json('PUT', { ...input, id_servico: 9, valor: '0.01' }))).status, 200);
    const write = calls.at(-1)!;
    assert.match(write.statement, /UPDATE dbo.DespesaServico SET/);
    assert.match(write.statement, /WHERE id_despesa = @id/);
    assert.equal(write.parameters[0].value, 9);
    assert.equal(write.parameters[2].value, 0.01);
    assert.equal(write.parameters.at(-1)!.value, 8);
  });
  await api(call => call.statement.startsWith('UPDATE') ? [] : normal(call), async url => {
    assert.equal((await fetch(`${url}/despesas/8`, json('PUT', input))).status, 404);
  });
});

test('despesas: DELETE usa ID parametrizado, retorna 204 vazio e depois 404', async () => {
  let removed = false;
  await api(() => { if (removed) return []; removed = true; return [{ id_despesa: 8 }]; }, async (url, calls) => {
    const response = await fetch(`${url}/despesas/8`, { method: 'DELETE' });
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assert.equal((await fetch(`${url}/despesas/8`, { method: 'DELETE' })).status, 404);
    assert.equal(calls[0].statement, 'DELETE FROM dbo.DespesaServico OUTPUT DELETED.id_despesa WHERE id_despesa = @id');
    assert.equal(calls[0].parameters[0].value, 8);
  });
});

test('despesas: serviço inexistente impede escrita e filtro retorna 404', async () => {
  await api(call => call.statement.includes('FROM dbo.Servico ') ? [] : [row], async (url, calls) => {
    assert.equal((await fetch(`${url}/servicos/4/despesas`)).status, 404);
    assert.equal((await fetch(`${url}/despesas`, json('POST', input))).status, 400);
    assert.equal((await fetch(`${url}/despesas/8`, json('PUT', input))).status, 400);
    assert.ok(calls.every(c => c.statement.startsWith('SELECT')));
  });
  await api(() => [], async (url, calls) => {
    assert.equal((await fetch(`${url}/despesas/8`, json('PUT', input))).status, 404);
    assert.equal(calls.length, 1);
  });
});

test('despesas: corpo inválido, valor não positivo, datas e limites não atingem SQL', async () => {
  const bodies = [null, [], {}, ...[0, '0.00', -1, '0.001', '100000000.00', '1,25', null, true, 0.1 + 0.2].map(valor => ({ ...input, valor })),
    ...[0, -1, '4', 1.5, 2147483648].map(id_servico => ({ ...input, id_servico })),
    ...['2025-02-29', '2026-13-01', '0000-01-01', '2026-01-01T00:00:00', null].map(data_despesa => ({ ...input, data_despesa })),
    { ...input, descricao: ' ' }, { ...input, descricao: 'a'.repeat(151) }, { ...input, observacoes: 'a'.repeat(301) },
    { ...input, id_despesa: 8 }, { ...input, custo_total: 0 }, { ...input, resultado_liquido: 0 }];
  await api(normal, async (url, calls) => {
    for (const body of bodies) {
      assert.equal((await fetch(`${url}/despesas`, json('POST', body))).status, 400);
      assert.equal((await fetch(`${url}/despesas/8`, json('PUT', body))).status, 400);
    }
    for (const id of ['0', '-1', '1.5', '2147483648', '1 OR 1=1']) {
      for (const method of ['GET', 'PUT', 'DELETE']) {
        assert.equal((await fetch(`${url}/despesas/${encodeURIComponent(id)}`, method === 'PUT' ? json(method, input) : { method })).status, 400);
      }
      assert.equal((await fetch(`${url}/servicos/${encodeURIComponent(id)}/despesas`)).status, 400);
    }
    assert.equal((await fetch(`${url}/despesas`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })).status, 400);
    assert.equal(calls.length, 0);
  });
});

test('despesas: valores limites e datas válidas mantêm precisão', () => {
  for (const [value, expected] of [['0.01', '0.01'], [25.5, '25.50'], ['99999999.99', '99999999.99']] as const) {
    assert.equal(validateDespesa({ ...input, valor: value, data_despesa: '2024-02-29' }).valor, expected);
  }
});

test('despesas: erros de integridade, unicidade e falhas de escrita não expõem SQL', async () => {
  for (const number of [547, 515, 2601, 2627, 999]) {
    await api(call => {
      if (/^(INSERT|UPDATE|DELETE)/.test(call.statement)) throw { number, message: 'password=segredo SQL' };
      return normal(call);
    }, async url => {
      for (const [path, method] of [['/despesas', 'POST'], ['/despesas/8', 'PUT'], ['/despesas/8', 'DELETE']]) {
        const response = await fetch(url + path, method === 'DELETE' ? { method } : json(method, input));
        assert.equal(response.status, [547, 515].includes(number) ? 400 : number === 999 ? 500 : 409);
        assert.ok(!(await response.text()).includes('segredo'));
      }
    });
  }
});

test('despesas: falhas de leitura retornam 500 genérico', async () => {
  await api(() => { throw new Error('password=segredo'); }, async url => {
    for (const path of ['/despesas', '/despesas/8', '/servicos/4/despesas']) {
      const response = await fetch(url + path);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Erro interno da API.' } });
    }
  });
});
