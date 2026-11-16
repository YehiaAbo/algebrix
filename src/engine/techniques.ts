// Bigger tools built from the small moves: apply a function to both sides, peel
// the outer function off a side, move anything across "=", isolate a variable
// in several steps, substitute one equation into another, split |X| = B.
import { Node, Eq, findPath, cloneFresh, num, sym, frac, pow, sqrt, fn, eq, evaluate, Env, symbols, hasSymbols, walk, key, replace } from './ast';
import { negate } from './terms';
import { simplify, newHints } from './simplify';
import { expandAll, hasExpandable, factorCommon } from './rewrite';
import { toText } from './print';
import { MoveOk, MoveResult, isErr, moveAcross, divideBoth, multiplyBoth, swapSides, checked, solvedFor } from './moves';

const t = (n: Node) => toText(n);
const one = () => 1;
const has = (n: Node, v: string) => symbols(n).includes(v);

/* ---------- functions on both sides ---------- */

export type Wrap = 'square' | 'cube' | 'sqrt' | 'cbrt' | 'root' | 'ln' | 'exp' | 'log' | 'pow10' | 'recip';

export const WRAPS: { key: string; f: Wrap; label: string; show: string }[] = [
  { key: '2', f: 'square', label: 'square both sides', show: '( )²' },
  { key: '3', f: 'cube', label: 'cube both sides', show: '( )³' },
  { key: 'r', f: 'sqrt', label: 'square root both sides', show: '√( )' },
  { key: 'c', f: 'cbrt', label: 'cube root both sides', show: '∛( )' },
  { key: 'l', f: 'ln', label: 'ln both sides', show: 'ln( )' },
  { key: 'e', f: 'exp', label: 'e to both sides', show: 'e^( )' },
  { key: 'g', f: 'log', label: 'log₁₀ both sides', show: 'log( )' },
  { key: '1', f: 'recip', label: 'flip both sides', show: '1/( )' },
];

const nonNeg = (n: Node) => (n.k === 'num' && n.v >= 0) || n.k === 'sqrt' || (n.k === 'fn' && n.name === 'abs') || (n.k === 'pow' && n.exp.k === 'num' && n.exp.v % 2 === 0) || (n.k === 'pow' && n.base.k === 'sym' && n.base.name === 'e');
const positive = (n: Node) => (n.k === 'num' && n.v > 0) || (n.k === 'pow' && n.base.k === 'sym' && n.base.name === 'e') || (n.k === 'pow' && n.base.k === 'num' && n.base.v > 0);

function wrapNode(s: Node, f: Wrap, k = 2): Node {
  switch (f) {
    case 'square': return pow(s, num(2));
    case 'cube': return pow(s, num(3));
    case 'sqrt': return sqrt(s);
    case 'cbrt': return pow(s, frac(num(1), num(3)));
    case 'root': return pow(s, frac(num(1), num(k)));
    case 'ln': return fn('ln', s);
    case 'log': return fn('log', s);
    case 'exp': return pow(sym('e'), s);
    case 'pow10': return pow(num(10), s);
    case 'recip': return frac(num(1), s);
  }
}

const NUMERIC: Record<Wrap, (v: number, k: number) => number> = {
  square: v => v * v, cube: v => v ** 3, sqrt: v => Math.sqrt(v), cbrt: v => (v < 0 ? NaN : Math.cbrt(v)),
  root: (v, k) => Math.pow(v, 1 / k), ln: v => (v > 0 ? Math.log(v) : NaN), log: v => (v > 0 ? Math.log10(v) : NaN),
  exp: v => Math.exp(v), pow10: v => 10 ** v, recip: v => 1 / v,
};

const NAMES: Record<Wrap, string> = {
  square: '²', cube: '³', sqrt: '√', cbrt: '∛', root: 'root', ln: 'ln', log: 'log', exp: 'e^', pow10: '10^', recip: '1/',
};

/** Wrap both sides in f. Pointwise checked: new side = f(old side). */
export function wrapBoth(e: Eq, f: Wrap, k = 2): MoveResult {
  if (f === 'recip' && (key(e.lhs) === '0' || key(e.rhs) === '0')) return { error: 'A side is 0, and 1/0 is undefined.' };
  const L = wrapNode(e.lhs, f, k), R = wrapNode(e.rhs, f, k);
  const conditions: string[] = [];
  const sides = [e.lhs, e.rhs];
  if (f === 'square' || (f === 'root' && k % 2 === 0)) conditions.push('squaring can add solutions: check answers');
  if (f === 'sqrt' || (f === 'root' && k % 2 === 0)) sides.filter(s => !nonNeg(s) && hasSymbols(s)).forEach(s => conditions.push(`${t(s)} ≥ 0`));
  if (f === 'cbrt') sides.filter(s => !nonNeg(s) && hasSymbols(s)).forEach(s => conditions.push(`${t(s)} ≥ 0`));
  if (f === 'ln' || f === 'log') sides.filter(s => !positive(s)).forEach(s => conditions.push(`${t(s)} > 0`));
  if (f === 'recip') sides.filter(s => hasSymbols(s)).forEach(s => conditions.push(`${t(s)} ≠ 0`));
  const g = NUMERIC[f];
  const label = f === 'root' ? `${k}th root both sides` : WRAPS.find(w => w.f === f)?.label ?? `${NAMES[f]} both sides`;
  return {
    eq: eq(L, R), label, hints: newHints(), factor: one, select: null, conditions,
    check: env => [[evaluate(L, env), g(evaluate(e.lhs, env), k)], [evaluate(R, env), g(evaluate(e.rhs, env), k)]],
  };
}

/** The function that undoes the outer layer of a side, if there is one. */
export function inverseOf(side: Node): { f: Wrap; k?: number } | null {
  if (side.k === 'pow') {
    const { base, exp } = side;
    if (exp.k === 'num' && Number.isInteger(exp.v) && exp.v >= 2) return exp.v === 2 ? { f: 'sqrt' } : exp.v === 3 ? { f: 'cbrt' } : { f: 'root', k: exp.v };
    if (base.k === 'sym' && base.name === 'e') return { f: 'ln' };
    if (base.k === 'num' && base.v === 10) return { f: 'log' };
    if (base.k === 'num' && base.v > 0 && hasSymbols(exp)) return { f: 'ln' };
    if (exp.k === 'frac' && exp.num.k === 'num' && exp.num.v === 1 && exp.den.k === 'num') return exp.den.v === 3 ? { f: 'cube' } : null;
  }
  if (side.k === 'sqrt') return { f: 'square' };
  if (side.k === 'fn' && side.name === 'ln') return { f: 'exp' };
  if (side.k === 'fn' && side.name === 'log') return { f: 'pow10' };
  if (side.k === 'frac' && side.num.k === 'num' && side.num.v === 1 && hasSymbols(side.den)) return { f: 'recip' };
  return null;
}

/** Which side to peel: the aimed side, else the one holding the variables. */
function sideFor(e: Eq, sel: string | null): 'lhs' | 'rhs' {
  if (sel && sel !== 'eq') {
    const p = findPath(e, sel);
    if (p) return p[1] === e.lhs ? 'lhs' : 'rhs';
  }
  const l = inverseOf(e.lhs), r = inverseOf(e.rhs);
  if (l && !r) return 'lhs';
  if (r && !l) return 'rhs';
  return hasSymbols(e.lhs) || !hasSymbols(e.rhs) ? 'lhs' : 'rhs';
}

export function peel(e: Eq, sel: string | null): MoveResult {
  const s = sideFor(e, sel);
  const side = e[s];
  if (side.k === 'fn' && side.name === 'abs') return { error: 'Absolute value has two cases. Hold E and press a to split it.' };
  const inv = inverseOf(side);
  if (!inv) return { error: `Nothing to peel off ${t(side)}. Peel works on powers, roots, ln, log, e^ and 1/( ).` };
  return wrapBoth(e, inv.f, inv.k);
}

/** "Move it across": the engine picks the inverse operation from what is aimed. */
export function moveAny(e: Eq, sel: string | null): MoveResult {
  if (!sel || sel === 'eq') return { error: 'Aim at a piece first (Space), then m moves it across the =.' };
  const path = findPath(e, sel);
  if (!path) return { error: 'Aim at a piece first.' };
  const node = path[path.length - 1], parent = path[path.length - 2], root = path[1];
  if (node === root && inverseOf(node)) return peel(e, sel);
  const a = moveAcross(e, sel);
  if (!isErr(a)) return a;
  if (parent === root && root.k === 'mul') return divideBoth(e, sel);
  if (root.k === 'frac' && (node === root.den || parent === root.den)) return multiplyBoth(e, sel);
  if (parent === root && root.k === 'pow' && node === root.exp) return peel(e, root.id);
  if (parent === root && root.k === 'pow' && node === root.base && inverseOf(root)) return peel(e, root.id);
  if (parent === root && (root.k === 'sqrt' || root.k === 'fn')) return peel(e, root.id);
  return a;
}

/* ---------- tidy: simplify both sides, as its own (auto) step ---------- */
export function tidy(e: Eq): MoveOk | null {
  const h = newHints();
  const next = eq(simplify(e.lhs, h), simplify(e.rhs, h));
  if (key(next) === key(e)) return null;
  const r = checked(e, { eq: next, label: 'tidy', hints: h, factor: one, auto: true, select: null });
  return isErr(r) ? null : r;
}

/* ---------- isolate a variable: a short chain of moves ---------- */
export function isolate(e: Eq, v: string): MoveOk[] | { error: string } {
  if (!has(e, v)) return { error: `There is no ${v} in this equation.` };
  const steps: MoveOk[] = [];
  let cur = e;
  const push = (r: MoveResult): boolean => {
    const c = checked(cur, r);
    if (isErr(c)) return false;
    steps.push(c); cur = c.eq;
    const td = tidy(cur);
    if (td) { steps.push(td); cur = td.eq; }
    return true;
  };
  const stuck = (why: string) => (steps.length ? steps : { error: why });
  const td0 = tidy(cur);
  if (td0) { steps.push(td0); cur = td0.eq; }
  for (let i = 0; i < 24; i++) {
    const hl = has(cur.lhs, v), hr = has(cur.rhs, v);
    if (hl && hr) {
      const rt = cur.rhs.k === 'add' ? cur.rhs.terms : [cur.rhs];
      const term = rt.find(x => has(x, v))!;
      if (!push(moveAcross(cur, term.id))) return stuck(`Couldn't gather the ${v} terms.`);
      continue;
    }
    const s: 'lhs' | 'rhs' = hl ? 'lhs' : 'rhs';
    const side = cur[s];
    if (side.k === 'sym' && side.name === v) {
      if (s === 'rhs') push(swapSides(cur, null));
      return steps.length ? steps : { error: `Already solved for ${v}.` };
    }
    let ok = false;
    if (side.k === 'add') {
      const rest = side.terms.filter(x => !has(x, v));
      if (rest.length) ok = push(moveAcross(cur, rest[0].id));
      else if (hasExpandable(side)) { const h = newHints(); ok = push({ eq: replace(cur, side.id, expandAll(side, h)), label: 'expand', hints: h, factor: one, select: null }); }
      else {
        const h = newHints();
        const f = factorCommon(side, h);
        if (f && f.k === 'mul' && f.factors.filter(x => has(x, v)).length === 1 && key(f.factors.find(x => has(x, v))!) === v) {
          ok = push({ eq: replace(cur, side.id, f), label: `factor out ${v}`, hints: h, factor: one, select: null });
        }
      }
    } else if (side.k === 'mul') {
      const withV = side.factors.filter(x => has(x, v));
      const other = side.factors.find(x => !has(x, v) && !(x.k === 'num' && x.v === 1));
      if (other) ok = push(divideBoth(cur, other.id));
      else if (withV.length > 1 && hasExpandable(side)) { const h = newHints(); ok = push({ eq: replace(cur, side.id, expandAll(side, h)), label: 'expand', hints: h, factor: one, select: null }); }
    } else if (side.k === 'neg') {
      const L = negate(cur.lhs), R = negate(cur.rhs);
      ok = push({ eq: eq(L, R), label: '× −1 both sides', hints: newHints(), factor: () => -1, select: null });
    } else if (side.k === 'frac') {
      ok = push(multiplyBoth(cur, side.den.id));
      if (!ok && !has(side.den, v) && side.num.k !== 'num') ok = push(multiplyBoth(cur, side.id));
    } else if (side.k === 'fn' && side.name === 'abs') {
      return stuck(`${t(side)} has two cases. Hold E and press a to split it.`);
    } else if (inverseOf(side)) {
      ok = push(peel(cur, side.id));
    }
    if (!ok) return stuck(`I can't isolate ${v} here: it isn't linear in ${v} (try factoring or another form).`);
  }
  return stuck(`Gave up isolating ${v}.`);
}

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

/* ---------- |X| = B → X = B or X = −B ---------- */
export function splitAbs(e: Eq): { a: MoveOk; b: Eq } | { error: string } {
  const s = e.lhs.k === 'fn' && e.lhs.name === 'abs' ? 'lhs' : e.rhs.k === 'fn' && e.rhs.name === 'abs' ? 'rhs' : null;
  if (!s) return { error: 'Split needs a side that is |something|.' };
  const X = (e[s] as Extract<Node, { k: 'fn' }>).arg, B = s === 'lhs' ? e.rhs : e.lhs;
  if (B.k === 'num' && B.v < 0) return { error: `|${t(X)}| can't equal a negative number: no solutions.` };
  const A = eq(X, B);
  const Bn = cloneFresh(B); walk(Bn, m => { m.from = undefined; });
  const Xc = cloneFresh(X); walk(Xc, m => { m.from = undefined; });
  const other = eq(Xc, negate(Bn));
  // (X − B)(X + B) = X² − B² = (|X| − B)(|X| + B)
  const a: MoveOk = {
    eq: A, label: `split |${t(X)}| into two cases`, hints: newHints(), factor: one, select: null,
    conditions: hasSymbols(B) ? [`${t(B)} ≥ 0`] : [],
    check: env => {
      const x = evaluate(X, env), b = evaluate(B, env);
      return [[(evaluate(A, env)) * (evaluate(other, env)), evaluate(e[s], env) ** 2 - b * b], [x * x - b * b, (Math.abs(x) - b) * (Math.abs(x) + b)]];
    },
  };
  const c = checked(e, a);
  if (isErr(c)) return c;
  return { a: c, b: other };
}

