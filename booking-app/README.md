# R&R Detailing booking diary — local development version

This version is built for review before the hosting move. It does not alter the live GitHub Pages website. It uses a local Node.js server and a SQLite database, rather than browser-only storage. It is deliberately restricted to this computer and must not be exposed to the internet as-is.

## Start

Requires Node.js 22.16 or newer with `node:sqlite`. No additional packages are needed.

Double-click `Start-Preview.cmd` on Windows, or run `npm start` from this folder. Keep that window open while testing.

- Owner: http://127.0.0.1:4174/admin
- Customer calendar: http://127.0.0.1:4174/book
- Updated customer homepage: http://127.0.0.1:4174/

Create your own owner password on first use. There is no default owner password. The server binds only to 127.0.0.1. First-owner setup is intentionally local-only; it is not a production registration system. The API enforces authentication on every owner endpoint. Password hashes are salted with scrypt; sessions use random HttpOnly/SameSite cookies and expire after eight hours or on server restart. Write requests check their origin.

## How the diary works

1. In **Offer times & block out**, publish exact start times with the services that can be requested at each one. Nothing is automatically made available.
2. Customers choose a service and day. The server shows only offered starts that fit their service, opening hours, existing jobs and blocked time.
3. A submitted request is saved as pending and temporarily holds its service period plus travel allowance. Only one request can take that interval. Pending holds do not expire automatically: review, approve or decline them promptly.
4. Review requests in **Requests**. Adjust the suburb, appointment time or travel allowance before approval if needed.
5. Approving changes the diary status. **No email or text message is sent automatically.** Call or email the customer to confirm.
6. Add phone bookings, edit appointments, complete jobs and view cancelled/declined history from **Day diary**.
7. Block a whole day or part of a day. Customers see no available times and never see the reason. Existing overlapping jobs must first be moved or cancelled.

Defaults: Monday–Sunday, 7am–5pm Brisbane/AEST; exterior 60 minutes, interior 120 minutes, full 180 minutes; 30 minutes after each job for travel; one detailer. Service appointments must finish by closing. The travel allowance may extend past closing because no more customers are being scheduled then.

Travel is a manual planning allowance, not a route calculation. Increase the preceding job's allowance for a longer journey. Owner-added appointments can be after hours; discuss daylight and any surcharge personally and record it in notes. Customers are invited to call if a time is unavailable.

Service durations and standard hours are editable. Existing appointments keep their saved length until edited. Prices remain the supplied flyer guide prices. Multi-detailer scheduling, automated routing and automatic email/SMS are not implemented.

## Data and backup

The local database lives in `data/bookings.sqlite`, with possible SQLite journal files alongside it. Do not commit or share this directory. Use test details during development. The authenticated backup button downloads bookings, offered times, blocked periods and settings as JSON, without owner credentials. It is an export, not an implemented restore flow. Keep exports private. Back up the full data folder with the server stopped to preserve a restorable SQLite copy.

Restarting preserves bookings and the password hash. Sessions expire on restart. There is no password-recovery interface yet.

## Checks

Run `npm test` for the scheduling checks. `http-tests.mjs` targets a separate server on port 4175 with a dedicated QA database; never point it at a real diary. Its fixed dummy password is only a test fixture, not a deployment secret.

Verified: 21 scheduling checks; owner authentication and export protection; cross-origin write rejection; consent required; browser flow from offer to customer request to approval; mobile layout for owner and customer; data read back from a separate database connection.

## Before online use

The live customer website is unchanged. This local app cannot run directly on GitHub Pages or be uploaded unchanged to Cloudflare Pages. The planned online version needs shared hosted storage (for example Cloudflare D1), compatible server functions, production owner authentication and recovery, durable spam/rate controls, HTTPS/session configuration, backup/restore and a deployment review. Node SQLite and the local first-owner setup must be replaced as part of that work. Domain/account setup and any notification provider are separate.

Do not use real customer data until that setup is complete. Adding online persistence changes the earlier static website's infrastructure and limits; confirm the chosen platform's current free allowances during deployment.
