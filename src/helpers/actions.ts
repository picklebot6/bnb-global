import { test, type Page } from '@playwright/test';
import { config } from '../config';
import { readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function wait(page: Page, name: string, xpath: string) {
  const element = page.locator(`xpath=${xpath}`);
  await test.step(`Wait for: ${name}`, async () => {
    console.log(`Waiting for ${name} to be visible`);
    await element.waitFor({
      state: 'visible',
      timeout: config.elementWaitTimeoutMs,
    });
  });
  await page.waitForTimeout(config.preActionDelayMs);
  return element;
}

export async function waitUntilNotExists(
  page: Page,
  name: string,
  xpaths: string | string[],
): Promise<void> {
  await test.step(`Wait until gone: ${name}`, async () => {
    const xpathList = Array.isArray(xpaths) ? xpaths : [xpaths];

    console.log(`Waiting for ${name} to no longer exist`);

    await Promise.all(
      xpathList.map(xpath =>
        page.locator(`xpath=${xpath}`).waitFor({
          state: 'detached',
          timeout: config.elementNotExistTimeoutMs,
        }),
      ),
    );

    await page.waitForTimeout(config.actionDelayMs);
  });
}

/** Replace the contents of an input, textarea, or editable element. */
export async function write(
  page: Page,
  name: string,
  xpath: string,
  value: string,
): Promise<void> {
  await test.step(`Write: ${name}`, async () => {
    const element = await wait(page, name, xpath);
    console.log(`Writing to ${name}`);
    await element.fill(value);
    await page.waitForTimeout(config.actionDelayMs);
  });
}

/** Click the element matched by the XPath. */
export async function click(
  page: Page,
  name: string,
  xpath: string,
): Promise<void> {
  await test.step(`Click: ${name}`, async () => {
    const element = await wait(page, name, xpath);
    console.log(`Clicking ${name}`);
    await element.click();
    await page.waitForTimeout(config.actionDelayMs);
  });
}

/** Read an element's rendered text. For form field values, use inputValue(). */
export async function read(
  page: Page,
  name: string,
  xpath: string,
): Promise<string> {
  return test.step(`Read: ${name}`, async () => {
    const element = await wait(page, name, xpath);
    console.log(`Reading ${name}`);
    const text = await element.innerText();
    await page.waitForTimeout(config.actionDelayMs);
    return text;
  });
}

//clean up pdfs
export async function deletePdfs(): Promise<void> {
  const pdfDir = resolve('output/pdf');

  try {
    const files = await readdir(pdfDir);

    await Promise.all(
      files
        .filter(file => file.toLowerCase().endsWith('.pdf'))
        .map(file => unlink(resolve(pdfDir, file))),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
