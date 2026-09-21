import type { Page } from '@playwright/test';
import { login } from '../tasks/login';
import { downloadInvoice, goToInvoice } from '../tasks/downloadInvoice';
import { sendEmail } from '../tasks/sendEmail';
import { config } from '../config';
import { appendToSheet, readEntireSheet, readSheet, updateCellByRowValue } from '../tasks/gSheets';
import { deletePdfs } from '../helpers/actions';

export async function main(page: Page): Promise<void> {
  const spreadsheetId = config.invoicesSheet;
  const customerMappingTab = config.invoicesSheetCustomerMappingTab

  // Read the sheet
  const customerMapping = await readEntireSheet(
    spreadsheetId,
    customerMappingTab,
  );

  console.log('Google Sheets data:');
  console.dir(customerMapping, { depth: null });

  await appendToSheet(
    spreadsheetId,
    customerMappingTab,
    [
      [
        'CUSTOMER A',
        '111111',
        'CA',
        'a@example.com',
        '',
        'Invoice A',
        'Body A',
      ],
      [
        'CUSTOMER B',
        '222222',
        'TX',
        'b@example.com',
        'cc@example.com',
        'Invoice B',
        'Body B',
      ],
    ],
  );
  console.log("appended to sheet")

  // // Test updating a cell
  // await updateCellByRowValue(
  //   spreadsheetId,
  //   'Sheet1',
  //   'Invoice Number',
  //   'INV-002',
  //   'Status',
  //   'Paid',
  // );

  // console.log('Google Sheets update successful.');


  
  await page.pause();

}
