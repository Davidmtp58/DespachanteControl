import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import sql from 'mssql';
import { createTestApp as createApp, authenticatedFetch as fetch } from './auth-helper.js';
import type { QueryExecutor, SqlParameter } from '../src/database/connection.js';
import { SqlServicoRepository } from '../src/repositories/servico-repository.js';
import { validateServico } from '../src/services/servico-validation.js';

const input = { id_cliente: 9, id_veiculo: 2, id_tipo_servico: 3, data_inicio: '2026-01-01T10:00:00',
  status: 'EM_ANDAMENTO', valor_recebido: '123.45' };
const row = { ...validateServico(input), id_servico: 4, data_cadastro: '2026-01-01T10:00:00' };
type Call = { statement: string; parameters: SqlParameter[] };
const normal = (call: Call): unknown[] => {
  if (call.statement.includes('FROM dbo.TipoServico')) return [{ id_tipo_servico: 3, nome: 'Teste', descricao: null, ativo: false }];
  if (call.statement.includes('FROM dbo.Cliente')) return [{ id_cliente: 9 }];
  if (call.statement.includes('FROM dbo.Veiculo')) return [{ id_veiculo: 2, id_cliente_proprietario: 99 }];
  return [row];
};
async function api(handler: (call: Call) => unknown[], run: (url: string, calls: Call[]) => Promise<void>) {
  const calls: Call[] = [];
  const database: QueryExecutor = { async query<T>(statement: string, parameters: SqlParameter[] = []) {
    const call = { statement, parameters }; calls.push(call); return handler(call) as T[];
  } };
  const server = createApp(async () => {}, undefined, undefined, new SqlServicoRepository(database)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`, calls); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('serviços: listagem inclui cancelados, detalhe e tipos inclusive inativos', async () => {
  await api(call => call.statement.includes('FROM dbo.Servico') ? [{ ...row, status: 'CANCELADO' }] : normal(call), async (url, calls) => {
    for (const path of ['/servicos', '/servicos/4', '/tipos-servico']) {
      const response = await fetch(url + path);
      assert.equal(response.status, 200);
      const body = await response.json();
      if (path === '/servicos') assert.equal(body[0].status, 'CANCELADO');
      if (path === '/servicos/4') assert.equal(body.id_servico, 4);
      if (path === '/tipos-servico') assert.equal(body[0].ativo, false);
    }
    assert.doesNotMatch(calls[0].statement, /WHERE/);
    assert.equal(calls[1].parameters[0].value, 4);
    assert.doesNotMatch(calls[2].statement, /WHERE/);
  });
  await api(() => [], async url => {
    assert.deepEqual(await (await fetch(`${url}/servicos`)).json(), []);
    assert.deepEqual(await (await fetch(`${url}/tipos-servico`)).json(), []);
    assert.equal((await fetch(`${url}/servicos/4`)).status, 404);
  });
});

test('serviços: POST permite solicitante distinto do proprietário e usa parâmetros tipados', async () => {
  await api(normal, async (url, calls) => {
    const observacoes = "Teste'; DROP TABLE dbo.Servico; --";
    const response = await fetch(`${url}/servicos`, json('POST', { ...input, observacoes }));
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('location'), '/api/servicos/4');
    assert.equal((await response.json()).valor_recebido, '123.45');
    assert.equal(calls.length, 4);
    assert.deepEqual(calls.slice(0, 3).map(c => c.parameters[0].value), [9, 2, 3]);
    const write = calls[3];
    assert.match(write.statement, /INSERT INTO dbo.Servico/);
    assert.ok(!write.statement.includes(observacoes));
    assert.deepEqual(write.parameters.find(p => p.name === 'valor')?.type, sql.Decimal(10, 2));
    assert.equal(write.parameters.find(p => p.name === 'valor')?.value, 123.45);
    assert.equal(write.parameters.find(p => p.name === 'observacoes')?.value, observacoes);
    assert.equal(write.parameters.find(p => p.name === 'conclusao')?.value, null);
    assert.match(write.statement, /CONVERT\(datetime2\(7\), @inicio, 126\)/);
    assert.doesNotMatch(write.statement, /custo_total|resultado_liquido/);
  });
});

test('serviços: PUT substitui campos editáveis, permite cancelamento e valor zero', async () => {
  await api(normal, async (url, calls) => {
    assert.equal((await fetch(`${url}/servicos/4`, json('PUT', { ...input, status: 'CANCELADO', valor_recebido: 0 }))).status, 200);
    const write = calls.at(-1)!;
    assert.match(write.statement, /UPDATE dbo.Servico SET/);
    assert.match(write.statement, /WHERE id_servico = @id/);
    assert.doesNotMatch(write.statement, /data_cadastro\s*=|custo_total|resultado_liquido/);
    assert.equal(write.parameters.find(p => p.name === 'status')?.value, 'CANCELADO');
    assert.equal(write.parameters.find(p => p.name === 'valor')?.value, 0);
    assert.equal(write.parameters.at(-1)?.value, 4);
  });
  await api(() => [], async (url, calls) => {
    assert.equal((await fetch(`${url}/servicos/4`, json('PUT', input))).status, 404);
    assert.equal(calls.length, 1);
  });
  await api(call => call.statement.startsWith('UPDATE') ? [] : normal(call), async url => {
    assert.equal((await fetch(`${url}/servicos/4`, json('PUT', input))).status, 404);
  });
});

test('serviços: cada FK ausente impede POST e PUT antes de gravar', async () => {
  for (const table of ['Cliente', 'Veiculo', 'TipoServico']) {
    await api(call => call.statement.includes(`FROM dbo.${table} `) ? [] : normal(call), async (url, calls) => {
      for (const [path, method] of [['/servicos', 'POST'], ['/servicos/4', 'PUT']]) {
        const response = await fetch(url + path, json(method, input));
        assert.equal(response.status, 400);
        assert.equal((await response.json()).error.code, 'INVALID_REFERENCE');
      }
      assert.ok(calls.every(c => c.statement.startsWith('SELECT')));
    });
  }
});

test('serviços: valida status, IDs, datas, precisão, limites e campos extras antes do SQL', async () => {
  const bodies = [null, [], {}, { ...input, status: 'ABERTO' }, { ...input, status: null },
    ...['id_cliente', 'id_veiculo', 'id_tipo_servico'].flatMap(key => [0, -1, '1', 1.5, 2147483648, null].map(value => ({ ...input, [key]: value }))),
    ...['2025-02-29T10:00:00', '2026-13-01T10:00:00', '2026-01-01T24:00:00', '2026-01-01', '2026-01-01T10:00:00Z', '0000-01-01T10:00:00'].map(data_inicio => ({ ...input, data_inicio })),
    { ...input, data_conclusao: '2026-01-01T09:59:59.9999999' },
    ...[-1, '1.001', 0.1 + 0.2, '100000000.00', '1,50', '', null, true, 'NaN', 'Infinity', '1e2'].map(valor_recebido => ({ ...input, valor_recebido })),
    { ...input, observacoes: 'a'.repeat(501) }, { ...input, id_servico: 1 }, { ...input, data_cadastro: 'x' },
    { ...input, custo_total: 0 }, { ...input, resultado_liquido: 0 }];
  await api(normal, async (url, calls) => {
    for (const body of bodies) {
      for (const [path, method] of [['/servicos', 'POST'], ['/servicos/4', 'PUT']]) {
        assert.equal((await fetch(url + path, json(method, body))).status, 400, JSON.stringify(body));
      }
    }
    assert.equal(calls.length, 0);
  });
});

test('serviços: datas preservam sete casas e valores preservam duas sem arredondar entradas', () => {
  for (const [value, expected] of [[0, '0.00'], ['0.01', '0.01'], [1.2, '1.20'], ['99999999.99', '99999999.99']] as const) {
    assert.equal(validateServico({ ...input, valor_recebido: value }).valor_recebido, expected);
  }
  for (const status of ['EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO']) {
    const data = validateServico({ ...input, status, data_inicio: '2024-02-29T10:00:00.1234567', data_conclusao: '2024-02-29T10:00:00.1234567' });
    assert.equal(data.data_inicio, data.data_conclusao);
  }
  assert.throws(() => validateServico({ ...input, data_inicio: '2026-01-01T10:00:00.0000002', data_conclusao: '2026-01-01T10:00:00.0000001' }));
});

test('serviços: integridade concorrente retorna 400, unicidade 409 e falha inesperada 500', async () => {
  for (const number of [547, 515, 2601, 2627, 999]) {
    await api(call => {
      if (/^(INSERT|UPDATE)/.test(call.statement)) throw { number, message: 'password=segredo SQL' };
      return normal(call);
    }, async url => {
      for (const [path, method] of [['/servicos', 'POST'], ['/servicos/4', 'PUT']]) {
        const response = await fetch(url + path, json(method, input));
        assert.equal(response.status, [547, 515].includes(number) ? 400 : number === 999 ? 500 : 409);
        assert.ok(!(await response.text()).includes('segredo'));
      }
    });
  }
});

test('serviços: erros de leitura são genéricos e não expõem detalhes', async () => {
  await api(() => { throw new Error('segredo'); }, async url => {
    for (const path of ['/servicos', '/servicos/4', '/tipos-servico']) {
      const response = await fetch(url + path);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Erro interno da API.' } });
    }
  });
});

test('serviços: IDs inválidos, JSON inválido e DELETE não consultam banco', async () => {
  await api(normal, async (url, calls) => {
    for (const id of ['0', '-1', '1.5', '2147483648', '1 OR 1=1']) {
      assert.equal((await fetch(`${url}/servicos/${encodeURIComponent(id)}`)).status, 400);
      assert.equal((await fetch(`${url}/servicos/${encodeURIComponent(id)}`, json('PUT', input))).status, 400);
    }
    assert.equal((await fetch(`${url}/servicos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' })).status, 400);
    assert.equal((await fetch(`${url}/servicos/4`, { method: 'DELETE' })).status, 404);
    assert.equal(calls.length, 0);
  });
});

test('conclusão: POST/PUT rejeitam ausência, datas inválidas e anteriores antes de consultar banco', async () => {
  await api(normal, async (url, calls) => {
    for (const data_conclusao of [undefined, null, '', '2026-02-30T10:00:00', '2026-01-01',
      '2026-01-01T10:00:00Z', '2026-01-01T25:00:00', '2026-01-01T09:59:59.9999999', 123]) {
      for (const [path, method] of [['/servicos', 'POST'], ['/servicos/4', 'PUT']]) {
        const response = await fetch(url + path, json(method, { ...input, status: 'CONCLUIDO', data_conclusao }));
        assert.equal(response.status, 400);
        const body = await response.json();
        assert.equal(body.error.code, 'VALIDATION_ERROR');
        if (data_conclusao == null) assert.equal(body.error.message, 'Data de conclusão é obrigatória para serviço concluído.');
      }
    }
    assert.equal(calls.length, 0);
  });
});

test('conclusão: cadastro e transição de andamento para concluído aceitam mesma data ou posterior', async () => {
  await api(call => {
    if (/^(INSERT|UPDATE)/.test(call.statement)) return [{ ...row, status: 'CONCLUIDO',
      data_conclusao: call.parameters.find(p => p.name === 'conclusao')!.value }];
    return normal(call);
  }, async (url, calls) => {
    for (const data_conclusao of [input.data_inicio, '2026-01-02T00:00:00', '2026-01-01T10:00:00.0000001']) {
      for (const [path, method, status] of [['/servicos', 'POST', 201], ['/servicos/4', 'PUT', 200]] as const) {
        const response = await fetch(url + path, json(method, { ...input, status: 'CONCLUIDO', data_conclusao }));
        assert.equal(response.status, status);
        assert.equal((await response.json()).status, 'CONCLUIDO');
        const write = calls.at(-1)!;
        assert.equal(write.parameters.find(p => p.name === 'conclusao')?.value,
          validateServico({ ...input, status: 'CONCLUIDO', data_conclusao }).data_conclusao);
      }
    }
  });
});

test('conclusão: legado permanece consultável; edição exige corrigir data; PUT não é parcial', async () => {
  await api(call => call.statement.includes('FROM dbo.Servico') ? [{ ...row, status: 'CONCLUIDO', data_conclusao: null }] : normal(call), async (url, calls) => {
    const detail = await fetch(`${url}/servicos/4`);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).data_conclusao, null);
    const before = calls.length;
    assert.equal((await fetch(`${url}/servicos/4`, json('PUT', { ...input, status: 'CONCLUIDO' }))).status, 400);
    assert.equal((await fetch(`${url}/servicos/4`, json('PUT', { status: 'CONCLUIDO', data_conclusao: input.data_inicio }))).status, 400);
    assert.equal(calls.length, before);
    assert.equal((await fetch(`${url}/servicos/4`, json('PUT', { ...input, status: 'CONCLUIDO', data_conclusao: input.data_inicio }))).status, 200);
    for (const status of ['EM_ANDAMENTO', 'CANCELADO']) {
      for (const method of ['POST', 'PUT']) {
        assert.equal((await fetch(`${url}/servicos${method === 'PUT' ? '/4' : ''}`, json(method, { ...input, status, data_conclusao: null }))).status, method === 'PUT' ? 200 : 201);
      }
    }
  });
});
