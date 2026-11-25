import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pool } from 'pg';
import { readDatabaseProvider, readPostgresConfig } from '../src/config/postgres.js';
import { createPersistence } from '../src/database/persistence.js';
import { PostgresDatabase } from '../src/database/postgres.js';
import { SqlDatabase } from '../src/database/connection.js';
import { PostgresVeiculoRepository } from '../src/repositories/postgres-veiculos.js';
import { PostgresServicoRepository } from '../src/repositories/postgres-servicos.js';
import { PostgresDespesaRepository } from '../src/repositories/postgres-despesas.js';
import { PostgresFinanceiroRepository } from '../src/repositories/postgres-financeiro.js';
import { normalizeCliente, normalizeLogin } from '../src/services/unicode.js';
import { PostgresClienteRepository } from '../src/repositories/postgres-clientes.js';
import { diagnostic } from '../src/diagnostics.js';

const env = { PG_HOST: '127.0.0.1', PG_DATABASE: 'synthetic', PG_USER: 'synthetic', PG_PASSWORD: 'test-only' };
test('provedor padrão SQL Server, seleção exclusiva e configuração inválida falha fechada', async () => {
  assert.equal(readDatabaseProvider({}), 'sqlserver');
  assert.throws(() => readDatabaseProvider({ DB_PROVIDER: 'typo' }));
  const sql = createPersistence({});
  const pg = createPersistence({ DB_PROVIDER: 'postgres' });
  assert.ok(sql.database instanceof SqlDatabase);
  assert.ok(pg.database instanceof PostgresDatabase);
  assert.ok(pg.veiculos instanceof PostgresVeiculoRepository);
  assert.ok(pg.servicos instanceof PostgresServicoRepository);
  assert.ok(pg.despesas instanceof PostgresDespesaRepository);
  assert.ok(pg.financeiro instanceof PostgresFinanceiroRepository);
  await assert.rejects(pg.database.check(), /PG_HOST/);
  await sql.database.close(); await pg.database.close();
});
test('PG TLS verifica certificado; plaintext somente loopback/local; configuração isolada', () => {
  assert.deepEqual(readPostgresConfig(env).ssl, { rejectUnauthorized: true });
  assert.equal(readPostgresConfig({ ...env, PG_SSL_MODE: 'disable' }).ssl, false);
  for (const override of [{ APP_MODE: 'hosted', PG_SSL_MODE: 'disable' }, { PG_HOST: 'db.example.test', PG_SSL_MODE: 'disable' },
    { PG_SSL_MODE: 'require' }, { PG_PORT: '0' }, { PG_POOL_MAX: '1.5' }, { PG_HOST: 'postgres://user:secret@host' }]) {
    assert.throws(() => readPostgresConfig({ ...env, ...override }));
  }
  const config = readPostgresConfig({ ...env, PGHOST: 'ignored', PGUSER: 'ignored', PGSSLMODE: 'disable' });
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.user, 'synthetic');
  assert.deepEqual(config.ssl, { rejectUnauthorized: true });
});
test('NFC usa allowlist, preserva dados originais e não altera senhas, hashes ou tokens', () => {
  const value = 'e\u0301';
  const input = { email: value, senha: value, senha_hash: value, token: value, nome_razao_social: value, data_nascimento: value };
  assert.deepEqual(normalizeLogin(input), { ...input, email: 'é' });
  assert.deepEqual(normalizeCliente(input), { ...input, email: 'é', nome_razao_social: 'é' });
  assert.equal(input.email, value);
  assert.equal(normalizeCliente(null), null);
  assert.deepEqual(normalizeCliente(['x']), ['x']);
});
test('PG pool único, concorrência, erro sem replay e encerramento idempotente', async () => {
  let factories = 0, calls = 0, closes = 0;
  const error = Object.assign(new Error('sensitive'), { code: '23505' });
  const pool = { on() {}, async connect() { return { release() {}, async query(sql: string) {
    if (sql.includes('set_config')) return { rows: [] };
    if (sql.includes('pg_settings')) return { rows: [{ setting: '15000' }] };
    calls++; if (calls === 1) throw error; return { rows: [{ ok: true }] };
  } }; }, async end() { closes++; } } as unknown as Pool;
  const database = new PostgresDatabase(() => ({}), () => { factories++; return pool; });
  await assert.rejects(database.check(), error);
  assert.equal(calls, 1);
  await Promise.all([database.check(), database.check()]);
  assert.equal(factories, 1);
  assert.equal(calls, 3);
  await database.close(); await database.close();
  assert.equal(closes, 1);
  await assert.rejects(database.check(), { code: 'ECONNCLOSED' });
});
test('falha de configuração não deixa Promise rejeitada armazenada', async () => {
  let attempts = 0;
  const database = new PostgresDatabase(() => { attempts++; throw new Error('config'); });
  await assert.rejects(database.check()); await assert.rejects(database.check());
  assert.equal(attempts, 2); await database.close();
});
test('PG somente UNIQUE conhecido vira conflito; erro interno nunca é inventado como duplicidade', async () => {
  const data = { tipo_pessoa: 'PF' as const, nome_razao_social: 'Teste', cpf_cnpj: '52998224725', telefone: '000', email: null, data_nascimento: null };
  for (const code of ['23505', '42501', '23503']) {
    const error = { code, constraint: code === '23505' ? 'uq_cliente_cpf_cnpj' : 'sensitive', detail: 'sensitive' };
    const repository = new PostgresClienteRepository({ async query() { throw error; } });
    await assert.rejects(repository.create(data), code === '23505' ? { status: 409, code: 'DUPLICATE_DOCUMENT' } : error);
  }
});
test('diagnóstico PG registra SQLSTATE permitido sem dados privados', () => {
  const original = console.error;
  const before = { node: process.env.NODE_ENV, diagnostics: process.env.SQL_DIAGNOSTICS };
  const logs: string[] = [];
  try {
    process.env.NODE_ENV = 'test'; process.env.SQL_DIAGNOSTICS = 'true';
    console.error = value => logs.push(String(value));
    diagnostic({ code: '42501', message: 'PRIVATE', detail: 'PRIVATE', password: 'PRIVATE', query: 'PRIVATE' }, 'query');
    assert.equal(JSON.parse(logs[0]).errors[0].code, '42501');
    assert.ok(!logs.join('').includes('PRIVATE'));
  } finally {
    console.error = original;
    if (before.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = before.node;
    if (before.diagnostics === undefined) delete process.env.SQL_DIAGNOSTICS; else process.env.SQL_DIAGNOSTICS = before.diagnostics;
  }
});
