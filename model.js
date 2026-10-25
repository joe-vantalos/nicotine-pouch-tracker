// ---- Calculations -----------------------------------------------------------
// Pure functions over entries, settings and cravings. No DOM access here.
// Every number marked PROVISIONAL is a placeholder until the evidence review
// (workspace stage D) replaces it.

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const STEP_MIN = 5;

function dayStart(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }
function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; }
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function round5(min) { return Math.round(min / 5) * 5; }

// ---- Products and spend ----

function productFor(entry, settings) {
  return settings.products.find(p => p.id === entry.productId)
    || settings.products.find(p => p.mg === entry.mg)
    || { id: null, name: entry.mg + ' mg pouch', mg: entry.mg, perTin: 20, price: null, left: null };
}
function usualProduct(settings) {
  return settings.products.find(p => p.id === settings.usualProductId) || settings.products[0];
}
function pricePerPouch(p) { return p && p.price && p.perTin ? p.price / p.perTin : null; }
function spendFor(list, settings) {
  return list.reduce((s, e) => s + (pricePerPouch(productFor(e, settings)) || 0), 0);
}
function pricesKnown(settings) { return settings.products.some(p => pricePerPouch(p)); }

// ---- Day and period statistics ----

function entriesBetween(entries, from, to) { return entries.filter(e => e.inTs >= from && e.inTs < to); }

function usualMinutes(entries) {
  const d = entries.filter(e => e.outTs).slice(-20).map(e => (e.outTs - e.inTs) / MIN);
  return clamp(Math.round(median(d) || 30), 5, 120);
}

function wakeTs(day, settings) {
  const [h, m] = settings.wakeTime.split(':').map(Number);
  return day + (h * 60 + m) * MIN;
}

function dayStats(entries, settings, day, now) {
  const list = entriesBetween(entries, day, addDays(day, 1));
  const gaps = [];
  for (let i = 1; i < list.length; i++) {
    if (list[i - 1].outTs) gaps.push((list[i].inTs - list[i - 1].outTs) / MIN);
  }
  const first = list.length ? (list[0].inTs - wakeTs(day, settings)) / MIN : null;
  return {
    day, list,
    count: list.length,
    mg: list.reduce((s, e) => s + e.mg, 0),
    durations: list.filter(e => e.outTs).map(e => (e.outTs - e.inTs) / MIN),
    timeIn: list.reduce((s, e) => s + ((e.outTs || now) - e.inTs), 0),
    gaps: gaps.filter(g => g >= 0),
    firstAfterWake: first !== null && first >= 0 ? first : null,
    spend: spendFor(list, settings)
  };
}

// Averages over whole days in [from, to). Days with no pouches count as zero.
function periodStats(entries, settings, from, to, now) {
  const days = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(dayStats(entries, settings, d, now));
  const n = days.length || 1;
  return {
    days,
    avgCount: days.reduce((s, d) => s + d.count, 0) / n,
    avgMg: days.reduce((s, d) => s + d.mg, 0) / n,
    avgDuration: mean(days.flatMap(d => d.durations)),
    avgGap: mean(days.flatMap(d => d.gaps)),
    avgFirst: mean(days.map(d => d.firstAfterWake).filter(x => x !== null)),
    avgSpend: days.reduce((s, d) => s + d.spend, 0) / n,
    total: days.reduce((s, d) => s + d.count, 0)
  };
}

// ---- Baseline and plan ----

// The baseline is the 7 days before the plan starts. Before a plan exists it is
// the first 7 days of logging, or the last 7 days if there is more history.
function baselineInfo(entries, settings, now) {
  if (!entries.length) return { complete: false, day: 1 };
  const today = dayStart(now);
  if (settings.plan.startTs) {
    const end = dayStart(settings.plan.startTs);
    return { complete: true, start: addDays(end, -7), end };
  }
  const daysLogged = Math.round((today - dayStart(entries[0].inTs)) / DAY);
  if (daysLogged < 7) return { complete: false, day: daysLogged + 1, start: dayStart(entries[0].inTs) };
  return { complete: true, start: addDays(today, -7), end: today };
}

function targetsFor(B, level, N) {
  const f = clamp(1 - level / N, 0, 1);
  return {
    count: Math.max(0, Math.round(B.avgCount * f)),
    mg: Math.max(0, Math.round(B.avgMg * f)),
    gap: Math.min(240, round5((B.avgGap || 60) * (1 + 0.1 * level))),        // PROVISIONAL
    first: Math.min(180, round5((B.avgFirst !== null ? B.avgFirst : 30) + 10 * level)) // PROVISIONAL
  };
}

// Level 1 starts in week 1. After each finished week the level goes up if that
// week met its target (within 10%); otherwise the step is held for another week.
function planState(entries, settings, now) {
  const base = baselineInfo(entries, settings, now);
  if (!base.complete || !settings.plan.startTs) return null;
  const B = periodStats(entries, settings, base.start, base.end, now);
  const N = settings.plan.weeks, mode = settings.plan.mode;
  const start = dayStart(settings.plan.startTs);
  const weeksDone = Math.max(0, Math.floor((dayStart(now) - start) / (7 * DAY)));
  let level = 1;
  const history = [];
  for (let k = 0; k < weeksDone; k++) {
    const ws = addDays(start, 7 * k);
    const st = periodStats(entries, settings, ws, addDays(ws, 7), now);
    const t = targetsFor(B, level, N);
    const met = mode === 'count' ? st.avgCount <= t.count * 1.1 + 0.01 : st.avgMg <= t.mg * 1.1 + 0.01;
    history.push({ start: ws, level, stats: st, targets: t, met });
    if (met && level < N) level++;
  }
  const weekStart = addDays(start, 7 * weeksDone);
  return {
    B, N, mode, level, start, weekStart,
    week: weeksDone + 1,
    targets: targetsFor(B, level, N),
    history,
    zeroBy: addDays(weekStart, 7 * (N - level + 1) - 1)
  };
}

// The target that applied on a given day, for rings and history bars.
function targetOn(plan, day) {
  if (!plan) return null;
  if (day < plan.start) return { count: Math.round(plan.B.avgCount), mg: Math.round(plan.B.avgMg) };
  const h = plan.history.find(w => day >= w.start && day < addDays(w.start, 7));
  return h ? h.targets : plan.targets;
}
function onTarget(plan, stats) {
  const t = targetOn(plan, stats.day);
  if (!t) return null;
  return plan.mode === 'count' ? stats.count <= t.count : stats.mg <= t.mg;
}

// ---- Blood nicotine estimate ----
// One compartment. Each pouch releases nicotine along a measured release curve
// while it is in; nearly all released nicotine reaches the blood through the mouth;
// it spreads through 2.6 L/kg and is cleared with a 2 h half-life. Pouches add up.
// Evidence and worked example: workspace stage D, output/blood-nicotine-model.md.

const V_PER_KG = 2.6;            // L/kg, volume of distribution (Benowitz, Hukkanen & Jacob 2009).
const DEFAULT_WEIGHT_KG = 70;    // Used until a weight is set in Profile.
const LOW_NGML = 5;              // Below the nicotine gum range of 5-15 ng/mL (Benowitz 2009).

// Share of the pouch's nicotine released by minutes in mouth; held after the last point.
// slow: ZYN 6 mg (Lunell 2020; 15 min from Knopp 2022, unverified; 30-45 min interpolated).
// fast: Velo 11 mg (Azzopardi 2026; 45-60 min extrapolated). Used for 10 mg and above.
const RELEASE = {
  slow: [[0, 0], [15, 0.17], [30, 0.35], [45, 0.45], [60, 0.57]],
  fast: [[0, 0], [10, 0.28], [20, 0.36], [30, 0.44], [45, 0.52], [60, 0.58]]
};

// The central estimate and the two ends of the likely range. F is the share of
// released nicotine reaching blood, fitted to four measured peaks (0.80 to 1.00).
// The 6 mg high end is raised so its peak reaches 16 ng/mL: two US ZYN 6 mg studies
// measured 15-17.5 ng/mL, above this model (blood-nicotine-model.md, conflict 2).
const BANDS = {
  mid: { f: 0.95, halfMin: 120, r: { slow: 1, fast: 1 } },
  low: { f: 0.80, halfMin: 90, r: { slow: 0.7, fast: 0.7 } },
  high: { f: 1.00, halfMin: 180, r: { slow: 1.55, fast: 1.3 } }
};

function releaseTable(mg) { return mg >= 10 ? 'fast' : 'slow'; }

function releasedShare(table, min) {
  const pts = RELEASE[table];
  if (min <= 0) return 0;
  for (let i = 1; i < pts.length; i++) {
    if (min <= pts[i][0]) {
      const [m0, r0] = pts[i - 1], [m1, r1] = pts[i];
      return r0 + (r1 - r0) * (min - m0) / (m1 - m0);
    }
  }
  return pts[pts.length - 1][1];
}

function weightKg(settings) { return settings && settings.weightKg ? settings.weightKg : DEFAULT_WEIGHT_KG; }

// Estimated venous blood nicotine in ng/mL, every STEP_MIN from `from` to `to`.
function levelSeries(entries, from, to, now, settings, band) {
  const p = BANDS[band || 'mid'];
  const k = Math.LN2 / p.halfMin;
  const litres = V_PER_KG * weightKg(settings);
  const warm = from - 24 * HOUR;
  const list = entries.filter(e => (e.outTs || now) > warm && e.inTs < to);
  const pts = [];
  let mgInBody = 0;
  // Each point is the level at the end of its STEP_MIN slice.
  for (let t = warm; t < to; t += STEP_MIN * MIN) {
    const t2 = t + STEP_MIN * MIN;
    let inflow = 0;
    for (const e of list) {
      const out = e.outTs || Math.max(now, e.inTs + MIN);
      const a = Math.max(e.inTs, t), b = Math.min(out, t2);
      if (b <= a) continue;
      const tbl = releaseTable(e.mg), scale = p.r[tbl];
      const share = m => Math.min(1, releasedShare(tbl, m) * scale);
      inflow += p.f * e.mg * (share((b - e.inTs) / MIN) - share((a - e.inTs) / MIN));
    }
    mgInBody = mgInBody * Math.exp(-k * STEP_MIN) + inflow;
    if (t2 >= from) pts.push([t2, mgInBody / litres * 1000]);
  }
  return pts;
}

// Where a level sits against known daily levels (Benowitz 2009): nicotine gum and
// other replacement products 5-15 ng/mL; daily smokers 10-50 ng/mL.
function levelBand(ng) {
  if (ng < LOW_NGML) return { name: 'Low', meaning: 'Below the level nicotine gum gives.' };
  if (ng < 10) return { name: 'Gum range', meaning: 'About the level nicotine gum or an inhaler gives through the day.' };
  if (ng < 15) return { name: 'Gum and smoker range', meaning: 'Where the nicotine gum range and a daily smoker\'s range overlap.' };
  if (ng <= 50) return { name: 'Smoker range', meaning: 'Within the range a daily smoker has through the day.' };
  return { name: 'Above smoker range', meaning: 'Above the usual range for daily smokers. A comparison, not a danger line.' };
}

// Share of the brain's main nicotine receptors (alpha4beta2) filled at a blood level.
// Fitted binding curve from a smoker PET study: half filled at 0.87 ng/mL (Brody 2006).
// An estimate: no study has measured this for pouches.
function receptorShare(ng) { return ng / (ng + 0.87); }

// Your usual daytime level: the average estimate between 08:00 and 22:00 over the
// last 7 days that had a pouch. A reference you know, unlike gum or smoker levels.
const usualCache = { key: null, value: null };
function usualLevel(entries, settings, now) {
  const today = dayStart(now);
  const key = [today, weightKg(settings), entries.reduce((s, e) => s + e.inTs + (e.outTs || 0) + e.mg, 0)].join('|');
  if (usualCache.key === key) return usualCache.value;
  const means = [];
  for (let i = 1; i <= 7; i++) {
    const d = addDays(today, -i);
    if (!entries.some(e => e.inTs >= d && e.inTs < addDays(d, 1))) continue;
    means.push(mean(levelSeries(entries, d + 8 * HOUR, d + 22 * HOUR, now, settings).map(p => p[1])));
  }
  usualCache.key = key;
  usualCache.value = means.length ? mean(means) : null;
  return usualCache.value;
}

// ---- Craving timing ----
// After a pouch goes in, craving eases within 5-15 min and is lowest at 15-40 min. It
// usually returns 60-90 min after the pouch went in, for some people up to 120 min.
// No blood level marks the moment. Keller-Hamilton 2024, 2025; Hansson 2019 (workspace
// shared/research/withdrawal-timing-oral.md).
const CRAVING = { lowestFrom: 15, lowestTo: 40, backFrom: 60, backTo: 90, backLate: 120 };

// Where you are in that pattern after the pouch that went in at `inTs`.
function cravingPhase(inTs, now) {
  const m = (now - inTs) / MIN;
  if (m < CRAVING.lowestFrom) return 'easing';
  if (m < CRAVING.lowestTo) return 'lowest';
  if (m < CRAVING.backFrom) return 'fading';
  return 'back';
}

// A pouch that went in while another was in, or within an hour of the last coming
// out. Most of the last one is still in the blood (2 h half-life), so the dose adds.
function doubledUp(entries, active) {
  if (!active) return false;
  const prev = entries.filter(e => e !== active && e.inTs < active.inTs).at(-1);
  return !!prev && (prev.outTs === null || active.inTs - prev.outTs < HOUR);
}

function hoursBelow(series, low) {
  return series.filter(p => p[1] < low).length * STEP_MIN / 60;
}

// Longest continuous stretch below the low level between 18:00 the day before and noon.
function overnightLow(entries, settings, day, now) {
  const s = levelSeries(entries, addDays(day, -1) + 18 * HOUR, Math.min(day + 12 * HOUR, now), now, settings);
  let best = 0, run = 0;
  s.forEach(p => { run = p[1] < LOW_NGML ? run + STEP_MIN : 0; best = Math.max(best, run); });
  return best / 60;
}

// ---- Score (PROVISIONAL formula, working name "Capacity") ----

function scoreAt(entries, settings, now, plan) {
  if (!plan) return null;
  const B = plan.B, today = dayStart(now);
  const cur = periodStats(entries, settings, addDays(today, -6), addDays(today, 1), now);
  const parts = [];
  if (B.avgGap && cur.avgGap !== null) {
    parts.push({ label: 'Gaps between pouches', value: fmtMin(cur.avgGap) + ' avg',
      score: clamp(50 + (cur.avgGap / B.avgGap - 1) * 100, 0, 100),
      why: 'Average gap over the last 7 days, against ' + fmtMin(B.avgGap) + ' in your baseline week. Longer gaps mean you are going without for longer.' });
  }
  const night = overnightLow(entries, settings, today, now);
  parts.push({ label: 'Overnight low', value: fmtMin(night * 60),
    score: clamp(night / 12 * 100, 0, 100),
    why: 'Longest stretch below ' + LOW_NGML + ' ng/mL last night, the level below nicotine gum. The time you go without every day.' });
  if (B.avgFirst !== null && cur.avgFirst !== null) {
    parts.push({ label: 'First pouch after waking', value: fmtMin(cur.avgFirst),
      score: clamp(50 + (cur.avgFirst - B.avgFirst) / 60 * 50, 0, 100),
      why: 'In your baseline week it was ' + fmtMin(B.avgFirst) + '. In smoking research, a longer wait after waking is a sign of lower dependence; this is still to be confirmed for pouches.' });
  }
  if (B.avgMg > 0) {
    const p = 1 - cur.avgMg / B.avgMg;
    parts.push({ label: 'Daily nicotine vs baseline', value: (p >= 0 ? '−' : '+') + Math.round(Math.abs(p) * 100) + '%',
      score: clamp(50 + p * 100, 0, 100),
      why: Math.round(cur.avgMg) + ' mg a day over the last 7 days, against ' + Math.round(B.avgMg) + ' mg in your baseline week.' });
  }
  const recent = cur.days.filter(d => d.day >= plan.start && d.day < today);
  if (recent.length) {
    const on = recent.filter(d => onTarget(plan, d)).length;
    parts.push({ label: 'Days on plan', value: on + ' of ' + recent.length,
      score: on / recent.length * 100,
      why: 'Finished days in the last week that kept to the plan. Missing one slows the next step down; it is not a failure.' });
  }
  const value = Math.round(mean(parts.map(p => p.score)));
  return { value, band: value >= 67 ? 'Ready' : value >= 34 ? 'Steady' : 'Hold', parts };
}

// ---- Coach ----

function coachTip(ctx) {
  const { entries, settings, now, plan, active, today } = ctx;
  if (!plan) return null;
  const t = plan.targets, price = pricePerPouch(usualProduct(settings));
  const saving = price ? ', and ' + fmtMoney(price) + ' not spent' : '';
  if (active) {
    const usual = usualMinutes(entries);
    const outAt = active.inTs + usual * MIN;
    if (now < outAt) {
      return { title: 'Take it out at ' + fmtTime(outAt) + '.',
        why: 'That is your usual ' + usual + ' minutes. Keeping to it keeps today\'s estimate on track.',
        benefit: 'A shorter time in means less nicotine from this pouch.' };
    }
    return null;
  }
  if (plan.mode === 'count' && today.count >= t.count) {
    return { title: t.count === 0 ? 'This week\'s target is zero.' : 'You have reached today\'s target of ' + t.count + '.',
      why: 'Week ' + plan.week + ' of your plan. Holding here is what moves the plan on next week.',
      benefit: 'Each pouch you skip today is a lower level tonight' + saving + '.' };
  }
  if (plan.mode === 'strength' && today.mg >= t.mg) {
    return { title: 'You have reached today\'s ' + t.mg + ' mg.',
      why: 'Week ' + plan.week + ' of your plan.', benefit: 'Stopping here keeps the plan on schedule' + saving + '.' };
  }
  const last = [...entries].reverse().find(e => e.outTs);
  if (last) {
    const next = last.outTs + t.gap * MIN;
    const left = plan.mode === 'count' ? (t.count - today.count) + ' left today' : (t.mg - today.mg) + ' mg left today';
    if (now < next) {
      return { title: 'Next pouch from ' + fmtTime(next) + '.',
        why: 'This week\'s gap is ' + fmtMin(t.gap) + '. Your baseline gap was ' + fmtMin(plan.B.avgGap || 60) + '. ' + left + '.',
        benefit: 'A longer gap lets your level fall further' + saving + '.' };
    }
    return { title: 'You are clear for one, within plan (' + left + ').',
      why: 'Your last pouch came out ' + fmtMin((now - last.outTs) / MIN) + ' ago, past this week\'s ' + fmtMin(t.gap) + ' gap.',
      benefit: 'Waiting a little longer still lowers your level' + saving + '.' };
  }
  return null;
}

// ---- Aftercare ----

const CHECKIN_DAYS = [2, 3, 7, 10, 14, 30, 90, 180, 365];

function aftercareState(entries, settings, now) {
  if (!entries.length || entries.some(e => !e.outTs)) return null;
  const lastOut = Math.max(...entries.map(e => e.outTs));
  const sinceMs = now - lastOut;
  if (sinceMs < DAY) return null;
  const day = Math.floor(sinceMs / DAY) + 1;
  const ref = periodStats(entries, settings, addDays(dayStart(lastOut), -6), addDays(dayStart(lastOut), 1), now);
  const daysFree = sinceMs / DAY;
  let longest = 0;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i - 1].outTs) longest = Math.max(longest, entries[i].inTs - entries[i - 1].outTs);
  }
  const milestone = [...CHECKIN_DAYS].reverse().find(d => day >= d) || null;
  const confirmed = settings.confirmations.some(c => c.fromTs === lastOut && c.day >= (milestone || 0));
  return {
    lastOut, day, sinceMs,
    notUsed: Math.round(ref.avgCount * daysFree),
    notUsedMg: Math.round(ref.avgMg * daysFree),
    notSpent: ref.avgSpend * daysFree,
    record: Math.max(longest, sinceMs) === sinceMs,
    longest: Math.max(longest, sinceMs),
    milestone,
    needsCheckin: settings.checkins && milestone !== null && !confirmed
  };
}

// What usually happens after stopping, from studies of people who stopped smoking.
// No study has followed people stopping pouches. Evidence: workspace shared/research/
// withdrawal-mood-sleep.md, brain-and-receptors.md, oral-and-metabolic.md.
const PHASES = [
  { from: 0, to: 7, when: 'Week 1',
    text: 'Withdrawal is usually at its worst: irritability, anxiety, low mood, poor focus, restlessness, hunger and cravings. Sleep may be broken for the first few nights.',
    src: 'Hughes 2007; Wetter 1995' },
  { from: 7, to: 28, when: 'Weeks 2 to 4', text: 'Symptoms usually ease, and for most people are gone by 2 to 4 weeks. Mood often dips in the first weeks. The brain still has more nicotine receptors than usual.',
    src: 'Hughes 2007; Klemperer 2021; Mamede 2007' },
  { from: 28, to: 90, when: 'Months 1 to 3', text: 'Receptor numbers return to normal, somewhere between 3 and 12 weeks. Mood is usually better than before stopping. People who stop smoking gain about 4 to 5 kg in the first year, mostly in the first 3 months; some lose weight.',
    src: 'Mamede 2007; Cosgrove 2009; Taylor 2014; Aubin 2012' },
  { from: 90, to: Infinity, when: 'After 3 months', text: 'Urges keep fading but can come back with cues: drinking, stress, the moments you used to have one. At 6 months about 1 in 8 ex-smokers still had strong urges. At a year about a third had urges, none of them strong. Each one passes.',
    src: 'Ussher 2013' }
];

// ---- Formatting ----

function fmtTime(ts) { return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
function fmtDay(ts) { return new Date(ts).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }
function fmtMin(min) {
  if (min === null || isNaN(min)) return '–';
  const m = Math.round(min);
  if (m < 60) return m + 'm';
  return Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0');
}
function fmtMoney(x) { return '£' + (x || 0).toFixed(2); }
