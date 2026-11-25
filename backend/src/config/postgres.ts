import { readFileSync } from 'node:fs';
import type { PoolConfig } from 'pg';

export type DatabaseProvider = 'sqlserver' | 'postgres';
export function readDatabaseProvider(env = process.env): DatabaseProvider {
  const provider = env.DB_PROVIDER ?? 'sqlserver';
  if (provider !== 'sqlserver' && provider !== 'postgres') throw new Error('DB_PROVIDER inválido.');
  return provider;
}
export function readPostgresConfig(env = process.env): PoolConfig {
  const required = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`Configure ${name}.`);
    return value;
  };
  const integer = (name: string, fallback: number, max: number) => {
    const raw = env[name] ?? String(fallback);
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > max) throw new Error(`${name} inválido.`);
    return Number(raw);
  };
  const host = required('PG_HOST');
  if (!/^[a-zA-Z0-9.:-]+$/.test(host)) throw new Error('PG_HOST inválido.');
  const mode = env.PG_SSL_MODE ?? 'verify-full';
  if (!['verify-full', 'disable'].includes(mode)) throw new Error('PG_SSL_MODE inválido.');
  if (mode === 'disable' && ((env.APP_MODE ?? 'local') !== 'local' || !['127.0.0.1', '::1', 'localhost'].includes(host))) {
    throw new Error('TLS obrigatório fora do PostgreSQL local.');
  }
  let ca: string | undefined;
  if (env.PG_SSL_CA_FILE) {
    if (mode === 'disable') throw new Error('CA exige TLS.');
    try { ca = readFileSync(env.PG_SSL_CA_FILE, 'utf8'); }
    catch { throw new Error('Não foi possível ler PG_SSL_CA_FILE.'); }
  }
  return {
    host, port: integer('PG_PORT', 5432, 65535), database: required('PG_DATABASE'),
    user: required('PG_USER'), password: required('PG_PASSWORD'),
    ssl: mode === 'disable' ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: integer('PG_POOL_MAX', 10, 100), connectionTimeoutMillis: integer('PG_CONNECTION_TIMEOUT_MS', 5000, 300000),
    idleTimeoutMillis: integer('PG_IDLE_TIMEOUT_MS', 30000, 300000),
    statement_timeout: integer('PG_STATEMENT_TIMEOUT_MS', 15000, 300000),
    application_name: 'despachante-control', options: '-c timezone=UTC',
  };
}
