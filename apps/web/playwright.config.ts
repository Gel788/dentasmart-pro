import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  use: { baseURL: 'http://localhost:3000', viewport: { width: 1280, height: 900 } },
  // CI has already run `next build`: test that build (fonts are baked in) instead of the dev server,
  // whose Turbopack font loader fails on the runner. Locally the dev server is quicker to start.
  webServer: { command: process.env.CI ? 'pnpm start --port 3000' : 'pnpm dev', port: 3000, reuseExistingServer: !process.env.CI, timeout: 180_000 },
});
