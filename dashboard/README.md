# BNB Automation Dashboard

A small responsive PWA for triggering and monitoring the `bnb-global` GitHub Actions workflows.

## Included workflows

- `downloadInvoices.yml` on `main`
- `processSalesOrders.yml` on `main`

## Architecture

Browser/PWA -> Cloudflare Worker -> GitHub Actions API -> Playwright workflows

The GitHub token is stored only as a Cloudflare Worker secret. The frontend never contains it.

## Local setup

```bash
npm install
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SESSION_SECRET
npm run dev
```

For local development, the Worker will proxy API requests and serve the static files.

## GitHub token permissions

Create a fine-grained PAT for the `picklebot6/bnb-global` repository with Actions/workflow write permission sufficient to dispatch workflows. Do not put this token in the frontend or source code.

## Deploy

```bash
npm run deploy
```

Then add the same three Worker secrets in the Cloudflare dashboard or with `wrangler secret put`.

## PWA installation

Open the deployed HTTPS site in Safari/Chrome and use the browser's Add to Home Screen / Install option.

## Notes

The app uses a simple password + signed HttpOnly session cookie. For a company-wide deployment, Cloudflare Access or another identity provider is a stronger authentication layer.
