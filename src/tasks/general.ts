import type { Page } from '@playwright/test';
import { click, write, wait } from '../helpers/actions';
import { salesSelectors, invoiceSelectors, homeSelectors } from '../helpers/selectors';
import { waitForLoad } from '../helpers/actions';

export async function selectMenu(page: Page, menu: string): Promise<void> {
  if (menu == "Invoice") {
    await click(page, 'Invoice Dropdown', homeSelectors.invoiceDropdown);
    await click(page, 'Invoice Option', homeSelectors.invoiceOption);
    await wait(page, 'Invoice Label', homeSelectors.invoiceLabel);
    await click(page, 'Invoice Label', homeSelectors.invoiceLabel);
    await page.waitForTimeout(5000);
    await wait(page,'Invoice Search',invoiceSelectors.invSearch);
  } else if (menu == "Sales") {
    await click(page, 'Sales Dropdown', homeSelectors.salesDropdown);
    await click(page, 'Sales List Option', homeSelectors.salesOption);
    await page.waitForTimeout(5000);
    await wait(page,'Status Dropdown', salesSelectors.statusDropdown);
  }
}

export async function refresh(page: Page): Promise<void> {
  await click(page, 'Refresh List', homeSelectors.refresh);
  await waitForLoad(page);
}
