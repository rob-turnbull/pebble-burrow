// Live weather via Open-Meteo (free, no API key) and the rain/snow/fog effects on the hill.
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE = 'https://api.bigdatacloud.net/data/reverse-geocode-client';
export const WEATHER_TTL = 30 * 60e3;

export function kindFromCode(code) {
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'clouds';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'clouds';
}
export const KIND_LABEL = { clear: 'clear', clouds: 'cloudy', fog: 'foggy', drizzle: 'drizzly', rain: 'rainy', snow: 'snowy', storm: 'stormy' };
export const kindIcon = (kind, night) => ({ clear: night ? '🌙' : '☀️', clouds: '☁️', fog: '🌫️', drizzle: '🌦️', rain: '🌧️', snow: '❄️', storm: '⛈️' })[kind] || '☁️';
export const isCold = (w, units) => !!w && (units === 'C' ? w.temp <= 4 : w.temp <= 40);

export async function fetchWeather(place, units = 'F', prev = null) {
  const base = {
    latitude: place.lat, longitude: place.lon, timezone: 'auto', timeformat: 'unixtime',
    temperature_unit: units === 'C' ? 'celsius' : 'fahrenheit', wind_speed_unit: units === 'C' ? 'kmh' : 'mph'
  };
  // Rich request first: extras come from hourly data, which every Open-Meteo version supports.
  const rich = new URLSearchParams({ ...base, forecast_days: '2',
    current: 'temperature_2m,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,precipitation_probability,wind_gusts_10m,cloud_cover,uv_index',
    daily: 'sunrise,sunset,temperature_2m_max,temperature_2m_min' });
  let r = await fetch(`${FORECAST}?${rich}`);
  if (r.status === 400) r = await fetch(`${FORECAST}?${new URLSearchParams({ ...base, forecast_days: '1', current: 'temperature_2m,weather_code,wind_speed_10m,is_day', daily: 'sunrise,sunset' })}`);
  if (!r.ok) throw new Error(`weather service answered ${r.status}`);
  return parseWeather(await r.json(), place, units, prev);
}

/** Turn an Open-Meteo response into what the burrow needs. Exported for tests. */
export function parseWeather(j, place, units, prev, now = Date.now()) {
  const kind = kindFromCode(j.current.weather_code);
  const w = {
    code: j.current.weather_code, kind,
    temp: Math.round(j.current.temperature_2m), wind: Math.round(j.current.wind_speed_10m), isDay: !!j.current.is_day,
    sunrise: j.daily.sunrise[0] * 1000, sunset: j.daily.sunset[0] * 1000,
    hi: j.daily.temperature_2m_max ? Math.round(j.daily.temperature_2m_max[0]) : null,
    lo: j.daily.temperature_2m_min ? Math.round(j.daily.temperature_2m_min[0]) : null,
    units, fetchedAt: now, for: `${place.lat},${place.lon}`, hours: []
  };
  const h = j.hourly;
  if (h && h.time) {
    let i = h.time.findIndex(t => t * 1000 > now) - 1; if (i < 0) i = 0;
    const at = (k, n) => h[k] && h[k][n] != null ? h[k][n] : null;
    w.feels = at('apparent_temperature', i) != null ? Math.round(at('apparent_temperature', i)) : w.temp;
    w.humidity = at('relative_humidity_2m', i);
    w.gust = at('wind_gusts_10m', i) != null ? Math.round(at('wind_gusts_10m', i)) : w.wind;
    w.cloud = at('cloud_cover', i);
    w.uv = at('uv_index', i);
    for (let n = i + 1; n <= i + 6 && n < h.time.length; n++)
      w.hours.push({ t: h.time[n] * 1000, temp: Math.round(at('temperature_2m', n)), kind: kindFromCode(at('weather_code', n)), pop: at('precipitation_probability', n) });
  } else { w.feels = w.temp; w.gust = w.wind; }
  // remember the last wet moment, for rainbows
  const wet = ['rain', 'drizzle', 'storm'].includes(kind);
  w.wetAt = wet ? now : prev?.wetAt || 0;
  return w;
}

export async function searchPlaces(name) {
  const q = new URLSearchParams({ name, count: '6', language: 'en', format: 'json' });
  const r = await fetch(`${GEOCODE}?${q}`);
  if (!r.ok) throw new Error(`place search answered ${r.status}`);
  const j = await r.json();
  return (j.results || []).map(p => ({
    name: p.name, region: [p.admin1, p.country_code].filter(Boolean).join(', '),
    lat: +p.latitude.toFixed(3), lon: +p.longitude.toFixed(3)
  }));
}

/** Browser location (asks permission), rounded to ~1 km so the save never holds a precise address. */
export function locateMe() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('this browser has no location service'));
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = +pos.coords.latitude.toFixed(2), lon = +pos.coords.longitude.toFixed(2);
      let name = 'here';
      try {
        const r = await fetch(`${REVERSE}?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
        const j = await r.json(); name = j.city || j.locality || j.principalSubdivision || 'here';
      } catch (e) { /* keep "here" */ }
      res({ name, region: '', lat, lon });
    }, err => rej(new Error(err.code === 1 ? 'location permission was declined' : 'could not get a location fix')),
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 6 * 36e5 });
  });
}

/* ---------------- effects layer ---------------- */
export class WeatherFX {
  constructor(stage) {
    this.stage = stage;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'wx-canvas';
    this.clouds = document.createElement('div'); this.clouds.className = 'wx-clouds';
    this.fog = document.createElement('div'); this.fog.className = 'wx-fog';
    this.flash = document.createElement('div'); this.flash.className = 'wx-flash';
    stage.prepend(this.clouds); stage.append(this.fog, this.canvas, this.flash);
    this.ctx = this.canvas.getContext('2d');
    this.parts = []; this.kind = null; this.raf = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize = this.resize.bind(this); this.loop = this.loop.bind(this);
    new ResizeObserver(this.resize).observe(stage); this.resize();
  }
  resize() {
    const r = this.stage.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    this.w = r.width; this.h = r.height;
    this.canvas.width = r.width * dpr; this.canvas.height = r.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  set(kind, wind = 0) {
    if (kind === this.kind && this.parts.length) return;
    this.kind = kind; this.wind = Math.min(wind, 30);
    const cloudy = { clouds: 4, drizzle: 3, rain: 4, storm: 5, snow: 3, fog: 2 }[kind] || (kind === 'clear' ? 1 : 0);
    this.clouds.innerHTML = Array.from({ length: cloudy }, (_, i) =>
      `<span style="top:${8 + (i * 17) % 42}%;left:0;animation-duration:${60 + i * 18}s;animation-delay:-${i * 13}s;transform:scale(${0.7 + (i % 3) * 0.25})"></span>`).join('');
    this.stage.dataset.wx = kind;
    const scale = Math.min(1, Math.max(0.45, (this.w || 400) / 700));      // phones get fewer drops; it looks the same
    const n = Math.round(({ drizzle: 40, rain: 120, storm: 180, snow: 70 }[kind] || 0) * scale);
    this.parts = Array.from({ length: this.reduced ? Math.min(n, 20) : n }, () => this.spawn(true));
    cancelAnimationFrame(this.raf);
    this.ctx.clearRect(0, 0, this.w, this.h);
    if (n) this.raf = requestAnimationFrame(this.loop);
    clearInterval(this.bolt);
    if (kind === 'storm' && !this.reduced) this.bolt = setInterval(() => { if (Math.random() < 0.35) this.lightning(); }, 4000);
  }
  spawn(anywhere) {
    const snow = this.kind === 'snow';
    return { x: Math.random() * (this.w + 60) - 30, y: anywhere ? Math.random() * this.h : -10,
      v: snow ? 0.6 + Math.random() * 0.8 : (this.kind === 'drizzle' ? 5 : 9) + Math.random() * 4,
      r: snow ? 1.5 + Math.random() * 2.5 : 0, ph: Math.random() * 6.28 };
  }
  loop() {
    if (document.visibilityState !== 'visible' || !this.stage.isConnected) { this.raf = requestAnimationFrame(this.loop); if (!this.stage.isConnected) cancelAnimationFrame(this.raf); return; }
    const c = this.ctx, snow = this.kind === 'snow', slant = this.wind / 12;
    c.clearRect(0, 0, this.w, this.h);
    c.strokeStyle = 'rgba(200,220,255,.55)'; c.fillStyle = 'rgba(255,255,255,.9)'; c.lineWidth = this.kind === 'drizzle' ? 1 : 1.4;
    c.beginPath();
    for (const p of this.parts) {
      if (snow) { p.y += p.v; p.ph += 0.03; p.x += Math.sin(p.ph) * 0.5 + slant * 0.2; c.moveTo(p.x + p.r, p.y); c.arc(p.x, p.y, p.r, 0, 6.283); }
      else { p.y += p.v; p.x += slant; c.moveTo(p.x, p.y); c.lineTo(p.x - slant * 1.5, p.y - p.v * 1.4); }
      if (p.y > this.h + 10) Object.assign(p, this.spawn(false));
    }
    snow ? c.fill() : c.stroke();
    this.raf = requestAnimationFrame(this.loop);
  }
  lightning() { this.flash.classList.remove('go'); void this.flash.offsetWidth; this.flash.classList.add('go'); this.onThunder?.(); }
}
