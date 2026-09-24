import type { Page } from '@playwright/test';
import { click, write, wait } from '../helpers/actions';
import { loginSelectors, homeSelectors } from '../helpers/selectors';
import { config } from '../config'

/** Signs in to BNB with the configured credentials and waits for the home page. */
export async function login(page: Page, url: string): Promise<void> {
  const username = process.env.BNB_USERNAME;
  const password = process.env.BNB_PASSWORD;

  if (!username || !password) {
    throw new Error('Set BNB_USERNAME and BNB_PASSWORD in your environment or .env file before running login.');
  }

  await page.goto(url);
  await write(page, 'Username', loginSelectors.username, username);
  await write(page, 'Password', loginSelectors.password, password);
  await click(page, 'Login', loginSelectors.signIn);
  await wait(page, "Invoice Dropdown", homeSelectors.invoiceDropdown);
  await page.waitForTimeout(config.windowChangeDelayMs);
}
