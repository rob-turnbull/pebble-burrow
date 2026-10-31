import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { conditions } from '../js/conditions.js';
import { pickOutfit, layersFor, ITEMS, forecastLine } from '../js/outfits.js';
import { parseWeather } from '../js/weather.js';

const W = (kind, temp, x = {}) => ({ kind, temp, feels: temp, wind: 5, gust: 8, uv: 3, cloud: 50, wetAt: 0, hours: [], ...x });
const NOW = Date.UTC(2026, 9, 30, 19);

test('conditions read the weather the way the pets feel it', () => {
  const c = conditions({ w: W('clear', 92, { uv: 8 }), phase: 'day' });
  assert.ok(c.hot && c.bright && !c.cold);
  assert.ok(conditions({ w: W('snow', 28), phase: 'day' }).freezing);
  assert.ok(conditions({ w: W('clouds', 60, { wind: 20 }), phase: 'day' }).windy);
  assert.ok(conditions({ w: W('clouds', 4, {}), units: 'C' }).cold, 'celsius thresholds');
  assert.ok(conditions({ w: W('clear', 60, { wetAt: NOW - 20 * 60e3 }), phase: 'day', now: NOW }).rainbow);
  assert.ok(!conditions({ w: W('clear', 60, { wetAt: NOW - 20 * 60e3 }), phase: 'night', now: NOW }).rainbow, 'no rainbows at night');
});

test('outfits are always appropriate (5000 random pets and skies)', () => {
  const kinds = ['clear', 'clouds', 'fog', 'drizzle', 'rain', 'snow', 'storm'];
  for (let i = 0; i < 5000; i++) {
    const b = E.newBeing(['frog', 'fox', 'sheep', 'owl', 'mole'][i % 5]);
    const c = conditions({ w: W(kinds[i % 7], 20 + (i * 7) % 80, { wind: (i * 3) % 35, uv: i % 9 }), phase: ['day', 'night', 'dusk'][i % 3], season: ['summer', 'winter', 'autumn', 'spring'][i % 4] });
    const o = pickOutfit(b, c, NOW + i * 1800e3);
    for (const id of o.items) assert.ok(ITEMS[id].when(c), `${id} in ${c.key}`);
    if (c.warm) assert.ok(!o.items.some(x => ['puffer', 'beanie', 'earmuffs', 'cocoa'].includes(x)), 'no winter wear when warm');
    if (c.night) assert.ok(!o.items.includes('sunglasses') && !o.items.includes('towel'), 'nothing sunny at night');
    const slots = o.items.map(x => ITEMS[x].slot); assert.equal(new Set(slots).size, slots.length, 'one item per slot');
  }
});

test('choices hold steady for half an hour, then may change', () => {
  const b = E.newBeing('fox'), c = conditions({ w: W('rain', 50), phase: 'day' });
  assert.deepEqual(pickOutfit(b, c, NOW), pickOutfit(b, c, NOW + 60e3));
  const seen = new Set(Array.from({ length: 12 }, (_, k) => pickOutfit(b, c, NOW + k * 1800e3).items.join('+')));
  assert.ok(seen.size > 1, 'variety over the day');
});

test('a head wearable chosen by you is respected', () => {
  const b = E.newBeing('fox'); b.wear = 'flowers';
  for (let k = 0; k < 40; k++) assert.ok(!pickOutfit(b, conditions({ w: W('snow', 25), phase: 'day' }), NOW + k * 1800e3).items.some(x => ITEMS[x].slot === 'head'));
});

test('outfits draw into the right layers', () => {
  const b = E.newBeing('owl'), L = layersFor(b, { items: ['umbrella', 'raincoat', 'puddle'] }, conditions({ w: W('rain', 50) }));
  assert.match(L.hand, /<path/); assert.match(L.body, /<path/); assert.match(L.ground, /<ellipse/);
});

test('parseWeather reads current and the next hours, and remembers rain', () => {
  const t0 = Math.floor(NOW / 1000 / 3600) * 3600;
  const j = { current: { temperature_2m: 51.4, weather_code: 63, wind_speed_10m: 7, is_day: 1 },
    daily: { sunrise: [t0 - 30000], sunset: [t0 + 9000], temperature_2m_max: [55.2], temperature_2m_min: [40.6] },
    hourly: { time: Array.from({ length: 10 }, (_, i) => t0 + (i - 2) * 3600), temperature_2m: Array(10).fill(50), apparent_temperature: Array(10).fill(46), relative_humidity_2m: Array(10).fill(90),
      weather_code: [63, 63, 63, 61, 3, 3, 0, 0, 0, 0], precipitation_probability: Array(10).fill(30), wind_gusts_10m: Array(10).fill(14), cloud_cover: Array(10).fill(80), uv_index: Array(10).fill(1) } };
  const w = parseWeather(j, { lat: 45.5, lon: -123 }, 'F', null, NOW + 60e3);
  assert.equal(w.kind, 'rain'); assert.equal(w.feels, 46); assert.equal(w.hours.length, 6); assert.equal(w.hi, 55); assert.equal(w.wetAt, NOW + 60e3);
  const later = parseWeather({ ...j, current: { ...j.current, weather_code: 0 } }, { lat: 45.5, lon: -123 }, 'F', w, NOW + 3600e3);
  assert.equal(later.wetAt, w.wetAt, 'rain is remembered for rainbows');
  const old = parseWeather({ current: j.current, daily: { sunrise: j.daily.sunrise, sunset: j.daily.sunset } }, { lat: 1, lon: 1 }, 'F');
  assert.equal(old.feels, 51); assert.deepEqual(old.hours, [], 'the simple fallback still works');
});

test('pets forecast in their own voice', () => {
  const b = E.newBeing('fox'); b.temper = 'bouncy';
  const w = W('clouds', 55, { hours: [{ t: NOW + 3600e3, temp: 54, kind: 'rain', pop: 80 }] });
  assert.match(forecastLine(b, conditions({ w }), w), /PUDDLES/);
});
