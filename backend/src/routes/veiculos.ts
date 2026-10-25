import { Router, json } from 'express';
import { VeiculoController } from '../controllers/veiculo-controller.js';
import { VeiculoService } from '../services/veiculo-service.js';
import type { VeiculoRepository } from '../repositories/veiculo-repository.js';

export function veiculoRoutes(repository: VeiculoRepository) {
  const router = Router();
  const controller = new VeiculoController(new VeiculoService(repository));
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(json({ limit: '16kb' }));
  router.get('/', controller.list);
  router.get('/:id', controller.find);
  router.post('/', controller.create);
  router.put('/:id', controller.update);
  return router;
}
