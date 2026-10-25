import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diagnostic } from '../src/diagnostics.js';
import { SqlDatabase, type Pool } from '../src/database/connection.js';

async function capture(run: (logs: Record<string, any>[]) => Promise<void>) {
  const original = console.error;
  const env = { mode: process.env.NODE_ENV, enabled: process.env.SQL_DIAGNOSTICS };
  const logs: Record<string, any>[] = [];
  process.env.NODE_ENV = 'development'; process.env.SQL_DIAGNOSTICS = 'true';
  console.error = (value: unknown) => { if (typeof value === 'string' && value.startsWith('{')) logs.push(JSON.parse(value)); };
  try { await run(logs); } finally {
    console.error = original;
    for (const [key, value] of [['NODE_ENV', env.mode], ['SQL_DIAGNOSTICS', env.enabled]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  }
}
const secret = 'PRIVATE_PASSWORD_COOKIE_SQL_PERSON';
const failure = () => Object.assign(new Error(secret), { code: 'ESOCKET', password: secret,
  originalError: { code: 'ECONNRESET', message: secret, token: secret } });

test('diagnóstico usa campos permitidos, correlação e configuração; nunca serializa erro bruto', async () => {
  await capture(async logs => {
    const error = failure();
    diagnostic(error, 'query', performance.now(), { connected: true, size: 2, pending: 1 });
    diagnostic(error, 'http_unhandled');
    assert.equal(logs[0].correlationId, logs[1].correlationId);
    assert.deepEqual(logs[0].errors.map((e: any) => e.code), ['ESOCKET', 'ECONNRESET']);
    assert.equal(logs[0].errors[0].category, 'network');
    assert.ok(logs[0].durationMs >= 0);
    assert.ok(Number.isFinite(Date.parse(logs[0].timestamp)));
    assert.deepEqual(logs[0].pool, { connected: true, size: 2, pending: 1 });
    diagnostic({ code: secret, message: secret, stack: secret, number: 2627 }, 'query');
    assert.equal(logs[2].errors[0].code, 'UNKNOWN');
    assert.equal(logs[2].errors[0].number, 2627);
    assert.ok(!JSON.stringify(logs).includes(secret));
    process.env.NODE_ENV = 'production'; diagnostic(error, 'query');
    process.env.NODE_ENV = 'development'; delete process.env.SQL_DIAGNOSTICS; diagnostic(error, 'query');
    assert.equal(logs.length, 3);
    process.env.SQL_DIAGNOSTICS = 'true';
    const hostile = { get code() { throw new Error(secret); } };
    assert.doesNotThrow(() => diagnostic(hostile, 'query'));
  });
});

test('erro encapsulado pelo driver conserva correlação com evento anterior', async () => {
  await capture(async logs => {
    const original = failure();
    diagnostic(original, 'pool_event');
    diagnostic({ code: 'EREQUEST', originalError: original }, 'query');
    assert.equal(logs[0].correlationId, logs[1].correlationId);
  });
});

test('inicialização rejeitada preserva erro, cleanup e nova tentativa', async () => {
  await capture(async logs => {
    const error = Object.assign(new Error(secret), { code: 'ELOGIN' });
    let attempts = 0;
    const db = new SqlDatabase(() => ({ server: secret }), () => ({
      async connect() { if (++attempts === 1) throw error; },
      async close() {}, on() {}, request() { return { async query() {} }; },
    }));
    await assert.rejects(db.check(), e => e === error);
    await db.check();
    assert.equal(attempts, 2);
    assert.deepEqual(logs.map(l => l.stage), ['pool_init', 'pool_wait']);
    assert.equal(logs[0].correlationId, logs[1].correlationId);
    assert.equal(logs[0].errors[0].code, 'ELOGIN');
    await db.close();
  });
});

test('evento, consulta e encerramento mantêm falhas e não repetem operações', async () => {
  await capture(async logs => {
    const error = failure();
    let listener: (error: Error) => void = () => {};
    let queries = 0;
    const pool: Pool = {
      connected: true, healthy: false, async connect() {}, async close() { throw error; },
      on(_event, callback) { listener = callback; },
      request() { return { input() {}, async query() { queries++; listener(error); throw error; } }; },
    };
    const db = new SqlDatabase(() => ({ server: secret }), () => pool);
    await assert.rejects(db.query(secret, []), e => e === error);
    await assert.rejects(db.check(), e => e === error);
    await assert.rejects(db.close(), e => e === error);
    assert.equal(queries, 2);
    assert.deepEqual(logs.map(l => l.stage), ['pool_event', 'query', 'pool_event', 'query', 'pool_close']);
    assert.equal(new Set(logs.map(l => l.correlationId)).size, 1);
    assert.ok(!JSON.stringify(logs).includes(secret));
  });
});

test('configuração e falha no cleanup são observadas sem substituir erro original', async () => {
  await capture(async logs => {
    const error = failure();
    const db = new SqlDatabase(() => { throw error; });
    await assert.rejects(db.check(), e => e === error);
    assert.deepEqual(logs.map(l => l.stage), ['pool_init', 'pool_wait']);
    logs.length = 0;
    const closing = Object.assign(new Error(secret), { code: 'ETIMEOUT' });
    const other = new SqlDatabase(() => ({ server: secret }), () => ({
      async connect() { throw error; }, async close() { throw closing; }, on() {},
      request() { return { async query() {} }; },
    }));
    await assert.rejects(other.check(), e => e === error);
    assert.deepEqual(logs.map(l => l.stage), ['pool_init', 'pool_close', 'pool_wait']);
    assert.equal(logs[1].errors[0].category, 'timeout');
  });
});
