import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';

const H = 36e5, T0 = Date.UTC(2026, 9, 30, 18);
const copy = o => JSON.parse(JSON.stringify(o));
const cheddar = { id: 'cheddar', full: 28 };
function pair() { const s = E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'], tz: 'America/Los_Angeles' }, T0); return [copy(s), copy(s)]; }

test('concurrent feeds on two devices both count', () => {
  const [phone, laptop] = pair();
  phone.beings[0].full = 20; laptop.beings[0].full = 20;
  E.feed(phone, phone.beings[0], cheddar, T0 + 1000, 'phone');
  E.feed(phone, phone.beings[0], cheddar, T0 + 2000, 'phone');
  E.feed(laptop, laptop.beings[0], cheddar, T0 + 1500, 'laptop');
  const m = E.merge(phone, laptop);
  assert.equal(E.count(m.beings[0], 'feasts'), 3);
  assert.equal(m.log.length, 3);
  assert.deepEqual(m.log.map(l => l.t), [T0 + 2000, T0 + 1500, T0 + 1000]);
});

test('merge is order-independent for counters, log and album', () => {
  const [a, b] = pair();
  E.hug(a, a.beings[1], T0 + 10, 'a'); E.hug(b, b.beings[1], T0 + 20, 'b');
  E.feed(b, b.beings[0], cheddar, T0 + 30, 'b');
  const ab = E.merge(a, b), ba = E.merge(b, a);
  assert.equal(E.count(ab.beings[1], 'hugs'), 2); assert.equal(E.count(ba.beings[1], 'hugs'), 2);
  assert.deepEqual(ab.log, ba.log); assert.deepEqual(ab.album, ba.album);
});

test('merging the same save twice changes nothing (idempotent)', () => {
  const [a, b] = pair(); E.feed(b, b.beings[0], cheddar, T0 + 30, 'b');
  const once = E.merge(a, b), twice = E.merge(once, b);
  assert.ok(E.sameSave(once, twice));
});

test('freshest care wins the stats', () => {
  const [a, b] = pair();
  a.beings[0].full = 10; a.beings[0].statsAt = T0 + 100;
  E.hug(b, b.beings[0], T0 + 500, 'b');        // later care on b
  const m = E.merge(a, b);
  assert.equal(m.beings[0].statsAt, T0 + 500);
  assert.equal(m.beings[0].full, b.beings[0].full);
});

test('renames, wearables and settings: newest wins', () => {
  const [a, b] = pair();
  E.rename(a, a.beings[0], 'Old Name', T0 + 10); E.rename(b, b.beings[0], 'New Name', T0 + 20);
  E.setWear(a, a.beings[1], 'bow', T0 + 30);
  E.setField(b, 'place', { name: 'Hillsboro', lat: 45.5, lon: -123 }, T0 + 40);
  const m = E.merge(a, b);
  assert.equal(m.beings[0].name, 'New Name'); assert.equal(m.beings[1].wear, 'bow'); assert.equal(m.place.name, 'Hillsboro');
});

test('care days union across devices (growth is never lost)', () => {
  const [a, b] = pair();
  a.beings[0].days = ['2026-10-01', '2026-10-03']; b.beings[0].days = ['2026-10-02', '2026-10-03'];
  assert.deepEqual(E.merge(a, b).beings[0].days, ['2026-10-01', '2026-10-02', '2026-10-03']);
});

test('starting over replaces the old burrow everywhere', () => {
  const [old] = pair();
  const fresh = E.newBurrow({ owner: 'Rob', species: ['mole', 'frog'] }, T0 + H);
  assert.equal(E.merge(old, fresh).id, fresh.id);
  assert.equal(E.merge(fresh, old).id, fresh.id);
});

test('merged beings catch up from their own clocks', () => {
  const [a, b] = pair();
  E.feed(b, b.beings[0], cheddar, T0 + H, 'b');
  const m = E.merge(a, b); const full = m.beings[0].full;
  E.catchUp(m, T0 + 3 * H);
  assert.equal(m.beings[0].full, Math.max(0, full - 5 * 2));      // 2 hours since that feed
});
