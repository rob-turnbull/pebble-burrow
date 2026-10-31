// Photo mode: paint what's on the hill into a picture, props and all.
// Photos stay on this device (they're too big for the synced save); you can save or post them.
const KEY = 'pebble-burrow-photos', MAX = 12;

export function list() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
function keep(photos) {
  for (let n = photos.length; n > 0; n--) { try { localStorage.setItem(KEY, JSON.stringify(photos.slice(0, n))); return n; } catch { /* storage full: keep fewer */ } }
  return 0;
}
export function add(p) { const all = [p, ...list()].slice(0, MAX); keep(all); return all; }
export function remove(id) { const all = list().filter(p => p.id !== id); keep(all); return all; }

const colours = str => (str.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/gi) || []);

/** Render the stage element into a JPEG data URL. */
export async function snapshot(stage, caption = '') {
  const R = stage.getBoundingClientRect(), W = Math.round(R.width), H = Math.round(R.height), k = 2;
  const cv = document.createElement('canvas'); cv.width = W * k; cv.height = H * k;
  const g = cv.getContext('2d'); g.scale(k, k);
  const rel = el => { const r = el.getBoundingClientRect(); return { x: r.left - R.left, y: r.top - R.top, w: r.width, h: r.height }; };
  const css = (el, p) => getComputedStyle(el)[p];
  const visible = el => css(el, 'display') !== 'none' && css(el, 'visibility') !== 'hidden' && +css(el, 'opacity') > 0.02;

  // sky
  const sky = colours(css(stage, 'backgroundImage'));
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, sky[0] || '#bcdaf3'); grad.addColorStop(0.78, sky[1] || '#eef4f6'); grad.addColorStop(1, sky[1] || '#eef4f6');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  if (stage.dataset.phase === 'night') { g.fillStyle = '#fff'; for (let i = 0; i < 40; i++) { g.globalAlpha = 0.3 + ((i * 37) % 7) / 10; g.fillRect((i * 97) % W, (i * 53) % (H * 0.55), 1.5, 1.5); } g.globalAlpha = 1; }
  const dim = stage.querySelector('.sky-dim');
  if (dim && visible(dim)) { g.globalAlpha = +css(dim, 'opacity'); g.fillStyle = css(dim, 'backgroundColor'); g.fillRect(0, 0, W, H); g.globalAlpha = 1; }

  // rainbow
  const rb = stage.querySelector('.rainbow');
  if (rb && +css(rb, 'opacity') > 0.1) { const r = rel(rb); ['#e57373', '#eb9459', '#f6cf4f', '#86c46f', '#7fb8d6', '#b48ce0'].forEach((c, i) => { g.strokeStyle = c; g.globalAlpha = 0.55; g.lineWidth = r.w * 0.04; g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h, r.w * (0.5 - 0.04 * i) * 0.96, Math.PI, 0); g.stroke(); }); g.globalAlpha = 1; }

  // sun or moon
  const orb = stage.querySelector('.orb');
  if (orb && visible(orb)) { const r = rel(orb); g.globalAlpha = +css(orb, 'opacity'); g.fillStyle = css(orb, 'backgroundColor'); g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, 7); g.fill(); g.globalAlpha = 1; }

  // clouds
  stage.querySelectorAll('.wx-clouds span').forEach(c => { const r = rel(c); if (r.x > W || r.x + r.w < 0) return; g.fillStyle = css(c, 'backgroundColor'); g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, 7); g.ellipse(r.x + r.w * 0.36, r.y, r.h * 0.68, r.h * 0.68, 0, 0, 7); g.ellipse(r.x + r.w * 0.66, r.y + r.h * 0.1, r.h * 0.53, r.h * 0.53, 0, 0, 7); g.fill(); });

  // hills and door
  stage.querySelectorAll('.hill').forEach(h => { const r = rel(h); g.globalAlpha = +css(h, 'opacity'); g.fillStyle = css(h, 'backgroundColor'); g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h, r.w / 2, r.h, 0, Math.PI, 0); g.fill(); g.globalAlpha = 1; });
  const door = stage.querySelector('.door');
  if (door) { const r = rel(door); g.fillStyle = css(door, 'backgroundColor'); g.beginPath(); g.roundRect ? g.roundRect(r.x, r.y, r.w, r.h, [r.w / 2, r.w / 2, 4, 4]) : g.rect(r.x, r.y, r.w, r.h); g.fill(); const win = door.querySelector('i'); if (win) { const q = rel(win); g.globalAlpha = +css(win, 'opacity'); g.fillStyle = '#f6cf4f'; g.fillRect(q.x, q.y, q.w, q.h); g.globalAlpha = 1; } }

  // flowers, pumpkins, garden soil
  stage.querySelectorAll('.flower').forEach(f => { const r = rel(f); g.fillStyle = css(f, 'backgroundColor'); g.beginPath(); g.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, 0, 7); g.fill(); });
  stage.querySelectorAll('.pumpkin').forEach(p => { const r = rel(p); g.fillStyle = '#f08a24'; g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, 7); g.fill(); });
  stage.querySelectorAll('.gplot').forEach(p => { const r = rel(p); g.fillStyle = css(p, 'backgroundColor'); g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, 7); g.fill(); });

  // beings: their own SVG, minus anything hidden right now
  for (const svg of stage.querySelectorAll('.being svg')) {
    const r = rel(svg); if (!r.w) continue;
    const clone = svg.cloneNode(true), src = [...svg.querySelectorAll('*')], dst = [...clone.querySelectorAll('*')];
    src.forEach((n, i) => { if (getComputedStyle(n).display === 'none') dst[i].remove(); });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', r.w); clone.setAttribute('height', r.h);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    await new Promise(res => { const im = new Image(); im.onload = () => { g.drawImage(im, r.x, r.y, r.w, r.h); res(); }; im.onerror = res; im.src = url; });
  }

  // emoji on the hill: leaves, bats, plants, visitors
  g.textAlign = 'center'; g.textBaseline = 'middle';
  stage.querySelectorAll('.drift, .bat, .gplot i, .visitor').forEach(e => { if (!visible(e)) return; const r = rel(e); g.font = `${Math.round(r.h * 0.72)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`; g.fillText(e.textContent.trim(), r.x + r.w / 2, r.y + r.h / 2); });

  // rain or snow, then frost
  const wx = stage.querySelector('.wx-canvas'); if (wx) g.drawImage(wx, 0, 0, W, H);
  const frost = stage.querySelector('.frost');
  if (frost && +css(frost, 'opacity') > 0.1) { const fg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7); fg.addColorStop(0, '#fff0'); fg.addColorStop(1, '#f2f8ffcc'); g.globalAlpha = +css(frost, 'opacity'); g.fillStyle = fg; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }

  // a little caption
  if (caption) { g.font = '600 12px system-ui, sans-serif'; const tw = g.measureText(caption).width; g.fillStyle = '#ffffffd9'; g.beginPath(); g.roundRect ? g.roundRect(10, H - 30, tw + 20, 22, 11) : g.rect(10, H - 30, tw + 20, 22); g.fill(); g.fillStyle = '#2f2a3a'; g.textAlign = 'left'; g.fillText(caption, 20, H - 19); }
  return cv.toDataURL('image/jpeg', 0.85);
}

/** A smaller copy for postcards (the mailbox takes up to ~90 KB). */
export function shrink(dataUrl, w = 480) {
  return new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = Math.round(im.height * w / im.width); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); let q = 0.8, out = c.toDataURL('image/jpeg', q); while (out.length > 85000 && q > 0.4) { q -= 0.1; out = c.toDataURL('image/jpeg', q); } res(out); }; im.src = dataUrl; });
}
