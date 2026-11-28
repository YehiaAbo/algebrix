// Several equations: the form "v = …" of one, substituting it into another, eliminating a letter
// with a multiple of another equation, and comparing coefficients (one equation per power).
import { Node, Eq, cloneFresh, num, add, eq, evaluate, Env, symbols, walk, relOf } from './ast';
import { termInfo, buildTerm } from './terms';
import { simplify, newHints } from './simplify';
import { expandAll } from './rewrite';
import { toText } from './print';
import { MoveResult, CheckedResult, isErr, checked, solvedFor, applyBothChecked } from './moves';
import { isolate } from './isolate';

const t = (n: Node) => toText(n);
const one = () => 1;
const has = (n: Node, v: string) => symbols(n).includes(v);
const fresh = (n: Node) => { const c = cloneFresh(n); walk(c, m => { m.from = undefined; }); return c; };

/* ---------- substitution between equations ---------- */

/** The equation as "v = expr", isolating a copy if needed. */
export function solvedForm(src: Eq, prefer: string[]): { v: string; expr: Node } | null {
  const s = solvedFor(src);
  if (s && prefer.includes(s)) return { v: s, expr: src.lhs.k === 'sym' && src.lhs.name === s ? src.rhs : src.lhs };
  for (const v of prefer) {
    if (!has(src, v)) continue;
    const r = isolate(src, v);
    if (!Array.isArray(r) || !r.length) continue;
    const last = r[r.length - 1].eq;
    if (last.lhs.k === 'sym' && last.lhs.name === v && !has(last.rhs, v)) return { v, expr: last.rhs };
  }
  return null;
}

export function substitute(e: Eq, src: Eq, aimVar: string | null, srcName: string): MoveResult {
  const shared = symbols(e).filter(v => has(src, v));
  if (!shared.length) return { error: `${srcName} shares no variable with this equation.` };
  const prefer = aimVar && shared.includes(aimVar) ? [aimVar] : shared.sort((a, b) => count(e, b) - count(e, a));
  const sf = solvedForm(src, prefer);
  if (!sf) return { error: `Couldn't solve ${srcName} for ${prefer.join(' or ')} to plug it in.` };
  const { v, expr } = sf;
  const h = newHints();
  const swapIn = (n: Node): Node => {
    if (n.k === 'sym' && n.name === v) {
      const c = cloneFresh(expr);
      walk(c, m => { m.from = undefined; });
      h.absorbs.set(n.id, c.id);
      return c;
    }
    switch (n.k) {
      case 'add': return { ...n, terms: n.terms.map(swapIn) };
      case 'mul': return { ...n, factors: n.factors.map(swapIn) };
      case 'neg': case 'sqrt': case 'fn': return { ...n, arg: swapIn(n.arg) };
      case 'frac': return { ...n, num: swapIn(n.num), den: swapIn(n.den) };
      case 'pow': return { ...n, base: swapIn(n.base), exp: swapIn(n.exp) };
      case 'eq': return { ...n, lhs: swapIn(n.lhs), rhs: swapIn(n.rhs) };
      default: return n;
    }
  };
  const next = swapIn(e) as Eq;
  return {
    eq: next, label: `substitute ${v} = ${t(expr)}`, hints: h, factor: one, select: null,
    check: env => { const en: Env = { ...env, [v]: evaluate(expr, env) }; return [[evaluate(next, en), evaluate(e, en)]]; },
  };
}

const count = (n: Node, v: string) => { let c = 0; walk(n, m => { if (m.k === 'sym' && m.name === v) c++; }); return c; };


/* ---------- elimination: the multiple of another equation that cancels v ---------- */
const linearCoef = (e: Eq, v: string): number | null => {
  const others = symbols(e).filter(s => s !== v);
  let coef: number | null = null;
  for (const seed of [0.31, 1.7, -2.2]) {
    const env: Env = {};
    others.forEach((s, i) => (env[s] = seed + i * 0.83));
    const f = (x: number) => { env[v] = x; return evaluate(e, env); };
    const a = f(1) - f(0), b = f(2) - f(1);
    if (!Number.isFinite(a) || Math.abs(a - b) > 1e-9 * (1 + Math.abs(a))) return null;
    if (coef !== null && Math.abs(coef - a) > 1e-9 * (1 + Math.abs(a))) return null;
    coef = a;
  }
  return coef;
};
const ratText = (x: number): string | null => {
  for (let q = 1; q <= 200; q++) { const p = Math.round(x * q); if (Math.abs(p / q - x) < 1e-9) return q === 1 ? String(p) : `(${p}/${q})`; }
  return null;
};

export function eliminate(e: Eq, other: Eq, j: number, v?: string): CheckedResult {
  const shared = symbols(e).filter(s => symbols(other).includes(s));
  // the variable that cancels most simply goes first: a ratio of 1, then whole numbers
  const cost = (name: string) => {
    const a = linearCoef(e, name), b = linearCoef(other, name);
    if (!a || !b) return 9;
    const k = Math.abs(a / b);
    return k === 1 ? 0 : Number.isInteger(k) ? 1 : 2;
  };
  const vars = v ? [v] : [...shared].sort((p, q) => cost(p) - cost(q));
  for (const name of vars) {
    const a = linearCoef(e, name), b = linearCoef(other, name);
    if (!a || !b) continue;
    const k = a / b;
    const txt = ratText(Math.abs(k));
    if (!txt) continue;
    const r = applyBothChecked(e, `${k > 0 ? '-' : '+'}${txt === '1' ? '' : txt}#${j}`, Object.assign([], { [j - 1]: other }));
    if (!isErr(r)) return { ...r, label: `eliminate ${name} with equation ${j}` };
  }
  return { error: shared.length ? `Equation ${j} can't cancel ${vars.join(', ')} here: it needs to appear linearly in both.` : `Equation ${j} shares no variable with this one.` };
}


/** the coefficient of each power of v (lowest first), when n is a polynomial in v whose
 *  coefficients may hold other letters (A, B in A(x + 2) + B(x + 1)) */
function polyCoeffs(n: Node, v: string): Node[] | null {
  const s = simplify(expandAll(n, newHints()), newHints());
  const by: Node[][] = [];
  for (const t of s.k === 'add' ? s.terms : [s]) {
    const i = termInfo(t);
    let deg = 0;
    const rest: Node[] = [];
    for (const m of i.mono) {
      if (m.k === 'sym' && m.name === v) deg += 1;
      else if (m.k === 'pow' && m.base.k === 'sym' && m.base.name === v && m.exp.k === 'num' && Number.isInteger(m.exp.v) && m.exp.v > 0) deg += m.exp.v;
      else if (has(m, v)) return null;
      else rest.push(m);
    }
    if (deg > 12) return null;
    (by[deg] ??= []).push(buildTerm(i.coef, rest, t));
  }
  return Array.from({ length: by.length }, (_, k) => (by[k]?.length ? simplify(by[k].length === 1 ? by[k][0] : add(by[k]), newHints()) : num(0)));
}

/** Tab e, compare coefficients: an equation that holds for every v (1 = A(x + 2) + B(x + 1)) is
 *  one equation for each power of v (0 = A + B, 1 = 2A + B). The first replaces this one; the
 *  rest come back to go beside it. */
export function compareCoefficients(e: Eq, v: string): { first: CheckedResult; rest: Eq[] } {
  const none = (error: string) => ({ first: { error } as CheckedResult, rest: [] as Eq[] });
  if (relOf(e) !== '=') return none('Comparing coefficients needs an equation (=).');
  const L = polyCoeffs(e.lhs, v), R = polyCoeffs(e.rhs, v);
  if (!L || !R) return none(`Both sides need to be polynomials in ${v} to compare coefficients.`);
  const n = Math.max(L.length, R.length);
  const eqs: Eq[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const l = L[k] ?? num(0), r = R[k] ?? num(0);
    if (!symbols(l).length && !symbols(r).length) {
      if (Math.abs(evaluate(l, {}) - evaluate(r, {})) > 1e-9) return none(`The ${k === 0 ? 'numbers' : `${v}${k > 1 ? '^' + k : ''} terms`} don't match (${toText(l)} and ${toText(r)}), so this can't hold for every ${v}.`);
      continue;
    }
    eqs.push(eq(fresh(l), fresh(r)));
  }
  if (!eqs.length) return none(`Every power of ${v} already matches: this holds for every ${v}.`);
  const others = symbols(e).filter(s => s !== v);
  if (!others.length) return none(`There is nothing but ${v} here, so there are no unknown coefficients to find.`);
  const first = checked(e, {
    eq: eqs[0], label: `compare coefficients of ${v}`, hints: newHints(), factor: one, select: null, rule: 'compare coefficients', implies: true,
    // the coefficients read right: Σ (lₖ − rₖ) vᵏ is the left side minus the right at any v, so
    // it is 0 for every v exactly when each of these equations holds
    check: env => [-1.3, 0.4, 2.2].map(x => {
      const at = { ...env, [v]: x };
      const poly = Array.from({ length: n }, (_, k) => (evaluate(L[k] ?? num(0), at) - evaluate(R[k] ?? num(0), at)) * x ** k).reduce((a, b) => a + b, 0);
      return [poly, evaluate(e.lhs, at) - evaluate(e.rhs, at)] as [number, number];
    }),
  });
  return { first, rest: eqs.slice(1) };
}
