import { defineConfig, devices } from '@playwright/test';

// Playwright runs only the E2E layer. Unit + integration live in Vitest.
//
// Critical paths are tagged @critical and run on every push as a fast
// safety net. The full suite runs on PRs and nightly.
//
// The web server is assumed to be running on :5173 (frontend dev) + the
// backend on :4000 with a seeded test DB. Two ways:
//   - `PLAYWRIGHT_WEB_URL=http://localhost:5173` (default) + start
//     servers manually / via CI
//   - `PLAYWRIGHT_WEB_URL=https://staging.example.com` for smoke tests
//     against a real env
const BASE_URL = process.env.PLAYWRIGHT_WEB_URL || 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Tests should be deterministic. Retry once in CI to paper over the
  // rare network/timing hiccup; zero retries locally so flake surfaces
  // immediately instead of hiding.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Hebrew locale + RTL reflect the primary user.
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    colorScheme: 'light',
    // Shared cookie jar produced by tests/e2e/global-setup.ts. One login
    // at startup, reused across all workers — eliminates parallel login
    // contention against the test backend.
    storageState: './tests/e2e/.auth/state.json',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox + WebKit only run on CI nightly / PR label to keep PR
    // runs fast. Enable by setting PLAYWRIGHT_FULL_MATRIX=1.
    ...(process.env.PLAYWRIGHT_FULL_MATRIX === '1'
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
          { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
        ]
      : []),
  ],
});
