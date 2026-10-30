import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import * as R from '../js/room.js';
import { temperamentOf } from '../js/personality.js';

const T0 = Date.UTC(2026, 9, 30, 19);
const burrow = () => E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'], tz: 'America/Los_Angeles' }, T0);

test('furniture unlocks from games, weather, seasons and growth', () => {
  const s = burrow();
  assert.deepEqual(R.unlocked(s), []);
  E.playedGame(s, s.beings[0], 'catch', 3, T0 + 1);
  E.keepsake(s, 'wx:rain', '🌧️', 'x', T0 + 2); E.keepsake(s, 'halloween:2026', '🎃', 'x', T0 + 3);
  assert.deepEqual(R.unlocked(s).sort(), ['lamp', 'plant', 'pumpkin']);
});

test('items only go where they fit', () => {
  assert.equal(R.fits('armchair', 'floorL'), true);
  assert.equal(R.fits('armchair', 'wallL'), false);
  assert.equal(R.fits('lights', 'wallR'), true);
  assert.equal(R.fits('globe', 'sill'), true);
});

test('room placements merge per slot, newest wins', () => {
  const a = burrow(), b = JSON.parse(JSON.stringify(a));
  R.place(a, 'floorL', 'lamp', T0 + 10); R.place(b, 'floorL', 'plant', T0 + 20); R.place(b, 'sill', 'globe', T0 + 5);
  const m = E.merge(a, b);
  assert.equal(m.room.floorL.item, 'plant'); assert.equal(m.room.sill.item, 'globe');
});

test('grown beings choose a favourite spot that suits them', () => {
  const s = burrow(), b = s.beings[0];
  assert.equal(R.favouriteSpot(s, b), null, 'sprouts wander');
  b.days = Array.from({ length: 30 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
  const like = { shy: 'armchair', bouncy: 'pumpkin', sleepy: 'armchair', curious: 'books', bold: 'wheel' }[temperamentOf(b)];
  R.place(s, 'floorR', like, T0);
  assert.deepEqual(R.favouriteSpot(s, b), { slot: 'floorR', item: like });
});

test('the room puts napping beings in bed', () => {
  const s = burrow(); s.beings[1].napping = true;
  const html = R.roomHTML(s);
  assert.match(html, /class="being inbed napping" data-i="1"/);
  assert.match(html, /class="being inroom" data-i="0"/);
});
