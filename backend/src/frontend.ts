import express, { type Express } from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function mountFrontend(app: Express, directory: string) {
  const root = resolve(directory);
  const index = resolve(root, 'index.html');
  if (!existsSync(index)) throw new Error('Build React ausente. Execute o build hospedado antes de iniciar.');
  const assets = express.static(root, { dotfiles: 'deny', index: false, redirect: false });
  app.use((req, res, next) => {
    if (/^\/api(?:\/|$)/i.test(req.path)) return next();
    return assets(req, res, next);
  });
  // Only known browser routes receive HTML. API errors and missing assets stay 404.
  app.get(/^\/(?:login|dashboard|clientes|veiculos|servicos|despesas)?\/?$/, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(index);
  });
}
