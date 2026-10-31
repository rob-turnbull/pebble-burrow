// Little visitors who drop by when the time and weather are right. Greet them to add them to the
// visitor book; some leave a gift. Miss them and they just wander on (no pressure, ever).
export const VISITORS = {
  snail:     { e: '🐌', label: 'snail mail carrier', w: 3, when: c => !c.night && !c.hot,                        gift: 'clover',     hint: 'a slow traveller, most days',            hello: ['a snail delivered something! it took all morning.', 'the snail says the mail is very important'] },
  duckling:  { e: '🐥', label: 'lost duckling',      w: 3, when: c => c.wet && !c.night,                           gift: null,         hint: 'follows the puddles on rainy days',      hello: ['a duckling! are you lost? you can stay.', 'it’s following me. i’m its mum now.'] },
  frogchoir: { e: '🐸', label: 'frog choir',         w: 2, when: c => c.wet && (c.night || c.phase === 'dusk'),     gift: null,         hint: 'sings on rainy evenings',                hello: ['the frogs are singing! ribbit harmony.', 'a whole frog choir. encore!'] },
  fireflies: { e: '✨', label: 'firefly swarm',      w: 3, when: c => c.night && (c.warm || c.season === 'summer'), gift: null,         hint: 'warm nights only',                       hello: ['the fireflies came to say goodnight', 'tiny lanterns everywhere!'] },
  snowowl:   { e: '🦉', label: 'snowy owl',          w: 2, when: c => c.snow || (c.night && c.freezing),           gift: null,         hint: 'arrives with the snow',                  hello: ['a snowy owl! so fluffy. so serious.', 'the owl nodded at me. we’re friends now.'] },
  butterfly: { e: '🦋', label: 'butterfly',          w: 3, when: c => c.day && !c.wet && (c.warm || c.bright) && c.season !== 'winter', gift: null, hint: 'loves warm, bright days',   hello: ['a butterfly landed on my nose!', 'it’s so pretty. i’m not breathing in case it leaves'] },
  bee:       { e: '🐝', label: 'busy bee',           w: 2, when: (c, s) => c.day && !c.wet && c.warm && hasPlants(s),  gift: 'strawberry', hint: 'visits gardens on warm days',            hello: ['a bee is checking our garden. very professional.', 'bzz! (i said hello back)'] },
  ladybug:   { e: '🐞', label: 'ladybird',           w: 2, when: (c, s) => c.day && !c.freezing && hasPlants(s),       gift: null,         hint: 'likes a growing garden',                 hello: ['a ladybird! count the spots! …seven!', 'lucky! a ladybird landed on the carrots'] },
  squirrel:  { e: '🐿️', label: 'squirrel',          w: 3, when: c => c.day && c.season === 'autumn' && !c.storm, gift: 'carrot',     hint: 'busy in autumn',                         hello: ['a squirrel is burying something. i saw where.', 'it traded me a carrot for a secret'] },
  hedgehog:  { e: '🦔', label: 'wandering hedgehog', w: 2, when: c => (c.phase === 'dusk' || c.night) && !c.freezing && c.season !== 'winter', gift: null, hint: 'comes out at dusk', hello: ['a hedgehog shuffled past and sniffed my toes', 'snuffle snuffle. hello, spiky friend.'] },
  robin:     { e: '🐦', label: 'robin',              w: 2, when: c => !c.night && (c.cold || c.season === 'winter' || c.season === 'spring'), gift: null, hint: 'cold mornings and spring', hello: ['a robin! red tummy, big opinions.', 'the robin sang a whole song for us'] },
  cat:       { e: '🐈', label: 'neighbourhood cat',  w: 1, when: c => !c.storm,                                     gift: null,         hint: 'rare. does what it likes.',              hello: ['a cat. it looked at us. it left. we feel honoured.', 'the cat sat on our hill like it owned it'] }
};
const hasPlants = s => (s?.garden || []).some(p => p.seed);

/** Who could drop by right now, weighted. */
export function eligible(c, s) { return Object.entries(VISITORS).filter(([, v]) => v.when(c, s)).map(([id, v]) => ({ id, w: v.w })); }

/** Maybe pick a visitor. `luck` > 1 makes visits likelier (clover in the pantry). */
export function maybeVisit(c, s, r = Math.random, luck = 1) {
  if (!c) return null;
  const list = eligible(c, s); if (!list.length || r() > 0.25 * luck) return null;
  let x = r() * list.reduce((a, v) => a + v.w, 0);
  for (const v of list) { x -= v.w; if (x < 0) return v.id; }
  return list[0].id;
}

/** Record a greeting. Returns {first:boolean, gift}. */
export function greet(s, id, dev = 'here', now = Date.now()) {
  s.visitors = s.visitors || {};
  const v = s.visitors[id] || (s.visitors[id] = { first: now, n: {} });
  const first = !Object.values(v.n).some(n => n > 0);
  v.n[dev] = (v.n[dev] || 0) + 1;
  s.updatedAt = Math.max(s.updatedAt || 0, now);
  return { first, gift: VISITORS[id].gift };
}
export const timesMet = (s, id) => Object.values(s.visitors?.[id]?.n || {}).reduce((a, n) => a + n, 0);

export function mergeVisitors(out, b) {
  out.visitors = out.visitors || {};
  for (const [id, v] of Object.entries(b.visitors || {})) {
    const o = out.visitors[id] || (out.visitors[id] = { first: v.first, n: {} });
    o.first = Math.min(o.first || v.first, v.first);
    for (const [dev, n] of Object.entries(v.n || {})) o.n[dev] = Math.max(o.n[dev] || 0, n);
  }
}

/** Away diary: the pets sometimes notice a passer-by. */
export function diaryVisitors(s, from, to) {
  if (to - from < 3 * 36e5) return [];
  const kinds = new Set(Object.values(s.wxDays || {}));
  const pool = ['snail', 'cat', 'robin'].concat(kinds.has('rain') ? ['duckling'] : [], kinds.has('snow') ? ['snowowl'] : []);
  const id = pool[Math.floor(from / 36e5) % pool.length], v = VISITORS[id], n = s.beings[Math.floor(from / 6e4) % s.beings.length].name.split(' ')[0];
  return [{ t: from + (to - from) * 0.7, e: v.e, text: `a ${v.label} wandered by. ${n} waved. it didn’t stay, but it saw you weren’t home and said it’d come back.` }];
}
