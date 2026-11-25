import { Router, json } from 'express';
import { ServicoController } from '../controllers/servico-controller.js';
import { ServicoService } from '../services/servico-service.js';
import type { ServicoRepository } from '../repositories/servico-repository.js';
import type { validateServico } from '../services/servico-validation.js';

export function servicoRoutes(repository: ServicoRepository, validate?: typeof validateServico) {
  const router = Router();
  const controller = new ServicoController(new ServicoService(repository, validate));
  const noCache: import('express').RequestHandler = (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); };
  router.get('/tipos-servico', noCache, controller.types);
  router.use('/servicos', noCache, json({ limit: '16kb' }));
  router.get('/servicos', controller.list);
  router.get('/servicos/:id', controller.find);
  router.post('/servicos', controller.create);
  router.put('/servicos/:id', controller.update);
  return router;
}
