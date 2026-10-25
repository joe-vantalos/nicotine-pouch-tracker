// ---- Screens and interaction ------------------------------------------------
// Each screen is a function that returns HTML for the current state. Clicks are
// handled in one place through data-act attributes.

let entries = [];      // { inTs, outTs, mg, productId?, tag? }, sorted by inTs
let settings = null;
let cravings = [];     // { ts, tag?, outcome? }
let dataLoaded = false;
let overlay = null;    // the open sheet or panel, with its form state
let ui = { range: 'week', scenario: 'none', scoreOpen: 0, phaseOpen: null };
let toastTimer = null, cravingTimer = null;
let statusText = { text: 'loading...', error: false };

const $view = document.getElementById('view');
const $overlay = document.getElementById('overlay');
const $toast = document.getElementById('toast');
const $tabs = document.getElementById('tabs');
const $importFile = document.getElementById('importFile');

const TAGS = ['Work', 'After food', 'Drinking', 'Stress', 'Boredom', 'Habit'];
const ICON_BACK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const ICON_CLOSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>';
const ICON_NEXT = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6F747C" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

// ---- Helpers ----

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function errText(e) { return e && e.message ? e.message : String(e); }
function setStatus(text, error) { statusText = { text, error: !!error }; const el = document.getElementById('status'); if (el) { el.textContent = text; el.className = 'status' + (error ? ' error' : ''); } }

function persist() {
  try {
    store.save(entries);
    store.saveSettings(settings);
    store.saveCravings(cravings);
    return true;
  } catch (e) {
    setStatus('save failed: ' + errText(e), true);
    return false;
  }
}
function snapshot() { return JSON.stringify({ entries, settings, cravings }); }
function restore(snap) { const s = JSON.parse(snap); entries = s.entries; settings = s.settings; cravings = s.cravings; persist(); render(); }

function toast(text, undoSnap) {
  clearTimeout(toastTimer);
  $toast.innerHTML = '<div class="toast"><span>' + esc(text) + '</span>' + (undoSnap ? '<button data-act="undo">Undo</button>' : '') + '</div>';
  $toast.dataset.snap = undoSnap || '';
  toastTimer = setTimeout(() => { $toast.innerHTML = ''; }, 6000);
}

function ring(frac, color, size, stroke) {
  const C = 2 * Math.PI * 15, f = Math.max(0, Math.min(1, frac || 0));
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 36 36" aria-hidden="true">' +
    '<circle cx="18" cy="18" r="15" fill="none" stroke="#24282D" stroke-width="' + stroke + '"/>' +
    (f > 0 ? '<circle cx="18" cy="18" r="15" fill="none" stroke="' + color + '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + (f * C).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 18 18)"/>' : '') +
    '</svg>';
}
function mgColor(mg) { return mg > 6 ? 'var(--warn)' : 'var(--accent)'; }
function header(title, sub, back) {
  return '<div class="row"><div class="row" style="justify-content:flex-start">' +
    (back ? '<a class="icon-btn" href="#' + back + '" aria-label="Back">' + ICON_BACK + '</a>' : '') +
    '<div><div class="h1">' + esc(title) + '</div>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div></div>' +
    (back ? '' : '<a class="avatar" href="#profile" aria-label="Profile">J</a>') + '</div>';
}

// A level curve. Past is solid, the projection after now is dashed.
function curveSvg(series, nowTs, opt) {
  const W = opt.w, H = opt.h, from = series[0][0], to = series[series.length - 1][0];
  const all = series.concat(opt.extra || []);
  const max = Math.max(...all.map(p => p[1]), opt.low ? opt.low * 3 : 0, 1e-9);
  const x = t => ((t - from) / (to - from) * W).toFixed(1);
  const y = v => (H - 3 - v / max * (H - 8)).toFixed(1);
  const path = pts => pts.map((p, i) => (i ? 'L' : 'M') + x(p[0]) + ' ' + y(p[1])).join(' ');
  const past = series.filter(p => p[0] <= nowTs), future = series.filter(p => p[0] >= nowTs);
  const nx = x(Math.min(Math.max(nowTs, from), to));
  let s = '<svg width="100%" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="display:block;height:' + H + 'px" aria-hidden="true">';
  if (opt.low) s += '<line x1="0" x2="' + W + '" y1="' + y(opt.low) + '" y2="' + y(opt.low) + '" stroke="#4A4F56" stroke-dasharray="3 5"/>';
  if (past.length > 1) {
    s += '<path d="' + path(past) + ' L' + nx + ' ' + H + ' L0 ' + H + ' Z" fill="rgba(94,224,176,0.14)"/>';
    s += '<path d="' + path(past) + '" fill="none" stroke="#5EE0B0" stroke-width="2.5" stroke-linejoin="round"/>';
  }
  if (future.length > 1) s += '<path d="' + path(future) + '" fill="none" stroke="#5EE0B0" stroke-width="2" stroke-dasharray="4 4" opacity="0.55"/>';
  if (opt.extra && opt.extra.length > 1) s += '<path d="' + path(opt.extra) + '" fill="none" stroke="#F5A04A" stroke-width="2" stroke-dasharray="4 4"/>';
  if (nowTs >= from && nowTs <= to) s += '<line x1="' + nx + '" x2="' + nx + '" y1="0" y2="' + H + '" stroke="#F4F5F6" stroke-width="1.5"/>';
  return s + '</svg>';
}

// ---- Shared state for one render ----

function context() {
  const now = Date.now(), today = dayStart(now);
  const active = entries.find(e => e.outTs === null) || null;
  const plan = planState(entries, settings, now);
  const c = {
    now, today, active, plan,
    base: baselineInfo(entries, settings, now),
    todayStats: dayStats(entries, settings, today, now),
    usual: usualProduct(settings),
    usualMin: usualMinutes(entries),
    after: aftercareState(entries, settings, now)
  };
  c.tip = coachTip({ entries, settings, now, plan, active, today: c.todayStats });
  return c;
}

// Entries as they will be if the active pouch comes out at its usual time.
function projected(c) {
  if (!c.active) return entries;
  return entries.map(e => e === c.active ? { ...e, outTs: Math.max(c.now, e.inTs + c.usualMin * MIN) } : e);
}

// ---- Now ----

function viewNow(c) {
  if (c.after) return viewAftercare(c);
  const sub = fmtDay(c.now) + ' · ' + fmtTime(c.now) + ' · ' +
    (c.plan ? 'Plan week ' + c.plan.week : c.base.complete ? 'Baseline ready' : 'Baseline day ' + c.base.day + ' of 7');
  return header('Today', sub) + weekStrip(c) + pouchCard(c) + (c.plan ? '' : baselineCard(c)) + nicotineCard(c) +
    (c.plan ? scoreAndPlanCards(c) + coachCard(c) : '') +
    '<div class="row" style="margin-top:4px"><div class="label">Today\'s log</div><div class="small">' +
    (c.todayStats.gaps.length ? 'Longest gap ' + fmtMin(Math.max(...c.todayStats.gaps)) : '') +
    (pricesKnown(settings) ? ' · ' + fmtMoney(c.todayStats.spend) : '') + '</div></div>' +
    logList(c.todayStats.list, c) + '<div id="status" class="status' + (statusText.error ? ' error' : '') + '">' + esc(statusText.text) + '</div>';
}

function weekStrip(c) {
  let s = '<div class="week">';
  for (let i = 6; i >= 0; i--) {
    const d = addDays(c.today, -i), st = dayStats(entries, settings, d, c.now);
    const t = targetOn(c.plan, d);
    const ref = t ? (c.plan.mode === 'count' ? t.count : t.mg) : null;
    const val = c.plan && c.plan.mode === 'strength' ? st.mg : st.count;
    const over = ref !== null && val > ref;
    const frac = ref ? val / ref : (val ? 1 : 0);
    const label = new Date(d).toLocaleDateString('en-GB', { weekday: 'short' })[0];
    s += '<button data-act="openDay" data-day="' + d + '" class="' + (i === 0 ? 'today' : '') + '" aria-label="' + esc(fmtDay(d)) + ', ' + st.count + ' pouches">' +
      ring(ref === 0 && val === 0 ? 1 : frac, over ? '#F5A04A' : '#5EE0B0', 30, 4) + label + '</button>';
  }
  return s + '</div>';
}

function pouchCard(c) {
  if (c.active) {
    const p = productFor(c.active, settings), el = (c.now - c.active.inTs) / MIN;
    return '<div class="card"><div class="row"><div class="row" style="gap:8px"><span style="width:8px;height:8px;border-radius:4px;background:var(--accent)"></span><span class="label accent">Pouch in</span></div>' +
      '<div class="small">' + esc(p.name) + ' · ' + fmtTime(c.active.inTs) + '</div></div>' +
      '<div class="row" style="justify-content:flex-start;align-items:baseline;margin-top:8px"><div class="big">' + fmtMin(el) + '</div><div class="body">of your usual ' + c.usualMin + 'm</div></div>' +
      '<div class="track" style="margin-top:12px"><div style="width:' + Math.min(100, el / c.usualMin * 100) + '%;background:' + (el > c.usualMin * 2 ? 'var(--warn)' : 'var(--accent)') + '"></div></div>' +
      '<div class="row" style="margin-top:14px"><button class="btn primary flex" data-act="takeOut"' + (dataLoaded ? '' : ' disabled') + '>Take out</button>' +
      '<button class="btn outline" data-act="openEdit" data-in="' + c.active.inTs + '">Edit</button></div></div>';
  }
  const last = [...entries].reverse().find(e => e.outTs);
  const since = last ? fmtMin((c.now - last.outTs) / MIN) : '–';
  const next = c.plan && last ? last.outTs + c.plan.targets.gap * MIN : null;
  return '<div class="card"><div class="label">No pouch in</div>' +
    '<div class="row" style="justify-content:flex-start;align-items:baseline;margin-top:8px"><div class="big">' + since + '</div><div class="body">since the last one</div></div>' +
    (next && next > c.now ? '<div class="body" style="margin-top:8px">Plan says: next not before ' + fmtTime(next) + '</div>' : '') +
    '<div class="row" style="margin-top:14px"><button class="btn quiet flex" data-act="putIn"' + (dataLoaded ? '' : ' disabled') + '>Put in ' + esc(c.usual.name) + '</button>' +
    '<button class="btn outline accent-line" data-act="openCraving">I\'m craving</button></div></div>';
}

function baselineCard(c) {
  if (!c.base.complete) {
    let dots = '';
    for (let i = 1; i <= 7; i++) dots += '<div style="height:8px;border-radius:4px;background:' + (i < c.base.day ? 'var(--accent)' : i === c.base.day ? 'var(--text)' : '#24282D') + '"></div>';
    return '<div class="card"><div class="label">Baseline · day ' + c.base.day + ' of 7</div>' +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-top:12px">' + dots + '</div>' +
      '<div class="strong" style="font-size:18px;margin-top:14px;line-height:1.3">Use pouches as you normally would, and log every one.</div>' +
      '<div class="body" style="margin-top:8px">No targets yet. The app needs to see your normal before it can help you change it. Your plan and score start after day 7.</div></div>';
  }
  const B = periodStats(entries, settings, c.base.start, c.base.end, c.now);
  return '<div class="card coach"><div class="label accent">Baseline ready</div>' +
    '<div class="strong" style="font-size:18px;margin-top:8px;line-height:1.3">Your normal: ' + B.avgCount.toFixed(1) + ' pouches and ' + Math.round(B.avgMg) + ' mg a day.</div>' +
    '<div class="body" style="margin-top:8px">Average gap ' + fmtMin(B.avgGap) + ', first pouch ' + fmtMin(B.avgFirst) + ' after waking. Start a plan to step down from here to zero.</div>' +
    '<div class="row" style="margin-top:14px"><button class="btn accent flex" data-act="startPlan">Start my plan</button><a class="btn outline" href="#plan">Options</a></div></div>';
}

function nicotineCard(c) {
  const from = c.today + 6 * HOUR, to = addDays(c.today, 1);
  const series = levelSeries(projected(c), from, to, c.now);
  const past = series.filter(p => p[0] <= c.now);
  const peak = Math.max(0, ...past.map(p => p[1]));
  const cur = past.length ? past[past.length - 1][1] : 0;
  const low = lowLevel(entries, c.now);
  const head = peak > 0 ? Math.round(cur / peak * 100) + '% of today\'s peak' : 'None logged today';
  const trend = c.active ? 'Rising while the pouch is in.' : cur < low ? 'Below your low line.' : 'Falling. Halves about every 2 hours.';
  return '<a class="card" href="#nicotine"><div class="row"><div class="label">Nicotine in you</div><span class="tag-chip">ESTIMATE</span></div>' +
    '<div class="num" style="margin-top:6px">' + head + '</div><div class="small">' + trend + '</div>' +
    '<div style="margin-top:10px">' + curveSvg(series, c.now, { w: 310, h: 70, low }) + '</div>' +
    '<div class="axis"><span>06</span><span>12</span><span>18</span><span>24</span></div></a>';
}

function scoreAndPlanCards(c) {
  const sc = scoreAt(entries, settings, c.now, c.plan), t = c.plan.targets;
  const bar = (label, val, max, color) => '<div><div class="row" style="font-size:12px;font-weight:700"><span>' + label + '</span><span>' + val + ' / ' + max + '</span></div>' +
    '<div class="track" style="margin-top:4px"><div style="width:' + (max ? Math.min(100, val / max * 100) : (val ? 100 : 0)) + '%;background:' + (val > max ? 'var(--warn)' : color) + '"></div></div></div>';
  return '<div class="grid2"><a class="card" href="#score"><div class="label">Capacity</div><div class="row" style="justify-content:flex-start;margin-top:10px">' +
    ring(sc ? sc.value / 100 : 0, '#5EE0B0', 54, 4) + '<div><div class="num">' + (sc ? sc.value : '–') + '</div><div style="font-size:12px;font-weight:800;color:var(--accent)">' + (sc ? sc.band : '') + '</div></div></div></a>' +
    '<a class="card" href="#plan"><div class="label">Today vs plan</div><div class="stack" style="margin-top:10px;gap:8px">' +
    bar('Pouches', c.todayStats.count, t.count, 'var(--text)') + bar('Nicotine', c.todayStats.mg, t.mg, 'var(--accent)') + '</div></a></div>';
}

function coachCard(c) {
  if (!c.tip) return '';
  return '<div class="card coach"><div class="label accent">Coach</div>' +
    '<div class="strong" style="font-size:18px;margin-top:6px;line-height:1.3">' + esc(c.tip.title) + '</div>' +
    '<div class="body" style="margin-top:8px">Why: ' + esc(c.tip.why) + '</div>' +
    '<div class="body" style="margin-top:6px;color:var(--soft)">What you get: ' + esc(c.tip.benefit) + '</div>' +
    '<div class="row" style="justify-content:flex-start;margin-top:12px"><a class="btn outline" href="#plan">See plan</a></div></div>';
}

function logList(list, c) {
  if (!list.length) return '<div class="card"><div class="body" style="text-align:center">Nothing logged.</div></div>';
  let s = '<div class="list">';
  [...list].reverse().forEach(e => {
    const p = productFor(e, settings), i = entries.indexOf(e);
    const prev = i > 0 ? entries[i - 1] : null;
    const gap = prev && prev.outTs && dayStart(prev.inTs) === dayStart(e.inTs) ? 'gap before ' + fmtMin((e.inTs - prev.outTs) / MIN) : 'first of the day';
    s += '<button class="list-row" data-act="openEdit" data-in="' + e.inTs + '"><div class="row" style="justify-content:flex-start;gap:12px">' +
      '<span class="mg-pill" style="background:' + mgColor(e.mg) + '">' + e.mg + '</span><div><div style="font-size:14px;font-weight:700">' +
      fmtTime(e.inTs) + ' – ' + (e.outTs ? fmtTime(e.outTs) : 'now') + '</div><div class="small">' + esc(p.name) + ' · ' + gap + (e.tag ? ' · ' + esc(e.tag) : '') + '</div></div></div>' +
      '<div style="font-size:13px;font-weight:700;color:' + (e.outTs ? 'var(--soft)' : 'var(--accent)') + '">' + (e.outTs ? fmtMin((e.outTs - e.inTs) / MIN) : 'In') + '</div></button>';
  });
  return s + '</div>';
}

// ---- Aftercare (no pouch for a day or more) ----

function viewAftercare(c) {
  const a = c.after;
  const phaseIdx = PHASES.findIndex(p => a.sinceMs / DAY < p.to);
  const open = ui.phaseOpen === null ? phaseIdx : ui.phaseOpen;
  let phases = '';
  PHASES.forEach((p, i) => {
    phases += '<button class="list-row" style="border:0;min-height:44px;align-items:flex-start" data-act="phase" data-i="' + i + '"><div class="row" style="justify-content:flex-start;align-items:flex-start;gap:12px;width:100%">' +
      '<span style="width:12px;height:12px;border-radius:6px;margin-top:4px;flex:none;border:2px solid ' + (i <= phaseIdx ? 'var(--accent)' : '#3A3F45') + ';background:' + (i < phaseIdx ? 'var(--accent)' : 'transparent') + '"></span>' +
      '<div style="flex:1"><div class="row"><span style="font-size:14px;font-weight:800;color:' + (i <= phaseIdx ? 'var(--text)' : 'var(--muted)') + '">' + p.when + '</span>' +
      (i === phaseIdx ? '<span class="label accent">You are here</span>' : '') + '</div>' +
      (i === open ? '<div class="body" style="color:var(--soft);margin-top:4px">' + p.text + '</div>' : '') + '</div></div></button>';
  });
  const days = Math.min(14, a.day), bars = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(c.today, -i);
    bars.push(cravings.filter(x => x.ts >= d && x.ts < addDays(d, 1)).length);
  }
  const maxC = Math.max(1, ...bars);
  const stat = (l, v, s) => '<div class="card" style="padding:12px 14px"><div class="label">' + l + '</div><div class="num" style="margin-top:4px">' + v + '</div><div class="small">' + s + '</div></div>';
  return '<div class="row"><div><div class="label accent">Nicotine-free</div><div class="big" style="font-size:56px;margin-top:6px">Day ' + a.day + '</div>' +
    '<div class="sub" style="margin-top:6px">Last pouch ' + fmtDay(a.lastOut) + ', ' + fmtTime(a.lastOut) + '</div></div><a class="avatar" href="#profile" aria-label="Profile">J</a></div>' +
    '<div class="grid2">' +
    stat('Not spent', pricesKnown(settings) ? fmtMoney(a.notSpent) : '–', pricesKnown(settings) ? 'At your previous rate' : 'Add tin prices in Profile') +
    stat('Not used', String(a.notUsed), 'Pouches, about ' + a.notUsedMg + ' mg') +
    stat('Nicotine in you', a.sinceMs > DAY ? 'None' : 'Low', 'Estimate, 2 h half-life') +
    stat('Longest ever', fmtMin(a.longest / MIN).replace(/^(\d+)h.*/, (m, h) => h >= 48 ? Math.floor(h / 24) + ' days' : m), a.record ? 'This is your record' : 'Your record so far') +
    '</div><div class="label" style="margin-top:4px">Where you should be by now</div><div class="list" style="padding:4px 0">' + phases + '</div>' +
    '<div class="small" style="padding:0 4px">The general pattern most people follow. Still to be checked against peer-reviewed sources. Not medical advice.</div>' +
    '<div class="label" style="margin-top:4px">Cravings you logged</div><div class="card"><div class="bars" style="height:64px">' +
    bars.map(v => '<div class="bar" style="height:' + Math.round(v / maxC * 64) + 'px;background:#3A6F5E"></div>').join('') +
    '</div><div class="axis"><span>' + (days === 14 ? '14 days ago' : 'Day 1') + '</span><span>Today</span></div>' +
    '<div class="body" style="color:var(--soft);margin-top:8px">' + cravings.filter(x => x.ts > a.lastOut).length + ' since your last pouch.</div></div>' +
    '<button class="btn outline accent-line full" data-act="openCraving">I\'m craving</button>' +
    '<div id="status" class="status">' + esc(statusText.text) + '</div>';
}

// ---- Nicotine detail ----

function viewNicotine(c) {
  const from = c.today, to = addDays(c.today, 1);
  const base = projected(c);
  const series = levelSeries(base, from, to, c.now);
  const low = lowLevel(entries, c.now);
  const p = c.usual, dur = c.usualMin * MIN;
  const last = [...entries].reverse().find(e => e.outTs);
  const waitAt = c.plan && last ? Math.max(c.now, last.outTs + c.plan.targets.gap * MIN) : c.now + 2 * HOUR;
  const startAt = c.active ? Math.max(c.now, c.active.inTs + dur) : c.now;
  const extraEntry = { now: { inTs: startAt, outTs: startAt + dur, mg: p.mg }, wait: { inTs: waitAt, outTs: waitAt + dur, mg: p.mg } }[ui.scenario];
  const extra = extraEntry ? levelSeries(base.concat([extraEntry]), from, to, c.now).filter(x => x[0] >= c.now) : [];
  const lowAt = s => { const f = s.find(x => x[0] > c.now && x[1] < low && (!extraEntry || x[0] > extraEntry.outTs)); return f ? fmtTime(f[0]) : 'after midnight'; };
  const text = {
    none: 'No more today: your estimate falls below the low line at about ' + lowAt(series) + '.',
    now: 'One more ' + (c.active ? 'straight after this one' : 'now') + ': the level stays up, and drops below low at about ' + lowAt(extra) + '.',
    wait: 'Waiting until ' + fmtTime(waitAt) + ' lets your level fall first. It drops below low at about ' + lowAt(extra) + '.'
  }[ui.scenario];
  const past = series.filter(x => x[0] <= c.now);
  const peakPt = past.reduce((m, x) => x[1] > m[1] ? x : m, [c.now, 0]);
  const marks = c.todayStats.list.map(e => {
    const l = (e.inTs - from) / DAY * 100, w = Math.max(((e.outTs || c.now) - e.inTs) / DAY * 100, 1);
    return '<span style="position:absolute;left:' + l + '%;width:' + w + '%;top:0;height:8px;border-radius:3px;background:' + mgColor(e.mg) + '"></span>';
  }).join('');
  const seg = [['none', 'No more'], ['now', 'One now'], ['wait', 'Wait']].map(s => '<button class="' + (ui.scenario === s[0] ? 'on' : '') + '" data-act="scenario" data-s="' + s[0] + '">' + s[1] + '</button>').join('');
  const stat = (l, v, s) => '<div class="card" style="padding:12px 14px"><div class="label">' + l + '</div><div class="num" style="font-size:20px;margin-top:4px">' + v + '</div><div class="small">' + s + '</div></div>';
  const gaps = c.todayStats.gaps;
  return header('Nicotine in you', fmtDay(c.now) + ' · estimate', 'now') +
    '<div class="card">' + curveSvg(series, c.now, { w: 318, h: 150, low, extra }) +
    '<div style="position:relative;height:8px;margin-top:6px">' + marks + '</div>' +
    '<div class="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div></div>' +
    '<div class="label" style="margin-top:4px">What if</div><div class="segment" style="grid-template-columns:repeat(3,1fr)">' + seg + '</div>' +
    '<div class="body" style="color:var(--soft)">' + esc(text) + '</div>' +
    '<div class="grid2">' +
    stat('Peak today', peakPt[1] > 0 ? fmtTime(peakPt[0]) : '–', 'Highest estimate so far') +
    stat('Below low', fmtMin(hoursBelow(past, low) * 60), 'Today so far') +
    stat('Overnight', fmtMin(overnightLow(entries, c.today, low, c.now) * 60), 'Below low, last night') +
    stat('Longest gap', gaps.length ? fmtMin(Math.max(...gaps)) : '–', c.plan ? 'Target ' + fmtMin(c.plan.targets.gap) : 'Today') +
    '</div><div class="card dashed"><div class="strong" style="font-size:13px">How this is worked out</div><div class="small" style="margin-top:6px">' +
    'Each pouch\'s nicotine is spread evenly over the time it is in your mouth, and the body clears it with a half-life of about 2 hours (Benowitz, Hukkanen and Jacob, 2009). ' +
    'All products are treated as releasing nicotine in proportion to their mg. The low line is 15% of your average daily peak over the last week. ' +
    'Provisional: the absorption model is still being researched. An estimate, not a measurement or medical advice.</div></div>';
}

// ---- Score ----

function viewScore(c) {
  if (!c.plan) return header('Capacity', 'Starts with your plan', 'now') + '<div class="card"><div class="body">The score compares you with your baseline week, so it starts once the baseline is done and your plan has begun.</div></div>';
  const sc = scoreAt(entries, settings, c.now, c.plan);
  const text = { Ready: 'A good day to stretch a gap. You are coping with less than in your baseline week.', Steady: 'Follow the plan as set today.', Hold: 'Keep to the plan, but do not push further today.' }[sc.band];
  let parts = '';
  sc.parts.forEach((p, i) => {
    const col = p.score >= 67 ? 'var(--accent)' : p.score >= 34 ? 'var(--soft)' : 'var(--warn)';
    parts += '<button class="list-row" style="display:block" data-act="scorePart" data-i="' + i + '"><div class="row"><span style="font-size:14px;font-weight:700">' + p.label + '</span><span style="font-size:13px;font-weight:800;color:' + col + '">' + p.value + '</span></div>' +
      '<div class="track" style="margin-top:8px"><div style="width:' + p.score + '%;background:' + col + '"></div></div>' +
      (ui.scoreOpen === i ? '<div class="small" style="margin-top:8px">' + esc(p.why) + '</div>' : '') + '</button>';
  });
  const trend = [];
  for (let i = 27; i >= 0; i--) {
    const t = Math.min(c.now, addDays(c.today, -i + 1) - 1);
    if (t < c.plan.start) { trend.push(null); continue; }
    const s = scoreAt(entries, settings, t, planState(entries, settings, t));
    trend.push(s ? s.value : null);
  }
  const bands = [['0–33 Hold', 'Keep to the plan. Do not cut today.', 'var(--warn)', 'Hold'], ['34–66 Steady', 'Follow the plan as set.', 'var(--soft)', 'Steady'], ['67–100 Ready', 'Room to go further today.', 'var(--accent)', 'Ready']];
  return header('Capacity', 'Working name · provisional formula', 'now') +
    '<div style="display:flex;flex-direction:column;align-items:center;gap:8px"><div style="position:relative;width:180px;height:180px">' + ring(sc.value / 100, '#5EE0B0', 180, 2.6) +
    '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="label">Capacity</div><div class="big" style="font-size:56px">' + sc.value + '</div><div style="font-size:14px;font-weight:800;color:var(--accent)">' + sc.band + '</div></div></div>' +
    '<div class="strong" style="text-align:center;line-height:1.45;max-width:300px">' + text + '</div></div>' +
    '<div class="grid3">' + bands.map(b => '<div class="card" style="padding:8px 10px;border-radius:12px' + (b[3] === sc.band ? ';border-color:var(--accent-line)' : '') + '"><div style="font-size:11px;font-weight:800;color:' + b[2] + '">' + b[0] + '</div><div class="small" style="font-size:11px;margin-top:2px">' + b[1] + '</div></div>').join('') + '</div>' +
    '<div class="label" style="margin-top:4px">What makes up today\'s score</div><div class="list">' + parts + '</div>' +
    '<div class="label" style="margin-top:4px">Last 4 weeks</div><div class="card"><div class="bars" style="height:70px;gap:3px">' +
    trend.map(v => '<div class="bar" style="height:' + (v === null ? 2 : Math.round(v / 100 * 70)) + 'px;background:' + (v === null ? '#24282D' : v >= 67 ? '#5EE0B0' : v >= 34 ? '#C9CCD1' : '#F5A04A') + '"></div>').join('') +
    '</div><div class="axis"><span>4 weeks ago</span><span>Today</span></div></div>' +
    '<div class="card dashed small">The score is the average of the parts above, each scored 0 to 100 against your baseline week. The parts and weights are provisional until the evidence review. Guidance, not medical advice.</div>';
}

// ---- Plan ----

function viewPlan(c) {
  if (!c.plan) {
    if (!c.base.complete) return header('Plan', 'Starts after your baseline week') + '<div class="card"><div class="strong">Baseline day ' + c.base.day + ' of 7</div><div class="body" style="margin-top:8px">Log as normal for 7 days. Then the plan steps you down from your own normal, week by week, to zero.</div></div>';
    return header('Plan', 'Your baseline week is ready') + planOptions() + '<button class="btn accent full" data-act="startPlan">Start my plan today</button>';
  }
  const p = c.plan, count = p.mode === 'count', t = p.targets;
  const vals = [count ? Math.round(p.B.avgCount * 10) / 10 : Math.round(p.B.avgMg)];
  for (let l = 1; l <= p.N; l++) vals.push(count ? targetsFor(p.B, l, p.N).count : targetsFor(p.B, l, p.N).mg);
  const max = Math.max(...vals, 1);
  let bars = '', labels = '';
  vals.forEach((v, i) => {
    const cur = i === p.level, done = i < p.level;
    bars += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:4px"><div style="font-size:10px;font-weight:800;color:' + (cur ? 'var(--text)' : 'var(--label)') + '">' + v + '</div>' +
      '<div style="width:100%;border-radius:5px 5px 2px 2px;height:' + Math.max(3, Math.round(v / max * 84)) + 'px;background:' + (cur ? 'var(--accent)' : done ? '#3A3F45' : 'transparent') + ';border:' + (cur || done ? '0' : '1px dashed #4A4F56') + '"></div></div>';
    labels += '<div style="flex:1;text-align:center;color:' + (cur ? 'var(--text)' : 'var(--label)') + '">' + (i === 0 ? 'Base' : 'S' + i) + '</div>';
  });
  const row = (l, s, v) => '<div class="list-row"><div><div style="font-size:14px;font-weight:700">' + l + '</div><div class="small">' + s + '</div></div><div class="strong">' + v + '</div></div>';
  const lastWeek = p.history[p.history.length - 1];
  return header('Plan', 'Week ' + p.week + ' · step ' + p.level + ' of ' + p.N + ' · zero by ' + fmtDay(p.zeroBy)) +
    '<div class="segment" style="grid-template-columns:1fr 1fr"><button class="' + (count ? 'on' : '') + '" data-act="planMode" data-m="count">Step down count</button><button class="' + (count ? '' : 'on') + '" data-act="planMode" data-m="strength">Step down strength</button></div>' +
    '<div class="card"><div style="display:flex;align-items:flex-end;gap:6px;height:110px">' + bars + '</div><div style="display:flex;gap:6px;margin-top:6px;font-size:10px;font-weight:700">' + labels + '</div>' +
    '<div class="small" style="margin-top:10px">' + (count ? 'Pouches a day' : 'Milligrams a day') + ' at each step. A step moves on after a week that meets its target, and is held for another week if not.</div></div>' +
    '<div class="label" style="margin-top:4px">This week</div><div class="list">' +
    (count ? row('Pouches a day', 'Baseline ' + p.B.avgCount.toFixed(1), String(t.count)) : row('Nicotine a day', 'Baseline ' + Math.round(p.B.avgMg) + ' mg', t.mg + ' mg')) +
    row('Gap between', 'At least, during the day', fmtMin(t.gap)) + row('First pouch', 'After waking (' + settings.wakeTime + ')', fmtMin(t.first) + '+') + '</div>' +
    '<div class="body" style="padding:0 4px">Why these: they step down evenly from your baseline week to zero over ' + p.N + ' steps. ' +
    (lastWeek ? (lastWeek.met ? 'Last week met its target, so the plan moved on.' : 'Last week went over its target, so this step is held.') : 'This is your first week.') +
    ' The gap and first-pouch targets are provisional.</div>' + nextTinCard(c) + reviewCard(c) +
    '<div class="label" style="margin-top:4px">Plan settings</div>' + planOptions() +
    '<button class="btn outline full" data-act="restartPlan">Restart the plan from today</button>';
}

function planOptions() {
  return '<div class="list"><div class="list-row"><div><div style="font-size:14px;font-weight:700">Length</div><div class="small">Steps from baseline to zero, one a week</div></div>' +
    '<div class="row" style="gap:6px">' + [6, 8, 10, 12].map(w => '<button class="pill' + (settings.plan.weeks === w ? ' on' : '') + '" data-act="planWeeks" data-w="' + w + '">' + w + '</button>').join('') + '</div></div></div>';
}

function nextTinCard(c) {
  const p = c.usual;
  if (p.left === null || p.left > 5) return '';
  const recent = entriesBetween(entries, addDays(c.today, -7), c.now + 1);
  const strongest = Math.max(0, ...recent.map(e => e.mg));
  const lower = settings.products.filter(x => x.mg < strongest).sort((a, b) => b.mg - a.mg)[0];
  const suggest = c.plan.mode === 'strength' && lower ? lower : p;
  return '<div class="card coach"><div class="label accent">Next tin</div><div class="strong" style="font-size:17px;margin-top:6px;line-height:1.35">' +
    esc(p.name) + ': ' + p.left + ' left. Buy ' + esc(suggest.name) + ' next' + (suggest !== p ? ', not ' + strongest + ' mg.' : '.') + '</div>' +
    '<div class="body" style="margin-top:8px">Why: ' + (suggest !== p ? 'your plan is stepping down strength. Buying lower now makes the step automatic.' : 'this keeps you on the same product while the count comes down.') + '</div></div>';
}

function reviewCard(c) {
  const h = c.plan.history;
  if (!h.length) return '';
  const w = h[h.length - 1], prev = h.length > 1 ? h[h.length - 2].stats : c.plan.B, s = w.stats;
  const pct = prev.avgMg ? Math.round((1 - s.avgMg / prev.avgMg) * 100) : 0;
  const over = s.days.filter(d => !onTarget(c.plan, d));
  const tags = {};
  over.forEach(d => d.list.forEach(e => { if (e.tag) tags[e.tag] = (tags[e.tag] || 0) + 1; }));
  const topTag = Object.keys(tags).sort((a, b) => tags[b] - tags[a])[0];
  const item = (col, t) => '<div class="row" style="justify-content:flex-start;align-items:flex-start;gap:10px"><span style="width:6px;height:6px;border-radius:3px;background:' + col + ';margin-top:7px;flex:none"></span><div class="body" style="color:var(--soft)">' + t + '</div></div>';
  return '<div class="label" style="margin-top:4px">Last week\'s review</div><div class="card stack">' +
    item(pct >= 0 ? 'var(--accent)' : 'var(--warn)', 'Daily nicotine ' + (pct >= 0 ? 'down ' : 'up ') + Math.abs(pct) + '% on the week before: ' + Math.round(s.avgMg) + ' mg a day.') +
    (s.avgFirst !== null && prev.avgFirst !== null ? item('var(--accent)', 'First pouch after waking: ' + fmtMin(prev.avgFirst) + ' → ' + fmtMin(s.avgFirst) + '.') : '') +
    item(over.length ? 'var(--warn)' : 'var(--accent)', over.length ? over.length + ' day' + (over.length > 1 ? 's' : '') + ' over target (' + over.map(d => new Date(d.day).toLocaleDateString('en-GB', { weekday: 'short' })).join(', ') + ')' + (topTag ? ', mostly tagged "' + esc(topTag) + '"' : '') + '.' : 'Every day on target.') +
    (pricesKnown(settings) ? item('var(--muted)', fmtMoney(s.avgSpend * 7) + ' spent.') : '') + '</div>';
}

// ---- History ----

function viewHistory(c) {
  const n = ui.range === 'week' ? 7 : 30;
  const from = addDays(c.today, -(n - 1)), to = addDays(c.today, 1);
  const st = periodStats(entries, settings, from, to, c.now);
  const prev = periodStats(entries, settings, addDays(from, -n), from, c.now);
  const mgMode = c.plan && c.plan.mode === 'strength';
  const vals = st.days.map(d => mgMode ? d.mg : d.count);
  const tgts = st.days.map(d => { const t = targetOn(c.plan, d.day); return t ? (mgMode ? t.mg : t.count) : null; });
  const max = Math.max(1, ...vals, ...tgts.filter(x => x !== null));
  const avg = mgMode ? st.avgMg : st.avgCount, pAvg = mgMode ? prev.avgMg : prev.avgCount;
  const change = pAvg ? Math.round((avg / pAvg - 1) * 100) : null;
  const low = lowLevel(entries, c.now);
  const freeHours = mean(st.days.filter(d => d.day < c.today).map(d => hoursBelow(levelSeries(entries, d.day, addDays(d.day, 1), c.now), low)));
  const stat = (l, v, s) => '<div class="card" style="padding:12px 14px"><div class="label">' + l + '</div><div class="num" style="font-size:20px;margin-top:4px">' + v + '</div><div class="small">' + s + '</div></div>';
  let days = '';
  [...st.days].reverse().forEach(d => {
    const ok = onTarget(c.plan, d);
    days += '<button class="list-row" data-act="openDay" data-day="' + d.day + '"><div><div style="font-size:14px;font-weight:700">' + (d.day === c.today ? 'Today' : fmtDay(d.day)) + '</div>' +
      '<div class="small">' + d.count + ' pouch' + (d.count === 1 ? '' : 'es') + ' · ' + fmtMin(d.timeIn / MIN) + ' in' + (ok === false ? ' · over target' : '') + '</div></div>' +
      '<div class="row" style="gap:10px"><span style="font-size:14px;font-weight:800;color:' + (ok === false ? 'var(--warn)' : 'var(--text)') + '">' + d.mg + ' mg</span>' + ICON_NEXT + '</div></button>';
  });
  return header('History', '') +
    '<div class="segment" style="grid-template-columns:1fr 1fr"><button class="' + (n === 7 ? 'on' : '') + '" data-act="range" data-r="week">Week</button><button class="' + (n === 30 ? 'on' : '') + '" data-act="range" data-r="month">Month</button></div>' +
    '<div class="card"><div class="row" style="align-items:flex-start"><div><div class="label">Average a day</div><div class="row" style="justify-content:flex-start;align-items:baseline;gap:6px;margin-top:4px"><div class="num" style="font-size:32px">' + (mgMode ? Math.round(avg) : avg.toFixed(1)) + '</div><div class="body" style="font-weight:700">' + (mgMode ? 'mg' : 'pouches') + '</div></div></div>' +
    (change !== null ? '<div style="padding:6px 10px;border-radius:10px;font-size:12px;font-weight:800;background:' + (change <= 0 ? 'var(--accent-dim);color:var(--accent)' : 'rgba(245,160,74,0.12);color:var(--warn)') + '">' + (change <= 0 ? '−' : '+') + Math.abs(change) + '% vs previous ' + ui.range + '</div>' : '') + '</div>' +
    '<div class="bars" style="height:120px;margin-top:16px;gap:' + (n === 7 ? 10 : 3) + 'px">' +
    vals.map((v, i) => '<div class="bar" style="height:' + Math.round(v / max * 120) + 'px;background:' + (tgts[i] !== null && v > tgts[i] ? 'var(--warn)' : 'var(--accent)') + '"></div>').join('') + '</div>' +
    '<div class="axis"><span>' + fmtDay(from) + '</span><span>Today</span></div></div>' +
    '<div class="grid2">' + stat('Pouches', st.avgCount.toFixed(1) + ' a day', st.total + ' in total') + stat('Time in', fmtMin(st.avgDuration), 'Average per pouch') +
    stat('Nicotine-free', fmtMin((freeHours || 0) * 60), 'Below low, per full day') + stat('Spent', pricesKnown(settings) ? fmtMoney(st.avgSpend * n) : '–', pricesKnown(settings) ? 'This ' + ui.range : 'Add prices in Profile') + '</div>' +
    '<div class="label" style="margin-top:4px">Days</div><div class="list">' + days + '</div>';
}

// ---- Profile ----

function viewProfile(c) {
  const first = entries.length ? fmtDay(entries[0].inTs) : null;
  let products = '';
  settings.products.forEach(p => {
    const ppp = pricePerPouch(p);
    products += '<div class="list-row"><div><div style="font-size:14px;font-weight:700">' + esc(p.name) + (p.id === settings.usualProductId ? ' · usual' : '') + '</div>' +
      '<div class="small">' + p.mg + ' mg · ' + (p.price ? fmtMoney(p.price) + ' for ' + p.perTin + ' · ' + Math.round(ppp * 100) + 'p a pouch' : 'no price set') + (p.left !== null ? ' · ' + p.left + ' left' : '') + '</div></div>' +
      '<div class="row" style="gap:6px"><button class="pill" data-act="newTin" data-id="' + esc(p.id) + '">New tin</button><button class="pill" data-act="openProduct" data-id="' + esc(p.id) + '">Edit</button></div></div>';
  });
  const t = c.plan ? c.plan.targets : null;
  return header('Profile', first ? 'Tracking since ' + first : '', 'now') +
    '<div class="label" style="margin-top:6px">Your plan</div>' +
    (c.plan ? '<a class="card coach" href="#plan"><div class="row"><div class="strong">Week ' + c.plan.week + ' · step ' + c.plan.level + ' of ' + c.plan.N + ' · ' + (c.plan.mode === 'count' ? 'step down count' : 'step down strength') + '</div><span style="font-size:13px;font-weight:800;color:var(--accent)">Open</span></div>' +
      '<div class="small" style="margin-top:4px">This week: ' + (c.plan.mode === 'count' ? t.count + ' pouches' : t.mg + ' mg') + ' a day, gaps of ' + fmtMin(t.gap) + '. Zero by ' + fmtDay(c.plan.zeroBy) + '.</div></a>'
      : '<a class="card" href="#plan"><div class="strong">' + (c.base.complete ? 'Baseline ready. Start your plan.' : 'Baseline day ' + c.base.day + ' of 7') + '</div></a>') +
    '<div class="label" style="margin-top:6px">You</div><div class="list"><div class="list-row"><div><div style="font-size:14px;font-weight:700">Usual pouch</div><div class="small">One tap on Now puts this in</div></div>' +
    '<select data-act-change="usual" style="background:#24282D;border:1px solid var(--line);border-radius:12px;height:44px;padding:0 10px;font-weight:700;color-scheme:dark">' +
    settings.products.map(p => '<option value="' + esc(p.id) + '"' + (p.id === settings.usualProductId ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></div>' +
    '<div class="list-row"><div><div style="font-size:14px;font-weight:700">Wake time</div><div class="small">For "first pouch after waking"</div></div><input type="time" value="' + settings.wakeTime + '" data-act-change="wake" style="background:#24282D;border:1px solid var(--line);border-radius:12px;height:44px;padding:0 10px;font-weight:700;color-scheme:dark"></div>' +
    '<div class="list-row"><div><div style="font-size:14px;font-weight:700">Check-ins</div><div class="small">Shown when you open the app after a pouch-free stretch. Phone notifications are not built yet.</div></div><button class="pill' + (settings.checkins ? ' on' : '') + '" data-act="toggleCheckins">' + (settings.checkins ? 'On' : 'Off') + '</button></div></div>' +
    '<div class="label" style="margin-top:6px">Products and tins</div><div class="list">' + products + '</div>' +
    '<button class="btn outline full" data-act="openProduct" data-id="">Add a product</button>' +
    '<div class="label" style="margin-top:6px">Data</div><div class="row"><button class="btn outline flex" data-act="export">Export backup</button><button class="btn outline flex" data-act="import">Import backup</button></div>' +
    '<button class="btn outline full" data-act="sheetImport">Re-import from Google Sheet</button>' +
    '<div class="small">' + entries.length + ' entries stored on this device' + (first ? ' (since ' + first + ')' : '') + '. Data lives in this browser only. Export a backup regularly.</div>' +
    '<div id="status" class="status' + (statusText.error ? ' error' : '') + '">' + esc(statusText.text) + '</div>';
}

// ---- Overlays ----

function closeBtn() { return '<button class="icon-btn" data-act="close" aria-label="Close">' + ICON_CLOSE + '</button>'; }

function renderOverlay() {
  if (!overlay) { $overlay.innerHTML = ''; return; }
  const c = context();
  const body = {
    log: overlayLog, edit: overlayEdit, craving: overlayCraving, stillIn: overlayStillIn,
    hadNone: overlayHadNone, day: overlayDay, product: overlayProduct
  }[overlay.type](c);
  $overlay.innerHTML = '<div class="scrim" data-act="scrim">' + body + '</div>';
}

function productChoices(selectedId) {
  return '<div class="grid3">' + settings.products.map(p => '<button class="choice' + (p.id === selectedId ? ' on' : '') + '" data-act="pickProduct" data-id="' + esc(p.id) + '">' + esc(p.name) + '</button>').join('') + '</div>';
}
function tagChoices(sel) {
  return '<div class="wrap">' + TAGS.map(t => '<button class="pill' + (sel === t ? ' on' : '') + '" data-act="pickTag" data-t="' + t + '">' + t + '</button>').join('') + '</div>';
}
function toLocalInput(ts) {
  const d = new Date(ts - new Date(ts).getTimezoneOffset() * MIN);
  return d.toISOString().slice(0, 16);
}

function overlayLog(c) {
  const o = overlay, p = settings.products.find(x => x.id === o.productId) || c.usual;
  const durs = [[c.usualMin, 'Usual ' + c.usualMin + 'm'], [20, '20m'], [45, '45m'], [-1, 'Still in']];
  const blocked = o.when === 'now' && c.active;
  return '<div class="sheet"><div class="grab"></div><div class="row"><div class="h1" style="font-size:22px">Log a pouch</div>' + closeBtn() + '</div>' +
    '<div class="label">Product</div>' + productChoices(p.id) +
    '<div class="small">' + esc(p.name) + (p.left !== null ? ' · ' + p.left + ' left in the tin' : '') + '. <a href="#profile" data-act="close" style="color:var(--accent)">Manage products</a></div>' +
    '<div class="label">When</div><div class="grid2"><button class="choice' + (o.when === 'now' ? ' on' : '') + '" data-act="when" data-w="now">Now</button><button class="choice' + (o.when === 'earlier' ? ' on' : '') + '" data-act="when" data-w="earlier">Earlier</button></div>' +
    (o.when === 'now' ? '<div class="body">' + (blocked ? 'A pouch is already in. Take it out first, or log this one as earlier.' : 'Starts the timer now. You take it out from the Now screen.') + '</div>'
      : '<div class="field"><div><div class="label">In</div></div><input type="datetime-local" id="logIn" value="' + toLocalInput(o.inTs) + '" data-bind="inTs"></div>' +
        '<div class="label">Time in mouth</div><div class="grid2" style="grid-template-columns:repeat(4,1fr)">' +
        durs.map(d => '<button class="choice' + (o.dur === d[0] ? ' on' : '') + '" data-act="dur" data-d="' + d[0] + '">' + d[1] + '</button>').join('') + '</div>' +
        '<div class="field"><div><div class="label">Or minutes in</div></div><input type="number" min="1" max="600" id="logDur" value="' + (o.dur > 0 ? o.dur : '') + '" placeholder="min" data-bind="dur" style="width:90px"></div>') +
    '<div class="label">Why now? (optional)</div>' + tagChoices(o.tag) +
    '<button class="btn primary full" data-act="saveLog"' + (blocked ? ' disabled' : '') + '>' +
    (o.when === 'now' ? 'Put in ' + esc(p.name) + ' now' : 'Save ' + esc(p.name) + ', ' + fmtTime(o.inTs)) + '</button></div>';
}

function overlayEdit(c) {
  const o = overlay;
  const dur = o.outTs ? Math.round((o.outTs - o.inTs) / MIN) : null;
  return '<div class="panel"><div class="row"><div><div class="h1" style="font-size:20px">Edit pouch</div><div class="sub">' + fmtDay(o.inTs) + '</div></div>' + closeBtn() + '</div>' +
    productChoices(o.productId) +
    '<div class="field"><div class="label">In</div><input type="datetime-local" value="' + toLocalInput(o.inTs) + '" data-bind="inTs"></div>' +
    '<div class="field"><div class="label">Out</div><input type="datetime-local" value="' + (o.outTs ? toLocalInput(o.outTs) : '') + '" data-bind="outTs"></div>' +
    '<div class="row body"><span>In for</span><span style="color:var(--text)">' + (dur === null ? 'still in' : dur < 0 ? 'out is before in' : fmtMin(dur)) + '</span></div>' +
    '<div class="label">Why (optional)</div>' + tagChoices(o.tag) +
    '<div class="row"><button class="btn danger" data-act="deleteEntry">' + (o.confirmDelete ? 'Tap again to delete' : 'Delete') + '</button><button class="btn primary flex" data-act="saveEdit"' + (dur !== null && dur < 0 ? ' disabled' : '') + '>Save changes</button></div></div>';
}

function overlayCraving() {
  const o = overlay;
  if (o.stage === 'passed') {
    const since = cravings.filter(x => x.outcome === 'passed').length;
    return '<div class="sheet"><div class="grab"></div><div class="h1">Passed.</div><div class="body" style="font-size:16px;color:var(--soft)">That is ' + since + ' craving' + (since === 1 ? '' : 's') + ' logged that passed without a pouch.</div><button class="btn primary full" data-act="close">Done</button></div>';
  }
  if (o.stage === 'had') {
    return '<div class="sheet"><div class="grab"></div><div class="h1" style="font-size:24px">Logged honestly. Your progress stays.</div>' +
      '<div class="body" style="font-size:15px;color:var(--soft)">One pouch does not undo the time before it. Your record stays, and the plan picks up from here.</div>' +
      '<button class="btn primary full" data-act="cravingLog">Log the pouch</button><button class="btn outline full" data-act="close">Not now</button></div>';
  }
  const C = 2 * Math.PI * 15;
  return '<div class="sheet"><div class="grab"></div><div class="row"><div class="label accent">Craving logged · ' + fmtTime(o.ts) + '</div>' + closeBtn() + '</div>' +
    '<div style="display:flex;justify-content:center"><div style="position:relative;width:180px;height:180px">' +
    '<svg width="180" height="180" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" fill="none" stroke="#1E2125" stroke-width="2.4"/><circle id="cravRing" cx="18" cy="18" r="15" fill="none" stroke="#5EE0B0" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="' + (o.left / 300 * C).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 18 18)"/></svg>' +
    '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><div class="big" id="cravClock">' + Math.floor(o.left / 60) + ':' + String(o.left % 60).padStart(2, '0') + '</div><div class="small">give it 5 minutes</div></div></div></div>' +
    '<div class="strong" style="font-size:17px;text-align:center;line-height:1.35">A craving rises, peaks and fades.</div>' +
    '<div class="body" style="text-align:center">Drink some water, step outside, or change what you are doing. How long cravings last is still being researched.</div>' +
    '<button class="btn quiet full" data-act="cravTimer">' + (o.running ? 'Pause' : o.left === 300 ? 'Start 5 minutes' : o.left === 0 ? 'Finished' : 'Resume') + '</button>' +
    '<div class="label">What set it off? (optional)</div>' + tagChoices(o.tag) +
    '<div class="grid2"><button class="btn accent" data-act="cravPassed">It passed</button><button class="btn outline" data-act="cravHad">I had a pouch</button></div></div>';
}

function overlayStillIn(c) {
  const a = c.active, el = a ? (c.now - a.inTs) / MIN : 0;
  if (!a) return '<div class="panel"><div class="strong">No pouch is in.</div><button class="btn primary" data-act="close">OK</button></div>';
  const o = overlay;
  return '<div class="panel"><div class="h1" style="font-size:22px">Still in?</div>' +
    '<div class="body" style="font-size:14px">Your ' + esc(productFor(a, settings).name) + ' went in at ' + fmtTime(a.inTs) + '. That is ' + fmtMin(el) + ', about ' + (el / c.usualMin).toFixed(1) + ' times your usual ' + c.usualMin + 'm.</div>' +
    '<button class="btn primary full" data-act="outAt" data-ts="' + (a.inTs + c.usualMin * MIN) + '">I took it out at ' + fmtTime(a.inTs + c.usualMin * MIN) + '</button>' +
    '<div class="field"><div class="label">Out at</div><input type="datetime-local" value="' + toLocalInput(o.outTs) + '" data-bind="outTs"><button class="pill" data-act="outAt" data-ts="">Save</button></div>' +
    '<button class="btn outline full" data-act="keepIn">Yes, still in</button></div>';
}

function overlayHadNone(c) {
  const a = c.after;
  if (!a) return '<div class="panel"><div class="strong">Nothing to confirm.</div><button class="btn primary" data-act="close">OK</button></div>';
  if (overlay.stage === 'unsure') {
    return '<div class="panel"><div class="h1" style="font-size:22px">Roughly how many, if any?</div><div class="grid2" style="grid-template-columns:repeat(4,1fr)">' +
      ['1–2', '3–5', '6–10', 'More'].map(x => '<button class="choice" data-act="approx" data-x="' + x + '">' + x + '</button>').join('') + '</div>' +
      '<div class="body">A rough number is better than none. It is saved as approximate and your progress is not reset. To log exact pouches, use "Log a pouch" with Earlier.</div>' +
      '<button class="btn outline" data-act="hadAsk">Back</button></div>';
  }
  const d = Math.floor(a.sinceMs / DAY), h = Math.floor((a.sinceMs % DAY) / HOUR);
  return '<div class="panel"><div class="label accent">Check-in · day ' + a.day + '</div>' +
    '<div class="h1" style="font-size:24px;line-height:1.2">No pouch logged since ' + fmtDay(a.lastOut) + ', ' + fmtTime(a.lastOut) + '.</div>' +
    '<div class="body" style="font-size:15px">That is ' + d + ' day' + (d === 1 ? '' : 's') + ' and ' + h + ' hours. Before the app says where you should be by now, it needs to know this is real.</div>' +
    '<div class="strong" style="font-size:20px">Have you had none?</div>' +
    '<button class="btn accent full" data-act="confirmNone">None. Count it.</button>' +
    '<button class="btn outline full" data-act="hadSome">I had some. Let me log them.</button>' +
    '<button class="btn outline full" style="border:0;color:var(--muted)" data-act="hadUnsure">Not sure</button></div>';
}

function overlayDay(c) {
  const st = dayStats(entries, settings, overlay.day, c.now);
  return '<div class="panel"><div class="row"><div><div class="h1" style="font-size:20px">' + (overlay.day === c.today ? 'Today' : fmtDay(overlay.day)) + '</div>' +
    '<div class="sub">' + st.count + ' pouches · ' + st.mg + ' mg · ' + fmtMin(st.timeIn / MIN) + ' in' + (pricesKnown(settings) ? ' · ' + fmtMoney(st.spend) : '') + '</div></div>' + closeBtn() + '</div>' +
    logList(st.list, c) + '<button class="btn outline full" data-act="logForDay">Add a pouch to this day</button></div>';
}

function overlayProduct() {
  const o = overlay;
  const f = (label, key, type, extra) => '<div class="field"><div class="label">' + label + '</div><input type="' + type + '" value="' + esc(o[key] === null || o[key] === undefined ? '' : o[key]) + '" data-bind="' + key + '" ' + (extra || '') + '></div>';
  return '<div class="panel"><div class="row"><div class="h1" style="font-size:20px">' + (o.id ? 'Edit product' : 'Add a product') + '</div>' + closeBtn() + '</div>' +
    f('Name', 'name', 'text', 'placeholder="e.g. Zyn Cool Mint"') + f('Strength (mg)', 'mg', 'number', 'min="0" step="0.5"') +
    f('Pouches per tin', 'perTin', 'number', 'min="1"') + f('Price per tin (£)', 'price', 'number', 'min="0" step="0.01"') +
    f('Left in current tin', 'left', 'number', 'min="0" placeholder="not tracked"') +
    '<div class="row">' + (o.id && settings.products.length > 1 ? '<button class="btn danger" data-act="deleteProduct">' + (o.confirmDelete ? 'Tap again' : 'Delete') + '</button>' : '') +
    '<button class="btn primary flex" data-act="saveProduct">Save</button></div></div>';
}

// ---- Actions ----

function open(type, data) { overlay = Object.assign({ type }, data || {}); renderOverlay(); }
function close() { overlay = null; clearInterval(cravingTimer); renderOverlay(); render(); }

function findEntry(inTs) { return entries.find(e => e.inTs === Number(inTs)); }
function uniqueIn(ts, except) { while (entries.some(e => e.inTs === ts && e !== except)) ts += 1; return ts; }
function useFromTin(productId) {
  const p = settings.products.find(x => x.id === productId);
  if (p && p.left !== null && p.left > 0) p.left -= 1;
}
function addEntry(e) {
  e.inTs = uniqueIn(e.inTs);
  entries.push(e);
  entries.sort((a, b) => a.inTs - b.inTs);
  useFromTin(e.productId);
}

const actions = {
  undo() { const s = $toast.dataset.snap; if (s) restore(s); $toast.innerHTML = ''; },
  close() { close(); },
  scrim(t, ev) { if (ev.target === t) close(); },
  putIn() {
    const snap = snapshot(), p = usualProduct(settings);
    addEntry({ inTs: Date.now(), outTs: null, mg: p.mg, productId: p.id });
    if (persist()) { setStatus('saved'); toast(p.name + ' in', snap); }
    render();
  },
  takeOut() {
    const a = entries.find(e => e.outTs === null);
    if (!a) return;
    const snap = snapshot();
    a.outTs = Date.now();
    if (persist()) { setStatus('saved'); toast('Out after ' + fmtMin((a.outTs - a.inTs) / MIN), snap); }
    render();
  },
  openLog() {
    const c = context();
    open('log', { productId: c.usual.id, when: c.active ? 'earlier' : 'now', inTs: Date.now() - HOUR, dur: c.usualMin, tag: null });
  },
  logForDay() {
    const c = context(), d = overlay.day;
    open('log', { productId: c.usual.id, when: 'earlier', inTs: d === c.today ? Date.now() - HOUR : d + 12 * HOUR, dur: c.usualMin, tag: null });
  },
  pickProduct(t) { overlay.productId = t.dataset.id; renderOverlay(); },
  pickTag(t) { overlay.tag = overlay.tag === t.dataset.t ? null : t.dataset.t; renderOverlay(); },
  when(t) { overlay.when = t.dataset.w; renderOverlay(); },
  dur(t) { overlay.dur = Number(t.dataset.d); renderOverlay(); },
  saveLog() {
    const o = overlay, p = settings.products.find(x => x.id === o.productId) || usualProduct(settings);
    const snap = snapshot();
    if (o.when === 'now') {
      if (entries.some(e => e.outTs === null)) return;
      addEntry({ inTs: Date.now(), outTs: null, mg: p.mg, productId: p.id, ...(o.tag ? { tag: o.tag } : {}) });
    } else {
      const inTs = Number(o.inTs);
      if (isNaN(inTs) || inTs > Date.now()) { setStatus('the in time must be in the past', true); return; }
      const still = o.dur === -1;
      if (still && entries.some(e => e.outTs === null)) { setStatus('a pouch is already in', true); return; }
      const outTs = still ? null : Math.min(Date.now(), inTs + Math.max(1, Number(o.dur) || 30) * MIN);
      addEntry({ inTs, outTs, mg: p.mg, productId: p.id, ...(o.tag ? { tag: o.tag } : {}) });
    }
    if (persist()) { setStatus('saved'); toast('Logged ' + p.name, snap); }
    close();
  },
  openEdit(t) {
    const e = findEntry(t.dataset.in);
    if (!e) return;
    open('edit', { ref: e.inTs, inTs: e.inTs, outTs: e.outTs, productId: productFor(e, settings).id, tag: e.tag || null, confirmDelete: false });
  },
  saveEdit() {
    const o = overlay, e = findEntry(o.ref), p = settings.products.find(x => x.id === o.productId);
    if (!e) return close();
    if (o.outTs && o.outTs < o.inTs) return;
    if (o.outTs === null && entries.some(x => x.outTs === null && x !== e)) { setStatus('another pouch is already in', true); return; }
    const snap = snapshot();
    e.inTs = uniqueIn(Number(o.inTs), e);
    e.outTs = o.outTs ? Number(o.outTs) : null;
    if (p) { e.productId = p.id; e.mg = p.mg; }
    if (o.tag) e.tag = o.tag; else delete e.tag;
    entries.sort((a, b) => a.inTs - b.inTs);
    if (persist()) { setStatus('saved'); toast('Changes saved', snap); }
    close();
  },
  deleteEntry() {
    if (!overlay.confirmDelete) { overlay.confirmDelete = true; renderOverlay(); return; }
    const snap = snapshot();
    entries = entries.filter(e => e.inTs !== overlay.ref);
    if (persist()) { setStatus('deleted'); toast('Entry deleted', snap); }
    close();
  },
  openCraving() {
    const ts = Date.now();
    cravings.push({ ts });
    persist();
    open('craving', { ts, left: 300, running: false, tag: null, stage: 'timer' });
  },
  cravTimer() {
    const o = overlay;
    if (o.running) { clearInterval(cravingTimer); o.running = false; renderOverlay(); return; }
    if (o.left === 0) return;
    o.running = true;
    renderOverlay();
    const C = 2 * Math.PI * 15;
    cravingTimer = setInterval(() => {
      if (!overlay || overlay.type !== 'craving') return clearInterval(cravingTimer);
      overlay.left = Math.max(0, overlay.left - 1);
      const clock = document.getElementById('cravClock'), r = document.getElementById('cravRing');
      if (clock) clock.textContent = Math.floor(overlay.left / 60) + ':' + String(overlay.left % 60).padStart(2, '0');
      if (r) r.setAttribute('stroke-dasharray', (overlay.left / 300 * C).toFixed(1) + ' ' + C.toFixed(1));
      if (overlay.left === 0) { clearInterval(cravingTimer); overlay.running = false; renderOverlay(); }
    }, 1000);
  },
  cravPassed() { saveCraving('passed'); overlay.stage = 'passed'; clearInterval(cravingTimer); renderOverlay(); },
  cravHad() { saveCraving('had'); overlay.stage = 'had'; clearInterval(cravingTimer); renderOverlay(); },
  cravingLog() { actions.openLog(); },
  outAt(t) {
    const a = entries.find(e => e.outTs === null);
    if (!a) return close();
    const ts = t.dataset.ts ? Number(t.dataset.ts) : Number(overlay.outTs);
    if (isNaN(ts) || ts < a.inTs || ts > Date.now()) { setStatus('pick a time between ' + fmtTime(a.inTs) + ' and now', true); return; }
    const snap = snapshot();
    a.outTs = ts;
    if (persist()) toast('Out at ' + fmtTime(ts), snap);
    close();
  },
  keepIn() { const a = entries.find(e => e.outTs === null); if (a) { settings.stillInDismissed = a.inTs; persist(); } close(); },
  confirmNone() {
    const a = aftercareState(entries, settings, Date.now());
    settings.confirmations.push({ fromTs: a.lastOut, day: a.day, at: Date.now() });
    persist();
    toast('Confirmed: ' + Math.floor(a.sinceMs / DAY) + ' days nicotine-free');
    close();
  },
  hadSome() { const c = context(); open('log', { productId: c.usual.id, when: 'earlier', inTs: Date.now() - DAY, dur: c.usualMin, tag: null }); },
  hadUnsure() { overlay.stage = 'unsure'; renderOverlay(); },
  hadAsk() { overlay.stage = null; renderOverlay(); },
  approx(t) {
    const a = aftercareState(entries, settings, Date.now());
    settings.confirmations.push({ fromTs: a.lastOut, day: a.day, at: Date.now(), approx: t.dataset.x });
    persist();
    toast('Saved as approximate');
    close();
  },
  openDay(t) { open('day', { day: Number(t.dataset.day) }); },
  openProduct(t) {
    const p = settings.products.find(x => x.id === t.dataset.id);
    open('product', p ? { ...p, confirmDelete: false } : { id: null, name: '', mg: 6, perTin: 20, price: null, left: null });
  },
  saveProduct() {
    const o = overlay;
    const num = (v, allowNull) => (v === '' || v === null || v === undefined) ? (allowNull ? null : NaN) : Number(v);
    const p = { id: o.id || 'p' + Date.now(), name: String(o.name || '').trim(), mg: num(o.mg), perTin: num(o.perTin), price: num(o.price, true), left: num(o.left, true) };
    if (!p.name || isNaN(p.mg) || !(p.perTin > 0)) { setStatus('a product needs a name, a strength and pouches per tin', true); return; }
    const i = settings.products.findIndex(x => x.id === p.id);
    if (i >= 0) settings.products[i] = p; else settings.products.push(p);
    persist();
    close();
  },
  deleteProduct() {
    if (!overlay.confirmDelete) { overlay.confirmDelete = true; renderOverlay(); return; }
    settings.products = settings.products.filter(x => x.id !== overlay.id);
    if (settings.usualProductId === overlay.id) settings.usualProductId = settings.products[0].id;
    persist();
    close();
  },
  newTin(t) {
    const p = settings.products.find(x => x.id === t.dataset.id);
    if (!p) return;
    const snap = snapshot();
    p.left = p.perTin;
    persist();
    toast('New tin: ' + p.perTin + ' left', snap);
    render();
  },
  toggleCheckins() { settings.checkins = !settings.checkins; persist(); render(); },
  startPlan() { settings.plan.startTs = dayStart(Date.now()); persist(); location.hash = '#plan'; render(); },
  restartPlan() { if (confirm('Restart the plan from today? Your baseline becomes the last 7 days.')) { settings.plan.startTs = dayStart(Date.now()); persist(); render(); } },
  planMode(t) { settings.plan.mode = t.dataset.m; persist(); render(); },
  planWeeks(t) { settings.plan.weeks = Number(t.dataset.w); persist(); render(); },
  range(t) { ui.range = t.dataset.r; render(); },
  scenario(t) { ui.scenario = t.dataset.s; render(); },
  scorePart(t) { const i = Number(t.dataset.i); ui.scoreOpen = ui.scoreOpen === i ? -1 : i; render(); },
  phase(t) { const i = Number(t.dataset.i); ui.phaseOpen = ui.phaseOpen === i ? -1 : i; render(); },
  export: exportBackup,
  import() { $importFile.click(); },
  sheetImport: importFromSheet
};

function saveCraving(outcome) {
  const cr = cravings.find(x => x.ts === overlay.ts);
  if (cr) { cr.outcome = outcome; if (overlay.tag) cr.tag = overlay.tag; persist(); }
}

document.addEventListener('click', ev => {
  const t = ev.target.closest('[data-act]');
  if (!t || !actions[t.dataset.act]) return;
  if (t.dataset.act === 'scrim' && ev.target !== t) return;
  if (t.tagName === 'A' && t.dataset.act === 'close') { overlay = null; renderOverlay(); return; }
  ev.preventDefault();
  actions[t.dataset.act](t, ev);
});

// Form fields inside overlays write straight into the overlay state.
document.addEventListener('input', ev => {
  const t = ev.target;
  if (!overlay || !t.dataset.bind) return;
  const k = t.dataset.bind;
  if (t.type === 'datetime-local') overlay[k] = t.value ? new Date(t.value).getTime() : null;
  else overlay[k] = t.value;
  if (overlay.type === 'edit' || (overlay.type === 'log' && k === 'dur')) {
    // Refresh dependent text without losing focus.
    if (overlay.type === 'log' && k === 'dur') overlay.dur = Number(t.value) || 0;
  }
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (overlay && t.dataset.bind && t.type === 'datetime-local') renderOverlay();
  if (t.dataset.actChange === 'usual') { settings.usualProductId = t.value; persist(); render(); }
  if (t.dataset.actChange === 'wake' && /^\d\d:\d\d$/.test(t.value)) { settings.wakeTime = t.value; persist(); render(); }
});

$importFile.onchange = () => {
  const file = $importFile.files[0];
  $importFile.value = '';
  if (file) importBackup(file);
};

// ---- Backup and migration ----

function exportBackup() {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pouch-tracker-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  setStatus('backup exported (' + entries.length + ' entries)');
}

async function importBackup(file) {
  try {
    const rows = JSON.parse(await file.text());
    if (!Array.isArray(rows)) throw new Error('file is not a list of entries');
    const result = mergeEntries(entries, normalize(rows));
    entries = result.list;
    if (persist()) setStatus('imported ' + result.added + ' entries from backup');
  } catch (e) {
    setStatus('backup import failed: ' + errText(e), true);
  }
  render();
}

async function importFromSheet() {
  setStatus('importing from Google Sheet...');
  try {
    const res = await fetch(SHEET_URL + '?t=' + Date.now(), { method: 'GET', cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    const result = mergeEntries(entries, normalize(rows));
    entries = result.list;
    if (!persist()) return;
    store.setMigrated();
    setStatus('imported ' + result.added + ' entries from Google Sheet');
  } catch (e) {
    setStatus('sheet import failed: ' + errText(e) + '. Use "Re-import from Google Sheet" in Profile to try again.', true);
  }
  render();
}

// ---- Rendering ----

const VIEWS = { now: viewNow, plan: viewPlan, history: viewHistory, profile: viewProfile, nicotine: viewNicotine, score: viewScore };

function route() { const r = location.hash.slice(1); return VIEWS[r] ? r : 'now'; }

function render() {
  const r = route(), c = context();
  $view.innerHTML = VIEWS[r](c);
  $tabs.querySelectorAll('[data-tab]').forEach(a => a.classList.toggle('on', a.dataset.tab === r));
}

// Prompts that come to you: a pouch left in too long, or a check-in after a
// pouch-free stretch. Only one at a time, and never over another overlay.
function checkPrompts() {
  if (overlay || !dataLoaded) return;
  const c = context();
  if (c.active && (c.now - c.active.inTs) / MIN > c.usualMin * 2 && settings.stillInDismissed !== c.active.inTs) {
    open('stillIn', { outTs: c.active.inTs + c.usualMin * MIN });
  } else if (c.after && c.after.needsCheckin) {
    open('hadNone', { stage: null });
  }
}

window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });

// Keep other open tabs of the app in sync with changes made here.
window.addEventListener('storage', e => {
  if ([STORAGE_KEY, SETTINGS_KEY, CRAVINGS_KEY].includes(e.key)) {
    entries = store.load();
    settings = store.loadSettings(entries);
    cravings = store.loadCravings();
    render();
  }
});

(function init() {
  try {
    entries = store.load();
    settings = store.loadSettings(entries);
    cravings = store.loadCravings();
    dataLoaded = true;
    setStatus('ready');
  } catch (e) {
    entries = entries || [];
    settings = settings || withDefaults(null, entries);
    setStatus('could not read local data: ' + errText(e), true);
  }
  render();
  checkPrompts();
  setInterval(() => { if (!overlay) render(); checkPrompts(); }, 30000);

  // Ask the browser not to evict our data under storage pressure.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // One-time migration of existing Google Sheet data. Runs in the background;
  // the app is fully usable while it runs.
  if (dataLoaded && !store.isMigrated()) importFromSheet();
})();
