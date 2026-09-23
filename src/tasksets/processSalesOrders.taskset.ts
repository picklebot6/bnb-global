import type { Page } from '@playwright/test';
import { login } from '../tasks/login';
import { goToSales, salesOrderExists, setStatusToOpen, processSalesOrder, filterToUser } from '../tasks/processSalesOrders';
import { sendEmail } from '../tasks/sendEmail';
import { config } from '../config';
import { refresh, selectMenu } from '../tasks/general';
import { getSalesOrderUsers } from '../utils/workflowInputs';



export async function main(page: Page): Promise<void> {
  // input users
  const users = getSalesOrderUsers();

  console.log('Selected users:', users);
  console.log(typeof users)

  // login and navigate to invoice list
  await login(page, config.baseUrl);
  await selectMenu(page, "Sales");
  await setStatusToOpen(page);

  // for each user specified
  for (const user of users) {
    if (user !== "all") {
      await filterToUser(page,user);
    }
    while (await salesOrderExists(page)) {
      await processSalesOrder(page);
      // await page.pause();
      await refresh(page);
    }
  }

  await page.pause();


}
