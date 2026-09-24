import type { Page } from '@playwright/test';
import { login } from '../tasks/login';
import {
  downloadInvoice,
  getWorkqueueData,
  type InvoiceWorkqueueItem,
} from '../tasks/downloadInvoice';
import { sendEmail } from '../tasks/sendEmail';
import { config } from '../config';
import { updateCellByRowValue } from '../tasks/gSheets';
import { deletePdfs } from '../helpers/actions';
import { selectMenu } from '../tasks/general';

/** Returns today's date using the BNB team's Pacific timezone. */
function getPacificDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

/** Downloads pending invoices, emails them by customer, then marks their sheet rows sent. */
export async function main(page: Page): Promise<void> {
  // clean up: remove any .pdf files
  await deletePdfs();

  const workqueueData = await getWorkqueueData();

  // login and navigate to invoice list
  await login(page, config.baseUrl);
  await selectMenu(page, "Invoice");

  // for each workqueue item
  for (const wqItem of workqueueData) {
    if (wqItem.hasEmptyCustomerMapping) {
      for (const invoice of wqItem.invoices) {
        await updateCellByRowValue(
          config.invoicesSheet,
          config.invoicesSheetToDoTab,
          'Invoice Number',
          invoice.invoiceNumber,
          'Status',
          'Error',
        );
        console.log(`Marked invoice ${invoice.invoiceNumber} as an error: Customer Mapping is empty`);
      }
      continue;
    }

    const downloadedInvoices: string[] = [];
    const downloadedInvoiceItems: InvoiceWorkqueueItem[] = [];

    // Download invoices that can be selected and record errors for the rest.
    for (const invoice of wqItem.invoices) {
      const pdfPath = await downloadInvoice(page, invoice.invoiceNumber);

      if (pdfPath) {
        downloadedInvoices.push(pdfPath);
        downloadedInvoiceItems.push(invoice);
        continue;
      }

      await updateCellByRowValue(
        config.invoicesSheet,
        config.invoicesSheetToDoTab,
        'Invoice Number',
        invoice.invoiceNumber,
        'Status',
        'Error',
      );
      console.log(`Marked invoice ${invoice.invoiceNumber} as an error`);
    }

    if (downloadedInvoices.length === 0) {
      console.log(`No invoices were downloaded for ${wqItem.customerName}; email not sent`);
      continue;
    }

    //send email
    await sendEmail({
      // to: wqItem["emailTo"],
      to: "chloe.kim@bnbglobal.biz",  //temp only send to test
      cc: wqItem["emailCC"],
      subject: wqItem["emailSubject"],
      text: wqItem["emailBody"],
      html: wqItem.emailHtml,
      attachments: downloadedInvoices,
    });

    const emailSentDate = getPacificDate();
    for (const invoice of downloadedInvoiceItems) {
      await updateCellByRowValue(
        config.invoicesSheet,
        config.invoicesSheetToDoTab,
        'Invoice Number',
        invoice.invoiceNumber,
        'Status',
        'Email Sent',
      );
      await updateCellByRowValue(
        config.invoicesSheet,
        config.invoicesSheetToDoTab,
        'Invoice Number',
        invoice.invoiceNumber,
        'Email Sent Date',
        emailSentDate,
      );
      console.log(`Marked invoice ${invoice.invoiceNumber} as emailed on ${emailSentDate}`);
    }
  }
}
