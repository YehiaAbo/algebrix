/// <reference types="node" />
// The brick sounds are pure functions from a sample rate to samples, so they can be checked
// here: they are finite, they end, and they are made the way a snap is made.
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
import { snap, press, unsnap, misfit, tap, studs, rummage } from '../src/packs/sounds/bricks';
import * as Build from '../src/packs/sounds/build';

const SR = 48000;
const peak = (d: Float32Array) => d.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const rms = (d: Float32Array, a: number, b: number) => { let s = 0; for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, b - a)); };
/** where the sound gets suddenly louder: the hits */
function onsets(d: Float32Array) {
  const w = Math.round(SR * 0.002), out: number[] = [];
  let prev = 1e-6;
  for (let i = 0; i + w < d.length; i += w) {
    const e = rms(d, i, i + w);
    if (e > prev * 4 && e > 0.05 && (!out.length || i / SR - out[out.length - 1] > 0.006)) out.push(i / SR);
    prev = Math.max(e, 1e-6);
  }
  return out;
}
/** the spectral centroid of the first 40 ms: the frequency the energy balances on */
export function brightness(d: Float32Array) {
  const n = Math.min(d.length, Math.round(SR * 0.04));
  let num = 0, den = 0;
  for (let f = 100; f <= 12000; f += 100) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const a = 2 * Math.PI * f * i / SR; re += d[i] * Math.cos(a); im += d[i] * Math.sin(a); }
    const e = re * re + im * im; num += f * e; den += e;
  }
  return num / den;
}

const ALL = { snap: snap(1), press: press(1, 1.25), unsnap: unsnap(1), misfit: misfit(1), tap: tap(1, 2), studs: studs(1), rummage: rummage(1) };

describe('brick sounds', () => {
  for (const [name, make] of Object.entries(ALL)) {
    it(`${name}: finite, never clipping, and silent by its end`, () => {
      const d = make(SR);
      expect(d.every(Number.isFinite)).toBe(true);
      expect(peak(d)).toBeLessThanOrEqual(0.951);
      expect(peak(d)).toBeGreaterThan(0.3);
      expect(rms(d, Math.floor(d.length * 0.9), d.length)).toBeLessThan(0.01);
    });
  }

  it('a snap is two hits: the studs catching, then the brick seating 14 to 24 ms later', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const o = onsets(snap(seed)(SR));
      expect(o.length, `seed ${seed}: ${o}`).toBe(2);
      expect(o[1] - o[0]).toBeGreaterThan(0.012);
      expect(o[1] - o[0]).toBeLessThan(0.027);
    }
  });

  it('it is bright plastic, not a beep: most of the sound sits between 1 and 6 kHz', () => {
    const b = brightness(snap(1)(SR));
    expect(b).toBeGreaterThan(1000);
    expect(b).toBeLessThan(6000);
  });

  it('a misfit is duller than a snap, and a hand in the box is many hits', () => {
    expect(brightness(misfit(1)(SR))).toBeLessThan(brightness(snap(1)(SR)));
    expect(onsets(rummage(1)(SR)).length).toBeGreaterThan(8);
  });

  it('variants differ, and the same variant is the same every time', () => {
    expect(Array.from(snap(1)(SR))).toEqual(Array.from(snap(1)(SR)));
    expect(Array.from(snap(1)(SR))).not.toEqual(Array.from(snap(2)(SR)));
  });

  // WAV_OUT=dir npx vitest run tests/bricks.test.ts writes each sound out to listen to
  const dir = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.WAV_OUT;
  it.runIf(!!dir)('writes wav files', () => {
    mkdirSync(dir!, { recursive: true });
    const wav = (parts: Float32Array[], gap = 0.35) => {
      const n = parts.reduce((s, p) => s + p.length + Math.round(gap * SR), 0), b = Buffer.alloc(44 + n * 2);
      b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
      b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
      let o = 44;
      for (const p of parts) { for (const x of p) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x)) * 32767), o); o += 2; } o += Math.round(gap * SR) * 2; }
      return b;
    };
    writeFileSync(`${dir}/1-moves-snap.wav`, wav([1, 2, 3, 4, 5, 6].map(s => snap(s)(SR))));
    writeFileSync(`${dir}/2-enter-press.wav`, wav([1, 2, 3].map(s => press(s, 1.25)(SR))));
    writeFileSync(`${dir}/3-undo-pull-off.wav`, wav([1, 2, 3].map(s => unsnap(s)(SR))));
    writeFileSync(`${dir}/4-wont-fit.wav`, wav([1, 2].map(s => misfit(s)(SR))));
    writeFileSync(`${dir}/5-aiming-taps.wav`, wav([0, 1, 2, 3, 4].map(d => tap(d + 1, d)(SR)), 0.18));
    writeFileSync(`${dir}/6-solved-rummage.wav`, wav([1, 2].map(s => rummage(s)(SR)), 0.6));
    // the Build pack: a run of moves climbing the scale, as when solving step by step
    const run = [0, 2, 4, 7, 9, 12, 14, 16].map((st, k) => Build.click(k % 4 + 1, 880 * 2 ** (st / 12))(SR));
    writeFileSync(`${dir}/build-1-moves-climbing.wav`, wav(run, 0.12));
    writeFileSync(`${dir}/build-2-enter-assemble.wav`, wav([1, 2].map(s => Build.assemble(s)(SR))));
    writeFileSync(`${dir}/build-3-undo-pop.wav`, wav([1, 2, 3].map(s => Build.pop(s)(SR))));
    writeFileSync(`${dir}/build-4-wont-fit.wav`, wav([1, 2].map(s => Build.nope(s)(SR))));
    writeFileSync(`${dir}/build-5-solved-complete.wav`, wav([1, 2].map(s => Build.complete(s)(SR)), 0.6));
  });
});

/** the strongest frequency between lo and hi, 10 to 60 ms in: the note a snap sings */
function pitch(d: Float32Array, lo: number, hi: number) {
  const a = Math.round(SR * 0.01), b = Math.min(d.length, Math.round(SR * 0.06));
  let best = lo, top = -1;
  for (let f = lo; f <= hi; f += 5) {
    let re = 0, im = 0;
    for (let i = a; i < b; i++) { const w = 2 * Math.PI * f * i / SR; re += d[i] * Math.cos(w); im += d[i] * Math.sin(w); }
    if (re * re + im * im > top) { top = re * re + im * im; best = f; }
  }
  return best;
}

describe('build sounds (the brick-game pack)', () => {
  const ALL_B = { click: Build.click(1), assemble: Build.assemble(1), pop: Build.pop(1), nope: Build.nope(1), tick: Build.tick(1, 2), ratchet: Build.ratchet(1), complete: Build.complete(1) };
  for (const [name, render] of Object.entries(ALL_B)) {
    it(`${name}: finite, never clipping, and silent by its end`, () => {
      const d = render(SR);
      expect(d.every(Number.isFinite)).toBe(true);
      expect(peak(d)).toBeLessThanOrEqual(0.951);
      expect(rms(d, d.length - 200, d.length)).toBeLessThan(0.01);
    });
  }
  it('a snap sings the note it is given, so a run of moves climbs', () => {
    for (const f of [880, 987.8, 1108.7]) expect(Math.abs(pitch(Build.click(1, f)(SR), 600, 1500) - f)).toBeLessThan(f * 0.02);
  });
  it('it is still a click first: bright at the start', () => {
    expect(brightness(Build.click(1, 880)(SR))).toBeGreaterThan(1500);
  });
  it('finishing is a ratchet of pieces before the studs and the thunk', () => {
    expect(onsets(Build.complete(1)(SR)).length).toBeGreaterThanOrEqual(6);
  });
});
