// Day/night maths. Works offline: sunrise/sunset come from the sunrise equation
// when we know where the burrow is, and from Open-Meteo when weather is loaded.
const RAD = Math.PI / 180;
const J2000 = 2451545.0;
const toJulian = ms => ms / 864e5 + 2440587.5;
const fromJulian = j => (j - 2440587.5) * 864e5;

/** Sunrise/sunset (ms epoch) for the local day containing `date`, at lat/lon. Accurate to a few minutes. */
export function sunTimes(date, lat, lon) {
  const noon = new Date(date); noon.setHours(12, 0, 0, 0);
  const n = Math.round(toJulian(noon.getTime()) - J2000 + 0.0008);
  const Jstar = n - lon / 360;
  const M = (357.5291 + 0.98560028 * Jstar) % 360;
  const C = 1.9148 * Math.sin(M * RAD) + 0.02 * Math.sin(2 * M * RAD) + 0.0003 * Math.sin(3 * M * RAD);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const Jtransit = J2000 + Jstar + 0.0053 * Math.sin(M * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDec = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosW = (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * cosDec);
  if (cosW > 1) return { rise: null, set: null, polar: 'night' };
  if (cosW < -1) return { rise: null, set: null, polar: 'day' };
  const w = Math.acos(cosW) / RAD;
  return { rise: fromJulian(Jtransit - w / 360), set: fromJulian(Jtransit + w / 360) };
}

/** Fallback when the burrow has no place yet: 6:45 sunrise, 18:15 sunset, local time. */
export function defaultSun(date) {
  const r = new Date(date); r.setHours(6, 45, 0, 0);
  const s = new Date(date); s.setHours(18, 15, 0, 0);
  return { rise: r.getTime(), set: s.getTime() };
}

const TWILIGHT = 40 * 60e3; // dawn and dusk each run 40 min either side

/**
 * Which part of the day it is, plus progress through it (0..1) for placing the sun or moon.
 * @returns {{phase:'night'|'dawn'|'day'|'dusk', t:number}}
 */
export function phaseAt(now, sun) {
  if (sun.polar === 'night') return { phase: 'night', t: 0.5 };
  if (sun.polar === 'day') return { phase: 'day', t: 0.5 };
  const { rise, set } = sun;
  if (now >= rise - TWILIGHT && now < rise + TWILIGHT) return { phase: 'dawn', t: Math.max(0, (now - rise) / (set - rise)) };
  if (now >= set - TWILIGHT && now < set + TWILIGHT) return { phase: 'dusk', t: Math.min(1, (now - rise) / (set - rise)) };
  if (now >= rise && now < set) return { phase: 'day', t: (now - rise) / (set - rise) };
  // night: progress from yesterday's/today's sunset to the next sunrise (approximate with 24h shift)
  const lastSet = now >= set ? set : set - 864e5;
  const nextRise = now < rise ? rise : rise + 864e5;
  return { phase: 'night', t: Math.min(1, Math.max(0, (now - lastSet) / (nextRise - lastSet))) };
}

export function sunFor(date, place, weather) {
  const sameDay = weather && weather.sunrise && new Date(weather.sunrise).toDateString() === new Date(date).toDateString();
  if (sameDay) return { rise: weather.sunrise, set: weather.sunset };
  if (place) return sunTimes(date, place.lat, place.lon);
  return defaultSun(date);
}

export const fmtClock = ms => ms ? new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '–';
