import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { click, write, wait, waitForLoad } from '../helpers/actions';
import { homeSelectors, invoiceSelectors } from '../helpers/selectors';
import { config } from '../config';
import { readEntireSheet } from './gSheets';
import { createInvoiceEmailHtml, createInvoiceEmailText } from '../templates/invoiceEmail';


export interface InvoiceWorkqueueItem {
  invoiceAddedDate: string;
  invoiceNumber: string;
  customerName: string;
  status: string;
  emailTo: string;
  emailSentDate: string;
  notes: string;
}

export interface WorkqueueItem {
  customerName: string;
  hasEmptyCustomerMapping: boolean;
  emailTo: string[];
  emailCC: string[];
  emailBody: string;
  emailHtml: string;
  invoices: InvoiceWorkqueueItem[];
}

/** Opens the Invoice list and waits until its search control is ready. */
export async function goToInvoice(page: Page): Promise<void> {
  await click(page, 'Invoice Dropdown', homeSelectors.invoiceDropdown);
  await click(page, 'Invoice Option', homeSelectors.invoiceOption);
  await wait(page, 'Invoice Label', homeSelectors.invoiceLabel);
  await click(page, 'Invoice Label', homeSelectors.invoiceLabel);
  await page.waitForTimeout(5000);
  await wait(page,'Invoice Search',invoiceSelectors.invSearch);
}

/**
 * Downloads one invoice as a PDF and returns its file path. Returns undefined
 * when the invoice search result cannot be selected.
 */
export async function downloadInvoice(page: Page, invNumber: string): Promise<string | undefined> {
  await write(page, 'Invoice Number', invoiceSelectors.invSearch, invNumber);
  await page.keyboard.press('Enter');
  await waitForLoad(page);

  const invoiceResult = page.locator(`xpath=${invoiceSelectors.invoiceNum(invNumber)}`);
  try {
    await invoiceResult.click({ timeout: 1000 });
  } catch {
    console.log(`Invoice ${invNumber} could not be selected`);
    return undefined;
  }

  await waitForLoad(page);

  // Print Invoice opens a separate page containing the printable document.
  await click(page, 'Print Dropdown', invoiceSelectors.printDropdown);
  const printablePagePromise = page.waitForEvent('popup');
  await click(page, 'Print Invoice', invoiceSelectors.printInvoice);
  await click(page, 'Print Button', invoiceSelectors.printButton);
  const printablePage = await printablePagePromise;
  await printablePage.waitForLoadState('domcontentloaded');

  // Do not click the page's Print button. It opens Chrome's native print
  // preview, which is browser UI and cannot be controlled by Playwright.
  const automaticFileName = await printablePage.title();
  const safeFileName = automaticFileName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '') || `${invNumber}-invoice`;
  const pdfFileName = safeFileName.toLowerCase().endsWith('.pdf')
    ? safeFileName
    : `${safeFileName}.pdf`;
  const outputDirectory = resolve(process.cwd(), 'output/pdf');
  const pdfPath = resolve(outputDirectory, pdfFileName);

  try {
    await mkdir(outputDirectory, { recursive: true });
    await printablePage.pdf({
      path: pdfPath,
      format: 'A4',
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="box-sizing: border-box; display: flex; font-family: Arial, sans-serif;
                    font-size: 8px; justify-content: space-between; padding: 0 10mm;
                    width: 100%;">
          <span class="date"></span>
          <span class="title"></span>
        </div>
      `,
      footerTemplate: `
        <div style="box-sizing: border-box; display: flex; font-family: Arial, sans-serif;
                    font-size: 8px; justify-content: space-between; padding: 0 10mm;
                    width: 100%;">
          <span class="url"></span>
          <span><span class="pageNumber"></span>/<span class="totalPages"></span></span>
        </div>
      `,
      margin: {
        top: '15mm',
        bottom: '15mm',
        left: '10mm',
        right: '10mm',
      },
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await printablePage.close();
  }

  console.log(`Invoice PDF saved to ${pdfPath}`);

  // close invoice
  await click(page,'Close Invoice', invoiceSelectors.closeInvoice)
  return pdfPath;
}

/** Builds customer email groups from pending invoice rows and sheet mappings. */
export async function getWorkqueueData(): Promise<WorkqueueItem[]> {
  const spreadsheetId = config.invoicesSheet;

  const toDoList = await readEntireSheet(
    spreadsheetId,
    config.invoicesSheetToDoTab,
  );

  const customerMapping = await readEntireSheet(
    spreadsheetId,
    config.invoicesSheetCustomerMappingTab,
  );

  const workqueueMap = new Map<string, WorkqueueItem>();

  for (const item of toDoList) {
    if (item.Status !== 'Pending') {
      continue;
    }

    const customerName = item.Customer;
    const invoiceNumber = item['Invoice Number'];

    if (!customerName || !invoiceNumber) {
      continue;
    }

    let workqueueItem = workqueueMap.get(customerName);

    if (!workqueueItem) {
      const customer = customerMapping.find(
        mapping => mapping['Customer Name'] === customerName,
      );

      const emailTo = customer?.['Email Test']
        ?.split(',')
        .map(email => email.trim())
        .filter(Boolean) ?? [];

      workqueueItem = {
        customerName,
        hasEmptyCustomerMapping: emailTo.length === 0,
        emailTo,
        emailCC: customer?.['Email CC']
          ? customer['Email CC']
              .split(',')
              .map(email => email.trim())
              .filter(Boolean)
          : [],
        emailBody: createInvoiceEmailText(),
        emailHtml: createInvoiceEmailHtml(),
        invoices: [],
      };

      workqueueMap.set(customerName, workqueueItem);
    }

    workqueueItem.invoices.push({
      invoiceAddedDate: item['Invoice Added Date'] ?? '',
      invoiceNumber,
      customerName,
      status: item.Status ?? '',
      emailTo: item['Email To'] ?? '',
      emailSentDate: item['Email Sent Date'] ?? '',
      notes: item.Notes ?? '',
    });
  }

  return Array.from(workqueueMap.values());
}
