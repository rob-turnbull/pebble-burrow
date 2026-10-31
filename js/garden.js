// A little garden that grows with your real weather. Rain waters it, sun speeds it up,
// frost pauses it, and nothing ever dies: a dry or frosty plant just waits.
export const SEEDS = {
  carrot:     { label: 'carrots',     e: '🥕', hours: 10, seasons: ['spring', 'summer', 'autumn', 'winter'], snack: { full: 20, joy: 4 } },
  clover:     { label: 'clover',      e: '🍀', hours: 14, seasons: ['spring', 'summer', 'autumn'], snack: { full: 6, joy: 15 } },
  strawberry: { label: 'strawberries', e: '🍓', hours: 20, seasons: ['spring', 'summer'], snack: { full: 12, joy: 12 } },
  sunflower:  { label: 'sunflowers',  e: '🌻', hours: 30, seasons: ['spring', 'summer', 'autumn'], snack: null },
  pumpkin:    { label: 'a pumpkin',   e: '🎃', hours: 40, seasons: ['summer', 'autumn'], snack: { full: 30, joy: 6 } }
};
export const PLOTS = 3;
const DRY_PER_H = 3;

export function ensure(s) {
  s.garden = Array.isArray(s.garden) ? s.garden : [];
  while (s.garden.length < PLOTS) s.garden.push({ seed: '', planted: 0, growth: 0, water: 0, at: 0, tick: 0 });
  s.pantry = s.pantry || { gain: {}, use: {} };
  return s.garden;
}

export const plantable = season => Object.keys(SEEDS).filter(k => SEEDS[k].seasons.includes(season));

export function plant(s, i, seed, now = Date.now()) {
  ensure(s); s.garden[i] = { seed, planted: now, growth: 0, water: 70, at: now, tick: now };
  s.updatedAt = Math.max(s.updatedAt || 0, now);
}
export function water(s, i, now = Date.now()) {
  ensure(s); const p = s.garden[i]; if (!p.seed) return false;
  grow(s, now); p.water = 100; p.at = now; s.updatedAt = Math.max(s.updatedAt || 0, now); return true;
}

/** How a plot is doing, in words. */
export function status(p, c = {}) {
  if (!p.seed) return { k: 'empty', t: 'empty' };
  if (p.growth >= 1) return { k: 'ripe', t: 'ready to pick!' };
  if (c.freezing) return { k: 'frost', t: 'frosty, waiting for warmer air' };
  if (p.water <= 0) return { k: 'dry', t: 'thirsty' };
  const left = Math.max(1, Math.round((1 - p.growth) * SEEDS[p.seed].hours / Math.max(1, rate(c))));   // estimate at a normal day's pace
  return { k: 'growing', t: `growing · about ${left}h to go` };
}
function rate(c = {}) { return c.freezing ? 0 : c.night ? 0.5 : (c.bright || (c.kind === 'clear' && !c.night)) ? 1.3 : c.hot ? 0.9 : 1; }

/** Grow every plot up to `now` using the current conditions. Returns plots that just ripened. */
export function grow(s, now = Date.now(), c = {}) {
  ensure(s); const ripened = [];
  s.garden.forEach((p, i) => {
    if (!p.seed) return;
    const h = Math.max(0, (now - (p.tick || p.planted)) / 36e5); p.tick = now;
    if (!h || p.growth >= 1) return;
    if (c.wet || c.snow) p.water = 100;
    const dryRate = c.hot ? DRY_PER_H * 2 : c.night ? DRY_PER_H / 2 : DRY_PER_H;
    const wetHours = Math.min(h, p.water / dryRate);                 // only grows while it has water
    p.water = Math.max(0, p.water - dryRate * h);
    const before = p.growth;
    p.growth = Math.min(1, p.growth + wetHours * rate(c) / SEEDS[p.seed].hours);
    if (before < 1 && p.growth >= 1) ripened.push(i);
  });
  return ripened;
}

/** Pick a ripe plot. Snacks go in the pantry; the plot is ready for new seeds. */
export function harvest(s, i, dev = 'here', now = Date.now()) {
  ensure(s); const p = s.garden[i]; if (!p.seed || p.growth < 1) return null;
  const seed = p.seed, n = seed === 'carrot' || seed === 'strawberry' ? 3 : seed === 'clover' ? 2 : 1;
  if (SEEDS[seed].snack) add(s, 'gain', seed, n, dev);
  s.garden[i] = { seed: '', planted: 0, growth: 0, water: 0, at: now, tick: now };
  s.updatedAt = Math.max(s.updatedAt || 0, now);
  return { seed, n };
}

function add(s, side, item, n, dev) { s.pantry[side][item] = s.pantry[side][item] || {}; s.pantry[side][item][dev] = (s.pantry[side][item][dev] || 0) + n; }
const sum = o => Object.values(o || {}).reduce((a, n) => a + n, 0);
export function stock(s) { ensure(s); const out = {}; for (const k of Object.keys(SEEDS)) { const n = sum(s.pantry.gain[k]) - sum(s.pantry.use[k]); if (n > 0) out[k] = n; } return out; }
export function useSnack(s, item, dev = 'here') { if ((stock(s)[item] || 0) < 1) return false; add(s, 'use', item, 1, dev); return true; }

/** Merge two gardens: each plot keeps its newest change; pantry counts per device. */
export function mergeGarden(out, b) {
  ensure(out); if (!b.garden) return;
  b.garden.forEach((p, i) => {
    const q = out.garden[i];
    if (!q || (p.at || 0) > (q.at || 0)) out.garden[i] = JSON.parse(JSON.stringify(p));
    else if ((p.at || 0) === (q.at || 0) && p.seed === q.seed) { q.growth = Math.max(q.growth, p.growth); q.tick = Math.max(q.tick || 0, p.tick || 0); q.water = Math.max(q.water, p.water); }
  });
  for (const side of ['gain', 'use']) for (const [item, devs] of Object.entries(b.pantry?.[side] || {})) for (const [dev, n] of Object.entries(devs)) {
    out.pantry[side][item] = out.pantry[side][item] || {};
    out.pantry[side][item][dev] = Math.max(out.pantry[side][item][dev] || 0, n);
  }
}

/** Diary lines for the garden while you were away. */
export function diaryGarden(s, from, to) {
  if (!s.garden?.some(p => p.seed)) return [];
  const names = s.beings.map(b => b.name.split(' ')[0]), out = [];
  const growing = s.garden.filter(p => p.seed && p.growth < 1);
  growing.forEach((p, k) => {
    const hoursLeft = (1 - p.growth) * SEEDS[p.seed].hours;
    if (hoursLeft * 36e5 < to - from && p.water > 20) out.push({ t: from + hoursLeft * 36e5, e: SEEDS[p.seed].e, text: `${names[k % names.length]} noticed the ${SEEDS[p.seed].label} were ripe and guarded them until you got back.` });
  });
  const rainy = Object.entries(s.wxDays || {}).some(([, k]) => ['rain', 'drizzle', 'storm'].includes(k));
  if (rainy && growing.length) out.push({ t: from + (to - from) * 0.3, e: '💧', text: `the rain watered the garden. ${names[0]} took the credit.` });
  return out.slice(0, 2);
}
