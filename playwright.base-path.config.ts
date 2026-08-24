import { defineConfig, devices } from '@playwright/test';

/*
 * The production configuration, which the main suite cannot cover: GitHub Pages
 * serves a project site from /<repo>, and `npm run preview` serves from the
 * root. A wrong base path is invisible locally and breaks every asset on the
 * live site, so it gets its own build and its own server.
 */
const BASE_PATH = '/Magical-life';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: 'tests/base-path',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://localhost:4180${BASE_PATH}/`,
    ...(executablePath ? { launchOptions: { executablePath } } : {})
  },
  projects: [{ name: 'base-path', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `BASE_PATH=${BASE_PATH} npm run build && BASE_PATH=${BASE_PATH} node scripts/serve-build.mjs`,
    url: `http://localhost:4180${BASE_PATH}/`,
    reuseExistingServer: false,
    timeout: 120_000
  }
});
