// Local rewrite simulator driven by netlify.toml. NOT the Netlify runtime.
// No persistence factory, .env loading or real database access.
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { createNetlifyHandler } from '../src/netlify-adapter.js';

const config = readFileSync(new URL('../../netlify.toml', import.meta.url), 'utf8');
const rules = config.split('[[redirects]]').slice(1).map(section => ({
  from: /from = "([^"]+)"/.exec(section)![1], to: /to = "([^"]+)"/.exec(section)![1],
}));
const handler = createNetlifyHandler(createApp(async () => { /* mock healthy database */ }));
const root = fileURLToPath(new URL('../../frontend/dist/', import.meta.url));
const server = express();
server.use(express.text({ type: () => true }));
server.use(async (req, res, next) => {
  const path = req.path.replace(/\/$/, '') || '/';
  const rule = rules.find(r => r.from.endsWith('/*') ? path.startsWith(r.from.slice(0, -1)) : r.from === path);
  if (!rule) return next();
  if (rule.to === '/index.html') { res.sendFile(root + 'index.html'); return; }
  const target = rule.to.replace(':splat', path.slice('/api/'.length));
  const result = await handler({ path: target, httpMethod: req.method, headers: req.headers,
    body: typeof req.body === 'string' ? req.body : null, queryStringParameters: req.query,
    requestContext: { identity: { sourceIp: '127.0.0.1' } } }, {}) as {
      statusCode: number; headers: Record<string,string>; multiValueHeaders?: Record<string,string[]>;
      body: string; isBase64Encoded?: boolean;
    };
  res.status(result.statusCode).set(result.headers);
  for (const [name, values] of Object.entries(result.multiValueHeaders ?? {})) res.setHeader(name, values);
  res.end(result.isBase64Encoded ? Buffer.from(result.body, 'base64') : result.body);
});
server.use(express.static(root, { dotfiles: 'deny' }));
server.use((_req, res) => { res.status(404).send('Not found'); });
server.listen(4174, '127.0.0.1');
