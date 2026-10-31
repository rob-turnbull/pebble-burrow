// The night sky: the moon's real phase, meteor showers, and when a shooting star is likely.
const SYNODIC = 29.530588853;                          // days from new moon to new moon
const NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);           // a known new moon

/** Phase of the moon. age: days since new moon; lit: fraction illuminated (0..1); waxing; name. */
export function moonPhase(date = new Date()) {
  const days = (date.getTime() - NEW_MOON) / 864e5;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const lit = (1 - Math.cos(2 * Math.PI * age / SYNODIC)) / 2;
  const waxing = age < SYNODIC / 2;
  const names = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
  const name = names[Math.floor(((age / SYNODIC) * 8) + 0.5) % 8];
  return { age, lit, waxing, name, full: name === 'full moon', new: name === 'new moon' };
}

/** SVG moon showing the phase (dark side drawn in the sky colour). */
export function moonSVG(p, dark = 'var(--top)') {
  const r = 18, k = Math.cos(2 * Math.PI * p.age / SYNODIC);      // terminator curve: 1 at new, -1 at full
  const sweepLit = p.waxing ? 1 : 0;
  // lit region: one half-circle + an elliptical arc for the terminator
  const rx = Math.abs(k) * r;
  const outer = `M20 2 A${r} ${r} 0 0 ${sweepLit} 20 38`;
  const term = `A${rx.toFixed(2)} ${r} 0 0 ${(k > 0) === p.waxing ? 0 : 1} 20 2`;
  return `<svg viewBox="0 0 40 40" class="moon-svg" aria-hidden="true"><circle cx="20" cy="20" r="${r}" fill="${dark}" opacity=".35"/><path d="${outer} ${term}Z" fill="#eef0ff"/><circle cx="14" cy="15" r="2.4" fill="#d6d9f0" opacity=".7"/><circle cx="24" cy="26" r="3" fill="#d6d9f0" opacity=".6"/></svg>`;
}

// Major annual meteor showers: [month (0-11), peak day, name]
const SHOWERS = [[0, 3, 'Quadrantids'], [3, 22, 'Lyrids'], [4, 6, 'Eta Aquariids'], [7, 12, 'Perseids'], [9, 21, 'Orionids'], [10, 17, 'Leonids'], [11, 14, 'Geminids']];

/** The meteor shower peaking tonight (within a day), or null. */
export function meteorShower(date = new Date()) {
  for (const [m, d, name] of SHOWERS) {
    const peak = new Date(date.getFullYear(), m, d, 12);
    if (Math.abs(date - peak) <= 1.5 * 864e5) return name;
  }
  return null;
}

/** Average seconds between shooting stars right now (0 = none). */
export function starRate({ phase, kind, date = new Date() }) {
  if (phase !== 'night' || (kind && kind !== 'clear')) return 0;
  const shower = meteorShower(date), moon = moonPhase(date);
  let gap = shower ? 25 : 150;
  if (moon.lit > 0.85) gap *= 1.6;                        // a bright moon washes out the faint ones
  return gap;
}
