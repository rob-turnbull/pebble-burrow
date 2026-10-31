import test from 'node:test';
import assert from 'node:assert/strict';
import { genesOf, art, EYES, MARKS, shade } from '../js/art.js';

test('genes are stable per being and vary across beings', () => {
  assert.deepEqual(genesOf({ id: 'abc' }), genesOf({ id: 'abc' }));
  const many = Array.from({ length: 300 }, (_, i) => genesOf({ id: 'x' + i }));
  assert.equal(new Set(many.map(g => g.eye)).size, EYES.length, 'every eye style turns up');
  assert.equal(new Set(many.map(g => g.mark)).size, MARKS.length, 'every marking turns up');
  assert.ok(many.every(g => Math.abs(g.hue) <= 14 && g.size >= 0.93 && g.size <= 1.07), 'variety stays on-theme');
});

test('two beings of the same species draw differently; defaults still draw', () => {
  const a = art('frog', { genes: genesOf({ id: 'p1' }) }), b = art('frog', { genes: genesOf({ id: 'p9' }) });
  assert.notEqual(a, b);
  assert.match(art('owl'), /class="pupils"/);
  assert.match(a, /class="eye-happy"/); assert.match(a, /class="brows"/);
});

test('colour shifts stay close to the species colour', () => {
  assert.match(shade('#eb9459', 10, -5), /^#[0-9a-f]{6}$/);
  assert.equal(shade('#808080', 0, 0), '#808080');
});
