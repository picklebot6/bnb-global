import { type Page } from '@playwright/test';
import { click, write, wait, waitUntilNotExists } from '../helpers/actions';
import { homeSelectors, salesSelectors } from '../helpers/selectors';
import { waitForLoad } from '../helpers/actions';
import { config } from '../config'

export async function goToSales(page: Page): Promise<void> {
  await click(page, 'Sales Dropdown', homeSelectors.salesDropdown);
  await click(page, 'Sales List Option', homeSelectors.salesOption);
  await page.waitForTimeout(config.windowChangeDelayMs);
  await wait(page,'Status Dropdown', salesSelectors.statusDropdown);
}

export async function setStatusToOpen(page: Page): Promise<void> {
  await click(page,'Status Dropdown',salesSelectors.statusDropdown);
  await click(page,'Open Status Option',salesSelectors.statusOpenOption);
  await waitForLoad(page);
}

export async function processSalesOrder(page: Page): Promise<void> {
  // open sales item
  await click(page,'First Sales Order Item',salesSelectors.firstSalesOrder);
  await waitForLoad(page)
  // save
  await click(page,'Save',salesSelectors.saveButton);
  try {
    await click(page,'Yes',salesSelectors.yesButton);
  } catch {
    console.log("No A/R alert")
  }
  await waitForLoad(page)
  // Pick Request
  await click(page,'Pick Request',salesSelectors.pickRequestButton);
  await click(page,'Yes',salesSelectors.yesButton);
  await waitForLoad(page)
  // save
  await click(page,'Save',salesSelectors.saveButtonPickList);
  await waitForLoad(page)
  // acct approve
  await click(page,'Acct Approve',salesSelectors.acctApprove);
  await click(page,'Yes',salesSelectors.yesButton);
  await waitForLoad(page)
  //qty approve
  await click(page,'Qty Approve',salesSelectors.qtyApprove);
  await click(page,'Yes',salesSelectors.yesButton);
  await waitForLoad(page)

  //close
  await click(page,'Close Pick List',salesSelectors.closePickList);
  await page.waitForTimeout(config.windowChangeDelayMs);
}

export async function refreshList(page: Page): Promise<void> {
  await click(page, 'Sales Dropdown', homeSelectors.salesDropdown);
  await click(page, 'Sales List Option', homeSelectors.salesOption);
  await page.waitForTimeout(config.windowChangeDelayMs);
  await wait(page,'Status Dropdown', salesSelectors.statusDropdown);
}

export async function filterToUser(page: Page, user: string): Promise<void> {
  await write(page, `Entered by ${user}`, salesSelectors.enteredByUser, user);
    await page.keyboard.press('Enter');
    await waitForLoad(page);
}

export async function salesOrderExists(page: Page): Promise<Boolean> {
  const count = await page.locator(salesSelectors.firstSalesOrder).count()
  if (count > 0) {
    console.log("At least one sales order exists")
    return true;
  } else {
    console.log("No sales order exists")
    return false
  }
}
