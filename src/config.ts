import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

const envPath = resolve(__dirname, '../.env');
if (!process.env.CI && existsSync(envPath)) {
  loadEnvFile(envPath);
}

const baseUrl = process.env.BNB_BASE_URL;
if (!baseUrl) {
  throw new Error('Set BNB_BASE_URL in your environment or .env file before running the workflow.');
}

export const config = {
  elementWaitTimeoutMs: 15_000,
  preActionDelayMs: 500,
  actionDelayMs: 1_000,
  baseUrl,
};
