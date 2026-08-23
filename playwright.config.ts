import { defineConfig, devices } from '@playwright/test';

/*
 * WebKit is not optional: a large share of Magic players are on iPhones, and
 * Safari's IndexedDB and pointer behaviour differ from Chromium's. It runs in
 * CI, where the runner installs it; locally we test what is installed.
 */
/* Escape hatch for sandboxes and CI images that ship their own Chromium build. */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const chromium = executablePath ? { launchOptions: { executablePath } } : {};

const webkit = process.env.CI ? [{ name: 'mobile-safari', use: { ...devices['iPhone 13'] } }] : [];

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'], colorScheme: 'dark', ...chromium } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], colorScheme: 'light', ...chromium } },
    ...webkit
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
