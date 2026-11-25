import type { RequestHandler } from 'express';
import { randomBytes } from 'node:crypto';
import type { AuthConfig } from '../config/auth.js';
import { AuthService, credentialVersion, publicUser } from '../services/auth-service.js';
import { COOKIE_NAME, destroySession } from '../middleware/auth.js';

export class AuthController {
  constructor(private readonly service: AuthService, private readonly config: AuthConfig) {}
  login: RequestHandler = async (req, res) => {
    const user = await this.service.login(req.body);
    try {
      await new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
      req.session.userId = user.id_usuario;
      req.session.credentialVersion = credentialVersion(user);
      req.session.csrfToken = randomBytes(32).toString('hex');
      req.session.expiresAt = Date.now() + this.config.ttlMs;
      await new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    } catch (error) {
      // Do not auto-save a failed login session again when Express ends the error
      // response, and do not issue its cookie. No retry of an uncertain write.
      req.session = null!;
      throw error;
    }
    res.json({ usuario: publicUser(user), csrfToken: req.session.csrfToken });
  };
  me: RequestHandler = (req, res) => { res.json({ usuario: res.locals.usuario, csrfToken: req.session.csrfToken }); };
  logout: RequestHandler = async (req, res) => {
    await destroySession(req);
    res.clearCookie(COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'strict', secure: this.config.secureCookie });
    res.status(204).end();
  };
}
