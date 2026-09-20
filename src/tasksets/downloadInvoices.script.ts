import type { Page } from '@playwright/test';
import { login } from '../tasks/login';
import { downloadInvoice, goToInvoice } from '../tasks/downloadInvoice';
import { sendEmail } from '../tasks/sendEmail';
import { config } from '../config';

export async function main(page: Page): Promise<void> {
  await login(page, config.baseUrl);
  await page.pause();
  await goToInvoice(page);
  // const invoicePdfPath = await downloadInvoice(page, 'OCEAN');


  // // Call additional tasks here, in the order they should run.
  // await sendEmail({
  //   to: 'chloe.kim@bnbglobal.biz',
  //   subject: 'Playwright Email Test',
  //   text: 'This is a test email sent from my Playwright automation.',
  //   attachments: [invoicePdfPath],
  // });
  
  // await page.pause();

}
