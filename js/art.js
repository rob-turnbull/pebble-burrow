// Original procedural being illustrations (SVG strings).
// Every being carries "genes" picked from its id: colour shift, eye style, markings, cheeks, mouth and size.
// Same species, clearly different individuals; and every device draws the same individual.
import { SPECIES } from './data.js';

/* ---------------- genes ---------------- */
function rng(seed) {                         // mulberry32 seeded from a string
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, list, w) => { if (!w) return list[Math.floor(r() * list.length)]; let x = r() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < list.length; i++) { x -= w[i]; if (x < 0) return list[i]; } return list[0]; };

export const EYES = ['round', 'oval', 'bean', 'sleepy', 'button', 'sparkle', 'lash'];
export const MARKS = ['none', 'spots', 'freckles', 'stripe', 'patch', 'blaze', 'socks'];
export const MOUTHS = ['smile', 'cat', 'tiny', 'grin', 'tooth'];

export function genesOf(b) {
  if (!b || !b.id) return null;
  const r = rng('genes:' + b.id);
  return {
    key: String(b.id).replace(/[^a-z0-9]/gi, ''),
    hue: Math.round((r() - 0.5) * 28), light: Math.round((r() - 0.5) * 14),
    eye: pick(r, EYES), eyeScale: +(0.86 + r() * 0.32).toFixed(2), spread: +((r() - 0.4) * 4.5).toFixed(1),
    mark: pick(r, MARKS, [3, 2, 2, 2, 2, 1.5, 1.5]), markSeed: Math.floor(r() * 1e6), markLight: r() < 0.5 ? -18 : 16,
    cheek: pick(r, ['#f28fae', '#f6a07a', '#f07c7c', '#c9a0e8', '#f5b3c8']),
    mouth: pick(r, MOUTHS, [3, 2, 2, 1.5, 1.5]),
    size: +(0.93 + r() * 0.14).toFixed(2)
  };
}

/* ---------------- colour ---------------- */
function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}
function hsl(h, s, l) {
  s = Math.max(0, Math.min(100, s)) / 100; l = Math.max(0, Math.min(100, l)) / 100;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
export const shade = (hex, dh = 0, dl = 0, ds = 0) => { const [h, s, l] = hexToHsl(hex); return hsl((h + dh + 360) % 360, s + ds, l + dl); };

/* ---------------- geometry ---------------- */
// Where things sit on each species, so outfits and props can be placed anywhere.
export function geom(sp) {
  const G = { ey: 66, edx: 12, er: 5, cy: 76, my: 78, body: [65, 76, 38, 36] };
  ({
    frog: () => Object.assign(G, { ey: 44, edx: 19, cy: 66, my: 68, body: [65, 78, 44, 32] }),
    mouse: () => Object.assign(G, { ey: 68, my: 84, cy: 80, body: [65, 76, 38, 36] }),
    fox: () => Object.assign(G, { ey: 67, my: 86, body: [65, 76, 38, 36] }),
    sheep: () => Object.assign(G, { ey: 72, edx: 9, er: 4, cy: 82, my: 84, body: [65, 72, 40, 34] }),
    hedgehog: () => Object.assign(G, { ey: 76, edx: 11, cy: 86, my: 92, body: [65, 80, 42, 32] }),
    owl: () => Object.assign(G, { ey: 62, edx: 13, er: 6, cy: 74, my: -99, body: [65, 74, 38, 40] }),
    axolotl: () => Object.assign(G, { ey: 74, edx: 17, cy: 84, my: 86, body: [65, 80, 40, 32] }),
    mole: () => Object.assign(G, { ey: 66, edx: 13, er: 3, cy: 78, my: 92, body: [65, 78, 40, 34] })
  })[sp]?.();
  G.top = SPECIES[sp].top; G.feet = G.body[1] + G.body[3];
  return G;
}

/* ---------------- drawing ---------------- */
const DARK = '#2b2230';

function eyeShape(style, x, y, r, lid) {
  const hl = (dx, dy, k) => `<circle cx="${x + dx}" cy="${y + dy}" r="${(r * k).toFixed(2)}" fill="#fff"/>`;
  switch (style) {
    case 'oval':    return `<ellipse cx="${x}" cy="${y}" rx="${r * 0.8}" ry="${r * 1.28}" fill="${DARK}"/>${hl(r * 0.25, -r * 0.5, 0.3)}`;
    case 'bean':    return `<ellipse cx="${x}" cy="${y}" rx="${r * 1.18}" ry="${r * 0.82}" fill="${DARK}"/>${hl(r * 0.35, -r * 0.25, 0.28)}`;
    case 'button':  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${DARK}"/><circle cx="${x}" cy="${y}" r="${r * 0.62}" fill="none" stroke="#6b6478" stroke-width="${(r * 0.18).toFixed(2)}"/>${hl(r * 0.3, -r * 0.35, 0.22)}`;
    case 'sparkle': return `<circle cx="${x}" cy="${y}" r="${r * 1.08}" fill="${DARK}"/>${hl(r * 0.35, -r * 0.4, 0.38)}${hl(-r * 0.35, r * 0.35, 0.18)}`;
    case 'sleepy':  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${DARK}"/>${hl(r * 0.3, -r * 0.1, 0.26)}<path d="M${x - r * 1.25} ${y - r * 0.05} A${r * 1.25} ${r * 1.25} 0 0 1 ${x + r * 1.25} ${y - r * 0.05}Z" fill="${lid}"/>`;
    default:        return `<circle cx="${x}" cy="${y}" r="${r}" fill="${DARK}"/>${hl(r * 0.32, -r * 0.36, 0.32)}`;
  }
}

function markings(g, G, c, sp) {
  if (!g || g.mark === 'none' || sp === 'owl' && g.mark === 'blaze') return '';
  const r = rng('mark:' + g.markSeed), [bx, by, rx, ry] = G.body, col = shade(c, 0, g.markLight, -5), id = `cl${g.key}`;
  let shapes = '';
  if (g.mark === 'spots') for (let i = 0; i < 5; i++) { const a = r() * 6.28, d = 0.45 + r() * 0.45; shapes += `<ellipse cx="${(bx + Math.cos(a) * rx * d).toFixed(1)}" cy="${(by + Math.sin(a) * ry * d * 0.9 + 4).toFixed(1)}" rx="${(3 + r() * 4).toFixed(1)}" ry="${(2.5 + r() * 3).toFixed(1)}" fill="${col}" opacity=".7"/>`; }
  if (g.mark === 'freckles') for (let i = 0; i < 6; i++) { const side = i % 2 ? 1 : -1; shapes += `<circle cx="${(65 + side * (G.edx + 4 + r() * 8)).toFixed(1)}" cy="${(G.cy + (r() - 0.5) * 6).toFixed(1)}" r="${(0.9 + r() * 0.7).toFixed(1)}" fill="${shade(c, 0, -30)}" opacity=".6"/>`; }
  if (g.mark === 'stripe') for (let i = -1; i <= 1; i++) shapes += `<path d="M${bx + i * 9 - 3} ${by - ry} q3 ${ry * 0.35} 0 ${ry * 0.55}" stroke="${col}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".75"/>`;
  if (g.mark === 'patch') { const side = r() < 0.5 ? -1 : 1; shapes += `<ellipse cx="${65 + side * G.edx}" cy="${G.ey + 2}" rx="${9 + r() * 3}" ry="${8 + r() * 3}" fill="${col}" opacity=".8"/>`; }
  if (g.mark === 'blaze') shapes += `<path d="M65 ${by - ry - 2} q-6 ${ry * 0.4} 0 ${ry * 0.75} q6 -${ry * 0.35} 0 -${ry * 0.75}" fill="${shade(c, 0, 22)}" opacity=".85"/>`;
  if (g.mark === 'socks') shapes += `<ellipse cx="${bx - rx * 0.55}" cy="${by + ry - 2}" rx="9" ry="6" fill="${shade(c, 0, 20)}"/><ellipse cx="${bx + rx * 0.55}" cy="${by + ry - 2}" rx="9" ry="6" fill="${shade(c, 0, 20)}"/>`;
  return `<clipPath id="${id}"><ellipse cx="${bx}" cy="${by}" rx="${rx}" ry="${ry}"/></clipPath><g clip-path="url(#${id})">${shapes}</g>`;
}

function mouthShape(style, my) {
  const s = `stroke="${DARK}" stroke-width="2.2" fill="none" stroke-linecap="round"`;
  switch (style) {
    case 'cat':   return `<path d="M59 ${my} q3 3.5 6 0 q3 3.5 6 0" ${s}/>`;
    case 'tiny':  return `<path d="M62.5 ${my + 1} q2.5 2.5 5 0" ${s}/>`;
    case 'grin':  return `<path d="M58 ${my} q7 8 14 0z" fill="${DARK}"/><path d="M61.5 ${my + 3} q3.5 2.5 7 0" fill="#e57fa8"/>`;
    case 'tooth': return `<path d="M59.5 ${my} q5.5 5.5 11 0" ${s}/><rect x="63.6" y="${my + 1.2}" width="2.8" height="2.6" rx=".6" fill="#fff" stroke="${DARK}" stroke-width=".8"/>`;
    default:      return `<path d="M60 ${my} q5 5 10 0" ${s}/>`;
  }
}

/**
 * @param sp      species id
 * @param opts    { genes, layers: { back, body, face, head, hand, front } } — extra SVG for outfits and props
 */
export function art(sp, opts = {}) {
  const S = SPECIES[sp], g = opts.genes || null, L0 = opts.layers || {};
  const c = g ? shade(S.c, g.hue * (sp === 'sheep' ? 0.3 : 1), g.light) : S.c;
  const G = geom(sp);
  let back = '', body = '', front = '';
  switch (sp) {
    case 'frog':
      back = `<circle cx="46" cy="44" r="15" fill="${c}"/><circle cx="84" cy="44" r="15" fill="${c}"/>`;
      body = `<ellipse cx="65" cy="78" rx="44" ry="32" fill="${c}"/><ellipse cx="65" cy="88" rx="27" ry="17" fill="${shade(c, 0, 22)}"/>`; break;
    case 'mouse':
      back = `<circle cx="38" cy="42" r="17" fill="${c}"/><circle cx="38" cy="42" r="9" fill="#f2b8c6"/><circle cx="92" cy="42" r="17" fill="${c}"/><circle cx="92" cy="42" r="9" fill="#f2b8c6"/><path d="M100 98 q24 4 16 -18" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
      body = `<ellipse cx="65" cy="76" rx="38" ry="36" fill="${c}"/>`;
      front = `<circle cx="65" cy="79" r="3.5" fill="#e58aa0"/>`; break;
    case 'fox':
      back = `<path d="M34 56 L40 20 L60 46 Z" fill="${c}"/><path d="M96 56 L90 20 L70 46 Z" fill="${c}"/><path d="M40 40 L42 30 L50 42Z" fill="#fbe3cf"/><path d="M90 40 L88 30 L80 42Z" fill="#fbe3cf"/>
        <path class="tail" d="M94 100 q32 -4 26 -40 q-10 20 -28 24z" fill="${c}"/><circle cx="119" cy="61" r="6" fill="#fff6ee"/>`;
      body = `<ellipse cx="65" cy="76" rx="38" ry="36" fill="${c}"/>`;
      front = `<ellipse cx="65" cy="88" rx="19" ry="12" fill="#fff4ea"/><ellipse cx="65" cy="80" rx="4" ry="3" fill="${DARK}"/>`; break;
    case 'sheep': {
      const pts = [[30,60],[40,42],[58,34],[76,36],[92,46],[100,64],[98,84],[86,100],[44,100],[30,82]];
      back = pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="16" fill="${c}" stroke="${shade(c, 0, -8)}" stroke-width="1.5"/>`).join('');
      const face = g ? shade('#ecd9c6', g.hue, g.light * 1.5) : '#ecd9c6';
      body = `<ellipse cx="65" cy="72" rx="40" ry="34" fill="${c}"/><ellipse cx="38" cy="66" rx="9" ry="5" fill="${shade(face, 0, -6)}" transform="rotate(-20 38 66)"/><ellipse cx="92" cy="66" rx="9" ry="5" fill="${shade(face, 0, -6)}" transform="rotate(20 92 66)"/><ellipse cx="65" cy="76" rx="25" ry="23" fill="${face}"/>`; break; }
    case 'hedgehog': {
      let p = '';
      for (let i = 0; i <= 14; i++) { const a = Math.PI * (1.05 + 0.9 * i / 14), r = i % 2 ? 36 : 52; p += `${65 + Math.cos(a) * r * 1.05},${80 + Math.sin(a) * r} `; }
      back = `<polygon points="${p}" fill="${shade(c, 0, -16)}"/>`;
      body = `<ellipse cx="65" cy="80" rx="42" ry="32" fill="${c}"/><ellipse cx="65" cy="84" rx="30" ry="24" fill="${shade(c, 0, 26, -10)}"/>`;
      front = `<ellipse cx="65" cy="86" rx="4" ry="3" fill="${DARK}"/>`; break; }
    case 'owl':
      back = `<path d="M34 46 L38 22 L52 38Z" fill="${c}"/><path d="M96 46 L92 22 L78 38Z" fill="${c}"/>`;
      body = `<ellipse cx="28" cy="80" rx="10" ry="22" fill="${shade(c, 0, -14)}"/><ellipse cx="102" cy="80" rx="10" ry="22" fill="${shade(c, 0, -14)}"/><ellipse cx="65" cy="74" rx="38" ry="40" fill="${c}"/><ellipse cx="65" cy="90" rx="24" ry="22" fill="${shade(c, 0, 24, -10)}"/><circle cx="${52 - (g?.spread || 0)}" cy="62" r="12" fill="#fff"/><circle cx="${78 + (g?.spread || 0)}" cy="62" r="12" fill="#fff"/>`;
      front = `<path d="M60 72 L70 72 L65 80Z" fill="#f2c94c"/>`; break;
    case 'axolotl': {
      let gl = '';
      const gc = shade('#e0789a', g?.hue || 0, 0);
      [[-1, 30], [1, 100]].forEach(([s, x]) => { [[-26, 0], [-10, 6], [8, 8]].forEach(([dy, dx]) => {
        const x2 = x + s * (20 + dx), y2 = 62 + dy;
        gl += `<line x1="${x}" y1="68" x2="${x2}" y2="${y2}" stroke="${gc}" stroke-width="5" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="4.5" fill="${gc}"/>`;
      }); });
      back = `<g class="gills">${gl}</g>`; body = `<ellipse cx="65" cy="80" rx="40" ry="32" fill="${c}"/><ellipse cx="65" cy="92" rx="22" ry="12" fill="${shade(c, 0, 12)}"/>`; break; }
    case 'mole':
      body = `<ellipse cx="65" cy="78" rx="40" ry="34" fill="${c}"/><ellipse cx="40" cy="104" rx="11" ry="6" fill="#f0a9bb"/><ellipse cx="90" cy="104" rx="11" ry="6" fill="#f0a9bb"/>`;
      front = `<ellipse cx="65" cy="80" rx="9" ry="7" fill="#f0a9bb"/>`; break;
  }
  const spread = g ? g.spread : 0, er = G.er * (g ? g.eyeScale : 1), style = g ? g.eye : 'round';
  const L = 65 - G.edx - spread, R = 65 + G.edx + spread, ey = G.ey;
  const lid = sp === 'owl' ? '#fff' : c;
  const lash = style === 'lash' ? `<path d="M${L - er * 0.9} ${ey - er * 0.7} l-3 -3 M${L - er * 0.4} ${ey - er * 1.05} l-1.5 -3.5 M${R + er * 0.9} ${ey - er * 0.7} l3 -3 M${R + er * 0.4} ${ey - er * 1.05} l1.5 -3.5" stroke="${DARK}" stroke-width="1.6" stroke-linecap="round"/>` : '';
  const eyes = `<g class="eye-open"><g class="pupils">${eyeShape(style === 'lash' ? 'round' : style, L, ey, er, lid)}${eyeShape(style === 'lash' ? 'round' : style, R, ey, er, lid)}</g>${lash}</g>
    <g class="eye-closed" stroke="${DARK}" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="M${L - 5} ${ey} q5 4 10 0"/><path d="M${R - 5} ${ey} q5 4 10 0"/></g>
    <g class="eye-happy" stroke="${DARK}" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="M${L - 5} ${ey + 1} q5 -6 10 0"/><path d="M${R - 5} ${ey + 1} q5 -6 10 0"/></g>
    <g class="brows" stroke="${DARK}" stroke-width="2" stroke-linecap="round"><path d="M${L - 5} ${ey - er - 5} l8 3"/><path d="M${R + 5} ${ey - er - 5} l-8 3"/></g>`;
  const cheekCol = g ? g.cheek : '#f28fae';
  const cheeks = `<ellipse cx="${L - 8}" cy="${G.cy}" rx="6" ry="3.5" fill="${cheekCol}" opacity=".55"/><ellipse cx="${R + 8}" cy="${G.cy}" rx="6" ry="3.5" fill="${cheekCol}" opacity=".55"/>`;
  const mouth = G.my > 0 ? `<g class="mouth">${mouthShape(g ? g.mouth : 'smile', G.my)}</g><g class="mouth-o"><ellipse cx="65" cy="${G.my + 2}" rx="3.2" ry="4" fill="${DARK}"/></g>` : '';
  const t = G.top, cy = G.cy;
  const hat = `<g class="hat w-party"><path d="M53 ${t + 2} L65 ${t - 26} L77 ${t + 2}Z" fill="#f2c94c"/><path d="M57 ${t - 6} L73 ${t - 8}" stroke="#e57fa8" stroke-width="3"/><circle cx="65" cy="${t - 27}" r="4.5" fill="#e57fa8"/></g>`;
  const scarf = `<g class="scarf w-scarf"><path d="M36 ${cy + 12} q29 14 58 0 l0 8 q-29 14 -58 0z" fill="#d9534f"/><rect x="78" y="${cy + 16}" width="9" height="18" rx="3" fill="#c0443f"/></g>`;
  const flowers = `<g class="w w-flowers">${[-16, -8, 0, 8, 16].map((dx, i) => `<circle cx="${65 + dx}" cy="${t + 6 - Math.abs(dx) * 0.12}" r="5" fill="${['#f28fae', '#f6cf4f', '#ffffff', '#f6cf4f', '#f28fae'][i]}"/><circle cx="${65 + dx}" cy="${t + 6 - Math.abs(dx) * 0.12}" r="1.8" fill="#e8a33d"/>`).join('')}</g>`;
  const bow = `<g class="w w-bow"><path d="M88 ${t + 6} l-10 -7 v14z M88 ${t + 6} l10 -7 v14z" fill="#e57fa8"/><circle cx="88" cy="${t + 6}" r="3.5" fill="#c9557f"/></g>`;
  const star = `<g class="w w-star"><path d="M65 ${cy + 10} l3.5 7 7.5 1 -5.5 5 1.5 7.5 -7 -3.8 -7 3.8 1.5 -7.5 -5.5 -5 7.5 -1z" fill="#f6cf4f" stroke="#d9a92a" stroke-width="1"/></g>`;
  const pumpkin = `<g class="w w-pumpkin"><ellipse cx="65" cy="${t - 2}" rx="17" ry="12" fill="#f08a24"/><path d="M58 ${t - 12} q-4 10 0 20 M72 ${t - 12} q4 10 0 20" stroke="#d06a10" stroke-width="2" fill="none"/><rect x="63" y="${t - 19}" width="4" height="7" rx="1.5" fill="#5c7a2e"/><path d="M67 ${t - 15} q8 -6 10 1" stroke="#5c7a2e" stroke-width="2" fill="none"/></g>`;
  const smudge = `<g class="smudge" fill="#8a6a4a" opacity=".45"><ellipse cx="44" cy="92" rx="7" ry="4"/><ellipse cx="88" cy="84" rx="5" ry="3"/><circle cx="74" cy="98" r="2.5"/></g>`;
  const s = g ? g.size : 1;
  const inner = `${L0.back || ''}${back}${body}${markings(g, G, c, sp)}${L0.body || ''}${cheeks}${eyes}${mouth}${front}${L0.face || ''}${smudge}${scarf}${star}${bow}${flowers}${pumpkin}${hat}${L0.head || ''}${L0.hand || ''}`;
  return `<svg viewBox="0 0 130 120" overflow="visible" aria-hidden="true"${g ? ` data-genes="${g.eye} ${g.mark} ${g.mouth}"` : ''}>${L0.ground || ''}<g transform="translate(65 ${G.feet}) scale(${s}) translate(-65 -${G.feet})">${inner}</g>${L0.front || ''}</svg>`;
}

export function eggArt(sp) {
  const c = SPECIES[sp].c;
  return `<svg viewBox="0 0 120 140" aria-hidden="true"><ellipse cx="60" cy="76" rx="40" ry="52" fill="#fbf6ea" stroke="#e7dcc4" stroke-width="2"/>
    <circle cx="44" cy="58" r="7" fill="${c}"/><circle cx="74" cy="46" r="5" fill="${c}"/><circle cx="78" cy="88" r="9" fill="${c}"/><circle cx="46" cy="100" r="5" fill="${c}"/></svg>`;
}
