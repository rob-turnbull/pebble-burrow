// Deciding whether to nudge, and what to say. Pure: given a save, the time and what was already sent.
import * as E from '../../js/engine.js';

export const NUDGE = { maxPerDay: 4, quietFrom: 22, quietTo: 7, minGapMin: 120, tendingMin: 60 };
const MIN = 60e3, H = 36e5;

export function localParts(now, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(now).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour % 24, month: +p.month, day: +p.day };
}

/**
 * @param save   the burrow save (not modified)
 * @param hist   {date, count, last, keys:{key: sentAt}}
 * @param wxKind current weather kind at the burrow, if known
 * @returns {{key,title,body,tag}|null}
 */
export function decideNudge(save, now = Date.now(), hist = {}, wxKind) {
  const s = JSON.parse(JSON.stringify(save));
  E.catchUp(s, now);
  const { date, hour, month, day } = localParts(now, s.tz);
  if (hour >= NUDGE.quietFrom || hour < NUDGE.quietTo) return null;
  const today = hist.date === date ? hist : { date, count: 0, last: hist.last || 0, keys: hist.keys || {} };
  if (today.count >= NUDGE.maxPerDay) return null;
  if (now - (today.last || 0) < NUDGE.minGapMin * MIN) return null;
  if (now - (s.updatedAt || 0) < NUDGE.tendingMin * MIN) return null;     // they're already here

  const keys = hist.keys || {};
  const ok = (key, gapH) => now - (keys[key] || 0) >= gapH * H;
  const names = s.beings.map(E.first);
  const both = names.join(' and ');
  const c = [];

  if (s.bday && +s.bday.d === day && +s.bday.m === month && hour >= 8)
    c.push({ key: `bday:${date}`, gap: 24, title: '🎂 psst', body: `${both} have been waiting all morning to say happy birthday.` });
  if (month === 10 && day === 31 && hour >= 9)
    c.push({ key: `halloween:${date}`, gap: 24, title: '🎃 happy halloween', body: `${both} are in costume and would like you to guess who they are.` });
  s.beings.forEach(b => {
    const n = E.first(b);
    if (b.napping) c.push({ key: `nap:${b.id}`, gap: 8, title: `${n} is napping`, body: `${n} curled up for a nap. a little cheese would wake them.` });
    else if (b.full < 30) c.push({ key: `hungry:${b.id}`, gap: 6, title: `${n} is peckish 🧀`, body: `${n}'s tummy is doing little rumbles.` });
    else if (b.clean < 25) c.push({ key: `muddy:${b.id}`, gap: 12, title: `${n} is a bit muddy`, body: `${n} found a puddle. the sponge is by the door.` });
  });
  if (wxKind === 'snow') c.push({ key: `wx:snow:${date}`, gap: 24, title: '❄️ snow on the hill', body: `${names[0]} wants to know if you've seen it.` });
  if (wxKind === 'storm') c.push({ key: `wx:storm:${date}`, gap: 24, title: '⛈️ big noisy sky', body: `${both} are staying close to the door. a hug would help.` });
  if (now - (s.updatedAt || 0) > 20 * H) c.push({ key: `miss:${date}`, gap: 24, title: 'the hill misses you', body: `${both} are keeping your spot warm.` });

  const pick = c.find(x => ok(x.key, x.gap));
  return pick ? { key: pick.key, title: pick.title, body: pick.body, tag: pick.key.split(':')[0] } : null;
}

/**
 * Which new weather warnings to push. Warnings don't count toward the daily limit.
 * Quiet hours hold back everything except Severe and Extreme.
 */
export function alertsToSend(alerts, seen = {}, now = Date.now(), tz) {
  const { hour } = localParts(now, tz);
  const quiet = hour >= NUDGE.quietFrom || hour < NUDGE.quietTo;
  return alerts.filter(a => !seen[a.id] && (!quiet || a.severity === 'Severe' || a.severity === 'Extreme'));
}

/** History after sending `n`. Keeps per-key times for 3 days so gaps carry across midnight. */
export function recordNudge(hist = {}, n, now, tz) {
  const { date } = localParts(now, tz);
  const keys = Object.fromEntries(Object.entries(hist.keys || {}).filter(([, t]) => now - t < 72 * H));
  keys[n.key] = now;
  const count = hist.date === date ? (hist.count || 0) + 1 : 1;
  return { date, count, last: now, keys };
}
