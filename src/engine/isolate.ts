// Solving for a letter as a short chain of moves: clear fractions, collect, factor, the quadratic
// formula, split into cases (|X| = B, A·B = 0), tidy, and every solution of a trig equation.
import { Node, Eq, logBase, children, withChildren, findPath, cloneFresh, num, sym, add, mul, frac, pow, fn, eq, evaluate, Env, symbols, hasSymbols, walk, key, replace, relOf } from './ast';
import { parseExpr } from './parse';
import { Rat, negate, isNeg, coefOf, gcd, rat, rmul, rdiv, radd, termInfo, buildTerm } from './terms';
import { simplify, newHints, nonneg as isNonneg } from './simplify';
import { expandAll, hasExpandable, findExpandable, factorCommon, factorize, polyOf, standardOrder } from './rewrite';
import { toText } from './print';
import { MoveOk, MoveResult, Checked, isErr, moveAcross, divideBoth, multiplyBoth, swapSides, checked, solvedFor } from './moves';
import { factorFully } from './polytools';
import { logRules } from './forms';
import { inverseOf, peel, wrapBoth } from './wrap';

const t = (n: Node) => toText(n);
const one = () => 1;
const has = (n: Node, v: string) => symbols(n).includes(v);
const fresh = (n: Node) => { const c = cloneFresh(n); walk(c, m => { m.from = undefined; }); return c; };

/* ---------- tidy: simplify both sides, as its own (auto) step ---------- */
/** f(4) = 2·4 + 3: the side f(4) is what the equation is about (a value put into f), so working
 *  out the numbers leaves it as it is, instead of 11 = 11. (y = f(4) still works f(4) out.) */
export function isSubject(e: Eq, n: Node): boolean {
  const other = n === e.lhs ? e.rhs : n === e.rhs ? e.lhs : null;
  const subject = (m: Node, o: Node) => m.k === 'call' && !hasSymbols(m.arg) && !hasSymbols(o);
  // one side at most: in g(7) = f⁻¹(7) the right side is what g(7) comes to, so it works out
  return !!other && subject(n, other) && !(n === e.rhs && subject(e.lhs, e.rhs));
}

export function tidy(e: Eq): Checked | null {
  const h = newHints();
  const next = eq(isSubject(e, e.lhs) ? e.lhs : simplify(e.lhs, h), isSubject(e, e.rhs) ? e.rhs : simplify(e.rhs, h));
  if (key(next) === key(e)) return null;
  const r = checked(e, { eq: next, label: 'tidy', hints: h, factor: one, auto: true, select: null });
  return isErr(r) ? null : r;
}

/** a sum that starts with a minus starts with its constant of integration instead: −x² + C is
 *  C − x² (but −2 + √3 stays, as the quadratic formula writes it) */
export function leadPositive<T extends Node>(n: T): T {
  const ks = children(n);
  const m = (ks.length ? withChildren(n, ks.map(leadPositive)) : n) as Node;
  if (m.k !== 'add' || m.terms.length < 2) return m as T;
  const minus = (t: Node): boolean => isNeg(t) || (t.k === 'frac' && minus(t.num));
  if (!minus(m.terms[0])) return m as T;
  const theirs = new Set(m.terms.filter(minus).flatMap(t => symbols(t)));
  const i = m.terms.findIndex(t => !minus(t) && symbols(t).includes('C') && symbols(t).every(v => !theirs.has(v)));
  return (i < 0 ? m : { ...m, terms: [m.terms[i], ...m.terms.filter((_, j) => j !== i)] }) as T;
}

/** a sum with two or more logs of the letter: ln A + ln B − ln D = ln(AB/D), with A, B, D > 0 */
export function combineLogs(n: Node, v?: string): { n: Node; label: string; conditions: string[] } | null {
  if (n.k !== 'add') return null;
  // log₂ a (kept as ln a/ln 2) counts as a log of its own base
  const lnOf = (t: Node): { arg: Node; sign: 1 | -1; name: string; base?: Node } | null => {
    const m = t.k === 'neg' ? t.arg : t, sign = t.k === 'neg' ? -1 : 1;
    const lb = logBase(m);
    if (lb) return !v || has(lb.arg, v) ? { arg: lb.arg, sign, name: `log_${t_(lb.base)}`, base: lb.base } : null;
    return m.k === 'fn' && (m.name === 'ln' || m.name === 'log') && (!v || has(m.arg, v)) ? { arg: m.arg, sign, name: m.name } : null;
  };
  const ls = n.terms.map(lnOf);
  const found = ls.filter(Boolean) as { arg: Node; sign: 1 | -1; name: string; base?: Node }[];
  if (found.length < 2 || new Set(found.map(f => f.name)).size > 1) return null;
  const top = found.filter(f => f.sign > 0).map(f => fresh(f.arg)), bottom = found.filter(f => f.sign < 0).map(f => fresh(f.arg));
  const prod = (fs: Node[]) => (fs.length === 1 ? fs[0] : mul(fs));
  const inner = bottom.length ? frac(top.length ? prod(top) : num(1), prod(bottom)) : prod(top);
  const one = found[0].base ? frac(fn('ln', inner), fn('ln', fresh(found[0].base))) : fn(found[0].name as 'ln', inner);
  const rest = n.terms.filter((_, i) => !ls[i]);
  const name = found[0].base ? `log${toSub(t_(found[0].base))}` : found[0].name;
  return {
    n: rest.length ? add([one, ...rest]) : one,
    label: bottom.length ? `${name} a − ${name} b = ${name}(a/b)` : `${name} a + ${name} b = ${name}(ab)`,
    conditions: found.map(f => `${t(f.arg)} > 0`),
  };
}

const t_ = (n: Node) => toText(n);
const toSub = (s: string) => s.replace(/[0-9]/g, d => '₀₁₂₃₄₅₆₇₈₉'[+d]);

/* ---------- isolate a variable: a short chain of moves ---------- */
/** Multiply both sides by the LCD of the number denominators, then expand. */
export function clearFractions(e: Eq, v?: string): Checked | null {
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

/** 1/(x − 1) + 1/(x + 1) = 1: × every bottom with the letter in it, so what is left has no fractions.
 *  Each bottom can't be 0, which is noted; an answer that makes one 0 is caught by the check. */
export function clearLetterFractions(e: Eq, v: string): Checked | null {
  if (relOf(e) !== '=') return null;
  const dens: Node[] = [];
  walk(e, n => { if (n.k === 'frac' && has(n.den, v) && !dens.some(d => key(d) === key(n.den))) dens.push(n.den); });
  if (!dens.length) return null;
  dens.sort((a, b) => toText(a).length - toText(b).length);
  // number bottoms too (1/x + 1/(x + 1) = 5/6 clears with 6x(x + 1)), so nothing is left over
  let L = 1;
  walk(e, n => { if (n.k === 'frac' && n.den.k === 'num' && Number.isInteger(n.den.v) && n.den.v > 1) L = (L * n.den.v) / gcd(L, n.den.v); });
  if (L > 1e6) return null;
  const lead = (k: number) => (k === 1 ? [] : [num(k)]);
  const D = mul([...lead(L), ...dens.map(fresh)]);
  const shown = dens.length === 1 && L === 1 ? fresh(dens[0]) : D;
  const h = newHints();
  // each term's own bottom cancels against its copy in D before anything is multiplied out
  const others = (i: number) => dens.filter((_, j) => j !== i).map(fresh);
  const over = (t: Node): Node => {
    if (t.k === 'neg') return negate(over(t.arg));
    if (t.k === 'frac') {
      const i = dens.findIndex(d => key(d) === key(t.den));
      if (i >= 0) return mul([...lead(L), ...others(i), fresh(t.num)]);
      if (t.den.k === 'num' && L % t.den.v === 0) return mul([...lead(L / t.den.v), ...dens.map(fresh), fresh(t.num)]);
    }
    if (t.k === 'mul') {
      const fi = t.factors.findIndex(f => f.k === 'frac' && dens.some(d => key(d) === key(f.den)));
      if (fi >= 0) {
        const f = t.factors[fi] as Extract<Node, { k: 'frac' }>, i = dens.findIndex(d => key(d) === key(f.den));
        return mul([...lead(L), ...others(i), ...t.factors.filter((_, j) => j !== fi).map(fresh), fresh(f.num)]);
      }
    }
    return mul([fresh(D), fresh(t)]);
  };
  const clear = (side: Node) => simplify(expandAll(side.k === 'add' ? add(side.terms.map(over)) : over(side), h), h);
  const next = eq(clear(e.lhs), clear(e.rhs));
  let still = false;
  walk(next, n => { if (n.k === 'frac' && has(n.den, v)) still = true; });
  if (still) return null;
  const r = checked(e, {
    eq: next, label: `× ${toText(shown)} to clear fractions`, hints: h, factor: env => evaluate(D, env), select: null,
    conditions: dens.map(d => `${toText(d)} ≠ 0`),
  });
  return isErr(r) ? null : r;
}

/** Quadratic in v: everything to one side, then factor, else complete the square. */
/** a cubic or higher (x³ = 4x): everything on one side, then factor, so it splits into cases.
 *  Null when it doesn't factor into pieces with the letter in them */
function factorAll(e: Eq, v: string): Checked[] | null {
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
  const out: Checked[] = [];
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

function quadratic(e: Eq, v: string): Checked[] | null {
  const h = newHints();
  let zero = simplify(expandAll(add([e.lhs, negate(fresh(e.rhs))]), h), h);
  let P = polyOf(zero);
  if (!P || P.v !== v || P.c.length !== 3) return null;
  let flip = 1;
  if (P.c[2].p < 0) { zero = simplify(expandAll(add([e.rhs, negate(fresh(e.lhs))]), h), h); P = polyOf(zero)!; flip = -1; }
  zero = standardOrder(zero) ?? zero;
  const out: Checked[] = [];
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

/** powers written raised, as in a message: x², eˣ */
const SUP: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', x: 'ˣ', y: 'ʸ', n: 'ⁿ', t: 'ᵗ', a: 'ᵃ', k: 'ᵏ', '−': '⁻' };
export const raised = (t: string) => t.replace(/sqrt\(/g, '√(').replace(/√\(([\w.α-ω])\)/g, '√$1').replace(/\^(−?(?:\d+|[xyntak]))(?![\w(.])/g, (_, p: string) => [...p].map(ch => SUP[ch]).join(''));

/**
 * x² = −4, √x = −1, eˣ = −1: a side that is never negative (or always positive) set equal to
 * a number it can't be. Says so plainly, instead of squaring into a wrong answer or giving up.
 */
export function impossible(e: Eq, v: string): string | null {
  if (relOf(e) !== '=') return null;
  for (const [side, other] of [[e.lhs, e.rhs], [e.rhs, e.lhs]] as const) {
    if (!has(side, v) || symbols(other).length) continue;
    const c = evaluate(other, {});
    if (!Number.isFinite(c)) continue;
    const posBase = side.k === 'pow' && !has(side.base, v) && !symbols(side.base).filter(s => s !== 'e').length && evaluate(side.base, {}) > 0;
    // x², x⁴, and x^(1/2), x^(3/4): an even power or an even root
    const even = side.k === 'pow' && ((side.exp.k === 'num' && Number.isInteger(side.exp.v) && side.exp.v > 0 && side.exp.v % 2 === 0)
      || (side.exp.k === 'frac' && side.exp.den.k === 'num' && side.exp.den.v % 2 === 0 && side.exp.num.k === 'num' && side.exp.num.v > 0));
    const what = posBase ? 'always positive' : even || side.k === 'sqrt' || (side.k === 'fn' && side.name === 'abs') ? 'never negative' : null;
    if (!what || (what === 'never negative' ? c >= 0 : c > 0)) continue;
    return `${raised(toText(side))} is ${what}, so it can't be ${toText(other)}: no real ${v} works.`;
  }
  return null;
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
  const zero = raised(toText(eq(simplify(expandAll(add([cur.lhs, negate(fresh(cur.rhs))]), newHints()), newHints()), num(0))));
  const rs = realRoots(c).map(r => `${v} ≈ ${Number(r.toFixed(3))}`);
  return `${zero} has no nice factors, so there is no exact step to take. ${rs.length ? `It crosses zero at ${rs.join(' and ')} (the graph shows it).` : 'It never crosses zero.'}`;
}

export function isolate(e: Eq, v: string): Checked[] | { error: string } {
  if (!has(e, v)) return { error: `There is no ${v} in this equation.` };
  // |A| = |B| is two cases as it stands: A = B or A = −B
  const bars = (n: Node) => n.k === 'fn' && n.name === 'abs';
  if (relOf(e) === '=' && bars(e.lhs) && bars(e.rhs)) return [];
  const steps: Checked[] = [];
  let cur = e;
  const take = (r: Checked) => { steps.push(r); cur = r.eq; };
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
  // stuck after some steps: keep them, and say why, for whoever plays them
  const stuck = (why: string) => (steps.length ? Object.assign(steps, { stuck: why }) : { error: why });
  tidyUp();
  // a tidy that changes nothing you can see doesn't start the list either
  if (steps.length === 1 && toText(steps[0].eq) === toText(e)) { steps.length = 0; }
  if (!has(cur, v)) return { error: `${v} cancels out completely, so there is nothing to solve for.` };
  // a letter in a bottom: clear every bottom at once (x/2 + 3/x = 2 is × 2x); else just the numbers
  const cl = clearLetterFractions(cur, v);
  if (cl) take(cl);
  else { const cf = clearFractions(cur, v); if (cf) take(cf); }
  // x − 5√x + 6 = 0, e²ˣ − 5eˣ + 6 = 0: a quadratic in √x or eˣ, seen before any squaring
  const pq = powerQuadratic(cur, v);
  if (pq) take(pq);
  const seen = new Set<string>();
  for (let i = 0; i < 24; i++) {
    if (splitCases(cur, v)) return steps; // the caller splits into cases
    if (seen.has(key(cur))) return stuck(`I'm going in circles isolating ${v}. Try a form first (hold Tab).`);
    const no = impossible(cur, v);
    if (no) return stuck(no);
    seen.add(key(cur));
    const hl = has(cur.lhs, v), hr = has(cur.rhs, v);
    if (!hl && !hr) return stuck(`${v} cancelled out.`);
    // one root left with the letter in it: get it alone on its side, so squaring removes it
    const roots: Node[] = [];
    walk(cur, n => { if (n.k === 'sqrt' && has(n, v)) roots.push(n); });
    if (roots.length === 1) {
      const rs = (['lhs', 'rhs'] as const).find(k => cur[k].k === 'add' && findPath(cur[k], roots[0].id));
      const terms = rs ? (cur[rs] as Extract<Node, { k: 'add' }>).terms : [];
      const other = terms.find(t => !findPath(t, roots[0].id));
      if (other && push(moveAcross(cur, other.id))) continue;
      // 2√(x + 2) = −2x − 4: the number in front goes, then the root stands alone
      const ms = (['lhs', 'rhs'] as const).find(k => cur[k].k === 'mul' && findPath(cur[k], roots[0].id));
      const c = ms ? (cur[ms] as Extract<Node, { k: 'mul' }>).factors.find(f => !has(f, v)) : null;
      if (c && push(divideBoth(cur, c.id))) continue;
    }
    const poly = polyOf(expandAll(add([cur.lhs, negate(fresh(cur.rhs))]), newHints()));
    const lone = hl !== hr ? cur[hl ? 'lhs' : 'rhs'] : null;
    const peelable = !!lone && !!inverseOf(lone) && lone.k !== 'frac';
    // a x² + c = 0 with no x term and no nice roots (2x² = 1): isolate x² and take the root instead
    const k = poly && poly.c.length === 3 && poly.c[1].p === 0 ? -(poly.c[0].p / poly.c[0].q) / (poly.c[2].p / poly.c[2].q) : NaN;
    const rootOnly = k > 0 && !(Number.isInteger(Math.sqrt(k)) || Number.isInteger(Math.sqrt(1 / k)) || Number.isInteger(Math.sqrt(k * 4)) || Number.isInteger(Math.sqrt(k * 9)));
    if (poly && poly.v === v && poly.c.length === 3 && !peelable && !rootOnly) {
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
    // log₂ x + log₂(x + 2) = 3 is (ln x + ln(x + 2))/ln 2 term by term: × ln 2 first
    const sameDen = (n: Node) => n.k === 'add' && n.terms.every(t => t.k === 'frac' && !has(t.den, v) && key(t.den) === key((n.terms[0] as Extract<Node, { k: 'frac' }>).den));
    const sd = (['lhs', 'rhs'] as const).find(k => has(cur[k], v) && sameDen(cur[k]));
    const den = sd ? ((cur[sd] as Extract<Node, { k: 'add' }>).terms[0] as Extract<Node, { k: 'frac' }>).den : null;
    if (den && den.k !== 'num' && sd) {
      const tops = (cur[sd] as Extract<Node, { k: 'add' }>).terms.map(t => fresh((t as Extract<Node, { k: 'frac' }>).num));
      const other = sd === 'lhs' ? 'rhs' : 'lhs', times = simplify(mul([fresh(den), fresh(cur[other])]), newHints());
      const next = sd === 'lhs' ? eq(add(tops), times) : eq(times, add(tops));
      const d = den;
      if (push({ eq: next, label: `× ${toText(den)}`, hints: newHints(), factor: env => evaluate(d, env), select: null })) continue;
    }
    // log₉(3 − x) = log₉(4x − 8) is ln(3 − x)/ln 9 = ln(4x − 8)/ln 9: × ln 9 first, then e undoes ln
    if (hl && hr && cur.lhs.k === 'frac' && cur.rhs.k === 'frac' && key(cur.lhs.den) === key(cur.rhs.den) && !has(cur.lhs.den, v) && push(multiplyBoth(cur, cur.lhs.den.id))) continue;
    if (hl && hr) {
      // 2^x = 3^(x − 1): an exponential each side, so ln both sides brings both exponents down
      const expo = (n: Node) => n.k === 'pow' && !has(n.base, v) && has(n.exp, v) || (n.k === 'mul' && n.factors.some(f => f.k === 'pow' && !has(f.base, v) && has(f.exp, v)) && n.factors.every(f => f.k === 'pow' || !has(f, v)));
      if (expo(cur.lhs) && expo(cur.rhs) && !(cur.lhs.k === 'pow' && cur.rhs.k === 'pow' && key(cur.lhs.base) === key(cur.rhs.base))) {
        const lnd = wrapBoth(cur, 'ln');
        if (push(lnd)) {
          // ln(4·2^(x + 2)) is ln 4 + (x + 2) ln 2, so the letter comes down out of every log
          const logsOut = (n: Node) => { for (let i = 0; i < 4; i++) { const r = logRules(n); if (!r) break; n = simplify(r, newHints()); } return n; };
          const h = newHints(), tidyLn = (n: Node) => simplify(expandAll(logsOut(simplify(n, h)), h), h);
          push({ eq: eq(tidyLn(cur.lhs), tidyLn(cur.rhs)), label: 'expand', hints: h, factor: one, select: null });
          continue;
        }
      }
      // undo an outer function first (√(x + 1) = x − 1 → square), else gather the v terms on the left
      const wrapped = (['lhs', 'rhs'] as const).find(k => inverseOf(cur[k]) && cur[k].k !== 'frac');
      if (wrapped && push(peel(cur, cur[wrapped].id))) {
        if (hasExpandable(cur)) push({ eq: eq(expandAll(cur.lhs, newHints()), expandAll(cur.rhs, newHints())), label: 'expand', hints: newHints(), factor: one, select: null });
        continue;
      }
      // x + 1 = 3(x − 1): multiply out a side where the letter sits in brackets, then gather
      const inBrackets = (['rhs', 'lhs'] as const).find(k => { const f = findExpandable(cur[k]); return !!f && has(f, v); });
      if (inBrackets) { const h = newHints(); if (push({ eq: replace(cur, cur[inBrackets].id, expandAll(cur[inBrackets], h)) as Eq, label: 'expand', hints: h, factor: one, select: null })) continue; }
      // gather on the side with more of v, as by hand: x + 1 = 3x takes x across, to 1 = 2x (not −2x = −1)
      const slope = (n: Node) => { const q = polyOf(expandAll(n, newHints())); return q && q.v === v && q.c.length === 2 ? q.c[1].p / q.c[1].q : NaN; };
      const from = slope(cur.lhs) < slope(cur.rhs) ? cur.lhs : cur.rhs;
      const rt = from.k === 'add' ? from.terms : [from];
      const term = rt.find(x => has(x, v))!;
      if (!push(moveAcross(cur, term.id))) return stuck(`Couldn't gather the ${v} terms.`);
      continue;
    }
    const s: 'lhs' | 'rhs' = hl ? 'lhs' : 'rhs';
    const side = cur[s];
    // ln x + ln(x − 2) = ln 3: two logs of the letter make one, ln(x(x − 2)), and then e undoes it
    const logs = combineLogs(side, v);
    if (logs && push({ eq: replace(cur, side.id, logs.n) as Eq, label: logs.label, hints: newHints(), factor: one, select: null, conditions: logs.conditions })) continue;
    // |x − 1| = 0 is one case, not two: only 0 has size 0
    const zero = cur[s === 'lhs' ? 'rhs' : 'lhs'];
    if (side.k === 'fn' && side.name === 'abs' && zero.k === 'num' && zero.v === 0) {
      const A = replace(cur, side.id, side.arg) as Eq, before = cur;
      if (push({ eq: A, label: `|${toText(side.arg)}| = 0 only when ${toText(side.arg)} = 0`, hints: newHints(), factor: one, select: null, check: env => [[evaluate(A, env) ** 2, evaluate(before, env) ** 2]] })) continue;
    }
    if (side.k === 'sym' && side.name === v) {
      if (s === 'rhs') push(swapSides(cur, null));
      // x = √2 + 1 reads 1 + √2: the whole number first, as the root is added to it
      const ans = cur.rhs;
      if (steps.length && ans.k === 'add' && !symbols(ans).length) {
        const i = ans.terms.findIndex(t => (t.k === 'num' || (t.k === 'frac' && t.num.k === 'num' && t.den.k === 'num')));
        if (i > 0) { cur = eq(cur.lhs, { ...ans, terms: [ans.terms[i], ...ans.terms.filter((_, j) => j !== i)] }); steps[steps.length - 1] = { ...steps[steps.length - 1], eq: cur }; }
      }
      return steps.length ? steps : { error: `Already solved for ${v}.` };
    }
    let ok = false;
    const rooted = (t: Node) => { let r = false; walk(t, m => { if (m.k === 'sqrt' && has(m, v)) r = true; }); return r; };
    if (side.k === 'add') {
      const rest = side.terms.filter(x => !has(x, v));
      if (rest.length) ok = push(moveAcross(cur, rest[0].id));
      // √(3x + 7) + √(x + 2) = 1: one root across, so each side can be squared in turn
      else if (side.terms.filter(rooted).length >= 2) ok = push(moveAcross(cur, side.terms.filter(rooted)[1].id));
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
    if (!ok) { const q = powerQuadratic(cur, v); if (q && push(q)) continue; }
    if (!ok) return stuck(`I can't isolate ${v} here yet. Try factoring or another form.`);
  }
  return stuck(`Gave up isolating ${v}.`);
}

/** e²ˣ − eˣ − 6 = 0 is u² − u − 6 with u = eˣ, and x^(2/3) − 5x^(1/3) + 6 with u = x^(1/3):
 *  factor it as that quadratic (or cubic), keeping the power, so it splits into cases */
export function powerQuadratic(e: Eq, v: string): Checked | null {
  if (relOf(e) !== '=') return null;
  const h = newHints();
  const zero = simplify(expandAll(add([fresh(e.lhs), negate(fresh(e.rhs))]), h), h);
  const terms = zero.k === 'add' ? zero.terms : [zero];
  const cands: Node[] = [];
  walk(zero, n => { if ((n.k === 'pow' || n.k === 'sqrt') && has(n, v) && !cands.some(c => key(c) === key(n))) cands.push(n); });
  const xs = [0.37, 0.71, 1.13];
  const ratOf = (x: number) => { for (const d of [1, 2, 3, 4, 6, 8, 12]) if (Math.abs(x * d - Math.round(x * d)) < 1e-9) return { p: Math.round(x * d), q: d }; return null; };
  for (const g of cands) {
    // x² is a plain polynomial's business (factoring does it), not a substitution
    if (g.k === 'pow' && g.base.k === 'sym' && g.exp.k === 'num' && Number.isInteger(g.exp.v)) continue;
    const gv = xs.map(x => evaluate(g, { [v]: x }));
    if (!gv.every(y => Number.isFinite(y) && Math.abs(y - 1) > 1e-6)) continue;
    const c: number[] = [];
    let ok = true;
    for (const t of terms) {
      const tv = xs.map(x => evaluate(t, { [v]: x }));
      const n = [0, 1, 2, 3, 4].find(n => { const r = tv.map((y, i) => y / gv[i] ** n); return r.every(y => Number.isFinite(y) && Math.abs(y - r[0]) < 1e-9 * (1 + Math.abs(r[0]))); });
      if (n === undefined) { ok = false; break; }
      c[n] = (c[n] ?? 0) + tv[0] / gv[0] ** n;
    }
    if (!ok || c.length < 3) continue;
    const coeffs = [...c].map(x => ratOf(x ?? 0));
    if (coeffs.some(r => !r)) continue;
    const P = add(coeffs.map((r, n) => { const k = r!.q === 1 ? num(r!.p) : frac(num(r!.p), num(r!.q)); return n === 0 ? k : mul([k, n === 1 ? sym('u') : pow(sym('u'), num(n))]); }).filter((_, n) => coeffs[n]!.p !== 0));
    const f = factorFully(simplify(P, newHints()), newHints());
    if (!f || f.k !== 'mul') continue;
    const back = (n: Node): Node => (n.k === 'sym' && n.name === 'u' ? fresh(g) : (children(n).length ? withChildren(n, children(n).map(back)) : n));
    const out = eq(back(f), num(0));
    const r = checked(e, { eq: tidy(out)?.eq ?? out, label: `factor as a quadratic in ${toText(g)}`, hints: newHints(), factor: one, select: null });
    if (!isErr(r)) return r;
  }
  return null;
}

/** −S with the sign pushed into each term, keeping a positive term first: −(7y − 20) → 20 − 7y */
function negAll(n: Node): Node {
  if (n.k !== 'add') return negate(n);
  const ts = n.terms.map(negate);
  const i = ts.findIndex(x => !isNeg(x));
  return i > 0 ? { ...n, terms: [ts[i], ...ts.filter((_, j) => j !== i)] } : { ...n, terms: ts };
}

/* ---------- cases: |X| = B and A·B = 0 ---------- */

export interface Cases { first: Checked; rest: Eq[]; why: string }

/** Split an equation into several simpler ones, if it has that shape. */
export function splitCases(e: Eq, v?: string): Cases | null {
  if (e.rel && e.rel !== '=') return null; // |x| < 3 is an "and", not two cases: use the sign chart
  const sides = [['lhs', e.lhs, e.rhs], ['rhs', e.rhs, e.lhs]] as const;
  // |A| = |B|: A = B, or A = −B
  if (e.lhs.k === 'fn' && e.lhs.name === 'abs' && e.rhs.k === 'fn' && e.rhs.name === 'abs') {
    const X = e.lhs.arg, Y = e.rhs.arg;
    const A = eq(X, Y), other = eq(fresh(X), negate(fresh(Y)));
    const c = checked(e, {
      eq: A, label: `|${t(X)}| = |${t(Y)}|: the insides are equal or opposite`, hints: newHints(), factor: one, select: null,
      check: env => [[evaluate(A, env) * evaluate(other, env), evaluate(e.lhs, env) ** 2 - evaluate(e.rhs, env) ** 2]],
    });
    return isErr(c) ? null : { first: c, rest: [other], why: 'two cases' };
  }
  for (const [, S, B] of sides) {
    if (S.k === 'fn' && S.name === 'abs' && (!v || has(S, v)) && !(v && has(B, v))) {
      if (B.k === 'num' && B.v <= 0) return null;
      const X = S.arg;
      const A = eq(X, B);
      const other = eq(fresh(X), negate(fresh(B)));
      const first: MoveOk = {
        eq: A, label: `split |${t(X)}| into two cases`, hints: newHints(), factor: one, select: null,
        conditions: hasSymbols(B) && !isNonneg(B) ? [`${t(B)} ≥ 0`] : [],
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
  if (!P || P.v !== v || P.c.length !== 3) return quadraticLetters(e, v);
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

/** a, b, c as expressions in the other letters: x² + xy − 2y² = 0 has a = 1, b = y, c = −2y². */
function coeffsIn(n: Node, v: string): Node[] | null {
  const s = simplify(expandAll(n, newHints()), newHints());
  const by: Node[][] = [[], [], []];
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
    if (deg > 2) return null;
    by[deg].push(buildTerm(i.coef, rest, t));
  }
  if (!by[2].length) return null;
  return by.map(ts => (ts.length ? simplify(ts.length === 1 ? ts[0] : add(ts), newHints()) : num(0)));
}

/** The formula with letters in a, b, c: the same two cases, each checked like any move. */
function quadraticLetters(e: Eq, v: string): Cases | { error: string } {
  const need = { error: `The quadratic formula needs a${v}² + b${v} + c = 0.` };
  const C = coeffsIn(add([fresh(e.lhs), negate(fresh(e.rhs))]), v);
  if (!C) return need;
  const [c, b, a] = C.map(n => `(${toText(n)})`);
  const D = simplify(parseExpr(`${b}^2 - 4*${a}*${c}`), newHints());
  const others = symbols(D);
  if (others.length) {
    const vals = Array.from({ length: 40 }, (_, i) => evaluate(D, Object.fromEntries(others.map((o, j) => [o, Math.sin(i * 7.3 + j * 1.9) * 5 + 0.37]))));
    if (vals.every(x => Number.isFinite(x) && x < 0)) return { error: `b² − 4ac = ${toText(D)} is never above 0, so a real ${v} needs it to be 0.` };
  }
  const root = (sign: '+' | '-') => eq(sym(v), parseExpr(`(-${b} ${sign} sqrt(${b}^2 - 4*${a}*${c}))/(2*${a})`));
  const E1 = root('+'), E2 = root('-');
  const ev = (q: Eq, env: Env) => evaluate(q.lhs, env) - evaluate(q.rhs, env);
  const first: MoveOk = {
    eq: E1, label: 'quadratic formula: + and − cases', hints: newHints(), factor: one, select: null,
    check: env => [[evaluate(C[2], env) * ev(E1, env) * ev(E2, env), ev(e, env)]],
  };
  const ok = checked(e, first);
  if (isErr(ok)) return ok;
  return { first: ok, rest: [E2], why: 'two cases' };
}


/* ---------- |X| = B → X = B or X = −B (kept for the tests) ---------- */
export function splitAbs(e: Eq): { a: MoveOk; b: Eq } | { error: string } {
  const c = splitCases(e);
  if (!c) return { error: 'Split needs |something| = b, or a product = 0.' };
  return { a: c.first, b: c.rest[0] };
}


/* ---------- every solution of a trig equation ---------- */

/** sin x = 1/2 has more than π/6: from the step that took sin⁻¹ (peeled: L = sin⁻¹ B, L linear
 *  in v) and the answer v = A, every solution as text: x = π/6 + 2kπ or x = 5π/6 + 2kπ */
export function everyTrigSolution(peeled: Eq, answer: Eq, v: string): string | null {
  const [L, R] = peeled.rhs.k === 'fn' && /^a(sin|cos|tan)$/.test(peeled.rhs.name) ? [peeled.lhs, peeled.rhs] : [peeled.rhs, peeled.lhs];
  if (R.k !== 'fn' || !/^a(sin|cos|tan)$/.test(R.name) || solvedFor(answer) !== v) return null;
  const P = polyOf(L);
  if (!P || P.v !== v || P.c.length !== 2) return null;
  const m = P.c[1].p / P.c[1].q;
  const A = answer.lhs.k === 'sym' && answer.lhs.name === v ? answer.rhs : answer.lhs;
  if (symbols(A).some(s => s !== 'π')) return null;
  const name = R.name.slice(1), a = evaluate(A, {});
  const period = (name === 'tan' ? Math.PI : 2 * Math.PI) / Math.abs(m);
  // the second family: L = π − sin⁻¹ B, or L = −cos⁻¹ B, then v = (L − c)/m, multiplied out
  const h = newHints();
  const ratN = (r: Rat): Node => (r.q === 1 ? num(r.p) : frac(num(r.p), num(r.q)));
  const L2 = name === 'sin' ? add([sym('π'), negate(fresh(R))]) : name === 'cos' ? negate(fresh(R)) : null;
  const second = L2 && simplify(expandAll(simplify(frac(add([L2, ratN(rmul(rat(-1), P.c[0]))]), ratN(P.c[1])), h), h), h);
  const same = (x: number, y: number) => { const d = ((x - y) / period) % 1; return Math.abs(d) < 1e-9 || Math.abs(Math.abs(d) - 1) < 1e-9; };
  // kπ, 2kπ, 2kπ/3: the period as a whole number k times it
  const r = period / Math.PI, q = [1, 2, 3, 4, 5, 6, 8, 12].find(d => Math.abs(Math.round(r * d) - r * d) < 1e-9);
  if (!q) return null;
  const p = Math.round(r * q), step = `${p === 1 ? '' : p}kπ${q === 1 ? '' : `/${q}`}`;
  const show = (n: Node) => { const s = toText(n); return s === '0' ? step : `${s} + ${step}`; };
  const fams = [show(A)];
  if (second && !same(evaluate(second, {}), a)) fams.push(show(second));
  return `every solution: ${fams.map(f => `${v} = ${f}`).join(' or ')}, for any whole number k`;
}
