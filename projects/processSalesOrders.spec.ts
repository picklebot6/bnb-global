import { test } from '@playwright/test';
import { main } from '../src/tasksets/downloadInvoices.script';

test('run main', async ({ page }) => {
  await main(page);
});
