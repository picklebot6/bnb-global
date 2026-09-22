import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { click, write, wait } from '../helpers/actions';
import { homeSelectors, invoiceSelectors } from '../helpers/selectors';
import { config } from '../config';
import { readEntireSheet } from './gSheets';


interface WorkqueueItem {
  customerName: string;
  emailTo: string[];
  emailCC: string[];
  emailSubject: string;
  emailBody: string;
  invoices: string[];
}


export async function goToInvoice(page: Page): Promise<void> {
  await click(page, 'Invoice Dropdown', homeSelectors.invoiceDropdown);
  await click(page, 'Invoice Option', homeSelectors.invoiceOption);
  await wait(page, 'Invoice Label', homeSelectors.invoiceLabel);
  await click(page, 'Invoice Label', homeSelectors.invoiceLabel);
  await page.waitForTimeout(5000);
  await wait(page,'Invoice Search',invoiceSelectors.invSearch);
}

export async function downloadInvoice(page: Page, invNumber: string): Promise<string> {
  await write(page, 'Invoice Number', invoiceSelectors.invSearch, invNumber);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(5000);
  await click(page, 'Searched Invoice No', invoiceSelectors.invoiceNum(invNumber));

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

  const emailFormat = await readEntireSheet(
    spreadsheetId,
    config.invoicesSheetEmailTab,
  );

  const emailTemplate = emailFormat[0];

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

      if (!customer) {
        throw new Error(
          `No customer mapping found for "${customerName}".`,
        );
      }

      workqueueItem = {
        customerName,
        emailTo: customer['Email To']
          .split(',')
          .map(email => email.trim())
          .filter(Boolean),
        emailCC: customer['Email CC']
          ? customer['Email CC']
              .split(',')
              .map(email => email.trim())
              .filter(Boolean)
          : [],
        emailSubject: emailTemplate.Subject.replace(
          '{customerName}',
          customerName,
        ),
        emailBody: emailTemplate.Body,
        invoices: [],
      };

      workqueueMap.set(customerName, workqueueItem);
    }

    workqueueItem.invoices.push(invoiceNumber);
  }

  return Array.from(workqueueMap.values());
}