# Pouch Tracker

Single-page app (`index.html`) for logging nicotine pouch use.

## Project layout

```
index.html             The whole app: markup, styles and script
manifest.webmanifest   Home screen app settings (name, colours, Android icons)
icons/                 Logo source (logo.svg) and the PNGs rendered from it
README.md              This file
```

This repository holds only the shipped app. Your usage data is not in the repository:
it is stored in the browser on each device (see Storage below).

## Storage

Data is stored in the browser's `localStorage` under the key `pouchTracker.entries.v1`.
Every action saves locally and updates the screen immediately. There are no network
calls during normal use.

Each entry is `{ inTs, outTs, mg }`, with times in milliseconds since epoch.
`outTs` is `null` while the pouch is in.

### Migration from Google Sheets

The app previously used a Google Apps Script web app as its backend. On the first load
after the switch, the app fetches all rows from that endpoint once and merges them into
local storage. The "Re-import from Google Sheet" button repeats this. Importing is
merge-only: it never deletes local entries, and running it twice does not create duplicates.

### Limits of local storage

- Data lives in one browser on one device. Phone and laptop do not share data.
- Clearing site data deletes it. Safari can also delete it if the site is not used for
  7 days, unless the app is added to the home screen.
- Use "Export backup" regularly. "Import backup" merges a backup file back in.

### Future remote backend

All reads and writes go through the `store` object in `index.html`. A remote backend can be
added behind it without changing the rest of the app. Free options:

| Option | Free tier | Notes |
| --- | --- | --- |
| Supabase | 500 MB Postgres | Project pauses after 7 days with no requests. |
| Firebase Firestore | 1 GB, 50k reads / 20k writes per day | Built-in offline cache suits this app. |
| Cloudflare Workers + D1 | 5 GB, 100k requests per day | Needs a small Worker script. |

## Logo and icons

The source logo is `icons/logo.svg`. It is used as the browser tab icon and in the page header.
The PNG files in `icons/` are rendered from it for the iPhone home screen (`apple-touch-icon-v2.png`; rename it again when it changes, as iOS caches it by file name),
Android home screen (`icon-192.png`, `icon-512.png`, listed in `manifest.webmanifest`) and older
browsers (`favicon-32.png`). If the SVG changes, re-render the PNGs.
