// A letter from the pets every Sunday, about their week. Written from the save, kept in the album.
import { count, localDate } from './engine.js';
import { temperamentOf, favouriteCheese } from './personality.js';
import { grantedTotal } from './wishes.js';

const DAY = 864e5;
export const weekId = (now = Date.now(), tz) => { const d = new Date(localDate(now, tz) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };   // the Sunday that starts the week

/** Is a new letter due? One per week, written on or after Sunday morning (or the first visit after). */
export function letterDue(s, now = Date.now()) {
  const wk = weekId(now, s.tz), d = new Date(now);
  if ((s.letters || []).some(l => l.week === wk)) return null;
  if (now - (s.created || now) < 5 * DAY) return null;                // need a week to write about
  if (d.getDay() === 0 && d.getHours() < 8) return null;
  return wk;
}

const CHEESE = { cheddar: 'cheddar', brie: 'brie', swiss: 'holey swiss', 'a tiny crumb': 'tiny crumbs' };
const WX = { clear: 'sunny', clouds: 'cloudy', fog: 'foggy', drizzle: 'drizzly', rain: 'rainy', snow: 'snowy', storm: 'stormy' };
const OPEN = { shy: 'dear {o},', bouncy: 'DEAR {o}!!', sleepy: 'dear {o} (written in bed),', curious: 'dear {o}, a question first: did you have a good week?', bold: 'to {o}, keeper of the burrow:' };
const CLOSE = { shy: 'see you soon. we’ll keep your spot warm.', bouncy: 'come back SOON. we have boings saved up.', sleepy: 'that’s all. time for a nap.', curious: 'what should we do next week? we have ideas.', bold: 'the hill is safe. until next week.' };

/** Write the letter for the week ending now. */
export function writeLetter(s, now = Date.now(), lastGranted = 0) {
  const from = now - 7 * DAY, names = s.beings.map(b => b.name.split(' ')[0]);
  const writer = s.beings[Math.floor((now / DAY) % s.beings.length)], t = temperamentOf(writer);
  const lines = [];
  const feasts = s.log.filter(l => l.t > from);
  if (feasts.length) {
    const tally = {}; feasts.forEach(l => tally[l.c] = (tally[l.c] || 0) + 1);
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    lines.push(`we had ${feasts.length} feast${feasts.length === 1 ? '' : 's'} this week. the most popular was ${CHEESE[top[0]] || top[0]}.`);
  } else lines.push('it was a quiet week for snacks. we thought about cheese a lot.');
  const days = Object.entries(s.wxDays || {}).filter(([d]) => d >= localDate(from, s.tz));
  if (days.length) {
    const tally = {}; days.forEach(([, k]) => tally[k] = (tally[k] || 0) + 1);
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    lines.push(`the weather was mostly ${WX[top[0]] || top[0]}${top[1] > 1 ? ` (${top[1]} days of it)` : ''}.`);
  }
  const moments = s.album.filter(k => k.t > from && !/^wear:/.test(k.k)).slice(-3);
  if (moments.length) lines.push(`things we’ll remember: ${moments.map(k => k.text).join('; ')}.`);
  const granted = grantedTotal(s) - lastGranted;
  if (granted > 0) lines.push(`you granted ${granted} of our wishes. ${granted >= 7 ? 'that’s a lot of wishes. thank you.' : 'thank you.'}`);
  const fav = favouriteCheese(s, writer);
  if (fav) lines.push(`${names[s.beings.indexOf(writer)]} would like you to know they still love ${CHEESE[fav] || fav}.`);
  const others = names.filter((n, i) => s.beings[i] !== writer);
  if (others.length) lines.push(`${others.join(' and ')} say${others.length === 1 ? 's' : ''} hello.`);
  return {
    week: weekId(now, s.tz), t: now, by: writer.id, byName: names[s.beings.indexOf(writer)], granted: grantedTotal(s),
    text: [OPEN[t].replace('{o}', s.owner), ...lines, CLOSE[t]].join('\n')
  };
}

export function addLetter(s, letter) {
  s.letters = (s.letters || []).filter(l => l.week !== letter.week);
  s.letters.push(letter); s.letters.sort((a, b) => a.t - b.t); s.letters = s.letters.slice(-26);
  s.updatedAt = Math.max(s.updatedAt || 0, letter.t);
}
export function mergeLetters(out, b) {
  const by = new Map((out.letters || []).map(l => [l.week, l]));
  (b.letters || []).forEach(l => { if (!by.has(l.week)) by.set(l.week, JSON.parse(JSON.stringify(l))); });
  out.letters = [...by.values()].sort((a, c) => a.t - c.t).slice(-26);
}
