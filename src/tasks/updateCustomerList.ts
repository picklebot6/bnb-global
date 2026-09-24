import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { click, write, wait, read, waitForLoad } from '../helpers/actions';
import { customerSelectors, invoiceSelectors } from '../helpers/selectors';
import { config } from '../config';
import { readEntireSheet } from './gSheets';
import { customsearch } from 'googleapis/build/src/apis/customsearch';


export type CustomerMapping = {
  'Customer Name': string;
  'Needs Update?': string;
  State: string;
  'Email To': string;
  'Email CC'?: string;
  'Email Test': string;
};

/** Combines existing mapping values with customer data extracted from BNB. */
function buildCustomerMapping(
  customerName: string,
  existingCustomer?: Partial<CustomerMapping>,
  extractedValues?: Pick<CustomerMapping, 'State' | 'Email To'>,
): CustomerMapping {
  return {
    'Customer Name': customerName,
    'Needs Update?': existingCustomer?.['Needs Update?'] ?? '',
    State: extractedValues?.State ?? existingCustomer?.State ?? '',
    'Email To': extractedValues?.['Email To'] ?? existingCustomer?.['Email To'] ?? '',
    'Email CC': existingCustomer?.['Email CC'] ?? '',
    'Email Test': 'chloe.kim@bnbglobal.biz',
  };
}

/** Returns the existing sheet mapping for a customer, if one exists. */
export function findCustomerMapping(
  customerName: string,
  customerMapping: Array<Partial<CustomerMapping>>,
): Partial<CustomerMapping> | undefined {
  const normalizedCustomerName = customerName.trim();

  return customerMapping.find(
    customer => customer['Customer Name']?.trim() === normalizedCustomerName,
  );
}


/** Returns whether a customer row exists at the supplied index on the current page. */
export async function customerExists(page: Page, idx: number): Promise<boolean> {
  if (await page.locator(customerSelectors.customerName(idx)).count() > 0) {
    return true;
  } else { return false; }
}

/** Reads the customer name at the supplied row index. */
export async function getCustomerName(page: Page, idx: number): Promise<string> {
  const customerName = await read(page, 'Customer Name', customerSelectors.customerName(idx), 'text');
  return customerName
}

/**
 * Returns each distinct contact email address whose Email_Invoice box is checked
 * in the currently open Contact Info grid.
 */
export async function getInvoiceEmailAddresses(page: Page): Promise<string[]> {
  const contactGrid = page
    .locator('.x-grid3')
    .filter({ has: page.locator('.x-grid3-hd-inner', { hasText: 'Email_Invoice' }) })
    .first();
  const contactRows = contactGrid.locator('.x-grid3-row');
  const contactInfoNoData = page.locator(`xpath=${customerSelectors.contactInfoNoData}`);

  const contactInfoState = await Promise.race([
    contactRows.first().waitFor({
      state: 'visible',
      timeout: config.elementWaitTimeoutMs,
    }).then(() => 'rows' as const),
    contactInfoNoData.waitFor({
      state: 'visible',
      timeout: config.elementWaitTimeoutMs,
    }).then(() => 'empty' as const),
  ]);

  if (contactInfoState === 'empty') {
    console.log('Contact Info has no data; using a blank Email To value');
    return [];
  }

  const emailAddresses = await contactGrid.evaluate((grid) => {
    const headerCells = Array.from(grid.querySelectorAll('.x-grid3-unlocked .x-grid3-hd-row td'));
    const headerNames = headerCells.map((cell) => cell.textContent?.trim() ?? '');
    const emailColumnIndex = headerNames.findIndex((header) => header === 'Email');
    const invoiceColumnIndex = headerNames.findIndex((header) => header.startsWith('Email_Invoice'));

    if (emailColumnIndex === -1 || invoiceColumnIndex === -1) {
      throw new Error('The Contact Info grid is missing the Email or Email_Invoice column.');
    }

    return Array.from(grid.querySelectorAll('.x-grid3-unlocked .x-grid3-body > .x-grid3-row'))
      .filter((row) => {
        const cells = row.querySelectorAll('td');
        return cells[invoiceColumnIndex]?.querySelector('.x-grid3-check-col-on') !== null;
      })
      .map((row) => row.querySelectorAll('td')[emailColumnIndex]?.textContent?.trim() ?? '')
      .filter((email): email is string => email.length > 0);
  });

  const uniqueEmails = new Map<string, string>();
  for (const email of emailAddresses) {
    uniqueEmails.set(email.toLowerCase(), email);
  }

  return [...uniqueEmails.values()];
}

/** Extracts BNB customer data and returns its completed mapping for sheet storage. */
export async function updateCustomerMapping(
  page: Page,
  idx: number,
  customerName: string,
  customerMapping: Array<Partial<CustomerMapping>>,
): Promise<CustomerMapping> {
  const existingCustomer = findCustomerMapping(customerName, customerMapping);
  const isNewCustomer = existingCustomer === undefined;

  console.log(
    isNewCustomer
      ? `New customer: ${customerName}`
      : `Existing customer mapping: ${customerName}`,
  );

  if (
    existingCustomer &&
    existingCustomer['Needs Update?']?.trim().toUpperCase() === 'FALSE'
  ) {
    console.log(`Skipping ${customerName}: Needs Update? is FALSE`);
    return buildCustomerMapping(customerName, existingCustomer);
  }

  // get email addresses
  await click(page,`Click onto customer at idx ${idx}`, customerSelectors.customerName(idx));
  await waitForLoad(page);
  const state = await read(page, 'Read State', customerSelectors.state, 'value');
  await click(page, 'Open Contact Info', customerSelectors.contactInfo);
  const emails = await getInvoiceEmailAddresses(page);
  const emailTo = emails.length > 0 ? emails.join(', ') : '';
  const updatedCustomerMapping = buildCustomerMapping(
    customerName,
    existingCustomer,
    {
      State: state,
      'Email To': emailTo,
    },
  );

  console.log(`Extracted customer mapping for ${customerName}`);
  await click(page, 'Close Contact Info', customerSelectors.closeContact);
  await click(page, 'Close Customer Form', customerSelectors.closeForm);
  return updatedCustomerMapping;
}
