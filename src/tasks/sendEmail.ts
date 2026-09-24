import { access } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { createTransport } from 'nodemailer';

export interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: string[];
  inlineImages?: Array<{
    path: string;
    cid: string;
    filename?: string;
  }>;
}

/** Sends an email with optional CC recipients and local file attachments, returning its message ID. */
export async function sendEmail({
  to,
  cc,
  subject,
  text,
  html,
  attachments = [],
  inlineImages = [],
}: EmailOptions): Promise<string> {
  const envPath = resolve(__dirname, '../../.env');

  if (!process.env.CI && existsSync(envPath)) {
    loadEnvFile(envPath);
  }

  /** Reads one required email configuration value from the environment. */
  function required(name: string): string {
    const value = process.env[name];

    if (!value) {
      throw new Error(`Set ${name} in your environment or .env file.`);
    }

    return value;
  }

  const host = required('SMTP_HOST');
  const user = required('SMTP_USER');
  const clientId = required('G_AUTH_CLIENT_ID');
  const clientSecret = required('G_AUTH_CLIENT_SECRET');
  const refreshToken = required('G_AUTH_REFRESH_TOKEN');

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

  if (
    cc &&
    ((!Array.isArray(cc) && !cc.trim()) ||
      (Array.isArray(cc) && cc.some(address => !address.trim())))
  ) {
    throw new Error('CC contains an empty email recipient.');
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

  const embeddedImages = await Promise.all(
    inlineImages.map(async image => {
      const path = resolve(image.path);
      await access(path, constants.R_OK);

      return {
        filename: image.filename ?? basename(path),
        path,
        cid: image.cid,
        contentDisposition: 'inline' as const,
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

  console.log(
    `Sending email to ${Array.isArray(to) ? to.length : 1} recipient(s), ` +
    `${cc ? (Array.isArray(cc) ? cc.length : 1) : 0} CC recipient(s), ` +
    `with ${files.length} attachment(s) and ${embeddedImages.length} inline image(s)`,
  );

  const result = await transport.sendMail({
    from: user,
    to,
    cc,
    subject,
    text,
    html,
    attachments: [...files, ...embeddedImages],
  });

  if (result.rejected.length > 0) {
    throw new Error(
      'Email was rejected for one or more recipients; others may have received it.',
    );
  }

  console.log('Email accepted by the mail server');

  return result.messageId;
}
