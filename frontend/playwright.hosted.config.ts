import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4173' },
  webServer: {
    command: 'node ../backend/node_modules/tsx/dist/cli.mjs ../backend/tests/hosted-browser-server.ts',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
  outputDir: './test-results/hosted',
});
