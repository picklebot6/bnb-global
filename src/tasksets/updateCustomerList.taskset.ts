import type { Page } from '@playwright/test';
import { login } from '../tasks/login';
import { config } from '../config';
import { appendToSheet, readEntireSheet, updateRowByValue } from '../tasks/gSheets';
import { selectMenu } from '../tasks/general';
import { click } from '../helpers/actions';
import { customerSelectors } from '../helpers/selectors';
import {
  customerExists,
  findCustomerMapping,
  getCustomerName,
  type CustomerMapping,
  updateCustomerMapping,
} from '../tasks/updateCustomerList';


export async function main(page: Page): Promise<void> {
  const spreadsheetId = config.invoicesSheet;
  const customerMappingTab = config.invoicesSheetCustomerMappingTab

  // Read the sheet
  const customerMapping: Array<Partial<CustomerMapping>> = await readEntireSheet(
    spreadsheetId,
    customerMappingTab,
  );

  // login and navigate to customer list
  await login(page, config.baseUrl);
  await selectMenu(page, "Customer");

  // starting from index 1
  let idx = 1

  async function advanceCustomerIndex(): Promise<void> {
    if (idx === 100) {
      idx = 1;
      await click(page, 'Next Customer Page', customerSelectors.nextPage);
      return;
    }

    idx += 1;
  }

  while (await customerExists(page, idx)) {
    // if customer exists at this idx, get name
    const customerName = await getCustomerName(page, idx);
    const existingCustomer = findCustomerMapping(customerName, customerMapping);
    const isNewCustomer = existingCustomer === undefined;
    const needsUpdated = existingCustomer?.['Needs Update?']?.trim().toUpperCase() === 'TRUE';

    if (existingCustomer && !needsUpdated) {
      console.log(`Skipping ${customerName}: Needs Update? is FALSE`);
      await advanceCustomerIndex();
      continue;
    }

    const updatedCustomerMapping = await updateCustomerMapping(
      page,
      idx,
      customerName,
      customerMapping,
    );
    if (isNewCustomer) {
      await appendToSheet(
        spreadsheetId,
        customerMappingTab,
        updatedCustomerMapping,
      );
      customerMapping.push(updatedCustomerMapping);
      console.log(`Added new customer mapping: ${customerName}`);
    } else if (needsUpdated) {
      await updateRowByValue(
        spreadsheetId,
        customerMappingTab,
        'Customer Name',
        customerName,
        updatedCustomerMapping,
      );

      const existingCustomerIndex = customerMapping.indexOf(existingCustomer);
      customerMapping[existingCustomerIndex] = updatedCustomerMapping;
      console.log(`Overwrote existing customer mapping: ${customerName}`);
    }

    await advanceCustomerIndex();
  }
}
