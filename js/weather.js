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

export async function fetchWeather(place, units = 'F') {
  const q = new URLSearchParams({
    latitude: place.lat, longitude: place.lon,
    current: 'temperature_2m,weather_code,wind_speed_10m,is_day',
    daily: 'sunrise,sunset', timezone: 'auto', timeformat: 'unixtime', forecast_days: '1',
    temperature_unit: units === 'C' ? 'celsius' : 'fahrenheit', wind_speed_unit: units === 'C' ? 'kmh' : 'mph'
  });
  const r = await fetch(`${FORECAST}?${q}`);
  if (!r.ok) throw new Error(`weather service answered ${r.status}`);
  const j = await r.json();
  return {
    code: j.current.weather_code, kind: kindFromCode(j.current.weather_code),
    temp: Math.round(j.current.temperature_2m), wind: Math.round(j.current.wind_speed_10m),
    sunrise: j.daily.sunrise[0] * 1000, sunset: j.daily.sunset[0] * 1000,
    units, fetchedAt: Date.now(), for: `${place.lat},${place.lon}`
  };
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
    const n = { drizzle: 40, rain: 120, storm: 180, snow: 70 }[kind] || 0;
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
  lightning() { this.flash.classList.remove('go'); void this.flash.offsetWidth; this.flash.classList.add('go'); }
}
