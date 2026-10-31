// What it's like on the hill right now, in the words the pets (and their wardrobe) care about.
export function conditions({ w, phase = 'day', season = 'autumn', units = 'F', now = Date.now() } = {}) {
  const F = v => v == null ? null : units === 'C' ? v * 9 / 5 + 32 : v;          // thresholds below are in °F
  const mph = v => v == null ? 0 : units === 'C' ? v / 1.609 : v;
  const kind = w ? w.kind : 'clear', temp = F(w?.feels ?? w?.temp), wind = Math.max(mph(w?.wind), mph(w?.gust) * 0.7);
  const night = phase === 'night', day = phase === 'day' || phase === 'dawn' || phase === 'dusk';
  const c = {
    known: !!w, kind, phase, season, night, day,
    wet: ['rain', 'drizzle', 'storm'].includes(kind), snow: kind === 'snow', storm: kind === 'storm', fog: kind === 'fog',
    tempF: temp,
    freezing: temp != null && temp <= 32,
    cold: temp != null ? temp <= 48 : season === 'winter',
    warm: temp != null ? temp >= 66 : season === 'summer',
    hot: temp != null && temp >= 82,
    windy: wind >= 15,
    gale: wind >= 28,
    bright: !night && kind === 'clear' && ((w?.uv ?? 0) >= 5 || (w?.cloud ?? 100) < 15),
    rainbow: !!w && !night && (kind === 'clear' || kind === 'clouds') && w.wetAt && now - w.wetAt < 75 * 60e3,
    humid: (w?.humidity ?? 0) >= 85
  };
  if (c.hot || c.warm) c.cold = false;
  // A short key for "the same kind of weather": outfits are re-chosen when it changes.
  c.key = [kind, phase === 'night' ? 'n' : 'd', c.freezing ? 'fz' : c.cold ? 'c' : c.hot ? 'h' : c.warm ? 'w' : 'm', c.windy ? 'wd' : '', c.bright ? 'b' : '', c.rainbow ? 'rb' : ''].join('.');
  return c;
}

const ICON = { clear: ['☀️', '🌙'], clouds: ['☁️', '☁️'], fog: ['🌫️', '🌫️'], drizzle: ['🌦️', '🌧️'], rain: ['🌧️', '🌧️'], snow: ['❄️', '❄️'], storm: ['⛈️', '⛈️'] };
export const icon = (kind, night) => (ICON[kind] || ICON.clouds)[night ? 1 : 0];

/** One-line summary for the report card. */
export function summary(c) {
  const bits = [];
  if (c.rainbow) bits.push('a rainbow after the rain');
  else bits.push({ clear: c.night ? 'clear night' : c.bright ? 'bright and sunny' : 'clear', clouds: 'cloudy', fog: 'foggy', drizzle: 'drizzly', rain: 'rainy', snow: 'snowing', storm: 'stormy' }[c.kind]);
  if (c.gale) bits.push('very windy'); else if (c.windy) bits.push('breezy');
  if (c.freezing) bits.push('freezing'); else if (c.cold) bits.push('chilly'); else if (c.hot) bits.push('hot'); else if (c.warm) bits.push('warm');
  return bits.join(', ');
}
