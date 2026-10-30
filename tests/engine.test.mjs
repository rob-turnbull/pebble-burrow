// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { sunTimes, phaseAt } from '../js/sky.js';
import { kindFromCode } from '../js/weather.js';

const H = 36e5;
const burrow = (now = 0) => E.newBurrow({ owner: 'Rob', bday: { d: 30, m: 10 }, species: ['frog', 'owl'], tz: 'America/Los_Angeles' }, now);

test('nothing ever dies: a week away only means napping, stats never go negative', () => {
  const s = burrow(0);
  const { napped } = E.catchUp(s, 7 * 24 * H);
  assert.equal(napped, true);
  for (const b of s.beings) { assert.equal(b.napping, true); assert.ok(b.full >= 0 && b.clean >= 0 && b.joy >= 0); }
});

test('napping freezes decay', () => {
  const s = burrow(0); s.beings[0].napping = true; const before = s.beings[0].full;
  E.catchUp(s, 5 * H);
  assert.equal(s.beings[0].full, before);
});

test('short absence decays but keeps them awake', () => {
  const s = burrow(0); E.catchUp(s, 2 * H);
  assert.equal(s.beings[0].napping, false);
  assert.equal(s.beings[0].full, 80 - 10);
});

test('waking restores floors, glows, and counts as a care day', () => {
  const s = burrow(0), b = s.beings[0]; Object.assign(b, { napping: true, full: 0, clean: 5, joy: 1 });
  assert.equal(E.wake(s, b, 1000), true);
  assert.deepEqual([b.full, b.clean, b.joy, b.napping], [40, 40, 60, false]);
  assert.equal(E.mood(b, { now: 2000 }).t, 'glowing');
  assert.equal(b.days.length, 1);
});

test('night halves decay, rain muddies faster, cold makes tummies rumble', () => {
  const m = E.envMultipliers({ phase: 'night', kind: 'rain', cold: true });
  assert.equal(m.joy, 0.5); assert.equal(m.clean, 0.75); assert.equal(m.full, 0.6);
});

test('feeding refuses when full, logs feasts, and earns a first-feast keepsake', () => {
  const s = burrow(0), b = s.beings[0]; b.full = 97;
  assert.equal(E.feed(s, b, { id: 'brie', full: 28 }, 10), false);
  b.full = 50; assert.equal(E.feed(s, b, { id: 'brie', full: 28 }, 20, 'phone'), true);
  assert.equal(b.full, 78); assert.equal(E.count(b, 'feasts'), 1);
  assert.equal(s.log[0].c, 'brie');
  assert.ok(s.album.some(k => k.k === 'firstfeast:' + b.id));
});

test('birthday detection uses day and month only', () => {
  const s = burrow(0);
  assert.equal(E.isBirthday(s, new Date(2031, 9, 30)), true);
  assert.equal(E.isBirthday(s, new Date(2031, 9, 29)), false);
});

test('backup codes round-trip, including emoji and accents', () => {
  const s = burrow(0); s.owner = 'Rób 🧀';
  assert.deepEqual(E.decode(E.encode(s)), s);
});

test('migrate upgrades v1 and v2 saves to v3 without losing counts', () => {
  const v2 = { v: 2, owner: 'Rob', bday: null, beings: [{ id: 'm1', sp: 'mole', name: 'x', full: 50, clean: 50, joy: 50, napping: false, feasts: 7, hugs: 3, boings: 1 }], log: [], lastTick: 5, created: 5, updatedAt: 9, place: null, units: 'F' };
  const s = E.migrate(v2);
  assert.equal(s.v, E.SCHEMA); assert.ok(s.id); assert.equal(s.updatedAt, 9);
  assert.equal(E.count(s.beings[0], 'feasts'), 7); assert.equal(E.count(s.beings[0], 'hugs'), 3);
  assert.equal(s.beings[0].feasts, undefined);
  assert.ok(s.album.some(k => k.k === 'hatch'));
  assert.equal(E.migrate({ beings: [] }), null);
});

test('peek text describes each being', () => {
  const s = burrow(0); const t = E.peekText(s, { now: 0, phase: 'day' });
  assert.match(t, /Rob's burrow/); assert.match(t, /sprout/); assert.match(t, /nothing here ever dies/);
});

test('sunrise/sunset for Hillsboro, OR on 2026-10-30 lands near 7:50 / 17:58 PDT', () => {
  const day = new Date(Date.UTC(2026, 9, 30, 19));
  const { rise, set } = sunTimes(day, 45.52, -122.99);
  const pdt = ms => new Date(ms - 7 * H).toISOString().slice(11, 16);
  const mins = t => +t.slice(0, 2) * 60 + +t.slice(3);
  assert.ok(Math.abs(mins(pdt(rise)) - mins('07:50')) <= 6, 'sunrise ' + pdt(rise));
  assert.ok(Math.abs(mins(pdt(set)) - mins('17:58')) <= 6, 'sunset ' + pdt(set));
});

test('polar night in Tromsø mid-December', () => {
  assert.equal(sunTimes(new Date(Date.UTC(2026, 11, 15, 12)), 69.65, 18.96).polar, 'night');
});

test('phase boundaries', () => {
  const sun = { rise: 7 * H, set: 18 * H };
  assert.equal(phaseAt(7 * H, sun).phase, 'dawn');
  assert.equal(phaseAt(12 * H, sun).phase, 'day');
  assert.equal(phaseAt(18 * H, sun).phase, 'dusk');
  assert.equal(phaseAt(22 * H, sun).phase, 'night');
  assert.equal(phaseAt(3 * H, sun).phase, 'night');
});

test('WMO weather codes map to burrow weather', () => {
  assert.deepEqual([0, 3, 45, 53, 63, 81, 73, 95].map(kindFromCode), ['clear', 'clouds', 'fog', 'drizzle', 'rain', 'rain', 'snow', 'storm']);
});
