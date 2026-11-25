import { config as loadDefaultEnv } from 'dotenv';
import { loadLocalHmlEnvironment } from './config/local-hml.js';
import { createApp } from './app.js';
import { readServerConfig } from './config/env.js';
import { createPersistence } from './database/persistence.js';
import { readAuthConfig } from './config/auth.js';
import { readDeploymentConfig } from './config/deployment.js';
import { fileURLToPath } from 'node:url';
import { createAuthStores } from './services/auth-state.js';
import { PostgresDatabase } from './database/postgres.js';

let env: NodeJS.ProcessEnv;
try {
  const args = process.argv.slice(2);
  if (args.length === 2 && args[0] === '--hml-env-file') env = loadLocalHmlEnvironment(args[1]);
  else if (!args.length) { loadDefaultEnv(); env = process.env; }
  else throw new Error('Arguments');
} catch {
  console.error('Inicialização interrompida. Verifique arquivo privado, destino HML, TLS e configuração da sessão.');
  process.exit(1);
}
const persistence = createPersistence(env);
const { database } = persistence;
const { host, port } = readServerConfig(env);
const deployment = readDeploymentConfig(env);
const authConfig = readAuthConfig(env);
const stores = createAuthStores(env, authConfig.secret, authConfig.loginWindowMs, database instanceof PostgresDatabase ? database : undefined);
const server = createApp(() => database.check(), persistence.clientes, persistence.veiculos, persistence.servicos, persistence.despesas, persistence.financeiro, { config: authConfig, usuarios: persistence.usuarios, ...stores }, {
  trustProxy: deployment.trustProxy,
  ...(deployment.hosted ? { frontendDirectory: fileURLToPath(new URL('../../frontend/dist/', import.meta.url)) } : {}),
}, persistence.provider).listen(port, host, () => {
  console.info(`API disponível em http://${host}:${port}`);
});

server.on('error', () => {
  console.error('Não foi possível iniciar o servidor HTTP. Verifique HOST e PORT.');
  process.exitCode = 1;
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 15000);
  deadline.unref();
  server.close(async (error) => {
    try {
      await database.close();
      process.exitCode = error ? 1 : 0;
    } catch {
      console.error('Erro ao encerrar o pool SQL Server.');
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
