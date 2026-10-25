import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import sql from 'mssql';
import { createTestApp as createApp, authenticatedFetch as fetch } from './auth-helper.js';
import type { QueryExecutor, SqlParameter } from '../src/database/connection.js';
import { SqlVeiculoRepository } from '../src/repositories/veiculo-repository.js';
import { validateVeiculo } from '../src/services/veiculo-validation.js';

const input = { id_cliente_proprietario: 2, placa: 'abc-1234', tipo_veiculo: 'Automóvel', marca: 'Marca Teste', modelo: 'Modelo Teste', renavam: '00123456789' };
const row = { ...input, placa: 'ABC1234', ano: null, id_veiculo: 9, data_cadastro: '2026-01-01T00:00:00.000Z' };
type Call = { statement: string; parameters: SqlParameter[] };
async function api(handler: (call: Call) => unknown[], run: (url: string, calls: Call[]) => Promise<void>) {
  const calls: Call[] = [];
  const executor: QueryExecutor = {
    async query<T>(statement: string, parameters: SqlParameter[] = []) {
      const call = { statement, parameters };
      calls.push(call);
      return handler(call) as T[];
    },
  };
  const server = createApp(async () => {}, undefined, new SqlVeiculoRepository(executor)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/veiculos`, calls); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const existing = ({ statement }: Call) => statement.includes('@excludeId') ? [] : statement.includes('FROM dbo.Cliente') ? [{ id_cliente: 2 }] : [row];

test('veículos: GET lista, detalhe parametrizado, lista vazia e inexistente', async () => {
  await api(existing, async (url, calls) => {
    const list = await fetch(url);
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), [row]);
    assert.equal(list.headers.get('cache-control'), 'no-store');
    assert.match(calls[0].statement, /FROM dbo.Veiculo ORDER BY id_veiculo/);
    const detail = await fetch(`${url}/9`);
    assert.equal(detail.status, 200);
    assert.deepEqual(await detail.json(), row);
    assert.match(calls[1].statement, /WHERE id_veiculo = @id/);
    assert.equal(calls[1].parameters[0].value, 9);
  });
  await api(() => [], async url => {
    assert.deepEqual(await (await fetch(url)).json(), []);
    assert.equal((await fetch(`${url}/9`)).status, 404);
  });
});

test('veículos: POST valida proprietário e vincula todos os valores sem interpolação', async () => {
  const modelo = "Modelo'; DROP TABLE dbo.Veiculo; --";
  await api(existing, async (url, calls) => {
    const response = await fetch(url, json('POST', { ...input, modelo, ano: 2020 }));
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('location'), '/api/veiculos/9');
    assert.equal((await response.json()).id_veiculo, 9);
    assert.match(calls[0].statement, /FROM dbo.Cliente WHERE id_cliente = @id/);
    assert.equal(calls[0].parameters[0].value, 2);
    const { statement, parameters } = calls[2];
    assert.match(statement, /INSERT INTO dbo.Veiculo/);
    assert.match(statement, /OUTPUT INSERTED.id_veiculo/);
    assert.ok(!statement.includes(modelo));
    assert.deepEqual(parameters.map(p => p.value), [2, 'ABC1234', 'Automóvel', 'Marca Teste', modelo, 2020, '00123456789']);
    assert.deepEqual(parameters[1].type, sql.VarChar(7));
    assert.deepEqual(parameters[6].type, sql.VarChar(11));
    assert.equal(parameters.length, 7);
  });
});

test('veículos: PUT permite alterar proprietário, preserva ID/data e anula ano omitido', async () => {
  await api(existing, async (url, calls) => {
    const response = await fetch(`${url}/9`, json('PUT', { ...input, id_cliente_proprietario: 3, placa: 'abc1d23' }));
    assert.equal(response.status, 200);
    assert.equal(calls[1].parameters[0].value, 3);
    const { statement, parameters } = calls[3];
    assert.match(statement, /UPDATE dbo.Veiculo SET/);
    assert.match(statement, /WHERE id_veiculo = @id/);
    assert.doesNotMatch(statement, /data_cadastro\s*=/);
    assert.deepEqual(parameters.map(p => p.value), [3, 'ABC1D23', 'Automóvel', 'Marca Teste', 'Modelo Teste', null, '00123456789', 9]);
  });
});

test('veículos: proprietário inexistente retorna 400 sem emitir escrita', async () => {
  await api(call => call.statement.includes('FROM dbo.Cliente') ? [] : [row], async (url, calls) => {
    for (const [path, method] of [[url, 'POST'], [`${url}/9`, 'PUT']]) {
      const response = await fetch(path, json(method, input));
      assert.equal(response.status, 400);
      assert.equal((await response.json()).error.code, 'OWNER_NOT_FOUND');
    }
    assert.ok(calls.every(call => call.statement.startsWith('SELECT')));
  });
});

test('veículos: ausência inicial ou remoção concorrente no PUT retorna 404', async () => {
  await api(() => [], async (url, calls) => {
    assert.equal((await fetch(`${url}/9`, json('PUT', input))).status, 404);
    assert.equal(calls.length, 1);
  });
  await api(call => call.statement.startsWith('UPDATE') ? [] : existing(call), async url => {
    assert.equal((await fetch(`${url}/9`, json('PUT', input))).status, 404);
  });
});

test('veículos: placa/RENAVAM duplicados e FK concorrente são traduzidos sem detalhes SQL', async () => {
  for (const number of [2601, 2627, 547]) {
    await api(call => {
      if (/^(INSERT|UPDATE)/.test(call.statement)) throw { number, message: 'SQL interno password=segredo' };
      return existing(call);
    }, async url => {
      for (const [path, method] of [[url, 'POST'], [`${url}/9`, 'PUT']]) {
        const response = await fetch(path, json(method, input));
        assert.equal(response.status, number === 547 ? 400 : 409);
        const body = await response.json();
        assert.equal(body.error.code, number === 547 ? 'OWNER_NOT_FOUND' : 'DUPLICATE_VEHICLE');
        assert.ok(!JSON.stringify(body).includes('segredo'));
      }
    });
  }
});

test('veículos: campos inválidos são rejeitados antes de consultar banco', async () => {
  const invalidBodies = [null, [], {},
    ...['id_cliente_proprietario', 'placa', 'tipo_veiculo', 'marca', 'modelo', 'renavam'].map(key => ({ ...input, [key]: null })),
    ...[0, -1, 2.5, '2', 2147483648].map(id_cliente_proprietario => ({ ...input, id_cliente_proprietario })),
    ...['', '1234567', 'ABC123', 'ABC-1D23', 'ABCD123', 'ABC 1234', 'ABC12345'].map(placa => ({ ...input, placa })),
    ...['1234567890', '123456789012', '0012345678A', 12345678901].map(renavam => ({ ...input, renavam })),
    ...[999, 10000, 2020.5, '2020', ''].map(ano => ({ ...input, ano })),
    { ...input, tipo_veiculo: ' ' }, { ...input, tipo_veiculo: 'x'.repeat(31) }, { ...input, tipo_veiculo: 2 },
    { ...input, marca: 'x'.repeat(51) }, { ...input, modelo: 'x'.repeat(81) },
    { ...input, id_veiculo: 9 }, { ...input, data_cadastro: '2026-01-01' }];
  await api(() => [], async (url, calls) => {
    for (const body of invalidBodies) {
      assert.equal((await fetch(url, json('POST', body))).status, 400, JSON.stringify(body));
      assert.equal((await fetch(`${url}/9`, json('PUT', body))).status, 400, JSON.stringify(body));
    }
    assert.equal(calls.length, 0);
  });
});

test('veículos: IDs inválidos, JSON malformado e DELETE não atingem banco', async () => {
  await api(() => [], async (url, calls) => {
    for (const id of ['0', '-1', '1.5', '2147483648', '1 OR 1=1']) {
      const path = `${url}/${encodeURIComponent(id)}`;
      assert.equal((await fetch(path)).status, 400);
      assert.equal((await fetch(path, json('PUT', input))).status, 400);
    }
    const malformed = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{segredo' });
    assert.equal(malformed.status, 400);
    assert.ok(!(await malformed.text()).includes('segredo'));
    assert.equal((await fetch(url, json('POST', { ...input, modelo: 'x'.repeat(17000) }))).status, 400);
    assert.equal((await fetch(`${url}/9`, { method: 'DELETE' })).status, 404);
    assert.equal(calls.length, 0);
  });
});

test('veículos: falhas inesperadas retornam 500 genérico, inclusive nas escritas', async () => {
  await api(call => {
    if (call.statement.startsWith('SELECT') && call.parameters.length) return existing(call);
    throw new Error('segredo SQL');
  }, async url => {
    for (const [path, options] of [[url, undefined], [url, json('POST', input)], [`${url}/9`, json('PUT', input)]] as const) {
      const response = await fetch(path, options);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Erro interno da API.' } });
    }
  });
});

test('veículos: placas normalizadas, zeros do RENAVAM e limites de ano são preservados', () => {
  assert.equal(validateVeiculo(input).placa, 'ABC1234');
  assert.equal(validateVeiculo({ ...input, placa: 'abc1d23' }).placa, 'ABC1D23');
  assert.equal(validateVeiculo(input).renavam, '00123456789');
  for (const ano of [null, 1000, 9999]) assert.equal(validateVeiculo({ ...input, ano }).ano, ano);
});

test('duplicidades específicas no POST/PUT, inclusive conflitos em veículos diferentes', async () => {
  for (const [rows, code] of [
    [[{ placa: true, renavam: false }], 'DUPLICATE_PLATE'],
    [[{ placa: false, renavam: true }], 'DUPLICATE_RENAVAM'],
    [[{ placa: true, renavam: false }, { placa: false, renavam: true }], 'DUPLICATE_PLATE_AND_RENAVAM'],
  ] as const) {
    await api(call => call.statement.includes('@excludeId') ? [...rows] : existing(call), async (url, calls) => {
      for (const method of ['POST', 'PUT']) {
        const response = await fetch(method === 'PUT' ? `${url}/9` : url, json(method, input));
        assert.equal(response.status, 409);
        assert.equal((await response.json()).error.code, code);
      }
      assert.ok(calls.every(call => call.statement.startsWith('SELECT')));
      const lookups = calls.filter(call => call.statement.includes('@excludeId'));
      assert.deepEqual(lookups.map(call => call.parameters.map(p => p.value)), [
        ['ABC1234', '00123456789', null], ['ABC1234', '00123456789', 9],
      ]);
      assert.match(lookups[1].statement, /id_veiculo <> @excludeId/);
    });
  }
});

test('edição sem alterar placa/RENAVAM ignora o próprio veículo', async () => {
  await api(existing, async (url, calls) => {
    assert.equal((await fetch(`${url}/9`, json('PUT', input))).status, 200);
    const lookup = calls.find(call => call.statement.includes('@excludeId'))!;
    assert.equal(lookup.parameters[2].value, 9);
    assert.match(lookup.statement, /id_veiculo <> @excludeId/);
  });
});

test('conflito concorrente é reconsultado; falha na identificação mantém 409 seguro', async () => {
  for (const number of [2601, 2627]) {
    for (const failLookup of [false, true]) {
      let written = false;
      await api(call => {
        if (/^(INSERT|UPDATE)/.test(call.statement)) { written = true; throw { number }; }
        if (call.statement.includes('@excludeId') && written) {
          if (failLookup) throw new Error('segredo SQL');
          return [{ placa: false, renavam: true }];
        }
        return existing(call);
      }, async url => {
        const response = await fetch(url, json('POST', input));
        assert.equal(response.status, 409);
        const body = await response.json();
        assert.equal(body.error.code, failLookup ? 'DUPLICATE_VEHICLE' : 'DUPLICATE_RENAVAM');
        assert.ok(!JSON.stringify(body).includes('segredo'));
      });
    }
  }
});
