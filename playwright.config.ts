import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const raid = process.env.RAID_E2E === '1';

/** Firebase emulator settings for the raid e2e (see `npm run e2e:raid`). */
const raidEnv: Record<string, string> = raid
  ? {
      USE_FIREBASE_EMULATORS: 'true',
      FIREBASE_API_KEY: 'fake-api-key',
      FIREBASE_AUTH_DOMAIN: 'localhost',
      FIREBASE_DATABASE_URL: 'http://127.0.0.1:9000/?ns=demo-inboxorcist',
      FIREBASE_PROJECT_ID: 'demo-inboxorcist',
      FIREBASE_APP_ID: 'demo-app',
    }
  : {};

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /demo\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run build && node dist/server/server/index.js',
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PORT: String(PORT), ...raidEnv },
  },
});
