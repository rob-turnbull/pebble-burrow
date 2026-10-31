// Every sound is synthesised with Web Audio: no files to host or license.
// Off until the person taps the speaker; the choice is remembered on this device.
const KEY = 'pebble-burrow-sound';
const HKEY = 'pebble-burrow-haptics';
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v === '1'; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch {} };

let ctx = null, master = null, amb = null, ambKind = '', noiseBuf = null;
export let enabled = read(KEY, false);
export let haptics = read(HKEY, true);

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // brown noise
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Call from a tap. Returns the new state. */
export function toggle() {
  enabled = !enabled; write(KEY, enabled);
  if (enabled) { ensure(); play('chirp', { pitch: 1.2 }); } else { stopAmbience(); }
  return enabled;
}
export function setHaptics(v) { haptics = !!v; write(HKEY, haptics); if (haptics) buzz([12]); }
export const canBuzz = () => typeof navigator !== 'undefined' && 'vibrate' in navigator;
export function buzz(pattern) { if (haptics && canBuzz()) try { navigator.vibrate(pattern); } catch {} }

/* ---------------- building blocks ---------------- */
function tone({ type = 'sine', f0, f1 = f0, t = 0, dur = 0.2, vol = 0.3, attack = 0.01, glide = 'exp', out = master }) {
  const c = ctx, now = c.currentTime + t, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, now);
  if (f1 !== f0) glide === 'exp' ? o.frequency.exponentialRampToValueAtTime(f1, now + dur) : o.frequency.linearRampToValueAtTime(f1, now + dur);
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(vol, now + attack); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(out); o.start(now); o.stop(now + dur + 0.05);
  return o;
}
function noise({ t = 0, dur = 0.08, vol = 0.25, freq = 900, q = 1, type = 'lowpass' }) {
  const c = ctx, now = c.currentTime + t, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(vol, now + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  s.connect(f).connect(g).connect(master); s.start(now, Math.random()); s.stop(now + dur + 0.05);
}

/* ---------------- the sounds ---------------- */
const SOUNDS = {
  munch()   { for (let i = 0; i < 4; i++) noise({ t: i * 0.16, dur: 0.07, vol: 0.35, freq: 700 + Math.random() * 500, q: 2 }); },
  boing()   { const o = tone({ type: 'sine', f0: 160, f1: 520, dur: 0.18, vol: 0.32 }); tone({ type: 'sine', f0: 520, f1: 220, t: 0.18, dur: 0.38, vol: 0.28 });
              const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 18; lg.gain.value = 22; lfo.connect(lg).connect(o.frequency); lfo.start(); lfo.stop(ctx.currentTime + 0.6); },
  hug()     { [262, 330, 392].forEach((f, i) => tone({ type: 'triangle', f0: f, t: i * 0.04, dur: 0.9, vol: 0.12, attack: 0.08 })); },
  sparkle() { [784, 988, 1175, 1568].forEach((f, i) => tone({ type: 'triangle', f0: f, t: i * 0.07, dur: 0.35, vol: 0.12 })); },
  grow()    { [392, 494, 587, 784, 988].forEach((f, i) => tone({ type: 'triangle', f0: f, t: i * 0.11, dur: 0.5, vol: 0.13 })); },
  bubble()  { tone({ type: 'sine', f0: 600 + Math.random() * 600, f1: 1400 + Math.random() * 500, dur: 0.07, vol: 0.12 }); },
  tap()     { tone({ type: 'sine', f0: 880, f1: 660, dur: 0.06, vol: 0.12 }); },
  secret()  { tone({ type: 'sine', f0: 523, f1: 392, dur: 0.25, vol: 0.12 }); tone({ type: 'sine', f0: 392, f1: 523, t: 0.22, dur: 0.3, vol: 0.12 }); },
  chirp({ pitch = 1 } = {}) { tone({ type: 'sine', f0: 700 * pitch, f1: 1000 * pitch, dur: 0.07, vol: 0.14 }); tone({ type: 'sine', f0: 900 * pitch, f1: 1200 * pitch, t: 0.09, dur: 0.08, vol: 0.12 }); },
  coin()    { tone({ type: 'square', f0: 988, dur: 0.07, vol: 0.06 }); tone({ type: 'square', f0: 1319, t: 0.07, dur: 0.2, vol: 0.06 }); },
  miss()    { tone({ type: 'triangle', f0: 330, f1: 262, dur: 0.18, vol: 0.1 }); },
  note({ i = 0 } = {}) { tone({ type: 'triangle', f0: [392, 494, 587, 698][i % 4], dur: 0.32, vol: 0.18 }); },
  thunder() { noise({ dur: 2.2, vol: 0.5, freq: 160, q: 0.7 }); noise({ t: 0.15, dur: 1.6, vol: 0.3, freq: 90, q: 0.5 }); },
  shutter() { noise({ dur: 0.05, vol: 0.4, freq: 3000, q: 0.8, type: 'highpass' }); noise({ t: 0.08, dur: 0.06, vol: 0.3, freq: 2400, q: 0.8, type: 'highpass' }); },
  post()    { [659, 880].forEach((f, i) => tone({ type: 'sine', f0: f, t: i * 0.12, dur: 0.4, vol: 0.14 })); }
};

export function play(name, opts) {
  if (!enabled || !SOUNDS[name] || !ensure()) return;
  try { SOUNDS[name](opts); } catch { /* audio is a nicety, never an error */ }
}

/** Voice pitch for a being: small beings squeak higher. */
export const voiceOf = sp => ({ mouse: 1.5, axolotl: 1.35, frog: 1.1, fox: 1.2, owl: 0.85, sheep: 1.0, hedgehog: 1.25, mole: 0.9 })[sp] || 1;

/* ---------------- ambience ---------------- */
function stopAmbience() { if (amb) { const a = amb; amb = null; ambKind = ''; try { a.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4); setTimeout(() => a.nodes.forEach(n => n.stop?.()), 1500); } catch {} } }

/** Rain on the burrow roof, wind for storms, crickets on clear nights. */
export function ambience(kind, phase) {
  const want = !enabled ? '' : (kind === 'rain' || kind === 'drizzle' || kind === 'storm') ? kind : (phase === 'night' && (kind === 'clear' || kind === 'clouds')) ? 'night' : '';
  if (want === ambKind) return;
  stopAmbience(); if (!want || !ensure()) return;
  const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(master);
  const nodes = [];
  if (want === 'night') {
    const iv = setInterval(() => { if (!amb) return clearInterval(iv); if (Math.random() < 0.5) for (let k = 0; k < 3; k++) tone({ type: 'sine', f0: 4200 + Math.random() * 300, t: k * 0.06, dur: 0.04, vol: 0.025, out: g }); }, 900);
    nodes.push({ stop: () => clearInterval(iv) });
  } else {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), hi = ctx.createBiquadFilter();
    s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = want === 'drizzle' ? 2400 : 1500; f.Q.value = 0.6; hi.type = 'highpass'; hi.frequency.value = 400;
    s.connect(f).connect(hi).connect(g); s.start(); nodes.push(s);
  }
  g.gain.setTargetAtTime({ night: 0.9, drizzle: 0.12, rain: 0.22, storm: 0.32 }[want], ctx.currentTime, 1.2);
  amb = { g, nodes }; ambKind = want;
}
