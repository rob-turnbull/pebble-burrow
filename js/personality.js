// Who each being is. Temperament is fixed (picked from the being's id, so every device agrees);
// favourite cheese and weather are learned from what actually happens in the burrow.
import { localDate } from './engine.js';

export const TEMPERAMENTS = {
  shy: {
    label: 'shy', blurb: 'quiet, notices everything',
    greet: ['oh! hi. i saved you a spot.', 'you came back. good.'],
    feed: ['thank you… *tiny nibble*', 'i like it when you pick for me.'],
    hug: ['…okay. one more?', 'i was hoping you would.'],
    boing: ['that was very high. for me.', 'eep! again, maybe?'],
    wake: ['mm. you’re here. that’s nice.'],
    idle: ['i counted the clouds. eleven.', 'i like it when it’s just us.', '*hides behind a flower, waves*'],
    loves: 'rain', fav: 'swiss'
  },
  bouncy: {
    label: 'bouncy', blurb: 'all springs, no brakes',
    greet: ['YOU’RE BACK!!', 'hi hi hi hi hi'],
    feed: ['NOM. more? MORE?', 'best. cheese. ever. (again)'],
    hug: ['squeeeeze!', 'hug sandwich! where’s the other half?'],
    boing: ['HIGHER!', 'i think i saw the moon from up there'],
    wake: ['i wasn’t asleep! (i was)'],
    idle: ['race you to the door!', 'boing boing boing… sorry, couldn’t help it', 'i have SO much to tell you'],
    loves: 'clear', fav: 'cheddar'
  },
  sleepy: {
    label: 'sleepy', blurb: 'professional napper',
    greet: ['*yawn* oh, hello…', 'you woke me up. i don’t mind.'],
    feed: ['mm… cheese, then nap.', 'that was a good snack. nap now?'],
    hug: ['warm. can we stay like this?', 'zzz… *hugs back*'],
    boing: ['…that was a lot of boing.', 'okay but slowly'],
    wake: ['five more minutes… okay, i’m up.'],
    idle: ['the hill is the perfect napping angle', 'i dreamt we had a whole wheel of brie', '*sleepy blink*'],
    loves: 'fog', fav: 'brie'
  },
  curious: {
    label: 'curious', blurb: 'asks a lot of questions',
    greet: ['where did you go? what did you see?', 'oh good, i have questions.'],
    feed: ['why does swiss have holes? (asking for me)', 'what’s cheese made of? besides happiness'],
    hug: ['is this what friends do? i like it.', 'do you hug other beings? just checking.'],
    boing: ['how high was that? estimate please.', 'i found a new angle on the hill!'],
    wake: ['did anything happen while i napped?'],
    idle: ['what’s past the hill?', 'i think the moon follows us', 'why do flowers face the sun?'],
    loves: 'snow', fav: 'swiss'
  },
  bold: {
    label: 'bold', blurb: 'guards the burrow',
    greet: ['the burrow is secure. welcome back.', 'all quiet on the hill, chief.'],
    feed: ['fuel for adventure.', 'a hero’s snack.'],
    hug: ['…fine. but only because i’m brave.', 'a strong hug for a strong friend.'],
    boing: ['a mighty leap!', 'i could clear that hill twice'],
    wake: ['on duty! i was resting my eyes.'],
    idle: ['i’ll keep watch.', 'no storm can scare this burrow', 'i patrolled the flowers. all safe.'],
    loves: 'storm', fav: 'cheddar'
  }
};
export const TEMPERAMENT_IDS = Object.keys(TEMPERAMENTS);

/** Stable, device-independent pick from the being's id. */
export function temperamentOf(b) {
  if (b.temper && TEMPERAMENTS[b.temper]) return b.temper;   // tests (and a future picker) can pin one
  let h = 0; for (const ch of String(b.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TEMPERAMENT_IDS[h % TEMPERAMENT_IDS.length];
}
export const T = b => TEMPERAMENTS[temperamentOf(b)];

const forBeing = (log, b) => log.filter(e => e.id ? e.id === b.id : e.n === b.name);

/** Most-fed cheese once there's a clear pattern (3+ feasts, and at least 40% one kind). */
export function favouriteCheese(s, b) {
  const tally = {};
  forBeing(s.log, b).forEach(e => { const c = e.c === 'a tiny crumb' ? 'crumb' : e.c; tally[c] = (tally[c] || 0) + 1; });
  const total = Object.values(tally).reduce((a, n) => a + n, 0);
  const [top, n] = Object.entries(tally).sort((a, z) => z[1] - a[1])[0] || [];
  return total >= 3 && n / total >= 0.4 ? top : null;
}

/** The weather they've had the most fun in (care given during that weather), once there's a pattern. */
export function favouriteWeather(b) {
  const tally = {};
  for (const [k, devs] of Object.entries(b.cnt || {})) if (k.startsWith('wx:')) tally[k.slice(3)] = Object.values(devs).reduce((a, n) => a + n, 0);
  const [top, n] = Object.entries(tally).sort((a, z) => z[1] - a[1])[0] || [];
  return n >= 3 ? top : null;
}

/** How many days in a row (ending today) the burrow has had this kind of weather. */
export function weatherStreak(s, kind, now = Date.now()) {
  let n = 0;
  for (let d = 0; d < 14; d++) {
    const day = localDate(now - d * 864e5, s.tz);
    if ((s.wxDays || {})[day] === kind) n++; else break;
  }
  return n;
}

/** Days in a row (ending with the latest feast) that this being got the same cheese. */
export function cheeseStreak(s, b) {
  const feeds = forBeing(s.log, b);
  if (!feeds.length) return { cheese: null, days: 0 };
  const c = feeds[0].c; const days = new Set();
  for (const e of feeds) { if (e.c !== c) break; days.add(localDate(e.t, s.tz)); }
  return { cheese: c, days: days.size };
}

const CHEESE_WORD = { cheddar: 'cheddar', brie: 'brie', swiss: 'swiss', crumb: 'crumbs', 'a tiny crumb': 'crumbs' };
const WX_WORD = { clear: 'sunny', clouds: 'cloudy', fog: 'foggy', drizzle: 'drizzly', rain: 'rainy', snow: 'snowy', storm: 'stormy' };

/** A line that only this being, with this history, would say after being fed `cheese`. */
export function feedLine(s, b, cheese, pick = a => a[Math.floor(Math.random() * a.length)]) {
  const fav = favouriteCheese(s, b), st = cheeseStreak(s, b), word = CHEESE_WORD[cheese] || cheese;
  if (st.days >= 3 && st.cheese === cheese) return `${word} ${st.days} days in a row. you know me so well.`;
  if (fav && fav === cheese) return pick([`${word} again? you know me so well.`, `my favourite! you remembered.`]);
  if (fav && fav !== cheese) return pick([`ooh, ${word}. not ${CHEESE_WORD[fav]}, but i’m open-minded.`, `${word}! a change from ${CHEESE_WORD[fav]}.`]);
  return pick(T(b).feed);
}

/** A line about today's weather, coloured by temperament and what they've learned to like. */
export function weatherLine(s, b, kind, now = Date.now(), pick = a => a[Math.floor(Math.random() * a.length)]) {
  const streak = weatherStreak(s, kind, now), loves = favouriteWeather(b) || T(b).loves;
  if (streak >= 3) {
    const ord = ['', '', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'][Math.min(streak, 7)] || 'another';
    if (kind === 'rain' || kind === 'drizzle') return `${ord} rainy day in a row. i’m becoming a puddle.`;
    if (kind === 'snow') return `${ord} snowy day! the hill is a pillow now.`;
    if (kind === 'clear') return `${ord} sunny day in a row. my fur is extra warm.`;
    return `${ord} ${WX_WORD[kind]} day in a row. i’m used to it now.`;
  }
  if (loves === kind) return pick([`${WX_WORD[kind]} days are my favourite.`, `ooh, it’s ${WX_WORD[kind]}! best weather.`]);
  return null;
}

/** Profile shown on the card. */
export function profile(s, b) {
  const t = T(b), fav = favouriteCheese(s, b), wx = favouriteWeather(b);
  const bits = [`${t.label} · ${t.blurb}`];
  bits.push(fav ? `loves ${CHEESE_WORD[fav]}` : 'still finding a favourite cheese');
  if (wx) bits.push(`happiest when it’s ${WX_WORD[wx]}`);
  return bits;
}
