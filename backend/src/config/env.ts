import type { config as SqlConfig } from 'mssql';

type Environment = Record<string, string | undefined>;

function integer(env: Environment, key: string, fallback?: number, max = 2147483647): number {
  const value = env[key] ?? String(fallback);
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1 || number > max) {
    throw new Error(`Variável ${key} deve ser um inteiro entre 1 e ${max}.`);
  }
  return number;
}

function boolean(env: Environment, key: string, fallback: boolean): boolean {
  const value = env[key];
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Variável ${key} deve ser true ou false.`);
}

function required(env: Environment, key: string): string {
  const value = env[key];
  if (!value?.trim()) throw new Error(`Variável ${key} não configurada.`);
  return value;
}

export function readServerConfig(env: Environment = process.env) {
  const host = env.HOST?.trim() || '127.0.0.1';
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    throw new Error('HOST deve ser um endereço de loopback nesta etapa local.');
  }
  return { host, port: integer(env, 'PORT', 3001, 65535) };
}

// Avaliado somente ao verificar o banco: a API pode iniciar sem credenciais.
export function readDatabaseConfig(env: Environment = process.env): SqlConfig {
  const parts = required(env, 'DB_SERVER').trim().split('\\');
  const server = parts[0];
  const inlineInstance = parts[1]?.trim();
  const configuredInstance = env.DB_INSTANCE?.trim();
  if (!server || parts.length > 2 || (parts.length === 2 && !inlineInstance)) {
    throw new Error('DB_SERVER deve conter um host ou host\\instancia.');
  }
  if (inlineInstance && configuredInstance && inlineInstance.toLowerCase() !== configuredInstance.toLowerCase()) {
    throw new Error('Instância em DB_SERVER diverge de DB_INSTANCE.');
  }
  const instanceName = configuredInstance || inlineInstance;
  if (instanceName && /[\\,;\s]/.test(instanceName)) {
    throw new Error('DB_INSTANCE deve conter somente o nome da instância.');
  }
  const hasPort = Boolean(env.DB_PORT?.trim());
  if (instanceName && hasPort) {
    throw new Error('Configure DB_INSTANCE (ou host\\instancia) ou DB_PORT, nunca ambos.');
  }
  if (!instanceName && !hasPort) {
    throw new Error('Configure DB_INSTANCE ou DB_PORT explicitamente.');
  }
  return {
    server,
    ...(hasPort ? { port: integer(env, 'DB_PORT', undefined, 65535) } : {}),
    database: env.DB_DATABASE === undefined ? 'DespachanteControl' : required(env, 'DB_DATABASE'),
    user: required(env, 'DB_USER'),
    password: required(env, 'DB_PASSWORD'),
    connectionTimeout: integer(env, 'DB_CONNECTION_TIMEOUT_MS', 5000),
    requestTimeout: integer(env, 'DB_REQUEST_TIMEOUT_MS', 5000),
    pool: {
      max: integer(env, 'DB_POOL_MAX', 10),
      min: 0,
      idleTimeoutMillis: integer(env, 'DB_POOL_IDLE_TIMEOUT_MS', 30000),
      acquireTimeoutMillis: integer(env, 'DB_CONNECTION_TIMEOUT_MS', 5000),
    },
    options: {
      ...(instanceName ? { instanceName } : {}),
      encrypt: boolean(env, 'DB_ENCRYPT', true),
      trustServerCertificate: boolean(env, 'DB_TRUST_SERVER_CERTIFICATE', false),
    },
  };
}
