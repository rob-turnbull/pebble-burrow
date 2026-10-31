// Small signs of life: each being blinks on its own rhythm, glances around, and pulls faces.
// Nothing here touches the save; it only adds and removes classes on the drawn beings.
const BLINK = { sleepy: [5200, 9000, 230], shy: [3600, 7000, 150], curious: [2600, 5200, 120], bouncy: [1900, 4200, 110], bold: [3400, 6400, 140] };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

let pointer = { x: 0, y: 0, t: 0 };
addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY, t: performance.now() }; }, { passive: true });

const els = i => [...document.querySelectorAll(`.being[data-i="${i}"]`)];

/** Briefly add a class to every drawing of being i. */
export function flash(i, cls, ms) {
  els(i).forEach(el => { el.classList.add(cls); clearTimeout(el['_t' + cls]); el['_t' + cls] = setTimeout(() => el.classList.remove(cls), ms); });
}

/**
 * Start the loops. info(i) returns {napping, temper, joy, eyeScale} for being i, or null if gone.
 * Returns a stop() function.
 */
export function startLife(count, info) {
  const timers = [];
  for (let i = 0; i < count; i++) {
    const blinkLoop = () => {
      const b = info(i); if (!b) return;
      const [lo, hi, dur] = BLINK[b.temper] || BLINK.shy;
      if (!b.napping && document.visibilityState === 'visible') {
        flash(i, 'blink', dur);
        if (Math.random() < 0.16) setTimeout(() => flash(i, 'blink', dur), dur + 120);   // a double blink now and then
      }
      timers[i * 2] = setTimeout(blinkLoop, document.visibilityState === 'visible' ? lo + Math.random() * (hi - lo) : 20000);   // rest while hidden
    };
    const gazeLoop = () => {
      const b = info(i); if (!b) return;
      if (!b.napping && !reduced()) look(i, b);
      timers[i * 2 + 1] = setTimeout(gazeLoop, document.visibilityState === 'visible' ? 1400 + Math.random() * 3400 : 20000);
    };
    timers[i * 2] = setTimeout(blinkLoop, 300 + Math.random() * 3000);        // never in sync from the start
    timers[i * 2 + 1] = setTimeout(gazeLoop, 600 + Math.random() * 2000);
  }
  return () => timers.forEach(clearTimeout);
}

function look(i, b) {
  const list = els(i); if (!list.length) return;
  const el = list[0], r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height * 0.45;
  const recentPointer = performance.now() - pointer.t < 4000;
  const roll = Math.random();
  let dx = 0, dy = 0;
  if (recentPointer && roll < 0.6) { dx = pointer.x - cx; dy = pointer.y - cy; }
  else if (roll < 0.35) { const other = document.querySelector(`.being:not([data-i="${i}"])`); if (other) { const o = other.getBoundingClientRect(); dx = o.left + o.width / 2 - cx; dy = o.top + o.height / 2 - cy; } }
  else if (roll < 0.75) { const a = Math.random() * 6.283; dx = Math.cos(a); dy = Math.sin(a) * 0.6; }
  const len = Math.hypot(dx, dy) || 1, max = 1.9 * (b.eyeScale || 1);
  const k = dx || dy ? max : 0;
  list.forEach(e => { e.style.setProperty('--gx', ((dx / len) * k).toFixed(2)); e.style.setProperty('--gy', ((dy / len) * k * 0.75).toFixed(2)); });
  if (b.joy > 80 && Math.random() < 0.08) flash(i, 'happy', 1300);            // a contented squint
}
