// Daily wishes: each pet asks for two or three small things a day. Granting one earns joy and a sparkle;
// granting them all is a little celebration. Wishes are seeded per pet and day, so every device sees the same ones.
import { localDate, count } from './engine.js';
import { temperamentOf, favouriteCheese } from './personality.js';
import { eligible } from './visitors.js';

function rng(seed) { let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const CHEESE = { cheddar: 'cheddar', brie: 'brie', swiss: 'holey swiss' };

/* ev: the event an action raises. who: 'self' = only this pet's action counts; 'any' = anything in the burrow counts.
   need: how many times. ok(c, s, b): can it be wished for today. text(arg, b, s, names). arg(r, b, s): a detail chosen per wish. */
export const WISHES = {
  cheese:   { e: '🧀', ev: 'feed', who: 'self', need: 1, arg: (r, b, s) => favouriteCheese(s, b) && favouriteCheese(s, b) !== 'crumb' && r() < 0.5 ? favouriteCheese(s, b) : ['cheddar', 'brie', 'swiss'][Math.floor(r() * 3)], match: (d, a) => d.cheese === a, text: a => `i’d love some ${CHEESE[a] || a} today` },
  hug:      { e: '🫶', ev: 'hug', who: 'self', need: 2, text: () => 'two big hugs, please' },
  boing:    { e: '🎈', ev: 'boing', who: 'self', need: 3, text: () => 'boing me three times!' },
  bath:     { e: '🫧', ev: 'wash', who: 'self', need: 1, ok: (c, s, b) => b.clean < 85, text: () => 'i could use a sparkly bath' },
  catch:    { e: '🧀', ev: 'game', who: 'self', need: 1, arg: () => 'catch', match: (d, a) => d.kind === a, text: () => 'let’s play catch the cheese' },
  seek:     { e: '🌿', ev: 'game', who: 'self', need: 1, arg: () => 'seek', match: (d, a) => d.kind === a, text: () => 'hide and seek? i’ll hide!' },
  together: { e: '🤝', ev: 'together', who: 'any', need: 1, ok: (c, s) => s.beings.length > 1, text: (a, b, s, names) => `play together with ${names.filter(n => n !== names[s.beings.indexOf(b)])[0] || 'everyone'}` },
  visitor:  { e: '🐌', ev: 'visitor', who: 'any', need: 1, ok: (c, s) => !!c && eligible(c, s).length > 0, text: () => 'i want to meet a visitor today' },
  plant:    { e: '🌱', ev: 'plant', who: 'any', need: 1, arg: r => ['red', 'orange', 'green'][Math.floor(r() * 3)], match: (d, a) => ({ red: ['strawberry'], orange: ['carrot', 'pumpkin'], green: ['clover'] })[a].includes(d.seed), ok: (c, s) => (s.garden || []).some(p => !p.seed), text: a => `plant something ${a} in the garden` },
  water:    { e: '💧', ev: 'water', who: 'any', need: 1, ok: (c, s) => (s.garden || []).some(p => p.seed && p.growth < 1) && !(c && c.wet), text: () => 'water the garden with me' },
  snack:    { e: '🥕', ev: 'snack', who: 'self', need: 1, ok: (c, s) => Object.values(s.pantry?.gain || {}).length > 0, text: () => 'something homegrown, please' },
  photo:    { e: '📷', ev: 'photo', who: 'any', need: 1, text: () => 'take our picture!' },
  inside:   { e: '🏠', ev: 'inside', who: 'any', need: 1, text: () => 'let’s go inside for a bit' },
  secret:   { e: '🤫', ev: 'secret', who: 'self', need: 1, text: () => 'tap me lots. i have a secret.' },
  dress:    { e: '🎀', ev: 'wear', who: 'self', need: 1, ok: (c, s, b) => b.days.length >= 7, text: () => 'help me pick something to wear' }
};
const BY_TEMPER = { shy: ['hug', 'secret', 'photo', 'inside'], bouncy: ['boing', 'catch', 'together', 'seek'], sleepy: ['inside', 'hug', 'cheese', 'snack'], curious: ['visitor', 'seek', 'plant', 'photo'], bold: ['boing', 'catch', 'water', 'together'] };

/** Today's wishes for each pet: [{key, being, id, arg, e, text, need}] */
export function todaysWishes(s, c, now = Date.now()) {
  const day = localDate(now, s.tz), names = s.beings.map(b => b.name.split(' ')[0]);
  const out = [];
  s.beings.forEach(b => {
    const r = rng(`wish|${s.id}|${b.id}|${day}`);
    const n = 2 + (r() < 0.4 ? 1 : 0);
    const liked = new Set(BY_TEMPER[temperamentOf(b)] || []);
    const pool = Object.keys(WISHES).filter(k => !WISHES[k].ok || WISHES[k].ok(c, s, b));
    const picked = [];
    while (picked.length < n && pool.length) {
      const weights = pool.map(k => liked.has(k) ? 3 : 1), total = weights.reduce((a, w) => a + w, 0);
      let x = r() * total, k = 0; while ((x -= weights[k]) > 0) k++;
      picked.push(pool.splice(k, 1)[0]);
    }
    picked.forEach(id => {
      const w = WISHES[id], arg = w.arg ? w.arg(r, b, s) : null;
      out.push({ key: `${day}|${b.id}|${id}`, being: b.id, id, arg, e: w.e, need: w.need, text: w.text(arg, b, s, names) });
    });
  });
  return out;
}

/** Wishes that existed today but are no longer possible (e.g. the garden filled up) stay listed once seen. */
export const progress = (s, key) => Object.values(s.wishes?.[key] || {}).reduce((a, n) => a + n, 0);
export const done = (s, w) => progress(s, w.key) >= w.need;

/**
 * Record an action. Returns the wishes it just completed.
 * @param ev     event name   @param beingId  who did it (null for burrow-wide actions)   @param detail  e.g. {cheese}
 */
export function grant(s, list, ev, beingId, detail = {}, dev = 'here', now = Date.now()) {
  s.wishes = s.wishes || {};
  const finished = [];
  for (const w of list) {
    const def = WISHES[w.id];
    if (def.ev !== ev || done(s, w)) continue;
    if (def.who === 'self' && w.being !== beingId) continue;
    if (def.match && !def.match(detail, w.arg)) continue;
    const rec = s.wishes[w.key] || (s.wishes[w.key] = {});
    rec[dev] = (rec[dev] || 0) + 1;
    if (done(s, w)) finished.push(w);
  }
  if (finished.length) {
    s.granted = s.granted || {}; s.granted[dev] = (s.granted[dev] || 0) + finished.length;
    s.updatedAt = Math.max(s.updatedAt || 0, now);
  }
  return finished;
}
export const grantedTotal = s => Object.values(s.granted || {}).reduce((a, n) => a + n, 0);

/** Keep a week of wish history; merge per device. */
export function mergeWishes(out, b) {
  out.wishes = out.wishes || {};
  for (const [k, devs] of Object.entries(b.wishes || {})) { const o = out.wishes[k] || (out.wishes[k] = {}); for (const [d, n] of Object.entries(devs)) o[d] = Math.max(o[d] || 0, n); }
  out.granted = { ...(out.granted || {}) }; for (const [d, n] of Object.entries(b.granted || {})) out.granted[d] = Math.max(out.granted[d] || 0, n);
  const keep = [...new Set(Object.keys(out.wishes).map(k => k.split('|')[0]))].sort().slice(-7);
  for (const k of Object.keys(out.wishes)) if (!keep.includes(k.split('|')[0])) delete out.wishes[k];
}
