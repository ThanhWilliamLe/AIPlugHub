import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  // Electron can only run one instance per test worker without port conflicts.
  // Using 1 worker keeps tests sequential and avoids resource exhaustion.
  workers: 1,
  use: {
    trace: 'on-first-retry',
  },
});
