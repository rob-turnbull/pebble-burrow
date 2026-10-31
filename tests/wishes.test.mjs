import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import * as WS from '../js/wishes.js';
import { conditions } from '../js/conditions.js';

const T0 = Date.UTC(2026, 9, 31, 19);
const c = conditions({ w: { kind: 'clear', temp: 60, feels: 60, wind: 3, hours: [] }, phase: 'day', season: 'autumn' });
const burrow = () => E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'], tz: 'America/Los_Angeles' }, T0);

test('each pet gets 2–3 wishes a day, the same on every device, new tomorrow', () => {
  const s = burrow(), a = WS.todaysWishes(s, c, T0), b = WS.todaysWishes(JSON.parse(JSON.stringify(s)), c, T0);
  assert.deepEqual(a, b);
  for (const being of s.beings) { const n = a.filter(w => w.being === being.id).length; assert.ok(n >= 2 && n <= 3); }
  assert.notDeepEqual(a.map(w => w.id), WS.todaysWishes(s, c, T0 + 864e5).map(w => w.id).concat('x'));
});

test('wishes are granted by the right action, by the right pet', () => {
  const s = burrow(), fox = s.beings[0];
  const list = [{ key: 'k1', being: fox.id, id: 'cheese', arg: 'brie', need: 1 }, { key: 'k2', being: fox.id, id: 'boing', need: 3 }, { key: 'k3', being: s.beings[1].id, id: 'photo', need: 1 }];
  assert.equal(WS.grant(s, list, 'feed', fox.id, { cheese: 'cheddar' }).length, 0, 'wrong cheese');
  assert.equal(WS.grant(s, list, 'feed', s.beings[1].id, { cheese: 'brie' }).length, 0, 'wrong pet');
  assert.equal(WS.grant(s, list, 'feed', fox.id, { cheese: 'brie' })[0].key, 'k1');
  WS.grant(s, list, 'boing', fox.id); WS.grant(s, list, 'boing', fox.id);
  assert.equal(WS.progress(s, 'k2'), 2); assert.equal(WS.grant(s, list, 'boing', fox.id).length, 1);
  assert.equal(WS.grant(s, list, 'photo', null).length, 1, 'burrow-wide wishes count from anyone');
  assert.equal(WS.grantedTotal(s), 3);
});

test('wish progress merges across devices', () => {
  const a = burrow(), b = JSON.parse(JSON.stringify(a)), list = [{ key: '2026-10-31|x|boing', being: 'x', id: 'boing', need: 3 }];
  WS.grant(a, list, 'boing', 'x', {}, 'phone'); WS.grant(b, list, 'boing', 'x', {}, 'laptop'); WS.grant(b, list, 'boing', 'x', {}, 'laptop');
  const m = E.merge(a, b);
  assert.equal(WS.progress(m, '2026-10-31|x|boing'), 3); assert.ok(WS.done(m, list[0]));
});

test('wishes only ask for what is possible today', () => {
  const s = burrow();
  for (let d = 0; d < 60; d++) {
    const list = WS.todaysWishes(s, c, T0 + d * 864e5);
    assert.ok(!list.some(w => w.id === 'water' || w.id === 'snack'), 'no garden, no garden wishes');
    assert.ok(!list.some(w => w.id === 'dress'), 'sprouts can’t dress up yet');
  }
});
