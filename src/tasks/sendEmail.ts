import { access } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createTransport } from 'nodemailer';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text: string;
  attachments?: string[];
}

/** Send an email with optional local file attachments. Returns the message ID. */
export async function sendEmail({
  to,
  subject,
  text,
  attachments = [],
}: EmailOptions): Promise<string> {
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

  const host = required('SMTP_HOST');
  const user = required('SMTP_USER');
  const clientId = required('SMTP_CLIENT_ID');
  const clientSecret = required('SMTP_CLIENT_SECRET');
  const refreshToken = required('SMTP_REFRESH_TOKEN');

  const from = process.env.SMTP_FROM || user;
  const port = Number(process.env.SMTP_PORT || '587');

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('SMTP_PORT must be an integer between 1 and 65535.');
  }

  if (
    !to.length ||
    (Array.isArray(to) && to.some(address => !address.trim()))
  ) {
    throw new Error('Provide at least one email recipient.');
  }

  const files = await Promise.all(
    attachments.map(async file => {
      const path = resolve(file);
      await access(path, constants.R_OK);

      return {
        filename: basename(path),
        path,
      };
    }),
  );

  const transport = createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: {
      type: 'OAuth2',
      user,
      clientId,
      clientSecret,
      refreshToken,
    },
    disableUrlAccess: true,
    connectionTimeout: 30_000,
    socketTimeout: 60_000,
  });

  console.log(`Sending email with ${files.length} attachment(s)`);

  const result = await transport.sendMail({
    from,
    to,
    subject,
    text,
    attachments: files,
  });

  if (result.rejected.length > 0) {
    throw new Error(
      'Email was rejected for one or more recipients; others may have received it.',
    );
  }

  console.log('Email accepted by the mail server');

  return result.messageId;
}