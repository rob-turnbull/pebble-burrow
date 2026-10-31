import test from 'node:test';
import assert from 'node:assert/strict';
import { moonPhase, moonSVG, meteorShower, starRate } from '../js/night.js';

test('moon phases match the 2026 calendar', () => {
  assert.equal(moonPhase(new Date(Date.UTC(2026, 10, 9, 12))).name, 'new moon');
  assert.equal(moonPhase(new Date(Date.UTC(2026, 10, 24, 12))).name, 'full moon');
  assert.ok(moonPhase(new Date(Date.UTC(2026, 10, 24, 12))).lit > 0.97);
  assert.match(moonSVG(moonPhase(new Date(Date.UTC(2026, 10, 2)))), /<path d="M20 2/);
});

test('meteor showers and shooting star rates', () => {
  assert.equal(meteorShower(new Date(2026, 7, 12, 23)), 'Perseids');
  assert.equal(meteorShower(new Date(2026, 11, 14, 2)), 'Geminids');
  assert.equal(meteorShower(new Date(2026, 6, 1)), null);
  assert.equal(starRate({ phase: 'day', kind: 'clear' }), 0);
  assert.equal(starRate({ phase: 'night', kind: 'rain' }), 0, 'none through clouds');
  assert.ok(starRate({ phase: 'night', kind: 'clear', date: new Date(2026, 7, 12, 23) }) < starRate({ phase: 'night', kind: 'clear', date: new Date(2026, 6, 1, 23) }), 'more during showers');
});
