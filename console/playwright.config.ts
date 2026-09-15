import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100', viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE, args: ['--no-sandbox'] } : {} },
  webServer: { command: 'npm start', url: 'http://127.0.0.1:3100/api/health', reuseExistingServer: !process.env.CI,
    env: { CONSOLE_MODE: 'demo', HOST: '127.0.0.1', PORT: '3100', CLINIC_ID: '11111111-1111-4111-8111-111111111111', NODE_ENV: 'test' } },
});
