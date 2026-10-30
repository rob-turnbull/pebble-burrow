// Original procedural being illustrations (SVG strings).
import { SPECIES } from './data.js';

export function art(sp) {
  const S = SPECIES[sp], c = S.c, dark = '#2b2230';
  let back = '', body = '', front = '', ey = 66, edx = 12, er = 5, cy = 76, my = 78;
  switch (sp) {
    case 'frog':
      back = `<circle cx="46" cy="44" r="15" fill="${c}"/><circle cx="84" cy="44" r="15" fill="${c}"/>`;
      body = `<ellipse cx="65" cy="78" rx="44" ry="32" fill="${c}"/><ellipse cx="65" cy="88" rx="27" ry="17" fill="#d8eeba"/>`;
      ey = 44; edx = 19; cy = 66; my = 68; break;
    case 'mouse':
      back = `<circle cx="38" cy="42" r="17" fill="${c}"/><circle cx="38" cy="42" r="9" fill="#f2b8c6"/><circle cx="92" cy="42" r="17" fill="${c}"/><circle cx="92" cy="42" r="9" fill="#f2b8c6"/><path d="M100 98 q24 4 16 -18" stroke="${c}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
      body = `<ellipse cx="65" cy="76" rx="38" ry="36" fill="${c}"/>`;
      front = `<circle cx="65" cy="79" r="3.5" fill="#e58aa0"/>`; ey = 68; my = 84; cy = 80; break;
    case 'fox':
      back = `<path d="M34 56 L40 20 L60 46 Z" fill="${c}"/><path d="M96 56 L90 20 L70 46 Z" fill="${c}"/><path d="M40 40 L42 30 L50 42Z" fill="#fbe3cf"/><path d="M90 40 L88 30 L80 42Z" fill="#fbe3cf"/>
        <path d="M94 100 q32 -4 26 -40 q-10 20 -28 24z" fill="${c}"/><circle cx="119" cy="61" r="6" fill="#fff6ee"/>`;
      body = `<ellipse cx="65" cy="76" rx="38" ry="36" fill="${c}"/>`;
      front = `<ellipse cx="65" cy="88" rx="19" ry="12" fill="#fff4ea"/><ellipse cx="65" cy="80" rx="4" ry="3" fill="${dark}"/>`; ey = 67; my = 86; break;
    case 'sheep': {
      const pts = [[30,60],[40,42],[58,34],[76,36],[92,46],[100,64],[98,84],[86,100],[44,100],[30,82]];
      back = pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="16" fill="${c}" stroke="#e2dcea" stroke-width="1.5"/>`).join('');
      body = `<ellipse cx="65" cy="72" rx="40" ry="34" fill="${c}"/><ellipse cx="38" cy="66" rx="9" ry="5" fill="#e3cdb8" transform="rotate(-20 38 66)"/><ellipse cx="92" cy="66" rx="9" ry="5" fill="#e3cdb8" transform="rotate(20 92 66)"/><ellipse cx="65" cy="76" rx="25" ry="23" fill="#ecd9c6"/>`;
      ey = 72; edx = 9; er = 4; cy = 82; my = 84; break; }
    case 'hedgehog': {
      let p = '';
      for (let i = 0; i <= 14; i++) { const a = Math.PI * (1.05 + 0.9 * i / 14), r = i % 2 ? 36 : 52; p += `${65 + Math.cos(a) * r * 1.05},${80 + Math.sin(a) * r} `; }
      back = `<polygon points="${p}" fill="#7c5c47"/>`;
      body = `<ellipse cx="65" cy="80" rx="42" ry="32" fill="${c}"/><ellipse cx="65" cy="84" rx="30" ry="24" fill="#ecd3b6"/>`;
      front = `<ellipse cx="65" cy="86" rx="4" ry="3" fill="${dark}"/>`; ey = 76; edx = 11; cy = 86; my = 92; break; }
    case 'owl':
      back = `<path d="M34 46 L38 22 L52 38Z" fill="${c}"/><path d="M96 46 L92 22 L78 38Z" fill="${c}"/>`;
      body = `<ellipse cx="28" cy="80" rx="10" ry="22" fill="#7d89b0"/><ellipse cx="102" cy="80" rx="10" ry="22" fill="#7d89b0"/><ellipse cx="65" cy="74" rx="38" ry="40" fill="${c}"/><ellipse cx="65" cy="90" rx="24" ry="22" fill="#e1e6f4"/><circle cx="52" cy="62" r="12" fill="#fff"/><circle cx="78" cy="62" r="12" fill="#fff"/>`;
      front = `<path d="M60 72 L70 72 L65 80Z" fill="#f2c94c"/>`; ey = 62; edx = 13; er = 6; cy = 74; my = -99; break;
    case 'axolotl': {
      let g = '';
      [[-1, 30], [1, 100]].forEach(([s, x]) => { [[-26, 0], [-10, 6], [8, 8]].forEach(([dy, dx]) => {
        const x2 = x + s * (20 + dx), y2 = 62 + dy;
        g += `<line x1="${x}" y1="68" x2="${x2}" y2="${y2}" stroke="#e0789a" stroke-width="5" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="4.5" fill="#e0789a"/>`;
      }); });
      back = g; body = `<ellipse cx="65" cy="80" rx="40" ry="32" fill="${c}"/><ellipse cx="65" cy="92" rx="22" ry="12" fill="#fbd2de"/>`;
      ey = 74; edx = 17; cy = 84; my = 86; break; }
    case 'mole':
      body = `<ellipse cx="65" cy="78" rx="40" ry="34" fill="${c}"/><ellipse cx="40" cy="104" rx="11" ry="6" fill="#f0a9bb"/><ellipse cx="90" cy="104" rx="11" ry="6" fill="#f0a9bb"/>`;
      front = `<ellipse cx="65" cy="80" rx="9" ry="7" fill="#f0a9bb"/>`; ey = 66; edx = 13; er = 3; cy = 78; my = 92; break;
  }
  const L = 65 - edx, R = 65 + edx;
  const eyes = `<g class="eye-open"><circle cx="${L}" cy="${ey}" r="${er}" fill="${dark}"/><circle cx="${R}" cy="${ey}" r="${er}" fill="${dark}"/><circle cx="${L + 1.6}" cy="${ey - 1.8}" r="${er * 0.32}" fill="#fff"/><circle cx="${R + 1.6}" cy="${ey - 1.8}" r="${er * 0.32}" fill="#fff"/></g>
    <g class="eye-closed" stroke="${dark}" stroke-width="2.4" fill="none" stroke-linecap="round"><path d="M${L - 5} ${ey} q5 4 10 0"/><path d="M${R - 5} ${ey} q5 4 10 0"/></g>`;
  const cheeks = `<ellipse cx="${L - 8}" cy="${cy}" rx="6" ry="3.5" fill="#f28fae" opacity=".55"/><ellipse cx="${R + 8}" cy="${cy}" rx="6" ry="3.5" fill="#f28fae" opacity=".55"/>`;
  const mouth = my > 0 ? `<path d="M60 ${my} q5 5 10 0" stroke="${dark}" stroke-width="2.2" fill="none" stroke-linecap="round"/>` : '';
  const t = S.top;
  const hat = `<g class="hat"><path d="M53 ${t + 2} L65 ${t - 26} L77 ${t + 2}Z" fill="#f2c94c"/><path d="M57 ${t - 6} L73 ${t - 8}" stroke="#e57fa8" stroke-width="3"/><circle cx="65" cy="${t - 27}" r="4.5" fill="#e57fa8"/></g>`;
  const scarf = `<g class="scarf"><path d="M36 ${cy + 12} q29 14 58 0 l0 8 q-29 14 -58 0z" fill="#d9534f"/><rect x="78" y="${cy + 16}" width="9" height="18" rx="3" fill="#c0443f"/></g>`;
  // wearables, shown by CSS when the being's data-wear matches (or by the season)
  const flowers = `<g class="w w-flowers">${[-16,-8,0,8,16].map((dx,i)=>`<circle cx="${65+dx}" cy="${t + 6 - Math.abs(dx)*0.12}" r="5" fill="${['#f28fae','#f6cf4f','#ffffff','#f6cf4f','#f28fae'][i]}"/><circle cx="${65+dx}" cy="${t + 6 - Math.abs(dx)*0.12}" r="1.8" fill="#e8a33d"/>`).join('')}</g>`;
  const bow = `<g class="w w-bow"><path d="M88 ${t+6} l-10 -7 v14z M88 ${t+6} l10 -7 v14z" fill="#e57fa8"/><circle cx="88" cy="${t+6}" r="3.5" fill="#c9557f"/></g>`;
  const star = `<g class="w w-star"><path d="M65 ${cy+10} l3.5 7 7.5 1 -5.5 5 1.5 7.5 -7 -3.8 -7 3.8 1.5 -7.5 -5.5 -5 7.5 -1z" fill="#f6cf4f" stroke="#d9a92a" stroke-width="1"/></g>`;
  const pumpkin = `<g class="w w-pumpkin"><ellipse cx="65" cy="${t-2}" rx="17" ry="12" fill="#f08a24"/><path d="M58 ${t-12} q-4 10 0 20 M72 ${t-12} q4 10 0 20" stroke="#d06a10" stroke-width="2" fill="none"/><rect x="63" y="${t-19}" width="4" height="7" rx="1.5" fill="#5c7a2e"/><path d="M67 ${t-15} q8 -6 10 1" stroke="#5c7a2e" stroke-width="2" fill="none"/></g>`;
  const smudge = `<g class="smudge" fill="#8a6a4a" opacity=".45"><ellipse cx="44" cy="92" rx="7" ry="4"/><ellipse cx="88" cy="84" rx="5" ry="3"/><circle cx="74" cy="98" r="2.5"/></g>`;
  return `<svg viewBox="0 0 130 120" aria-hidden="true">${back}${body}${cheeks}${eyes}${mouth}${front}${smudge}${scarf.replace('class="scarf"','class="scarf w-scarf"')}${star}${bow}${flowers}${pumpkin}${hat.replace('class="hat"','class="hat w-party"')}</svg>`;
}

export function eggArt(sp) {
  const c = SPECIES[sp].c;
  return `<svg viewBox="0 0 120 140" aria-hidden="true"><ellipse cx="60" cy="76" rx="40" ry="52" fill="#fbf6ea" stroke="#e7dcc4" stroke-width="2"/>
    <circle cx="44" cy="58" r="7" fill="${c}"/><circle cx="74" cy="46" r="5" fill="${c}"/><circle cx="78" cy="88" r="9" fill="${c}"/><circle cx="46" cy="100" r="5" fill="${c}"/></svg>`;
}
