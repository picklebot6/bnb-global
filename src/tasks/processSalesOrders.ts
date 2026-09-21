import { selectors, type Page } from '@playwright/test';
import { click, write, wait, waitUntilNotExists } from '../helpers/actions';
import { loginSelectors, homeSelectors, salesSelectors } from '../helpers/selectors';

async function waitForLoad(page: Page): Promise<void> {
  await page.waitForTimeout(3000);
  await waitUntilNotExists(page,'Loading/Wait elements', [salesSelectors.loading,salesSelectors.pleaseWait]);
  await page.waitForTimeout(2000);
}

export async function goToSales(page: Page): Promise<void> {
  await click(page, 'Sales Dropdown', homeSelectors.salesDropdown);
  await click(page, 'Sales List Option', homeSelectors.salesOption);
  await page.waitForTimeout(5000);
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

  await page.pause();
}

export async function salesOrderExists(page: Page): Promise<Boolean> {
  const count = await page.locator(salesSelectors.firstSalesOrder).count()
  if (count > 0) {
    return true;
  } else {return false}
}
