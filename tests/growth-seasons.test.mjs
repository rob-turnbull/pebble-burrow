import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { seasonal, seasonOf } from '../js/seasons.js';

const days = n => Array.from({ length: n }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`).concat(n > 31 ? Array.from({ length: n - 31 }, (_, i) => `2026-02-${String(i + 1).padStart(2, '0')}`) : []).slice(0, n);

test('stages: sprout → young at 7 tended days → grown at 30', () => {
  const b = E.newBeing('fox', 0);
  b.days = days(6); assert.equal(E.stageOf(b), 'sprout'); assert.deepEqual(E.nextStage(b), { id: 'young', in: 1 });
  b.days = days(7); assert.equal(E.stageOf(b), 'young'); assert.deepEqual(E.nextStage(b), { id: 'grown', in: 23 });
  b.days = days(30); assert.equal(E.stageOf(b), 'grown'); assert.equal(E.nextStage(b), null);
});

test('growing up leaves keepsakes once', () => {
  const s = E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'] }, 0);
  s.beings[0].days = days(30);
  const fresh = E.checkGrowth(s, 5);
  assert.deepEqual(fresh.map(f => f.stage), ['young', 'grown']);
  assert.equal(E.checkGrowth(s, 6).length, 0);
});

test('caring twice on the same day counts one day', () => {
  const s = E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'], tz: 'America/Los_Angeles' }, 0);
  const noon = Date.UTC(2026, 9, 30, 19);
  E.hug(s, s.beings[0], noon); E.hug(s, s.beings[0], noon + 3600e3);
  assert.deepEqual(s.beings[0].days, ['2026-10-30']);
});

test('wearables unlock from growth, care and keepsakes', () => {
  const s = E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'] }, 0), b = s.beings[0];
  let u = E.unlockedWear(s, b);
  assert.deepEqual(Object.keys(u).filter(k => u[k]), []);
  b.days = days(7); b.cnt.feasts = { a: 10 }; b.cnt.hugs = { a: 20, b: 5 };
  E.keepsake(s, 'halloween:2026', '🎃', 'x', 1);
  u = E.unlockedWear(s, b);
  assert.deepEqual(Object.keys(u).filter(k => u[k]).sort(), ['bow', 'flowers', 'pumpkin', 'scarf']);
});

test('halloween runs Oct 24 – Nov 1 with costumes on the 31st', () => {
  assert.ok(!seasonal(new Date(2026, 9, 23)).events.includes('halloween'));
  assert.ok(seasonal(new Date(2026, 9, 24)).events.includes('halloween'));
  assert.ok(seasonal(new Date(2026, 10, 1)).events.includes('halloween'));
  assert.ok(!seasonal(new Date(2026, 10, 2)).events.includes('halloween'));
  assert.equal(seasonal(new Date(2026, 9, 31)).costume, true);
  assert.equal(seasonal(new Date(2026, 9, 30)).costume, false);
});

test('winter lights wrap the new year; seasons flip in the southern hemisphere', () => {
  assert.ok(seasonal(new Date(2026, 11, 20)).events.includes('lights'));
  assert.ok(seasonal(new Date(2027, 0, 5)).events.includes('lights'));
  assert.ok(seasonal(new Date(2027, 0, 1)).events.includes('newyear'));
  assert.equal(seasonOf(new Date(2026, 9, 30), 45.5), 'autumn');
  assert.equal(seasonOf(new Date(2026, 9, 30), -33.9), 'spring');
});

test('more seasonal events: harvest, fireworks, blossoms, picnics', () => {
  assert.ok(seasonal(new Date(2026, 10, 20)).events.includes('harvest'));
  assert.ok(!seasonal(new Date(2026, 10, 5)).events.includes('harvest'));
  assert.ok(seasonal(new Date(2026, 11, 31, 21)).events.includes('fireworks'));
  assert.ok(!seasonal(new Date(2026, 11, 31, 12)).events.includes('fireworks'), 'evening only');
  assert.ok(seasonal(new Date(2027, 3, 10)).events.includes('blossom'));
  assert.ok(seasonal(new Date(2026, 9, 10), -33.9).events.includes('blossom'), 'southern spring');
  assert.ok(seasonal(new Date(2027, 6, 17, 13)).events.includes('picnic'), 'summer saturday afternoon');
  assert.ok(!seasonal(new Date(2027, 6, 14, 13)).events.includes('picnic'), 'not on a wednesday');
});
