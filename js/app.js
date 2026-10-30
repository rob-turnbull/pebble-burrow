// Presentation + orchestration: rendering, actions, sky/weather loop, sync loop.
import { SPECIES, CHEESES, MONTHS, WEATHER_LINES } from './data.js';
import { art, eggArt } from './art.js';
import * as E from './engine.js';
import { phaseAt, sunFor, fmtClock } from './sky.js';
import { fetchWeather, searchPlaces, locateMe, WeatherFX, kindIcon, KIND_LABEL, isCold, WEATHER_TTL } from './weather.js';
import { GistSync } from './sync.js';

/* ---------------- local persistence ---------------- */
const K = { state: 'pebble-burrow', device: 'pebble-burrow-device', wx: 'pebble-burrow-weather', legacy: 'pebble-burrow-v1' };
const ls = {
  get(k) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
let S = E.migrate(ls.get(K.state) || ls.get(K.legacy));
let D = ls.get(K.device) || { token: '', gistId: null, lastSync: 0, user: '' };   // this device only, never synced
let W = ls.get(K.wx);                                                                  // weather cache, this device only
const saveLocal = () => ls.set(K.state, S);
const saveDevice = () => ls.set(K.device, D);

/* ---------------- ui state ---------------- */
const app = document.getElementById('app');
let sel = 0, washMode = false, view = 'burrow', cheeseOpen = false, renaming = -1, confirmReset = false;
let panelNote = '', placeResults = [], placeBusy = false, syncBusy = false, syncMsg = '', syncErr = false;
let fx = null, env = { phase: 'day', t: 0.5, kind: null, cold: false }, lastVoiced = '';
let installEvt = null;

const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmtAgo = t => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 6e4); if (m < 1) return 'just now'; if (m < 60) return m + 'm ago'; const h = Math.round(m / 60); if (h < 24) return h + 'h ago'; return Math.round(h / 24) + 'd ago'; };
const $ = id => document.getElementById(id);
const on = (id, f) => { const e = $(id); if (e) e.onclick = f; };
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/* ---------------- sync orchestration ---------------- */
let pushTimer = 0, dirty = false;
const syncer = () => D.token ? new GistSync(D.token, D.gistId) : null;

function touch() {            // call after any change the person made
  S.updatedAt = Date.now(); saveLocal(); dirty = true; schedulePush();
}
function schedulePush(ms = 4000) { if (!D.token) return; clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, ms); }

async function pushNow() {
  const g = syncer(); if (!g || !S) return;
  syncBusy = true; paintSync();
  try { D.gistId = await g.push(S); D.lastSync = Date.now(); dirty = false; syncErr = false; syncMsg = ''; }
  catch (e) { syncErr = true; syncMsg = e.message; }
  syncBusy = false; saveDevice(); paintSync();
}

/** Pull the remote save and keep whichever is newer. Returns 'adopted' | 'pushed' | 'same' | 'empty'. */
async function pullNow() {
  const g = syncer(); if (!g) return 'off';
  syncBusy = true; paintSync();
  let out = 'same';
  try {
    const remote = E.migrate(await g.pull());
    D.gistId = g.gistId;
    if (remote && (!S || (remote.updatedAt || 0) > (S.updatedAt || 0))) {
      S = remote; E.catchUp(S, Date.now()); saveLocal(); sel = 0; out = 'adopted';
      setTimeout(() => refreshWeather(), 0);
    } else if (S && (!remote || (S.updatedAt || 0) > (remote.updatedAt || 0))) {
      D.gistId = await g.push(S); out = 'pushed';
    } else if (!remote) out = 'empty';
    D.lastSync = Date.now(); syncErr = false; syncMsg = '';
  } catch (e) { syncErr = true; syncMsg = e.message; out = 'error'; }
  syncBusy = false; saveDevice(); paintSync();
  return out;
}

function paintSync() {
  const el = $('syncpill'); if (!el) return;
  if (!D.token) { el.textContent = 'this device only'; el.className = 'pill'; return; }
  el.className = 'pill ' + (syncErr ? 'bad' : 'ok');
  el.textContent = syncBusy ? 'syncing…' : syncErr ? 'sync paused' : 'synced ' + fmtAgo(D.lastSync);
  el.title = syncMsg || '';
}

/* ---------------- environment: sky + weather ---------------- */
function computeEnv(now = Date.now()) {
  const sun = sunFor(now, S?.place, W && S?.place && W.for === `${S.place.lat},${S.place.lon}` ? W : null);
  const { phase, t } = phaseAt(now, sun);
  const wx = S?.place && W && W.for === `${S.place.lat},${S.place.lon}` ? W : null;
  return { phase, t, sun, wx, kind: wx ? wx.kind : 'clear', cold: isCold(wx, S?.units) };
}

async function refreshWeather(force = false) {
  if (!S?.place) return;
  const key = `${S.place.lat},${S.place.lon}`;
  const fresh = W && W.for === key && W.units === S.units && Date.now() - W.fetchedAt < WEATHER_TTL;
  if (fresh && !force) return;
  try { W = await fetchWeather(S.place, S.units); ls.set(K.wx, W); applyEnv(); }
  catch (e) { /* keep last known weather; offline is fine */ }
}

function applyEnv() {
  if (!S) return;
  env = computeEnv();
  const st = $('stage'); if (!st) return;
  st.dataset.phase = env.phase;
  st.classList.toggle('cold', env.cold);
  const orb = $('orb');
  if (orb) {
    const t = env.t, night = env.phase === 'night';
    orb.className = 'orb ' + (night ? 'moon' : env.phase);
    orb.style.left = (6 + 80 * t) + '%';
    orb.style.top = (58 - 46 * Math.sin(Math.PI * t)) + '%';
  }
  fx?.set(env.kind, env.wx?.wind || 0);
  const chip = $('wxchip');
  if (chip) {
    const night = env.phase === 'night';
    chip.innerHTML = env.wx
      ? `<span>${kindIcon(env.kind, night)} ${env.wx.temp}°${S.units}</span><span class="muted">${esc(S.place.name)} · ${env.phase}</span>`
      : `<span>${night ? '🌙' : '☀️'} ${env.phase}</span><span class="muted">${S.place ? esc(S.place.name) : 'add your town for weather'}</span>`;
  }
  // a being comments when the sky or weather changes
  const voice = `${env.phase}|${env.kind}`;
  if (lastVoiced && voice !== lastVoiced) {
    const [p0, k0] = lastVoiced.split('|');
    const line = env.kind !== k0 ? E.rand(WEATHER_LINES[env.kind] || ['']) : env.phase !== p0 ? E.rand(WEATHER_LINES[env.phase] || ['']) : '';
    const awake = S.beings.map((b, i) => b.napping ? -1 : i).filter(i => i > -1);
    if (line && awake.length) setTimeout(() => say(E.rand(awake), line, 3600), 800);
  }
  lastVoiced = voice;
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
    const r = await pullNow();
    if (r === 'adopted') { renderBurrow(); say(0, 'we came all this way to see you!', 3600); }
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
  S = E.newBurrow({ owner, bday: d && m ? { d: +d, m: +m } : null, species: chosen });
  touch();
  app.innerHTML = `<header class="top"><div><h1>your eggs are warm</h1><p class="sub">listen… something's wiggling.</p></div></header>
    <div class="stage hatching"><div class="hill back"></div><div class="hill"></div>
    <div class="eggs">${chosen.map(k => `<div class="egg">${eggArt(k)}</div>`).join('')}</div></div>`;
  setTimeout(() => app.querySelectorAll('.egg').forEach(e => e.classList.add('pop')), 1700);
  setTimeout(() => { renderBurrow(); say(0, 'hello! i already like you.'); setTimeout(() => say(1, 'is that cheese i smell?'), 900); }, 2300);
}
function restoreCode(code, noteEl) {
  try {
    const n = E.migrate(E.decode(code)); if (!n) throw 0;
    n.updatedAt = Date.now(); S = n; E.catchUp(S, Date.now()); touch(); sel = 0; panelNote = 'burrow restored.'; renderBurrow();
  } catch { const msg = "that code didn't work. paste the whole thing, first character to last."; if (noteEl) noteEl.textContent = msg; else { panelNote = msg; update(); } }
}

/* ---------------- burrow ---------------- */
function renderBurrow() {
  view = view === 'settings' ? 'settings' : 'burrow';
  const party = E.isBirthday(S);
  app.innerHTML = `
  <header class="top">
    <div><h1>${esc(S.owner)}${/s$/i.test(S.owner) ? "'" : "'s"} burrow</h1>
      <p class="sub">${S.beings.map(b => esc(b.name.split(' ')[0])).join(' & ')} · together since ${new Date(S.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p></div>
    <div class="row"><span id="syncpill" class="pill"></span><button class="ghost" id="gear">${view === 'settings' ? 'back to the burrow' : 'settings'}</button></div>
  </header>
  <div class="stage ${party ? 'party' : ''}" id="stage" data-phase="day">
    <div class="sky-dim"></div><div id="orb" class="orb"></div>
    <div class="hill back"></div><div class="door"><i></i></div><div class="hill"></div>
    <span class="flower" style="left:6%"></span><span class="flower blue" style="left:16%;bottom:30px"></span><span class="flower" style="right:24%;bottom:26px"></span>
    <button class="wxchip" id="wxchip" aria-label="weather and time of day"></button>
    ${party ? `<div class="banner">🎂 happy birthday, ${esc(S.owner)}! they knew.</div>` : ''}
    <div class="beings">${S.beings.map((b, i) => `<button class="being" data-i="${i}" aria-label="${esc(b.name)}, ${SPECIES[b.sp].label}">${art(b.sp)}<span class="shadow"></span></button>`).join('')}</div>
  </div>
  <div id="below"></div>`;
  on('gear', () => { view = view === 'settings' ? 'burrow' : 'settings'; confirmReset = false; panelNote = ''; renderBurrow(); });
  on('wxchip', () => { view = 'settings'; renderBurrow(); $('place-q')?.focus(); });
  const stage = $('stage');
  fx = new WeatherFX(stage);
  stage.querySelectorAll('.being').forEach(el => el.onclick = () => { if (!washMode) tapBeing(+el.dataset.i); });
  setupWash(stage);
  if (party && !sessionGet('confetti')) { confetti(); sessionSet('confetti', '1'); }
  applyEnv(); paintSync(); update();
}
function sessionGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
function sessionSet(k, v) { try { sessionStorage.setItem(k, v); } catch {} }

function update() {
  if (!S || view === 'setup') return;
  const now = Date.now();
  document.querySelectorAll('.being').forEach((el, i) => { const b = S.beings[i]; if (!b) return;
    el.classList.toggle('selected', i === sel);
    el.classList.toggle('napping', b.napping);
    el.classList.toggle('glow', !!(b.glowUntil && b.glowUntil > now));
    el.classList.toggle('muddy', b.clean < 35);
    let z = el.querySelector('.zzz'); if (b.napping && !z) { z = document.createElement('span'); z.className = 'zzz'; z.textContent = 'z'; el.appendChild(z); } if (!b.napping && z) z.remove();
    let t = el.querySelector('.thought'); const hungry = !b.napping && b.full < 30;
    if (hungry && !t) { t = document.createElement('span'); t.className = 'thought'; t.textContent = '🧀'; el.appendChild(t); } if (!hungry && t) t.remove();
  });
  const below = $('below'); if (!below) return;
  if (view === 'settings') { below.innerHTML = settingsHTML(); wireSettings(); return; }
  const b = S.beings[sel];
  below.innerHTML = `
  <div class="stack">
  <section class="tray" aria-label="tend ${esc(b.name)}">
    <div class="who"><span>tending <strong>${esc(b.name)}</strong></span><span class="hint">${washMode ? 'rub the sponge over them, or tap wash again for a gentle auto-wash' : 'tap a being to switch. keep tapping… they have a secret.'}</span></div>
    <div class="actions">
      ${b.napping ? `<button class="act wake" id="a-wake"><span class="ic">✨</span>wake ${esc(b.name.split(' ')[0])}</button>` : ''}
      <button class="act ${cheeseOpen ? 'on' : ''}" id="a-feed"><span class="ic">🧀</span>feed</button>
      <button class="act ${washMode ? 'on' : ''}" id="a-wash"><span class="ic">🧽</span>${washMode ? 'auto-wash' : 'wash'}</button>
      <button class="act" id="a-play"><span class="ic">🎈</span>boing</button>
      <button class="act" id="a-hug"><span class="ic">🫶</span>hug</button>
    </div>
    ${cheeseOpen ? `<div class="cheeses">${CHEESES.map(c => `<button class="cheese" data-c="${c.id}">${c.label}</button>`).join('')}</div>` : ''}
  </section>
  <section class="cards">${S.beings.map((x, i) => cardHTML(x, i)).join('')}</section>
  <section class="feasts"><div class="row between"><h2>the feast book</h2><span class="hint">${S.beings.reduce((a, x) => a + x.feasts, 0)} feasts kept</span></div>
    ${S.log.length ? `<ol>${S.log.slice(0, 8).map(l => `<li><span>${esc(l.n.split(' ')[0])} had ${esc(l.c)}</span><span>${fmtAgo(l.t)}</span></li>`).join('')}</ol>` : `<p class="hint">no feasts yet. tap feed and pick a cheese, the first one goes in the book.</p>`}
  </section>
  ${installHTML()}
  <p class="law"><b>nothing here ever dies.</b> forgetting just means napping, and coming back means glowing.</p>
  </div>`;
  on('a-wake', () => { if (E.wake(b)) { sparkle(sel); say(sel, E.rand(["you're back! i was waiting, not worrying.", 'i dreamt about cheese. and you.', '*stretches* hello hello.'])); touch(); update(); } });
  on('a-feed', () => { cheeseOpen = !cheeseOpen; washMode = false; update(); });
  on('a-wash', () => { if (washMode) autoWash(); else { washMode = true; cheeseOpen = false; showSponge(); update(); } });
  on('a-play', () => act('play')); on('a-hug', () => act('hug'));
  on('i-install', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; update(); });
  below.querySelectorAll('.cheese').forEach(c => c.onclick = () => feed(c.dataset.c));
  below.querySelectorAll('.card').forEach(c => c.onclick = e => { if (e.target.closest('button,input')) return; sel = +c.dataset.i; update(); });
  below.querySelectorAll('[data-rename]').forEach(r => r.onclick = () => { renaming = +r.dataset.rename; update(); const inp = $('rn'); inp?.focus(); inp?.select(); });
  const rf = $('rnf'); if (rf) rf.onsubmit = e => { e.preventDefault(); const v = $('rn').value.trim(); if (v) S.beings[renaming].name = v.slice(0, 32); renaming = -1; touch(); renderBurrow(); };
  on('rnx', () => { renaming = -1; update(); });
}

function installHTML() {
  if (standalone()) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<section class="install"><strong>keep it on your home screen</strong>
    ${installEvt ? `<button class="btn" id="i-install">install pebble burrow</button>`
      : `<span class="hint">${ios ? 'in Safari, tap Share, then “Add to Home Screen”.' : 'in your browser menu, choose “Install app” or “Add to Home screen”.'} it opens full screen and works offline.</span>`}</section>`;
}

function cardHTML(b, i) {
  const m = E.mood(b, { phase: env.phase });
  const bar = (k, lab) => `<div class="stat"><span>${lab}</span><div class="bar ${k}" role="meter" aria-label="${lab}" aria-valuenow="${Math.round(b[k])}" aria-valuemin="0" aria-valuemax="100"><i style="width:${b[k]}%"></i></div></div>`;
  return `<article class="card ${i === sel ? 'sel' : ''}" data-i="${i}">
    <div class="nm">${renaming === i ? `<form class="rename" id="rnf"><input id="rn" value="${esc(b.name)}" maxlength="32" aria-label="new name"><button class="ghost">save</button><button type="button" class="ghost" id="rnx">✕</button></form>` : `<h3>${esc(b.name)}</h3><span class="chip ${m.k}">${m.t}</span>`}</div>
    ${bar('full', 'tummy')}${bar('clean', 'sparkle')}${bar('joy', 'joy')}
    <div class="row between"><span class="meta">${SPECIES[b.sp].label} · ${b.feasts} feasts · ${b.hugs} hugs · ${b.boings} boings</span>${renaming === i ? '' : `<button class="linkbtn" data-rename="${i}">rename</button>`}</div>
  </article>`;
}

/* ---------------- actions ---------------- */
const beingEl = i => document.querySelector(`.being[data-i="${i}"]`);
function anim(i, cls) { const el = beingEl(i); if (!el) return; el.classList.remove('boing', 'squish', 'munch'); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 1000); }
function feed(cid) {
  const b = S.beings[sel], c = CHEESES.find(x => x.id === cid);
  if (b.napping) { E.wake(b); sparkle(sel); }
  if (!E.feed(b, c)) { say(sel, 'so full. saving room for tomorrow.'); return; }
  E.logFeast(S, b, cid === 'crumb' ? 'a tiny crumb' : cid);
  anim(sel, 'munch'); fx_(sel, '🧀', 1);
  setTimeout(() => { fx_(sel, '💛', 3); say(sel, E.rand(['nom nom nom', 'that was the best one yet', '*happy tummy noises*', 'more tomorrow? promise?'])); }, 1000);
  cheeseOpen = false; touch(); update();
}
function act(kind) {
  const b = S.beings[sel];
  if (b.napping) { say(sel, 'zzz… (wake me first?)'); return; }
  if (kind === 'play') { E.play(b); anim(sel, 'boing'); setTimeout(() => fx_(sel, env.kind === 'snow' ? '❄️' : '✨', 2), 450);
    say(sel, env.kind === 'snow' ? 'boing in the SNOW' : env.kind === 'rain' ? 'puddle boing!' : E.rand(['boing!', 'again again!', 'i touched the sky a bit'])); }
  if (kind === 'hug') { E.hug(b); anim(sel, 'squish'); fx_(sel, '💗', 3); say(sel, env.kind === 'storm' ? 'safe now.' : E.rand(['smoosh.', 'warm warm warm', 'i needed that'])); }
  touch(); update();
}
function tapBeing(i) {
  if (sel !== i) { sel = i; cheeseOpen = false; update(); return; }
  const b = S.beings[i]; b.taps = (b.taps || 0) + 1;
  if (b.napping) say(i, 'zzz…');
  else if (b.taps % 7 === 0) { say(i, SPECIES[b.sp].secret, 5200); fx_(i, '🤫', 1); }
  else { anim(i, 'squish'); if (b.taps % 7 === 5) say(i, 'hehe… keep going'); }
  saveLocal();
}

/* ---------------- wash ---------------- */
let spongeEl = null;
function showSponge() { const st = $('stage'); if (!st || spongeEl) return; spongeEl = document.createElement('div'); spongeEl.className = 'sponge'; spongeEl.style.left = (st.clientWidth * 0.5) + 'px'; spongeEl.style.top = '40px'; st.appendChild(spongeEl); }
function hideSponge() { spongeEl?.remove(); spongeEl = null; washMode = false; }
function scrubOne(i, amt) {
  const b = S.beings[i]; if (b.napping) { E.wake(b); sparkle(i); }
  if (E.scrub(b, amt)) { hideSponge(); fx_(i, '✨', 3); say(i, E.rand(['squeaky!', 'i feel like a brand new pebble', 'sparkly sparkly'])); touch(); update(); }
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
  const iv = setInterval(() => { t++; if (!spongeEl) { clearInterval(iv); return; }
    const x = br.left - r.left + br.width * (0.5 + 0.32 * Math.sin(t / 3)), y = br.top - r.top + br.height * (0.45 + 0.18 * Math.cos(t / 5));
    spongeEl.style.left = x + 'px'; spongeEl.style.top = y + 'px'; bubble(x, y); scrubOne(i, 4);
    if (t > 40) { clearInterval(iv); hideSponge(); touch(); update(); } }, 70);
}

/* ---------------- effects ---------------- */
function fx_(i, ch, n) { const st = $('stage'), el = beingEl(i); if (!st || !el) return; const r = st.getBoundingClientRect(), br = el.getBoundingClientRect();
  for (let k = 0; k < n; k++) { const s = document.createElement('span'); s.className = 'fx'; s.textContent = ch; s.style.left = (br.left - r.left + br.width * (0.3 + Math.random() * 0.4)) + 'px'; s.style.top = (br.top - r.top + 10) + 'px'; s.style.animationDelay = (k * 0.18) + 's'; st.appendChild(s); setTimeout(() => s.remove(), 1900); } }
function bubble(x, y) { const st = $('stage'); const s = document.createElement('span'); s.className = 'bubble'; s.style.left = (x - 7 + (Math.random() * 20 - 10)) + 'px'; s.style.top = (y - 7) + 'px'; st.appendChild(s); setTimeout(() => s.remove(), 1300); }
function sparkle(i) { update(); fx_(i, '✨', 4); }
function say(i, txt, ms = 2600) { const el = beingEl(i); if (!el) return; el.querySelector('.say')?.remove(); const b = document.createElement('span'); b.className = 'say'; b.textContent = txt; el.appendChild(b); setTimeout(() => b.remove(), ms); }
function confetti() { const st = $('stage'); const cols = ['#f2c94c', '#e57fa8', '#7fb8d6', '#86c46f'];
  for (let k = 0; k < 40; k++) { const c = document.createElement('span'); c.className = 'confetti'; c.style.left = Math.random() * 100 + '%'; c.style.background = E.rand(cols); c.style.animationDelay = (Math.random() * 1.2) + 's'; st.appendChild(c); setTimeout(() => c.remove(), 4200); } }

/* ---------------- settings ---------------- */
function settingsHTML() {
  const sun = env.sun || {};
  return `<div class="stack">
  <section class="panel">
    <h2>you</h2>
    <div class="row">
      <label class="field grow">your name<input id="s-owner" value="${esc(S.owner)}" maxlength="24"></label>
      <label class="field">birthday day<select id="s-bd"><option value="">–</option>${Array.from({ length: 31 }, (_, i) => `<option ${S.bday && S.bday.d === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>
      <label class="field">month<select id="s-bm"><option value="">–</option>${MONTHS.map((m, i) => `<option value="${i + 1}" ${S.bday && S.bday.m === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <button class="btn" id="s-save">save</button>
    </div>
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
      <p class="hint">on your other device, open pebble burrow, choose “already have a burrow?”, and paste the same token.</p>`
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

function setPlace(p) { S.place = { name: p.name, region: p.region || '', lat: p.lat, lon: p.lon }; placeResults = []; touch(); refreshWeather(true).then(() => { applyEnv(); update(); }); applyEnv(); update(); }

function wireSettings() {
  on('s-save', () => { S.owner = $('s-owner').value.trim() || S.owner; const d = $('s-bd').value, m = $('s-bm').value; S.bday = d && m ? { d: +d, m: +m } : null; touch(); panelNote = 'saved.'; renderBurrow(); });
  const pf = $('place-form');
  if (pf) pf.onsubmit = async e => { e.preventDefault(); const q = $('place-q').value.trim(); if (!q) return;
    placeBusy = true; update();
    try { placeResults = await searchPlaces(q); panelNote = placeResults.length ? '' : `no town called “${q}” found. try adding a state or country.`; }
    catch (err) { panelNote = 'place search needs a connection. try again when you’re online.'; }
    placeBusy = false; update(); };
  on('place-me', async () => { placeBusy = true; update();
    try { setPlace(await locateMe()); panelNote = ''; } catch (err) { panelNote = err.message + '. you can search for your town instead.'; }
    placeBusy = false; update(); });
  document.querySelectorAll('.result').forEach(b => b.onclick = () => setPlace(placeResults[+b.dataset.p]));
  document.querySelectorAll('.seg [data-u]').forEach(b => b.onclick = () => { S.units = b.dataset.u; touch(); refreshWeather(true).then(() => update()); update(); });
  on('place-clear', () => { S.place = null; W = null; ls.del(K.wx); touch(); applyEnv(); update(); });

  on('sy-connect', async () => { const tok = $('sy-token').value.trim(); if (!tok) return;
    panelNote = 'checking the token…'; update();
    try { const g = new GistSync(tok); D.user = await g.whoami(); D.token = tok; D.gistId = null; saveDevice(); }
    catch (e) { panelNote = e.message; update(); return; }
    const r = await pullNow();
    panelNote = r === 'adopted' ? 'found your burrow from another device and loaded it.' : r === 'error' ? syncMsg : 'connected. this burrow now syncs.';
    r === 'adopted' ? renderBurrow() : update(); });
  on('sy-now', async () => { const r = await pullNow(); panelNote = r === 'adopted' ? 'loaded newer changes from another device.' : r === 'error' ? syncMsg : 'all synced.'; r === 'adopted' ? renderBurrow() : update(); });
  on('sy-off', () => { D = { token: '', gistId: null, lastSync: 0, user: '' }; saveDevice(); panelNote = 'this device is disconnected. your saved gist is untouched.'; paintSync(); update(); });

  on('s-copy', () => { const ta = $('s-code');
    const done = () => { panelNote = 'code copied.'; update(); };
    if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(done).catch(() => { ta.select(); });
    else ta.select(); });
  on('s-restore', () => restoreCode($('s-in').value, null));
  on('s-reset', () => { confirmReset = true; update(); });
  on('s-no', () => { confirmReset = false; update(); });
  on('s-yes', () => { S = null; ls.del(K.state); ls.del(K.legacy); chosen = []; confirmReset = false; view = 'burrow'; renderSetup(); });
}

/* ---------------- boot & loops ---------------- */
function tick() {
  if (!S || view === 'setup') return;
  const before = S.beings.map(b => b.napping);
  env = computeEnv();
  E.catchUp(S, Date.now(), E.envMultipliers({ phase: env.phase, kind: env.kind, cold: env.cold }));
  saveLocal();
  applyEnv();
  if (!washMode && renaming < 0 && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') update();
  S.beings.forEach((b, i) => { if (b.napping && !before[i]) say(i, 'getting sleepy… just a little nap.'); });
}

async function boot() {
  if (S) {
    const { hours, napped } = E.catchUp(S, Date.now()); saveLocal(); renderBurrow();
    if (hours >= 1) { const d = hours >= 48 ? Math.round(hours / 24) + ' days' : Math.round(hours) + ' hours';
      setTimeout(() => say(0, napped ? `you were gone ${d}. we napped and kept your spot warm.` : `you're back! it's been ${d}.`, 4200), 500); }
  } else renderSetup();

  if (D.token) { const r = await pullNow(); if (r === 'adopted') { renderBurrow(); say(0, 'caught up from your other device!', 3200); } }
  refreshWeather();

  setInterval(tick, 30e3);
  setInterval(() => refreshWeather(), 10 * 60e3);
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') { if (dirty) pushNow(); return; }
    if (!S) return; tick(); refreshWeather();
    if (D.token && Date.now() - (D.lastSync || 0) > 60e3) { const r = await pullNow(); if (r === 'adopted') renderBurrow(); }
  });
  addEventListener('online', () => { if (dirty) pushNow(); refreshWeather(); });

  try { navigator.storage?.persist?.(); } catch {}
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (view === 'burrow') update(); });
boot();
