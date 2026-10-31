import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import * as F from '../js/friends.js';
import { conditions } from '../js/conditions.js';

const T0 = Date.UTC(2026, 9, 30, 19);
const pair = () => E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'], tz: 'America/Los_Angeles' }, T0);

test('friendship grows from shared care days and moments, and merges per device', () => {
  const a = pair(); assert.equal(F.level(a).label, 'new pals');
  a.beings[0].days = ['2026-10-01', '2026-10-02', '2026-10-03']; a.beings[1].days = ['2026-10-02', '2026-10-03'];
  assert.equal(F.sharedDays(a), 2); assert.equal(F.bondPoints(a), 6);
  const b = JSON.parse(JSON.stringify(a));
  F.bond(a, 10, 'phone'); F.bond(b, 8, 'laptop');
  const m = E.merge(a, b);
  assert.equal(F.bondPoints(m), 24); assert.equal(F.level(m).label, 'friends');
  assert.equal(F.bondPoints(E.merge(m, b)), 24, 'merging again does not double count');
});

test('moments fit the moment', () => {
  const s = pair();
  const night = conditions({ w: { kind: 'clear', temp: 60, feels: 60, wind: 2, hours: [] }, phase: 'night' });
  const kinds = new Set(Array.from({ length: 200 }, () => F.pickMoment(s, night, []).kind));
  assert.ok(kinds.has('stargaze'));
  assert.ok(![...kinds].includes('cloudnames'), 'no cloud naming at night');
  s.beings[1].napping = true;
  assert.equal(F.pickMoment(s, night, []), null, 'nobody plays while one is napping');
});

test('the away diary gets a moment together for longer absences', () => {
  const s = pair();
  assert.equal(F.diaryMoments(s, T0, T0 + 3600e3).length, 0);
  assert.match(F.diaryMoments(s, T0, T0 + 5 * 3600e3)[0].text, /and/);
});

test('a pet that hatched on another device joins on merge, in hatch order', () => {
  const a = pair(), b = JSON.parse(JSON.stringify(a));
  const newcomer = E.newBeing('bunny', T0 + 5000); b.beings.push(newcomer);
  E.setField(b, 'egg', { sp: 'bunny', at: T0 + 4000, hatched: true, id: newcomer.id }, T0 + 5000);
  const m = E.merge(a, b);
  assert.equal(m.beings.length, 3); assert.equal(m.beings[2].sp, 'bunny'); assert.equal(m.egg.hatched, true);
  assert.equal(E.merge(m, a).beings.length, 3, 'stays merged');
});

test('with three pets, moments pick any two who are awake', () => {
  const s = pair(); s.beings.push(E.newBeing('bunny', T0)); s.beings[0].napping = true;
  const c = conditions({ w: { kind: 'clear', temp: 60, feels: 60, wind: 2, hours: [] }, phase: 'day' });
  for (let k = 0; k < 50; k++) { const m = F.pickMoment(s, c, []); assert.ok(m && !m.who.includes(0) && m.who[0] !== m.who[1]); }
});
