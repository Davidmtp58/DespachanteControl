import { test, expect } from '@playwright/test';

test('API rewrite never returns SPA HTML, including root and unknown paths', async ({ request }) => {
  for (const path of ['/api/health', '/api/health/db']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
  }
  for (const path of ['/api', '/api/', '/api/missing', '/api/clientes']) {
    const response = await request.get(path);
    expect(response.status()).toBe(401);
    expect(response.headers()['content-type']).toContain('application/json');
  }
  for (const path of ['/assets/missing.js', '/missing', '/.env']) {
    expect((await request.get(path)).status()).toBe(404);
  }
});
