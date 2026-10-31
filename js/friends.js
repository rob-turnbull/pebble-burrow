// The two pets are friends, and the friendship grows: from the days you cared for both of them,
// from moments they share on the hill, and from playing together.
import { count } from './engine.js';
import { temperamentOf } from './personality.js';

export const LEVELS = [
  { at: 0, label: 'new pals', hearts: 1 },
  { at: 20, label: 'friends', hearts: 2 },
  { at: 60, label: 'good friends', hearts: 3 },
  { at: 150, label: 'best friends', hearts: 4 },
  { at: 300, label: 'inseparable', hearts: 5 }
];

/** Days both pets were cared for (merged across devices, never lost). */
export const sharedDays = s => s.beings.length < 2 ? 0 : s.beings[0].days.filter(d => s.beings[1].days.includes(d)).length;
export const bondPoints = s => Object.values(s.bond || {}).reduce((a, n) => a + n, 0) + 3 * sharedDays(s);

export function level(s) {
  const p = bondPoints(s);
  let i = 0; LEVELS.forEach((l, k) => { if (p >= l.at) i = k; });
  const next = LEVELS[i + 1];
  return { ...LEVELS[i], index: i, points: p, next: next ? { label: next.label, in: next.at - p } : null };
}

/** Add friendship points (counted per device so merges never double count). */
export function bond(s, n, dev = 'here', now = Date.now()) {
  s.bond = s.bond || {};
  s.bond[dev] = (s.bond[dev] || 0) + n;
  s.updatedAt = Math.max(s.updatedAt || 0, now);
}

/* ---------------- moments together ---------------- */
// Each returns lines for [first, second] pet; `cls` drives the animation on the hill.
const MOMENTS = {
  tag:       { cls: 'tag',       ok: (a, b) => [a, b].some(x => x === 'bouncy' || x === 'curious'), lines: [['tag! you’re it!', 'no fair, i was tying my shoe'], ['race you to the flower!', 'ready, set— hey!']] },
  whisper:   { cls: 'whisper',   ok: (a, b) => [a, b].includes('shy'), lines: [['psst. i have a secret.', '*gasps* no WAY'], ['want to hear something?', 'always.']] },
  share:     { cls: 'share',     ok: (a, b, s) => Math.abs(s.beings[0].full - s.beings[1].full) > 25, lines: [['here, have half my snack', 'you’re the best'], ['i saved you a crumb', 'a whole crumb?!']] },
  huddle:    { cls: 'huddle',    ok: (a, b, s, c) => c && (c.storm || c.cold || c.windy), lines: [['scoot closer, it’s chilly', 'warm buddy activated'], ['hold on to me', 'always do']] },
  stargaze:  { cls: 'stargaze',  ok: (a, b, s, c) => c && c.night && c.kind === 'clear', lines: [['that one’s yours', 'and that one’s yours'], ['look, a shooting star!', 'i wished for more cheese']] },
  hats:      { cls: 'whisper',   ok: (a, b, s, c, o) => o && o.every(x => x && x.items.some(i => ['rainhat', 'beanie', 'sunhat', 'nightcap', 'leafhat', 'earmuffs'].includes(i))), lines: [['nice hat.', 'nice hat yourself.'], ['we match! sort of!', 'twins!']] },
  squabble:  { cls: 'tag',       ok: (a, b, s, c, o) => c && c.wet && o && o.filter(x => x && x.items.includes('umbrella')).length === 1, lines: [['scoot over, it’s raining on my ears', 'it’s MY umbrella. …fine, get in.']] },
  backtoback:{ cls: 'huddle',    ok: (a, b, s, c) => c && c.night && [a, b].includes('sleepy'), lines: [['back to back?', 'back to back. zzz.']] },
  cloudnames:{ cls: 'stargaze',  ok: (a, b, s, c) => c && !c.night && c.kind === 'clouds', lines: [['that cloud is a cheese', 'that cloud is YOU']] },
  highfive:  { cls: 'highfive',  ok: () => true, lines: [['high five!', '*misses* …again!'], ['best day?', 'best day.']] }
};

/**
 * Pick a moment for the two of them, or null if one is napping.
 * @param r  random function
 */
export function pickMoment(s, c, outfits, r = Math.random) {
  const awake = s.beings.map((b, i) => b.napping ? -1 : i).filter(i => i > -1);
  if (awake.length < 2) return null;
  // any two who are awake (with three pets, the pair changes)
  const i0 = awake.splice(Math.floor(r() * awake.length), 1)[0], i1 = awake[Math.floor(r() * awake.length)];
  const pair = { beings: [s.beings[i0], s.beings[i1]] };
  const [a, b] = pair.beings.map(temperamentOf);
  const outs = outfits ? [outfits[i0], outfits[i1]] : outfits;
  const fits = Object.entries(MOMENTS).filter(([, m]) => m.ok(a, b, pair, c, outs));
  const specific = fits.filter(([k]) => k !== 'highfive');
  const pool = specific.length && r() < 0.85 ? specific : fits;
  const [kind, m] = pool[Math.floor(r() * pool.length)];
  const lines = m.lines[Math.floor(r() * m.lines.length)];
  let who = [i0, i1];
  if (kind === 'share') who = s.beings[i0].full > s.beings[i1].full ? [i0, i1] : [i1, i0];
  return { kind, cls: m.cls, lines: [lines[0], lines[1]], who };
}

/** Away-diary entries for the pair. */
export function diaryMoments(s, from, to) {
  if (s.beings.length < 2 || (to - from) < 2 * 36e5) return [];
  const [a, b] = s.beings.map(x => x.name.split(' ')[0]);
  const lv = level(s).index;
  const pool = [
    `${a} and ${b} played tag until both fell over laughing.`,
    `${a} and ${b} built a fort out of leaves. it has a door and everything.`,
    `${b} taught ${a} a secret handshake. it has eleven steps.`,
    `${a} and ${b} shared the last crumb, exactly down the middle.`,
    lv >= 3 ? `${a} and ${b} napped back to back and woke up at the same time.` : `${a} and ${b} argued about whose turn it was, then forgot what for.`
  ];
  const k = Math.floor(((from / 36e5) % 1000)) % pool.length;
  return [{ t: from + (to - from) * 0.55, e: '🤝', text: pool[k] }];
}

export function profile(s) {
  const l = level(s);
  return { ...l, shared: sharedDays(s), together: s.beings.reduce((a, b) => a + count(b, 'games'), 0) };
}
