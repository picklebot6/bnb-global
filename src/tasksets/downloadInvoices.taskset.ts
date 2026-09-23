import type { Page } from '@playwright/test';
import { login } from '../tasks/login';
import { downloadInvoice, getWorkqueueData, goToInvoice } from '../tasks/downloadInvoice';
import { sendEmail } from '../tasks/sendEmail';
import { config } from '../config';
import { readEntireSheet, readSheet, updateCellByRowValue, appendToSheet } from '../tasks/gSheets';
import { deletePdfs } from '../helpers/actions';
import { selectMenu } from '../tasks/general';

export async function main(page: Page): Promise<void> {
  // clean up: remove any .pdf files
  await deletePdfs();

  const workqueueData = await getWorkqueueData();
  console.log(workqueueData)
  //test adding a row
  await appendToSheet(
    config.invoicesSheet,
    config.invoicesSheetCustomerMappingTab,
    {
      'Customer Name': 'customer test',
      'Customer No': 'number test',
      'State': 'CA',
      'Email To': 'chloe.kim@bnbglobal.biz',
      'Email CC': '',
      'test': ''
    },
  );
  await page.pause();


  console.log('Google Sheets update successful.');

  // login and navigate to invoice list
  await login(page, config.baseUrl);
  await selectMenu(page, "Invoice");

  // for each workqueue item
  for (const wqItem of workqueueData) {
    let downloadedInvoices = [];

    // push each downloaded invoice to attachment array
    for (const invoiceNumber of wqItem["invoices"]) {
      downloadedInvoices.push(await downloadInvoice(page, invoiceNumber))
    }


    //send email
    await sendEmail({
      to: wqItem["emailTo"],
      cc: wqItem["emailCC"],
      subject: wqItem["emailSubject"],
      text: wqItem["emailBody"],
      attachments: downloadedInvoices,
    });

    await page.pause();

      // update status of corresponding invoices that were downloaded
      // await updateCellByRowValue(
      //   spreadsheetId,
      //   'Sheet1',
      //   'Invoice Number',
      //   'INV-002',
      //   'Status',
      //   'Paid',
      // );


  }


  
  await page.pause();

}
