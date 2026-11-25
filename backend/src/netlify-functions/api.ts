import { createApp } from '../app.js';
import { readAuthConfig } from '../config/auth.js';
import { readDeploymentConfig } from '../config/deployment.js';
import { createPersistence } from '../database/persistence.js';
import { createNetlifyHandler } from '../netlify-adapter.js';
import { createAuthStores } from '../services/auth-state.js';
import { PostgresDatabase } from '../database/postgres.js';

// No dotenv, server.ts, listen(), static files or shutdown hooks here.
// Reuse one application/pool per warm instance, not one per request.
let cached: ReturnType<typeof createNetlifyHandler> | undefined;
export const handler: ReturnType<typeof createNetlifyHandler> = (event, context) => {
  if (!cached) {
    const env = process.env;
    const auth = readAuthConfig(env);
    const hosting = readDeploymentConfig(env);
    const persistence = createPersistence(env);
    const stores = createAuthStores(env, auth.secret, auth.loginWindowMs,
      persistence.database instanceof PostgresDatabase ? persistence.database : undefined, true);
    cached = createNetlifyHandler(createApp(
      () => persistence.database.check(), persistence.clientes, persistence.veiculos,
      persistence.servicos, persistence.despesas, persistence.financeiro,
      { config: auth, usuarios: persistence.usuarios, ...stores },
      { trustProxy: hosting.trustProxy }, persistence.provider,
    ));
  }
  return cached(event, context);
};
