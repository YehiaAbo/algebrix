// Solving an inequality in one variable with a sign chart: find every point where the
// two sides meet, where the expression blows up, or where it stops being defined; between
// those points the truth of the inequality can't change, so one test point per piece decides it.
import { Eq, Env, evaluate, holds, symbols, eq } from './ast';

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
  const ok = (x: number) => Number.isFinite(f(x));
  const crit: number[] = [];
  const bisect = (a: number, b: number, same: (x: number) => boolean) => {
    for (let k = 0; k < 80 && b - a > 1e-13 * (1 + Math.abs(a)); k++) { const m = (a + b) / 2; same(m) ? (a = m) : (b = m); }
    return (a + b) / 2;
  };
  const ys = XS.map(f);
  for (let i = 0; i + 1 < XS.length; i++) {
    const a = XS[i], b = XS[i + 1], fa = ys[i], fb = ys[i + 1];
    const da = Number.isFinite(fa), db = Number.isFinite(fb);
    if (da !== db) { crit.push(bisect(a, b, x => ok(x) === da)); continue; }
    if (!da) continue;
    if (fa === 0) { crit.push(a); continue; }
    if ((fa < 0) !== (fb < 0) && fb !== 0) crit.push(bisect(a, b, x => { const y = f(x); return Number.isFinite(y) ? (y < 0) === (fa < 0) : true; }));
  }
  // roots where the graph only touches zero (x² ≥ 0 at 0): local minima of |f| that reach 0
  for (let i = 1; i + 1 < XS.length; i++) {
    const [p, q, r] = [Math.abs(ys[i - 1]), Math.abs(ys[i]), Math.abs(ys[i + 1])];
    if (!(q <= p && q <= r) || !Number.isFinite(p + q + r) || q > 1e-2) continue;
    let a = XS[i - 1], b = XS[i + 1];
    for (let k = 0; k < 100; k++) {
      const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
      Math.abs(f(m1)) < Math.abs(f(m2)) ? (b = m2) : (a = m1);
    }
    const x = (a + b) / 2;
    if (Math.abs(f(x)) < 1e-10) crit.push(x);
  }
  const pts = [...new Set(crit.map(snap).map(x => Math.round(x * 1e9) / 1e9))].sort((a, b) => a - b)
    .filter((x, i, all) => i === 0 || x - all[i - 1] > 1e-7);
  const at = (x: number) => holds(e, { [v]: x }) === true;
  const mid = (i: number) => (i === 0 ? (pts.length ? pts[0] - 1 : 0) : i === pts.length ? pts[pts.length - 1] + 1 : (pts[i - 1] + pts[i]) / 2);
  // alternate: open piece, point, open piece, point, …
  const pieces: Piece[] = [];
  const push = (lo: number, hi: number, loIn: boolean, hiIn: boolean) => {
    const last = pieces[pieces.length - 1];
    if (last && last.hi === lo && (last.hiIn || loIn)) { last.hi = hi; last.hiIn = hiIn; return; }
    pieces.push({ lo, hi, loIn, hiIn });
  };
  for (let i = 0; i <= pts.length; i++) {
    const lo = i === 0 ? -Infinity : pts[i - 1], hi = i === pts.length ? Infinity : pts[i];
    if (i > 0 && at(lo)) push(lo, lo, true, true);
    if (at(mid(i))) push(lo, hi, false, false);
  }
  // a closed point next to an open piece joins it
  for (const p of pieces) { if (p.lo !== -Infinity && at(p.lo)) p.loIn = true; if (p.hi !== Infinity && at(p.hi)) p.hiIn = true; }
  let text: string;
  if (!pieces.length) text = 'no solution';
  else if (pieces.length === 1 && pieces[0].lo === -Infinity && pieces[0].hi === Infinity) text = `every real ${v}`;
  else text = `${v} ∈ ` + pieces.map(p => p.lo === p.hi ? `{${fmtNum(p.lo)}}` : `${p.loIn ? '[' : '('}${fmtNum(p.lo)}, ${fmtNum(p.hi)}${p.hiIn ? ']' : ')'}`).join(' ∪ ');
  void eq;
  return { v, pieces, text };
}
