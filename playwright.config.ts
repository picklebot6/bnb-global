import { defineConfig } from '@playwright/test';
import { config } from './src/config';

export default defineConfig({
  timeout: 120 * 60 * 1_000,
  testDir: './projects',

  use: {
    browserName: 'chromium',
    headless: !!process.env.CI,

    ...(process.env.CI && {
      viewport: {
        width: 1920,
        height: 1080,
      },
    }),

    video: process.env.CI
      ? {
          mode: 'on',
          size: {
            width: 1920,
            height: 1080,
          },
        }
      : 'off',

    baseURL: config.baseUrl,
  },
});
