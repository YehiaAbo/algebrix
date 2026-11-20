// Solving an inequality in one variable with a sign chart: find every point where the
// two sides meet, where the expression blows up, or where it stops being defined; between
// those points the truth of the inequality can't change, so one test point per piece decides it.
import { Eq, Env, evaluate, holds, symbols, eq, walk } from './ast';

export interface Piece { lo: number; hi: number; loIn: boolean; hiIn: boolean }
export interface IneqSolution { v: string; pieces: Piece[]; text: string }

const R = 1e6;

function samples(): number[] {
  const xs: number[] = [];
  for (let x = -60; x <= 60; x += 0.004) xs.push(Math.round(x * 1000) / 1000);
  for (let k = 1; k <= 200; k++) { const x = 60 * Math.pow(R / 60, k / 200); xs.push(x, -x); }
  return [...new Set(xs)].sort((a, b) => a - b);
}
const XS = samples();

/** neat number: small fractions exactly, others to 3 decimals */
export function fmtNum(x: number): string {
  if (x === Infinity) return '∞';
  if (x === -Infinity) return '−∞';
  for (let q = 1; q <= 12; q++) {
    const p = Math.round(x * q);
    if (Math.abs(p / q - x) < 1e-7) return (p < 0 ? '−' : '') + (q === 1 ? `${Math.abs(p)}` : `${Math.abs(p)}/${q}`);
  }
  // e, ln 2, √3 and π/4 by name, as a textbook gives them
  const a = Math.abs(x), sign = x < 0 ? '−' : '', near = (y: number) => Math.abs(a - y) < 1e-9 * (1 + a);
  if (near(Math.E)) return sign + 'e';
  for (let k = 2; k <= 50; k++) {
    if (!Number.isInteger(Math.sqrt(k)) && near(Math.sqrt(k))) return `${sign}√${k}`;
    if (k <= 20 && near(Math.log(k))) return `${sign}ln ${k}`;
  }
  for (let b = 2; b <= 10; b++) for (let k = 2; k <= 20; k++) if (Math.log(k) / Math.log(b) % 1 !== 0 && near(Math.log(k) / Math.log(b))) return `${sign}ln ${k}/ln ${b}`;
  for (let q = 1; q <= 12; q++) {
    const p = Math.round((a / Math.PI) * q);
    if (p > 0 && p <= 8 * q && near((p * Math.PI) / q)) return `${sign}${p === 1 ? '' : p}π${q === 1 ? '' : '/' + q}`;
  }
  const r = Math.round(x * 1000) / 1000;
  return (r < 0 ? '−' : '') + Math.abs(r);
}

const snap = (x: number) => {
  for (let q = 1; q <= 12; q++) { const p = Math.round(x * q); if (Math.abs(p / q - x) < 1e-7) return p / q; }
  return x;
};

export function solveInequality(e: Eq, v: string): IneqSolution | { error: string } {
  const vars = symbols(e);
  if (vars.some(x => x !== v)) return { error: `A sign chart needs one variable; this has ${vars.join(', ')}.` };
  const env: Env = {};
  const f = (x: number) => { env[v] = x; return evaluate(e.lhs, env) - evaluate(e.rhs, env); };
  const at = (x: number) => holds(e, { [v]: x }) === true;
  // sin x > 0 repeats every 2π: chart one period, and say it repeats
  const P = period(e, f);
  if (P) {
    // start the window where it is false, so no piece wraps round its ends
    let s0 = NaN;
    for (let k = 0; k < 400 && Number.isNaN(s0); k++) { const x = (P * k) / 400; if (!at(x)) s0 = x; }
    if (Number.isNaN(s0)) return { v, pieces: [{ lo: -Infinity, hi: Infinity, loIn: false, hiIn: false }], text: `every real ${v}` };
    const xs: number[] = [];
    for (let k = 0; k <= 20000; k++) xs.push(s0 + (P * k) / 20000);
    const raw = chart(f, at, xs, s0, s0 + P);
    if (!raw.length) return { v, pieces: raw, text: 'no solution' };
    // as near 0 as it goes: (−π/6 + 2kπ, 7π/6 + 2kπ), not (11π/6 + 2kπ, 19π/6 + 2kπ)
    const m = Math.round(raw[0].lo / P), shift = (x: number) => snapPi(x - m * P);
    const pieces = raw.map(p => ({ ...p, lo: shift(p.lo), hi: shift(p.hi) }));
    // (2kπ, π + 2kπ): each end shifted by a whole number of periods
    const kP = fmtNum(P).replace(/^(\d*)π/, (_, n) => `${n}kπ`);
    const end = (x: number) => (Math.abs(x) < 1e-12 ? kP : `${fmtNum(x)} + ${kP}`);
    const text = pieces.map(p => p.lo === p.hi ? `${v} = ${end(p.lo)}` : `${v} ∈ ${p.loIn ? '[' : '('}${end(p.lo)}, ${end(p.hi)}${p.hiIn ? ']' : ')'}`).join(' or ');
    return { v, pieces, text: `${text}, for any whole number k` };
  }
  const pieces = chart(f, at, XS, -Infinity, Infinity);
  let text: string;
  if (!pieces.length) text = 'no solution';
  else if (pieces.length === 1 && pieces[0].lo === -Infinity && pieces[0].hi === Infinity) text = `every real ${v}`;
  else text = `${v} ∈ ${show(pieces)}`;
  void eq;
  return { v, pieces, text };
}

/** a multiple of π a float step away is that multiple: 11π/6 − 2π is −π/6 */
const snapPi = (x: number) => { for (let q = 1; q <= 12; q++) { const p = Math.round((x / Math.PI) * q); if (Math.abs((p * Math.PI) / q - x) < 1e-9) return (p * Math.PI) / q; } return x; };

const show = (pieces: Piece[]) => pieces.map(p => p.lo === p.hi ? `{${fmtNum(p.lo)}}` : `${p.loIn ? '[' : '('}${fmtNum(p.lo)}, ${fmtNum(p.hi)}${p.hiIn ? ']' : ')'}`).join(' ∪ ');

/** the smallest period from π/2 to 8π that the difference of the sides repeats with, if it is made of sin, cos and tan */
function period(e: Eq, f: (x: number) => number): number | null {
  let trig = false;
  walk(e, n => { if (n.k === 'fn' && (n.name === 'sin' || n.name === 'cos' || n.name === 'tan')) trig = true; });
  if (!trig) return null;
  const test = [-2.3, -1.1, 0.37, 0.9, 1.7, 2.9, 4.4, 5.3];
  for (const P of [Math.PI / 2, Math.PI, 2 * Math.PI, 4 * Math.PI, 6 * Math.PI, 8 * Math.PI]) {
    let seen = 0, same = true;
    for (const x of test) {
      const a = f(x), b = f(x + P), c = f(x - 3 * P);
      if (!Number.isFinite(a)) continue;
      seen++;
      if (!(Math.abs(a - b) < 1e-9 * (1 + Math.abs(a)) && Math.abs(a - c) < 1e-9 * (1 + Math.abs(a)))) { same = false; break; }
    }
    if (same && seen >= 4) return P;
  }
  return null;
}

/** the pieces of [lo0, hi0] where it holds, from a sign chart sampled at xs */
function chart(f: (x: number) => number, at: (x: number) => boolean, xs: number[], lo0: number, hi0: number): Piece[] {
  // defined there: finite, or only too big for a float far out (eˣ past x = 709 is still a number)
  const fine = (x: number, y: number) => Number.isFinite(y) || (Math.abs(x) > 100 && !Number.isNaN(y));
  const ok = (x: number) => fine(x, f(x));
  const crit: number[] = [];
  const bisect = (a: number, b: number, same: (x: number) => boolean) => {
    for (let k = 0; k < 80 && b - a > 1e-13 * (1 + Math.abs(a)); k++) { const m = (a + b) / 2; same(m) ? (a = m) : (b = m); }
    return (a + b) / 2;
  };
  const ys = xs.map(f);
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i], b = xs[i + 1], fa = ys[i], fb = ys[i + 1];
    const da = fine(a, fa), db = fine(b, fb);
    if (da !== db) { crit.push(bisect(a, b, x => ok(x) === da)); continue; }
    if (!da) continue;
    if (fa === 0) { crit.push(a); continue; }
    if ((fa < 0) !== (fb < 0) && fb !== 0) crit.push(bisect(a, b, x => { const y = f(x); return fine(x, y) ? (y < 0) === (fa < 0) : true; }));
  }
  // roots where the graph only touches zero (x² ≥ 0 at 0): local minima of |f| that reach 0
  for (let i = 1; i + 1 < xs.length; i++) {
    const [p, q, r] = [Math.abs(ys[i - 1]), Math.abs(ys[i]), Math.abs(ys[i + 1])];
    if (!(q <= p && q <= r) || !Number.isFinite(p + q + r) || q > 1e-2) continue;
    let a = xs[i - 1], b = xs[i + 1];
    for (let k = 0; k < 100; k++) {
      const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
      Math.abs(f(m1)) < Math.abs(f(m2)) ? (b = m2) : (a = m1);
    }
    const x = (a + b) / 2;
    if (Math.abs(f(x)) < 1e-10) crit.push(x);
  }
  const pts = [...new Set(crit.map(snap).map(x => Math.round(x * 1e9) / 1e9))].sort((a, b) => a - b)
    .filter((x, i, all) => (i === 0 || x - all[i - 1] > 1e-7) && x > lo0 + 1e-9 && x < hi0 - 1e-9);
  const mid = (i: number) => {
    const lo = i === 0 ? lo0 : pts[i - 1], hi = i === pts.length ? hi0 : pts[i];
    return lo === -Infinity ? (hi === Infinity ? 0 : hi - 1) : hi === Infinity ? lo + 1 : (lo + hi) / 2;
  };
  // alternate: open piece, point, open piece, point, …
  const pieces: Piece[] = [];
  const push = (lo: number, hi: number, loIn: boolean, hiIn: boolean) => {
    const last = pieces[pieces.length - 1];
    if (last && last.hi === lo && (last.hiIn || loIn)) { last.hi = hi; last.hiIn = hiIn; return; }
    pieces.push({ lo, hi, loIn, hiIn });
  };
  for (let i = 0; i <= pts.length; i++) {
    const lo = i === 0 ? lo0 : pts[i - 1], hi = i === pts.length ? hi0 : pts[i];
    if (i > 0 && at(lo)) push(lo, lo, true, true);
    if (at(mid(i))) push(lo, hi, false, false);
  }
  // a closed point next to an open piece joins it
  for (const p of pieces) { if (p.lo !== -Infinity && at(p.lo)) p.loIn = true; if (p.hi !== Infinity && at(p.hi)) p.hiIn = true; }
  return pieces;
}
