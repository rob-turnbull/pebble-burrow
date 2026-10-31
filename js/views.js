// Display-only pieces of the burrow page. Each takes what it needs as arguments and returns HTML.
import * as E from './engine.js';
import * as O from './outfits.js';
import * as GD from './garden.js';
import * as V from './visitors.js';
import * as F from './friends.js';
import * as WS from './wishes.js';
import { fmtClock } from './sky.js';
import { summary as wxSummary, icon as wxIcon } from './conditions.js';
import { awayLabel } from './diary.js';
import { esc, fmtAgo, fmtDay } from './util.js';

export function reportHTML({ S, env, open: reportOpen }) {
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

export function albumHTML(S, albumAll) {
  const items = [...S.album].reverse(), shown = albumAll ? items : items.slice(0, 5);
  return `<section class="feasts album"><div class="row between"><h2>the album</h2><span class="hint">${S.album.length} keepsake${S.album.length === 1 ? '' : 's'}</span></div>
    <ol>${shown.map(k => `<li><span><span class="emo" aria-hidden="true">${k.e}</span>${esc(k.text)}</span><span>${fmtDay(k.t)}</span></li>`).join('')}</ol>
    ${items.length > 5 ? `<button class="linkbtn" id="album-more">${albumAll ? 'show fewer' : `show all ${items.length}`}</button>` : ''}</section>`;
}

export function installHTML(installEvt, isStandalone) {
  if (isStandalone) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return `<section class="install"><strong>keep it on your home screen</strong>
    ${installEvt ? `<button class="btn" id="i-install">install pebble burrow</button>`
      : `<span class="hint">${ios ? 'in Safari, tap Share, then “Add to Home Screen”.' : 'in your browser menu, choose “Install app” or “Add to Home screen”.'} it opens full screen, works offline, and can send nudges.</span>`}</section>`;
}

export function diaryHTML(DIARY) {
  if (!DIARY?.entries?.length) return '';
  const t = ms => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = ms => new Date(ms).toDateString() === new Date().toDateString() ? '' : new Date(ms).toLocaleDateString(undefined, { weekday: 'short' }) + ' ';
  return `<section class="diary"><div class="row between"><h2>while you were away</h2><span class="hint">${awayLabel(DIARY.to - DIARY.from)}</span></div>
    <ol>${DIARY.entries.map(x => `<li><span class="d-time">${day(x.t)}${t(x.t)}</span><span class="d-e" aria-hidden="true">${x.e}</span><span>${esc(x.text)}</span></li>`).join('')}</ol>
    <button class="linkbtn" id="diary-close">close the diary</button></section>`;
}

export function wishesHTML(S, list) {
  if (!list.length) return '';
  const open = list.filter(w => !WS.done(S, w)).length;
  return `<section class="wishes"><div class="row between"><h2>today\u2019s wishes</h2><span class="hint">${open ? `${list.length - open} of ${list.length} granted` : 'all granted! 🌈'}</span></div>
    <ul>${S.beings.map(b => list.filter(w => w.being === b.id).map(w => { const d = WS.done(S, w), p = Math.min(w.need, WS.progress(S, w.key));
      return `<li class="${d ? 'done' : ''}"><span class="w-e" aria-hidden="true">${d ? '✅' : w.e}</span><span><strong>${esc(E.first(b))}:</strong> ${esc(w.text)}${w.need > 1 && !d ? ` <span class="hint">(${p}/${w.need})</span>` : ''}</span></li>`; }).join('')).join('')}</ul></section>`;
}

export function friendHTML(S) {
  if (S.beings.length < 2) return '';
  const f = F.profile(S);
  return `<section class="friendship"><span class="hearts" aria-label="${f.hearts} of 5 hearts">${'♥'.repeat(f.hearts)}<span class="dim">${'♥'.repeat(5 - f.hearts)}</span></span>
    <span><strong>${esc(S.beings.map(E.first).join(' & '))}</strong> are ${f.label}</span>
    <span class="hint">${f.shared} day${f.shared === 1 ? '' : 's'} cared for together${f.next ? ` · ${f.next.in} to ${f.next.label}` : ''}${S.beings.length === 2 && f.index < 2 ? ' · a newcomer may come once they\u2019re good friends' : ''}${S.egg && !S.egg.hatched && S.beings.length === 2 ? ' · 🥚 there\u2019s an egg by the door!' : ''}</span></section>`;
}

export function gardenHTML({ S, env, plantPick }) {
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

export function visitorBookHTML(S) {
  const met = Object.keys(V.VISITORS).filter(id => V.timesMet(S, id) > 0);
  if (!met.length) return `<section class="feasts book"><div class="row between"><h2>visitor book</h2><span class="hint">0 of ${Object.keys(V.VISITORS).length}</span></div><p class="hint">little visitors drop by depending on the time and the weather. tap one to say hello.</p></section>`;
  return `<section class="feasts book"><div class="row between"><h2>visitor book</h2><span class="hint">${met.length} of ${Object.keys(V.VISITORS).length}</span></div>
    <ul class="book-grid">${Object.entries(V.VISITORS).map(([id, v]) => { const n = V.timesMet(S, id);
      return n ? `<li><span class="b-e">${v.e}</span><span>${esc(v.label)}</span><span class="hint">×${n}</span></li>` : `<li class="unmet" title="${esc(v.hint)}"><span class="b-e">❔</span><span class="hint">${esc(v.hint)}</span></li>`; }).join('')}</ul></section>`;
}

export function photosHTML(ps) {
    return `<section class="feasts photos"><div class="row between"><h2>photos</h2><span class="hint">${ps.length ? `${ps.length} on this device` : 'tap 📷 on the hill'}</span></div>
    ${ps.length ? `<div class="photo-grid">${ps.map(p => `<button class="thumb" data-photo="${p.id}" aria-label="photo from ${new Date(p.t).toLocaleString()}"><img src="${p.data}" alt=""></button>`).join('')}</div>
      <p class="hint">photos stay on this device (up to ${12}). save the ones you love.</p>` : ''}</section>`;
}
