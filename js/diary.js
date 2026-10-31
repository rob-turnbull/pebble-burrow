// While you were away: a short, funny diary of what the pets got up to.
// Written from the save as it was when you left, the hours that passed, the weather diary and the sky,
// plus any events other features add (garden, visitors, friendship). Seeded, so a refresh tells the same story.
import { temperamentOf } from './personality.js';
import { RATE, localDate } from './engine.js';

function rng(seed) { let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return () => { h += 0x6D2B79F5; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, a) => a[Math.floor(r() * a.length)];

const DAY = [
  ['🌱', '{n} tried to count every blade of grass. got to 41, then lost count.'],
  ['🪨', '{n} found a pebble shaped like you and put it by the door.'],
  ['🐌', '{n} had a staring contest with a snail. the snail won.'],
  ['🧀', '{n} reorganised the cheese shelf. by smell.'],
  ['🌼', '{n} picked a flower for you, then ate it by accident.'],
  ['🎶', '{n} hummed the same three notes for an hour. it was a song, apparently.'],
  ['☁️', '{n} lay on the hill and named the clouds. one was called gerald.'],
  ['🪶', '{n} found a feather and has decided it’s magic.']
];
const BY_TEMPER = {
  shy: [['👋', '{n} waved at a bird, then hid behind a flower.'], ['✍️', '{n} wrote your name in the dirt with a stick, then smoothed it over.'], ['🫖', '{n} made tea for two and kept your cup warm.']],
  bouncy: [['🎈', '{n} boinged {k} times in a row. new record, they say.'], ['🌀', '{n} chased their own tail until the hill was spinning.'], ['🏁', '{n} challenged a butterfly to a race. it was not aware of the race.']],
  sleepy: [['💤', '{n} napped in the sunny spot. then the other sunny spot.'], ['🛏️', '{n} fell asleep mid-sentence. the sentence was "i’m not sleepy".'], ['🧦', '{n} found the cosiest corner and has claimed it forever.']],
  curious: [['🍄', '{n} investigated a suspicious mushroom. it was just a mushroom.'], ['🐜', '{n} followed an ant all the way home. the ant was not pleased.'], ['🔭', '{n} tried to see past the hill. there’s another hill.']],
  bold: [['🛡️', '{n} stood guard at the door. nothing got past. (nothing came.)'], ['💨', '{n} told the wind to calm down. it did, eventually.'], ['🗺️', '{n} drew a map of the hill. it’s mostly cheese.']]
};
const BY_WEATHER = {
  rain: [['🌧️', '{n} sat at the window counting raindrops. lost count at a big one.'], ['⛵', '{n} sailed a leaf boat down a puddle. it made it all the way.']],
  drizzle: [['🌦️', '{n} stood in the drizzle with their mouth open, "drinking the sky".']],
  storm: [['⛈️', '{n} hid under the blanket during the big thunder. very brave about it.']],
  snow: [['☃️', '{n} made a snow angel, then a snow devil, then another angel to balance it out.'], ['❄️', '{n} caught {k} snowflakes on their tongue. each one tasted different.']],
  fog: [['🌫️', '{n} got lost in the fog for a minute. it was the door.']],
  clear: [['☀️', '{n} lay in the sun until they were warm all the way through.']],
  clouds: [['☁️', '{n} waited for the sun to come out. it peeked once.']]
};
const NIGHT = [
  ['🌙', '{n} slept with one ear listening for you.'],
  ['💭', '{n} talked in their sleep. mostly about cheese.'],
  ['⭐', '{n} looked at the stars and picked one out for you.'],
  ['🦉', '{n} heard a noise, checked the whole burrow, and went back to bed.'],
  ['🌠', '{n} stayed up to count shooting stars. counted two, fell asleep on the third.'],
  ['🌙', '{n} waved goodnight to the moon. it didn\u2019t wave back, but it was thinking about it.']
];

/**
 * @param s      the save as it was when you left (before catching up)
 * @param from   when you left (ms)   @param to  now (ms)
 * @param ctx    { phaseAt(t) -> 'day'|'night'|..., extra: [{t, e, text}] }
 * @returns [{t, e, text}] oldest first, at most 7
 */
export function writeDiary(s, from, to, ctx = {}) {
  const hours = (to - from) / 36e5;
  if (hours < 0.75 || !s?.beings?.length) return [];
  const r = rng(`${s.id}|${from}`);
  const names = s.beings.map(b => b.name.split(' ')[0]);
  const out = [];
  const n = Math.max(1, Math.min(5, Math.round(hours / 1.6)));
  const used = new Set();
  for (let k = 0; k < n; k++) {
    const t = from + (to - from) * ((k + 0.3 + r() * 0.4) / n);
    const i = Math.floor(r() * s.beings.length), b = s.beings[i];
    const phase = ctx.phaseAt ? ctx.phaseAt(t) : 'day';
    const kind = (s.wxDays || {})[localDate(t, s.tz)] || null;
    let pool;
    if (phase === 'night') pool = NIGHT;
    else if (kind && BY_WEATHER[kind] && r() < 0.45) pool = BY_WEATHER[kind];
    else pool = r() < 0.5 ? BY_TEMPER[temperamentOf(b)] : DAY;
    let line, tries = 0;
    do { line = pick(r, pool); tries++; } while (used.has(line[1]) && tries < 6);
    used.add(line[1]);
    out.push({ t, e: line[0], text: line[1].replace('{n}', names[i]).replace('{k}', String(20 + Math.floor(r() * 180))) });
  }
  // naps and rumbly tummies, worked out from where their stats were when you left
  const rumbles = [];
  s.beings.forEach((b, i) => {
    if (b.napping) return;
    const hrsToEmpty = b.full / RATE.full;
    if (hrsToEmpty < hours) out.push({ t: from + hrsToEmpty * 36e5, e: '😴', text: `${names[i]}'s tummy ran empty, so they curled up for a nap to wait for you.` });
    else if ((b.full - RATE.full * hours) < 30) rumbles.push({ i, t: from + Math.max(0, (b.full - 30) / RATE.full) * 36e5 });
  });
  if (rumbles.length > 1 && Math.abs(rumbles[0].t - rumbles[1].t) < 2 * 36e5) out.push({ t: Math.min(rumbles[0].t, rumbles[1].t), e: '🍽️', text: `both tummies started rumbling at once. they called it a duet.` });
  else rumbles.forEach(({ i, t }) => out.push({ t, e: '🍽️', text: `${names[i]}'s tummy started rumbling. ${names[(i + 1) % names.length]} heard it from across the hill.` }));
  if (hours >= 10) out.push({ t: from + 10 * 36e5, e: '🛏️', text: `everyone settled in for a long nap, keeping your spot warm.` });
  (ctx.extra || []).forEach(x => { if (x.t >= from && x.t <= to) out.push(x); });
  out.sort((a, b) => a.t - b.t);
  return out.length > 7 ? [out[0], ...out.slice(-6)] : out;
}

export function awayLabel(ms) {
  const h = ms / 36e5;
  if (h < 1) return `${Math.round(h * 60)} minutes`;
  if (h < 36) return `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'}`;
  return `${Math.round(h / 24)} days`;
}
