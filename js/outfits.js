// What each pet wears and does in the weather. Random, but always appropriate:
// every item has a rule for when it makes sense, temperament and species tilt the odds,
// and the choice is seeded per pet and per half hour so it holds still between refreshes.
import { geom, genesOf } from './art.js';
import { temperamentOf } from './personality.js';

function rng(seed) { let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const PERIOD = 30 * 60e3;
const WATERY = new Set(['frog', 'axolotl', 'duckling', 'otter', 'penguin']);   // these head for the puddle instead of a coat
const HEAD_WEARS = ['flowers', 'pumpkin', 'party', 'bow'];
const COATS = ['#f6cf4f', '#e57fa8', '#7fb8d6', '#86c46f', '#eb9459', '#b48ce0'];

/* ---------------- the wardrobe ----------------
   when(c)       is it appropriate right now
   w(t, sp, c)   how much this pet would like it (temperament, species)
   draw(A)       SVG, given anchors A                                           */
export const ITEMS = {
  rainhat:   { slot: 'head', label: 'rain hat', when: c => c.wet, w: t => t === 'shy' ? 2 : 1.2,
    draw: A => `<g><path d="M${A.hx - 22} ${A.t + 4} q22 -34 44 0z" fill="#f6cf4f"/><ellipse cx="${A.hx}" cy="${A.t + 5}" rx="32" ry="7" fill="#f2c230"/><path d="M${A.hx + 26} ${A.t + 6} q10 6 16 4" stroke="#f2c230" stroke-width="5" fill="none" stroke-linecap="round"/></g>` },
  leafhat:   { slot: 'head', label: 'leaf hat', when: c => c.kind === 'drizzle' || (c.wet && c.season !== 'winter'), w: t => t === 'curious' || t === 'bouncy' ? 1.6 : 0.8,
    draw: A => `<g class="flutter"><path d="M${A.hx - 30} ${A.t + 6} q30 -36 60 0 q-30 -9 -60 0z" fill="#6aa84f"/><path d="M${A.hx} ${A.t - 12} v16 M${A.hx - 14} ${A.t - 2} l14 6 l14 -6" stroke="#4e7d3a" stroke-width="2" fill="none"/></g>` },
  beanie:    { slot: 'head', label: 'knitted beanie', when: c => c.cold && !c.night, w: t => t === 'bold' ? 1 : 1.5,
    draw: A => `<g><path d="M${A.hx - 22} ${A.t + 8} q22 -38 44 0z" fill="${A.c2}"/><rect x="${A.hx - 24}" y="${A.t + 2}" width="48" height="9" rx="4.5" fill="${A.c1}"/><circle cx="${A.hx}" cy="${A.t - 20}" r="6.5" fill="#fff"/></g>` },
  earmuffs:  { slot: 'head', label: 'earmuffs', when: c => c.cold, w: t => t === 'curious' ? 1.6 : 0.9,
    draw: A => `<g><path d="M${A.L - 12} ${A.ey - 2} q${A.hx - A.L + 12} -${A.ey - A.t + 18} ${2 * (A.hx - A.L + 12)} 0" stroke="#6b6478" stroke-width="3" fill="none"/><circle cx="${A.L - 12}" cy="${A.ey}" r="8" fill="${A.c1}"/><circle cx="${A.R + 12}" cy="${A.ey}" r="8" fill="${A.c1}"/></g>` },
  sunhat:    { slot: 'head', label: 'sun hat', when: c => !c.night && (c.bright || c.hot || (c.warm && c.kind === 'clear')), w: t => t === 'sleepy' || t === 'shy' ? 1.6 : 1,
    draw: A => `<g><ellipse cx="${A.hx}" cy="${A.t + 4}" rx="40" ry="8" fill="#e8c27a"/><path d="M${A.hx - 18} ${A.t + 4} q18 -26 36 0z" fill="#efcf8a"/><path d="M${A.hx - 18} ${A.t + 1} h36" stroke="#e57fa8" stroke-width="4"/><circle cx="${A.hx + 15}" cy="${A.t - 2}" r="4" fill="#f28fae"/></g>` },
  nightcap:  { slot: 'head', label: 'nightcap', when: c => c.night, w: t => t === 'sleepy' ? 3 : t === 'shy' ? 1.2 : 0.7,
    draw: A => `<g class="flutter"><path d="M${A.hx - 22} ${A.t + 8} q8 -34 38 -26 q16 6 26 26 q-14 -8 -22 -4 q4 6 0 8 z" fill="${A.c1}"/><path d="M${A.hx - 16} ${A.t - 8} l10 -4 M${A.hx - 4} ${A.t - 14} l10 -2" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/><circle cx="${A.hx + 42}" cy="${A.t + 8}" r="5.5" fill="#fff"/><rect x="${A.hx - 24}" y="${A.t + 3}" width="46" height="7" rx="3.5" fill="#fff"/></g>` },

  raincoat:  { slot: 'body', label: 'raincoat', when: c => c.wet, w: (t, sp) => WATERY.has(sp) ? 0.2 : t === 'shy' ? 2.2 : 1.4,
    draw: A => `${A.lower('#f6cf4f')}<path d="M${A.hx - 10} ${A.y0 + 2} l10 10 l10 -10" stroke="#e0ad1f" stroke-width="3" fill="none"/><circle cx="${A.hx}" cy="${A.y0 + 18}" r="2.2" fill="#e0ad1f"/><circle cx="${A.hx}" cy="${A.y0 + 26}" r="2.2" fill="#e0ad1f"/>` },
  puffer:    { slot: 'body', label: 'puffy coat', when: c => c.cold && !c.warm, w: (t, sp) => sp === 'sheep' || sp === 'penguin' || sp === 'bear' ? 0.3 : t === 'bold' ? 0.6 : 1.4,
    draw: A => `${A.lower(A.c1)}${[8, 16, 24].map(d => `<path d="M${A.bx - A.rx * 0.82} ${A.y0 + d} q${A.rx * 0.82} 6 ${A.rx * 1.64} 0" stroke="${A.c2}" stroke-width="2" fill="none" opacity=".7"/>`).join('')}` },
  cape:      { slot: 'back', label: 'tiny cape', when: c => c.storm || c.gale || (c.windy && !c.wet), w: t => t === 'bold' ? 4 : t === 'bouncy' ? 1.2 : 0.3,
    draw: A => `<path class="cape" d="M${A.bx - A.rx * 0.6} ${A.by - A.ry * 0.55} L${A.bx - A.rx - 14} ${A.feet} L${A.bx + A.rx + 14} ${A.feet} L${A.bx + A.rx * 0.6} ${A.by - A.ry * 0.55} z" fill="#d9534f"/>` },
  blanket:   { slot: 'front', label: 'blanket fort', when: c => c.storm || (c.night && c.freezing), w: t => t === 'shy' ? 4 : t === 'sleepy' ? 2 : t === 'bold' ? 0.1 : 0.8,
    draw: A => `<path fill-rule="evenodd" fill="#9fcbe2" stroke="#7fb8d6" stroke-width="2" d="M${A.bx - A.rx - 6} ${A.feet + 2} Q${A.bx - A.rx - 10} ${A.t - 14} ${A.hx} ${A.t - 16} Q${A.bx + A.rx + 10} ${A.t - 14} ${A.bx + A.rx + 6} ${A.feet + 2} Z M${A.hx - A.fx} ${A.fy} a${A.fx} ${A.fyr} 0 1 0 ${2 * A.fx} 0 a${A.fx} ${A.fyr} 0 1 0 -${2 * A.fx} 0Z"/>` },

  sunglasses:{ slot: 'face', label: 'sunglasses', when: c => c.day && (c.bright || c.hot), w: t => t === 'bold' || t === 'bouncy' ? 2.5 : 1,
    draw: A => `<g><rect x="${A.L - A.er - 4}" y="${A.ey - A.er - 2}" width="${2 * A.er + 8}" height="${2 * A.er + 4}" rx="3.5" fill="#2b2230"/><rect x="${A.R - A.er - 4}" y="${A.ey - A.er - 2}" width="${2 * A.er + 8}" height="${2 * A.er + 4}" rx="3.5" fill="#2b2230"/><path d="M${A.L + A.er + 4} ${A.ey - 1} h${A.R - A.L - 2 * A.er - 8}" stroke="#2b2230" stroke-width="2.5"/><path d="M${A.L - A.er - 1} ${A.ey - A.er + 1} l4 0" stroke="#fff" stroke-width="1.5" opacity=".7"/></g>` },

  umbrella:  { slot: 'hand', label: 'umbrella', when: c => c.wet, w: (t, sp) => WATERY.has(sp) ? 0.5 : t === 'shy' ? 2.5 : 1.3,
    draw: (A, c) => c.windy
      ? `<g class="flutter"><path d="M${A.hx0} ${A.hy} V${A.t - 6}" stroke="#6b6478" stroke-width="2.5"/><path d="M${A.hx0 - 26} ${A.t - 34} Q${A.hx0} ${A.t + 4} ${A.hx0 + 26} ${A.t - 34} Q${A.hx0} ${A.t - 14} ${A.hx0 - 26} ${A.t - 34}z" fill="${A.c1}"/></g>`
      : `<g><path d="M${A.hx0} ${A.hy} V${A.t - 10} M${A.hx0} ${A.hy} q0 6 -5 6" stroke="#6b6478" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M${A.hx0 - 34} ${A.t - 8} A34 30 0 0 1 ${A.hx0 + 34} ${A.t - 8} q-8.5 -6 -17 0 q-8.5 -6 -17 0 q-8.5 -6 -17 0 q-8.5 -6 -17 0z" fill="${A.c1}"/></g>` },
  lantern:   { slot: 'hand', label: 'lantern', when: c => c.night || c.fog, w: (t, sp) => sp === 'owl' || sp === 'bat' ? 0.3 : t === 'shy' || t === 'sleepy' ? 2 : 1.3,
    draw: A => `<g><circle class="glow" cx="${A.hx0}" cy="${A.hy + 4}" r="16" fill="#f6cf4f" opacity=".35"/><path d="M${A.hx0 - 5} ${A.hy - 8} q5 -8 10 0" stroke="#6b6478" stroke-width="2" fill="none"/><rect x="${A.hx0 - 7}" y="${A.hy - 6}" width="14" height="18" rx="3" fill="#ffe9a8" stroke="#8b6a4c" stroke-width="2"/><rect x="${A.hx0 - 8}" y="${A.hy + 11}" width="16" height="3" fill="#8b6a4c"/></g>` },
  flashlight:{ slot: 'hand', label: 'flashlight', when: c => c.night, w: (t, sp) => sp === 'owl' || sp === 'bat' ? 0.2 : t === 'curious' ? 3 : t === 'bold' ? 2 : 0.8,
    draw: A => `<g><path class="beam" d="M${A.hx0 + 8} ${A.hy - 2} L${A.hx0 + 70} ${A.hy - 26} L${A.hx0 + 70} ${A.hy + 18} Z" fill="#fff6c4" opacity=".35"/><rect x="${A.hx0 - 8}" y="${A.hy - 5}" width="17" height="8" rx="2" fill="#6b6478" transform="rotate(-12 ${A.hx0} ${A.hy})"/></g>` },
  fireflies: { slot: 'hand', label: 'jar of fireflies', when: c => c.night && (c.warm || c.season === 'summer'), w: t => t === 'curious' || t === 'shy' ? 2.5 : 1.2,
    draw: A => `<g><rect x="${A.hx0 - 8}" y="${A.hy - 8}" width="16" height="20" rx="4" fill="#dff3ff" fill-opacity=".35" stroke="#9ab" stroke-width="1.5"/><rect x="${A.hx0 - 9}" y="${A.hy - 11}" width="18" height="4" rx="1.5" fill="#8b6a4c"/>${[[-3, -2], [3, 3], [-2, 7]].map(([x, y], i) => `<circle class="fly" style="animation-delay:-${i * 0.6}s" cx="${A.hx0 + x}" cy="${A.hy + y}" r="1.8" fill="#f6ff8a"/>`).join('')}</g>` },
  icelolly:  { slot: 'hand', label: 'ice lolly', when: c => c.hot || (c.warm && c.bright), w: t => t === 'bouncy' ? 2.5 : 1.4,
    draw: A => `<g><rect x="${A.hx0 - 1.5}" y="${A.hy}" width="3" height="12" rx="1" fill="#d9b382"/><rect x="${A.hx0 - 7}" y="${A.hy - 20}" width="14" height="22" rx="6" fill="${A.c1}"/><rect x="${A.hx0 - 7}" y="${A.hy - 20}" width="14" height="8" rx="4" fill="#fff" opacity=".5"/></g>` },
  fan:       { slot: 'hand', label: 'paper fan', when: c => c.hot, w: t => t === 'sleepy' || t === 'shy' ? 2 : 1,
    draw: A => `<g class="fanning"><path d="M${A.hx0} ${A.hy} L${A.hx0 - 14} ${A.hy - 20} A24 24 0 0 1 ${A.hx0 + 14} ${A.hy - 20} Z" fill="${A.c1}"/><path d="M${A.hx0} ${A.hy} L${A.hx0 - 5} ${A.hy - 23} M${A.hx0} ${A.hy} L${A.hx0 + 5} ${A.hy - 23}" stroke="#fff" stroke-width="1.5" opacity=".7"/></g>` },
  kite:      { slot: 'front', label: 'kite', when: c => c.windy && !c.wet && !c.night, w: t => t === 'bouncy' ? 3.5 : t === 'curious' ? 2 : 1,
    draw: A => `<g class="kite"><path d="M${A.hx0} ${A.hy} Q${A.hx0 + 30} ${A.hy - 60} ${A.hx0 + 22} ${A.t - 70}" stroke="#6b6478" stroke-width="1" fill="none"/><path d="M${A.hx0 + 22} ${A.t - 92} l12 14 l-12 16 l-12 -16z" fill="${A.c1}"/><path d="M${A.hx0 + 22} ${A.t - 62} q-6 10 2 16 q-8 8 0 14" stroke="${A.c2}" stroke-width="2" fill="none"/></g>` },
  cocoa:     { slot: 'hand', label: 'mug of cocoa', when: c => c.cold, w: t => t === 'sleepy' || t === 'shy' ? 2.5 : 1.2,
    draw: A => `<g><path class="steam" d="M${A.hx0 - 3} ${A.hy - 14} q-3 -5 0 -9 M${A.hx0 + 3} ${A.hy - 14} q3 -5 0 -9" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/><rect x="${A.hx0 - 8}" y="${A.hy - 10}" width="16" height="16" rx="3" fill="${A.c1}"/><path d="M${A.hx0 + 8} ${A.hy - 6} q7 0 7 5 q0 5 -7 5" stroke="${A.c1}" stroke-width="3" fill="none"/><ellipse cx="${A.hx0}" cy="${A.hy - 9}" rx="6" ry="2" fill="#7a4a2a"/></g>` },
  snowball:  { slot: 'hand', label: 'snowball', when: c => c.snow, w: t => t === 'bouncy' || t === 'bold' ? 3 : 1,
    draw: A => `<circle cx="${A.hx0}" cy="${A.hy - 2}" r="8" fill="#fff" stroke="#dde6f0" stroke-width="1.5"/>` },

  puddle:    { slot: 'ground', label: 'puddle', when: c => c.wet && !c.freezing, w: (t, sp) => WATERY.has(sp) ? 5 : t === 'bouncy' ? 3 : 0.6, act: 'splash',
    draw: A => `<ellipse cx="65" cy="${A.feet + 2}" rx="46" ry="7" fill="#7fb8d6" opacity=".7"/><g class="drops"><circle cx="30" cy="${A.feet - 6}" r="2.5" fill="#bfe0f0"/><circle cx="100" cy="${A.feet - 9}" r="2" fill="#bfe0f0"/><circle cx="22" cy="${A.feet - 14}" r="1.6" fill="#bfe0f0"/></g>` },
  snowman:   { slot: 'ground', label: 'tiny snowman', when: c => c.snow, w: t => t === 'curious' || t === 'bouncy' ? 2.5 : 1.2,
    draw: A => `<g transform="translate(-14 0)"><circle cx="8" cy="${A.feet - 8}" r="10" fill="#fff" stroke="#dde6f0"/><circle cx="8" cy="${A.feet - 24}" r="7" fill="#fff" stroke="#dde6f0"/><circle cx="5.5" cy="${A.feet - 25}" r="1" fill="#2b2230"/><circle cx="10.5" cy="${A.feet - 25}" r="1" fill="#2b2230"/><path d="M8 ${A.feet - 23} l6 1.5 l-6 1z" fill="#f08a24"/></g>` },
  towel:     { slot: 'ground', label: 'beach towel', when: c => c.day && (c.hot || (c.bright && c.warm)), w: t => t === 'sleepy' ? 3 : 1, act: 'sunbathe',
    draw: A => `<g><rect x="12" y="${A.feet - 4}" width="106" height="10" rx="3" fill="#7fb8d6"/><path d="M12 ${A.feet - 1} h106 M12 ${A.feet + 3} h106" stroke="#fff" stroke-width="2" opacity=".6"/></g>` },
  leaves:    { slot: 'ground', label: 'leaf pile', when: c => c.season === 'autumn' && !c.wet && !c.night, w: t => t === 'bouncy' ? 2.5 : 0.8, act: 'splash',
    draw: A => `<g>${[['#e07b39', 24], ['#d9534f', 42], ['#e8a33d', 60], ['#c76b2a', 80], ['#e07b39', 100]].map(([col, x], i) => `<ellipse cx="${x}" cy="${A.feet + (i % 2) * 2}" rx="12" ry="5" fill="${col}" transform="rotate(${i * 25 - 40} ${x} ${A.feet})"/>`).join('')}</g>` }
};

/* ---------------- behaviours ---------------- */
const BEHAVIOURS = {
  splash:   c => c.wet && !c.freezing,
  tongue:   c => c.snow,
  shiver:   c => c.freezing || (c.cold && c.windy),
  sway:     c => c.windy,
  sunbathe: c => c.day && (c.hot || c.bright),
  gaze:     c => c.rainbow,
  peer:     c => c.fog,
  cuddle:   c => c.storm
};

/* ---------------- what they say ---------------- */
const LINES = {
  rainhat: ['rain hat on. the puddles don’t stand a chance.', 'i look like a little fisherman'],
  leafhat: ['i made a hat out of a leaf. it’s mostly working.', 'leaf hat! very fashionable, very damp'],
  beanie: ['my ears asked for a hat. i said yes.', 'knitted it myself. (i did not)'],
  earmuffs: ['my ears are in a tiny duvet', 'pardon? i can’t hear you, i’m cosy'],
  sunhat: ['sun hat on. very elegant. very shady.', 'i’m on holiday. the hill is my holiday.'],
  nightcap: ['nightcap on. officially off duty.', 'the bobble keeps the dreams in'],
  raincoat: ['raincoat buttoned. i am a sensible being.', 'i’m yellow now. it’s a rain thing.'],
  puffer: ['i’m a marshmallow. a warm marshmallow.', 'this coat is 80% hug'],
  cape: ['the wind and i have an understanding', 'look at my cape go!'],
  blanket: ['blanket fort is open for business. members only.', 'storm? what storm? i’m a burrito.'],
  sunglasses: ['too bright. too cool.', 'don’t look at me, i’m being mysterious'],
  umbrella: ['brought my umbrella. thinking ahead.', 'pitter patter on my umbrella roof'],
  umbrellaWindy: ['my umbrella turned inside out. it’s a bowl now.', 'the wind took my umbrella for a dance'],
  lantern: ['brought a little light so we don’t trip', 'the lantern makes everything golden'],
  flashlight: ['i’m exploring. for science.', 'flashlight on. what’s THAT? oh, a leaf.'],
  fireflies: ['the fireflies agreed to a sleepover', 'my jar is full of tiny stars'],
  icelolly: ['ice lolly emergency. very serious.', 'it’s melting faster than i can lick'],
  fan: ['fan fan fan', 'i’m making my own breeze'],
  kite: ['WHEEE the kite is winning', 'i’m flying! (the kite is flying)'],
  cocoa: ['cocoa first, then everything else', 'warm mug, warm paws'],
  snowball: ['i’m not going to throw it. probably.', 'i made a snowball. it’s my friend now.'],
  puddle: ['PUDDLE.', 'this is the best puddle on the hill'],
  snowman: ['i built a friend. his name is gerald.', 'tiny snowman! he needs a scarf.'],
  towel: ['sunbathing. please don’t flip me.', 'i’m a sunny side up being'],
  leaves: ['crunch crunch crunch', 'i made a leaf pile and then i became the leaf pile'],
  tongue: ['catching snowflakes on my tongue!', 'this one tastes like cloud'],
  shiver: ['brrrrrrr', 'my whiskers are icicles'],
  sway: ['the wind keeps pushing me. rude.', 'hold on to your ears!'],
  gaze: ['a RAINBOW. everybody look!', 'i’m going to find the end of it'],
  peer: ['i can’t see the hill. is the hill still there?', 'fog! perfect for hide and seek'],
  cuddle: ['scoot over, i’m coming in', 'loud sky. warm burrow.']
};

/* ---------------- choosing ---------------- */
function weighted(r, list) { const total = list.reduce((a, x) => a + x.w, 0); let x = r() * total; for (const it of list) { x -= it.w; if (x < 0) return it; } return list[list.length - 1]; }

/**
 * Pick what a pet wears and does right now. Same pet + same weather + same half hour = same choice.
 * @returns {{items:string[], act:string|null, line:string|null, key:string}}
 */
export function pickOutfit(b, c, now = Date.now()) {
  if (!c || !c.known) return { items: c?.night ? nightOnly(b, c, now) : [], act: null, line: null, key: 'none' };
  const t = temperamentOf(b), period = Math.floor(now / PERIOD);
  const r = rng(`${b.id}|${c.key}|${period}`);
  const usedSlots = new Set();
  if (HEAD_WEARS.includes(b.wear)) usedSlots.add('head');
  const items = [];
  const slots = ['ground', 'body', 'head', 'hand', 'face', 'back', 'front'];
  const chance = { ground: 0.55, body: 0.7, head: 0.7, hand: 0.6, face: 0.6, back: 0.6, front: 0.5 };
  for (const slot of slots) {
    if (usedSlots.has(slot)) continue;
    const cands = Object.entries(ITEMS).filter(([, it]) => it.slot === slot && it.when(c)).map(([id, it]) => ({ id, w: it.w(t, b.sp, c) }));
    if (!cands.length || r() > chance[slot]) continue;
    const pickd = weighted(r, [...cands, { id: null, w: 0.9 }]);   // 'nothing' is always an option, so a pet who dislikes the only fit can skip it
    if (!pickd.id) continue;
    if (pickd.id === 'blanket' && (items.includes('umbrella') || items.includes('kite'))) continue;
    if ((pickd.id === 'kite') && items.some(i => ITEMS[i].slot === 'hand')) continue;
    if (slot === 'hand' && items.includes('kite')) continue;
    items.push(pickd.id); usedSlots.add(slot);
  }
  if (items.includes('blanket')) for (const s of ['head', 'face', 'hand']) { const i = items.findIndex(x => ITEMS[x].slot === s); if (i > -1) items.splice(i, 1); }
  const acts = Object.keys(BEHAVIOURS).filter(k => BEHAVIOURS[k](c));
  let act = items.map(i => ITEMS[i].act).find(Boolean) || null;
  if (!act && acts.length && r() < 0.7) act = acts[Math.floor(r() * acts.length)];
  if (act === 'shiver' && (items.includes('puffer') || items.includes('blanket'))) act = null;
  const said = act && r() < 0.5 ? act : items.length ? (items.includes('umbrella') && c.windy ? 'umbrellaWindy' : items[Math.floor(r() * items.length)]) : act;
  const pool = said ? LINES[said] : null;
  return { items, act, line: pool ? pool[Math.floor(r() * pool.length)] : null, key: `${c.key}|${period}` };
}
// Even without a town, a dark night still gets lanterns and nightcaps.
function nightOnly(b, c, now) {
  const r = rng(`${b.id}|night|${Math.floor(now / PERIOD)}`), t = temperamentOf(b);
  const out = [];
  if (r() < 0.6) out.push(t === 'sleepy' || r() < 0.4 ? 'nightcap' : null);
  if (r() < 0.6) out.push(t === 'curious' ? 'flashlight' : 'lantern');
  return out.filter(Boolean);
}

/* ---------------- drawing ---------------- */
export function anchors(b) {
  const G = geom(b.sp), g = genesOf(b), r = rng('colours:' + b.id);
  const spread = g?.spread || 0, er = G.er * (g?.eyeScale || 1);
  const [bx, by, rx, ry] = G.body;
  const y0 = Math.max(by - ry * 0.1, G.my > 0 ? G.my + 7 : G.cy + 8, G.cy + 6);
  const c1 = COATS[Math.floor(r() * COATS.length)], c2 = COATS[Math.floor(r() * COATS.length)];
  const A = {
    t: G.top, ey: G.ey, er, L: 65 - G.edx - spread, R: 65 + G.edx + spread, hx: 65, bx, by, rx, ry, feet: G.feet, y0,
    hx0: Math.min(122, bx + rx + 2), hy: by + 2, c1, c2: c2 === c1 ? '#ffffff' : c2,
    fx: G.edx + spread + 13, fy: (G.ey + Math.max(G.my, G.cy)) / 2 + 1, fyr: Math.max(14, (Math.max(G.my, G.cy) - G.ey) / 2 + 12)
  };
  A.lower = col => `<path d="M${bx - rx + 1} ${y0} A${rx - 1} ${ry - 1} 0 0 0 ${bx + rx - 1} ${y0} Z" fill="${col}"/><path d="M${bx - rx + 2} ${y0} H${bx + rx - 2}" stroke="#0002" stroke-width="2"/>`;
  return A;
}

export function layersFor(b, outfit, c) {
  if (!outfit || !outfit.items.length) return null;
  const A = anchors(b), L = { back: '', body: '', face: '', head: '', hand: '', ground: '', front: '' };
  for (const id of outfit.items) {
    const it = ITEMS[id], svg = it.draw(A, c || {});
    if (it.slot === 'back') L.back += svg; else if (it.slot === 'front') L.front += svg; else L[it.slot] += svg;
  }
  return L;
}

/** A pet's forecast for the report card, in their own voice. */
export function forecastLine(b, c, w) {
  const t = temperamentOf(b);
  const soon = (w?.hours || []).slice(0, 6);
  const wetSoon = soon.find(h => ['rain', 'drizzle', 'storm'].includes(h.kind) || (h.pop ?? 0) >= 60);
  const when = h => new Date(h.t).toLocaleTimeString([], { hour: 'numeric' });
  if (!c.wet && wetSoon) return { shy: `rain around ${when(wetSoon)}. i’ll have my coat ready.`, bouncy: `rain at ${when(wetSoon)}! PUDDLES INCOMING`, sleepy: `rain at ${when(wetSoon)}. perfect napping sound.`, curious: `the sky says rain by ${when(wetSoon)}. i want to see the first drop.`, bold: `rain at ${when(wetSoon)}. i’ll guard the door.` }[t];
  if (c.wet && soon.length && soon.every(h => !['rain', 'drizzle', 'storm'].includes(h.kind))) return 'it should dry up soon. maybe a rainbow?';
  const drop = soon.length ? soon[soon.length - 1].temp - (w?.temp ?? 0) : 0;
  if (drop <= -8) return { shy: 'getting colder later. extra blanket tonight.', bouncy: 'it’s getting chilly! more boinging to stay warm', sleepy: 'colder later. good. more snuggling.', curious: `it’ll drop ${Math.abs(drop)} degrees. where does the warm go?`, bold: 'a cold front approaches. i’m ready.' }[t];
  if (c.snow) return 'snow day! nobody tell the clouds to stop.';
  if (c.hot) return 'hot one. i’ll be in the shade, being a puddle.';
  if (c.windy) return 'windy all afternoon. hold onto your hats.';
  if (c.night) return t === 'sleepy' ? 'forecast: dreams, mostly cheese.' : 'clear skies for stargazing, i think.';
  return { shy: 'a gentle day. good for sitting together.', bouncy: 'perfect boinging weather!', sleepy: 'nap weather. it’s always nap weather.', curious: 'i’m going to study one cloud all day.', bold: 'calm on the hill. all clear.' }[t];
}
