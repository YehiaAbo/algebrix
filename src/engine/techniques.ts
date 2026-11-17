// Bigger tools built from the small moves: apply a function to both sides, peel
// the outer function off a side, move anything across "=", isolate a variable
// in several steps, substitute one equation into another, split |X| = B.
import { Node, Eq, find, children, allIds, findPath, cloneFresh, num, sym, add, mul, frac, pow, sqrt, fn, eq, evaluate, Env, symbols, hasSymbols, walk, key, replace, relOf } from './ast';
import { parseExpr } from './parse';
import { Rat, negate, isNeg, coefOf, gcd, rat, rmul, rdiv, radd } from './terms';
import { simplify, newHints } from './simplify';
import { expandAll, hasExpandable, findExpandable, factorCommon, factorize, polyOf, standardOrder } from './rewrite';
import { toText } from './print';
import { MoveOk, MoveResult, isErr, moveAcross, divideBoth, multiplyBoth, swapSides, checked, solvedFor, applyBothChecked } from './moves';
import { factorFully } from './polytools';

const t = (n: Node) => toText(n);
const one = () => 1;
const has = (n: Node, v: string) => symbols(n).includes(v);

/* ---------- functions on both sides ---------- */

export type Wrap = 'square' | 'cube' | 'power' | 'recip' | 'sqrt' | 'cbrt' | 'root'
  | 'exp' | 'pow10' | 'powb' | 'ln' | 'log' | 'logb' | 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan';

export interface WrapItem { key: string; f: Wrap; label: string; show: string; ask?: string }
/** The f menu: tabs of functions you can apply to both sides. `ask` items need a number typed in. */
export const FN_TABS: { name: string; items: WrapItem[] }[] = [
  { name: 'Powers', items: [
    { key: '2', f: 'square', label: 'square', show: '( )²' },
    { key: '3', f: 'cube', label: 'cube', show: '( )³' },
    { key: 'n', f: 'power', label: 'power n', show: '( )ⁿ', ask: 'n' },
    { key: '1', f: 'recip', label: 'flip', show: '1/( )' },
  ] },
  { name: 'Roots', items: [
    { key: 'r', f: 'sqrt', label: 'square root', show: '√( )' },
    { key: 'c', f: 'cbrt', label: 'cube root', show: '∛( )' },
    { key: 'k', f: 'root', label: 'nth root', show: 'ⁿ√( )', ask: 'n' },
  ] },
  { name: 'Exp and log', items: [
    { key: 'e', f: 'exp', label: 'e to the', show: 'e^( )' },
    { key: 'x', f: 'pow10', label: '10 to the', show: '10^( )' },
    { key: 'b', f: 'powb', label: 'b to the', show: 'b^( )', ask: 'b' },
    { key: 'l', f: 'ln', label: 'natural log', show: 'ln( )' },
    { key: 'g', f: 'log', label: 'log base 10', show: 'log( )' },
    { key: 'h', f: 'logb', label: 'log base b', show: 'log_b( )', ask: 'b' },
  ] },
  { name: 'Trig', items: [
    { key: 's', f: 'sin', label: 'sine', show: 'sin( )' },
    { key: 'o', f: 'cos', label: 'cosine', show: 'cos( )' },
    { key: 't', f: 'tan', label: 'tangent', show: 'tan( )' },
    { key: 'a', f: 'asin', label: 'inverse sine', show: 'sin⁻¹( )' },
    { key: 'w', f: 'acos', label: 'inverse cosine', show: 'cos⁻¹( )' },
    { key: 'y', f: 'atan', label: 'inverse tangent', show: 'tan⁻¹( )' },
  ] },
];
export const WRAPS: WrapItem[] = FN_TABS.flatMap(t => t.items);

const nonNeg = (n: Node) => (n.k === 'num' && n.v >= 0) || n.k === 'sqrt' || (n.k === 'fn' && n.name === 'abs') || (n.k === 'pow' && n.exp.k === 'num' && n.exp.v % 2 === 0) || (n.k === 'pow' && n.base.k === 'sym' && n.base.name === 'e');
const positive = (n: Node) => (n.k === 'num' && n.v > 0) || (n.k === 'pow' && n.base.k === 'sym' && n.base.name === 'e') || (n.k === 'pow' && n.base.k === 'num' && n.base.v > 0);
const fresh = (n: Node) => { const c = cloneFresh(n); walk(c, m => { m.from = undefined; }); return c; };

function wrapNode(s: Node, f: Wrap, arg: Node): Node {
  switch (f) {
    case 'square': return pow(s, num(2));
    case 'cube': return pow(s, num(3));
    case 'power': return pow(s, fresh(arg));
    case 'recip': return frac(num(1), s);
    case 'sqrt': return sqrt(s);
    case 'cbrt': return pow(s, frac(num(1), num(3)));
    case 'root': return pow(s, frac(num(1), fresh(arg)));
    case 'exp': return pow(sym('e'), s);
    case 'pow10': return pow(num(10), s);
    case 'powb': return pow(fresh(arg), s);
    case 'ln': return fn('ln', s);
    case 'log': return fn('log', s);
    case 'logb': return frac(fn('ln', s), fn('ln', fresh(arg)));
    default: return fn(f, s);
  }
}

const NUMERIC: Record<Wrap, (v: number, k: number) => number> = {
  square: v => v * v, cube: v => v ** 3, power: (v, k) => Math.pow(v, k), recip: v => 1 / v,
  sqrt: v => Math.sqrt(v), cbrt: v => (v < 0 ? NaN : Math.cbrt(v)), root: (v, k) => Math.pow(v, 1 / k),
  exp: v => Math.exp(v), pow10: v => 10 ** v, powb: (v, k) => Math.pow(k, v),
  ln: v => (v > 0 ? Math.log(v) : NaN), log: v => (v > 0 ? Math.log10(v) : NaN), logb: (v, k) => (v > 0 ? Math.log(v) / Math.log(k) : NaN),
  sin: Math.sin, cos: Math.cos, tan: v => Math.tan(v), asin: Math.asin, acos: Math.acos, atan: Math.atan,
};

const LABELS: Partial<Record<Wrap, string>> = {
  square: 'square both sides', cube: 'cube both sides', recip: 'flip both sides', sqrt: 'square root both sides',
  cbrt: 'cube root both sides', exp: 'e to both sides', pow10: '10 to both sides', ln: 'ln both sides', log: 'log both sides',
};

/** Wrap both sides in f. Pointwise checked: new side = f(old side). */
export function wrapBoth(e: Eq, f: Wrap, arg: Node = num(2)): MoveResult {
  if (hasSymbols(arg)) return { error: 'Use a plain number here, like 4 or 1/2.' };
  const k = evaluate(arg, {});
  const a = t(arg);
  if (!Number.isFinite(k)) return { error: `${a} isn't a usable number.` };
  if (f === 'root' && k === 0) return { error: 'There is no 0th root.' };
  if (f === 'power' && k === 0) return { error: 'Raising to the power 0 turns both sides into 1 and loses the equation.' };
  if ((f === 'powb' || f === 'logb') && (k <= 0 || k === 1)) return { error: 'The base has to be positive and not 1.' };
  if (f === 'recip' && (key(e.lhs) === '0' || key(e.rhs) === '0')) return { error: 'A side is 0, and 1/0 is undefined.' };
  const L = wrapNode(e.lhs, f, arg), R = wrapNode(e.rhs, f, arg);
  const conditions: string[] = [];
  const sides = [e.lhs, e.rhs];
  const even = (x: number) => Number.isInteger(x) && x % 2 === 0;
  if (f === 'square' || (f === 'power' && even(k)) || f === 'sin' || f === 'cos' || f === 'tan') conditions.push('this can add solutions: check answers');
  if (f === 'sqrt' || f === 'cbrt' || (f === 'root' && !(Number.isInteger(k) && k % 2 === 1)) || (f === 'power' && !Number.isInteger(k))) sides.filter(s => !nonNeg(s) && hasSymbols(s)).forEach(s => conditions.push(`${t(s)} ≥ 0`));
  if (f === 'ln' || f === 'log' || f === 'logb') sides.filter(s => !positive(s)).forEach(s => conditions.push(`${t(s)} > 0`));
  if (f === 'recip' || (f === 'power' && k < 0)) sides.filter(s => hasSymbols(s)).forEach(s => conditions.push(`${t(s)} ≠ 0`));
  if (f === 'asin' || f === 'acos') sides.filter(s => hasSymbols(s)).forEach(s => conditions.push(`−1 ≤ ${t(s)} ≤ 1`));
  const g = NUMERIC[f];
  const label = LABELS[f] ?? ({ power: `power ${a} both sides`, root: `${a}th root both sides`, powb: `${a} to both sides`, logb: `log base ${a} both sides` } as Record<string, string>)[f] ?? `${FN_LABEL[f] ?? f} both sides`;
  return {
    eq: eq(L, R), label, hints: newHints(), factor: one, select: null, conditions,
    check: env => [[evaluate(L, env), g(evaluate(e.lhs, env), k)], [evaluate(R, env), g(evaluate(e.rhs, env), k)]],
  };
}
const FN_LABEL: Partial<Record<Wrap, string>> = { asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹' };

/** The function that undoes the outer layer of a side, if there is one. */
export function inverseOf(side: Node): { f: Wrap; arg?: Node } | null {
  if (side.k === 'pow') {
    const { base, exp } = side;
    if (exp.k === 'num' && Number.isInteger(exp.v) && exp.v >= 2) return exp.v === 2 ? { f: 'sqrt' } : exp.v === 3 ? { f: 'cbrt' } : { f: 'root', arg: num(exp.v) };
    if (exp.k === 'num' && exp.v === -1) return { f: 'recip' };
    if (base.k === 'sym' && base.name === 'e') return { f: 'ln' };
    if (base.k === 'num' && base.v === 10) return { f: 'log' };
    if (base.k === 'num' && base.v > 0 && base.v !== 1 && hasSymbols(exp)) return { f: 'logb', arg: num(base.v) };
    if (exp.k === 'frac' && exp.num.k === 'num' && exp.num.v === 1 && !hasSymbols(exp.den)) return key(exp.den) === '3' ? { f: 'cube' } : { f: 'power', arg: exp.den };
  }
  if (side.k === 'sqrt') return { f: 'square' };
  if (side.k === 'fn') {
    const m: Partial<Record<string, Wrap>> = { ln: 'exp', log: 'pow10', sin: 'asin', cos: 'acos', tan: 'atan', asin: 'sin', acos: 'cos', atan: 'tan' };
    if (m[side.name]) return { f: m[side.name]! };
  }
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

const TRIG_MORE: Record<string, string> = {
  sin: 'one solution of many: also π − that, and every 2π more',
  cos: 'one solution of many: also minus that, and every 2π more',
  tan: 'one solution of many: also every π more',
};

/** sin(X) = B → X = sin⁻¹(B). Checked by sin(arcsin B) = B; the lost solutions are noted. */
function peelTrig(e: Eq, s: 'lhs' | 'rhs'): MoveResult {
  const side = e[s] as Extract<Node, { k: 'fn' }>;
  const B = s === 'lhs' ? e.rhs : e.lhs;
  const inv = ('a' + side.name) as 'asin';
  if (!hasSymbols(B) && side.name !== 'tan' && Math.abs(evaluate(B, {})) > 1) return { error: `${side.name} never reaches ${t(B)}: no solutions.` };
  const R = fn(inv, B);
  const next = s === 'lhs' ? eq(side.arg, R) : eq(R, side.arg);
  const f = NUMERIC[side.name as Wrap];
  return {
    eq: next, label: `${FN_LABEL[inv]} both sides`, hints: newHints(), factor: one, select: null,
    conditions: [TRIG_MORE[side.name], ...(hasSymbols(B) && side.name !== 'tan' ? [`−1 ≤ ${t(B)} ≤ 1`] : [])],
    check: env => [[f(evaluate(R, env), 0), evaluate(B, env)]],
  };
}

export function peel(e: Eq, sel: string | null): MoveResult {
  const s = sideFor(e, sel);
  const side = e[s];
  if (side.k === 'fn' && side.name === 'abs') return { error: 'Absolute value has two cases. Hold e and press a to split it.' };
  if (side.k === 'fn' && (side.name === 'sin' || side.name === 'cos' || side.name === 'tan')) return peelTrig(e, s);
  const inv = inverseOf(side);
  if (!inv) return { error: `Nothing to undo on ${t(side)}. This works on powers, roots, exponentials, logs and trig.` };
  const r = wrapBoth(e, inv.f, inv.arg);
  if (isErr(r)) return r;
  // undoing means the function cancels on its own side; the other side is left for you to simplify
  const h = newHints();
  return { ...r, eq: s === 'lhs' ? eq(simplify(r.eq.lhs, h), r.eq.rhs) : eq(r.eq.lhs, simplify(r.eq.rhs, h)) };
}

/** "Move it across": the engine picks the inverse operation from what is aimed. */
export function moveAny(e: Eq, sel: string | null): MoveResult {
  // every path goes through checked(), which also carries an inequality's sign (flipping it when needed)
  const r = moveAnyRaw(e, sel);
  return isErr(r) ? r : checked(e, r);
}

function moveAnyRaw(e: Eq, sel: string | null): MoveResult {
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
/** Multiply both sides by the LCD of the number denominators, then expand. */
export function clearFractions(e: Eq, v?: string): MoveOk | null {
  let L = 1, holds = !v;
  walk(e, n => {
    if (n.k === 'frac' && n.den.k === 'num' && Number.isInteger(n.den.v) && n.den.v > 1) {
      L = (L * n.den.v) / gcd(L, n.den.v);
      if (v && has(n, v)) holds = true;
    }
  });
  if (!holds) return null;
  if (L <= 1 || L > 1e6) return null;
  const h = newHints();
  const clear = (s: Node) => simplify(expandAll(mul([num(L), s]), h), h);
  const r = checked(e, { eq: eq(clear(e.lhs), clear(e.rhs)), label: `× ${L} to clear fractions`, hints: h, factor: () => L, select: null });
  return isErr(r) ? null : r;
}

/** Quadratic in v: everything to one side, then factor, else complete the square. */
/** a cubic or higher (x³ = 4x): everything on one side, then factor, so it splits into cases.
 *  Null when it doesn't factor into pieces with the letter in them */
function factorAll(e: Eq, v: string): MoveOk[] | null {
  const h = newHints();
  let zero = simplify(expandAll(add([e.lhs, negate(fresh(e.rhs))]), h), h);
  let P = polyOf(zero);
  if (!P || P.v !== v || P.c.length < 4) return null;
  let flip = 1;
  if (P.c[P.c.length - 1].p < 0) { zero = simplify(expandAll(add([e.rhs, negate(fresh(e.lhs))]), h), h); P = polyOf(zero)!; flip = -1; }
  zero = standardOrder(zero) ?? zero;
  const hf = newHints();
  const f = factorFully(zero, hf);
  if (!f || f.k !== 'mul' || f.factors.filter(x => has(x, v)).length < 2) return null;
  const out: MoveOk[] = [];
  let cur = e;
  if (!(e.rhs.k === 'num' && e.rhs.v === 0 && key(zero) === key(e.lhs))) {
    const r = checked(cur, { eq: eq(zero, num(0)), label: 'everything on one side', hints: h, factor: () => flip, select: null });
    if (isErr(r)) return null;
    out.push(r); cur = r.eq;
  }
  const r = checked(cur, { eq: eq(factorFully(cur.lhs, newHints()) ?? f, cur.rhs), label: 'factor', hints: hf, factor: one, select: null });
  if (isErr(r)) return null;
  out.push(r);
  return out;
}

function quadratic(e: Eq, v: string): MoveOk[] | null {
  const h = newHints();
  let zero = simplify(expandAll(add([e.lhs, negate(fresh(e.rhs))]), h), h);
  let P = polyOf(zero);
  if (!P || P.v !== v || P.c.length !== 3) return null;
  let flip = 1;
  if (P.c[2].p < 0) { zero = simplify(expandAll(add([e.rhs, negate(fresh(e.lhs))]), h), h); P = polyOf(zero)!; flip = -1; }
  zero = standardOrder(zero) ?? zero;
  const out: MoveOk[] = [];
  let cur = e;
  if (!(e.rhs.k === 'num' && e.rhs.v === 0 && key(zero) === key(e.lhs))) {
    const r = checked(cur, { eq: eq(zero, num(0)), label: 'everything on one side', hints: h, factor: () => flip, select: null });
    if (isErr(r)) return null;
    out.push(r); cur = r.eq;
  }
  const hf = newHints();
  const f = factorize(cur.lhs, hf);
  if (f && f.k === 'mul' && f.factors.filter(x => has(x, v)).length >= 2) {
    const r = checked(cur, { eq: eq(f, cur.rhs), label: 'factor', hints: hf, factor: one, select: null });
    if (!isErr(r)) { out.push(r); return out; }
  }
  // a v² + b v + c = 0  →  (v + b/2a)² = (b² − 4ac)/4a²
  const [c, b, A] = P.c;
  const shift = rdiv(b, rmul(rat(2), A));
  const D = radd(rmul(b, b), rmul(rat(-4), rmul(A, c)));
  const rhs = rdiv(D, rmul(rat(4), rmul(A, A)));
  if (rhs.p < 0) return null;
  const rn = (r: { p: number; q: number }) => (r.q === 1 ? num(r.p) : frac(num(r.p), num(r.q)));
  const inner = shift.p === 0 ? sym(v) : add([sym(v), rn(shift)]);
  const r = checked(cur, { eq: eq(pow(inner, num(2)), rn(rhs)), label: 'complete the square', hints: newHints(), factor: () => A.q / A.p, select: null });
  if (isErr(r)) return null;
  out.push(r);
  return out;
}

/** the real roots of a polynomial (coefficients lowest first), found where it changes sign */
function realRoots(c: Rat[]): number[] {
  const f = (x: number) => c.reduceRight((acc, r) => acc * x + r.p / r.q, 0);
  const out: number[] = [];
  for (let x = -100, step = 0.01; x < 100; x += step) {
    const a = f(x), b = f(x + step);
    if (a === 0) { out.push(x); continue; }
    if (a * b < 0) {
      let lo = x, hi = x + step;
      for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; }
      out.push((lo + hi) / 2);
    }
  }
  return out;
}

function noNiceFactors(cur: Eq, v: string, c: Rat[]): string {
  const zero = toText(eq(simplify(expandAll(add([cur.lhs, negate(fresh(cur.rhs))]), newHints()), newHints()), num(0)))
    .replace(/\^(\d+)/g, (_, d: string) => [...d].map(ch => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+ch]).join(''));
  const rs = realRoots(c).map(r => `${v} ≈ ${Number(r.toFixed(3))}`);
  return `${zero} has no nice factors, so there is no exact step to take. ${rs.length ? `It crosses zero at ${rs.join(' and ')} (the graph shows it).` : 'It never crosses zero.'}`;
}

export function isolate(e: Eq, v: string): MoveOk[] | { error: string } {
  if (!has(e, v)) return { error: `There is no ${v} in this equation.` };
  const steps: MoveOk[] = [];
  let cur = e;
  const take = (r: MoveOk) => { steps.push(r); cur = r.eq; };
  // a tidy you couldn't see isn't a step of its own: it folds into the move before it
  const tidyUp = () => {
    const td = tidy(cur);
    if (!td) return;
    if (steps.length && toText(td.eq) === toText(cur)) { steps[steps.length - 1] = { ...steps[steps.length - 1], eq: td.eq }; cur = td.eq; }
    else take(td);
  };
  const push = (r: MoveResult): boolean => {
    const c = checked(cur, r);
    if (isErr(c)) return false;
    take(c);
    tidyUp();
    return true;
  };
  const stuck = (why: string) => (steps.length ? steps : { error: why });
  tidyUp();
  // a tidy that changes nothing you can see doesn't start the list either
  if (steps.length === 1 && toText(steps[0].eq) === toText(e)) { steps.length = 0; }
  if (!has(cur, v)) return { error: `${v} cancels out completely, so there is nothing to solve for.` };
  const cf = clearFractions(cur, v);
  if (cf) take(cf);
  const seen = new Set<string>();
  for (let i = 0; i < 24; i++) {
    if (splitCases(cur, v)) return steps; // the caller splits into cases
    if (seen.has(key(cur))) return stuck(`I'm going in circles isolating ${v}. Try a form (hold e) first.`);
    seen.add(key(cur));
    const hl = has(cur.lhs, v), hr = has(cur.rhs, v);
    if (!hl && !hr) return stuck(`${v} cancelled out.`);
    const poly = polyOf(expandAll(add([cur.lhs, negate(fresh(cur.rhs))]), newHints()));
    const lone = hl !== hr ? cur[hl ? 'lhs' : 'rhs'] : null;
    const peelable = !!lone && !!inverseOf(lone) && lone.k !== 'frac';
    if (poly && poly.v === v && poly.c.length === 3 && !peelable) {
      const q = quadratic(cur, v);
      if (!q) return stuck(`This quadratic has no real solutions.`);
      q.forEach(take);
      continue;
    }
    // x³ = 4x: never take a cube root of one side; factor, and it splits into cases
    if (poly && poly.v === v && poly.c.length >= 4 && !peelable) {
      const f = relOf(cur) === '=' ? factorAll(cur, v) : null;
      if (f) { f.forEach(take); continue; }
      // x³ = x + 1: a root of each side would only go round in circles, so say where it crosses
      if (hl && hr) return stuck(noNiceFactors(cur, v, poly.c));
    }
    if (hl && hr) {
      // undo an outer function first (√(x + 1) = x − 1 → square), else gather the v terms on the left
      const wrapped = (['lhs', 'rhs'] as const).find(k => inverseOf(cur[k]) && cur[k].k !== 'frac');
      if (wrapped && push(peel(cur, cur[wrapped].id))) {
        if (hasExpandable(cur)) push({ eq: eq(expandAll(cur.lhs, newHints()), expandAll(cur.rhs, newHints())), label: 'expand', hints: newHints(), factor: one, select: null });
        continue;
      }
      // x + 1 = 3(x − 1): multiply out a side where the letter sits in brackets, then gather
      const inBrackets = (['rhs', 'lhs'] as const).find(k => { const f = findExpandable(cur[k]); return !!f && has(f, v); });
      if (inBrackets) { const h = newHints(); if (push({ eq: replace(cur, cur[inBrackets].id, expandAll(cur[inBrackets], h)) as Eq, label: 'expand', hints: h, factor: one, select: null })) continue; }
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
      const c = coefOf(side);
      // −x = 7 flips the signs (so does −3x = 7y − 20, keeping the sum tidy);
      // −2x = −4 divides by −2 in one go, as you would by hand
      if (c && c.v < 0 && (c.v === -1 || cur[s === 'lhs' ? 'rhs' : 'lhs'].k === 'add')) ok = push({ eq: eq(negAll(cur.lhs), negAll(cur.rhs)), label: '× −1 both sides', hints: newHints(), factor: () => -1, select: null });
      else if (other) ok = push(divideBoth(cur, other.id));
      else if (withV.length > 1 && hasExpandable(side)) { const h = newHints(); ok = push({ eq: replace(cur, side.id, expandAll(side, h)), label: 'expand', hints: h, factor: one, select: null }); }
    } else if (side.k === 'neg') {
      const L = negAll(cur.lhs), R = negAll(cur.rhs);
      ok = push({ eq: eq(L, R), label: '× −1 both sides', hints: newHints(), factor: () => -1, select: null });
    } else if (side.k === 'frac') {
      ok = push(multiplyBoth(cur, side.den.id));
      if (!ok && !has(side.den, v) && side.num.k !== 'num') ok = push(multiplyBoth(cur, side.id));
    } else if (inverseOf(side) || (side.k === 'fn' && side.name !== 'abs')) {
      ok = push(peel(cur, side.id));
    }
    if (!ok) return stuck(`I can't isolate ${v} here yet. Try factoring or another form.`);
  }
  return stuck(`Gave up isolating ${v}.`);
}

/** −S with the sign pushed into each term, keeping a positive term first: −(7y − 20) → 20 − 7y */
function negAll(n: Node): Node {
  if (n.k !== 'add') return negate(n);
  const ts = n.terms.map(negate);
  const i = ts.findIndex(x => !isNeg(x));
  return i > 0 ? { ...n, terms: [ts[i], ...ts.filter((_, j) => j !== i)] } : { ...n, terms: ts };
}

/* ---------- cases: |X| = B and A·B = 0 ---------- */

export interface Cases { first: MoveOk; rest: Eq[]; why: string }

/** Split an equation into several simpler ones, if it has that shape. */
export function splitCases(e: Eq, v?: string): Cases | null {
  if (e.rel && e.rel !== '=') return null; // |x| < 3 is an "and", not two cases: use the sign chart
  const sides = [['lhs', e.lhs, e.rhs], ['rhs', e.rhs, e.lhs]] as const;
  for (const [, S, B] of sides) {
    if (S.k === 'fn' && S.name === 'abs' && (!v || has(S, v)) && !(v && has(B, v))) {
      if (B.k === 'num' && B.v < 0) return null;
      const X = S.arg;
      const A = eq(X, B);
      const other = eq(fresh(X), negate(fresh(B)));
      const first: MoveOk = {
        eq: A, label: `split |${t(X)}| into two cases`, hints: newHints(), factor: one, select: null,
        conditions: hasSymbols(B) ? [`${t(B)} ≥ 0`] : [],
        check: env => [[evaluate(A, env) * evaluate(other, env), evaluate(S, env) ** 2 - evaluate(B, env) ** 2]],
      };
      const c = checked(e, first);
      return isErr(c) ? null : { first: c, rest: [other], why: 'two cases' };
    }
    if (S.k === 'mul' && B.k === 'num' && B.v === 0) {
      const parts = S.factors.filter(f => hasSymbols(f) && (!v || has(f, v)));
      if (parts.length < 2) continue;
      const eqs = parts.map((p, i) => eq(i === 0 ? p : fresh(p), num(0)));
      const others = S.factors.filter(f => !parts.includes(f));
      const first: MoveOk = {
        eq: eqs[0], label: 'zero product: one factor is 0', hints: newHints(), factor: one, select: null,
        conditions: others.filter(hasSymbols).map(o => `${t(o)} ≠ 0`),
        check: env => [[eqs.reduce((p, q) => p * evaluate(q, env), 1) * others.reduce((p, o) => p * evaluate(o, env), 1), evaluate(S, env)]],
      };
      const c = checked(e, first);
      return isErr(c) ? null : { first: c, rest: eqs.slice(1), why: `${parts.length} cases` };
    }
  }
  return null;
}

/* ---------- the quadratic formula ---------- */

/** a v² + b v + c = 0  →  v = (−b ± √(b² − 4ac)) / 2a, as two cases with a, b, c plugged in. */
export function quadraticFormula(e: Eq, v: string): Cases | { error: string } {
  if (relOf(e) !== '=') return { error: 'The quadratic formula needs an equation.' };
  const P = polyOf(expandAll(add([fresh(e.lhs), negate(fresh(e.rhs))]), newHints()));
  if (!P || P.v !== v || P.c.length !== 3) return { error: `The quadratic formula needs a${v}² + b${v} + c = 0.` };
  const [c, b, a] = P.c;
  const D = radd(rmul(b, b), rmul(rat(-4), rmul(a, c)));
  if (D.p < 0) return { error: `b² − 4ac = ${D.q === 1 ? D.p : `${D.p}/${D.q}`} is negative, so there are no real solutions.` };
  const r = (x: { p: number; q: number }) => { const s = x.q === 1 ? String(x.p) : `${x.p}/${x.q}`; return x.p < 0 || x.q !== 1 ? `(${s})` : s; };
  const root = (sign: '+' | '-') => eq(sym(v), parseExpr(`(-${r(b)} ${sign} sqrt(${r(b)}^2 - 4*${r(a)}*${r(c)}))/(2*${r(a)})`));
  const E1 = root('+'), E2 = root('-');
  const A = a.p / a.q;
  const ev = (q: Eq, env: Env) => evaluate(q.lhs, env) - evaluate(q.rhs, env);
  const one_ = D.p === 0;
  const first: MoveOk = {
    eq: E1, label: one_ ? 'quadratic formula (one repeated root)' : 'quadratic formula: + and − cases', hints: newHints(), factor: one, select: null,
    check: env => [[A * ev(E1, env) * ev(one_ ? E1 : E2, env), ev(e, env)]],
  };
  const ok = checked(e, first);
  if (isErr(ok)) return ok;
  return { first: ok, rest: one_ ? [] : [E2], why: 'two cases' };
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

/* ---------- |X| = B → X = B or X = −B (kept for the tests) ---------- */
export function splitAbs(e: Eq): { a: MoveOk; b: Eq } | { error: string } {
  const c = splitCases(e);
  if (!c) return { error: 'Split needs |something| = b, or a product = 0.' };
  return { a: c.first, b: c.rest[0] };
}

/* ---------- a possible simplification, offered instead of done automatically ---------- */

export interface Spot { node: string; marks: string[]; move: MoveOk }

/** The smallest piece that would simplify, the parts that would change, and the move that does it. */
const hasCalcNode = (n: Node) => { let f = false; walk(n, m => { if (['deriv', 'lim', 'int', 'at', 'sum', 'grad'].includes(m.k)) f = true; }); return f; };

export function simplifySpot(e: Eq): Spot | null {
  let hit: { n: Node; r: Node; h: ReturnType<typeof newHints> } | null = null;
  const visit = (n: Node) => {
    for (const c of children(n)) { visit(c); if (hit) return; }
    if (hit || n.k === 'eq') return;
    const h = newHints();
    const r = simplify(n, h);
    // a change you couldn't see isn't worth a press
    if (key(r) !== key(n) && toText(r) !== toText(n)) hit = { n, r, h };
  };
  visit(e);
  if (!hit) return null;
  // plain arithmetic goes all the way in one press: the largest piece with no letters around it
  const found = hit as { n: Node; r: Node; h: ReturnType<typeof newHints> };
  if (!symbols(found.n).length) {
    const top = findPath(e, found.n.id)?.find(m => m.k !== 'eq' && !symbols(m).length && !hasCalcNode(m));
    if (top && top !== found.n) {
      const h = newHints(), r = simplify(top, h);
      if (key(r) !== key(top) && toText(r) !== toText(top)) hit = { n: top, r, h };
    }
  }
  const { n, r, h } = hit as { n: Node; r: Node; h: ReturnType<typeof newHints> };
  const move = checked(e, { eq: replace(e, n.id, r), label: 'simplify', hints: h, factor: one, select: null });
  if (isErr(move)) return null;
  const left = new Set(allIds(move.eq));
  const marks: string[] = [];
  const gone = (m: Node) => { if (!left.has(m.id)) { marks.push(m.id); return; } children(m).forEach(gone); };
  children(n).forEach(gone);
  for (const [from, to] of h.absorbs) if (left.has(to) && marks.includes(from) && !marks.includes(to) && find(e, to)) marks.push(to);
  return { node: n.id, marks: marks.length ? marks : [n.id], move };
}

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

export function eliminate(e: Eq, other: Eq, j: number, v?: string): MoveResult {
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
