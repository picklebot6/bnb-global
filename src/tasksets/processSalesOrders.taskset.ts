import type { Page } from '@playwright/test';
import { login } from '../tasks/login';
import { goToSales, salesOrderExists, setStatusToOpen, processSalesOrder } from '../tasks/processSalesOrders';
import { sendEmail } from '../tasks/sendEmail';
import { config } from '../config';


export async function main(page: Page): Promise<void> {
  // login and navigate to invoice list
  await login(page, config.baseUrl);
  await goToSales(page);

  await setStatusToOpen(page);

  while (salesOrderExists) {
    await processSalesOrder(page);
    //refresh
    await page.pause();
  }



}
