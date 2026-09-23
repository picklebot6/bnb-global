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
  elementWaitTimeoutMs: 5_000,
  yesElementNotExistTimeoutMs: 2500,
  elementNotExistTimeoutMs: 60_000,
  preActionDelayMs: 500,
  actionDelayMs: 1_000,
  windowChangeDelayMs: 5000,
  baseUrl,
  invoicesSheet: "1gAlqu4ZREO_Jdw72CK85-yFUq5CbzCM-7MR9_fUqnYk",
  invoicesSheetCustomerMappingTab: "Customer Mapping",
  invoicesSheetToDoTab: "Invoices 2026",
  invoicesSheetEmailTab: "Email",
};
