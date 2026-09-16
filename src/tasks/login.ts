import type { Page } from '@playwright/test';
import { click, write, wait } from '../actions';
import { loginSelectors, homeSelectors } from '../helpers/selectors';

export async function login(page: Page, url: string): Promise<void> {
  const username = process.env.BNB_USERNAME;
  const password = process.env.BNB_PASSWORD;

  if (!username || !password) {
    throw new Error('Set BNB_USERNAME and BNB_PASSWORD in your .env file before running login.');
  }

  await page.goto(url);
  await write(page, 'Username', loginSelectors.username, username);
  await write(page, 'Password', loginSelectors.password, password);
  await click(page, 'Login', loginSelectors.signIn);
  await wait(page, "Invoice Dropdown", homeSelectors.invoiceDropdown);
}
