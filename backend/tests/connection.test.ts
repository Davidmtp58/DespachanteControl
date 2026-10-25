import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SqlDatabase, type Pool } from '../src/database/connection.js';
import sql from 'mssql';

test('compartilha conexão concorrente, executa somente SELECT e encerra pool', async () => {
  let connections = 0;
  let closes = 0;
  const queries: string[] = [];
  const pool: Pool = {
    async connect() { connections++; await new Promise(resolve => setTimeout(resolve, 10)); },
    async close() { closes++; },
    on() {},
    request() { return { async query(statement) { queries.push(statement); } }; },
  };
  const db = new SqlDatabase(() => ({ server: 'test' }), () => pool);
  await Promise.all([db.check(), db.check(), db.check()]);
  assert.equal(connections, 1);
  assert.deepEqual(queries, Array(3).fill('SELECT 1 AS ok'));
  await db.close();
  await db.close();
  assert.equal(closes, 1);
  await assert.rejects(db.check(), /encerrado/);
});

test('fecha conexão que falhou e permite tentar novamente', async () => {
  let attempts = 0;
  let closes = 0;
  const db = new SqlDatabase(() => ({ server: 'test' }), () => ({
    async connect() { if (++attempts === 1) throw new Error('offline'); },
    async close() { closes++; },
    on() {},
    request() { return { async query() {} }; },
  }));
  await assert.rejects(db.check(), /offline/);
  await db.check();
  assert.equal(attempts, 2);
  assert.equal(closes, 1);
  await db.close();
  assert.equal(closes, 2);
});

test('falha na consulta não é tratada como conexão saudável', async () => {
  const db = new SqlDatabase(() => ({ server: 'test' }), () => ({
    async connect() {}, async close() {}, on() {},
    request() { return { async query() { throw new Error('timeout'); } }; },
  }));
  await assert.rejects(db.check(), /timeout/);
  await db.close();
});

test('executor vincula parâmetros com tipos em um request novo por consulta', async () => {
  const requests: Array<{ inputs: unknown[][]; statement?: string }> = [];
  const db = new SqlDatabase(() => ({ server: 'test' }), () => ({
    async connect() {}, async close() {}, on() {},
    request() {
      const captured: { inputs: unknown[][]; statement?: string } = { inputs: [] };
      requests.push(captured);
      return {
        input(...args: unknown[]) { captured.inputs.push(args); },
        async query(statement: string) { captured.statement = statement; return { recordset: [{ id_cliente: 7 }] }; },
      };
    },
  }));
  const type = sql.Int();
  assert.deepEqual(await db.query('SELECT @id', [{ name: 'id', type, value: 7 }]), [{ id_cliente: 7 }]);
  await db.query('SELECT 1');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].inputs, [['id', type, 7]]);
  assert.equal(requests[0].statement, 'SELECT @id');
  assert.deepEqual(requests[1].inputs, []);
  await db.close();
});
