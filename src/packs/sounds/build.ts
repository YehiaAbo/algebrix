// Brick-game building: the sound of snapping a model together on screen rather than at a
// table. Where Bricks is a real brick in a quiet room, this is closer, brighter and mixed to
// feel good: every snap is a crisp plastic click with a short pitched ring and a little room
// around it, so a run of moves climbs a scale as the build grows. Finishing is a quick ratchet
// of pieces, a sparkle of small metal studs, and one solid thunk.
//
// Pure functions from a sample rate to samples, like ./bricks.ts, so they render once and test
// without a browser.
import { rng, strike, finish } from './bricks';

const buffer = (sr: number, seconds: number) => new Float32Array(Math.ceil(sr * seconds));

/** a pitched ring under a click: what makes a snap sing a note */
function ring(out: Float32Array, sr: number, at: number, f: number, gain: number, decay: number) {
  const start = Math.round(at * sr), len = Math.min(out.length - start, Math.ceil(decay * 6 * sr)), w = 2 * Math.PI * f / sr;
  for (let i = 0; i < len; i++) {
    const env = Math.exp(-i / (decay * sr)) * Math.min(1, i / (0.0015 * sr));
    out[start + i] += gain * env * (Math.sin(w * i) + 0.35 * Math.sin(2 * w * i + 0.4) + 0.12 * Math.sin(3 * w * i));
  }
}

/** a small metal stud: a bell, partials at the ratios of a struck disc */
function chime(out: Float32Array, sr: number, at: number, f: number, gain: number) {
  const start = Math.round(at * sr);
  for (const [k, a, d] of [[1, 1, 0.22], [2.76, 0.42, 0.11], [5.4, 0.22, 0.06], [8.93, 0.1, 0.035]] as const) {
    const fk = f * k;
    if (fk > sr * 0.45) continue;
    const len = Math.min(out.length - start, Math.ceil(d * 6 * sr)), w = 2 * Math.PI * fk / sr;
    for (let i = 0; i < len; i++) out[start + i] += gain * a * Math.exp(-i / (d * sr)) * Math.min(1, i / (0.0008 * sr)) * Math.sin(w * i);
  }
}

/** a little room: a few short feedback delays, mixed under the dry sound */
function room(out: Float32Array, sr: number, mix: number) {
  const wet = new Float32Array(out.length);
  for (const [ms, fb] of [[11.3, 0.42], [17.9, 0.38], [23.7, 0.33], [31.1, 0.28]] as const) {
    const d = Math.round(ms / 1000 * sr), line = new Float32Array(out.length);
    for (let i = 0; i < out.length; i++) { line[i] = out[i] + (i >= d ? fb * line[i - d] : 0); wet[i] += line[i] * 0.25; }
  }
  // soften the wet sound a touch so it sits behind the click
  let y = 0;
  const a = Math.exp(-2 * Math.PI * 3500 / sr);
  for (let i = 0; i < out.length; i++) { y = a * y + (1 - a) * wet[i]; out[i] += mix * y; }
  return out;
}

/** one bright snap: studs catch, the brick seats with a ring at f (Hz) */
function snapAt(out: Float32Array, sr: number, at: number, f: number, gain: number, r: () => number) {
  strike(out, sr, { at, f0: 2600, contact: 0.00008, gain: 0.55 * gain, damp: 0.8 }, r);
  strike(out, sr, { at: at + 0.009, f0: 2100, contact: 0.00012, gain, body: 0.55, damp: 0.7 }, r);
  ring(out, sr, at + 0.009, f, 0.12 * gain, 0.028);
}

/* ---------- the sounds ---------- */

/** a piece snapped on; the note (Hz) climbs as the build goes on */
export const click = (seed: number, note = 880) => (sr: number) => {
  const r = rng(seed), out = buffer(sr, 0.22);
  snapAt(out, sr, 0, note * (0.995 + 0.01 * r()), 1, r);
  return finish(room(out, sr, 0.35), 0.92);
};

/** Enter: a handful of pieces flying together, faster and faster, then one firm snap */
export const assemble = (seed: number) => (sr: number) => {
  const r = rng(seed), out = buffer(sr, 0.34);
  let t = 0;
  for (let k = 0; k < 5; k++) {
    strike(out, sr, { at: t, f0: 2300 + 180 * k + 120 * r(), contact: 0.00009, gain: 0.25 + 0.08 * k, damp: 1.1 }, r);
    t += 0.03 - 0.0045 * k;
  }
  snapAt(out, sr, t + 0.01, 660, 1.1, r);
  return finish(room(out, sr, 0.35), 0.95);
};

/** undo: a piece pops off and a couple of bits rattle down */
export const pop = (seed: number) => (sr: number) => {
  const r = rng(seed), out = buffer(sr, 0.26);
  strike(out, sr, { at: 0, f0: 2900, contact: 0.00007, gain: 0.9, damp: 1.2 }, r);
  ring(out, sr, 0, 1320, 0.12, 0.02);
  [0.06, 0.1, 0.13].forEach((at, k) => strike(out, sr, { at: at + 0.01 * r(), f0: 2400 - 250 * k, contact: 0.00011, gain: 0.32 - 0.07 * k, damp: 1.6 }, r));
  return finish(room(out, sr, 0.3), 0.8);
};

/** a piece that won't go: two dull knocks, a low bump */
export const nope = (seed: number) => (sr: number) => {
  const r = rng(seed), out = buffer(sr, 0.2);
  strike(out, sr, { at: 0, f0: 1500, contact: 0.0006, gain: 0.8, body: 0.3, damp: 1.5 }, r);
  strike(out, sr, { at: 0.07, f0: 1450, contact: 0.0007, gain: 0.6, body: 0.25, damp: 1.6 }, r);
  ring(out, sr, 0, 196, 0.15, 0.045);
  ring(out, sr, 0.07, 185, 0.12, 0.045);
  return finish(room(out, sr, 0.2), 0.75);
};

/** aiming: a light plastic tick, higher for smaller (deeper) pieces */
export const tick = (seed: number, depth: number) => (sr: number) => {
  const r = rng(seed), out = buffer(sr, 0.06);
  strike(out, sr, { at: 0, f0: 2500 * (1 + Math.min(depth, 8) * 0.06), contact: 0.00012, gain: 1, damp: 1.4 }, r);
  return finish(room(out, sr, 0.2), 0.4);
};

/** the letters appearing: a thumb along a row of studs */
export const ratchet = (seed: number) => (sr: number) => {
  const r = rng(seed), out = buffer(sr, 0.14);
  for (let k = 0; k < 4; k++) strike(out, sr, { at: k * 0.018, f0: 2400 + 150 * k, contact: 0.0001, gain: 0.6 + 0.1 * k, damp: 1.4 }, r);
  return finish(room(out, sr, 0.25), 0.35);
};

/** finished: a quick ratchet of pieces, a sparkle of studs going up, one solid thunk */
export const complete = (seed: number) => (sr: number) => {
  const r = rng(seed), out = buffer(sr, 1.1);
  for (let k = 0; k < 7; k++) strike(out, sr, { at: k * 0.028, f0: 2200 + 120 * k + 80 * r(), contact: 0.00009, gain: 0.3 + 0.05 * k, damp: 1.1 }, r);
  // the studs: an arpeggio up a major chord, the last note held
  [1318.5, 1568, 1975.5, 2637].forEach((f, k) => chime(out, sr, 0.2 + k * 0.055, f, 0.32 + 0.04 * k));
  snapAt(out, sr, 0.43, 523.25, 1.25, r);
  strike(out, sr, { at: 0.43, f0: 1200, contact: 0.0004, gain: 0.5, body: 1 }, r);
  return finish(room(out, sr, 0.4), 0.9);
};
