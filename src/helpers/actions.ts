import { test, type Page } from '@playwright/test';
import { config } from '../config';
import { readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { salesSelectors } from '../helpers/selectors';


export async function wait(
  page: Page,
  name: string,
  xpath: string,
  state: 'visible' | 'attached' = 'visible',
) {
  const element = page.locator(`xpath=${xpath}`);
  await test.step(`Wait for: ${name}`, async () => {
    console.log(`Waiting for ${name} to be ${state}`);
    await element.waitFor({
      state,
      timeout:
        name === 'Yes'
          ? config.yesElementNotExistTimeoutMs
          : config.elementNotExistTimeoutMs,
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

export type ReadElement = 'text' | 'value';

/** Read either an element's rendered text or its form value. */
export async function read(
  page: Page,
  name: string,
  xpath: string,
  readElement: ReadElement,
): Promise<string> {
  return test.step(`Read: ${name}`, async () => {
    const element = await wait(
      page,
      name,
      xpath,
      readElement === 'value' ? 'attached' : 'visible',
    );
    console.log(`Reading ${readElement} from ${name}`);
    const value = readElement === 'value'
      ? await element.inputValue()
      : await element.innerText();
    await page.waitForTimeout(config.actionDelayMs);
    return value;
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

export async function waitForLoad(page: Page): Promise<void> {
  await page.waitForTimeout(3000);
  await waitUntilNotExists(page,'Loading/Wait elements', [salesSelectors.loading,salesSelectors.pleaseWait]);
  await page.waitForTimeout(1000);
}
