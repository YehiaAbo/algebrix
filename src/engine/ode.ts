// Differential equations, a method at a time: separable (dy and dx apart, then integrate both
// sides), linear first order (the integrating factor), and constant-coefficient second order
// (the characteristic equation). Steps are checked like any other: y and y′ are letters of their
// own, and a one-way step is checked by differentiating back. A general solution is checked by
// putting it into the equation.
import { Node, Eq, num, sym, add, mul, neg, frac, pow, sqrt, fn, int, deriv, eq, evaluate, symbols, relOf, Env, primed, cloneFresh, children, withChildren, key, walk } from './ast';
import { derivative, dependsOn, substitute } from './calculus';
import { checked, MoveOk, MoveResult, isErr } from './moves';
import { simplify, newHints } from './simplify';
import { finishCalc, times, plus } from './calcmoves';
import { ratNode } from './integrate';
import { toText } from './print';

const one = () => 1;
const simp = (n: Node) => simplify(n, newHints());
/** simplified, with powers of the same thing gathered: e^(2x)e^x = e^(3x), x³/x = x² */
const S = (n: Node) => simp(gather(simp(n)));

/** gather powers of one base in each product or fraction (inside first) */
function gather(n: Node): Node {
  const ks = children(n);
  if (ks.length) n = withChildren(n, ks.map(gather));
  if (n.k !== 'mul' && n.k !== 'frac') return n;
  let p = 1, q = 1;
  const exps = new Map<string, { base: Node; e: number }>(), eExp: Node[] = [], top: Node[] = [], bottom: Node[] = [];
  const numOf = (m: Node): number | null => (m.k === 'num' ? m.v : m.k === 'neg' ? (numOf(m.arg) === null ? null : -numOf(m.arg)!) : m.k === 'frac' && m.num.k === 'num' && m.den.k === 'num' ? m.num.v / m.den.v : null);
  const add1 = (base: Node, e: number) => { const k = key(base); const o = exps.get(k); if (o) o.e += e; else exps.set(k, { base, e }); };
  const take = (m: Node, up: boolean) => {
    if (m.k === 'mul') return m.factors.forEach(f => take(f, up));
    if (m.k === 'frac') { take(m.num, up); take(m.den, !up); return; }
    if (m.k === 'neg') { p = -p; return take(m.arg, up); }
    if (m.k === 'num') { if (up) p *= m.v; else q *= m.v; return; }
    if (m.k === 'pow' && m.base.k === 'sym' && m.base.name === 'e') { eExp.push(up ? m.exp : neg(m.exp)); return; }
    if (m.k === 'pow' && numOf(m.exp) !== null) return add1(m.base, (up ? 1 : -1) * numOf(m.exp)!);
    if (m.k === 'sym') return add1(m, up ? 1 : -1);
    (up ? top : bottom).push(m);
  };
  take(n, true);
  for (const { base, e } of exps.values()) {
    if (Math.abs(e) < 1e-12) continue;
    const a = Math.abs(e);
    (e > 0 ? top : bottom).push(a === 1 ? base : pow(base, ratNode(a) ?? num(a)));
  }
  if (eExp.length) { const x = simp(plus(...eExp)); if (!(x.k === 'num' && x.v === 0)) top.push(pow(sym('e'), x)); }
  const T = times(num(p), ...top), B = times(num(q), ...bottom);
  return B.k === 'num' && B.v === 1 ? T : frac(T, B);
}

/** the unknown function's letter: the one that has a prime */
function unknown(e: Eq): { y: string; x: string; order: number } | null {
  const vs = symbols(e);
  const second = vs.find(v => v.endsWith('″'));
  const first = vs.find(v => v.endsWith('′') && !v.endsWith('′′'));
  const y = second ? second.slice(0, -1) : first ? first.slice(0, -1) : null;
  if (!y) return null;
  const x = vs.find(v => v !== y && !/[′″]$/.test(v) && !/^C(_\d)?$/.test(v)) ?? 'x';
  return { y, x, order: second ? 2 : 1 };
}

const env0 = (vs: string[], i: number): Env => Object.fromEntries(vs.map((v, j) => [v, 0.37 + 0.61 * j + 0.29 * i]));

/** y′ = R, written either way round */
export function slopeForm(e: Eq, y: string): Node | null {
  const yp = primed(y);
  if (relOf(e) !== '=') return null;
  if (e.lhs.k === 'sym' && e.lhs.name === yp && !symbols(e.rhs).includes(yp)) return e.rhs;
  if (e.rhs.k === 'sym' && e.rhs.name === yp && !symbols(e.lhs).includes(yp)) return e.lhs;
  return null;
}

/** R = g(x)·h(y), or nothing */
export function splitXY(R: Node, x: string, y: string): { g: Node; h: Node } | null {
  const top: Node[] = [], bottom: Node[] = [];
  const take = (n: Node, up: boolean) => {
    if (n.k === 'mul') return n.factors.forEach(f => take(f, up));
    if (n.k === 'frac') { take(n.num, up); take(n.den, !up); return; }
    if (n.k === 'neg') { (up ? top : bottom).push(num(-1)); take(n.arg, up); return; }
    (up ? top : bottom).push(n);
  };
  take(R, true);
  const gx: Node[] = [], gxd: Node[] = [], hy: Node[] = [], hyd: Node[] = [];
  for (const [list, up] of [[top, true], [bottom, false]] as const) {
    for (const f of list) {
      const dx = dependsOn(f, x), dy = dependsOn(f, y);
      if (dx && dy) return null;
      if (dy) (up ? hy : hyd).push(f); else (up ? gx : gxd).push(f);
    }
  }
  const part = (t: Node[], b: Node[]) => { const T = t.length ? times(...t) : num(1); return b.length ? frac(T, times(...b)) : T; };
  return { g: part(gx, gxd), h: part(hy, hyd) };
}

export type OdeKind = 'separable' | 'linear' | 'second';

/** which method fits */
export function odeKind(e: Eq): OdeKind | null {
  const u = unknown(e);
  if (!u || relOf(e) !== '=') return null;
  if (u.order === 2) return 'error' in coefficients(e, u.y) ? null : 'second';
  const R = slopeForm(e, u.y);
  if (R && splitXY(R, u.x, u.y)) return 'separable';
  return 'error' in linearForm(e) ? null : 'linear';
}

/* ---------- separable ---------- */

/** y′ = g(x)h(y) ⇒ ∫ 1/h(y) dy = ∫ g(x) dx */
export function separate(e: Eq): MoveResult {
  const u = unknown(e);
  if (!u || u.order !== 1) return { error: 'Separating needs a first-order equation with y′ in it.' };
  const R = slopeForm(e, u.y);
  if (!R) return { error: `Get ${u.y}′ on its own first (e solves for it).` };
  const p = splitXY(R, u.x, u.y);
  if (!p) return { error: `This doesn't split into (something in ${u.x}) × (something in ${u.y}). Try the integrating factor (C + f).` };
  const L = S(frac(num(1), p.h)), g = S(p.g);
  const next = eq(int(u.y, L), int(u.x, g));
  const yp = primed(u.y);
  return checked(e, {
    eq: next, label: `separate: ${u.y}s left, ${u.x}s right`, hints: newHints(), factor: one, select: null, rule: 'separation of variables', implies: true,
    conditions: [`${toText(p.h)} ≠ 0 (where it is 0, ${u.y} = constant may be a solution too)`],
    // differentiating back with y depending on x: y′/h(y) − g(x) is the old equation divided by h(y)
    check: env => [[evaluate(L, env) * env[yp] - evaluate(g, env), (evaluate(e.lhs, env) - evaluate(e.rhs, env)) / evaluate(p.h, env) * (e.lhs.k === 'sym' && e.lhs.name === yp ? 1 : -1)]],
  });
}

/* ---------- linear first order ---------- */

/** a·y′ + b·y + c = 0, with a, b, c in x only */
function linearForm(e: Eq): { y: string; x: string; a: Node; P: Node; Q: Node } | { error: string } {
  const u = unknown(e);
  if (!u || u.order !== 1) return { error: 'Not a first-order equation.' };
  const F = add([e.lhs, neg(e.rhs)]), yp = primed(u.y);
  // F is a·y′ + b·y + c when it is linear: read a, b, c off by putting in 0s and 1s
  const at = (Y: number, Yp: number) => substitute(substitute(F, u.y, num(Y)), yp, num(Yp));
  const c = at(0, 0), a = S(add([at(0, 1), neg(c)])), b = S(add([at(1, 0), neg(c)]));
  if (!linearCheck(F, a, b, c, u.y, yp)) return { error: `Not linear: ${u.y} or ${yp} is multiplied by itself or inside a function.` };
  if (evaluate(a, env0(symbols(a), 1)) === 0) return { error: `No ${yp} here.` };
  return { y: u.y, x: u.x, a, P: S(frac(b, a)), Q: S(neg(frac(c, a))) };
}

/** does F equal a·y′ + b·y + c at sample points? */
function linearCheck(F: Node, a: Node, b: Node, c: Node, y: string, yp: string): boolean {
  const vs = [...new Set([...symbols(F), y, yp])];
  for (let i = 0; i < 5; i++) {
    const env = env0(vs, i);
    env[y] = -1.7 + 0.9 * i; env[yp] = 2.3 - 1.1 * i;
    const want = evaluate(F, env), got = evaluate(a, env) * env[yp] + evaluate(b, env) * env[y] + evaluate(c, env);
    if (!(Math.abs(want - got) <= 1e-9 * (1 + Math.abs(want)))) return false;
  }
  return true;
}

/** e^(∫P dx), tidied: e^(k ln|x|) is x^k */
function integratingFactor(P: Node, x: string): Node | { error: string } {
  const { steps, stuck } = finishCalc(eq(int(x, P), num(0), 'expr'));
  if (stuck || !steps.length) return { error: `I can't integrate ${toText(P)} for the integrating factor.` };
  let I = steps[steps.length - 1].eq.lhs;
  // drop the + C: any one antiderivative will do
  if (I.k === 'add') I = plus(...I.terms.filter(t => !(t.k === 'sym' && t.name === 'C')));
  const lnAbs = (n: Node) => n.k === 'fn' && n.name === 'ln' && n.arg.k === 'fn' && n.arg.name === 'abs' && n.arg.arg.k === 'sym' && n.arg.arg.name === x;
  if (lnAbs(I)) return sym(x);
  if (I.k === 'neg' && lnAbs(I.arg)) return frac(num(1), sym(x));
  if (I.k === 'mul' && I.factors.length === 2 && I.factors[0].k === 'num' && lnAbs(I.factors[1])) return pow(sym(x), num(I.factors[0].v));
  return pow(sym('e'), I);
}

/** the integrating factor method, as steps: (standard form), × μ, (μy)′ = μQ, μy = ∫ μQ dx */
export function linearSteps(e: Eq): MoveOk[] | { error: string } {
  const f = linearForm(e);
  if ('error' in f) return f;
  const { y, x, a, P, Q } = f, yp = primed(y);
  const out: MoveOk[] = [];
  let cur = e;
  const push = (r: MoveResult) => { if (isErr(r)) return r; out.push(r); cur = r.eq; return null; };
  const F = cloneFresh;
  const std = eq(plus(sym(yp), S(mul([F(P), sym(y)]))), F(Q));
  if (toText(std) !== toText(e)) {
    const err = push(checked(cur, { eq: std, label: `standard form: ÷ ${toText(a)}`, hints: newHints(), factor: env => 1 / evaluate(a, env), select: null, rule: 'standard form' }));
    if (err) return err;
  }
  const mu = integratingFactor(P, x);
  if ('error' in mu) return mu;
  let err = push(checked(cur, { eq: eq(plus(S(mul([F(mu), sym(yp)])), S(mul([F(mu), F(P), sym(y)]))), S(times(F(mu), F(Q)))), label: `× the integrating factor ${toText(mu)}`, hints: newHints(), factor: env => evaluate(mu, env), select: null, rule: 'integrating factor' }));
  if (err) return err;
  const my = S(mul([F(mu), sym(y)]));
  err = push(checked(cur, { eq: eq(deriv(x, my, [y]), S(times(F(mu), F(Q)))), label: `the left side is (${toText(my)})′`, hints: newHints(), factor: one, select: null, rule: 'product rule backwards' }));
  if (err) return err;
  const R = S(times(F(mu), F(Q)));
  const d = derivative(my, x, [y]);
  if (!d) return { error: 'There is no derivative rule for the integrating factor.' };
  const before = cur;
  err = push(checked(cur, {
    eq: eq(S(mul([F(mu), sym(y)])), int(x, R)), label: 'integrate both sides', hints: newHints(), factor: one, select: null, rule: 'integrate both sides', implies: true,
    check: env => [[evaluate(d, env) - evaluate(R, env), evaluate(before.lhs, env) - evaluate(before.rhs, env)]],
  }));
  return err ?? out;
}

/* ---------- constant coefficients, second order ---------- */

/** a y″ + b y′ + c y = g(x): the numbers a, b, c, and the forcing g (null when it is 0) */
function coefficients(e: Eq, y: string): { a: number; b: number; c: number; g: Node | null } | { error: string } {
  const F = add([e.lhs, neg(e.rhs)]);
  const ks = [y + '″', primed(y), y].map(v => derivative(F, v));
  if (ks.some(k => !k)) return { error: 'There is no derivative rule for something in here yet.' };
  const [a, b, c] = ks.map(k => evaluate(k!, {}));
  if (![a, b, c].every(Number.isFinite) || a === 0) return { error: 'The characteristic equation needs plain-number coefficients: a y″ + b y′ + c y = g(x).' };
  const g = neg(substitute(substitute(substitute(F, y + '″', num(0)), primed(y), num(0)), y, num(0)));
  const vs = symbols(g);
  const zero = [0, 1, 2].every(i => Math.abs(evaluate(g, env0(vs, i))) < 1e-12);
  return { a, b, c, g: zero ? null : g };
}

/** how fast arg grows in x, when it is k·x (+ a constant) */
function rate(arg: Node, x: string): number | null {
  const f = (t: number) => evaluate(arg, { [x]: t });
  const r = f(1) - f(0);
  return Number.isFinite(r) && Math.abs(f(2) - f(0) - 2 * r) < 1e-9 ? Math.round(r * 1e9) / 1e9 : null;
}

/** undetermined coefficients: a particular solution of a y″ + b y′ + c y = g, tried as a sum of
 *  xʲ·e^(kx)·(cos or sin)(wx) for the k and w in g. Solved numerically (least squares, a trial term
 *  that already solves the homogeneous equation drops out, so x·e^(kx) takes its place), and only
 *  kept when every coefficient is a simple number. */
function particular(a: number, b: number, c: number, g: Node, x: string): Node | null {
  // each term of g is xʲ·e^(kx)·(cos or sin)(wx): read off its k, w and power
  const groups = new Map<string, { k: number; w: number | null; deg: number }>();
  const degree = (n: Node): number => n.k === 'sym' ? (n.name === x ? 1 : 0)
    : n.k === 'pow' && n.base.k === 'sym' && n.base.name === 'e' ? 0
    : n.k === 'fn' ? 0
    : n.k === 'pow' && n.exp.k === 'num' && Number.isInteger(n.exp.v) ? degree(n.base) * n.exp.v
    : n.k === 'mul' ? n.factors.reduce((t, f) => t + degree(f), 0)
    : n.k === 'frac' ? degree(n.num)
    : Math.max(0, ...children(n).map(degree));
  const terms0 = g.k === 'add' ? g.terms : [g];
  for (const t of terms0) {
    let k = 0, w: number | null = null, ok = true;
    walk(t, n => {
      if (n.k === 'pow' && n.base.k === 'sym' && n.base.name === 'e') { const r = rate(n.exp, x); if (r === null) ok = false; else k += r; }
      if (n.k === 'fn') { const r = n.name === 'sin' || n.name === 'cos' ? rate(n.arg, x) : null; if (r === null || w !== null) ok = false; else w = Math.abs(r); }
    });
    const d = degree(t);
    if (!ok || d > 4) return null;
    const id = `${k}|${w}`;
    const o = groups.get(id);
    groups.set(id, { k, w, deg: Math.max(d, o?.deg ?? 0) });
  }
  // xʲ up to two more than g has, for when e^(kx) already solves the homogeneous equation
  const kernels: { K: Node; top: number }[] = [];
  for (const { k, w, deg } of groups.values()) {
    const ex = k === 0 ? null : expOf(numNode(k), x);
    const waves = w === null || w === 0 ? [null] : [fn('cos', times(numNode(w), sym(x))), fn('sin', times(numNode(w), sym(x)))];
    for (const wave of waves) kernels.push({ K: times(...[ex, wave].filter((m): m is Node => !!m)), top: deg + 2 });
  }
  // highest power first within each kernel, so 2x + 3 reads that way
  const basis: Node[] = [], group: number[] = [];
  kernels.forEach(({ K, top }, gi) => { for (let j = top; j >= 0; j--) { basis.push(j === 0 ? K : times(j === 1 ? sym(x) : pow(sym(x), num(j)), cloneFresh(K))); group.push(gi); } });
  const L = basis.map(B => { const d1 = derivative(B, x), d2 = d1 && derivative(d1, x); return d1 && d2 ? (t: number) => a * evaluate(d2, { [x]: t }) + b * evaluate(d1, { [x]: t }) + c * evaluate(B, { [x]: t }) : null; });
  if (L.some(f => !f)) return null;
  // sample wide enough that cos x and 1 − x²/2 don't look alike
  const freqs = [...groups.values()].map(o => o.w).filter((w): w is number => !!w);
  const half = freqs.length ? Math.max(3, 4 / Math.min(...freqs)) : 1.15;
  const ts = Array.from({ length: 3 * basis.length + 6 }, (_, i) => -half + 0.05 + (2 * half * i) / (3 * basis.length + 5));
  const cols = L.map(f => ts.map(t => f!(t)));
  const rhs = ts.map(t => evaluate(g, { [x]: t }));
  // least squares by modified Gram-Schmidt, lowest powers first so a trial term the homogeneous
  // part already has drops out (its column is 0); then again with only the terms that matter
  const solve = (order: number[]) => {
    const Q: number[][] = [], R: number[][] = [], kept: number[] = [];
    const dotv = (u: number[], v: number[]) => u.reduce((s, ui, i) => s + ui * v[i], 0);
    for (const j of order) {
      const v = [...cols[j]], r: number[] = [];
      const n0 = Math.sqrt(dotv(v, v));
      for (const q of Q) { const rq = dotv(q, v); r.push(rq); for (let i = 0; i < v.length; i++) v[i] -= rq * q[i]; }
      const n = Math.sqrt(dotv(v, v));
      if (n <= 1e-8 * (1 + n0)) continue;
      Q.push(v.map(t => t / n)); r.push(n); R.push(r); kept.push(j);
    }
    const qb = Q.map(q => dotv(q, rhs));
    const coef: number[] = new Array(kept.length).fill(0);
    for (let i = kept.length - 1; i >= 0; i--) {
      let s = qb[i];
      for (let k = i + 1; k < kept.length; k++) s -= R[k][i] * coef[k];
      coef[i] = s / R[i][i];
    }
    const res = rhs.map((gv, i) => kept.reduce((s, j, k) => s + coef[k] * cols[j][i], 0) - gv);
    const fits = res.every(r => Math.abs(r) < 1e-6 * (1 + Math.max(...rhs.map(Math.abs))));
    return { kept, coef, fits };
  };
  const first = solve(basis.map((_, i) => i).sort((i, j) => group[i] - group[j] || j - i));
  if (!first.fits) return null;
  const big = Math.max(...first.coef.map(Math.abs));
  const { kept, coef, fits } = solve(first.kept.filter((_, k) => Math.abs(first.coef[k]) > 1e-5 * big));
  if (!fits) return null;
  const terms: Node[] = [];
  for (let j = 0; j < basis.length; j++) {
    const k = kept.indexOf(j);
    if (k < 0 || Math.abs(coef[k]) < 1e-9) continue;
    const q = ratNode(coef[k]);
    if (!q) return null;
    terms.push(S(times(q, basis[j])));
  }
  return terms.length ? plus(...terms) : num(0);
}

const numNode = (x: number): Node => ratNode(x) ?? num(+x.toPrecision(12));

/** C + r: a r² + b r + c = 0 */
export function characteristic(e: Eq): Eq | { error: string } {
  const u = unknown(e);
  if (!u || u.order !== 2) return { error: 'The characteristic equation is for y″ + b y′ + c y = 0.' };
  const k = coefficients(e, u.y);
  if ('error' in k) return k;
  return eq(plus(times(numNode(k.a), pow(sym('r'), num(2))), times(numNode(k.b), sym('r')), numNode(k.c)), num(0));
}

/** e^(k·x), with e^x for k = 1 */
const expOf = (k: Node, x: string): Node => pow(sym('e'), times(k, sym(x)));

/** C + g: the general solution from the roots, checked by putting it back into the equation */
export function generalSolution(e: Eq): Eq | { error: string } {
  const u = unknown(e);
  if (!u || u.order !== 2) return { error: 'The general solution here is for y″ + b y′ + c y = g(x).' };
  const k = coefficients(e, u.y);
  if ('error' in k) return k;
  const { a, b, c } = k, x = u.x, disc = b * b - 4 * a * c;
  const C1 = sym('C_1'), C2 = sym('C_2');
  let sol: Node;
  const root = (s: number): Node => {
    const r = Math.sqrt(Math.abs(disc));
    if (Math.abs(r - Math.round(r)) < 1e-12) return numNode((-b + s * Math.round(r)) / (2 * a));
    return S(frac(add([num(-b), s > 0 ? sqrt(num(disc)) : neg(sqrt(num(disc)))]), num(2 * a)));
  };
  if (Math.abs(disc) < 1e-12) sol = mul([add([C1, mul([C2, sym(x)])]), expOf(numNode(-b / (2 * a)), x)]);
  else if (disc > 0) sol = add([mul([C1, expOf(root(-1), x)]), mul([C2, expOf(root(1), x)])]);
  else {
    const al = -b / (2 * a), w = Math.sqrt(-disc) / (2 * a);
    const beta = Math.abs(w - Math.round(w)) < 1e-12 ? num(Math.round(w)) : S(frac(sqrt(num(-disc)), num(2 * a)));
    const wave = add([mul([C1, fn('cos', times(beta, sym(x)))]), mul([C2, fn('sin', times(beta, sym(x)))])]);
    sol = al === 0 ? wave : mul([expOf(numNode(al), x), wave]);
  }
  // a forcing term: add a particular solution
  if (k.g) {
    const yp = particular(a, b, c, k.g, x);
    if (!yp) return { error: 'I can only find a particular solution when the right side is made of polynomials, e^(kx), sin and cos.' };
    sol = plus(sol, yp);
  }
  // the check: it must satisfy a y″ + b y′ + c y = g for any C₁, C₂
  const d1 = derivative(sol, x), d2 = d1 && derivative(d1, x);
  if (!d1 || !d2) return { error: 'There is no derivative rule for the solution.' };
  for (let i = 0; i < 6; i++) {
    const env: Env = { [x]: -1.3 + 0.53 * i, C_1: 0.7 + 0.3 * i, C_2: -1.1 + 0.4 * i };
    const res = a * evaluate(d2, env) + b * evaluate(d1, env) + c * evaluate(sol, env) - (k.g ? evaluate(k.g, env) : 0);
    if (!(Math.abs(res) <= 1e-7 * (1 + Math.abs(evaluate(d2, env)) + Math.abs(evaluate(sol, env))))) return { error: 'The solution did not check out, so I left it.' };
  }
  return eq(sym(u.y), sol);
}

/**
 * |y| = e^(g + C) → y = C e^g: ±e^C is just another constant, so the two cases are one family.
 * Checked with the new C put to ±e^(old C), the sign being y's.
 */
export function absorbConstant(e: Eq, y: string): MoveResult {
  const [a, b] = e.lhs.k === 'fn' && e.lhs.name === 'abs' ? [e.lhs, e.rhs] : [e.rhs, e.lhs];
  if (relOf(e) !== '=' || a.k !== 'fn' || a.name !== 'abs' || a.arg.k !== 'sym' || a.arg.name !== y) return { error: 'Needs |y| = e^(… + C).' };
  if (b.k !== 'pow' || b.base.k !== 'sym' || b.base.name !== 'e') return { error: 'Needs |y| = e^(… + C).' };
  const terms = b.exp.k === 'add' ? b.exp.terms : [b.exp];
  const c = terms.find(t => t.k === 'sym' && /^C$/.test(t.name));
  if (!c || symbols(b.exp).filter(v => v === 'C').length !== 1) return { error: 'Needs |y| = e^(… + C).' };
  const rest = terms.filter(t => t !== c);
  const g = rest.length ? S(add(rest.map(t => cloneFresh(t)))) : null;
  const next = eq(sym(y), g ? mul([sym('C'), pow(sym('e'), g)]) : sym('C'));
  return checked(e, {
    eq: next, label: '±e^C is one constant: call it C', hints: newHints(), factor: one, select: null, rule: 'constant of integration', implies: true,
    check: env => { const s = Math.sign(env[y]) || 1; return [[evaluate(next, { ...env, C: s * Math.exp(env.C) }), s * evaluate(e, env)]]; },
  });
}
