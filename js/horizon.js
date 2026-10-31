// Something in the distance, behind the hill. Every burrow gets its own, picked from its id;
// you can re-roll once. Drawn as soft SVG silhouettes that take their colour from the sky,
// light their windows at night, wear snow in winter and fade into fog.

export const HORIZONS = {
  mountains:  { label: 'mountains' },
  castle:     { label: 'a castle' },
  windmill:   { label: 'a windmill' },
  lighthouse: { label: 'a lighthouse by the sea' },
  forest:     { label: 'the edge of a forest' },
  playground: { label: 'a playground' },
  ferris:     { label: 'a ferris wheel' },
  farm:       { label: 'a farm' },
  village:    { label: 'a little village' },
  stones:     { label: 'standing stones' }
};
const KINDS = Object.keys(HORIZONS);

function hash(str) { let h = 2166136261; for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
function rng(seed) { let a = hash(seed); return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** The burrow's horizon: {kind, seed, rerolled}. */
export function horizonOf(s) {
  if (s.horizon && HORIZONS[s.horizon.kind]) return s.horizon;
  const h = hash('horizon:' + s.id);
  return { kind: KINDS[h % KINDS.length], seed: h, rerolled: false };
}

/** Use the one free re-roll. Always lands somewhere new. */
export function reroll(s, now = Date.now()) {
  const cur = horizonOf(s); if (cur.rerolled) return false;
  const r = rng('reroll:' + s.id + now), others = KINDS.filter(k => k !== cur.kind);
  s.horizon = { kind: others[Math.floor(r() * others.length)], seed: Math.floor(r() * 1e9), rerolled: true, at: now };
  s.updatedAt = Math.max(s.updatedAt || 0, now);
  return true;
}

/* ---------------- drawing ----------------
   viewBox 0 0 400 120, baseline y=104. Colours come from CSS variables:
   --far (silhouette), --far2 (nearer layer), --win (lit windows), --snowcap                  */
const F = 'var(--far)', F2 = 'var(--far2)', WIN = 'var(--win)', SNOW = 'var(--snowcap)';
const win = (x, y, w = 4, h = 5) => `<rect class="hz-win" x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${WIN}"/>`;

const DRAW = {
  mountains(r) {
    const peaks = [], n = 4 + Math.floor(r() * 3);
    let x = -20;
    for (let i = 0; i < n; i++) { const w = 70 + r() * 70, h = 46 + r() * 50; peaks.push([x, x + w / 2, x + w, 104 - h]); x += w * (0.55 + r() * 0.25); }
    const back = peaks.map(([a, m, b, top]) => `<path d="M${a} 104 L${m} ${top} L${b} 104Z" fill="${F}"/><path class="hz-snow" d="M${m - (m - a) * 0.28} ${top + (104 - top) * 0.28} L${m} ${top} L${m + (b - m) * 0.28} ${top + (104 - top) * 0.28} l-6 5 l-6 -4 l-6 5 z" fill="${SNOW}"/>`).join('');
    const fall = r() < 0.4 ? `<path d="M${peaks[1][1] + 6} ${peaks[1][3] + 26} v${104 - peaks[1][3] - 26}" stroke="#e8f2ff" stroke-width="3" opacity=".7" class="hz-fall"/>` : '';
    return back + fall + `<path d="M-10 104 q60 -14 120 -6 t140 -8 t160 6 V120 H-10z" fill="${F2}"/>`;
  },
  castle(r) {
    const x = 120 + r() * 160, flag = ['#e57373', '#7fb8d6', '#f6cf4f', '#b48ce0'][Math.floor(r() * 4)];
    const tower = (tx, w, h) => `<rect x="${tx}" y="${104 - h}" width="${w}" height="${h}" fill="${F}"/>${[0, 1, 2].map(i => `<rect x="${tx + i * w / 3}" y="${104 - h - 5}" width="${w / 5}" height="5" fill="${F}"/>`).join('')}${win(tx + w / 2 - 2, 104 - h + 12)}`;
    return `<path d="M-10 104 q80 -16 170 -4 t240 -6 V120 H-10z" fill="${F2}"/>
      <rect x="${x - 34}" y="72" width="68" height="32" fill="${F}"/>${[0, 1, 2, 3, 4, 5].map(i => `<rect x="${x - 34 + i * 12}" y="67" width="7" height="5" fill="${F}"/>`).join('')}
      ${tower(x - 46, 16, 48)}${tower(x + 30, 16, 48)}${tower(x - 9, 18, 62)}
      <path d="M${x - 9} 42 L${x} 26 L${x + 9} 42Z" fill="${F}"/><path d="M${x} 26 v-10" stroke="${F}" stroke-width="1.5"/><path class="hz-flag" d="M${x} 16 l12 3 l-12 4z" fill="${flag}"/>
      <path d="M${x - 7} 104 v-12 a7 7 0 0 1 14 0 v12z" fill="${F2}"/>${win(x - 22, 82)}${win(x + 18, 82)}`;
  },
  windmill(r) {
    const x = 90 + r() * 220;
    return `<path d="M-10 104 q70 -22 150 -10 t270 -4 V120 H-10z" fill="${F2}"/>
      <path d="M${x - 12} 104 L${x - 8} 58 L${x + 8} 58 L${x + 12} 104Z" fill="${F}"/><path d="M${x - 10} 58 q10 -12 20 0z" fill="${F}"/>${win(x - 2, 78)}
      <g class="hz-sails" style="transform-origin:${x}px 56px">${[0, 90, 180, 270].map(a => `<rect x="${x - 3}" y="22" width="6" height="34" fill="${F}" transform="rotate(${a} ${x} 56)"/><rect x="${x + 3}" y="24" width="7" height="26" fill="${F}" opacity=".7" transform="rotate(${a} ${x} 56)"/>`).join('')}</g>
      <circle cx="${x}" cy="56" r="3" fill="${F2}"/>`;
  },
  lighthouse(r) {
    const x = 260 + r() * 110;
    return `<rect x="-10" y="86" width="420" height="34" fill="var(--sea)"/><path d="M-10 92 q20 -3 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" stroke="#fff" stroke-width="1.5" fill="none" opacity=".5" class="hz-waves"/>
      <path d="M${x - 30} 104 q30 -22 60 0z" fill="${F2}"/>
      <path d="M${x - 7} 88 L${x - 5} 44 L${x + 5} 44 L${x + 7} 88Z" fill="#f4f1ec"/><path d="M${x - 6.4} 72 h12.8 v6 h-12.8z M${x - 5.6} 56 h11.2 v6 h-11.2z" fill="#e57373"/>
      <rect x="${x - 6}" y="36" width="12" height="8" fill="${F}"/><rect class="hz-lamp" x="${x - 4}" y="38" width="8" height="5" fill="${WIN}"/><path d="M${x - 7} 36 L${x} 30 L${x + 7} 36Z" fill="${F}"/>
      <path class="hz-beam" d="M${x} 40 L${x - 120} 28 L${x - 120} 52Z" fill="${WIN}" opacity="0"/>
      ${r() < 0.5 ? `<path d="M60 90 l14 0 l-3 4 h-8z M67 90 v-10 l7 8z" fill="${F}"/>` : ''}`;
  },
  forest(r) {
    let trees = '', x = -10;
    while (x < 410) { const h = 34 + r() * 30, w = 16 + r() * 12; trees += r() < 0.7 ? `<path d="M${x} 104 L${x + w / 2} ${104 - h} L${x + w} 104Z" fill="${F}"/><path class="hz-snow" d="M${x + w * 0.32} ${104 - h * 0.66} L${x + w / 2} ${104 - h} L${x + w * 0.68} ${104 - h * 0.66}z" fill="${SNOW}"/>` : `<ellipse cx="${x + w / 2}" cy="${104 - h * 0.55}" rx="${w * 0.7}" ry="${h * 0.5}" fill="${F}"/>`; x += w * (0.5 + r() * 0.4); }
    return trees + `<path d="M-10 104 q100 -6 200 0 t220 -2 V120 H-10z" fill="${F2}"/>`;
  },
  playground(r) {
    const x = 70 + r() * 200;
    return `<path d="M-10 104 q90 -12 200 -4 t220 -4 V120 H-10z" fill="${F2}"/>
      <path d="M${x} 104 L${x + 18} 62 L${x + 36} 104 M${x + 70} 104 L${x + 88} 62 L${x + 106} 104 M${x + 16} 63 H${x + 90}" stroke="${F}" stroke-width="3" fill="none"/>
      <g class="hz-swing" style="transform-origin:${x + 40}px 63px"><path d="M${x + 36} 63 v26 M${x + 46} 63 v26" stroke="${F}" stroke-width="1.2"/><rect x="${x + 34}" y="88" width="14" height="3" fill="${F}"/></g>
      <path d="M${x + 60} 63 v22" stroke="${F}" stroke-width="1.2"/><circle cx="${x + 60}" cy="90" r="5" fill="none" stroke="${F}" stroke-width="3"/>
      <path d="M${x + 130} 104 V70 h14 v34 M${x + 130} 70 h14 L${x + 180} 104" stroke="${F}" stroke-width="3" fill="none"/><path d="M${x + 132} 70 l5 -8 l5 8z" fill="${F}"/>
      <path d="M${x + 196} 104 l20 -18 l20 18" stroke="${F}" stroke-width="3" fill="none"/><path d="M${x + 200} 90 q16 -8 32 0" stroke="${F}" stroke-width="2" fill="none"/>`;
  },
  ferris(r) {
    const x = 120 + r() * 160, R = 36;
    const cabs = Array.from({ length: 8 }, (_, i) => { const a = i / 8 * Math.PI * 2; return `<g class="hz-cab"><rect x="${(x + Math.cos(a) * R - 4).toFixed(1)}" y="${(60 + Math.sin(a) * R).toFixed(1)}" width="8" height="7" rx="2" fill="${['#e57373', '#7fb8d6', '#f6cf4f', '#86c46f'][i % 4]}" opacity=".85"/></g>`; }).join('');
    return `<path d="M-10 104 q90 -10 200 -4 t220 -2 V120 H-10z" fill="${F2}"/>
      <path d="M${x - 22} 104 L${x} 60 L${x + 22} 104" stroke="${F}" stroke-width="3" fill="none"/>
      <g class="hz-wheel" style="transform-origin:${x}px 60px"><circle cx="${x}" cy="60" r="${R}" fill="none" stroke="${F}" stroke-width="2.5"/>${Array.from({ length: 8 }, (_, i) => `<path d="M${x} 60 l${(Math.cos(i / 8 * 6.283) * R).toFixed(1)} ${(Math.sin(i / 8 * 6.283) * R).toFixed(1)}" stroke="${F}" stroke-width="1"/>`).join('')}</g>
      ${cabs}<g class="hz-bulbs">${Array.from({ length: 16 }, (_, i) => `<circle cx="${(x + Math.cos(i / 16 * 6.283) * R).toFixed(1)}" cy="${(60 + Math.sin(i / 16 * 6.283) * R).toFixed(1)}" r="1.4" fill="${WIN}"/>`).join('')}</g>
      <rect x="${x + 50}" y="88" width="28" height="16" fill="${F}"/><path d="M${x + 48} 88 l16 -10 l16 10z" fill="#e57373" opacity=".7"/>`;
  },
  farm(r) {
    const x = 60 + r() * 220;
    return `<path d="M-10 98 q100 -14 210 -6 t210 -2 V120 H-10z" fill="${F2}"/>${[0, 1, 2, 3, 4, 5].map(i => `<path d="M${-10 + i * 74} 104 q36 -6 70 0" stroke="${F}" stroke-width="1" fill="none" opacity=".4"/>`).join('')}
      <rect x="${x}" y="72" width="40" height="32" fill="#b4574a" opacity=".85"/><path d="M${x - 4} 74 L${x + 20} 56 L${x + 44} 74Z" fill="${F}"/><path d="M${x + 13} 104 v-16 h14 v16 M${x + 13} 88 l14 16 M${x + 27} 88 l-14 16" stroke="#f4f1ec" stroke-width="1.5" fill="none" opacity=".8"/>${win(x + 17, 64, 6, 5)}
      <rect x="${x + 48}" y="58" width="14" height="46" rx="7" fill="${F}"/><path d="M${x + 48} 64 q7 -12 14 0" fill="#b4574a" opacity=".85"/>
      ${[0, 1, 2].map(i => `<circle cx="${x + 90 + i * 16}" cy="98" r="6" fill="#e8c27a" opacity=".85"/>`).join('')}
      <ellipse class="hz-cow" cx="${x - 40}" cy="98" rx="9" ry="5" fill="#f4f1ec"/><circle cx="${x - 49}" cy="95" r="3" fill="#f4f1ec"/><circle cx="${x - 38}" cy="97" r="2.5" fill="${F}"/>`;
  },
  village(r) {
    let houses = '', x = 30 + r() * 40;
    const roofs = ['#b4574a', '#7c6a9a', '#5f8a6c', '#c48a3e'];
    for (let i = 0; i < 6 + Math.floor(r() * 3); i++) {
      const w = 22 + r() * 16, h = 18 + r() * 14, y = 104 - h - (i % 2) * 4;
      houses += `<rect x="${x}" y="${y}" width="${w}" height="${h + 6}" fill="${F}"/><path d="M${x - 3} ${y} L${x + w / 2} ${y - 12} L${x + w + 3} ${y}Z" fill="${roofs[i % 4]}" opacity=".85"/>${win(x + 5, y + 6)}${w > 30 ? win(x + w - 9, y + 6) : ''}`;
      if (r() < 0.35) houses += `<rect x="${x + w - 9}" y="${y - 16}" width="4" height="10" fill="${F}"/><g class="hz-smoke"><circle cx="${x + w - 7}" cy="${y - 20}" r="3" fill="#fff" opacity=".5"/><circle cx="${x + w - 4}" cy="${y - 27}" r="4" fill="#fff" opacity=".35"/></g>`;
      x += w + 6 + r() * 14;
    }
    const church = x < 330 ? `<rect x="${x + 10}" y="62" width="18" height="42" fill="${F}"/><path d="M${x + 8} 62 L${x + 19} 38 L${x + 30} 62Z" fill="${F}"/>${win(x + 16, 70, 6, 8)}` : '';
    return `<path d="M-10 104 q100 -10 210 -2 t210 -4 V120 H-10z" fill="${F2}"/>${houses}${church}`;
  },
  stones(r) {
    const cx = 140 + r() * 120;
    const stones = Array.from({ length: 7 }, (_, i) => { const a = i / 7 * Math.PI, x = cx + Math.cos(a) * 70, h = 18 + r() * 14, y = 100 - Math.sin(a) * 6; return `<rect x="${(x - 5).toFixed(1)}" y="${(y - h).toFixed(1)}" width="10" height="${h.toFixed(1)}" rx="3" fill="${F}"/>`; }).join('');
    return `<path d="M-10 104 q80 -26 200 -24 t220 14 V120 H-10z" fill="${F2}"/>${stones}<rect x="${cx - 16}" y="74" width="32" height="6" rx="2" fill="${F}"/><rect x="${cx - 14}" y="80" width="8" height="20" fill="${F}"/><rect x="${cx + 6}" y="80" width="8" height="20" fill="${F}"/>`;
  }
};

export function horizonSVG(h) {
  const draw = DRAW[h.kind] || DRAW.mountains;
  return `<svg class="hz-svg" viewBox="0 0 400 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${draw(rng('hz:' + h.seed + h.kind))}</svg>`;
}
