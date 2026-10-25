# Ideas from the coffee app

Status: needs decision. Each idea needs a yes or no.

Source: the "Coffee App - Logging flow wireframe" design canvas
(https://claude.ai/artifact/SjaLbXykC2B9aq2ZPCuFjC). It is a wireframe, not a built app.

## What the coffee app is

- Three tabs: **Now** (what is in your body today), **Trends**, **Palate** (beans and tasting).
  A **+** button opens logging. An avatar opens Profile and settings.
- Dark theme, one warm accent colour (amber), rounded cards, Manrope font.
- Taps on the dashboard open a floating panel. Logging uses a bottom sheet.

## The main difference to keep in mind

A coffee is logged at one moment. A pouch has a start and an end (in and out).
Every idea below that involves logging has to handle both times.

## Ideas that carry over

Ordered by value to this app, highest first.

| # | Coffee app idea | Pouch version | Solves |
| --- | --- | --- | --- |
| 1 | "When did you have it?" with Now / Earlier and a day-hour-minute wheel | Log sheet with Now / Earlier. Earlier asks for the in time and then the out time (or a duration). | TODO item 5, retrospective logging |
| 2 | Tap a logged cup to open it | Tap an entry in the log to edit its times or strength, or delete it | Forgotten "remove", wrong times |
| 3 | Week strip: 7 small rings across the top, one per day, filled against the daily maximum. Tap a day to see that day. | Same, filled by mg (or pouches) against a daily limit. Tapping a past day shows its log and stats. | Only today's log is visible today |
| 4 | Two ring cards: "Right now" and "Today so far" against limits. Over 100% the ring laps again. | "Today so far": mg and pouches against a daily limit you set. | No limit or goal today |
| 5 | Limits in settings: daily maximum, single-dose ceiling | Daily limit (mg and/or pouches). Optional target gap between pouches. | Helps cutting down |
| 6 | Readiness bar: where you are, and "Optimal in 8h49" | "Since last pouch: 1h20. Target gap 2h, next at 15:10." | Pacing between pouches |
| 7 | "Your usual" set in onboarding, so logging is one tap | Usual strength and usual time in, preselected | Faster logging |
| 8 | Monitor: a chart of the day with each cup as a marker on a timeline, plus "if I have another" preview | A day timeline showing each pouch as a bar from in to out. A nicotine level curve is possible later but is an estimate. | Seeing the shape of the day |
| 9 | Spend: cost per cup, per bag, per day | Tin price and pouches per tin give cost per pouch, per day and per week | Knowing what it costs |
| 10 | Shelf of bags with a freshness bar | Tins: brand, strength, pouches left in the current tin | Knowing when to buy more |
| 11 | Onboarding: goals, your usual, cups a day | Goal (track / cut down / quit), usual strength, pouches a day, tin price | First-run setup |
| 12 | Tab bar with + button; floating panels for details, bottom sheet for logging | Same layout: Now, History, Profile; + to log | Room to grow past one screen |

## Ideas that do not carry over

- Palate, guided tasting, brew kit, beans by barcode. These are about coffee as a craft.
- Sleep readiness from caffeine half-life. Nicotine clears in about 2 hours, so it
  matters far less for sleep. The "since last pouch" pacing bar (idea 6) replaces it.

## How the coffee app was designed (worth copying as a process)

- A design canvas with one page per flow, a "states" catalogue per screen, an
  options band for competing designs, and an archive of losing designs.
- Placeholder numbers clearly marked as placeholders.
- An open-decisions list. This repo's `TODO.md` plays that role.

## Proposed build order

1. **Logging and history** (ideas 1, 2, 3): log earlier, edit and delete, see past days.
2. **Limits and pacing** (ideas 4, 5, 6, 7).
3. **Backend** (`docs/backend.md`), before the data model grows further.
4. **New layout** (idea 12) and **new logo**, designed together so they match.
5. **Spend and tins** (ideas 9, 10), then **onboarding** (idea 11).
6. **Day timeline** (idea 8).
