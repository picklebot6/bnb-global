import { test } from '@playwright/test';
import { main } from '../src/tasksets/downloadInvoices.taskset';

test('run main', async ({ page }) => {
  await main(page);
});
