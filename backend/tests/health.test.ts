import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { createApp } from '../src/app.js';
import { errorHandler } from '../src/middleware/error-handler.js';

async function withServer(app: ReturnType<typeof express>, run: (url: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
}

test('API saudável sem consultar o banco; rotas desconhecidas retornam JSON 404', async () => {
  let calls = 0;
  await withServer(createApp(async () => { calls++; throw new Error('offline'); }), async url => {
    const response = await fetch(`${url}/api/health`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'despachante-control-api' });
    assert.equal(calls, 0);
    const missing = await fetch(`${url}/missing`);
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).error.code, 'NOT_FOUND');
  });
});

test('health/db aguarda a consulta antes de confirmar sucesso (banco simulado)', async () => {
  let done = false;
  await withServer(createApp(async () => { await new Promise(resolve => setTimeout(resolve, 10)); done = true; }), async url => {
    const response = await fetch(`${url}/api/health/db`);
    assert.equal(response.status, 200);
    assert.equal(done, true);
    assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' });
  });
});

test('falha do banco retorna 503 sem expor detalhes e mantém API disponível', async () => {
  await withServer(createApp(async () => { throw new Error('password=segredo host=privado'); }), async url => {
    const response = await fetch(`${url}/api/health/db`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados indisponível ou não configurado.' },
    });
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
  });
});

test('erro inesperado retorna 500 genérico', async () => {
  const app = express();
  app.get('/failure', async () => { throw new Error('segredo'); });
  app.use(errorHandler);
  await withServer(app, async url => {
    const response = await fetch(`${url}/failure`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: { code: 'INTERNAL_ERROR', message: 'Erro interno da API.' } });
  });
});
