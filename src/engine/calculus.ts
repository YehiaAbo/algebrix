// The calculus kernel: what a derivative or a limit is worth, so the safety net can check
// calculus steps the same way it checks algebra. The derivative here is plain rule-based
// differentiation, kept apart from the step-by-step rules in calcmoves.ts (and fuzzed against
// finite differences in the tests), so a slip in one is caught by the other. Limits are
// estimated numerically, and give NaN (can't check) when the estimate isn't clean.
import { Node, Deriv, Lim, Env, num, sym, add, mul, neg, frac, pow, fn, sqrt, call, evaluate, CALC, DEFS, primed, children } from './ast';

/** does n change with v (directly, or through a variable that depends on v)? */
export function dependsOn(n: Node, v: string, dep: string[] = []): boolean {
  if (n.k === 'sym') return n.name === v || dep.includes(n.name);
  if (n.k === 'lim' && n.v === v) return dependsOn(n.to, v, dep);
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
    case 'num': case 'lim': case 'eq': return null;
  }
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

CALC.derive = derive;
CALC.limit = limit;
CALC.primeDef = primeDef;
