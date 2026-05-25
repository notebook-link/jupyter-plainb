import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  snapshotDir: '.',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60 * 1000,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4477',
    trace: 'off',
    video: 'retain-on-failure'
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.04
    }
  }
});
