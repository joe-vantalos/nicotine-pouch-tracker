// ---- Storage layer ----------------------------------------------------------
// All reads and writes go through `store`. To move to a remote backend later,
// keep this interface and add a sync step behind it.
const STORAGE_KEY = 'pouchTracker.entries.v1';
const SETTINGS_KEY = 'pouchTracker.settings.v1';
const CRAVINGS_KEY = 'pouchTracker.cravings.v1';

function readJSON(key, fallback) {
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : fallback;
}

const store = {
  load() { return normalize(readJSON(STORAGE_KEY, [])); },
  save(list) { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); },
  loadSettings(entries) { return withDefaults(readJSON(SETTINGS_KEY, null), entries); },
  saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); },
  loadCravings() {
    const list = readJSON(CRAVINGS_KEY, []);
    return Array.isArray(list) ? list.filter(c => c && typeof c.ts === 'number') : [];
  },
  saveCravings(list) { localStorage.setItem(CRAVINGS_KEY, JSON.stringify(list)); },
};

// Accepts rows from local storage or a backup file (dates may be strings)
// and returns clean, sorted entries.
// Each entry is { inTs, outTs, mg } plus optional productId and tag. The older
// version of the app reads the same three core fields, so data stays compatible.
function normalize(rows) {
  return rows.map(r => {
    const e = {
      inTs: new Date(r.inTs).getTime(),
      outTs: r.outTs ? new Date(r.outTs).getTime() : null,
      mg: Number(r.mg)
    };
    if (r.productId) e.productId = String(r.productId);
    if (r.tag) e.tag = String(r.tag);
    return e;
  }).filter(e => !isNaN(e.inTs) && !isNaN(e.mg)).sort((a, b) => a.inTs - b.inTs);
}

// Merge incoming entries into the current list, keyed by insert time.
// Existing entries win, except that a completed entry fills in a missing outTs.
function mergeEntries(current, incoming) {
  const byIn = new Map(current.map(e => [e.inTs, { ...e }]));
  let added = 0;
  incoming.forEach(e => {
    const existing = byIn.get(e.inTs);
    if (!existing) { byIn.set(e.inTs, { ...e }); added++; }
    else if (existing.outTs === null && e.outTs !== null) existing.outTs = e.outTs;
  });
  return { list: [...byIn.values()].sort((a, b) => a.inTs - b.inTs), added };
}

// A backup file holds everything: { app, v: 2, exportedTs, entries, settings, cravings }.
// Older backups are a plain list of entries; both are accepted on import.
function backupFile(entries, settings, cravings) {
  return { app: 'pouch-tracker', v: 2, exportedTs: Date.now(), entries, settings, cravings };
}

function readBackup(data) {
  if (Array.isArray(data)) return { entries: normalize(data), settings: null, cravings: [], exportedTs: null };
  if (!data || data.app !== 'pouch-tracker' || !Array.isArray(data.entries)) throw new Error('not a Pouch Tracker backup');
  const cravings = Array.isArray(data.cravings) ? data.cravings.filter(c => c && typeof c.ts === 'number') : [];
  return { entries: normalize(data.entries), settings: data.settings || null, cravings, exportedTs: typeof data.exportedTs === 'number' ? data.exportedTs : null };
}

// Merges a backup's settings into the current ones. A device with no entries yet
// (a new phone) takes the backup's settings whole. Otherwise products the device
// lacks are added, and the plan is taken only if this device has not started one.
function mergeSettings(current, incoming, deviceEmpty) {
  if (!incoming) return current;
  if (deviceEmpty) return incoming;
  const out = { ...current, products: [...current.products] };
  (incoming.products || []).forEach(p => { if (p && p.id && !out.products.some(q => q.id === p.id)) out.products.push(p); });
  if (!current.plan.startTs && incoming.plan && typeof incoming.plan.startTs === 'number') out.plan = { ...incoming.plan };
  return out;
}

// Fills in any missing settings. Every strength already logged gets a product,
// so old entries without a productId still resolve to one.
function withDefaults(s, entries) {
  s = s && typeof s === 'object' ? s : {};
  const plan = s.plan || {};
  const out = {
    v: 1,
    products: Array.isArray(s.products) ? s.products : [],
    usualProductId: s.usualProductId || null,
    wakeTime: /^\d\d:\d\d$/.test(s.wakeTime || '') ? s.wakeTime : '07:00',
    bedTime: /^\d\d:\d\d$/.test(s.bedTime || '') ? s.bedTime : '23:00',
    weightKg: typeof s.weightKg === 'number' && s.weightKg >= 30 && s.weightKg <= 250 ? s.weightKg : null,
    plan: {
      mode: plan.mode === 'strength' ? 'strength' : 'count',
      weeks: [6, 8, 10, 12].includes(plan.weeks) ? plan.weeks : 8,
      startTs: typeof plan.startTs === 'number' ? plan.startTs : null
    },
    checkins: s.checkins !== false,
    confirmations: Array.isArray(s.confirmations) ? s.confirmations : [],
    stillInDismissed: typeof s.stillInDismissed === 'number' ? s.stillInDismissed : null,
    lastBackupTs: typeof s.lastBackupTs === 'number' ? s.lastBackupTs : null,
    backupSnoozeTs: typeof s.backupSnoozeTs === 'number' ? s.backupSnoozeTs : null
  };
  const mgs = [...new Set(entries.map(e => e.mg))];
  if (!mgs.length && !out.products.length) mgs.push(6, 11);
  mgs.forEach(mg => {
    if (!out.products.some(p => p.mg === mg)) {
      out.products.push({ id: 'mg' + mg, name: mg + ' mg pouch', mg, perTin: 20, price: null, left: null });
    }
  });
  if (!out.products.some(p => p.id === out.usualProductId)) {
    const counts = {};
    entries.forEach(e => { counts[e.mg] = (counts[e.mg] || 0) + 1; });
    const topMg = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const usual = out.products.find(p => String(p.mg) === topMg) || out.products[0];
    out.usualProductId = usual.id;
  }
  return out;
}
