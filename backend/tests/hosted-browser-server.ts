// Static hosting fixture only. Browser tests intercept every API request.
// Does not import server.ts, dotenv, database credentials or SQL repositories.
import { createApp } from '../src/app.js';
import { fileURLToPath } from 'node:url';
createApp(async () => { throw new Error('No real database in browser tests'); },
  undefined, undefined, undefined, undefined, undefined, undefined,
  { trustProxy: 1, frontendDirectory: fileURLToPath(new URL('../../frontend/dist/', import.meta.url)) }
).listen(4173, '127.0.0.1');
