// The calculus kernel: what a derivative or a limit is worth, so the safety net can check
// calculus steps the same way it checks algebra. The derivative here is plain rule-based
// differentiation, kept apart from the step-by-step rules in calcmoves.ts (and fuzzed against
// finite differences in the tests), so a slip in one is caught by the other. Limits are
// estimated numerically, and give NaN (can't check) when the estimate isn't clean.
import { Node, Deriv, Lim, Int, Sum, Env, num, sym, add, mul, neg, frac, pow, fn, sqrt, call, sum, vec, evaluate, CALC, DEFS, primed, children, withChildren, cloneFresh } from './ast';

/** does n change with v (directly, or through a variable that depends on v)? */
export function dependsOn(n: Node, v: string, dep: string[] = []): boolean {
  if (n.k === 'sym') return n.name === v || dep.includes(n.name);
  if (n.k === 'lim' && n.v === v) return dependsOn(n.to, v, dep);
  if (n.k === 'int' && !(n.lo && n.hi) && n.v === v) return true;
  if (((n.k === 'int' && n.lo) || n.k === 'at' || n.k === 'sum') && n.v === v) return children(n).some(c => c !== n.arg && dependsOn(c, v, dep));
  return children(n).some(c => dependsOn(c, v, dep));
}

const ONE = () => num(1);
const ln = (a: Node) => fn('ln', a);

/** d/dv n, as a plain tree (not pretty: it is only ever evaluated). Null where there's no rule. */
export function derivative(n: Node, v: string, dep: string[] = []): Node | null {
  if (!dependsOn(n, v, dep)) return num(0);
  const d = (m: Node) => derivative(m, v, dep);
  switch (n.k) {
    case 'sym': return n.name === v ? ONE() : sym(primed(n.name));
    case 'neg': { const a = d(n.arg); return a && neg(a); }
    case 'add': { const ts = n.terms.map(d); return ts.every(Boolean) ? add(ts as Node[]) : null; }
    case 'mul': {
      const parts: Node[] = [];
      for (let i = 0; i < n.factors.length; i++) {
        if (!dependsOn(n.factors[i], v, dep)) continue;
        const di = d(n.factors[i]);
        if (!di) return null;
        parts.push(mul(n.factors.map((f, j) => (j === i ? di : f))));
      }
      return add(parts);
    }
    case 'frac': {
      const a = d(n.num), b = d(n.den);
      if (!a || !b) return null;
      return frac(add([mul([a, n.den]), neg(mul([n.num, b]))]), pow(n.den, num(2)));
    }
    case 'pow': {
      const { base, exp } = n;
      if (!dependsOn(exp, v, dep)) { const b = d(base); return b && mul([exp, pow(base, add([exp, num(-1)])), b]); }
      // u^w = e^(w ln u): (u^w)′ = u^w (w′ ln u + w u′/u)
      const w = d(exp), b = d(base);
      if (!w || !b) return null;
      if (!dependsOn(base, v, dep)) return mul([n, ln(base), w]);
      return mul([n, add([mul([w, ln(base)]), frac(mul([exp, b]), base)])]);
    }
    case 'sqrt': { const a = d(n.arg); return a && frac(a, mul([num(2), sqrt(n.arg)])); }
    case 'fn': {
      const a = d(n.arg), u = n.arg;
      if (!a) return null;
      const outer: Record<string, Node> = {
        sin: fn('cos', u), cos: neg(fn('sin', u)), tan: frac(ONE(), pow(fn('cos', u), num(2))),
        asin: frac(ONE(), sqrt(add([ONE(), neg(pow(u, num(2)))]))), acos: neg(frac(ONE(), sqrt(add([ONE(), neg(pow(u, num(2)))])))),
        atan: frac(ONE(), add([ONE(), pow(u, num(2))])), ln: frac(ONE(), u), log: frac(ONE(), mul([u, ln(num(10))])),
        abs: frac(u, fn('abs', u)),
      };
      if (!outer[n.name]) return null;
      return mul([outer[n.name], a]);
    }
    case 'call': {
      const a = d(n.arg);
      return a && mul([call(primed(n.name), n.arg), a]);
    }
    case 'deriv': {
      // the inner derivative first, then this one (same dependents)
      const inner = derivative(n.arg, n.v, n.dep);
      return inner && d(inner);
    }
    case 'int': {
      // indefinite: the integrand back (that is what an antiderivative is)
      if (!n.lo || !n.hi) return n.v === v && !dep.length ? n.arg : null;
      // definite, the bounds moving (the fundamental theorem): f(hi)·hi′ − f(lo)·lo′
      if (dependsOn(n.arg, v, dep) && n.v !== v) return null;
      const lo = d(n.lo), hi = d(n.hi);
      if (!lo || !hi) return null;
      return add([mul([substitute(n.arg, n.v, n.hi), hi]), neg(mul([substitute(n.arg, n.v, n.lo), lo]))]);
    }
    case 'at': {
      const whole = add([substitute(n.arg, n.v, n.hi), neg(substitute(n.arg, n.v, n.lo))]);
      return d(whole);
    }
    case 'sum': {
      // term by term
      if (dependsOn(n.lo, v, dep) || dependsOn(n.hi, v, dep)) return null;
      const a = d(n.arg);
      return a && sum(n.v, n.lo, n.hi, a);
    }
    case 'vec': { const ds = n.items.map(d); return ds.every(Boolean) ? vec(ds as Node[]) : null; }
    case 'num': case 'lim': case 'grad': case 'eq': return null;
  }
}

/** n with every free v replaced by a copy of what */
export function substitute(n: Node, v: string, what: Node): Node {
  if (n.k === 'sym') return n.name === v ? cloneFresh(what) : n;
  if ((n.k === 'lim' || (n.k === 'int' && n.lo) || n.k === 'at' || n.k === 'sum') && n.v === v) {
    return withChildren(n, children(n).map(c => (c === n.arg ? c : substitute(c, v, what))));
  }
  const ks = children(n);
  return ks.length ? withChildren(n, ks.map(c => substitute(c, v, what))) : n;
}

/** f′ for a defined f (and f″ for f′): its body, differentiated */
function primeDef(name: string): { param: string; body: Node } | undefined {
  if (!name.endsWith('′')) return undefined;
  const base = name.slice(0, -1);
  const f = DEFS.get(base) ?? primeDef(base);
  if (!f) return undefined;
  const body = derivative(f.body, f.param);
  return body ? { param: f.param, body } : undefined;
}

const derived = new WeakMap<Deriv, Node | null>();
function derive(n: Deriv): Node | null {
  if (!derived.has(n)) derived.set(n, derivative(n.arg, n.v, n.dep));
  return derived.get(n)!;
}

/** Ridders' extrapolation of g(h) as h → 0+, with its error estimate */
function extrapolate(g: (h: number) => number, h0: number): { value: number; err: number } {
  const CON = 1.6, N = 14;
  let best = { value: NaN, err: Infinity };
  let prev: number[] = [];
  let h = h0;
  for (let i = 0; i < N; i++, h /= CON) {
    const row = [g(h)];
    let fac = CON;
    for (let j = 1; j <= i; j++) {
      row[j] = (row[j - 1] * fac - prev[j - 1]) / (fac - 1);
      fac *= CON;
      const err = Math.max(Math.abs(row[j] - row[j - 1]), Math.abs(row[j] - prev[j - 1]));
      if (err <= best.err) best = { value: row[j], err };
    }
    if (i > 0 && Math.abs(row[i] - prev[i - 1]) >= 2 * best.err && i > 4) break;
    prev = row;
  }
  return best;
}

/** one side of a limit: a number, ±Infinity when it clearly blows up, NaN when it isn't clear */
function oneSide(f: (x: number) => number, a: number, s: 1 | -1): number {
  const at = Number.isFinite(a) ? (h: number) => f(a + s * h * (1 + Math.abs(a))) : (h: number) => f(Math.sign(a) / h);
  // blowing up: big, one sign, and growing as h shrinks
  const big = [1e-4, 1e-6, 1e-8].map(at);
  if (big.every(Number.isFinite) && Math.abs(big[2]) > 1e6 && Math.abs(big[2]) > 10 * Math.abs(big[1]) && Math.abs(big[1]) > 10 * Math.abs(big[0]) * 0.9 && Math.sign(big[0]) === Math.sign(big[2])) return Math.sign(big[2]) * Infinity;
  const r = extrapolate(at, Number.isFinite(a) ? 0.05 : 0.02);
  if (!Number.isFinite(r.value)) return NaN;
  return r.err <= 1e-8 * (1 + Math.abs(r.value)) ? r.value : NaN;
}

function limit(n: Lim, env: Env): number {
  const a = evaluate(n.to, env);
  if (Number.isNaN(a)) return NaN;
  const f = (x: number) => evaluate(n.arg, { ...env, [n.v]: x });
  if (!Number.isFinite(a)) return oneSide(f, a, a > 0 ? -1 : 1);
  if (n.side) return oneSide(f, a, n.side === '+' ? 1 : -1);
  const l = oneSide(f, a, -1), r = oneSide(f, a, 1);
  if (l === r) return l;
  return Math.abs(l - r) <= 1e-7 * (1 + Math.abs(l)) ? (l + r) / 2 : NaN;
}

/* ---------- integrals: double-exponential quadrature ---------- */

/** ∫ f from a to b (either may be infinite): tanh-sinh, exp-sinh or sinh-sinh, halving the step
 *  until two levels agree. NaN when they don't, so a step on it can't be checked. */
export function quad(f: (x: number) => number, a: number, b: number): number {
  if (a === b) return 0;
  if (a > b) return -quad(f, b, a);
  let map: (t: number) => [number, number];
  if (Number.isFinite(a) && Number.isFinite(b)) {
    const c = (a + b) / 2, d = (b - a) / 2;
    map = t => { const s = (Math.PI / 2) * Math.sinh(t), ch = Math.cosh(s); return [c + d * Math.tanh(s), (d * (Math.PI / 2) * Math.cosh(t)) / (ch * ch)]; };
  } else if (Number.isFinite(a)) {
    map = t => { const e = Math.exp((Math.PI / 2) * Math.sinh(t)); return [a + e, (Math.PI / 2) * Math.cosh(t) * e]; };
  } else if (Number.isFinite(b)) {
    map = t => { const e = Math.exp((Math.PI / 2) * Math.sinh(t)); return [b - e, (Math.PI / 2) * Math.cosh(t) * e]; };
  } else {
    map = t => { const s = (Math.PI / 2) * Math.sinh(t); return [Math.sinh(s), (Math.PI / 2) * Math.cosh(t) * Math.cosh(s)]; };
  }
  const T = Number.isFinite(a) && Number.isFinite(b) ? 3.2 : 4.5;
  const term = (t: number) => {
    const [x, w] = map(t);
    if (!Number.isFinite(w) || w === 0 || x === a || x === b) return 0;
    const y = f(x);
    if (Number.isFinite(y)) return y * w;
    return Math.abs(w) < 1e-200 ? 0 : NaN;
  };
  let h = 0.5, total = term(0);
  for (let k = 1; k * h <= T; k++) total += term(k * h) + term(-k * h);
  let prev = total * h;
  for (let level = 0; level < 7; level++) {
    h /= 2;
    for (let k = 1; k * h <= T; k += 2) total += term(k * h) + term(-k * h);
    const est = total * h;
    if (Number.isNaN(est)) return NaN;
    if (Math.abs(est - prev) <= 1e-10 * (1 + Math.abs(est)) && level >= 1) return est;
    prev = est;
  }
  return NaN;
}

function integral(n: Int, env: Env): number {
  const a = evaluate(n.lo!, env), b = evaluate(n.hi!, env);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return quad(x => evaluate(n.arg, { ...env, [n.v]: x }), a, b);
}

/* ---------- series ---------- */

/** Σ a(n): exact when finite; infinite ones while the terms shrink fast enough to trust
 *  (geometric-like), or with the Euler-Maclaurin tail when they are smooth and one-signed,
 *  or by repeated averaging when they alternate. NaN otherwise. */
function series(n: Sum, env: Env): number {
  const lo = evaluate(n.lo, env), hi = evaluate(n.hi, env);
  if (!Number.isInteger(lo) || !(Number.isInteger(hi) || hi === Infinity)) return NaN;
  const a = (k: number) => evaluate(n.arg, { ...env, [n.v]: k });
  if (hi !== Infinity) {
    if (hi - lo > 1e6) return NaN;
    let s = 0;
    for (let k = lo; k <= hi; k++) s += a(k);
    return s;
  }
  let s = 0, small = 0;
  const N = 400;
  const terms: number[] = [];
  for (let k = lo; k < lo + N; k++) {
    const t = a(k);
    if (!Number.isFinite(t)) return NaN;
    terms.push(t);
    s += t;
    small = Math.abs(t) <= 1e-17 * (1 + Math.abs(s)) ? small + 1 : 0;
    if (small >= 5) return s;
  }
  const last = terms.slice(-40);
  const alternating = last.every((t, i) => i === 0 || Math.sign(t) === -Math.sign(last[i - 1]));
  if (alternating) {
    // average neighbouring partial sums again and again (Euler's transform)
    let ps: number[] = [];
    let acc = s;
    for (let k = lo + N; k < lo + N + 24; k++) { acc += a(k); ps.push(acc); }
    while (ps.length > 1) ps = ps.slice(1).map((p, i) => (p + ps[i]) / 2);
    const tailTerm = Math.abs(a(lo + N + 24));
    return tailTerm < 0.01 ? ps[0] : NaN;
  }
  if (!last.every(t => Math.sign(t) === Math.sign(last[0]))) return NaN;
  // smooth and one-signed: s + ∫ from M to ∞ − a(M)/2 + a′(M)/12 (Euler-Maclaurin), at two M's
  const em = (M: number) => {
    let sm = 0;
    for (let k = lo; k < M; k++) sm += a(k);
    const h = 1e-3 * M;
    const da = (a(M + h) - a(M - h)) / (2 * h);
    return sm + quad(a, M, Infinity) + a(M) / 2 - da / 12;
  };
  const e1 = em(lo + 200), e2 = em(lo + 400);
  return Math.abs(e1 - e2) <= 1e-8 * (1 + Math.abs(e2)) ? e2 : NaN;
}

/** Γ(x) by Lanczos, for n! of a non-integer */
function gamma(x: number): number {
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  x -= 1;
  let s = c[0];
  for (let i = 1; i < g + 2; i++) s += c[i] / (x + i);
  const t = x + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * s;
}

CALC.integral = integral;
CALC.series = series;
CALC.gamma = gamma;
CALC.derive = derive;
CALC.partialOf = (n, v) => derivative(n, v);
CALC.limit = limit;
CALC.primeDef = primeDef;
