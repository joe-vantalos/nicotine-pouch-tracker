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
learn.js               Words on the Learn screen, with sources
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
- **Nicotine in you**: the level, what it does (heart rate, blood pressure, receptors), what if.
- **Learn**: what nicotine does, with your numbers: heart, brain, withdrawal, sleep, sport,
  long-term risk, mouth and body, safety. Summaries of peer-reviewed studies.
- **Capacity**, **Profile** (products, tins, wake time, bedtime, body weight, data).
- Overlays: log a pouch (now or earlier), edit or delete an entry, a day's log,
  "Still in?", the check-in ("Have you had none?"), and "I'm craving".

## Blood nicotine estimate

The app estimates venous blood nicotine in ng/mL, with a likely range, from each
pouch's strength and time in mouth and your body weight (Profile; 70 kg if not set).

- Release from the pouch follows measured curves: ZYN 6 mg (Lunell 2020) for pouches
  under 10 mg, Velo 11 mg (Azzopardi 2026) for 10 mg and over.
- About 95% of released nicotine reaches the blood, spread through 2.6 L/kg, with a
  2 h half-life (Benowitz, Hukkanen & Jacob 2009). Pouches add up.
- The range uses slower and faster release, uptake (80-100%) and half-life (1.5-3 h).
- Under the number, the level is compared with your usual daytime level (your average
  between 08:00 and 22:00 over the last 7 days with a pouch), with what is happening
  in the body: rising or falling, and the share of nicotine receptors filled.
- Nicotine gum users (5-15 ng/mL) and daily smokers (10-50 ng/mL) are shown as
  background ranges on the chart and in Learn. "Low" is below 5 ng/mL.

The studies measured one pouch at a time, in other brands for 11 mg, so the estimate
may be off by half or double. It is labelled as an estimate in the app.

## Provisional calculations

The Capacity score and the plan's gap and first-pouch targets are placeholders until
the evidence review is done. They are marked PROVISIONAL in `model.js`.

## Storage

Data is stored in the browser's `localStorage`:

| Key | Holds |
| --- | --- |
| `pouchTracker.entries.v1` | Entries `{ inTs, outTs, mg, productId?, tag? }` |
| `pouchTracker.settings.v1` | Products, usual product, wake time, bedtime, body weight, plan, check-in confirmations, backup dates |
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
