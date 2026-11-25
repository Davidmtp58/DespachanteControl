import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testMatch: ['**/navigation.spec.ts', '**/netlify-routing.check.ts'],
  use: { ...base.use, baseURL: 'http://127.0.0.1:4174' },
  webServer: {
    command: 'node ../backend/node_modules/tsx/dist/cli.mjs ../backend/tests/netlify-browser-server.ts',
    url: 'http://127.0.0.1:4174', reuseExistingServer: false,
  },
  outputDir: './test-results/netlify',
});
