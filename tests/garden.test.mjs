import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import * as GD from '../js/garden.js';
import { conditions } from '../js/conditions.js';

const T0 = Date.UTC(2026, 9, 30, 19), H = 36e5;
const s0 = () => E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'] }, T0);
const C = (kind, temp, phase = 'day') => conditions({ w: { kind, temp, feels: temp, wind: 3, uv: 6, cloud: 5, hours: [] }, phase });

test('rain waters, sun speeds up, frost pauses, dry waits (nothing dies)', () => {
  const s = s0(); GD.plant(s, 0, 'carrot', T0);
  GD.grow(s, T0 + 4 * H, C('rain', 55));
  assert.equal(s.garden[0].water > 80, true, 'rain keeps it watered');
  const g1 = s.garden[0].growth; assert.ok(g1 > 0.35 && g1 < 0.45);
  GD.grow(s, T0 + 6 * H, C('snow', 25)); assert.equal(s.garden[0].growth, g1, 'frost pauses');
  s.garden[0].water = 0; GD.grow(s, T0 + 30 * H, C('clear', 70)); assert.equal(s.garden[0].growth, g1, 'dry waits');
  assert.equal(GD.status(s.garden[0], C('clear', 70)).k, 'dry');
  GD.water(s, 0, T0 + 30 * H);
  const ripe = GD.grow(s, T0 + 60 * H, C('clear', 70));
  assert.ok(s.garden[0].growth >= 1); assert.deepEqual(ripe, [0]);
});

test('harvest fills the pantry; snacks are used once; counts merge per device', () => {
  const a = s0(); GD.plant(a, 1, 'strawberry', T0); a.garden[1].growth = 1;
  assert.deepEqual(GD.harvest(a, 1, 'phone', T0 + H), { seed: 'strawberry', n: 3 });
  assert.equal(GD.stock(a).strawberry, 3);
  const b = JSON.parse(JSON.stringify(a));
  assert.ok(GD.useSnack(a, 'strawberry', 'phone')); assert.ok(GD.useSnack(b, 'strawberry', 'laptop'));
  const m = E.merge(a, b); assert.equal(GD.stock(m).strawberry, 1, 'both devices ate one');
  assert.equal(GD.useSnack(m, 'carrot'), false);
});

test('plots merge by newest change, and seasons limit what can be planted', () => {
  const a = s0(), b = JSON.parse(JSON.stringify(a));
  GD.plant(a, 2, 'carrot', T0 + 10); GD.plant(b, 2, 'pumpkin', T0 + 20);
  assert.equal(E.merge(a, b).garden[2].seed, 'pumpkin');
  assert.ok(!GD.plantable('winter').includes('strawberry')); assert.ok(GD.plantable('autumn').includes('pumpkin'));
});
