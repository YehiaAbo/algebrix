// Sums and products, the general way: split them, pull constants out, take the first or last term
// out, shift the index, combine two over the same range, write an infinite one as the limit of its
// partial sums, and turn a log of a product into a sum of logs. Then the known sums (facts): Σ 1,
// Σ k, Σ k², Σ k³, geometric, telescoping, Σ xⁿ/n!, Σ 1/n², and ∏ k = n!. Every one is checked by
// value, with the letters in the bounds put to whole numbers.
import { Node, Eq, Sum, num, sym, add, neg, mul, frac, pow, fn, lim, sum, findPath, replace, walk, cloneFresh, evaluate, symbols, key, Env } from './ast';
import { CheckedResult, checked, isErr } from './moves';
import { dependsOn, substitute, derivative } from './calculus';
import { simplify, newHints } from './simplify';
import { toText } from './print';
import { geometric, pSeries } from './integrate';
import { telescopeOf, spreadOf } from './series';

const one = () => 1;
const fresh = <T extends Node>(n: T): T => cloneFresh(n);
const tidy = (n: Node) => simplify(n, newHints());
const isInf = (n: Node) => n.k === 'sym' && n.name === '∞';
const isNum = (n: Node, v?: number) => n.k === 'num' && (v === undefined || n.v === v);
/** the term at k = at */
const termAt = (S: Sum, at: Node) => tidy(substitute(fresh(S.arg), S.v, at));
/** how many terms: hi − lo + 1 */
const count = (S: Sum) => tidy(add([fresh(S.hi), neg(fresh(S.lo)), num(1)]));
const plus1 = (n: Node, d: number) => tidy(add([fresh(n), num(d)]));
const sumLike = (S: Sum, lo: Node, hi: Node, arg: Node): Sum => sum(S.v, lo, hi, arg, undefined, !!S.prod);

export interface SumForm { name: string; node: Node; conditions?: string[] }

/** the general rewrites of a Σ or ∏ (or of a sum of Σs over one range: combined) */
export function sumForms(n: Node): SumForm[] {
  const out: SumForm[] = [];
  if (n.k === 'add') {
    // Σa + Σb over the same range: one Σ(a + b)
    const ss = n.terms.filter(t => t.k === 'sum' && !t.prod) as Sum[];
    const same = ss.filter(s => s.v === ss[0]?.v && key(s.lo) === key(ss[0].lo) && key(s.hi) === key(ss[0].hi));
    if (same.length >= 2) {
      const rest = n.terms.filter(t => !same.includes(t as Sum));
      const one = sum(same[0].v, fresh(same[0].lo), fresh(same[0].hi), add(same.map(s => fresh(s.arg))));
      out.push({ name: 'one sum', node: rest.length ? add([one, ...rest.map(fresh)]) : one });
    }
    return out;
  }
  if (n.k === 'fn' && n.name === 'ln' && n.arg.k === 'sum' && n.arg.prod) {
    const P = n.arg;
    out.push({ name: 'a sum of logs', node: sum(P.v, fresh(P.lo), fresh(P.hi), fn('ln', fresh(P.arg))), conditions: [`every factor > 0`] });
    return out;
  }
  if (n.k !== 'sum') return out;
  const S = n, v = S.v, a = S.arg;
  // split: Σ(a + b) = Σa + Σb; ∏(ab) = ∏a·∏b
  if (!S.prod && a.k === 'add') out.push({ name: 'split the sum', node: add(a.terms.map(t => sum(v, fresh(S.lo), fresh(S.hi), fresh(t)))) });
  if (S.prod && a.k === 'mul') out.push({ name: 'split the product', node: mul(a.factors.map(f => sum(v, fresh(S.lo), fresh(S.hi), fresh(f), undefined, true))) });
  // constants out: Σ c·a = c Σ a; ∏ c·a = c^(number of terms) ∏ a
  const parts = a.k === 'mul' ? a.factors : a.k === 'neg' ? [num(-1), a.arg] : a.k === 'frac' && !dependsOn(a.den, v) ? [frac(num(1), a.den), a.num] : [];
  const cs = parts.filter(f => !dependsOn(f, v)), vs = parts.filter(f => dependsOn(f, v));
  if (cs.length && vs.length) {
    const c = tidy(cs.length === 1 ? fresh(cs[0]) : mul(cs.map(fresh)));
    const inner = sumLike(S, fresh(S.lo), fresh(S.hi), vs.length === 1 ? fresh(vs[0]) : mul(vs.map(fresh)));
    if (!S.prod) out.push({ name: 'constant out', node: mul([c, inner]) });
    else if (!isInf(S.hi)) out.push({ name: 'constant out', node: mul([pow(c, count(S)), inner]) });
  }
  // the first and last terms out
  if (!isInf(S.lo)) {
    const first = termAt(S, S.lo), rest = sumLike(S, plus1(S.lo, 1), fresh(S.hi), fresh(a));
    out.push({ name: S.prod ? 'first factor out' : 'first term out', node: S.prod ? mul([first, rest]) : add([first, rest]) });
  }
  if (!isInf(S.hi)) {
    const last = termAt(S, S.hi), rest = sumLike(S, fresh(S.lo), plus1(S.hi, -1), fresh(a));
    out.push({ name: S.prod ? 'last factor out' : 'last term out', node: S.prod ? mul([rest, last]) : add([rest, last]) });
  }
  // shift the index: Σ_{k=a}^{b} f(k) = Σ_{k=a−1}^{b−1} f(k + 1), and the other way
  for (const d of [1, -1]) {
    const lo = plus1(S.lo, -d), hi = isInf(S.hi) ? fresh(S.hi) : plus1(S.hi, -d);
    out.push({ name: `shift: ${v} → ${v} ${d > 0 ? '+' : '−'} 1`, node: sumLike(S, lo, hi, tidy(substitute(fresh(a), v, add([sym(v), num(d)])))) });
  }
  // an infinite one is the limit of its partial sums
  if (isInf(S.hi)) {
    const used = new Set(symbols(S.arg).concat(v));
    const N = ['N', 'M', 'K'].find(c => !used.has(c)) ?? 'N';
    out.push({ name: 'as a limit of partial sums', node: lim(N, sym('∞'), sumLike(S, fresh(S.lo), sym(N), fresh(a))) });
  }
  // a sum of logs is the log of a product
  if (!S.prod && a.k === 'fn' && a.name === 'ln') out.push({ name: 'one log of a product', node: fn('ln', sum(v, fresh(S.lo), fresh(S.hi), fresh(a.arg), undefined, true)) });
  return out;
}

/* ---------- known sums (facts) ---------- */

function target(e: Eq, sel: string | null): Sum | null {
  const path = sel && sel !== 'eq' ? findPath(e, sel) : null;
  let S = path ? ([...path].reverse().find(n => n.k === 'sum') as Sum | undefined) : undefined;
  if (!S) walk(e, n => { if (!S && n.k === 'sum') S = n; });
  return S ?? null;
}

/** k^p with p = 1, 2, 3, else null */
function powerOfIndex(a: Node, v: string): number | null {
  if (a.k === 'sym' && a.name === v) return 1;
  if (a.k === 'pow' && a.base.k === 'sym' && a.base.name === v && a.exp.k === 'num' && [2, 3].includes(a.exp.v)) return a.exp.v;
  return null;
}

/** C + k on a Σ or ∏: the known value, when one fits */
export function knownSum(e: Eq, sel: string | null): CheckedResult {
  const S = target(e, sel);
  if (!S) return { error: 'No sum here.' };
  const v = S.v, a = S.arg;
  const done = (node: Node, label: string, conditions: string[] = []) => checked(e, { eq: replace(e, S.id, node), label, hints: newHints(), factor: one, select: null, rule: 'known sum', conditions });
  // telescoping, any step d: Σ (g(k) − g(k + d)) leaves d terms at each end; ∏ g(k + d)/g(k) too
  const tel = telescopeOf(S);
  if (tel) {
    const G = (k: Node) => tidy(substitute(fresh(tel.g), v, k));
    const firsts = Array.from({ length: tel.d }, (_, j) => G(plus1(S.lo, j)));
    const lasts = isInf(S.hi) ? Array.from({ length: tel.d }, () => lim(v, sym('∞'), fresh(tel.g))) : Array.from({ length: tel.d }, (_, j) => G(plus1(S.hi, j + 1)));
    const one_ = (xs: Node[]) => (xs.length === 1 ? xs[0] : mul(xs));
    if (!S.prod) return done(add([...firsts, ...lasts.map(x => tidy(neg(x)))]), tel.d === 1 ? 'telescoping: the middle terms cancel' : `telescoping in steps of ${tel.d}: ${tel.d} terms stay at each end`);
    const [t, b] = tel.flip ? [firsts, lasts] : [lasts, firsts];
    const bot = one_(b);
    return done(bot.k === 'num' && bot.v === 1 ? one_(t) : frac(one_(t), bot), 'telescoping product: the middle factors cancel');
  }
  // spread over more pieces: c₁g(k + s₁) + c₂g(k + s₂) + … with the cs adding to 0 (in a ∏, factors
  // g(k + s) to powers adding to 0); each shifted copy of g has the same middle, so only a few g's at
  // each end stay
  const sp = spreadOf(S);
  if (sp) {
    const ups: Node[] = [], downs: Node[] = [];
    // in a ∏ the same factor's powers add up (n on top, n² underneath leaves n underneath); 1s go
    const pows = new Map<string, [Node, number]>();
    const put = (c: number, x: Node) => {
      if (!S.prod) { ups.push(tidy(c === 1 ? x : c === -1 ? neg(x) : mul([num(c), x]))); return; }
      if (x.k === 'num' && x.v === 1) return;
      const k = key(x), was = pows.get(k);
      pows.set(k, [was?.[0] ?? x, (was?.[1] ?? 0) + c]);
    };
    for (const { g, cs } of sp) {
      const m = Math.min(...cs.map(([, s]) => s));
      const G = (k: Node) => tidy(substitute(fresh(g), v, k));
      for (const [c, s] of cs) {
        for (let j = m; j < s; j++) put(-c, G(plus1(S.lo, j)));
        if (!isInf(S.hi)) for (let j = m + 1; j <= s; j++) put(c, G(plus1(S.hi, j)));
      }
      const atInf = cs.reduce((t, [c, s]) => t + c * (s - m), 0);
      if (isInf(S.hi) && atInf) put(atInf, lim(v, sym('∞'), fresh(g)));
    }
    for (const [x, c] of pows.values()) if (c) (c > 0 ? ups : downs).push(Math.abs(c) === 1 ? x : pow(x, num(Math.abs(c))));
    const one_ = (xs: Node[]) => (!xs.length ? num(1) : xs.length === 1 ? xs[0] : mul(xs));
    if (!S.prod) return done(ups.length ? add(ups) : num(0), 'telescoping: the shifted copies cancel in the middle');
    return done(downs.length ? frac(one_(ups), one_(downs)) : one_(ups), 'telescoping product: the shifted copies cancel in the middle');
  }
  if (S.prod) {
    if (!dependsOn(a, v) && !isInf(S.hi)) return done(tidy(pow(fresh(a), count(S))), `∏ c = c^(number of factors)`);
    if (a.k === 'sym' && a.name === v && isNum(S.lo, 1) && !isInf(S.hi)) return done(fn('fact', fresh(S.hi)), `∏ ${v} = n!`);
    return { error: 'No known product fits. Split it, take a factor out, or write it out (x).' };
  }
  if (!dependsOn(a, v) && !isInf(S.hi)) return done(tidy(mul([fresh(a), count(S)])), `Σ c = c·(number of terms)`);
  const p = powerOfIndex(a, v);
  if (p && (isNum(S.lo, 1) || isNum(S.lo, 0)) && !isInf(S.hi)) {
    const n = () => fresh(S.hi), n1 = () => add([fresh(S.hi), num(1)]);
    const formula = p === 1 ? frac(mul([n(), n1()]), num(2))
      : p === 2 ? frac(mul([n(), n1(), add([mul([num(2), n()]), num(1)])]), num(6))
      : frac(mul([pow(n(), num(2)), pow(n1(), num(2))]), num(4));
    return done(formula, p === 1 ? `Σ ${v} = n(n + 1)/2` : p === 2 ? `Σ ${v}² = n(n + 1)(2n + 1)/6` : `Σ ${v}³ = n²(n + 1)²/4`);
  }
  // xⁿ/n! from 0 to ∞ is eˣ
  if (isInf(S.hi) && isNum(S.lo, 0) && a.k === 'frac' && a.den.k === 'fn' && a.den.name === 'fact' && a.den.arg.k === 'sym' && a.den.arg.name === v) {
    const top = a.num;
    if (top.k === 'pow' && top.exp.k === 'sym' && top.exp.name === v && !dependsOn(top.base, v)) return done(pow(sym('e'), fresh(top.base)), `Σ xⁿ/n! = eˣ`);
    if (isNum(top, 1)) return done(sym('e'), `Σ 1/n! = e`);
  }
  // geometric: a ratio that doesn't change, finite or to ∞
  const r = ratioOf(S);
  if (r) {
    const first = termAt(S, S.lo);
    if (isInf(S.hi)) return geometric(e, S.id);
    return done(frac(mul([first, add([num(1), neg(pow(fresh(r), count(S)))])]), add([num(1), neg(fresh(r))])), `geometric: first·(1 − rⁿ)/(1 − r), r = ${toText(r)}`, symbols(r).length ? [`${toText(r)} ≠ 1`] : []);
  }
  const q = isInf(S.hi) ? pSeries(e, S.id) : null;
  if (q && !isErr(q)) return q;
  return { error: 'No known sum fits. Split it (Tab), take terms out, shift it, or see if it telescopes after partial fractions.' };
}

/** the ratio between terms when it is the same every time */
function ratioOf(S: Sum): Node | null {
  const env: Env = {};
  symbols(S.arg).filter(w => w !== S.v).forEach((w, i) => (env[w] = 0.31 + 0.17 * i));
  const at = (k: number) => evaluate(S.arg, { ...env, [S.v]: k });
  const r0 = at(3) / at(2);
  if (!Number.isFinite(r0) || r0 === 1 || ![4, 6, 9].every(k => Math.abs(at(k + 1) / at(k) - r0) <= 1e-9 * (1 + Math.abs(r0)))) return null;
  const R = tidy(frac(substitute(fresh(S.arg), S.v, add([sym(S.v), num(1)])), fresh(S.arg)));
  if (!dependsOn(R, S.v)) return R;
  // c·bᵐ with m stepping by d each term: the ratio is b^d (simplify keeps 2^(k + 1)/2^k as it is)
  const fs = S.arg.k === 'mul' ? S.arg.factors : S.arg.k === 'frac' && !dependsOn(S.arg.den, S.v) ? [S.arg.num] : [S.arg];
  const steps: Node[] = [];
  for (const f of fs) {
    if (!dependsOn(f, S.v)) continue;
    if (f.k !== 'pow' || dependsOn(f.base, S.v)) return null;
    const d = derivative(f.exp, S.v);
    if (!d || dependsOn(d, S.v)) return null;
    steps.push(pow(fresh(f.base), d));
  }
  return steps.length ? tidy(steps.length === 1 ? steps[0] : mul(steps)) : null;
}

