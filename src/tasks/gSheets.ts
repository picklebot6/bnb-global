import { google, sheets_v4 } from 'googleapis';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';

const envPath = resolve(__dirname, '../../.env');

if (!process.env.CI && existsSync(envPath)) {
  loadEnvFile(envPath);
}

function required(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Set ${name} in your environment or .env file.`);
  }

  return value;
}

function getSheetsClient(): sheets_v4.Sheets {
  const clientId = required('G_AUTH_CLIENT_ID');
  const clientSecret = required('G_AUTH_CLIENT_SECRET');
  const refreshToken = required('G_AUTH_REFRESH_TOKEN');

  const auth = new google.auth.OAuth2(
    clientId,
    clientSecret,
  );

  auth.setCredentials({
    refresh_token: refreshToken,
  });

  return google.sheets({
    version: 'v4',
    auth,
  });
}

/**
 * Read a range from a Google Sheet.
 *
 * Example:
 *   const rows = await readSheet(
 *     'spreadsheet-id',
 *     'Sheet1!A1:D10',
 *   );
 */
export async function readSheet(
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const sheets = getSheetsClient();

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return (result.data.values ?? []) as string[][];
}

/**
 * Read a range and convert the rows into objects using
 * the first row as the column headers.
 *
 * Example:
 * [
 *   ['Invoice', 'Vendor', 'Amount'],
 *   ['INV-001', 'ABC', '100'],
 * ]
 *
 * becomes:
 * [
 *   {
 *     Invoice: 'INV-001',
 *     Vendor: 'ABC',
 *     Amount: '100',
 *   },
 * ]
 */
export async function readSheetAsObjects(
  spreadsheetId: string,
  range: string,
): Promise<Record<string, string>[]> {
  const rows = await readSheet(spreadsheetId, range);

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0];

  return rows.slice(1).map(row =>
    Object.fromEntries(
      headers.map((header, index) => [
        header,
        row[index] ?? '',
      ]),
    ),
  );
}

/**
 * Write values to a specific range.
 *
 * This replaces the contents of the specified range.
 */
export async function writeSheet(
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean | null)[][],
): Promise<void> {
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values,
    },
  });
}

/**
 * Append rows to the end of a sheet/range.
 */
export async function appendToSheet(
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean | null)[][],
): Promise<void> {
  const sheets = getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values,
    },
  });
}

/**
 * Finds a row using a column header + value,
 * then updates another column in that same row.
 *
 * Assumes row 1 contains the column headers.
 */
export async function updateCellByRowValue(
  spreadsheetId: string,
  sheetName: string,
  searchColumnName: string,
  searchValue: string,
  updateColumnName: string,
  newValue: string | number | boolean | null,
): Promise<void> {
  const sheets = getSheetsClient();

  // Read the entire sheet.
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
  });

  const rows = result.data.values ?? [];

  if (rows.length === 0) {
    throw new Error(`Sheet "${sheetName}" is empty.`);
  }

  const headers = rows[0].map(value =>
    String(value ?? '').trim(),
  );

  const searchColumnIndex = headers.findIndex(
    header => header === searchColumnName,
  );

  if (searchColumnIndex === -1) {
    throw new Error(
      `Column "${searchColumnName}" was not found in sheet "${sheetName}".`,
    );
  }

  const updateColumnIndex = headers.findIndex(
    header => header === updateColumnName,
  );

  if (updateColumnIndex === -1) {
    throw new Error(
      `Column "${updateColumnName}" was not found in sheet "${sheetName}".`,
    );
  }

  // Skip row 1 because it contains the headers.
  const dataRowIndex = rows.slice(1).findIndex(
    row =>
      String(row[searchColumnIndex] ?? '').trim() ===
      searchValue.trim(),
  );

  if (dataRowIndex === -1) {
    throw new Error(
      `Could not find "${searchValue}" in column "${searchColumnName}".`,
    );
  }

  // +1 because we sliced off the header.
  // +1 because Google Sheets rows are 1-based.
  const sheetRow = dataRowIndex + 2;

  const updateColumnLetter = columnIndexToLetter(
    updateColumnIndex,
  );

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!${updateColumnLetter}${sheetRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[newValue]],
    },
  });
}

/**
 * Converts a zero-based column index into a Google Sheets column letter.
 *
 * 0  -> A
 * 1  -> B
 * 25 -> Z
 * 26 -> AA
 */
function columnIndexToLetter(index: number): string {
  let column = '';
  let value = index + 1;

  while (value > 0) {
    const remainder = (value - 1) % 26;

    column =
      String.fromCharCode(65 + remainder) + column;

    value = Math.floor((value - 1) / 26);
  }

  return column;
}

export async function readEntireSheet(
  spreadsheetId: string,
  sheetName: string,
): Promise<string[][]> {
  const sheets = getSheetsClient();

  const result = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
  });

  return (result.data.values ?? []) as string[][];
}