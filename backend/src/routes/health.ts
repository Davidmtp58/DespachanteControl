import { Router } from 'express';
import { HttpError } from '../middleware/error-handler.js';
import { diagnostic } from '../diagnostics.js';

export function healthRoutes(checkDatabase: () => Promise<void>) {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'despachante-control-api' });
  });
  router.get('/db', async (_req, res) => {
    const started = performance.now();
    try {
      await checkDatabase();
    } catch (error) {
      diagnostic(error, 'health_db', started);
      throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Banco de dados indisponível ou não configurado.');
    }
    res.json({ status: 'ok', database: 'connected' });
  });
  return router;
}
