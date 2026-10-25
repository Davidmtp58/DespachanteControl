import { Router, json } from 'express';
import { ClienteController } from '../controllers/cliente-controller.js';
import { ClienteService } from '../services/cliente-service.js';
import type { ClienteRepository } from '../repositories/cliente-repository.js';

export function clienteRoutes(repository: ClienteRepository) {
  const router = Router();
  const controller = new ClienteController(new ClienteService(repository));
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(json({ limit: '16kb' }));
  router.get('/', controller.list);
  router.get('/:id', controller.find);
  router.post('/', controller.create);
  router.put('/:id', controller.update);
  return router;
}
