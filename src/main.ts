import type { Page } from '@playwright/test';
import { login } from './tasks/login';
import { doInvoice } from './tasks/invoice';
import { config } from './config';

export async function main(page: Page): Promise<void> {
  await login(page, config.baseUrl);
  await doInvoice(page);

  // Call additional tasks here, in the order they should run.
}
