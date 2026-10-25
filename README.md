# Pouch Tracker

Web app for tracking nicotine pouch use, understanding its effect, and stepping down
to zero. Track → understand impact → coach to decrease → quit.

## Project layout

```
index.html             Page shell: tabs, overlay and toast containers
styles.css             All styles; colours are tokens on :root
store.js               Storage: load, save, normalise, merge, settings defaults
model.js               Calculations: stats, baseline, plan, nicotine estimate, score, coach, aftercare
ui.js                  Screens, overlays and actions
sw.js                  Offline support: keeps a copy of the app on the device
manifest.webmanifest   Home screen app settings (name, colours, Android icons)
icons/                 Logo source (logo.svg) and the PNGs rendered from it
README.md              This file
```

No build step. Open `index.html` or serve the folder.

This repository holds only the shipped app. Your usage data is not in the repository:
it is stored in the browser on each device (see Storage below).

## Screens

- **Now**: week rings, the pouch in (or time since the last), nicotine estimate,
  Capacity score, today against the plan, a coach suggestion, today's log.
  After 24 hours with no pouch, Now becomes the aftercare view.
- **Plan**: steps from the baseline week to zero, by count or by strength.
- **History**: week or month, trend against the previous period, every day.
- **Nicotine in you**, **Capacity**, **Profile** (products, tins, wake time, data).
- Overlays: log a pouch (now or earlier), edit or delete an entry, a day's log,
  "Still in?", the check-in ("Have you had none?"), and "I'm craving".

## Provisional calculations

The nicotine estimate, the low line, the Capacity score and the plan's gap and
first-pouch targets are placeholders until the evidence review is done. They are
marked PROVISIONAL in `model.js` and labelled as estimates in the app.

## Storage

Data is stored in the browser's `localStorage`:

| Key | Holds |
| --- | --- |
| `pouchTracker.entries.v1` | Entries `{ inTs, outTs, mg, productId?, tag? }` |
| `pouchTracker.settings.v1` | Products, usual product, wake time, plan, check-in confirmations |
| `pouchTracker.cravings.v1` | Cravings `{ ts, tag?, outcome? }` |

Times are milliseconds since epoch. `outTs` is `null` while the pouch is in.
Every action saves locally and updates the screen immediately. There are no network
calls during normal use. The older version of the app reads the same entries key,
so data stays compatible in both directions.

### Backups

"Back up now" (on Now, when a backup is due) and "Export backup" (Profile) save one
file with everything: entries, settings (products, prices, plan) and cravings. On a
phone this opens the share sheet; choose "Save to Files" to keep it in iCloud Drive.
A backup is due a week after the last one; "Later" hides the prompt for a day.

"Import backup" merges a file back in and never deletes anything. On a device with
no entries yet, the backup's settings are taken whole. Older backups (a plain list
of entries) still import.

### Limits of local storage

- Data lives in one browser on one device. Phone and laptop do not share data.
- Clearing site data deletes it. Safari can also delete it if the site is not used for
  7 days, unless the app is added to the home screen.
- Back up regularly. The app prompts weekly.

### Future remote backend

All reads and writes go through the `store` object in `store.js`. A remote backend can be
added behind it without changing the rest of the app. Free options:

| Option | Free tier | Notes |
| --- | --- | --- |
| Supabase | 500 MB Postgres | Project pauses after 7 days with no requests. |
| Firebase Firestore | 1 GB, 50k reads / 20k writes per day | Built-in offline cache suits this app. |
| Cloudflare Workers + D1 | 5 GB, 100k requests per day | Needs a small Worker script. |

## Offline and releases

`sw.js` keeps a copy of the app on the device, so it opens with no signal. The page
is fetched fresh when online, so a release shows on the next open. Scripts, styles
and icons are served from the stored copy.

When a release changes `styles.css` or a `.js` file, bump its `?v=` number in both
`index.html` and the `SHELL` list in `sw.js`. Otherwise phones keep the old file.

## Logo and icons

The source logo is `icons/logo.svg`. It is used as the browser tab icon and in the page header.
The PNG files in `icons/` are rendered from it for the iPhone home screen (`apple-touch-icon-v2.png`; rename it again when it changes, as iOS caches it by file name),
Android home screen (`icon-192.png`, `icon-512.png`, listed in `manifest.webmanifest`) and older
browsers (`favicon-32.png`). If the SVG changes, re-render the PNGs.
