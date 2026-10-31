// Three tiny, no-lose games. Each runs in an overlay and calls done(score) at the end.
// Sounds and haptics come in through `fx` so the games stay independent of the rest of the app.
export const GAMES = {
  catch: { label: 'catch the cheese', icon: '🧀', blurb: 'move left and right to catch falling cheese', seconds: 30 },
  seek:  { label: 'hide and seek',    icon: '🌿', blurb: 'they hide behind something on the hill. find them!', seconds: 40 },
  copy:  { label: 'copy the pattern', icon: '🌼', blurb: 'watch the flowers light up, then tap them in the same order', seconds: 45, grownOnly: true }
};

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param kind  'catch' | 'seek' | 'copy'
 * @param opts  { being: {name, art}, fx: {play(name,opts), buzz(pattern)}, done(score) }
 */
export function openGame(kind, { being, fx, done }) {
  const g = GAMES[kind];
  const root = el('div', 'modal', `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${g.label}">
      <div class="sheet-top"><strong>${g.icon} ${g.label}</strong><span class="score" aria-live="polite">0</span><button class="ghost" data-close>stop</button></div>
      <div class="timer"><i></i></div>
      <div class="arena"></div>
      <p class="hint">${g.blurb}</p>
    </div>`);
  document.body.appendChild(root);
  root.querySelector('.sheet-top [data-close]').focus();
  root.addEventListener('keydown', e => { if (e.key !== 'Tab') return; const f = [...root.querySelectorAll('button')].filter(x => x.offsetParent !== null); if (!f.length) return; if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); } });
  const arena = root.querySelector('.arena'), scoreEl = root.querySelector('.score'), bar = root.querySelector('.timer i');
  let score = 0, over = false, cleanup = () => {};
  const setScore = n => { score = n; scoreEl.textContent = n; };
  const started = performance.now(), total = g.seconds * 1000;
  const clock = setInterval(() => { const left = Math.max(0, 1 - (performance.now() - started) / total); bar.style.width = left * 100 + '%'; if (left <= 0) finish(); }, 100);

  function finish() {
    if (over) return; over = true; clearInterval(clock); cleanup();
    arena.innerHTML = ''; root.querySelector('.hint').textContent = '';
    const end = el('div', 'endcard', `<div class="end-art">${being.art}</div><p class="end-title">${kind === 'catch' ? `${score} ${score === 1 ? 'cheese' : 'cheeses'} caught!` : kind === 'seek' ? `found ${being.name} ${score} ${score === 1 ? 'time' : 'times'}!` : `longest pattern: ${score}`}</p><p class="hint" data-reward></p><button class="big" data-close>back to the hill</button>`);
    arena.appendChild(end);
    const reward = done(score);
    end.querySelector('[data-reward]').textContent = reward || '';
    end.querySelector('[data-close]').onclick = close;
    end.querySelector('[data-close]').focus();
    fx.play('sparkle');
  }
  function close() { if (!over) { over = true; clearInterval(clock); cleanup(); done(score); } root.remove(); }
  root.querySelector('.sheet-top [data-close]').onclick = () => over ? root.remove() : finish();
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { over ? root.remove() : finish(); } });

  cleanup = ({ catch: catchGame, seek: seekGame, copy: copyGame }[kind])(arena, { being, fx, add: n => setScore(score + n), isOver: () => over });
  return { close };
}

/* ---------------- catch the cheese ---------------- */
function catchGame(arena, { being, fx, add, isOver }) {
  const W = () => arena.clientWidth, H = () => arena.clientHeight;
  const player = el('div', 'catcher', being.art); arena.appendChild(player);
  arena.classList.add('arena-catch'); arena.tabIndex = 0;
  let x = 0.5, raf = 0, last = performance.now(), spawn = 0, t0 = last;
  const drops = [];
  const place = () => { player.style.left = `calc(${x * 100}% - 36px)`; };
  const move = cx => { const r = arena.getBoundingClientRect(); x = Math.min(0.94, Math.max(0.06, (cx - r.left) / r.width)); place(); };
  const onPtr = e => move(e.clientX);
  const onKey = e => { if (e.key === 'ArrowLeft') { x = Math.max(0.06, x - 0.08); place(); } if (e.key === 'ArrowRight') { x = Math.min(0.94, x + 0.08); place(); } };
  arena.addEventListener('pointermove', onPtr); arena.addEventListener('pointerdown', onPtr); arena.addEventListener('keydown', onKey);
  place(); arena.focus({ preventScroll: true });
  function tick(now) {
    const dt = Math.min(50, now - last); last = now; const elapsed = (now - t0) / 1000;
    spawn -= dt;
    if (spawn <= 0) {
      const gold = Math.random() < 0.12, d = el('span', 'drop' + (gold ? ' gold' : ''), gold ? '⭐' : '🧀');
      const o = { el: d, x: 0.06 + Math.random() * 0.88, y: -30, v: (0.12 + elapsed * 0.006) * (0.85 + Math.random() * 0.3), gold };
      d.style.left = `calc(${o.x * 100}% - 14px)`; arena.appendChild(d); drops.push(o);
      spawn = Math.max(380, 900 - elapsed * 18);
    }
    const catchY = H() - 70;
    for (let i = drops.length - 1; i >= 0; i--) {
      const o = drops[i]; o.y += o.v * dt; o.el.style.transform = `translateY(${o.y}px)`;
      if (o.y > catchY - 10 && o.y < catchY + 30 && Math.abs(o.x - x) * W() < 44) {
        add(o.gold ? 3 : 1); fx.play(o.gold ? 'coin' : 'munch'); fx.buzz([8]);
        player.classList.remove('chomp'); void player.offsetWidth; player.classList.add('chomp');
        o.el.remove(); drops.splice(i, 1);
      } else if (o.y > H()) { o.el.remove(); drops.splice(i, 1); }
    }
    if (!isOver()) raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(raf); arena.removeEventListener('pointermove', onPtr); arena.removeEventListener('pointerdown', onPtr); arena.removeEventListener('keydown', onKey); arena.classList.remove('arena-catch'); };
}

/* ---------------- hide and seek ---------------- */
function seekGame(arena, { being, fx, add, isOver }) {
  arena.classList.add('arena-seek');
  const spots = ['🌳', '🪨', '🌷', '🍄', '🌿', '🌻'];
  const grid = el('div', 'spots'); arena.appendChild(grid);
  let hide = -1, tries = 0, hintT = 0, round = 0;
  const btns = spots.map((s, i) => { const b = el('button', 'spot', `<span class="cover">${s}</span><span class="peek">${being.art}</span>`); b.setAttribute('aria-label', `look behind the ${['tree', 'rock', 'tulip', 'mushroom', 'bush', 'sunflower'][i]}`); grid.appendChild(b); b.onclick = () => look(i); return b; });
  function hideAgain() {
    if (isOver()) return;
    btns.forEach(b => b.classList.remove('found', 'wrong', 'hint'));
    let n; do { n = Math.floor(Math.random() * spots.length); } while (n === hide && spots.length > 1);
    hide = n; tries = 0; round++;
    clearTimeout(hintT); hintT = setTimeout(() => !isOver() && btns[hide].classList.add('hint'), reduced() ? 1200 : 2500);
  }
  function look(i) {
    if (isOver() || btns[i].classList.contains('found')) return;
    tries++;
    if (i === hide) { btns[i].classList.add('found'); add(tries === 1 ? 2 : 1); fx.play('sparkle'); fx.buzz([20]); clearTimeout(hintT); setTimeout(hideAgain, 900); }
    else { btns[i].classList.remove('wrong'); void btns[i].offsetWidth; btns[i].classList.add('wrong'); fx.play('miss'); if (tries >= 2) btns[hide].classList.add('hint'); }
  }
  hideAgain();
  return () => { clearTimeout(hintT); arena.classList.remove('arena-seek'); };
}

/* ---------------- copy the pattern ---------------- */
function copyGame(arena, { fx, add, isOver }) {
  arena.classList.add('arena-copy');
  const flowers = ['#f28fae', '#f6cf4f', '#7fb8d6', '#86c46f'];
  const wrap = el('div', 'flowers'); arena.appendChild(wrap);
  const status = el('p', 'copy-status', 'watch…'); arena.appendChild(status);
  const btns = flowers.map((c, i) => { const b = el('button', 'flowerbtn', `<span style="--c:${c}"></span>`); b.setAttribute('aria-label', ['pink', 'yellow', 'blue', 'green'][i] + ' flower'); wrap.appendChild(b); b.onclick = () => press(i); return b; });
  let seq = [], pos = 0, listening = false, best = 0, timers = [];
  const later = (f, ms) => timers.push(setTimeout(f, ms));
  const flash = i => { btns[i].classList.add('lit'); fx.play('note', { i }); later(() => btns[i].classList.remove('lit'), 340); };
  function showSeq() {
    listening = false; status.textContent = 'watch…';
    seq.forEach((n, k) => later(() => !isOver() && flash(n), 500 + k * 520));
    later(() => { if (!isOver()) { listening = true; pos = 0; status.textContent = 'your turn'; } }, 500 + seq.length * 520);
  }
  function grow() { seq.push(Math.floor(Math.random() * 4)); showSeq(); }
  function press(i) {
    if (!listening || isOver()) return;
    flash(i);
    if (i !== seq[pos]) {                               // no-lose: just try a shorter one
      fx.play('miss'); listening = false; status.textContent = 'oops, let’s try that again';
      seq = seq.slice(0, Math.max(1, seq.length - 1)); later(showSeq, 900); return;
    }
    pos++;
    if (pos === seq.length) {
      listening = false;
      if (seq.length > best) { add(seq.length - best); best = seq.length; }
      status.textContent = seq.length >= 5 ? 'wow!' : 'yes!'; fx.buzz([15]);
      later(grow, 800);
    }
  }
  grow();
  return () => { timers.forEach(clearTimeout); arena.classList.remove('arena-copy'); };
}
