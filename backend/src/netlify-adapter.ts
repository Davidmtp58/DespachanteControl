import serverless from 'serverless-http';
import type { Express } from 'express';

// The Express application retains /api routes. Netlify also exposes a direct
// function URL; normalize only that exact prefix, never arbitrary paths.
export function createNetlifyHandler(app: Express) {
  const invoke = serverless(app);
  return (event: Parameters<typeof invoke>[0], context: Parameters<typeof invoke>[1]) => {
    const prefix = '/.netlify/functions/api';
    const path = (event as { path?: unknown }).path;
    if (typeof path === 'string' && (path === prefix || path.startsWith(prefix + '/'))) {
      event = { ...event, path: '/api' + path.slice(prefix.length) };
    }
    return invoke(event, context);
  };
}
