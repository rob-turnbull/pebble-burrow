import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import * as LT from '../js/letters.js';

const D = 864e5, SUN = Date.UTC(2026, 10, 8, 18);   // Sunday 8 Nov 2026, 10am PST
const burrow = () => E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'], tz: 'America/Los_Angeles' }, SUN - 9 * D);

test('one letter a week, not before there is a week to write about', () => {
  const young = E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'], tz: 'America/Los_Angeles' }, SUN - 2 * D);
  assert.equal(LT.letterDue(young, SUN), null);
  const s = burrow(); const wk = LT.letterDue(s, SUN);
  assert.equal(wk, '2026-11-08');
  LT.addLetter(s, LT.writeLetter(s, SUN));
  assert.equal(LT.letterDue(s, SUN + D), null, 'already written this week');
  assert.equal(LT.letterDue(s, SUN + 7 * D), '2026-11-15');
});

test('the letter is about their actual week', () => {
  const s = burrow(); s.beings.forEach(b => b.full = 0);
  E.feed(s, s.beings[0], { id: 'brie', full: 10 }, SUN - 2 * D); E.feed(s, s.beings[1], { id: 'brie', full: 10 }, SUN - D);
  E.noteWeather(s, 'rain', SUN - 3 * D); E.noteWeather(s, 'rain', SUN - 2 * D);
  const L = LT.writeLetter(s, SUN);
  assert.match(L.text, /2 feasts/); assert.match(L.text, /brie/); assert.match(L.text, /rainy \(2 days/); assert.match(L.text, /Rob/);
});

test('letters merge by week across devices', () => {
  const a = burrow(), b = JSON.parse(JSON.stringify(a));
  LT.addLetter(a, LT.writeLetter(a, SUN)); LT.addLetter(b, LT.writeLetter(b, SUN + 7 * D));
  assert.deepEqual(E.merge(a, b).letters.map(l => l.week), ['2026-11-08', '2026-11-15']);
});
