import { defineConfig } from '@playwright/test';
import { config } from './src/config';

export default defineConfig({
  timeout: 15 * 60 * 1_000, // 15 minutes for the entire workflow
  testDir: './projects',
  use: {
    browserName: 'chromium',
    headless: !!process.env.CI,
    video: process.env.CI ? 'on' : 'off',
    baseURL: config.baseUrl,
  },
});
