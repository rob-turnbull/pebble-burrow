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

test('all sixteen species draw, with faces and room for outfits', async () => {
  const { SPECIES } = await import('../js/data.js');
  const { anchors } = await import('../js/outfits.js');
  assert.equal(Object.keys(SPECIES).length, 16);
  for (const sp of Object.keys(SPECIES)) {
    const svg = art(sp, { genes: genesOf({ id: 'id-' + sp }) });
    assert.match(svg, /class="pupils"/, sp); assert.match(svg, /class="eye-closed"/, sp);
    const A = anchors({ id: 'id-' + sp, sp }); assert.ok(A.feet > A.t && A.rx > 0, sp);
  }
});

test('each burrow gets its own horizon, and one re-roll that sticks', async () => {
  const HZ = await import('../js/horizon.js');
  const E = await import('../js/engine.js');
  const kinds = new Set(Array.from({ length: 200 }, (_, i) => HZ.horizonOf({ id: 'b' + i }).kind));
  assert.equal(kinds.size, Object.keys(HZ.HORIZONS).length, 'every view turns up');
  const s = E.newBurrow({ owner: 'Rob', species: ['fox', 'owl'] }, 1), first = HZ.horizonOf(s).kind;
  assert.equal(HZ.reroll(s, 5), true); assert.notEqual(s.horizon.kind, first);
  assert.equal(HZ.reroll(s, 6), false, 'only once');
  for (const k of Object.keys(HZ.HORIZONS)) assert.match(HZ.horizonSVG({ kind: k, seed: 3 }), /<svg class="hz-svg"/);
});
