import type { Page } from '@playwright/test';
import { click, write, wait } from '../actions';
import { loginSelectors, homeSelectors } from '../helpers/selectors';

export async function doInvoice(page: Page): Promise<void> {
  await click(page, 'Invoice Dropdown', homeSelectors.invoiceDropdown);
  await click(page, 'Invoice Option', homeSelectors.invoiceOption);
  await wait(page, 'Invoice Label', homeSelectors.invoiceLabel);
  await click(page, 'Invoice Label', homeSelectors.invoiceLabel);
  await page.pause();

  await page.waitForTimeout(5000);
}
