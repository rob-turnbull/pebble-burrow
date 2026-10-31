// Presentation + orchestration: rendering, actions, sky/weather/season loop, sync loop.
import { SPECIES, CHEESES, MONTHS, WEATHER_LINES, SEASON_LINES, WEARABLES, STAGES } from './data.js';
import { art, eggArt, genesOf } from './art.js';
import { startLife, flash } from './life.js';
import * as E from './engine.js';
import { phaseAt, sunFor, fmtClock } from './sky.js';
import { seasonal, decorKey } from './seasons.js';
import { fetchWeather, searchPlaces, locateMe, WeatherFX, kindIcon, KIND_LABEL, isCold, WEATHER_TTL } from './weather.js';
import { GistSync } from './sync.js';
import * as P from './personality.js';
import * as Snd from './sound.js';
import { GAMES, openGame } from './games.js';
import * as R from './room.js';
import { conditions, summary as wxSummary, icon as wxIcon } from './conditions.js';
import * as O from './outfits.js';
import { writeDiary, awayLabel } from './diary.js';
import * as F from './friends.js';
import * as GD from './garden.js';
import * as V from './visitors.js';
import * as PH from './photo.js';
import * as HZ from './horizon.js';
import { parseHelper, helperStatus, pushSupport, currentSubscription, enableNudges, disableNudges, testNudge, getMailbox, mailAction, sendPostcard, isMailAddress } from './helper.js';
import * as Post from './post.js';

/* ---------------- local persistence ---------------- */
const K = { state: 'pebble-burrow', device: 'pebble-burrow-device', wx: 'pebble-burrow-weather', legacy: 'pebble-burrow-v1' };
const ls = {
  get(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
let S = E.migrate(ls.get(K.state) || ls.get(K.legacy));
let D = Object.assign({ token: '', gistId: null, lastSync: 0, user: '', dev: '' }, ls.get(K.device) || {});  // this device only
if (!D.dev) D.dev = 'd' + E.uid();
let W = ls.get(K.wx);                                                                                         // weather cache, this device only
const saveLocal = () => ls.set(K.state, S);
const saveDevice = () => ls.set(K.device, D);
saveDevice();
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } })();

/* ---------------- ui state ---------------- */
const app = document.getElementById('app');
let stopLife = null;
const drawBeing = (b, layers) => art(b.sp, { genes: genesOf(b), layers: layers || outfitLayers(b) });
const outfits = {};
const diaryHooks = [F.diaryMoments, GD.diaryGarden, V.diaryVisitors];           // other features add their own away-time events here: (save, from, to) => [{t, e, text}]
let DIARY = (() => { try { return JSON.parse(localStorage.getItem('pebble-burrow-diary')); } catch { return null; } })();
let outfitLayers = b => O.layersFor(b, outfits[b.id], env.c);
let MB = null, mbErr = '', mailAll = false;
let gamesOpen = false, scene = 'hill', arranging = false, pickSlot = '';
let sel = 0, washMode = false, view = 'burrow', cheeseOpen = false, renaming = -1, wearing = -1, confirmReset = false, albumAll = false;
let panelNote = '', placeResults = [], placeBusy = false, syncBusy = false, syncMsg = '', syncErr = false;
let helperNote = '', helperOk = null, nudgesOn = false;
let fx = null, env = { phase: 'day', t: 0.5, kind: null, cold: false }, lastVoiced = '', lastDecor = '';
let installEvt = null;

const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmtAgo = t => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 6e4); if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; const h = Math.round(m / 60); if (h < 24) return h + 'h ago'; return Math.round(h / 24) + 'd ago'; };
const fmtDay = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
const $ = id => document.getElementById(id);
const on = (id, f) => { const e = $(id); if (e) e.onclick = f; };
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const busyTyping = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

/* ---------------- sync: pull → merge → push ---------------- */
let syncTimer = 0, dirty = false, syncing = null;
const syncer = () => D.token ? new GistSync(D.token, D.gistId) : null;

function touch() {            // call after any change the person made
  S.updatedAt = Date.now(); saveLocal(); dirty = true; scheduleSync();
}
function scheduleSync(ms = 4000) { if (!D.token) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms); }

/**
 * One round trip: read the gist, merge it with this device's save, write back if anything changed.
 * Returns 'changed' when the merge brought something new into this device.
 */
function syncNow() {
  if (syncing) return syncing;
  syncing = (async () => {
    const g = syncer(); if (!g) return 'off';
    syncBusy = true; paintSync();
    let out = 'same';
    try {
      const remote = E.migrate(await g.pull());
      D.gistId = g.gistId;
      const merged = E.merge(S, remote);
      if (merged) {
        E.catchUp(merged, Date.now());
        const brought = !E.sameSave(merged, S);
        if (!remote || !E.sameSave(merged, remote)) D.gistId = await g.push(merged);
        if (brought) { S = merged; saveLocal(); out = 'changed'; }
      } else out = 'empty';
      dirty = false; D.lastSync = Date.now(); syncErr = false; syncMsg = '';
    } catch (e) { syncErr = true; syncMsg = e.message; out = 'error'; }
    syncBusy = false; saveDevice(); paintSync();
    return out;
  })().finally(() => { syncing = null; });
  return syncing;
}

async function syncAndRefresh() {
  const r = await syncNow();
  if (r === 'changed' && S) { sel = Math.min(sel, S.beings.length - 1); if (view === 'setup') renderBurrow(); else if (!busyTyping() && !washMode) renderBurrow(); refreshWeather(); }
  return r;
}

function paintSync() {
  const el = $('syncpill'); if (!el) return;
  if (!D.token) { el.textContent = 'this device only'; el.className = 'pill'; return; }
  el.className = 'pill ' + (syncErr ? 'bad' : 'ok');
  el.textContent = syncBusy ? 'syncing…' : syncErr ? 'sync paused' : 'synced ' + fmtAgo(D.lastSync);
  el.title = syncMsg || '';
}

/* ---------------- environment: sky, weather, season ---------------- */
function computeEnv(now = Date.now()) {
  const wx = S?.place && W && W.for === `${S.place.lat},${S.place.lon}` ? W : null;
  const sun = sunFor(now, S?.place, wx);
  const { phase, t } = phaseAt(now, sun);
  const sea = seasonal(new Date(now), S?.place?.lat ?? 45);
  const c = conditions({ w: wx, phase, season: sea.season, units: S?.units || 'F', now });
  return { phase, t, sun, wx, kind: wx ? wx.kind : 'clear', cold: isCold(wx, S?.units), sea, c };
}
const mult = () => E.envMultipliers({ phase: env.phase, kind: env.kind, cold: env.cold });

async function refreshWeather(force = false) {
  if (!S?.place) return;
  const key = `${S.place.lat},${S.place.lon}`;
  const fresh = W && W.for === key && W.units === S.units && Date.now() - W.fetchedAt < WEATHER_TTL;
  if (fresh && !force) return;
  try { W = await fetchWeather(S.place, S.units, W); ls.set(K.wx, W); applyEnv(); }
  catch { /* keep last known weather; offline is fine */ }
}

function applyEnv() {
  if (!S) return;
  env = computeEnv();
  const st = $('stage'); if (!st) return;
  st.dataset.phase = env.phase;
  st.classList.toggle('cold', env.cold);
  st.classList.toggle('costume', env.sea.costume);
  st.dataset.season = env.sea.season;
  const orb = $('orb');
  if (orb) {
    orb.className = 'orb ' + (env.phase === 'night' ? 'moon' : env.phase);
    orb.style.left = (6 + 80 * env.t) + '%';
    orb.style.top = (58 - 46 * Math.sin(Math.PI * env.t)) + '%';
  }
  st.dataset.wx = env.wx ? env.kind : '';
  fx?.set(env.kind, env.wx?.wind || 0);
  Snd.ambience(env.kind, env.phase);
  paintDecor();
  const chip = $('wxchip');
  if (chip) {
    const night = env.phase === 'night', ev = env.sea.costume ? ' · 🎃' : env.sea.events.includes('halloween') ? ' · spooky week' : '';
    chip.innerHTML = env.wx
      ? `<span>${kindIcon(env.kind, night)} ${env.wx.temp}°${S.units}</span><span class="muted">${esc(S.place.name)} · ${env.phase}${ev}</span>`
      : `<span>${night ? '🌙' : '☀️'} ${env.phase}${ev}</span><span class="muted">${S.place ? esc(S.place.name) : 'add your town for weather'}</span>`;
  }
  earnEnvKeepsakes();
  dressForWeather();
  ['windy', 'gale', 'hot', 'cold', 'freezing', 'bright', 'rainbow'].forEach(k => st.classList.toggle('c-' + k, !!env.c?.[k]));
  if (env.wx && E.noteWeather(S, env.kind)) touch(); else if (env.wx) saveLocal();
  // a being comments when the sky, weather or season changes
  const voice = `${env.phase}|${env.kind}|${env.sea.events.join(',')}`;
  if (lastVoiced && voice !== lastVoiced) {
    const [p0, k0, e0] = lastVoiced.split('|');
    const awake = S.beings.map((b, i) => b.napping ? -1 : i).filter(i => i > -1);
    const who = awake.length ? E.rand(awake) : -1;
    const own = who > -1 && env.kind !== k0 && env.wx ? P.weatherLine(S, S.beings[who], env.kind) : null;
    const line = own || (env.kind !== k0 ? E.rand(WEATHER_LINES[env.kind] || ['']) : env.sea.events.join(',') !== e0 && env.sea.events[0] ? E.rand(SEASON_LINES[env.sea.events[0]] || ['']) : env.phase !== p0 ? E.rand(WEATHER_LINES[env.phase] || ['']) : '');
    if (line && who > -1) setTimeout(() => say(who, line, 3600), 800);
  }
  lastVoiced = voice;
}

/** Choose outfits for the weather; redraw only the pets whose outfit changed, and let one of them say something. */
let lastDress = '';
function dressForWeather() {
  if (!S || !env.c) return;
  const changed = [];
  const lvl = S.beings.length > 1 ? F.level(S).index : 0;
  S.beings.forEach((b, i) => {
    const o = O.pickOutfit(b, env.c);
    if (i === 1 && lvl >= 3 && env.c?.known) { const first = outfits[S.beings[0].id]?.items.find(x => O.ITEMS[x].slot === 'head'); if (first && !o.items.some(x => O.ITEMS[x].slot === 'head') && !['flowers', 'pumpkin', 'party', 'bow'].includes(b.wear) && (Math.floor(Date.now() / 1800e3) % 3 === 0)) o.items.push(first); }
    const prev = outfits[b.id];
    if (!prev || prev.key !== o.key || prev.items.join() !== o.items.join() || prev.wear !== b.wear) { outfits[b.id] = { ...o, wear: b.wear }; changed.push(i); }
  });
  if (!changed.length) return;
  redrawBeings(changed);
  const firstTime = lastDress === '';
  lastDress = env.c.key;
  let kept = false;
  changed.forEach(i => (outfits[S.beings[i].id].items || []).forEach(it => { kept = E.keepsake(S, 'wear:' + it, '🧥', `first ${O.ITEMS[it].label} on the hill`, Date.now()) || kept; }));
  if (kept) touch();
  const talk = changed.filter(i => !S.beings[i].napping && outfits[S.beings[i].id].line);
  if (talk.length) setTimeout(() => { const i = E.rand(talk); say(i, outfits[S.beings[i].id].line, 4200); }, firstTime ? 2600 : 900);
}

/** Swap a pet's drawing in place (keeps speech bubbles, sponge, animations). */
function redrawBeings(idx) {
  idx.forEach(i => document.querySelectorAll(`.being[data-i="${i}"]`).forEach(el => {
    const old = el.querySelector('svg'); if (!old) return;
    const tmp = document.createElement('div'); tmp.innerHTML = drawBeing(S.beings[i]);
    old.replaceWith(tmp.firstElementChild);
    el.dataset.act = outfits[S.beings[i].id]?.act || '';
  }));
}

let reportOpen = (() => { try { return localStorage.getItem('pebble-burrow-report') === '1'; } catch { return false; } })();
function reportHTML() {
  if (!S.place) return `<section class="report empty"><span>☀️ no weather yet</span><button class="linkbtn" id="rep-town">add your town</button><span class="hint">and the pets will dress for it.</span></section>`;
  const w = env.wx, c = env.c;
  if (!w) return `<section class="report empty"><span>${esc(S.place.name)}</span><span class="hint">checking the weather…</span></section>`;
  const u = S.units, night = env.phase === 'night', windU = u === 'C' ? 'km/h' : 'mph';
  const fmtH = t => new Date(t).toLocaleTimeString([], { hour: 'numeric' });
  return `<section class="report">
    <button class="rep-head" id="rep-toggle" aria-expanded="${reportOpen}">
      <span class="rep-now"><span class="rep-icon">${c.rainbow ? '🌈' : wxIcon(w.kind, night)}</span><strong>${w.temp}°</strong><span class="rep-sum">${esc(wxSummary(c))}</span></span>
      <span class="hint">${esc(S.place.name)} ${reportOpen ? '▴' : '▾'}</span></button>
    ${reportOpen ? `<div class="rep-body">
      <dl class="rep-stats">
        <div><dt>feels like</dt><dd>${w.feels ?? w.temp}°${u}</dd></div>
        <div><dt>wind</dt><dd>${w.wind}${w.gust && w.gust > w.wind + 4 ? `–${w.gust}` : ''} ${windU}</dd></div>
        ${w.humidity != null ? `<div><dt>humidity</dt><dd>${Math.round(w.humidity)}%</dd></div>` : ''}
        ${w.hi != null ? `<div><dt>today</dt><dd>${w.lo}° – ${w.hi}°</dd></div>` : ''}
        <div><dt>sunrise</dt><dd>${fmtClock(env.sun.rise)}</dd></div><div><dt>sunset</dt><dd>${fmtClock(env.sun.set)}</dd></div>
        ${w.uv != null && !night ? `<div><dt>uv</dt><dd>${Math.round(w.uv)}</dd></div>` : ''}
      </dl>
      ${w.hours?.length ? `<ol class="rep-hours">${w.hours.map(h => `<li><span class="hint">${fmtH(h.t)}</span><span class="rep-hi">${wxIcon(h.kind, new Date(h.t).getHours() >= 19 || new Date(h.t).getHours() < 6)}</span><span>${h.temp}°</span>${h.pop != null && h.pop >= 20 ? `<span class="rep-pop">${h.pop}%</span>` : '<span class="rep-pop"></span>'}</li>`).join('')}</ol>` : ''}
      <ul class="rep-pets">${S.beings.map(b => `<li><strong>${esc(E.first(b))}:</strong> “${esc(O.forecastLine(b, c, w))}”</li>`).join('')}</ul>
      <p class="hint">updated ${fmtAgo(w.fetchedAt)} · <a href="https://open-meteo.com/" target="_blank" rel="noopener">weather by Open-Meteo</a></p>
    </div>` : ''}
  </section>`;
}

/** Keepsakes that come from the world rather than from care. */
function earnEnvKeepsakes() {
  const now = Date.now(), y = new Date().getFullYear(); let got = false;
  const firsts = { snow: ['❄️', 'first snow on the hill'], rain: ['🌧️', 'first rain on the hill'], storm: ['⛈️', 'braved a first storm together'] };
  if (firsts[env.kind]) got = E.keepsake(S, 'wx:' + env.kind, firsts[env.kind][0], firsts[env.kind][1], now) || got;
  if (env.sea.events.includes('halloween')) got = E.keepsake(S, 'halloween:' + y, '🎃', `halloween ${y} on the hill. the pumpkin hat is yours to keep`, now) || got;
  if (E.isBirthday(S)) got = E.keepsake(S, 'bday:' + y, '🎂', `your birthday, ${y}. they knew. the party hat is yours to keep`, now) || got;
  if (env.sea.events.includes('lights')) got = E.keepsake(S, 'lights:' + (new Date().getMonth() === 0 ? y - 1 : y), '✨', 'the winter lights went up on the door', now) || got;
  if (env.sea.events.includes('newyear')) got = E.keepsake(S, 'newyear:' + y, '🎆', `a new year together, ${y}`, now) || got;
  if (got) touch();
}

function paintDecor() {
  const layer = $('decor'); if (!layer) return;
  const key = decorKey(env.sea, env.phase); if (key === lastDecor) return; lastDecor = key;
  const night = env.phase === 'night' || env.phase === 'dusk';
  let h = '';
  if (env.sea.events.includes('halloween')) {
    h += `<span class="pumpkin" style="left:9%;bottom:6px"></span><span class="pumpkin sm" style="left:28%;bottom:2px"></span><span class="pumpkin" style="right:6%;bottom:8px"></span>`;
    if (night) h += `<span class="bat" style="top:18%;animation-delay:0s">🦇</span><span class="bat" style="top:30%;animation-delay:-4s;animation-duration:11s">🦇</span>`;
  }
  if (env.sea.events.includes('lights')) h += `<span class="lights"></span>`;
  const drift = { autumn: ['🍂', '🍁'], spring: ['🌸', '🌸'] }[env.sea.season];
  if (drift) for (let i = 0; i < 6; i++) h += `<span class="drift" style="left:${8 + i * 15}%;animation-delay:-${i * 2.3}s;animation-duration:${10 + (i % 3) * 3}s">${drift[i % 2]}</span>`;
  layer.innerHTML = h;
}

/* ---------------- setup ---------------- */
let chosen = [];
function renderSetup() {
  view = 'setup';
  app.innerHTML = `
  <header class="top"><div><h1>pebble burrow</h1><p class="sub">little beings that need you, gently. nobody here ever dies.</p></div></header>
  <section class="setup">
    <div class="row between"><h2>choose two</h2><button class="ghost" id="surprise">🎲 surprise me</button></div>
    <div class="picks">${Object.keys(SPECIES).map(k => { const i = chosen.indexOf(k);
      return `<button class="pick ${i > -1 ? 'chosen' : ''}" data-sp="${k}" aria-pressed="${i > -1}">${i > -1 ? `<span class="num">${i + 1}</span>` : ''}${art(k)}<span>${SPECIES[k].label}</span></button>`; }).join('')}</div>
    <div class="form">
      <div class="row">
        <label class="field grow">whose burrow is this?<input id="owner" maxlength="24" value="Rob" autocomplete="off"></label>
        <label class="field">birthday day<select id="bd"><option value="">–</option>${Array.from({ length: 31 }, (_, i) => `<option>${i + 1}</option>`).join('')}</select></label>
        <label class="field">month<select id="bm"><option value="">–</option>${MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select></label>
      </div>
      <p class="hint">birthday is optional, day and month only. they keep it to themselves until the day comes.</p>
      <div><button class="big" id="hatch" ${chosen.length < 2 ? 'disabled' : ''}>hatch my eggs 🥚</button></div>
    </div>
    <details class="form" id="bring" ${D.token ? 'open' : ''}>
      <summary><strong>already have a burrow on another device?</strong></summary>
      <p class="hint">paste the same GitHub token you used there and your burrow comes across. or paste a backup code.</p>
      <div class="row"><label class="field grow">GitHub token<input id="b-token" type="password" autocomplete="off" placeholder="github_pat_…" value="${esc(D.token)}"></label><button class="btn" id="b-connect">bring it over</button></div>
      <div class="row"><label class="field grow">or a backup code<textarea id="b-code" rows="2" placeholder="paste a backup code"></textarea></label><button class="btn" id="b-restore">restore</button></div>
      <p class="note" id="b-note" role="status"></p>
    </details>
  </section>`;
  app.querySelectorAll('.pick').forEach(b => b.onclick = () => { const k = b.dataset.sp, i = chosen.indexOf(k);
    if (i > -1) chosen.splice(i, 1); else { chosen.push(k); if (chosen.length > 2) chosen.shift(); } keepForm(renderSetup); });
  on('surprise', () => { chosen = Object.keys(SPECIES).sort(() => Math.random() - 0.5).slice(0, 2); keepForm(renderSetup); });
  on('hatch', hatch);
  on('b-connect', async () => {
    const tok = $('b-token').value.trim(), note = $('b-note'); if (!tok) { note.textContent = 'paste a token first.'; return; }
    note.textContent = 'checking the token…';
    try { const g = new GistSync(tok); D.user = await g.whoami(); D.token = tok; D.gistId = null; saveDevice(); }
    catch (e) { note.textContent = e.message; return; }
    const r = await syncNow();
    if (r === 'changed') { renderBurrow(); refreshWeather(); say(0, 'we came all this way to see you!', 3600); }
    else note.textContent = r === 'error' ? syncMsg : `connected as ${D.user}, but there's no burrow saved yet. hatch one here and it will sync.`;
  });
  on('b-restore', () => restoreCode($('b-code').value, $('b-note')));
}
function keepForm(fn) {
  const o = $('owner')?.value, d = $('bd')?.value, m = $('bm')?.value;
  fn(); if (o != null) $('owner').value = o; if (d != null) $('bd').value = d; if (m != null) $('bm').value = m;
}
function hatch() {
  const owner = ($('owner').value || '').trim() || 'my', d = $('bd').value, m = $('bm').value;
  S = E.newBurrow({ owner, bday: d && m ? { d: +d, m: +m } : null, species: chosen, tz: TZ });
  touch();
  app.innerHTML = `<header class="top"><div><h1>your eggs are warm</h1><p class="sub">listen… something's wiggling.</p></div></header>
    <div class="stage hatching"><div class="hill back"></div><div class="hill"></div>
    <div class="eggs">${chosen.map(k => `<div class="egg">${eggArt(k)}</div>`).join('')}</div></div>`;
  setTimeout(() => app.querySelectorAll('.egg').forEach(e => e.classList.add('pop')), 1700);
  setTimeout(() => { view = 'burrow'; renderBurrow(); say(0, 'hello! i already like you.'); setTimeout(() => say(1, 'is that cheese i smell?'), 900); }, 2300);
}
function restoreCode(code, noteEl) {
  try {
    const n = E.migrate(E.decode(code)); if (!n) throw 0;
    n.updatedAt = Date.now(); S = n; E.catchUp(S, Date.now()); touch(); sel = 0; panelNote = 'burrow restored.'; view = view === 'setup' ? 'burrow' : view; renderBurrow();
  } catch { const msg = "that code didn't work. paste the whole thing, first character to last."; if (noteEl) noteEl.textContent = msg; else { panelNote = msg; update(); } }
}

/* ---------------- burrow ---------------- */
function renderBurrow() {
  if (view === 'setup') view = 'burrow';
  env = computeEnv();
  if (S) S.beings.forEach(b => { if (!outfits[b.id] || outfits[b.id].wear !== b.wear) { const o = O.pickOutfit(b, env.c); outfits[b.id] = { ...o, wear: b.wear }; } });
  const party = E.isBirthday(S);
  lastDecor = '';
  app.innerHTML = `
  <header class="top">
    <div><h1>${esc(S.owner)}${/s$/i.test(S.owner) ? "'" : "'s"} burrow</h1>
      <p class="sub">${S.beings.map(b => esc(E.first(b))).join(' & ')} · together since ${fmtDay(S.created)}</p></div>
    <div class="row"><span id="syncpill" class="pill"></span><button class="ghost icon" id="snd" aria-pressed="${Snd.enabled}" aria-label="${Snd.enabled ? 'turn sound off' : 'turn sound on'}">${Snd.enabled ? '🔊' : '🔇'}</button></div>
  </header>
  ${scene === 'room'
  ? `<div class="stage room ${party ? 'party' : ''}" id="stage" data-phase="day">${R.roomHTML(S, { arranging, pick: pickSlot, draw: drawBeing })}
      <button class="wxchip" id="wxchip" aria-label="weather and time of day"></button>
      <button class="doorbtn" id="go-out">🚪 outside</button>
      <button class="snap" id="snap" aria-label="take a photo">📷</button>
    </div>`
  : `<div class="stage ${party ? 'party' : ''}" id="stage" data-phase="day">
    <div class="sky-dim"></div><div class="rainbow" aria-hidden="true"></div><div id="orb" class="orb"></div><div class="horizon" data-hz="${HZ.horizonOf(S).kind}">${HZ.horizonSVG(HZ.horizonOf(S))}</div><div class="glare" aria-hidden="true"></div>
    <div class="hill back"></div><button class="door" id="go-in" aria-label="go inside the burrow"><i></i></button><div class="hill"></div>
    <div class="grass" aria-hidden="true">${Array.from({ length: 9 }, (_, i) => `<i style="left:${4 + i * 11.5}%;animation-delay:-${(i * 0.37).toFixed(2)}s"></i>`).join('')}</div><div class="garden-hill" id="garden-hill"></div><div class="frost" aria-hidden="true"></div><div class="shimmer" aria-hidden="true"></div>
    <div class="decor" id="decor"></div>
    <span class="flower" style="left:6%"></span><span class="flower blue" style="left:16%;bottom:30px"></span><span class="flower" style="right:24%;bottom:26px"></span>
    <button class="wxchip" id="wxchip" aria-label="weather and time of day"></button>
    <button class="doorbtn corner" id="go-in2">🏠 inside</button>
    <button class="snap" id="snap" aria-label="take a photo">📷</button>
    ${party ? `<div class="banner">🎂 happy birthday, ${esc(S.owner)}! they knew.</div>` : seasonal().costume ? `<div class="banner">🎃 happy halloween!</div>` : ''}
    ${eggHTML()}
    <div class="beings n${S.beings.length}">${S.beings.map((b, i) => `<button class="being" data-i="${i}" aria-label="${esc(b.name)}, ${SPECIES[b.sp].label}">${drawBeing(b)}<span class="shadow"></span></button>`).join('')}</div>
  </div>`}
  <div id="below"></div>
  <nav class="tabs" id="tabs" aria-label="sections">${TABS.map(([id, e, label]) => `<button data-tab="${id}" aria-label="${label}"><span class="t-e" aria-hidden="true">${e}</span><span class="t-l">${label}</span><span class="t-badge" data-badge="${id}" hidden></span></button>`).join('')}</nav>`;
  on('gear', () => { view = view === 'settings' ? 'burrow' : 'settings'; confirmReset = false; panelNote = ''; helperNote = ''; renderBurrow(); if (view === 'settings') checkHelper(); });
  document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => goTab(b.dataset.tab));
  on('egg', hatchNewcomer);
  on('snd', () => { const v = Snd.toggle(); const b = $('snd'); b.textContent = v ? '🔊' : '🔇'; b.setAttribute('aria-pressed', v); b.setAttribute('aria-label', v ? 'turn sound off' : 'turn sound on'); Snd.ambience(env.kind, env.phase); });
  on('wxchip', () => { goTab('settings'); $('place-q')?.focus(); });
  const stage = $('stage');
  if (scene === 'hill') { fx = new WeatherFX(stage); fx.onThunder = () => setTimeout(() => Snd.play('thunder'), 600 + Math.random() * 900); } else fx = null;
  on('snap', takePhoto);
  const goIn = () => { scene = 'room'; washMode = false; spongeEl = null; Snd.play('tap'); renderBurrow(); };
  on('go-in', goIn); on('go-in2', goIn);
  on('go-out', () => { scene = 'hill'; arranging = false; pickSlot = ''; spongeEl = null; Snd.play('tap'); renderBurrow(); });
  stage.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { if (!arranging) return; pickSlot = pickSlot === b.dataset.slot ? '' : b.dataset.slot; renderBurrow(); });
  stage.querySelectorAll('.being').forEach(el => el.onclick = () => { if (!washMode) tapBeing(+el.dataset.i); });
  setupWash(stage);
  if ((party || seasonal().costume) && !sessionGet('confetti')) { confetti(); sessionSet('confetti', '1'); }
  applyEnv(); paintSync(); gardenTick(); update();
  stopLife?.(); stopLife = startLife(S.beings.length, i => { const b = S?.beings[i]; if (!b) return null; const g = genesOf(b); return { napping: b.napping, temper: P.temperamentOf(b), joy: b.joy, eyeScale: g?.eyeScale }; });
}
function sessionGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionSet(k, v) { try { sessionStorage.setItem(k, v); } catch {} }

function update() {
  if (!S || view === 'setup') return;
  const now = Date.now();
  if (scene === 'room' && S.beings.some((b, i) => { const el = beingEl(i); return el && el.classList.contains('inbed') !== !!b.napping; })) { renderBurrow(); return; }
  document.querySelectorAll('.being').forEach((el) => { const i = +el.dataset.i, b = S.beings[i]; if (!b) return;
    el.classList.toggle('selected', i === sel);
    el.classList.toggle('napping', b.napping);
    el.classList.toggle('glow', !!(b.glowUntil && b.glowUntil > now));
    el.classList.toggle('muddy', b.clean < 35);
    el.classList.toggle('worried', !b.napping && (b.full < 30 || b.clean < 30 || b.joy < 25));
    el.dataset.wear = b.wear || '';
    el.dataset.stage = E.stageOf(b);
    el.dataset.act = outfits[b.id]?.act || '';
    let z = el.querySelector('.zzz'); if (b.napping && !z) { z = document.createElement('span'); z.className = 'zzz'; z.textContent = 'z'; el.appendChild(z); } if (!b.napping && z) z.remove();
    let t = el.querySelector('.thought'); const hungry = !b.napping && b.full < 30;
    if (hungry && !t) { t = document.createElement('span'); t.className = 'thought'; t.textContent = '🧀'; el.appendChild(t); } if (!hungry && t) t.remove();
  });
  const below = $('below'); if (!below) return;
  if (view === 'settings') tab = 'settings'; else if (tab === 'settings') tab = 'hill';
  paintTabs();
  if (tab === 'settings') { below.innerHTML = settingsHTML(); wireSettings(); return; }
  const b = S.beings[sel];
  if (tab !== 'hill') { below.innerHTML = `<div class="stack">${tabBody(tab)}<p class="law"><b>nothing here ever dies.</b> forgetting just means napping, and coming back means glowing.</p></div>`; wireBelow(below, b); return; }
  below.innerHTML = `
  <div class="stack">
  ${diaryHTML()}
  <section class="tray" aria-label="tend ${esc(b.name)}">
    <div class="who"><span>tending <strong>${esc(b.name)}</strong></span><span class="hint">${washMode ? 'rub the sponge over them, or tap wash again for a gentle auto-wash' : 'tap a being to switch. keep tapping… they have a secret.'}</span></div>
    <div class="actions">
      ${b.napping ? `<button class="act wake" id="a-wake"><span class="ic">✨</span>wake ${esc(E.first(b))}</button>` : ''}
      <button class="act ${cheeseOpen ? 'on' : ''}" id="a-feed"><span class="ic">🧀</span>feed</button>
      <button class="act ${washMode ? 'on' : ''}" id="a-wash"><span class="ic">🧽</span>${washMode ? 'auto-wash' : 'wash'}</button>
      <button class="act" id="a-play"><span class="ic">🎈</span>boing</button>
      <button class="act" id="a-hug"><span class="ic">🫶</span>hug</button>
      <button class="act ${gamesOpen ? 'on' : ''}" id="a-games"><span class="ic">🎲</span>games</button>
    </div>
    ${cheeseOpen ? `<div class="cheeses">${CHEESES.map(c => `<button class="cheese" data-c="${c.id}">${c.label}</button>`).join('')}${Object.entries(GD.stock(S)).map(([k, n]) => `<button class="cheese snack" data-snack="${k}">${GD.SEEDS[k].e} ${k} ×${n}</button>`).join('')}</div>` : ''}
    ${gamesOpen ? `<div class="cheeses">${Object.entries(GAMES).map(([k, g]) => g.grownOnly && E.stageOf(b) !== 'grown'
      ? `<span class="cheese locked" title="unlocks when ${esc(E.first(b))} is grown">🔒 ${g.label}</span>`
      : `<button class="cheese" data-game="${k}">${g.icon} ${g.label}</button>`).join('')}<button class="cheese" id="play-together">🤝 play together</button></div>` : ''}
  </section>
  ${reportHTML()}
  <section class="cards">${S.beings.map((x, i) => cardHTML(x, i)).join('')}</section>
  ${friendHTML()}
  ${scene === 'room' ? roomPanelHTML() : ''}
  ${installHTML()}
  <p class="law"><b>nothing here ever dies.</b> forgetting just means napping, and coming back means glowing.</p>
  </div>`;
  wireBelow(below, b);
}

function wireBelow(below, b) {
  on('a-wake', () => care(sel, (s, x, now) => E.wake(s, x, now, D.dev), () => { sparkle(sel); say(sel, E.rand(P.T(S.beings[sel]).wake)); }));
  on('diary-close', () => { DIARY = null; try { localStorage.removeItem('pebble-burrow-diary'); } catch {} update(); });
  on('rep-toggle', () => { reportOpen = !reportOpen; try { localStorage.setItem('pebble-burrow-report', reportOpen ? '1' : '0'); } catch {} update(); });
  on('rep-town', () => { goTab('settings'); $('place-q')?.focus(); });
  on('a-feed', () => { cheeseOpen = !cheeseOpen; gamesOpen = false; washMode = false; update(); });
  on('play-together', () => { gamesOpen = false; together(true); });
  on('a-games', () => { gamesOpen = !gamesOpen; cheeseOpen = false; washMode = false; update(); });
  below.querySelectorAll('[data-game]').forEach(g => g.onclick = () => startGame(g.dataset.game));
  on('a-wash', () => { if (washMode) autoWash(); else { washMode = true; cheeseOpen = false; showSponge(); update(); } });
  on('a-play', () => act('play')); on('a-hug', () => act('hug'));
  on('i-install', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; update(); });
  on('album-more', () => { albumAll = !albumAll; update(); });
  on('pc-write', writePostcard);
  on('mail-more', () => { mailAll = !mailAll; update(); });
  on('mail-open', () => { D.mailSeen = Date.now(); saveDevice(); update(); });
  below.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { const h = parseHelper(S.helper); try { await mailAction(h, 'delete', { id: b.dataset.del }); MB.cards = MB.cards.filter(c => c.id !== b.dataset.del); } catch (e) { mbErr = e.message; } update(); });
  below.querySelectorAll('[data-req]').forEach(b => b.onclick = async () => { const h = parseHelper(S.helper), [act, sid] = b.dataset.req.split(':');
    try { await mailAction(h, act, { sid }); const r = MB.requests.find(x => x.sid === sid); if (act === 'approve' && r) E.setFriend(S, r.reply, r.name); await loadMail(true); touch(); } catch (e) { mbErr = e.message; } update(); });
  below.querySelectorAll('[data-photo]').forEach(b => b.onclick = () => viewPhoto(b.dataset.photo));
  on('arrange', () => { arranging = !arranging; pickSlot = ''; renderBurrow(); });
  below.querySelectorAll('[data-place]').forEach(p => p.onclick = () => { R.place(S, pickSlot, p.dataset.place); pickSlot = ''; Snd.play('tap'); touch(); renderBurrow();
    const i = S.beings.findIndex(b => !b.napping); if (i > -1 && p.dataset.place) setTimeout(() => say(i, E.rand(['ooh, that looks nice there', 'cosy!', 'i like it here more every day'])), 300); });
  below.querySelectorAll('[data-c]').forEach(c => c.onclick = () => feed(c.dataset.c));
  below.querySelectorAll('[data-snack]').forEach(c => c.onclick = () => feedSnack(c.dataset.snack));
  below.querySelectorAll('[data-plant]').forEach(b => b.onclick = () => { const [i, seed] = b.dataset.plant.split(':'); GD.plant(S, +i, seed); plantPick = -1; Snd.play('tap'); touch(); paintGarden(); update(); });
  below.querySelectorAll('[data-plot]').forEach(b => b.onclick = () => { plantPick = plantPick === +b.dataset.plot ? -1 : +b.dataset.plot; update(); });
  below.querySelectorAll('[data-water]').forEach(b => b.onclick = () => { if (GD.water(S, +b.dataset.water, Date.now())) { Snd.play('bubble'); setTimeout(() => Snd.play('bubble'), 120); const i = S.beings.findIndex(x => !x.napping); if (i > -1) say(i, E.rand(['glug glug, little plants', 'i\u2019m helping! (i\u2019m watching)', 'grow, friends, grow'])); touch(); paintGarden(); update(); } });
  below.querySelectorAll('[data-harvest]').forEach(b => b.onclick = () => pickPlot(+b.dataset.harvest));
  below.querySelectorAll('.card').forEach(c => c.onclick = e => { if (e.target.closest('button,input')) return; sel = +c.dataset.i; update(); });
  below.querySelectorAll('[data-rename]').forEach(r => r.onclick = () => { renaming = +r.dataset.rename; wearing = -1; update(); const inp = $('rn'); inp?.focus(); inp?.select(); });
  below.querySelectorAll('[data-wearing]').forEach(r => r.onclick = () => { wearing = wearing === +r.dataset.wearing ? -1 : +r.dataset.wearing; renaming = -1; update(); });
  below.querySelectorAll('[data-wear]').forEach(w => w.onclick = () => { const i = +w.closest('.card').dataset.i, x = S.beings[i];
    E.setWear(S, x, w.dataset.wear === x.wear ? '' : w.dataset.wear); touch(); update(); if (x.wear) say(i, E.rand(['do i look fancy?', 'i feel very important now', 'is it on straight?'])); });
  const rf = $('rnf'); if (rf) rf.onsubmit = e => { e.preventDefault(); const v = $('rn').value.trim(); if (v) E.rename(S, S.beings[renaming], v.slice(0, 32)); renaming = -1; touch(); renderBurrow(); };
  on('rnx', () => { renaming = -1; update(); });
}

const TABS = [['hill', '🏡', 'hill'], ['garden', '🌱', 'garden'], ['album', '📖', 'album'], ['post', '💌', 'post'], ['settings', '⚙️', 'settings']];
let tab = (() => { try { const t = localStorage.getItem('pebble-burrow-tab'); return TABS.some(x => x[0] === t) && t !== 'settings' ? t : 'hill'; } catch { return 'hill'; } })();
function goTab(t) {
  const was = view;
  tab = t; view = t === 'settings' ? 'settings' : 'burrow';
  cheeseOpen = gamesOpen = false; confirmReset = false; panelNote = ''; helperNote = '';
  try { localStorage.setItem('pebble-burrow-tab', t); } catch {}
  if (t === 'settings' && was !== 'settings') checkHelper();
  if (t === 'post') { loadMail(true); }
  update();
  $('below')?.scrollIntoView?.({ block: 'nearest' });
  Snd.play('tap');
}
function paintTabs() {
  document.querySelectorAll('[data-tab]').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  const badge = (id, n) => { const el = document.querySelector(`[data-badge="${id}"]`); if (!el) return; el.hidden = !n; el.textContent = n > 9 ? '9+' : String(n || ''); };
  badge('garden', (S.garden || []).filter(p => p.seed && p.growth >= 1).length);
  badge('post', MB ? MB.cards.filter(c => c.t > (D.mailSeen || 0)).length + MB.requests.length : 0);
  badge('hill', DIARY?.entries?.length && tab !== 'hill' ? 1 : 0);
}
function tabBody(t) {
  if (t === 'garden') return gardenHTML();
  if (t === 'post') return postHTML();
  if (t === 'album') return `${albumHTML()}${photosHTML()}${visitorBookHTML()}
    <section class="feasts"><div class="row between"><h2>the feast book</h2><span class="hint">${S.beings.reduce((a, x) => a + E.count(x, 'feasts'), 0)} feasts kept</span></div>
    ${S.log.length ? `<ol>${S.log.slice(0, 12).map(l => `<li><span>${l.by ? `<b class="by">${esc(l.by)}</b> fed ${esc(E.first({ name: l.n }))} ${esc(l.c)}` : `${esc(E.first({ name: l.n }))} had ${esc(l.c)}`}</span><span>${fmtAgo(l.t)}</span></li>`).join('')}</ol>` : `<p class="hint">no feasts yet. tap feed on the hill and pick a cheese, the first one goes in the book.</p>`}</section>`;
  return '';
}

function cardHTML(b, i) {
  const m = E.mood(b, { phase: env.phase });
  const st = E.stageOf(b), nx = E.nextStage(b), unlocked = E.unlockedWear(S, b);
  const bar = (k, lab) => `<div class="stat"><span>${lab}</span><div class="bar ${k}" role="meter" aria-label="${lab}" aria-valuenow="${Math.round(b[k])}" aria-valuemin="0" aria-valuemax="100"><i style="width:${b[k]}%"></i></div></div>`;
  const stageLine = `<span class="stage-tag ${st}">${STAGES.find(x => x.id === st).label}</span><span class="meta">${nx ? `${nx.in} more tended day${nx.in === 1 ? '' : 's'} to ${nx.id}` : `tended ${b.days.length} days`}</span>`;
  return `<article class="card ${i === sel ? 'sel' : ''}" data-i="${i}">
    <div class="nm">${renaming === i ? `<form class="rename" id="rnf"><input id="rn" value="${esc(b.name)}" maxlength="32" aria-label="new name"><button class="ghost">save</button><button type="button" class="ghost" id="rnx">✕</button></form>` : `<h3>${esc(b.name)}</h3><span class="chip ${m.k}">${m.t}</span>`}</div>
    <div class="row grow-row">${stageLine}</div>
    <p class="persona"><span class="temper ${P.temperamentOf(b)}">${P.profile(S, b)[0]}</span><span class="meta">${P.profile(S, b).slice(1).map(esc).join(' · ')}</span></p>
    ${bar('full', 'tummy')}${bar('clean', 'sparkle')}${bar('joy', 'joy')}
    ${wearing === i ? `<div class="wears">${WEARABLES.map(w => unlocked[w.id]
      ? `<button class="wear ${b.wear === w.id ? 'on' : ''}" data-wear="${w.id}">${w.label}</button>`
      : `<span class="wear locked" title="${esc(w.hint)}">🔒 ${w.label}<small>${esc(w.hint)}</small></span>`).join('')}</div>` : ''}
    <div class="row between"><span class="meta">${SPECIES[b.sp].label} · ${E.count(b, 'feasts')} feasts · ${E.count(b, 'hugs')} hugs · ${E.count(b, 'boings')} boings</span>
      ${renaming === i ? '' : `<span class="row tight"><button class="linkbtn" data-wearing="${i}">${wearing === i ? 'done' : 'dress up'}</button><button class="linkbtn" data-rename="${i}">rename</button></span>`}</div>
  </article>`;
}

/* ---------------- postcards ---------------- */
function postHTML() {
  const h = parseHelper(S.helper);
  if (!h) return `<section class="feasts mail"><div class="row between"><h2>postcards</h2></div><p class="hint">postcards travel through your helper. set it up in settings → nudges & AI visitor, then friends can write to you.</p></section>`;
  if (!MB) return `<section class="feasts mail"><div class="row between"><h2>postcards</h2></div><p class="hint">${mbErr ? esc(mbErr) : 'checking the mailbox…'}</p></section>`;
  if (!MB.address) return `<section class="feasts mail"><div class="row between"><h2>postcards</h2></div><p class="hint">your helper needs a quick update for postcards: in the worker folder, run <code>node setup.mjs</code> again.</p></section>`;
  const fresh = MB.cards.filter(c => c.t > (D.mailSeen || 0)).length, shown = mailAll ? MB.cards : MB.cards.slice(0, 3);
  return `<section class="feasts mail"><div class="row between"><h2>postcards ${fresh ? `<span class="badge">${fresh} new</span>` : ''}</h2><button class="btn" id="pc-write">💌 write one</button></div>
    ${MB.requests.map(r => `<div class="request"><span><strong>${esc(r.name)}</strong> wants to send you postcards${r.waiting ? ` (${r.waiting} waiting)` : ''}</span><span class="row tight"><button class="btn" data-req="approve:${esc(r.sid)}">say yes</button><button class="linkbtn" data-req="block:${esc(r.sid)}">no thanks</button></span></div>`).join('')}
    ${MB.cards.length ? `<div class="postcards">${shown.map(c => Post.cardHTML(c)).join('')}</div>
      ${MB.cards.length > 3 ? `<button class="linkbtn" id="mail-more">${mailAll ? 'show fewer' : `show all ${MB.cards.length}`}</button>` : ''}
      ${fresh ? `<button class="linkbtn" id="mail-open">mark as read</button>` : ''}`
      : `<p class="hint">no postcards yet. give friends your mailbox address from settings, or write to someone first.</p>`}
    ${mbErr ? `<p class="note danger">${esc(mbErr)}</p>` : ''}
  </section>`;
}

let mailAt = 0;
async function loadMail(force = false) {
  const h = parseHelper(S?.helper); if (!h) { MB = null; return; }
  if (!force && Date.now() - mailAt < 60e3) return;
  mailAt = Date.now();
  try {
    MB = await getMailbox(h); mbErr = '';
    let got = false;
    const seen = new Set();
    [...MB.cards].reverse().forEach(c => { if (seen.has(c.sid)) return; seen.add(c.sid); got = E.keepsake(S, 'post:' + c.sid, '💌', `first postcard from ${c.from.name}`, c.t) || got; });
    MB.friends.forEach(f => { if (!(S.friends || []).some(x => x.addr === f.reply)) { E.setFriend(S, f.reply, f.name); got = true; } });
    if (got) touch();
  } catch (e) { mbErr = e.message; }
  if (view === 'burrow' && !busyTyping() && !washMode) update();
}

function writePostcard(image) {
  if (!MB?.address) return;
  if (typeof image !== 'string') image = undefined;
  Post.compose({ image,
    friends: (S.friends || []).filter(f => !f.gone), beings: S.beings.map(b => ({ name: E.first(b) })), me: S.owner,
    isAddress: isMailAddress, fx: Snd,
    addFriend: (addr, name) => { E.setFriend(S, addr, name); touch(); },
    send: (card, to) => sendPostcard(to, { from: { name: S.owner, reply: MB.address, burrow: `${S.owner}${/s$/i.test(S.owner) ? "'" : "'s"} burrow` }, ...card })
  });
}

function roomPanelHTML() {
  const have = R.unlocked(S), all = Object.keys(R.FURNITURE);
  const slot = pickSlot && R.SLOTS[pickSlot], current = pickSlot && S.room?.[pickSlot]?.item;
  return `<section class="feasts roompanel"><div class="row between"><h2>the burrow</h2><button class="btn" id="arrange">${arranging ? 'done arranging' : 'arrange the room'}</button></div>
    ${arranging ? (slot ? `<p class="hint">choose something for the <strong>${slot.label}</strong>:</p>
      <div class="cheeses">${have.filter(id => R.fits(id, pickSlot)).map(id => `<button class="cheese ${current === id ? 'on' : ''}" data-place="${id}">${R.FURNITURE[id].e} ${R.FURNITURE[id].label}</button>`).join('') || '<span class="hint">nothing in your collection fits here yet.</span>'}
      ${current ? `<button class="cheese" data-place="">clear it</button>` : ''}</div>`
      : `<p class="hint">tap a dotted spot in the room to put something there.</p>`) : `<p class="hint">napping beings sleep in the bed. grown beings pick a favourite spot once their kind of thing is in the room.</p>`}
    <p class="collection">${all.map(id => have.includes(id) ? `<span title="${R.FURNITURE[id].label}">${R.FURNITURE[id].e}</span>` : `<span class="locked" title="${esc(R.FURNITURE[id].label)}: ${esc(R.FURNITURE[id].hint)}">🔒</span>`).join('')}
      <span class="hint">${have.length} of ${all.length} collected</span></p>
    ${have.length < all.length ? `<details><summary class="hint">how to find the rest</summary><ul class="hints">${all.filter(id => !have.includes(id)).map(id => `<li>${esc(R.FURNITURE[id].label)}: ${esc(R.FURNITURE[id].hint)}</li>`).join('')}</ul></details>` : ''}
  </section>`;
}

function albumHTML() {
  const items = [...S.album].reverse(), shown = albumAll ? items : items.slice(0, 5);
  return `<section class="feasts album"><div class="row between"><h2>the album</h2><span class="hint">${S.album.length} keepsake${S.album.length === 1 ? '' : 's'}</span></div>
    <ol>${shown.map(k => `<li><span><span class="emo" aria-hidden="true">${k.e}</span>${esc(k.text)}</span><span>${fmtDay(k.t)}</span></li>`).join('')}</ol>
    ${items.length > 5 ? `<button class="linkbtn" id="album-more">${albumAll ? 'show fewer' : `show all ${items.length}`}</button>` : ''}</section>`;
}

function installHTML() {
  if (standalone()) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<section class="install"><strong>keep it on your home screen</strong>
    ${installEvt ? `<button class="btn" id="i-install">install pebble burrow</button>`
      : `<span class="hint">${ios ? 'in Safari, tap Share, then “Add to Home Screen”.' : 'in your browser menu, choose “Install app” or “Add to Home screen”.'} it opens full screen, works offline, and can send nudges.</span>`}</section>`;
}

/* ---------------- actions ---------------- */
const beingEl = i => document.querySelector(`.being[data-i="${i}"]`);
function anim(i, cls) { const el = beingEl(i); if (!el) return; el.classList.remove('boing', 'squish', 'munch'); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 1000); }

/** Run one care action: catch up first so stats are current, act, record growth, save, sync. */
function care(i, fn, after) {
  const now = Date.now();
  E.catchUp(S, now, mult());
  const res = fn(S, S.beings[i], now);
  if (res === false) return false;
  const grew = E.checkGrowth(S, now);
  touch(); update();
  after?.();
  grew.forEach(({ b, stage }, k) => setTimeout(() => { const j = S.beings.indexOf(b); fx_(j, stage === 'grown' ? '🌳' : '🌱', 3); Snd.play('grow'); say(j, stage === 'grown' ? 'i’m all grown! (still small though)' : 'i think i grew a little!', 4200); }, 1400 + k * 600));
  return true;
}
function feed(cid) {
  const b = S.beings[sel], c = CHEESES.find(x => x.id === cid);
  if (b.napping) care(sel, (s, x, now) => E.wake(s, x, now, D.dev), () => sparkle(sel));
  if (b.full >= 96) { cheeseOpen = false; update(); say(sel, 'so full. saving room for tomorrow.'); return; }
  cheeseOpen = false;
  care(sel, (s, x, now) => E.feed(s, x, c, now, D.dev), () => {
    anim(sel, 'munch'); flash(sel, 'happy', 1800); fx_(sel, '🧀', 1); Snd.play('munch'); Snd.buzz([8, 60, 8, 60, 8]);
    setTimeout(() => { fx_(sel, '💛', 3); say(sel, P.feedLine(S, S.beings[sel], cid === 'crumb' ? 'a tiny crumb' : cid)); }, 1000);
  });
}
function act(kind) {
  const b = S.beings[sel];
  if (b.napping) { say(sel, 'zzz… (wake me first?)'); return; }
  if (kind === 'play') care(sel, (s, x, now) => E.play(s, x, now, D.dev), () => {
    anim(sel, 'boing'); flash(sel, 'surprised', 700); Snd.play('boing'); Snd.buzz([15, 300, 25]); setTimeout(() => fx_(sel, env.kind === 'snow' ? '❄️' : '✨', 2), 450);
    say(sel, env.kind === 'snow' ? 'boing in the SNOW' : env.kind === 'rain' ? 'puddle boing!' : env.sea.costume ? 'spooky boing!' : E.rand(P.T(S.beings[sel]).boing)); });
  if (kind === 'hug') care(sel, (s, x, now) => E.hug(s, x, now, D.dev), () => {
    anim(sel, 'squish'); flash(sel, 'happy', 1800); fx_(sel, '💗', 3); Snd.play('hug'); Snd.buzz([40]); say(sel, env.kind === 'storm' ? 'safe now.' : E.rand(P.T(S.beings[sel]).hug)); });
}
function startGame(kind) {
  const i = sel, b = S.beings[i];
  gamesOpen = false;
  if (b.napping) { say(i, 'zzz… (wake me first?)'); update(); return; }
  if (b.full < 10) { say(i, 'too hungry to play… snack first?'); update(); return; }
  update();
  openGame(kind, { being: { name: E.first(b), art: drawBeing(b).replace('<svg ', `<svg data-wear="${b.wear || ''}" `) },
    fx: { play: Snd.play, buzz: Snd.buzz },
    done: score => {
      let joy = 0;
      care(i, (s, x, now) => { joy = E.playedGame(s, x, kind, score, now, D.dev).joy; }, () => { fx_(i, '🎉', 2); say(i, score >= 8 ? 'again! again!' : E.rand(P.T(S.beings[i]).boing)); });
      return `${E.first(b)}\u2019s joy +${joy}`;
    } });
}

function tapBeing(i) {
  if (sel !== i) { sel = i; cheeseOpen = false; update(); return; }
  const b = S.beings[i]; b.taps = (b.taps || 0) + 1;
  if (b.napping) say(i, 'zzz…');
  else if (b.taps % 7 === 0) { say(i, SPECIES[b.sp].secret, 5200); flash(i, 'happy', 2000); fx_(i, '🤫', 1); Snd.play('secret'); }
  else { anim(i, 'squish'); Snd.play('tap'); Snd.buzz([6]); if (b.taps % 7 === 5) say(i, 'hehe… keep going'); else if (env.sea.costume && b.taps % 7 === 2) say(i, E.rand(SEASON_LINES.costume)); }
  saveLocal();
}

/* ---------------- wash ---------------- */
let spongeEl = null;
function showSponge() { const st = $('stage'); if (!st || spongeEl) return; spongeEl = document.createElement('div'); spongeEl.className = 'sponge'; spongeEl.style.left = (st.clientWidth * 0.5) + 'px'; spongeEl.style.top = '40px'; st.appendChild(spongeEl); }
function hideSponge() { spongeEl?.remove(); spongeEl = null; washMode = false; }
function scrubOne(i, amt) {
  const b = S.beings[i];
  if (b.napping) care(i, (s, x, now) => E.wake(s, x, now, D.dev), () => sparkle(i));
  if (E.scrub(S, b, amt, Date.now())) {
    hideSponge(); E.checkGrowth(S); fx_(i, '✨', 3); say(i, E.rand(['squeaky!', 'i feel like a brand new pebble', 'sparkly sparkly'])); touch(); update();
  }
}
function setupWash(stage) {
  let down = false, last = 0;
  stage.addEventListener('pointerdown', e => { if (!washMode) return; down = true; move(e); });
  stage.addEventListener('pointerup', () => { if (down) { down = false; touch(); update(); } });
  stage.addEventListener('pointerleave', () => down = false);
  stage.addEventListener('pointermove', e => { if (washMode) move(e); });
  function move(e) {
    if (!spongeEl) return; const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    spongeEl.style.left = x + 'px'; spongeEl.style.top = y + 'px';
    if (!down && e.pointerType !== 'mouse') return;
    const now = performance.now(); if (now - last < 60) return; last = now;
    document.querySelectorAll('.being').forEach((el, i) => { const br = el.getBoundingClientRect();
      if (e.clientX > br.left && e.clientX < br.right && e.clientY > br.top && e.clientY < br.bottom) { sel = i; bubble(x, y); scrubOne(i, 2.2); } });
  }
}
function autoWash() {
  const st = $('stage'), el = beingEl(sel); if (!st || !el) return; showSponge();
  const r = st.getBoundingClientRect(), br = el.getBoundingClientRect(), i = sel; let t = 0;
  E.catchUp(S, Date.now(), mult());
  const iv = setInterval(() => { t++; if (!spongeEl) { clearInterval(iv); return; }
    const x = br.left - r.left + br.width * (0.5 + 0.32 * Math.sin(t / 3)), y = br.top - r.top + br.height * (0.45 + 0.18 * Math.cos(t / 5));
    spongeEl.style.left = x + 'px'; spongeEl.style.top = y + 'px'; bubble(x, y); scrubOne(i, 4);
    if (t > 40) { clearInterval(iv); hideSponge(); touch(); update(); } }, 70);
}

/* ---------------- effects ---------------- */
function fx_(i, ch, n) { const st = $('stage'), el = beingEl(i); if (!st || !el) return; const r = st.getBoundingClientRect(), br = el.getBoundingClientRect();
  for (let k = 0; k < n; k++) { const s = document.createElement('span'); s.className = 'fx'; s.textContent = ch; s.style.left = (br.left - r.left + br.width * (0.3 + Math.random() * 0.4)) + 'px'; s.style.top = (br.top - r.top + 10) + 'px'; s.style.animationDelay = (k * 0.18) + 's'; st.appendChild(s); setTimeout(() => s.remove(), 1900); } }
let lastBubble = 0;
function bubble(x, y) { if (Date.now() - lastBubble > 140) { lastBubble = Date.now(); Snd.play('bubble'); } const st = $('stage'); const s = document.createElement('span'); s.className = 'bubble'; s.style.left = (x - 7 + (Math.random() * 20 - 10)) + 'px'; s.style.top = (y - 7) + 'px'; st.appendChild(s); setTimeout(() => s.remove(), 1300); }
function sparkle(i) { update(); fx_(i, '✨', 4); Snd.play('sparkle'); Snd.buzz([10, 40, 10]); }
function say(i, txt, ms = 2600) { const el = beingEl(i); if (!el) return; if (S?.beings[i]) Snd.play('chirp', { pitch: Snd.voiceOf(S.beings[i].sp) }); el.querySelector('.say')?.remove(); const b = document.createElement('span'); b.className = 'say'; b.textContent = txt; el.appendChild(b); setTimeout(() => b.remove(), ms); }
function confetti() { const st = $('stage'); const cols = seasonal().costume ? ['#f08a24', '#6b3fa0', '#2b2230', '#f6cf4f'] : ['#f2c94c', '#e57fa8', '#7fb8d6', '#86c46f'];
  for (let k = 0; k < 40; k++) { const c = document.createElement('span'); c.className = 'confetti'; c.style.left = Math.random() * 100 + '%'; c.style.background = E.rand(cols); c.style.animationDelay = (Math.random() * 1.2) + 's'; st.appendChild(c); setTimeout(() => c.remove(), 4200); } }

/* ---------------- settings ---------------- */
async function checkHelper() {
  const h = parseHelper(S.helper); if (!h) { helperOk = null; return; }
  loadMail(true);
  try { await helperStatus(h); helperOk = true; } catch (e) { helperOk = false; helperNote = e.message; }
  try { nudgesOn = !!(await currentSubscription()); } catch { nudgesOn = false; }
  if (view === 'settings' && !busyTyping()) update();
}

function settingsHTML() {
  const sun = env.sun || {}, h = parseHelper(S.helper), sup = pushSupport();
  return `<div class="stack">
  <section class="panel">
    <h2>you</h2>
    <div class="row">
      <label class="field grow">your name<input id="s-owner" value="${esc(S.owner)}" maxlength="24"></label>
      <label class="field">birthday day<select id="s-bd"><option value="">–</option>${Array.from({ length: 31 }, (_, i) => `<option ${S.bday && S.bday.d === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
      <label class="field">month<select id="s-bm"><option value="">–</option>${MONTHS.map((m, i) => `<option value="${i + 1}" ${S.bday && S.bday.m === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <button class="btn" id="s-save">save</button>
    </div>
    ${Snd.canBuzz() ? `<label class="check"><input type="checkbox" id="s-haptics" ${Snd.haptics ? 'checked' : ''}> little vibrations when you feed, hug and boing</label>` : `<p class="hint">this device doesn\u2019t allow websites to vibrate, so it\u2019s sound only here.</p>`}
  </section>

  <section class="panel">
    <h2>sky & weather</h2>
    <p class="hint">the sky follows real sunrise and sunset. add your town and the hill gets your actual weather too, refreshed every 30 minutes.</p>
    ${S.place ? `<p class="place-now">📍 <strong>${esc(S.place.name)}</strong>${S.place.region ? ' · ' + esc(S.place.region) : ''} · sunrise ${fmtClock(sun.rise)} · sunset ${fmtClock(sun.set)}${env.wx ? ` · ${KIND_LABEL[env.kind]}, ${env.wx.temp}°${S.units}` : ''}</p>` : ''}
    <form class="row" id="place-form"><label class="field grow">find your town<input id="place-q" placeholder="e.g. Hillsboro" autocomplete="off"></label><button class="btn">search</button><button type="button" class="btn" id="place-me">📍 use my location</button></form>
    ${placeBusy ? `<p class="hint">looking…</p>` : ''}
    ${placeResults.length ? `<div class="results">${placeResults.map((p, i) => `<button class="result" data-p="${i}"><strong>${esc(p.name)}</strong> <span class="muted">${esc(p.region)}</span></button>`).join('')}</div>` : ''}
    <div class="row">
      <span class="field">temperature</span>
      <div class="seg" role="group" aria-label="temperature units"><button data-u="F" class="${S.units === 'F' ? 'on' : ''}">°F</button><button data-u="C" class="${S.units === 'C' ? 'on' : ''}">°C</button></div>
      ${S.place ? `<button class="linkbtn" id="place-clear">remove town</button>` : ''}
    </div>
  </section>

  <section class="panel">
    <h2>sync across devices</h2>
    ${D.token ? `<p class="place-now">connected${D.user ? ' as <strong>' + esc(D.user) + '</strong>' : ''} · last synced ${fmtAgo(D.lastSync)}${syncErr ? ` · <span class="danger">${esc(syncMsg)}</span>` : ''}</p>
      <div class="row"><button class="btn" id="sy-now">sync now</button><button class="btn" id="sy-off">disconnect this device</button></div>
      <p class="hint">changes from every device are merged, so care done on two devices at once all counts. on another device, choose “already have a burrow?” and paste the same token.</p>`
    : `<p class="hint">your burrow is saved in a secret gist on your GitHub account, so any device with the same token gets the same beings. one-time setup, about a minute:</p>
      <ol class="steps">
        <li>open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → new fine-grained token</a></li>
        <li>name it “pebble burrow”, pick an expiration, and under <em>Account permissions</em> set <strong>Gists</strong> to <strong>Read and write</strong>. nothing else.</li>
        <li>generate, copy, and paste it here.</li>
      </ol>
      <div class="row"><label class="field grow">GitHub token<input id="sy-token" type="password" placeholder="github_pat_…" autocomplete="off"></label><button class="btn" id="sy-connect">connect</button></div>
      <p class="hint">the token stays on this device. it is never put into the save or sent anywhere except GitHub.</p>`}
  </section>

  <section class="panel">
    <h2>nudges & AI visitor</h2>
    ${h ? `<p class="place-now">helper ${helperOk === true ? '<span class="okdot">connected</span>' : helperOk === false ? '<span class="danger">not answering</span>' : 'checking…'}</p>
      <div class="row">
        ${!sup.ok ? `<p class="hint">${esc(sup.why)}</p>` : nudgesOn
          ? `<button class="btn" id="n-test">send a test nudge</button><button class="btn" id="n-off">turn off nudges on this device</button>`
          : `<button class="btn" id="n-on">🔔 turn on nudges here</button>`}
      </div>
      <p class="hint">up to 4 gentle nudges a day, never between 10pm and 7am, and never while you’re already tending them.</p>
      <div class="field">AI visitor address (custom connector)
        <div class="row"><input id="n-mcp" readonly value="${esc(h.mcp)}"><button class="btn" id="n-copy">copy</button></div></div>
      <p class="hint">in claude.ai: settings → connectors → add custom connector, name it “Pebble Burrow”, paste this address. your Claude can then peek, feed, hug and wake. it signs the feast book when it visits. keep this address private, it works like a key.</p>
      ${MB?.address ? `<div class="field">your postcard mailbox (fine to give to friends)
        <div class="row"><input id="n-mail" readonly value="${esc(MB.address)}"><button class="btn" id="n-mcopy">copy</button></div></div>
      <p class="hint">this address can only receive postcards. new senders wait until you say yes.</p>` : ''}
      ${(S.friends || []).filter(f => !f.gone).length ? `<div class="field">friends you write to<ul class="friends">${S.friends.filter(f => !f.gone).map(f => `<li><span>${esc(f.name)}</span><button class="linkbtn" data-unfriend="${esc(f.addr)}">remove</button></li>`).join('')}</ul></div>` : ''}
      ${MB?.blocked?.length ? `<div class="field">said no to<ul class="friends">${MB.blocked.map(f => `<li><span>${esc(f.name)}</span><button class="linkbtn" data-unblock="${esc(f.sid)}">let them ask again</button></li>`).join('')}</ul></div>` : ''}
      <div class="row"><button class="linkbtn" id="n-forget">use a different helper</button></div>`
    : `<p class="hint">nudges and the AI visitor run on a small free helper in your own Cloudflare account. the repo’s <strong>worker/README.md</strong> sets it up in three commands. it prints a <em>helper link</em>; paste it here once and every synced device gets it.</p>
      <div class="row"><label class="field grow">helper link<input id="n-link" placeholder="https://pebble-burrow-helper.….workers.dev/k/…" autocomplete="off"></label><button class="btn" id="n-save">connect</button></div>`}
    ${helperNote ? `<p class="note" role="status">${esc(helperNote)}</p>` : ''}
  </section>

  <section class="panel">
    <h2>your horizon</h2>
    <p class="place-now">in the distance: <strong>${HZ.HORIZONS[HZ.horizonOf(S).kind].label}</strong></p>
    ${HZ.horizonOf(S).rerolled ? '<p class="hint">you\u2019ve used your one re-roll. this view is yours now.</p>' : '<div class="row"><button class="btn" id="hz-reroll">try a different view (once)</button></div><p class="hint">every burrow gets its own view. you can swap it once, and the new one stays.</p>'}
  </section>

  <section class="panel">
    <h2>backup code</h2>
    <p class="hint">a copy of your whole burrow as text. handy without sync, or as an extra safety net.</p>
    <textarea id="s-code" readonly>${E.encode(S)}</textarea>
    <div class="row"><button class="btn" id="s-copy">copy code</button></div>
    <label class="field">restore from a code<textarea id="s-in" placeholder="paste a backup code here"></textarea></label>
    <div class="row"><button class="btn" id="s-restore">restore burrow</button></div>
  </section>

  <section class="panel">
    <div class="row">${confirmReset ? `<span class="note danger">start over with new eggs? this replaces the burrow on every synced device.</span><button id="s-yes" class="btn danger">yes, start over</button><button id="s-no" class="btn">keep my burrow</button>` : `<button id="s-reset" class="btn danger">start a new burrow</button>`}</div>
    ${panelNote ? `<p class="note" role="status">${esc(panelNote)}</p>` : ''}
  </section>
  </div>`;
}

function setPlace(p) { E.setField(S, 'place', { name: p.name, region: p.region || '', lat: p.lat, lon: p.lon }); placeResults = []; touch(); refreshWeather(true).then(() => { applyEnv(); update(); }); applyEnv(); update(); }

function wireSettings() {
  on('s-save', () => { E.setField(S, 'owner', $('s-owner').value.trim() || S.owner); const d = $('s-bd').value, m = $('s-bm').value; E.setField(S, 'bday', d && m ? { d: +d, m: +m } : null); touch(); panelNote = 'saved.'; renderBurrow(); });
  const hp = $('s-haptics'); if (hp) hp.onchange = () => Snd.setHaptics(hp.checked);
  const pf = $('place-form');
  if (pf) pf.onsubmit = async e => { e.preventDefault(); const q = $('place-q').value.trim(); if (!q) return;
    placeBusy = true; update();
    try { placeResults = await searchPlaces(q); panelNote = placeResults.length ? '' : `no town called “${q}” found. try adding a state or country.`; }
    catch { panelNote = 'place search needs a connection. try again when you’re online.'; }
    placeBusy = false; update(); };
  on('place-me', async () => { placeBusy = true; update();
    try { setPlace(await locateMe()); panelNote = ''; } catch (err) { panelNote = err.message + '. you can search for your town instead.'; }
    placeBusy = false; update(); });
  document.querySelectorAll('.result').forEach(b => b.onclick = () => setPlace(placeResults[+b.dataset.p]));
  document.querySelectorAll('.seg [data-u]').forEach(b => b.onclick = () => { E.setField(S, 'units', b.dataset.u); touch(); refreshWeather(true).then(() => update()); update(); });
  on('place-clear', () => { E.setField(S, 'place', null); W = null; ls.del(K.wx); touch(); applyEnv(); update(); });

  on('sy-connect', async () => { const tok = $('sy-token').value.trim(); if (!tok) return;
    panelNote = 'checking the token…'; update();
    try { const g = new GistSync(tok); D.user = await g.whoami(); D.token = tok; D.gistId = null; saveDevice(); }
    catch (e) { panelNote = e.message; update(); return; }
    const r = await syncNow();
    panelNote = r === 'changed' ? 'merged with your burrow from another device.' : r === 'error' ? syncMsg : 'connected. this burrow now syncs.';
    r === 'changed' ? renderBurrow() : update(); });
  on('sy-now', async () => { const r = await syncNow(); panelNote = r === 'changed' ? 'brought in changes from another device.' : r === 'error' ? syncMsg : 'all synced.'; r === 'changed' ? renderBurrow() : update(); });
  on('sy-off', () => { D = { token: '', gistId: null, lastSync: 0, user: '', dev: D.dev }; saveDevice(); panelNote = 'this device is disconnected. your saved gist is untouched.'; paintSync(); update(); });

  on('n-save', async () => { const link = $('n-link').value.trim(), h = parseHelper(link);
    if (!h) { helperNote = 'that doesn’t look like a helper link. it ends in /k/ followed by a long key.'; update(); return; }
    helperNote = 'checking the helper…'; update();
    try { await helperStatus(h); } catch (e) { helperNote = e.message; update(); return; }
    E.setField(S, 'helper', link); touch(); helperOk = true; loadMail(true); helperNote = 'helper connected. turn on nudges on each device you want them on.'; update(); });
  on('n-on', async () => { const h = parseHelper(S.helper);
    helperNote = 'asking for permission…'; update();
    try { await enableNudges(h, navigator.userAgent.slice(0, 80)); nudgesOn = true; helperNote = 'nudges are on for this device.'; }
    catch (e) { helperNote = e.message; }
    update(); });
  on('n-off', async () => { await disableNudges(parseHelper(S.helper)); nudgesOn = false; helperNote = 'nudges are off for this device.'; update(); });
  on('n-test', async () => { try { const r = await testNudge(parseHelper(S.helper)); helperNote = r.sent ? 'sent. it should arrive in a few seconds.' : 'the helper has no devices to nudge yet.'; } catch (e) { helperNote = e.message; } update(); });
  on('n-copy', () => copyField('n-mcp', 'address copied.', m => helperNote = m));
  on('n-mcopy', () => copyField('n-mail', 'mailbox address copied. send it to a friend.', m => helperNote = m));
  document.querySelectorAll('[data-unfriend]').forEach(b => b.onclick = () => { const f = S.friends.find(x => x.addr === b.dataset.unfriend); E.setFriend(S, f.addr, f.name, Date.now(), true); touch(); update(); });
  document.querySelectorAll('[data-unblock]').forEach(b => b.onclick = async () => { await mailAction(parseHelper(S.helper), 'unblock', { sid: b.dataset.unblock }).catch(() => {}); await loadMail(true); update(); });
  on('n-forget', async () => { if (nudgesOn) await disableNudges(parseHelper(S.helper)).catch(() => {}); E.setField(S, 'helper', ''); touch(); helperOk = null; nudgesOn = false; helperNote = ''; update(); });

  on('s-copy', () => copyField('s-code', 'code copied.', m => panelNote = m));
  on('s-restore', () => restoreCode($('s-in').value, null));
  on('hz-reroll', () => { if (HZ.reroll(S)) { E.setField(S, 'horizon', S.horizon); touch(); panelNote = `new view: ${HZ.HORIZONS[S.horizon.kind].label}.`; renderBurrow(); } });
  on('s-reset', () => { confirmReset = true; update(); });
  on('s-no', () => { confirmReset = false; update(); });
  on('s-yes', () => { S = null; ls.del(K.state); ls.del(K.legacy); chosen = []; confirmReset = false; view = 'setup'; renderSetup(); });
}
function copyField(id, msg, set) {
  const el = $(id); const done = () => { set(msg); update(); };
  if (navigator.clipboard) navigator.clipboard.writeText(el.value).then(done).catch(() => el.select()); else el.select();
}

/* ---------------- boot & loops ---------------- */
function weatherLife() {
  if (!S || document.visibilityState !== 'visible' || !env.c) return;
  S.beings.forEach((b, i) => {
    if (b.napping) return;
    const act = outfits[b.id]?.act;
    if ((env.c.cold || env.c.freezing) && Math.random() < 0.5) puff(i);
    if (act === 'tongue' && Math.random() < 0.4) fx_(i, '❄️', 1);
    if (act === 'splash' && Math.random() < 0.3) { anim(i, 'boing'); if (Math.random() < 0.3) Snd.play('bubble'); }
    if (act === 'gaze' && Math.random() < 0.2) flash(i, 'surprised', 900);
  });
}
function puff(i) {
  const st = $('stage'), el = beingEl(i); if (!st || !el) return;
  const r = st.getBoundingClientRect(), br = el.getBoundingClientRect();
  const p = document.createElement('span'); p.className = 'puff';
  p.style.left = (br.left - r.left + br.width * 0.62) + 'px'; p.style.top = (br.top - r.top + br.height * 0.58) + 'px';
  st.appendChild(p); setTimeout(() => p.remove(), 1700);
}

/** If you've been gone a while, write the diary from the save as it was when you left. */
function noteAway(now = Date.now()) {
  const from = D.lastSeen || S.lastTick;
  if (!S || now - from < 45 * 60e3) return false;
  const before = JSON.parse(JSON.stringify(S));
  const extra = diaryHooks.flatMap(h => { try { return h(before, from, now) || []; } catch { return []; } });
  const entries = writeDiary(before, from, now, { phaseAt: t => phaseAt(t, sunFor(t, S.place, null)).phase, extra });
  D.lastSeen = now; saveDevice();
  if (!entries.length) return false;
  DIARY = { from, to: now, entries };
  try { localStorage.setItem('pebble-burrow-diary', JSON.stringify(DIARY)); } catch {}
  return true;
}
function diaryHTML() {
  if (!DIARY?.entries?.length) return '';
  const t = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = ms => new Date(ms).toDateString() === new Date().toDateString() ? '' : new Date(ms).toLocaleDateString(undefined, { weekday: 'short' }) + ' ';
  return `<section class="diary"><div class="row between"><h2>while you were away</h2><span class="hint">${awayLabel(DIARY.to - DIARY.from)}</span></div>
    <ol>${DIARY.entries.map(x => `<li><span class="d-time">${day(x.t)}${t(x.t)}</span><span class="d-e" aria-hidden="true">${x.e}</span><span>${esc(x.text)}</span></li>`).join('')}</ol>
    <button class="linkbtn" id="diary-close">close the diary</button></section>`;
}

/* ---------------- a third pet ---------------- */
function checkEgg() {
  if (!S || S.beings.length !== 2 || (S.egg && S.egg.sp)) return false;
  if (F.level(S).index < 2) return false;
  const have = new Set(S.beings.map(b => b.sp)), pool = Object.keys(SPECIES).filter(k => !have.has(k));
  let h = 0; for (const ch of 'egg:' + S.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  E.setField(S, 'egg', { sp: pool[h % pool.length], at: Date.now(), hatched: false });
  E.keepsake(S, 'egg', '🥚', 'an egg appeared by the door', Date.now());
  touch();
  if (view === 'burrow' && scene === 'hill') { renderBurrow(); setTimeout(() => say(0, 'is that… an egg?', 3600), 600); setTimeout(() => say(1, 'it\u2019s wiggling!', 3200), 2200); }
  return true;
}
function eggHTML() {
  if (!S.egg || S.egg.hatched || S.beings.length !== 2 || scene !== 'hill') return '';
  return `<button class="newegg" id="egg" aria-label="an egg by the door. tap to help it hatch">${eggArt(S.egg.sp)}</button>`;
}
function hatchNewcomer() {
  const el = $('egg'); if (!el || !S.egg || S.egg.hatched || S.beings.length !== 2) return;
  el.classList.add('cracking'); Snd.play('grow');
  setTimeout(() => {
    const b = E.newBeing(S.egg.sp, Date.now());
    S.beings.push(b);
    E.setField(S, 'egg', { ...S.egg, hatched: true, id: b.id });
    E.keepsake(S, 'newcomer:' + b.id, '🐣', `${E.first(b)} the ${SPECIES[b.sp].label} hatched and joined the burrow`, Date.now());
    touch(); renderBurrow();
    setTimeout(() => { fx_(2, '✨', 4); say(2, E.rand(['hello! is this my burrow? it\u2019s lovely.', 'hi hi hi! who are you? who am i?', 'i heard there was cheese.']), 4200); }, 400);
    setTimeout(() => say(0, 'welcome home!', 3000), 2400);
  }, 1300);
}

/* ---------------- friendship ---------------- */
function friendHTML() {
  if (S.beings.length < 2) return '';
  const f = F.profile(S);
  return `<section class="friendship"><span class="hearts" aria-label="${f.hearts} of 5 hearts">${'♥'.repeat(f.hearts)}<span class="dim">${'♥'.repeat(5 - f.hearts)}</span></span>
    <span><strong>${esc(S.beings.map(E.first).join(' & '))}</strong> are ${f.label}</span>
    <span class="hint">${f.shared} day${f.shared === 1 ? '' : 's'} cared for together${f.next ? ` · ${f.next.in} to ${f.next.label}` : ''}${S.beings.length === 2 && f.index < 2 ? ' · a newcomer may come once they\u2019re good friends' : ''}${S.egg && !S.egg.hatched && S.beings.length === 2 ? ' · 🥚 there\u2019s an egg by the door!' : ''}</span></section>`;
}
let lastLevel = null, bondToday = { d: '', n: 0 };
function together(byYou = false) {
  if (!S || S.beings.length < 2) return;
  const st = $('stage'); if (!st) return;
  if (S.beings.some(b => b.napping)) { if (byYou) say(S.beings.findIndex(b => !b.napping) > -1 ? S.beings.findIndex(b => !b.napping) : 0, 'shh, someone\u2019s napping'); return; }
  const m = F.pickMoment(S, env.c, S.beings.map(b => outfits[b.id]));
  checkEgg();
  if (!m) return;
  const wrap = st.querySelector('.beings'); if (!wrap) return;
  wrap.dataset.pair = m.cls; wrap.querySelectorAll('.being').forEach(el => el.classList.remove('pairA', 'pairB'));
  beingEl(m.who[0])?.classList.add('pairA'); beingEl(m.who[1])?.classList.add('pairB');
  clearTimeout(wrap._pt); wrap._pt = setTimeout(() => { delete wrap.dataset.pair; wrap.querySelectorAll('.being').forEach(el => el.classList.remove('pairA', 'pairB')); }, 3600);
  say(m.who[0], m.lines[0], 2600); setTimeout(() => say(m.who[1], m.lines[1], 2800), 1500);
  if (m.kind === 'share') setTimeout(() => fx_(m.who[1], '🧀', 1), 900);
  else if (m.kind === 'highfive' || m.kind === 'tag') setTimeout(() => { fx_(m.who[0], '✨', 1); fx_(m.who[1], '✨', 1); }, 700);
  else setTimeout(() => fx_(m.who[0], '💛', 1), 800);
  flash(m.who[0], 'happy', 1500); flash(m.who[1], 'happy', 1500); Snd.play('chirp', { pitch: 1.3 });
  const d = E.localDate(Date.now(), S.tz); if (bondToday.d !== d) bondToday = { d, n: 0 };
  const pts = byYou ? 3 : 1;
  if (bondToday.n < 12) {
    bondToday.n += pts; F.bond(S, pts, D.dev);
    if (byYou) { const now = Date.now(); E.catchUp(S, now, mult()); S.beings.forEach(b => { b.joy = E.clamp(b.joy + 6); }); }
    const lv = F.level(S);
    if (lastLevel != null && lv.index > lastLevel) { E.keepsake(S, 'bond:' + lv.index, '💞', `${S.beings.map(E.first).join(' and ')} became ${lv.label}`, Date.now()); setTimeout(() => { fx_(0, '💞', 2); fx_(1, '💞', 2); Snd.play('grow'); }, 3200); }
    lastLevel = lv.index;
    touch(); if (view === 'burrow' && !busyTyping()) setTimeout(update, 3400);
  }
}

/* ---------------- garden ---------------- */
let plantPick = -1;
function gardenHTML() {
  const plots = GD.ensure(S), seeds = GD.plantable(env.sea?.season || 'autumn'), st = GD.stock(S);
  return `<section class="feasts garden"><div class="row between"><h2>the garden</h2><span class="hint">${env.c?.wet ? 'the rain is watering it' : env.c?.freezing ? 'frosty: growing paused' : env.wx ? 'grows with the real weather' : 'add your town so rain can water it'}</span></div>
    <div class="plots">${plots.map((p, i) => { const s2 = GD.status(p, env.c || {});
      return `<div class="plot ${s2.k}"><span class="plot-e">${p.seed ? (p.growth >= 1 ? GD.SEEDS[p.seed].e : p.growth > 0.5 ? '🌿' : p.growth > 0.12 ? '🌱' : '🟤') : '·'}</span>
        <span class="plot-t">${p.seed ? `<strong>${GD.SEEDS[p.seed].label}</strong><span class="hint">${esc(s2.t)}</span>${s2.k !== 'ripe' ? `<span class="bar full" role="meter" aria-label="grown" aria-valuenow="${Math.round(p.growth * 100)}" title="grown ${Math.round(p.growth * 100)}%"><i style="width:${Math.round(p.growth * 100)}%"></i></span><span class="bar clean" role="meter" aria-label="water" aria-valuenow="${Math.round(p.water)}" title="water ${Math.round(p.water)}%"><i style="width:${Math.round(p.water)}%"></i></span>` : ''}` : '<span class="hint">empty plot</span>'}</span>
        <span class="plot-b">${!p.seed ? `<button class="btn" data-plot="${i}">plant</button>` : s2.k === 'ripe' ? `<button class="btn" data-harvest="${i}">pick</button>` : `<button class="btn" data-water="${i}">💧 water</button>`}</span>
        ${plantPick === i ? `<div class="cheeses seeds">${seeds.map(k => `<button class="cheese" data-plant="${i}:${k}">${GD.SEEDS[k].e} ${GD.SEEDS[k].label} <small>${GD.SEEDS[k].hours}h</small></button>`).join('')}</div>` : ''}</div>`; }).join('')}</div>
    <p class="hint">pantry: ${Object.keys(st).length ? Object.entries(st).map(([k, n]) => `${GD.SEEDS[k].e} ${n}`).join(' · ') + ' (find them in the feed menu)' : 'empty for now'}</p>
  </section>`;
}
function paintGarden() {
  const el = $('garden-hill'); if (!el) return;
  el.innerHTML = GD.ensure(S).map((p, i) => `<span class="gplot ${GD.status(p, env.c || {}).k}" style="left:${20 + i * 9}%">${p.seed ? `<i>${p.growth >= 1 ? GD.SEEDS[p.seed].e : p.growth > 0.5 ? '🌿' : p.growth > 0.12 ? '🌱' : ''}</i>` : ''}</span>`).join('');
}
function gardenTick(now = Date.now()) {
  const ripe = GD.grow(S, now, env.c || {});
  if (ripe.length) { const i = S.beings.findIndex(b => !b.napping); if (i > -1) setTimeout(() => say(i, `the ${GD.SEEDS[S.garden[ripe[0]].seed].label} are ready!`, 3600), 1200); touch(); }
  paintGarden();
}
function pickPlot(i) {
  const r = GD.harvest(S, i, D.dev); if (!r) return;
  const sd = GD.SEEDS[r.seed];
  E.keepsake(S, 'harvest:' + r.seed, sd.e, `first ${sd.label} from the garden`, Date.now());
  Snd.play('coin'); const k = S.beings.findIndex(b => !b.napping);
  if (k > -1) { fx_(k, sd.e, 3); say(k, r.seed === 'sunflower' ? 'a sunflower! it\u2019s going in a vase inside.' : `${r.n} ${sd.label}! into the pantry.`); }
  touch(); paintGarden(); update();
}
function feedSnack(item) {
  const b = S.beings[sel], sd = GD.SEEDS[item]; if (!sd?.snack) return;
  if (b.napping) care(sel, (s, x, now) => E.wake(s, x, now, D.dev), () => sparkle(sel));
  if (b.full >= 96) { cheeseOpen = false; update(); say(sel, 'so full. saving room for tomorrow.'); return; }
  if (!GD.useSnack(S, item, D.dev)) return;
  cheeseOpen = false;
  care(sel, (s, x, now) => E.feed(s, x, { id: item, ...sd.snack }, now, D.dev), () => {
    anim(sel, 'munch'); flash(sel, 'happy', 1800); fx_(sel, sd.e, 1); Snd.play('munch');
    setTimeout(() => say(sel, E.rand([`homegrown ${item}! the best kind.`, `we grew this! together!`, `fresh from the garden. crunchy.`])), 900);
  });
}

/* ---------------- visitors ---------------- */
let visitorEl = null;
function visitorCheck(force = false) {
  if (!S || view !== 'burrow' || scene !== 'hill' || visitorEl || document.visibilityState !== 'visible' || document.querySelector('.modal')) return;
  const luck = GD.stock(S).clover ? 1.6 : 1;
  const id = force ? (V.eligible(env.c || {}, S)[0]?.id) : V.maybeVisit(env.c, S, Math.random, luck);
  if (id) showVisitor(id);
}
function showVisitor(id) {
  const st = $('stage'); if (!st) return;
  const v = V.VISITORS[id], flying = ['butterfly', 'fireflies', 'snowowl', 'bee', 'robin'].includes(id);
  const b = document.createElement('button'); b.className = 'visitor' + (flying ? ' flying' : ''); b.dataset.v = id;
  b.textContent = v.e; b.setAttribute('aria-label', `a ${v.label} is visiting. tap to say hello`);
  b.style.left = (12 + Math.random() * 66) + '%'; if (flying) b.style.top = (18 + Math.random() * 22) + '%';
  b.onclick = () => greetVisitor(id); st.appendChild(b); visitorEl = b;
  const i = S.beings.findIndex(x => !x.napping); if (i > -1) setTimeout(() => say(i, E.rand([`look! a ${v.label}!`, 'we have a visitor!', `oh! is that a ${v.label}?`]), 3000), 600);
  b._leave = setTimeout(() => { b.classList.add('leaving'); setTimeout(() => { b.remove(); if (visitorEl === b) visitorEl = null; }, 900); }, 90e3);
}
function greetVisitor(id) {
  const v = V.VISITORS[id], el = visitorEl; if (!el) return;
  clearTimeout(el._leave);
  const r = V.greet(S, id, D.dev);
  if (r.first) E.keepsake(S, 'visitor:' + id, v.e, `first visit from a ${v.label}`, Date.now());
  if (r.gift) GD.giveSnack(S, r.gift, 1, D.dev);
  Snd.play('sparkle'); Snd.buzz([10, 40, 10]);
  const i = S.beings.findIndex(x => !x.napping);
  if (i > -1) { say(i, E.rand(v.hello) + (r.gift ? ` (it left ${r.gift === 'clover' ? 'a lucky clover' : 'a ' + r.gift}!)` : ''), 4200); flash(i, 'happy', 2000); }
  el.classList.add('greeted'); setTimeout(() => { el.remove(); if (visitorEl === el) visitorEl = null; }, 1400);
  touch(); update();
}
function visitorBookHTML() {
  const met = Object.keys(V.VISITORS).filter(id => V.timesMet(S, id) > 0);
  if (!met.length) return `<section class="feasts book"><div class="row between"><h2>visitor book</h2><span class="hint">0 of ${Object.keys(V.VISITORS).length}</span></div><p class="hint">little visitors drop by depending on the time and the weather. tap one to say hello.</p></section>`;
  return `<section class="feasts book"><div class="row between"><h2>visitor book</h2><span class="hint">${met.length} of ${Object.keys(V.VISITORS).length}</span></div>
    <ul class="book-grid">${Object.entries(V.VISITORS).map(([id, v]) => { const n = V.timesMet(S, id);
      return n ? `<li><span class="b-e">${v.e}</span><span>${esc(v.label)}</span><span class="hint">×${n}</span></li>` : `<li class="unmet" title="${esc(v.hint)}"><span class="b-e">❔</span><span class="hint">${esc(v.hint)}</span></li>`; }).join('')}</ul></section>`;
}

/* ---------------- photos ---------------- */
let snapping = false;
async function takePhoto() {
  const st = $('stage'); if (!st || snapping) return; snapping = true;
  S.beings.forEach((b, i) => { if (!b.napping) flash(i, 'happy', 1600); });
  const i = S.beings.findIndex(x => !x.napping); if (i > -1) say(i, 'say cheese!', 1200);
  await new Promise(r => setTimeout(r, 1250));
  st.querySelectorAll('.say').forEach(x => x.remove());
  const cap = `${S.owner}${/s$/i.test(S.owner) ? "'" : "'s"} burrow · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  let data = '';
  try { data = await PH.snapshot(st, cap); } catch (e) { snapping = false; return; }
  const fl = document.createElement('div'); fl.className = 'shutter'; st.appendChild(fl); setTimeout(() => fl.remove(), 600);
  Snd.play('shutter'); Snd.buzz([20]);
  PH.add({ id: Date.now().toString(36), t: Date.now(), data, wx: env.c?.kind || '' });
  if (E.keepsake(S, 'photo:first', '📷', 'the first photo on the hill', Date.now())) touch();
  snapping = false; update();
}
function photosHTML() {
  const ps = PH.list();
  return `<section class="feasts photos"><div class="row between"><h2>photos</h2><span class="hint">${ps.length ? `${ps.length} on this device` : 'tap 📷 on the hill'}</span></div>
    ${ps.length ? `<div class="photo-grid">${ps.map(p => `<button class="thumb" data-photo="${p.id}" aria-label="photo from ${new Date(p.t).toLocaleString()}"><img src="${p.data}" alt=""></button>`).join('')}</div>
      <p class="hint">photos stay on this device (up to ${12}). save the ones you love.</p>` : ''}</section>`;
}
function viewPhoto(id) {
  const p = PH.list().find(x => x.id === id); if (!p) return;
  const root = document.createElement('div'); root.className = 'modal';
  root.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="photo"><div class="sheet-top"><strong>${new Date(p.t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</strong><button class="ghost" data-close>close</button></div>
    <img class="photo-big" src="${p.data}" alt="the hill">
    <div class="row"><a class="btn" download="pebble-burrow-${p.id}.jpg" href="${p.data}">save to device</a>${MB?.address ? '<button class="btn" data-send>💌 send as a postcard</button>' : ''}<button class="btn danger" data-del>delete</button></div></div>`;
  document.body.appendChild(root);
  root.querySelector('[data-close]').onclick = () => root.remove();
  root.querySelector('[data-del]').onclick = () => { PH.remove(id); root.remove(); update(); };
  const sendB = root.querySelector('[data-send]');
  if (sendB) sendB.onclick = async () => { const img = await PH.shrink(p.data); root.remove(); writePostcard(img); };
  root.addEventListener('keydown', e => { if (e.key === 'Escape') root.remove(); });
}

function chatter() {
  if (!S || view !== 'burrow' || document.visibilityState !== 'visible' || washMode || Math.random() > 0.45) return;
  const awake = S.beings.map((b, i) => b.napping ? -1 : i).filter(i => i > -1); if (!awake.length) return;
  const i = E.rand(awake); say(i, E.rand(P.T(S.beings[i]).idle), 3400);
}

function tick() {
  if (!S || view === 'setup') return;
  if (document.visibilityState === 'visible') { D.lastSeen = Date.now(); saveDevice(); }
  const before = S.beings.map(b => b.napping);
  env = computeEnv();
  E.catchUp(S, Date.now(), mult());
  saveLocal();
  applyEnv();
  gardenTick();
  if (!washMode && renaming < 0 && !busyTyping()) update();
  S.beings.forEach((b, i) => { if (b.napping && !before[i]) say(i, 'getting sleepy… just a little nap.'); });
}

async function boot() {
  if (S) {
    lastLevel = F.level(S).index;
    setTimeout(checkEgg, 4000);
    if (TZ && S.tz !== TZ) { E.setField(S, 'tz', TZ); touch(); }
    noteAway();
    const { hours, napped } = E.catchUp(S, Date.now()); saveLocal(); renderBurrow();
    if (hours >= 1) { const d = hours >= 48 ? Math.round(hours / 24) + ' days' : Math.round(hours) + ' hours';
      setTimeout(() => say(0, napped ? `you were gone ${d}. we napped and kept your spot warm.` : `you're back! it's been ${d}.`, 4200), 500); }
    else if (hours >= 0.08) setTimeout(() => { const i = S.beings.findIndex(b => !b.napping); if (i > -1) say(i, E.rand(P.T(S.beings[i]).greet), 3600); }, 600);
    const visit = S.log.find(l => l.by && l.t > Date.now() - hours * 36e5);
    if (visit && hours >= 0.25) setTimeout(() => say(1 % S.beings.length, `${visit.by} came by while you were away!`, 4200), 2200);
  } else renderSetup();

  if (D.token) { const r = await syncAndRefresh(); if (r === 'changed' && view !== 'setup') say(0, 'caught up from your other device!', 3200); }
  refreshWeather();
  if (S) loadMail(true);

  setInterval(tick, 30e3);
  setInterval(() => { if (S && document.visibilityState === 'visible') loadMail(); }, 5 * 60e3);
  setInterval(chatter, 80e3);
  setInterval(() => visitorCheck(), 4 * 60e3);
  setTimeout(() => visitorCheck(), 15e3);
  setInterval(() => { if (S && view === 'burrow' && document.visibilityState === 'visible' && !washMode && !document.querySelector('.modal') && Math.random() < 0.55) together(); }, 95e3);
  setInterval(weatherLife, 3500);
  setInterval(() => refreshWeather(), 10 * 60e3);
  setInterval(() => { if (D.token && document.visibilityState === 'visible') syncAndRefresh(); }, 5 * 60e3);
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') { D.lastSeen = Date.now(); saveDevice(); if (dirty) syncNow(); return; }
    if (!S) return; if (noteAway()) update(); tick(); refreshWeather(); loadMail();
    if (D.token && Date.now() - (D.lastSync || 0) > 60e3) syncAndRefresh();
  });
  addEventListener('online', () => { if (dirty) syncNow(); refreshWeather(); });

  try { navigator.storage?.persist?.(); } catch {}
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (view === 'burrow') update(); });
boot();
