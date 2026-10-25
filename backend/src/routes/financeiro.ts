import { Router, type RequestHandler } from 'express';
import { FinanceiroController } from '../controllers/financeiro-controller.js';
import { FinanceiroService } from '../services/financeiro-service.js';
import type { FinanceiroRepository } from '../repositories/financeiro-repository.js';

export function financeiroRoutes(repository: FinanceiroRepository) {
  const router = Router();
  const controller = new FinanceiroController(new FinanceiroService(repository));
  const noCache: RequestHandler = (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };
  router.get('/dashboard/resumo', noCache, controller.dashboard);
  router.get('/financeiro/servicos', noCache, controller.list);
  router.get('/servicos/:id/resumo-financeiro', noCache, controller.find);
  return router;
}
