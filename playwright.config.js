import { defineConfig } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false, // one shared in-memory DB; tests build on each other's users, not each other's docs
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Uses installed Google Chrome by default (no browser download). Alternative: `npx playwright install chromium` + PW_CHANNEL=chromium.
    channel: process.env.PW_CHANNEL ?? 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && node server/index.js',
    url: `http://localhost:${PORT}/api/health`,
    env: { PORT: String(PORT), DB_IN_MEMORY: '1' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
