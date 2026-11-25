import express from 'express';
import { validatePostgresServico } from './services/postgres-servico-validation.js';
import type { DatabaseProvider } from './config/postgres.js';
import { normalizeCliente, normalizeLogin, normalizeVeiculo, normalizeDespesa } from './services/unicode.js';
import { errorHandler, HttpError } from './middleware/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { clienteRoutes } from './routes/clientes.js';
import type { ClienteRepository } from './repositories/cliente-repository.js';
import type { VeiculoRepository } from './repositories/veiculo-repository.js';
import { veiculoRoutes } from './routes/veiculos.js';
import type { ServicoRepository } from './repositories/servico-repository.js';
import { servicoRoutes } from './routes/servicos.js';
import { despesaRoutes } from './routes/despesas.js';
import type { DespesaRepository } from './repositories/despesa-repository.js';
import type { FinanceiroRepository } from './repositories/financeiro-repository.js';
import { financeiroRoutes } from './routes/financeiro.js';
import type { AuthConfig } from './config/auth.js';
import type { UsuarioRepository } from './repositories/usuario-repository.js';
import { AuthService } from './services/auth-service.js';
import { sessionMiddleware, originGuard, requireAuth, requireCsrf } from './middleware/auth.js';
import { authRoutes } from './routes/auth.js';
import { mountFrontend } from './frontend.js';

import type { AuthStores } from './services/auth-state.js';
export interface AuthDependencies extends AuthStores { config: AuthConfig; usuarios: UsuarioRepository }

export interface HostingOptions { trustProxy: false | 1; frontendDirectory?: string }
export function createApp(checkDatabase: () => Promise<void>, clientes?: ClienteRepository, veiculos?: VeiculoRepository, servicos?: ServicoRepository, despesas?: DespesaRepository, financeiro?: FinanceiroRepository, auth?: AuthDependencies, hosting: HostingOptions = { trustProxy: false }, provider: DatabaseProvider = 'sqlserver') {
  const app = express();
  app.set('trust proxy', hosting.trustProxy);
  app.disable('x-powered-by');
  app.use('/api/health', healthRoutes(checkDatabase));
  if (auth) {
    const service = new AuthService(auth.usuarios, provider === 'postgres' ? normalizeLogin : undefined);
    app.use('/api', originGuard(auth.config), sessionMiddleware(auth.config, auth.sessionStore));
    app.use('/api/auth', authRoutes(service, auth.config, auth.loginStore));
    app.use('/api', requireAuth(service, auth.config), requireCsrf);
  } else {
    // Falha fechada: montar a aplicação sem autenticação nunca libera negócio.
    app.use('/api', (_req, _res, next) => next(new HttpError(401, 'UNAUTHENTICATED', 'Autenticação necessária.')));
  }
  if (clientes) app.use('/api/clientes', clienteRoutes(clientes, provider === 'postgres' ? normalizeCliente : undefined));
  if (veiculos) app.use('/api/veiculos', veiculoRoutes(veiculos, provider === 'postgres' ? normalizeVeiculo : undefined));
  if (servicos) app.use('/api', servicoRoutes(servicos, provider === 'postgres' ? validatePostgresServico : undefined));
  if (despesas) app.use('/api', despesaRoutes(despesas, provider === 'postgres' ? normalizeDespesa : undefined));
  if (financeiro) app.use('/api', financeiroRoutes(financeiro));
  if (hosting.frontendDirectory) mountFrontend(app, hosting.frontendDirectory);
  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Rota não encontrada.')));
  app.use(errorHandler);
  return app;
}
