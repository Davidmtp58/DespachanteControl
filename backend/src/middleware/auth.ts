import session from 'express-session';
import createMemoryStore from 'memorystore';
import type { Request, RequestHandler } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { AuthConfig } from '../config/auth.js';
import { HttpError } from './error-handler.js';
import type { AuthService } from '../services/auth-service.js';

declare module 'express-session' {
  interface SessionData { userId: number; credentialVersion: string; csrfToken: string; expiresAt: number }
}
export const COOKIE_NAME = 'dc.sid';
export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
}
export function sessionMiddleware(config: AuthConfig) {
  const Store = createMemoryStore(session);
  return session({ name: COOKIE_NAME, secret: config.secret, resave: false, saveUninitialized: false,
    store: new Store({ checkPeriod: 60000, max: 1000 }),
    cookie: { httpOnly: true, sameSite: 'strict', secure: config.secureCookie, path: '/', maxAge: config.ttlMs } });
}

export function originGuard(config: AuthConfig): RequestHandler {
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.get('Origin');
    if (origin) {
      if (!config.origins.includes(origin)) return next(new HttpError(403, 'ORIGIN_FORBIDDEN', 'Origem não permitida.'));
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.vary('Origin');
    }
    if (req.method === 'OPTIONS') {
      if (!origin) return next(new HttpError(403, 'ORIGIN_FORBIDDEN', 'Origem não permitida.'));
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, X-Requested-With');
      res.status(204).end(); return;
    }
    next();
  };
}

export function requireAuth(service: AuthService, config: AuthConfig): RequestHandler {
  return async (req, res, next) => {
    const { userId, credentialVersion, expiresAt } = req.session;
    const user = userId && credentialVersion && expiresAt && expiresAt > Date.now()
      ? await service.current(userId, credentialVersion) : undefined;
    if (!user) {
      await destroySession(req);
      res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'strict', secure: config.secureCookie });
      throw new HttpError(401, 'UNAUTHENTICATED', 'Autenticação necessária.');
    }
    res.locals.usuario = user;
    next();
  };
}
export const requireCsrf: RequestHandler = (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const supplied = req.get('X-CSRF-Token') ?? '';
  const expected = req.session.csrfToken ?? '';
  if (!expected || !/^[a-f0-9]{64}$/.test(supplied) || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return next(new HttpError(403, 'CSRF_INVALID', 'Token CSRF inválido.'));
  }
  next();
};
