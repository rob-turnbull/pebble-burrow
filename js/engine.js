// Pure state engine, shared by the app and the Cloudflare helper. No DOM, no network.
// Nothing here ever dies: an empty tummy or a long absence only ever means a nap.
import { FIRST, LAST, STAGES } from './data.js';

export const SCHEMA = 3;
export const RATE = { full: 5, clean: 2.5, joy: 3.5 }; // points lost per hour while awake
export const NAP_AFTER_H = 10;                          // away this long -> everyone naps
export const WAKE_FLOOR = { full: 40, clean: 40, joy: 60 };
const H = 36e5;
const COUNTERS = ['feasts', 'hugs', 'boings'];
const TOP_FIELDS = ['owner', 'bday', 'place', 'units', 'tz', 'helper'];

export const clamp = v => Math.max(0, Math.min(100, v));
export const rand = a => a[Math.floor(Math.random() * a.length)];
export const makeName = () => rand(FIRST) + ' ' + rand(LAST);
export const uid = () => Math.random().toString(36).slice(2, 10);

/** YYYY-MM-DD in a time zone (defaults to the runtime's). */
export function localDate(now = Date.now(), tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
  catch { return new Date(now).toISOString().slice(0, 10); }
}

/* ---------------- construction ---------------- */
export function newBeing(sp, now = Date.now()) {
  return { id: uid(), sp, name: makeName(), nameAt: now, born: now,
    full: 80, clean: 90, joy: 75, napping: false, glowUntil: 0, statsAt: now, tick: now,
    cnt: { feasts: {}, hugs: {}, boings: {} }, taps: 0, days: [], wear: '', wearAt: 0 };
}

export function newBurrow({ owner, bday, species, tz }, now = Date.now()) {
  const s = { v: SCHEMA, id: uid(), owner, bday: bday || null, place: null, units: 'F', tz: tz || '', helper: '',
    at: {}, beings: species.map(sp => newBeing(sp, now)), log: [], album: [],
    lastTick: now, created: now, updatedAt: now };
  TOP_FIELDS.forEach(f => s.at[f] = now);
  keepsake(s, 'hatch', '🥚', `${s.beings.map(b => b.name.split(' ')[0]).join(' and ')} hatched`, now);
  return s;
}

/** Bring any older save (v1, v2) up to the current schema. Returns null for junk. */
export function migrate(s) {
  if (!s || !Array.isArray(s.beings) || !s.beings.length) return null;
  const now = Date.now();
  s.created = s.created || now;
  s.lastTick = s.lastTick || now;
  s.updatedAt = s.updatedAt || s.lastTick;
  if (!s.id) s.id = 'legacy-' + s.created.toString(36);
  if (!('place' in s)) s.place = null;
  s.units = s.units || 'F';
  s.tz = s.tz || '';
  s.helper = s.helper || '';
  s.at = s.at || {};
  TOP_FIELDS.forEach(f => { if (typeof s.at[f] !== 'number') s.at[f] = 0; });
  s.log = Array.isArray(s.log) ? s.log : [];
  s.album = Array.isArray(s.album) ? s.album : [];
  s.wxDays = s.wxDays || {};
  s.beings.forEach(b => {
    b.id = b.id || uid();
    b.nameAt = b.nameAt || 0;
    b.born = b.born || s.created;
    b.statsAt = b.statsAt || s.updatedAt;
    b.tick = b.tick || s.lastTick;
    b.glowUntil = b.glowUntil || 0;
    if (!b.cnt) { b.cnt = {}; COUNTERS.forEach(k => b.cnt[k] = b[k] ? { legacy: b[k] } : {}); }
    COUNTERS.forEach(k => { b.cnt[k] = b.cnt[k] || {}; delete b[k]; });
    b.taps = b.taps || 0;
    b.days = Array.isArray(b.days) ? b.days : [];
    b.wear = b.wear || ''; b.wearAt = b.wearAt || 0;
  });
  if (!s.album.some(k => k.k === 'hatch')) keepsake(s, 'hatch', '🥚', `${s.beings.map(b => b.name.split(' ')[0]).join(' and ')} hatched`, s.created);
  s.v = SCHEMA;
  return s;
}

/* ---------------- counters ---------------- */
export const count = (b, k) => Object.values(b.cnt[k] || {}).reduce((a, n) => a + n, 0);
function bump(b, k, dev) { b.cnt[k] = b.cnt[k] || {}; b.cnt[k][dev] = (b.cnt[k][dev] || 0) + 1; }

/* ---------------- time ---------------- */
export function envMultipliers({ phase = 'day', kind = 'clear', cold = false } = {}) {
  const m = { full: 1, clean: 1, joy: 1 };
  if (phase === 'night') { m.full *= 0.5; m.clean *= 0.5; m.joy *= 0.5; }
  if (kind === 'rain' || kind === 'drizzle' || kind === 'storm') m.clean *= 1.5;
  if (kind === 'snow') m.joy *= 0.8;
  if (kind === 'storm') m.joy *= 1.2;
  if (cold) m.full *= 1.2;
  return m;
}

export function decay(b, hours, mult = { full: 1, clean: 1, joy: 1 }) {
  if (b.napping || hours <= 0) return;
  b.full = clamp(b.full - RATE.full * mult.full * hours);
  b.clean = clamp(b.clean - RATE.clean * mult.clean * hours);
  b.joy = clamp(b.joy - RATE.joy * mult.joy * hours);
  if (b.full <= 0) b.napping = true;
}

/** Advance every being to `now`. Each being keeps its own clock so merged saves stay honest. */
export function catchUp(s, now = Date.now(), mult) {
  const hours = Math.max(0, (now - s.lastTick) / H);
  let napped = false;
  s.beings.forEach(b => {
    const h = Math.max(0, (now - b.tick) / H);
    decay(b, h, mult);
    if (h >= NAP_AFTER_H) b.napping = true;
    b.tick = Math.max(b.tick, now);
    if (b.napping) napped = true;
  });
  s.lastTick = Math.max(s.lastTick, now);
  return { hours, napped };
}

/* ---------------- care actions (call catchUp first) ---------------- */
// Every action stamps statsAt so the freshest care wins a merge, and marks a care day for growth.
function cared(s, b, now, dev) {
  b.statsAt = now; b.tick = Math.max(b.tick, now);
  if (dev && s.wxNow && now - s.wxNow.t < 2 * H) bump(b, 'wx:' + s.wxNow.kind, dev);
  const d = localDate(now, s.tz);
  if (!b.days.includes(d)) { b.days.push(d); b.days.sort(); }
  s.updatedAt = Math.max(s.updatedAt, now);
}

export function wake(s, b, now = Date.now(), dev = 'here') {
  if (!b.napping) return false;
  b.napping = false;
  b.full = Math.max(b.full, WAKE_FLOOR.full);
  b.clean = Math.max(b.clean, WAKE_FLOOR.clean);
  b.joy = Math.max(b.joy, WAKE_FLOOR.joy);
  b.glowUntil = now + 9000;
  cared(s, b, now, dev);
  return true;
}
export function feed(s, b, cheese, now = Date.now(), dev = 'here', by) {
  if (b.full >= 96) return false;
  b.full = clamp(b.full + cheese.full);
  b.joy = clamp(b.joy + (cheese.joy || 3));
  bump(b, 'feasts', dev);
  logFeast(s, b, cheese.id === 'crumb' ? 'a tiny crumb' : cheese.id, now, by);
  if (count(b, 'feasts') === 1) keepsake(s, 'firstfeast:' + b.id, '🧀', `${first(b)}'s first feast: ${cheese.id === 'crumb' ? 'a tiny crumb' : cheese.id}`, now);
  cared(s, b, now, dev);
  return true;
}
export function play(s, b, now = Date.now(), dev = 'here') { b.joy = clamp(b.joy + 18); b.full = clamp(b.full - 3); bump(b, 'boings', dev); cared(s, b, now, dev); }
export function hug(s, b, now = Date.now(), dev = 'here') { b.joy = clamp(b.joy + 10); bump(b, 'hugs', dev); cared(s, b, now, dev); }
export function scrub(s, b, amt, now = Date.now()) { b.clean = clamp(b.clean + amt); b.statsAt = now; const done = b.clean >= 100; if (done) cared(s, b, now); return done; }
export function rename(s, b, name, now = Date.now()) { b.name = name; b.nameAt = now; s.updatedAt = now; }
export function setWear(s, b, wear, now = Date.now()) { b.wear = wear; b.wearAt = now; s.updatedAt = now; }
export function setField(s, f, v, now = Date.now()) { s[f] = v; s.at[f] = now; s.updatedAt = now; }

/** Remember today's weather (for streaks and learned likes). Returns true if the diary changed. */
export function noteWeather(s, kind, now = Date.now()) {
  if (!kind) return false;
  s.wxNow = { kind, t: now };
  const d = localDate(now, s.tz); s.wxDays = s.wxDays || {};
  if (s.wxDays[d] === kind) return false;
  s.wxDays[d] = kind;
  const keep = Object.keys(s.wxDays).sort().slice(-21); s.wxDays = Object.fromEntries(keep.map(k => [k, s.wxDays[k]]));
  return true;
}

/* ---------------- growth, wearables, keepsakes ---------------- */
export const first = b => b.name.split(' ')[0];
export function stageOf(b) { const n = b.days.length; return [...STAGES].reverse().find(st => n >= st.from).id; }
export function nextStage(b) { const n = b.days.length; const nx = STAGES.find(st => st.from > n); return nx ? { id: nx.id, in: nx.from - n } : null; }

export function unlockedWear(s, b) {
  const st = stageOf(b), has = k => s.album.some(a => a.k.startsWith(k));
  return {
    flowers: st !== 'sprout', scarf: count(b, 'feasts') >= 10, bow: count(b, 'hugs') >= 25,
    star: st === 'grown', pumpkin: has('halloween:'), party: has('bday:')
  };
}

export function keepsake(s, k, e, text, now = Date.now()) {
  if (s.album.some(a => a.k === k)) return false;
  s.album.push({ k, e, text, t: now });
  s.album.sort((a, b) => a.t - b.t);
  return true;
}

/** Keepsakes earned by growing up. Returns new milestones so the app can celebrate them. */
export function checkGrowth(s, now = Date.now()) {
  const fresh = [];
  s.beings.forEach(b => {
    const st = stageOf(b);
    if (st !== 'sprout' && keepsake(s, `young:${b.id}`, '🌱', `${first(b)} grew up a little`, now)) fresh.push({ b, stage: 'young' });
    if (st === 'grown' && keepsake(s, `grown:${b.id}`, '🌳', `${first(b)} is all grown`, now)) fresh.push({ b, stage: 'grown' });
  });
  return fresh;
}

export function mood(b, { phase = 'day', now = Date.now() } = {}) {
  if (b.napping) return { t: 'napping', k: 'napping' };
  if (b.glowUntil && b.glowUntil > now) return { t: 'glowing', k: 'glow' };
  if (b.full < 30) return { t: 'peckish', k: 'low' };
  if (b.clean < 30) return { t: 'a bit muddy', k: 'low' };
  if (b.joy < 30) return { t: 'wants to play', k: 'low' };
  if (phase === 'night') return { t: 'sleepy', k: '' };
  if ((b.full + b.clean + b.joy) / 3 > 75) return { t: 'happy, blinky', k: '' };
  return { t: 'cosy', k: '' };
}

export const isBirthday = (s, d = new Date()) => !!(s.bday && +s.bday.d === d.getDate() && +s.bday.m === d.getMonth() + 1);

export function logFeast(s, b, cheese, now = Date.now(), by) {
  const e = { id: b.id, n: b.name, c: cheese, t: now }; if (by) e.by = by;
  s.log.unshift(e);
  s.log = s.log.slice(0, 60);
}

/* ---------------- merge ---------------- */
const clone = o => JSON.parse(JSON.stringify(o));
const logKey = e => `${e.t}|${e.id || e.n}|${e.c}|${e.by || ''}`;

/**
 * Combine two saves of the same burrow without losing either side's care.
 * - different burrows: the newer-created one wins (that's a deliberate "start over")
 * - name, wearable, top-level settings: newest timestamp wins
 * - stats: the being whose last care is freshest wins, then both catch up to now
 * - feasts/hugs/boings: per-device counters, so concurrent care adds up
 * - feast log, album, care days: union
 */
export function merge(a, b) {
  if (!a) return b ? clone(b) : null;
  if (!b) return clone(a);
  if (a.id !== b.id) return clone((b.created || 0) > (a.created || 0) ? b : a);
  const out = clone(a);
  TOP_FIELDS.forEach(f => { if ((b.at?.[f] || 0) > (out.at?.[f] || 0)) { out[f] = clone(b[f] ?? null); out.at[f] = b.at[f]; } });
  const byId = Object.fromEntries(b.beings.map(x => [x.id, x]));
  out.beings = out.beings.map(x => {
    const y = byId[x.id]; if (!y) return x;
    if ((y.nameAt || 0) > (x.nameAt || 0)) { x.name = y.name; x.nameAt = y.nameAt; }
    if ((y.wearAt || 0) > (x.wearAt || 0)) { x.wear = y.wear; x.wearAt = y.wearAt; }
    if (y.statsAt > x.statsAt || (y.statsAt === x.statsAt && y.tick > x.tick)) {
      ['full', 'clean', 'joy', 'napping', 'glowUntil', 'statsAt', 'tick'].forEach(k => x[k] = y[k]);
    }
    for (const [k, devs] of Object.entries(y.cnt || {})) { x.cnt[k] = x.cnt[k] || {}; for (const [dev, n] of Object.entries(devs)) x.cnt[k][dev] = Math.max(x.cnt[k][dev] || 0, n); }
    x.taps = Math.max(x.taps || 0, y.taps || 0);
    x.days = [...new Set([...x.days, ...y.days])].sort();
    return x;
  });
  const seen = new Set(out.log.map(logKey));
  b.log.forEach(e => { if (!seen.has(logKey(e))) { out.log.push(clone(e)); seen.add(logKey(e)); } });
  out.log.sort((p, q) => q.t - p.t); out.log = out.log.slice(0, 60);
  out.wxDays = { ...(b.wxDays || {}), ...(out.wxDays || {}) };
  if ((b.wxNow?.t || 0) > (out.wxNow?.t || 0)) out.wxNow = clone(b.wxNow);
  const ks = new Set(out.album.map(k => k.k));
  b.album.forEach(k => { if (!ks.has(k.k)) out.album.push(clone(k)); });
  out.album.sort((p, q) => p.t - q.t);
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  out.lastTick = Math.max(a.lastTick || 0, b.lastTick || 0);
  return out;
}

/** Same content, ignoring key order. Used to decide whether a push or re-render is needed. */
export const sameSave = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

export const encode = s => btoa(unescape(encodeURIComponent(JSON.stringify(s))));
export const decode = t => JSON.parse(decodeURIComponent(escape(atob(t.trim()))));

/** A plain-text status of the burrow, used by the helper's peek page and the AI visitor. */
export function peekText(s, { now = Date.now(), phase, weather } = {}) {
  const lines = [];
  lines.push(`${s.owner}'s burrow${s.place ? ' · ' + s.place.name : ''}${weather ? ` · ${weather.temp}°${s.units} ${weather.kind}` : ''}${phase ? ` · ${phase}` : ''}`);
  s.beings.forEach(b => {
    const m = mood(b, { phase, now });
    lines.push(`- ${b.name} (${b.sp}, ${stageOf(b)}, tended ${b.days.length} day${b.days.length === 1 ? '' : 's'}): ${m.t}. tummy ${Math.round(b.full)}, sparkle ${Math.round(b.clean)}, joy ${Math.round(b.joy)}. ${count(b, 'feasts')} feasts, ${count(b, 'hugs')} hugs.`);
  });
  const last = s.log[0];
  if (last) lines.push(`last feast: ${first({ name: last.n })} had ${last.c}${last.by ? ' (from ' + last.by + ')' : ''}, ${Math.max(1, Math.round((now - last.t) / 6e4))} min ago.`);
  lines.push('nothing here ever dies. napping just means waiting.');
  return lines.join('\n');
}
