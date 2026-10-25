# Build tracker

The build tracker for Pouch Tracker. Each item has a status and the next action.
Statuses: `todo`, `needs decision`, `in progress`, `done`.

## Goal

A pouch tracker that is quick to log with, keeps data safe on more than one device,
and helps cut down use.

## Items

### 1. Project structure and build tracker — `done`
- Added this file and the `docs/` folder for decisions and specs.
- The layout is described in `README.md` under "Project layout".

### 2. Better logo — `needs decision`
- The current logo is a plain white pill with a dotted outline (`icons/logo.svg`).
- Next: agree on a direction (see questions in `docs/logo.md`), then redraw the SVG
  and re-render all the PNGs.

### 3. Home screen icon does not show — `todo`
- The icon files and links are in place on `main`: `apple-touch-icon-v2.png` (iPhone)
  and `icon-192.png` / `icon-512.png` (Android, via `manifest.webmanifest`).
- Likely cause: iOS saves the icon when the app is first added to the home screen
  and does not update it later.
- Next: on the phone, delete the home screen shortcut, open the site in Safari,
  then Share > Add to Home Screen. If the icon is still blank, check that the icon
  URL loads in the browser.
- Do this after item 2, so the new logo is the one that gets saved.

### 4. Stronger data storage (backend) — `needs decision`
- Today all data is in one browser's `localStorage` on one device.
- Requirements and provider options are in `docs/backend.md`.
- Next: confirm the requirements and choose a provider.

### 5. Log a pouch retrospectively — `todo`
- Allow adding a past pouch with a chosen in time, out time and strength.
- Allow editing or deleting an existing entry, for example a forgotten "remove".
- Design from the coffee app: a "When?" step with Now / Earlier and a wheel picker
  (`docs/ideas.md`, ideas 1 and 2). Earlier needs both an in time and an out time.

### 6. Ideas from the coffee app — `needs decision`
- Reviewed the coffee app design canvas. 12 ideas carry over; they are listed in
  `docs/ideas.md` with a proposed build order.
- Next: say yes or no to each idea. Chosen ones become items here.
