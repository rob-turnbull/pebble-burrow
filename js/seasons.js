// Calendar moments layered over the real sky and weather. Hemisphere-aware.
const md = d => (d.getMonth() + 1) * 100 + d.getDate();           // e.g. Oct 31 -> 1031
const within = (x, from, to) => from <= to ? x >= from && x <= to : x >= from || x <= to;

export function seasonOf(date, lat = 45) {
  const x = md(date);
  let s = within(x, 320, 620) ? 'spring' : within(x, 621, 921) ? 'summer' : within(x, 922, 1220) ? 'autumn' : 'winter';
  if (lat < 0) s = { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' }[s];
  return s;
}

/**
 * Everything happening on the hill today.
 * @returns {{season:string, events:string[], costume:boolean}}
 */
export function seasonal(date = new Date(), lat = 45) {
  const x = md(date), events = [];
  if (within(x, 1024, 1101)) events.push('halloween');
  if (within(x, 1201, 106)) events.push('lights');
  if (x === 101) events.push('newyear');
  const h = date.getHours(), season = seasonOf(date, lat);
  if (within(x, 1110, 1130)) events.push('harvest');                                   // harvest festival
  if ((x === 1231 && h >= 18) || (x === 101 && h < 2)) events.push('fireworks');        // new year's eve
  const spring = lat < 0 ? within(x, 920, 1031) : within(x, 320, 430);                   // early spring: blossom time
  if (spring) events.push('blossom');
  const dow = date.getDay();
  if (season === 'summer' && (dow === 0 || dow === 6) && h >= 10 && h < 18) events.push('picnic');   // summer weekends
  return { season, events, costume: x === 1031 };
}

/** A stable string for "what decor should be on the hill" so the scene only rebuilds when it changes. */
export const EVENT_LABEL = { halloween: 'spooky week', lights: 'winter lights', newyear: 'new year', harvest: 'harvest festival', fireworks: 'fireworks tonight', blossom: 'blossom time', picnic: 'picnic day' };

export const decorKey = (sea, phase) => `${sea.season}|${sea.events.join(',')}|${sea.costume}|${phase === 'night' || phase === 'dusk'}`;
