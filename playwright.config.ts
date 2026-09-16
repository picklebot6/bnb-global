import { defineConfig } from '@playwright/test';
import { config } from './src/config';

export default defineConfig({
  timeout: 15 * 60 * 1_000, // 15 minutes for the entire workflow
  testDir: './tests',
  use: {
    browserName: 'chromium',
    headless: false,
    baseURL: config.baseUrl,
  },
});
