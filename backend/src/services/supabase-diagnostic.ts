import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { Client, type ClientConfig } from 'pg';
import { readPostgresConfig } from '../config/postgres.js';

const projectRoot = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));

export function diagnosticConfig(source: string): ClientConfig {
  // parse returns an isolated object: no dotenv/config, process.env merge or mutation.
  const env = parse(source);
  return diagnosticConfigFromEnvironment(env);
}

export function diagnosticConfigFromEnvironment(env: NodeJS.ProcessEnv): ClientConfig {
  if (env.DB_PROVIDER !== 'postgres' || env.PG_SSL_MODE !== 'verify-full' || !env.PG_SSL_CA_FILE ||
      !path.isAbsolute(env.PG_SSL_CA_FILE) || env.PG_HOST !== 'aws-0-us-east-2.pooler.supabase.com' ||
      env.PG_PORT !== '5432' || env.PG_DATABASE !== 'postgres' ||
      env.PG_USER !== 'dc_runtime.zhonseyahndqlzoygolr') {
    throw new Error('Invalid isolated HML configuration.');
  }
  const config = readPostgresConfig(env);
  return { ...config,
    // Read-only from startup, then also explicitly within the dedicated transaction.
    options: '-c timezone=UTC -c default_transaction_read_only=on',
  };
}

export function loadPrivateEnvironment(filename: string): NodeJS.ProcessEnv {
  if (!path.isAbsolute(filename)) throw new Error('An absolute private path is required.');
  const actual = realpathSync(filename);
  const relative = path.relative(projectRoot, actual);
  if ((!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) ||
      actual.split(/[\\/]/).some(part => /^onedrive(?:\s*-.*)?$/i.test(part))) {
    throw new Error('Private file must be outside project and OneDrive.');
  }
  return parse(readFileSync(actual, 'utf8'));
}

export function loadDiagnosticConfig(filename: string): ClientConfig {
  return diagnosticConfigFromEnvironment(loadPrivateEnvironment(filename));
}

export interface DiagnosticClient {
  connect(): Promise<unknown>;
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<unknown>;
  on(event: 'error', handler: () => void): unknown;
}
const selectFields = (row: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.map(key => [key, row[key]]));
const timeoutQuery = "SELECT name, setting, unit, source, reset_val FROM pg_settings WHERE name = 'statement_timeout'";
const timeoutFields = ['name', 'setting', 'unit', 'source', 'reset_val'];

export async function runDiagnostic(config: ClientConfig,
  factory: (config: ClientConfig) => DiagnosticClient = config => new Client(config)) {
  const client = factory(config);
  let failed = false;
  client.on('error', () => { failed = true; });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const identity = (await client.query(`SELECT current_database() AS database_name,
      current_user AS user_name, session_user AS session_user,
      current_setting('server_version') AS server_version,
      current_setting('client_encoding') AS client_encoding,
      current_setting('TimeZone') AS timezone,
      current_setting('statement_timeout') AS statement_timeout,
      current_setting('transaction_read_only') AS transaction_read_only`)).rows[0];
    if (identity?.database_name !== 'postgres' || identity.user_name !== 'dc_runtime' ||
        identity.session_user !== 'dc_runtime' || identity.transaction_read_only !== 'on' ||
        identity.client_encoding !== 'UTF8') throw new Error('Unexpected identity or session.');
    const before = (await client.query(timeoutQuery)).rows[0];
    if (before?.name !== 'statement_timeout' || before.unit !== 'ms') throw new Error('Missing timeout metadata.');
    // Transaction-local only: no ALTER DATABASE/ROLE or persistent session change.
    await client.query("SET LOCAL statement_timeout = '15s'");
    const shown = (await client.query('SHOW statement_timeout')).rows[0]?.statement_timeout;
    const local = (await client.query(timeoutQuery)).rows[0];
    if (shown !== '15s' || local?.setting !== '15000' || local.unit !== 'ms') {
      throw new Error('Transaction timeout was not applied.');
    }
    const counts = (await client.query(`SELECT
      (SELECT count(*)::text FROM app.tipo_servico) AS tipos_servico,
      (SELECT count(*)::text FROM app.usuario) AS usuarios`)).rows[0];
    const summary = (await client.query(`SELECT receita_total::numeric(38,2)::text AS receita_total,
      custos_totais::numeric(38,2)::text AS custos_totais,
      resultado_liquido::numeric(38,2)::text AS resultado_liquido,
      quantidade_servicos::text AS quantidade_servicos,
      servicos_em_andamento::text AS servicos_em_andamento
      FROM app.vw_dashboard_resumo`)).rows[0];
    await client.query('ROLLBACK');
    const restored = (await client.query(timeoutQuery)).rows[0];
    if (restored?.setting !== before.setting || restored.unit !== before.unit || restored.reset_val !== before.reset_val) {
      throw new Error('Timeout was not restored after rollback.');
    }
    if (failed) throw new Error('Connection failed.');
    return {
      tls: 'Connection succeeded with certificate and hostname verification required',
      connection: selectFields(identity, ['database_name', 'user_name', 'session_user', 'server_version',
        'client_encoding', 'timezone', 'statement_timeout', 'transaction_read_only']),
      timeout: {
        requested_startup_ms: config.statement_timeout,
        before: selectFields(before, timeoutFields),
        show_after_set_local: shown,
        local: selectFields(local, timeoutFields),
        after_rollback: selectFields(restored, timeoutFields),
        restored: true,
      },
      counts: selectFields(counts, ['tipos_servico', 'usuarios']),
      summary: selectFields(summary, ['receita_total', 'custos_totais', 'resultado_liquido', 'quantidade_servicos', 'servicos_em_andamento']),
    };
  } finally {
    // Disconnect also rolls back an open transaction on any failure. No retry.
    await client.end();
  }
}
