import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import * as V from '../js/visitors.js';
import * as GD from '../js/garden.js';
import { conditions } from '../js/conditions.js';
import * as Mail from '../worker/src/mail.js';

const W = (kind, temp) => ({ kind, temp, feels: temp, wind: 3, uv: 6, cloud: 10, hours: [] });
const s0 = () => E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'] }, 1);

test('visitors only come when the time and weather suit them', () => {
  const s = s0();
  const rainyDay = V.eligible(conditions({ w: W('rain', 55), phase: 'day', season: 'autumn' }), s).map(v => v.id);
  assert.ok(rainyDay.includes('duckling')); assert.ok(!rainyDay.includes('butterfly')); assert.ok(!rainyDay.includes('fireflies'));
  const summerNight = V.eligible(conditions({ w: W('clear', 72), phase: 'night', season: 'summer' }), s).map(v => v.id);
  assert.ok(summerNight.includes('fireflies')); assert.ok(!summerNight.includes('squirrel'));
  const day = conditions({ w: W('clear', 75), phase: 'day', season: 'summer' });
  assert.ok(!V.eligible(day, s).some(v => v.id === 'bee'), 'bees want a garden');
  GD.plant(s, 0, 'carrot', 1);
  assert.ok(V.eligible(day, s).some(v => v.id === 'bee'));
});

test('greeting fills the visitor book once, gifts arrive, and it merges', () => {
  const a = s0(), b = JSON.parse(JSON.stringify(a));
  assert.deepEqual(V.greet(a, 'snail', 'phone', 10), { first: true, gift: 'clover' });
  assert.equal(V.greet(a, 'snail', 'phone', 20).first, false);
  V.greet(b, 'snail', 'laptop', 15); V.greet(b, 'cat', 'laptop', 16);
  const m = E.merge(a, b);
  assert.equal(V.timesMet(m, 'snail'), 3); assert.equal(V.timesMet(m, 'cat'), 1); assert.equal(m.visitors.snail.first, 10);
});

test('visits are occasional; clover makes them likelier', () => {
  const c = conditions({ w: W('clear', 60), phase: 'day', season: 'autumn' }), s = s0();
  let n = 0, lucky = 0; for (let i = 0; i < 4000; i++) { if (V.maybeVisit(c, s)) n++; if (V.maybeVisit(c, s, Math.random, 1.6)) lucky++; }
  assert.ok(n > 800 && n < 1200, `about a quarter of checks (${n})`); assert.ok(lucky > n * 1.3);
});

test('postcards can carry a small photo', () => {
  const jpeg = 'data:image/jpeg;base64,' + 'A'.repeat(50000);
  const ok = Mail.validate({ from: { name: 'Sam', reply: 'https://x.workers.dev/mail/' + 's'.repeat(24) }, doodle: jpeg });
  assert.ok(ok.card);
  assert.equal(Mail.validate({ from: { name: 'Sam', reply: 'https://x.workers.dev/mail/' + 's'.repeat(24) }, doodle: 'data:image/jpeg;base64,' + 'A'.repeat(130000) }).status, 413);
});
