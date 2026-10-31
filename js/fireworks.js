// New year's eve fireworks over the hill. Pauses while the page is hidden; skipped for reduced motion.
export function startFireworks(cv, onBurst = () => {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const g = cv.getContext('2d'), parts = []; let last = 0;
  const size = () => { cv.width = cv.clientWidth; cv.height = cv.clientHeight; }; size();
  const cols = ['#f6cf4f', '#e57fa8', '#7fb8d6', '#86c46f', '#ffffff', '#eb9459'];
  const loop = t => {
    if (!cv.isConnected) return;
    if (document.visibilityState === 'visible') {
      if (t - last > 1100 + Math.random() * 900) { last = t; const x = cv.width * (0.15 + Math.random() * 0.7), y = cv.height * (0.12 + Math.random() * 0.3), c = cols[Math.floor(Math.random() * cols.length)];
        for (let i = 0; i < 64; i++) { const a = i / 64 * 6.283, v = 1.6 + Math.random() * 2.2; parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c }); }
        onBurst(); }
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.34)'; g.fillRect(0, 0, cv.width, cv.height); g.globalCompositeOperation = 'lighter';   // fading trails
      for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.02; p.vx *= 0.97; p.vy *= 0.97; p.life -= 0.017; if (p.life <= 0) { parts.splice(i, 1); continue; } g.globalAlpha = p.life; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, 2.4, 0, 6.283); g.fill(); }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
