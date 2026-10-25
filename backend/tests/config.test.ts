import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readDatabaseConfig, readServerConfig } from '../src/config/env.js';

const env = { DB_SERVER: 'localhost', DB_INSTANCE: 'SQLEXPRESS', DB_USER: 'usuario_teste', DB_PASSWORD: 'senha_ficticia' };

test('configuração padrão usa banco existente, TLS e limites de tempo', () => {
  assert.deepEqual(readServerConfig({}), { host: '127.0.0.1', port: 3001 });
  const config = readDatabaseConfig(env);
  assert.equal(config.database, 'DespachanteControl');
  assert.equal(config.port, undefined);
  assert.equal(Object.hasOwn(config, 'port'), false);
  assert.equal(config.options?.instanceName, 'SQLEXPRESS');
  assert.equal(config.options?.encrypt, true);
  assert.equal(config.options?.trustServerCertificate, false);
  assert.equal(config.connectionTimeout, 5000);
  assert.equal(config.requestTimeout, 5000);
});

test('configuração ausente não revela segredos', () => {
  assert.throws(() => readDatabaseConfig({ DB_PASSWORD: 'segredo' }), /^Error: Variável DB_SERVER não configurada\.$/);
  assert.throws(() => readDatabaseConfig({ ...env, DB_PASSWORD: '' }), /DB_PASSWORD não configurada/);
});

test('rejeita portas, booleanos, timeout e pool inválidos', () => {
  for (const PORT of ['0', '-1', '65536', 'abc', '3.5', '']) {
    assert.throws(() => readServerConfig({ PORT }), /PORT/);
    assert.throws(() => readDatabaseConfig({ ...env, DB_INSTANCE: '', DB_PORT: PORT }), /DB_PORT/);
  }
  assert.throws(() => readDatabaseConfig({ ...env, DB_ENCRYPT: 'yes' }), /DB_ENCRYPT/);
  assert.throws(() => readDatabaseConfig({ ...env, DB_POOL_MAX: '0' }), /DB_POOL_MAX/);
  assert.throws(() => readDatabaseConfig({ ...env, DB_REQUEST_TIMEOUT_MS: '0' }), /DB_REQUEST_TIMEOUT_MS/);
  const config = readDatabaseConfig({ ...env, DB_ENCRYPT: 'false', DB_TRUST_SERVER_CERTIFICATE: 'true' });
  assert.equal(config.options?.encrypt, false);
  assert.equal(config.options?.trustServerCertificate, true);
});

test('aceita host com instância e porta explícita como alternativas', () => {
  const named = readDatabaseConfig({ ...env, DB_SERVER: 'localhost\\SQLEXPRESS', DB_INSTANCE: '', DB_PORT: '' });
  assert.equal(named.server, 'localhost');
  assert.equal(named.options?.instanceName, 'SQLEXPRESS');
  assert.equal(Object.hasOwn(named, 'port'), false);
  const fixed = readDatabaseConfig({ ...env, DB_INSTANCE: '', DB_PORT: '51433' });
  assert.equal(fixed.port, 51433);
  assert.equal(fixed.options?.instanceName, undefined);
});

test('rejeita destino ambíguo, ausente ou instância malformada', () => {
  assert.throws(() => readDatabaseConfig({ ...env, DB_PORT: '1433' }), /nunca ambos/);
  assert.throws(() => readDatabaseConfig({ ...env, DB_INSTANCE: '' }), /explicitamente/);
  assert.throws(() => readDatabaseConfig({ ...env, DB_SERVER: 'localhost\\OUTRA' }), /diverge/);
  assert.throws(() => readDatabaseConfig({ ...env, DB_INSTANCE: 'host\\SQLEXPRESS' }), /somente o nome/);
  for (const DB_SERVER of ['localhost\\', 'localhost\\SQLEXPRESS\\extra', '\\SQLEXPRESS']) {
    assert.throws(() => readDatabaseConfig({ ...env, DB_SERVER }), /DB_SERVER/);
  }
});
