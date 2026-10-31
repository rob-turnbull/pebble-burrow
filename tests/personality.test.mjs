import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import * as P from '../js/personality.js';

const T0 = Date.UTC(2026, 9, 30, 19), D = 864e5;
const burrow = () => E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'], tz: 'America/Los_Angeles' }, T0);
const cheese = id => ({ id, full: 5 });

test('temperament is stable for an id and covers all five', () => {
  const b = E.newBeing('fox'); assert.equal(P.temperamentOf(b), P.temperamentOf(JSON.parse(JSON.stringify(b))));
  const seen = new Set(Array.from({ length: 200 }, (_, i) => P.temperamentOf({ id: 'x' + i })));
  assert.deepEqual([...seen].sort(), P.TEMPERAMENT_IDS.slice().sort());
});

test('favourite cheese is learned only once there is a pattern', () => {
  const s = burrow(), b = s.beings[0]; b.full = 0;
  E.feed(s, b, cheese('brie'), T0 + 1); E.feed(s, b, cheese('brie'), T0 + 2);
  assert.equal(P.favouriteCheese(s, b), null);
  E.feed(s, b, cheese('cheddar'), T0 + 3); E.feed(s, b, cheese('brie'), T0 + 4);
  assert.equal(P.favouriteCheese(s, b), 'brie');
  assert.equal(P.favouriteCheese(s, s.beings[1]), null, 'the other being has its own tastes');
});

test('feeding the favourite gets a remembering line; a 3-day streak is called out', () => {
  const s = burrow(), b = s.beings[0];
  for (let d = 0; d < 3; d++) { b.full = 0; E.feed(s, b, cheese('brie'), T0 + d * D); }
  assert.match(P.feedLine(s, b, 'brie'), /3 days in a row/);
  b.full = 0; E.feed(s, b, cheese('cheddar'), T0 + 3 * D);
  assert.match(P.feedLine(s, b, 'cheddar', a => a[0]), /not brie/);
});

test('weather diary drives streak lines', () => {
  const s = burrow();
  for (let d = 0; d < 3; d++) E.noteWeather(s, 'rain', T0 + d * D);
  assert.equal(P.weatherStreak(s, 'rain', T0 + 2 * D), 3);
  assert.match(P.weatherLine(s, s.beings[0], 'rain', T0 + 2 * D), /third rainy day in a row/);
  assert.equal(E.noteWeather(s, 'rain', T0 + 2 * D + 1000), false, 'same day, no change');
});

test('care during weather teaches a favourite weather, and merges across devices', () => {
  const a = burrow(), b = JSON.parse(JSON.stringify(a));
  E.noteWeather(a, 'snow', T0); E.noteWeather(b, 'snow', T0);
  E.hug(a, a.beings[0], T0 + 1, 'phone'); E.play(a, a.beings[0], T0 + 2, 'phone');
  E.hug(b, b.beings[0], T0 + 3, 'laptop');
  const m = E.merge(a, b);
  assert.equal(P.favouriteWeather(m.beings[0]), 'snow');
  assert.ok(P.profile(m, m.beings[0]).some(x => /snowy/.test(x)));
});

test('games are no-lose: even a zero score earns joy, and the first play is kept', () => {
  const s = burrow(), b = s.beings[0]; b.joy = 40; b.full = 50;
  const r = E.playedGame(s, b, 'catch', 0, T0 + 5);
  assert.equal(r.joy, 6); assert.equal(b.joy, 46); assert.equal(b.full, 46);
  assert.equal(E.playedGame(s, b, 'catch', 20, T0 + 6).joy, 30, 'capped');
  assert.equal(E.gamesPlayed(s), 2);
  assert.equal(s.album.filter(k => k.k === 'game:catch').length, 1);
});

test('tucked in: nothing decays overnight, and morning brings them back well rested', () => {
  const s = burrow(), b = s.beings[0]; b.full = 50; b.joy = 50;
  assert.equal(E.tuck(s, b, T0), true); assert.equal(b.napping, true); assert.equal(b.joy, 58);
  E.catchUp(s, T0 + 9 * 3600e3); assert.equal(b.full, 50, 'asleep, so no decay');
  const woke = E.goodMorning(s, T0 + 9 * 3600e3);
  assert.equal(woke.length, 1); assert.equal(woke[0].rested, true);
  assert.equal(b.napping, false); assert.equal(b.joy, 68); assert.equal(b.bedtime, 0);
  assert.equal(E.goodMorning(s, T0 + 10 * 3600e3).length, 0, 'only once');
  assert.equal(E.tuck(s, s.beings[1], T0), true); E.wake(s, s.beings[1], T0 + 3600e3); assert.equal(s.beings[1].bedtime, 0, 'woken early');
});
