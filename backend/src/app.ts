import express from 'express';
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

export interface AuthDependencies { config: AuthConfig; usuarios: UsuarioRepository }

export function createApp(checkDatabase: () => Promise<void>, clientes?: ClienteRepository, veiculos?: VeiculoRepository, servicos?: ServicoRepository, despesas?: DespesaRepository, financeiro?: FinanceiroRepository, auth?: AuthDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/health', healthRoutes(checkDatabase));
  if (auth) {
    const service = new AuthService(auth.usuarios);
    app.use('/api', originGuard(auth.config), sessionMiddleware(auth.config));
    app.use('/api/auth', authRoutes(service, auth.config));
    app.use('/api', requireAuth(service, auth.config), requireCsrf);
  } else {
    // Falha fechada: montar a aplicação sem autenticação nunca libera negócio.
    app.use('/api', (_req, _res, next) => next(new HttpError(401, 'UNAUTHENTICATED', 'Autenticação necessária.')));
  }
  if (clientes) app.use('/api/clientes', clienteRoutes(clientes));
  if (veiculos) app.use('/api/veiculos', veiculoRoutes(veiculos));
  if (servicos) app.use('/api', servicoRoutes(servicos));
  if (despesas) app.use('/api', despesaRoutes(despesas));
  if (financeiro) app.use('/api', financeiroRoutes(financeiro));
  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Rota não encontrada.')));
  app.use(errorHandler);
  return app;
}
