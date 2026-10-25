import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthConfig } from '../config/auth.js';
import type { AuthService } from '../services/auth-service.js';
import { AuthController } from '../controllers/auth-controller.js';
import { requireAuth, requireCsrf } from '../middleware/auth.js';
import { HttpError } from '../middleware/error-handler.js';

export function authRoutes(service: AuthService, config: AuthConfig) {
  const router = Router();
  const controller = new AuthController(service, config);
  router.post('/login', rateLimit({ windowMs: config.loginWindowMs, limit: config.loginLimit,
    standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, res) => { res.status(429).json({ error: { code: 'LOGIN_RATE_LIMIT', message: 'Muitas tentativas. Tente novamente mais tarde.' } }); },
  }), (req, _res, next) => {
    if (req.get('X-Requested-With') !== 'DespachanteControl' || !req.is('application/json')) {
      return next(new HttpError(400, 'INVALID_LOGIN_REQUEST', 'Envie JSON com o cabeçalho X-Requested-With: DespachanteControl.'));
    }
    next();
  }, json({ limit: '2kb' }), controller.login);
  router.get('/me', requireAuth(service, config), controller.me);
  router.post('/logout', requireAuth(service, config), requireCsrf, controller.logout);
  return router;
}
