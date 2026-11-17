// Toy plastic bricks, synthesized from how they actually sound. A brick is a small hollow
// box of stiff plastic: struck, it rings at a handful of inharmonic plate modes between about
// 2 and 10 kHz, and plastic damps each mode in proportion to its frequency (a loss factor
// near 0.025), so the ring is bright, dry and over in a few milliseconds. A snap is two hits:
// the studs catching, then the brick seating a moment later with a hollow knock from the
// cavity and a soft thump from whatever it sits on. Pressing hard first gives a stick-slip
// creak; pulling a brick off creaks the other way, then lets go with a pop of air. Digging
// through the box is a cascade of small, random clacks.
//
// Everything here is a pure function from a sample rate to samples, so it renders once,
// is cached by the player, and can be tested without a browser.

/** a little seeded random, so each variant sounds the same every time it is rendered */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
}

/** plate modes of a 2×4 brick's top, relative to the lowest, and how strongly a hit excites each */
const PLATE: [number, number][] = [[1, 1], [1.59, 0.9], [2.14, 0.75], [2.65, 0.62], [3.18, 0.5], [3.9, 0.36], [4.6, 0.24]];
const ABS = 0.025;

export interface Hit {
  /** seconds from the start */
  at: number;
  /** lowest plate mode (Hz): smaller bricks ring higher */
  f0: number;
  /** contact time (s): a fingernail or stud is short and bright, a fingertip or a misfit long and dull */
  contact: number;
  gain: number;
  /** the seating knock from the cavity, and the thump of the stack below (0..1) */
  body?: number;
  /** extra damping, for parts held in a hand or a pile */
  damp?: number;
}

/** how much a contact of length T excites frequency f (the spectrum of a half-sine force pulse) */
const excite = (f: number, T: number) => { const x = 2 * f * T; return Math.abs(x - 1) < 1e-6 ? Math.PI / 4 : Math.abs(Math.cos(Math.PI * f * T) / (1 - x * x)); };

export function strike(out: Float32Array, sr: number, h: Hit, r: () => number) {
  const start = Math.round(h.at * sr);
  const modes: [number, number, number][] = PLATE.map(([k, a]) => [h.f0 * k * (0.985 + 0.03 * r()), a, ABS * (h.damp ?? 1)]);
  if (h.body) {
    modes.push([680 * (0.95 + 0.1 * r()), 0.38 * h.body, 0.06]); // the hollow inside
    modes.push([170 * (0.9 + 0.2 * r()), 0.3 * h.body, 0.35]); // the table, through the stack
  }
  for (const [f, a, eta] of modes) {
    if (f > sr * 0.45) continue;
    const tau = 1 / (Math.PI * f * eta), len = Math.min(out.length - start, Math.ceil(tau * 7 * sr));
    const amp = h.gain * a * excite(f, h.contact), w = 2 * Math.PI * f / sr, phase = r() * 0.3;
    // a short rise as long as the contact, so the onset is a push and not a digital step
    const rise = Math.max(1, Math.round(h.contact * sr));
    for (let i = 0; i < len; i++) out[start + i] += amp * Math.sin(w * i + phase) * Math.exp(-i / (tau * sr)) * (i < rise ? Math.sin((Math.PI / 2) * (i / rise)) : 1);
  }
  // the contact itself: a click of broadband noise, brighter the shorter the contact
  const n = Math.max(2, Math.round(h.contact * 2 * sr)), bright = Math.min(1, 0.00025 / h.contact);
  let prev = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const x = (r() * 2 - 1) * Math.sin(Math.PI * i / n);
    out[start + i] += h.gain * 0.35 * bright * (x - prev);
    prev = x;
  }
}

/** stick-slip: tiny hits whose spacing shrinks (pressing on) or grows (pulling off) */
function creak(out: Float32Array, sr: number, at: number, count: number, from: number, to: number, gain: number, f0: number, r: () => number) {
  let t = at;
  for (let k = 0; k < count; k++) {
    const u = k / Math.max(1, count - 1);
    strike(out, sr, { at: t, f0: f0 * 1.3, contact: 0.00012, gain: gain * (0.5 + 0.5 * u) * (0.8 + 0.4 * r()), damp: 2.2 }, r);
    t += from + (to - from) * u;
  }
  return t;
}

/** a puff of air (a brick letting go): low, soft noise */
function puff(out: Float32Array, sr: number, at: number, dur: number, gain: number, r: () => number) {
  const start = Math.round(at * sr), n = Math.round(dur * sr), a = Math.exp(-2 * Math.PI * 450 / sr);
  let y = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    y = a * y + (1 - a) * (r() * 2 - 1);
    out[start + i] += gain * y * Math.sin(Math.PI * i / n);
  }
}

const buffer = (sr: number, seconds: number) => new Float32Array(Math.ceil(sr * seconds));
/** scale to a peak, and fade the very end so nothing clicks off */
export function finish(out: Float32Array, peak: number) {
  let m = 0;
  for (const x of out) m = Math.max(m, Math.abs(x));
  const k = m > 0 ? peak / m : 0, fade = Math.min(out.length, 64);
  for (let i = 0; i < out.length; i++) out[i] *= k * (i >= out.length - fade ? (out.length - i) / fade : 1);
  return out;
}

/* ---------- the sounds ---------- */

/** a brick pressed on: the studs catch, then it seats */
export const snap = (seed: number, size = 1) => (sr: number) => {
  const r = rng(seed), out = buffer(sr, 0.14), f0 = 2250 / size;
  const gap = 0.014 + 0.01 * r();
  strike(out, sr, { at: 0, f0: f0 * 1.08, contact: 0.00011, gain: 0.32 + 0.1 * r() }, r);
  strike(out, sr, { at: gap, f0, contact: 0.00018, gain: 1, body: 0.8 + 0.2 * r() }, r);
  return finish(out, 0.9);
};

/** pressed hard: a creak, then the snap */
export const press = (seed: number, size = 1) => (sr: number) => {
  const r = rng(seed), out = buffer(sr, 0.2), f0 = 2250 / size;
  const t = creak(out, sr, 0, 6, 0.007, 0.0025, 0.07, f0, r);
  strike(out, sr, { at: t + 0.004, f0: f0 * 1.08, contact: 0.00011, gain: 0.3 }, r);
  strike(out, sr, { at: t + 0.022, f0, contact: 0.0002, gain: 1, body: 1 }, r);
  return finish(out, 0.95);
};

/** pulled off: a creak that slows as it gives, a release, a puff of air, a small wobble */
export const unsnap = (seed: number) => (sr: number) => {
  const r = rng(seed), out = buffer(sr, 0.16), f0 = 1800;
  const t = creak(out, sr, 0, 4, 0.003, 0.008, 0.06, f0, r);
  strike(out, sr, { at: t + 0.006, f0: f0 * 0.95, contact: 0.00035, gain: 0.75, damp: 1.4 }, r);
  puff(out, sr, t + 0.004, 0.018, 0.28, r);
  strike(out, sr, { at: t + 0.05, f0: f0 * 0.95, contact: 0.0004, gain: 0.14, damp: 1.6 }, r);
  return finish(out, 0.7);
};

/** studs on studs: it won't go on. Two dull knocks and a scrape between them */
export const misfit = (seed: number) => (sr: number) => {
  const r = rng(seed), out = buffer(sr, 0.16), f0 = 1700;
  strike(out, sr, { at: 0, f0, contact: 0.0005, gain: 0.8, body: 0.18 }, r);
  creak(out, sr, 0.02, 5, 0.006, 0.006, 0.035, f0, r);
  strike(out, sr, { at: 0.075, f0: f0 * 0.97, contact: 0.0006, gain: 0.65, body: 0.15 }, r);
  return finish(out, 0.75);
};

/** a fingernail on a brick: what aiming sounds like. Deeper pieces are smaller bricks */
export const tap = (seed: number, depth: number) => (sr: number) => {
  const r = rng(seed), out = buffer(sr, 0.04);
  strike(out, sr, { at: 0, f0: 2100 * (1 + Math.min(depth, 8) * 0.055), contact: 0.00022, gain: 1, damp: 1.3 }, r);
  return finish(out, 0.4);
};

/** a thumb run over a row of studs */
export const studs = (seed: number) => (sr: number) => {
  const r = rng(seed), out = buffer(sr, 0.1);
  [0, 0.022, 0.044].forEach((at, k) => strike(out, sr, { at, f0: 2300 + k * 140, contact: 0.00035, gain: 0.8 + 0.1 * k, damp: 1.6 }, r));
  return finish(out, 0.35);
};

/** a hand through the box of bricks, then one last brick pressed home */
export const rummage = (seed: number) => (sr: number) => {
  const r = rng(seed), out = buffer(sr, 0.75);
  let t = 0;
  for (let k = 0; k < 13; k++) {
    // front-loaded, like a hand going in and slowing down
    t += 0.008 + r() * 0.03 * (1 + k / 6);
    strike(out, sr, { at: t, f0: 1900 / (0.7 + 0.8 * r()), contact: 0.0001 + 0.0002 * r(), gain: (0.25 + 0.45 * r()) * (1 - k / 20), damp: 1.2 + r() }, r);
  }
  const end = t + 0.09;
  strike(out, sr, { at: end, f0: 1900 * 1.08, contact: 0.00011, gain: 0.35 }, r);
  strike(out, sr, { at: end + 0.017, f0: 1900, contact: 0.00018, gain: 1.15, body: 1 }, r);
  return finish(out, 0.9);
};
