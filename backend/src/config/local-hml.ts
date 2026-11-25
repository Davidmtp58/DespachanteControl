import { randomBytes } from 'node:crypto';
import { diagnosticConfigFromEnvironment, loadPrivateEnvironment } from '../services/supabase-diagnostic.js';
import { readAuthConfig } from './auth.js';

export function localHmlEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Validate pinned runtime identity, CA and verify-full; never merge process.env.
  diagnosticConfigFromEnvironment(source);
  const env = { ...source, APP_MODE: 'local', NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '3001',
    PG_STATEMENT_TIMEOUT_MS: '15000', SESSION_COOKIE_SECURE: 'false',
    AUTH_ALLOWED_ORIGINS: 'http://127.0.0.1:3001,http://127.0.0.1:5173',
    SESSION_SECRET: source.SESSION_SECRET ?? randomBytes(32).toString('hex') };
  readAuthConfig(env);
  return env;
}

export function loadLocalHmlEnvironment(filename: string) {
  return localHmlEnvironment(loadPrivateEnvironment(filename));
}
