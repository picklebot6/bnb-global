import type { Page } from '@playwright/test';
import { login } from '../tasks/login';
import { goToSales, salesOrderExists, setStatusToOpen, processSalesOrder, filterToUser } from '../tasks/processSalesOrders';
import { sendEmail } from '../tasks/sendEmail';
import { config } from '../config';
import { refresh, selectMenu } from '../tasks/general';


export async function main(page: Page): Promise<void> {
  // login and navigate to invoice list
  await login(page, config.baseUrl);
  await selectMenu(page, "Sales");
  await setStatusToOpen(page);
  await filterToUser(page,"chloe");

  // while (await salesOrderExists(page)) {
  //   await processSalesOrder(page);
  //   // await page.pause();
  //   await refresh(page);
  // }

}
