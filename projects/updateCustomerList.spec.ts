import { test } from '@playwright/test';
import { main } from '../src/tasksets/updateCustomerList.taskset';

test('run main', async ({ page }) => {
  await main(page);
});
