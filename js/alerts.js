// Official weather warnings from the US National Weather Service (api.weather.gov).
// Free and keyless; only covers the United States. Outside the US this quietly returns nothing.
const NWS = 'https://api.weather.gov/alerts/active';
export const ALERT_TTL = 10 * 60e3;
const RANK = { Extreme: 4, Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };

/** Roughly inside the area the NWS covers (50 states, territories nearby). */
export const inUS = p => !!p && p.lat > 17 && p.lat < 72 && p.lon > -180 && p.lon < -64;

export async function fetchAlerts(place, { ua } = {}) {
  if (!inUS(place)) return [];
  const headers = { Accept: 'application/geo+json' };
  if (ua) headers['User-Agent'] = ua;                     // browsers send their own; the helper sets one
  const r = await fetch(`${NWS}?point=${place.lat.toFixed(4)},${place.lon.toFixed(4)}`, { headers });
  if (r.status === 404 || r.status === 400) return [];       // outside a forecast zone
  if (!r.ok) throw new Error(`weather alerts answered ${r.status}`);
  return parseAlerts(await r.json());
}

/** Keep what the burrow needs, most serious first. Exported for tests. */
export function parseAlerts(j, now = Date.now()) {
  return (j.features || []).map(f => {
    const p = f.properties || {};
    return {
      id: p.id || f.id, event: p.event || 'weather alert', headline: p.headline || p.event || '',
      severity: p.severity || 'Unknown', urgency: p.urgency || '', instruction: (p.instruction || '').slice(0, 400),
      ends: Date.parse(p.ends || p.expires || '') || 0, area: p.areaDesc || ''
    };
  }).filter(a => {
    if (a.ends && a.ends <= now) return false;                 // already over
    if (/test message/i.test(a.event)) return false;
    if (/warning/i.test(a.event)) return true;                 // warnings always count
    return a.severity !== 'Unknown' && a.severity !== 'Minor';   // watches and advisories when they matter
  })
    .sort((a, b) => (RANK[b.severity] || 0) - (RANK[a.severity] || 0));
}

export const isSerious = a => (RANK[a.severity] || 0) >= 3;

/** What kind of weather a warning is about, for the pets' reaction. */
export function alertKind(a) {
  const e = (a.event || '').toLowerCase();
  if (/tornado/.test(e)) return 'tornado';
  if (/thunder|storm|hurricane|tropical/.test(e)) return 'storm';
  if (/flood/.test(e)) return 'flood';
  if (/snow|blizzard|ice|winter|freez|frost|cold|chill/.test(e)) return 'cold';
  if (/heat/.test(e)) return 'heat';
  if (/wind|gale/.test(e)) return 'wind';
  if (/fire|smoke|air quality/.test(e)) return 'smoke';
  if (/fog/.test(e)) return 'fog';
  return 'general';
}

const REACT = {
  tornado: ['into the burrow, everyone. we’ll wait it out together.', 'shelter time. blankets, lantern, cheese. we’re ready.'],
  storm: ['big storm warning. we’re boarding the door and making a blanket fort.', 'storm coming. i packed the emergency cheese.'],
  flood: ['flood warning. we’re staying up on the hill, nice and high.', 'the puddles are getting serious. no splashing today.'],
  cold: ['it’s going to be dangerously cold. extra blankets for everyone.', 'freeze warning. i covered the garden with a little blanket.'],
  heat: ['heat warning. shade, water, and no running around.', 'it’s going to be very hot. we’re having a cool nap inside.'],
  wind: ['strong wind warning. we tied down the kite.', 'hold onto your ears, it’s going to get very windy.'],
  smoke: ['the air isn’t good today. we’re staying in with the windows shut.', 'smoky air. indoor games today.'],
  fog: ['thick fog coming. we’ll stay close to the door.'],
  general: ['there’s a weather warning. we’re keeping an eye on the sky.']
};
export const reactLine = (a, r = Math.random) => { const k = alertKind(a), l = REACT[k] || REACT.general; return l[Math.floor(r() * l.length)]; };
