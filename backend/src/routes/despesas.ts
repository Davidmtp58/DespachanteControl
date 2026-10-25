import { Router, json, type RequestHandler } from 'express';
import { DespesaController } from '../controllers/despesa-controller.js';
import { DespesaService } from '../services/despesa-service.js';
import type { DespesaRepository } from '../repositories/despesa-repository.js';

export function despesaRoutes(repository: DespesaRepository) {
  const router = Router();
  const controller = new DespesaController(new DespesaService(repository));
  const noCache: RequestHandler = (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };
  router.get('/servicos/:id/despesas', noCache, controller.byService);
  router.use('/despesas', noCache, json({ limit: '16kb' }));
  router.get('/despesas', controller.list);
  router.get('/despesas/:id', controller.find);
  router.post('/despesas', controller.create);
  router.put('/despesas/:id', controller.update);
  router.delete('/despesas/:id', controller.delete);
  return router;
}
