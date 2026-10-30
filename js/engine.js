// Pure state engine. No DOM, no network. Nothing here ever dies:
// an empty tummy or a long absence only ever means a nap.
import { FIRST, LAST } from './data.js';

export const SCHEMA = 2;
export const RATE = { full: 5, clean: 2.5, joy: 3.5 }; // points lost per hour while awake
export const NAP_AFTER_H = 10;                          // away this long -> everyone naps
export const WAKE_FLOOR = { full: 40, clean: 40, joy: 60 };

export const clamp = v => Math.max(0, Math.min(100, v));
export const rand = a => a[Math.floor(Math.random() * a.length)];
export const makeName = () => rand(FIRST) + ' ' + rand(LAST);

export function newBeing(sp, now = Date.now()) {
  return { id: Math.random().toString(36).slice(2, 8), sp, name: makeName(),
    full: 80, clean: 90, joy: 75, napping: false, feasts: 0, hugs: 0, boings: 0, taps: 0, born: now };
}

export function newBurrow({ owner, bday, species }, now = Date.now()) {
  return { v: SCHEMA, owner, bday: bday || null, beings: species.map(sp => newBeing(sp, now)), log: [],
    lastTick: now, created: now, updatedAt: now, place: null, units: 'F' };
}

// Bring any older save up to the current schema.
export function migrate(s) {
  if (!s || !Array.isArray(s.beings) || !s.beings.length) return null;
  const now = Date.now();
  s.v = SCHEMA;
  s.log = Array.isArray(s.log) ? s.log : [];
  s.lastTick = s.lastTick || now;
  s.created = s.created || now;
  s.updatedAt = s.updatedAt || s.lastTick;
  if (!('place' in s)) s.place = null;
  if (!s.units) s.units = 'F';
  s.beings.forEach(b => { b.taps = b.taps || 0; b.hugs = b.hugs || 0; b.boings = b.boings || 0; b.feasts = b.feasts || 0; });
  return s;
}

/**
 * Environment multipliers for decay. Night halves everything (they're dozy);
 * wet weather muddies them faster; snow keeps spirits up; cold makes tummies rumble.
 */
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

/** Advance the burrow to `now`. Returns how long it was away and whether anyone fell asleep. */
export function catchUp(s, now = Date.now(), mult) {
  const hours = Math.max(0, (now - s.lastTick) / 36e5);
  let napped = false;
  s.beings.forEach(b => {
    decay(b, hours, mult);
    if (hours >= NAP_AFTER_H) b.napping = true;
    if (b.napping) napped = true;
  });
  s.lastTick = now;
  return { hours, napped };
}

export function wake(b, now = Date.now()) {
  if (!b.napping) return false;
  b.napping = false;
  b.full = Math.max(b.full, WAKE_FLOOR.full);
  b.clean = Math.max(b.clean, WAKE_FLOOR.clean);
  b.joy = Math.max(b.joy, WAKE_FLOOR.joy);
  b.glowUntil = now + 9000;
  return true;
}

export function feed(b, cheese) {
  if (b.full >= 96) return false;
  b.full = clamp(b.full + cheese.full);
  b.joy = clamp(b.joy + (cheese.joy || 3));
  b.feasts++;
  return true;
}
export function play(b) { b.joy = clamp(b.joy + 18); b.full = clamp(b.full - 3); b.boings++; }
export function hug(b) { b.joy = clamp(b.joy + 10); b.hugs++; }
export function scrub(b, amt) { b.clean = clamp(b.clean + amt); return b.clean >= 100; }

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

export function logFeast(s, b, cheese, now = Date.now()) {
  s.log.unshift({ n: b.name, c: cheese, t: now });
  s.log = s.log.slice(0, 40);
}

/** Last-writer-wins pick between two saves (used by sync). */
export function newer(a, b) {
  if (!a) return b; if (!b) return a;
  return (b.updatedAt || 0) > (a.updatedAt || 0) ? b : a;
}

export const encode = s => btoa(unescape(encodeURIComponent(JSON.stringify(s))));
export const decode = t => JSON.parse(decodeURIComponent(escape(atob(t.trim()))));
