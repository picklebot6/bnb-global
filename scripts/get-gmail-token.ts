import { google } from 'googleapis';
import http from 'node:http';
import { URL } from 'node:url';
import { loadEnvFile } from 'node:process';

loadEnvFile('.env');

const clientId = process.env.SMTP_CLIENT_ID;
const clientSecret = process.env.SMTP_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  throw new Error('SMTP_CLIENT_ID and SMTP_CLIENT_SECRET must be set in .env');
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  'http://localhost:3000/oauth2callback'
);

async function main(): Promise<void> {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://mail.google.com/'],
  });

  console.log('\nOpen this URL in your browser:\n');
  console.log(authUrl);

  const server = http.createServer(async (req, res) => {
    if (!req.url) return;

    const url = new URL(req.url, 'http://localhost:3000');

    if (url.pathname !== '/oauth2callback') return;

    const code = url.searchParams.get('code');

    if (!code) {
      res.end('No authorization code received.');
      return;
    }

    try {
      const { tokens } = await oauth2Client.getToken(code);

      res.end('Authentication successful. You can close this window.');

      console.log('\nAuthentication successful.');
      console.log('\nRefresh token:\n');
      console.log(tokens.refresh_token);

      server.close();
    } catch (error) {
      console.error('Token exchange failed:', error);
      res.end('Authentication failed.');
      server.close();
    }
  });

  server.listen(3000, () => {
    console.log('\nWaiting for Google authorization...');
  });
}

main().catch(console.error);