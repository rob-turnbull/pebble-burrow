// Inside the burrow: a cosy room with a bed, a window onto the real sky, and furniture you collect.
import * as E from './engine.js';
import { art } from './art.js';
import { temperamentOf } from './personality.js';

export const SLOTS = {
  wallL:  { label: 'left wall',   kind: 'wall',  x: 8,  y: 14 },
  wallR:  { label: 'right wall',  kind: 'wall',  x: 74, y: 14 },
  sill:   { label: 'window sill', kind: 'sill',  x: 42, y: 40 },
  floorL: { label: 'left corner', kind: 'floor', x: 4,  y: 62 },
  floorM: { label: 'by the bed',  kind: 'floor', x: 34, y: 66 },
  floorR: { label: 'right corner', kind: 'floor', x: 78, y: 62 }
};

// unlock(s) returns true when it's in the collection; hint says how to get it.
export const FURNITURE = {
  armchair: { label: 'armchair',     e: '🛋️', kinds: ['floor'],         hint: 'when someone grows all the way up',  unlock: s => s.beings.some(b => E.stageOf(b) === 'grown') },
  lamp:     { label: 'lamp',         e: '🪔', kinds: ['floor', 'sill'], hint: 'after your first game',              unlock: s => E.gamesPlayed(s) >= 1 },
  teapot:   { label: 'teapot',       e: '🫖', kinds: ['sill', 'floor'], hint: 'after 10 games',                     unlock: s => E.gamesPlayed(s) >= 10 },
  plant:    { label: 'potted plant', e: '🪴', kinds: ['floor', 'sill'], hint: 'after the first rain on the hill',   unlock: s => has(s, 'wx:rain') },
  books:    { label: 'bookshelf',    e: '📚', kinds: ['wall', 'floor'], hint: 'once the album has 8 keepsakes',     unlock: s => s.album.length >= 8 },
  wheel:    { label: 'cheese wheel', e: '🧀', kinds: ['sill', 'floor'], hint: 'after 25 feasts',                    unlock: s => s.beings.reduce((a, b) => a + E.count(b, 'feasts'), 0) >= 25 },
  globe:    { label: 'snow globe',   e: '🔮', kinds: ['sill'],          hint: 'after the first snow',               unlock: s => has(s, 'wx:snow') },
  pumpkin:  { label: 'pumpkin',      e: '🎃', kinds: ['floor', 'sill'], hint: 'at halloween',                       unlock: s => has(s, 'halloween:') },
  lights:   { label: 'string lights', e: '✨', kinds: ['wall'],         hint: 'in the winter lights season',        unlock: s => has(s, 'lights:') },
  cake:     { label: 'birthday cake', e: '🎂', kinds: ['sill', 'floor'], hint: 'on your birthday',                  unlock: s => has(s, 'bday:') },
  painting: { label: 'painting',     e: '🖼️', kinds: ['wall'],          hint: 'when a postcard arrives',            unlock: s => has(s, 'post:') },
  clock:    { label: 'little clock', e: '🕰️', kinds: ['wall', 'sill'],  hint: 'after 14 days together',             unlock: s => Math.max(0, ...s.beings.map(b => b.days.length)) >= 14 }
};
const has = (s, prefix) => s.album.some(k => k.k.startsWith(prefix));

export const unlocked = s => Object.keys(FURNITURE).filter(id => FURNITURE[id].unlock(s));
export const fits = (item, slot) => FURNITURE[item]?.kinds.includes(SLOTS[slot].kind);

/** Where a being likes to be. Only grown beings choose; it has to be in the room. */
const LIKES = { shy: ['armchair', 'plant', 'books'], bouncy: ['pumpkin', 'cake', 'wheel'], sleepy: ['armchair', 'lamp', 'teapot'], curious: ['books', 'globe', 'clock'], bold: ['wheel', 'lamp', 'clock'] };
export function favouriteSpot(s, b) {
  if (E.stageOf(b) !== 'grown') return null;
  const placed = Object.entries(s.room || {}).filter(([, v]) => v?.item).map(([slot, v]) => ({ slot, item: v.item }));
  for (const want of LIKES[temperamentOf(b)] || []) { const p = placed.find(x => x.item === want && SLOTS[x.slot].kind === 'floor'); if (p) return p; }
  return null;
}

export function place(s, slot, item, now = Date.now()) {
  s.room = s.room || {};
  s.room[slot] = { item: item || '', at: now };
  s.updatedAt = Math.max(s.updatedAt || 0, now);
}

/** The room scene. `arranging` shows slot outlines; beings keep the `.being` class so the tray works inside too. */
export function roomHTML(s, { arranging = false, pick = '', draw = b => art(b.sp) } = {}) {
  const room = s.room || {};
  const slots = Object.entries(SLOTS).map(([id, sl]) => {
    const item = room[id]?.item;
    return `<button class="slot ${sl.kind} ${item ? 'filled' : ''} ${arranging ? 'arranging' : ''} ${pick === id ? 'picking' : ''}" data-slot="${id}" style="left:${sl.x}%;top:${sl.y}%"
      ${arranging ? '' : 'tabindex="-1" aria-hidden="true"'} aria-label="${sl.label}${item ? ': ' + FURNITURE[item].label : ', empty'}">
      ${item ? `<span class="furn f-${item}">${FURNITURE[item].e}</span>` : arranging ? '<span class="plus">+</span>' : ''}</button>`;
  }).join('');
  const inBed = [], up = [];
  s.beings.forEach((b, i) => (b.napping ? inBed : up).push(i));
  const standing = up.map((i, k) => {
    const b = s.beings[i], spot = favouriteSpot(s, b);
    const left = spot ? Math.min(78, SLOTS[spot.slot].x + 4) : (up.length === 1 ? 44 : 30 + k * 30);
    return `<button class="being inroom" data-i="${i}" style="left:${left}%" aria-label="${b.name}">${draw(b)}<span class="shadow"></span></button>`;
  }).join('');
  const sleepers = inBed.map((i, k) => `<button class="being inbed napping" data-i="${i}" style="left:${8 + k * 34}%" aria-label="${s.beings[i].name}, asleep in bed">${draw(s.beings[i])}</button>`).join('');
  return `
    <div class="room-wall"></div>
    <div class="window" aria-hidden="true"><div class="pane"><span class="w-orb"></span><span class="w-wx"></span></div></div>
    ${room.wallL?.item === 'lights' || room.wallR?.item === 'lights' ? '<span class="lights-strand"></span>' : ''}
    <div class="room-floor"><span class="rug"></span></div>
    <div class="bed" aria-hidden="true"><span class="pillow"></span><div class="sleepers">${sleepers}</div><span class="blanket"></span></div>
    ${slots}
    <div class="beings room-beings">${standing}</div>`;
}
