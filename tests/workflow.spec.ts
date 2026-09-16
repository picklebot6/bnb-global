import { test } from '@playwright/test';
import { main } from '../src/main';

test('run main', async ({ page }) => {
  await main(page);
});
