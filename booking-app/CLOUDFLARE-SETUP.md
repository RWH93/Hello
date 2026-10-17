# R&R Detailing — Cloudflare launch preparation

This package serves the customer website at `/`, available times at `/book`, and your private diary at `/admin`. Use **Cloudflare Workers**, not a static Pages upload. The database is a SQLite-backed Durable Object: bookings are shared across your phone and computer. The old local database is not uploaded.

## What Ryan needs to do next

Create your Cloudflare account and sign in. Tell us when it is ready, and which email address you want to use for owner login. Do not share your password or login codes in chat. No domain purchase is needed for initial testing.

Owner login uses Cloudflare Access: an emailed one-time code, with only your nominated email allowed. Your customers do not log in. Approval in the diary does not send a customer email; continue to call or email them yourself.

## Deployment steps for the person connecting the account

1. Run `npm ci`, `npm run test:cloudflare`, and `npm run check:cloudflare` in this folder. Authenticate Wrangler interactively with `npx wrangler login`. Run `npm run deploy:cloudflare`. Initial deployment deliberately refuses owner access and public booking submissions until configured.
2. Record the production `https://rr-detailing.<account>.workers.dev` address. Set `PUBLIC_ORIGIN` to that exact origin, without a trailing slash. Keep preview URLs disabled. Keep the Durable Object name, binding and migration stable; renaming them can create a different empty diary.
3. In Zero Trust / Access, create one self-hosted application covering **only** `<production-host>/owner-login`. Allow only Ryan's nominated email using One-time PIN. Do not enable whole-Worker Access protection, which would block customers. The owner visits `/admin`, is sent through `/owner-login`, then returns to the diary. The Worker independently verifies the signed Access token on every private API request. Confirm the application cookie is usable across this hostname.
4. Set `ACCESS_TEAM_DOMAIN` to the team's `*.cloudflareaccess.com` hostname (no scheme), `ACCESS_AUD` to that application's audience tag, and `OWNER_EMAIL` to the exact allowed email. Save these non-secret settings in `wrangler.jsonc` before subsequent deployments so later deploys do not overwrite dashboard edits with blanks.
5. Create a managed Turnstile widget restricted to the production hostname. Set `TURNSTILE_SITE_KEY` in the config. Add its private secret through `npx wrangler secret put TURNSTILE_SECRET_KEY`; never commit it. Deploy the configured app again. The public form requires successful server-side verification, including hostname and action.
6. Sign in as Ryan, offer a future test time, submit a clearly labelled test request from a signed-out browser, approve it, check it appears on a second device, then cancel it. Confirm a second request cannot take an overlapping time. Test a blocked day and a full-detail booking's three hours plus travel gap. Confirm signed-out `/api/admin/state`, `/api/admin/export` and direct `/admin.html` cannot disclose records. Test signing out and signing in again. Check customer pages stay public.
7. Export a diary backup from Settings & backup before using real customer details. Establish a regular backup habit. Exports contain private details: store securely, outside GitHub. Cloudflare also offers SQLite Durable Object point-in-time recovery; verify the account's available retention and recovery process before relying on it.
8. Only after these checks, share the new address and update the old GitHub website to point customers there.

## Current scope and limits

Preparation checks on 17 October 2026: all 21 existing scheduling tests passed; additional Cloudflare tests passed for SQL adaptation, concurrent requests, signed owner identity, wrong/expired/forged tokens, public-data privacy, Turnstile hostname checks, cross-site writes, and oversized requests. Wrangler's deployment dry-run bundled successfully. The actual local Workers runtime could not start because Windows denied filesystem access (`GetFinalPathNameByHandleW`). Account deployment and the two-device acceptance check above remain required; no live Cloudflare deployment has been made.

- One detailer; Monday–Sunday 7am–5pm, adjustable. Owner publishes exact starts.
- Exterior 60 min, interior 120 min, full 180 min; default 30 min travel, adjustable per job.
- Pending requests reserve time until reviewed. Private time-off notes never go to customers.
- No payments, automatic messages, route calculation, or multi-staff scheduling yet.
- There is no automatic import of local bookings and no user-facing restore/import button. Keep the local database safe if it contains any records you want transferred.
- The free plan has usage limits; this is not unlimited hosting. Check Workers, Durable Objects, Access and Turnstile usage in the account. No paid plan is enabled by this preparation.
- Do not publish the local Node server, test databases, `.env` files or `.dev.vars`. The first local password setup endpoint does not exist in the cloud Worker.

Official references: [Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [Access JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Turnstile validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).
