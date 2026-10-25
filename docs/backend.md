# Backend: requirements and options

Status: needs decision.

## Current state

- Entries are stored in the browser's `localStorage` on one device.
- Clearing site data deletes everything. Safari can delete it after 7 days without use
  unless the app is on the home screen.
- The phone and the laptop do not share data.
- The only protection is a manual "Export backup".

## What "better" means (draft requirements)

1. **Durable.** Losing, resetting or replacing the phone does not lose data.
2. **Synced.** The same data appears on every device that is signed in.
3. **Works offline.** Logging works with no signal and syncs later. A tap must never
   wait on the network.
4. **Private.** Only the owner can read or write the data. This needs a sign-in.
5. **Free.** Fits a free tier for one user indefinitely.
6. **Exportable.** Data can be downloaded as CSV or JSON at any time, so the provider
   can be changed later.
7. **Small change.** The app keeps `localStorage` as its local copy. The backend sits
   behind the existing `store` object in `index.html`.

## Provider options

| Option | Who provides it | Free tier | Sign-in | Offline sync | Viewing the data |
| --- | --- | --- | --- | --- | --- |
| Supabase | Supabase Inc. (hosted Postgres) | 500 MB, 2 projects | Email link, Google, Apple | Must be written in the app (a small sync queue) | Table editor in a spreadsheet-like web view; SQL |
| Firebase Firestore | Google | 1 GB, 50k reads / 20k writes per day | Google, Apple, email | Built in | Firebase console (document view, less like a sheet) |
| Cloudflare Workers + D1 | Cloudflare | 5 GB, 100k requests per day | Must be built | Must be written in the app | SQL only |

Notes:
- Supabase pauses a free project after 7 days with no requests. Daily use prevents this.
- Firebase has the least code to write because offline sync is built in.
- Cloudflare has the most code to write and no ready-made sign-in.

## Recommendation

Supabase. It meets every requirement. Its table editor is the closest thing to the
old Google Sheet, and its data is standard Postgres that exports cleanly.
The cost is a small sync queue in the app, which we would write anyway to keep
logging instant.

Firebase is the alternative if minimum code matters more than seeing the data
in a table.

## Open questions

- Is the requirement list right? Add or remove anything.
- Which sign-in: email link, Google or Apple?
- Supabase or Firebase?
