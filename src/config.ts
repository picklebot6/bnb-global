import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';

loadEnvFile(resolve(__dirname, '../.env'));

const baseUrl = process.env.BNB_BASE_URL;
if (!baseUrl) {
  throw new Error('Set BNB_BASE_URL in your .env file before running the workflow.');
}

export const config = {
  elementWaitTimeoutMs: 15_000,
  preActionDelayMs: 500,
  actionDelayMs: 1_000,
  baseUrl,
};
