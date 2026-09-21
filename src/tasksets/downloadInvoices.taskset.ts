import type { Page } from '@playwright/test';
import { login } from '../tasks/login';
import { downloadInvoice, goToInvoice } from '../tasks/downloadInvoice';
import { sendEmail } from '../tasks/sendEmail';
import { config } from '../config';
import { readEntireSheet, readSheet, updateCellByRowValue } from '../tasks/gSheets';
import { deletePdfs } from '../helpers/actions';

export async function main(page: Page): Promise<void> {
  // clean up: remove any .pdf files
  await deletePdfs();

  const spreadsheetId = 'YOUR_SPREADSHEET_ID';

  // Read the sheet
  const rows = await readEntireSheet(
    spreadsheetId,
    'Sheet1!A1:D10',
  );

  console.log('Google Sheets data:');
  console.dir(rows, { depth: null });

  // Test updating a cell
  await updateCellByRowValue(
    spreadsheetId,
    'Sheet1',
    'Invoice Number',
    'INV-002',
    'Status',
    'Paid',
  );

  console.log('Google Sheets update successful.');

  // login and navigate to invoice list
  await login(page, config.baseUrl);
  await goToInvoice(page);

  // download invoice
  const invoicePdfPath = await downloadInvoice(page, 'OM98996');

  //send email
  await sendEmail({
    to: 'chloe.kim@bnbglobal.biz',
    subject: 'Playwright Email Test',
    text: 'This is a test email sent from my Playwright automation.',
    attachments: [invoicePdfPath],
  });
  
  await page.pause();

}
