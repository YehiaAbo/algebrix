// Calculus steps, one rule at a time: the derivative rules (power, product, quotient, chain…),
// limits (plug in, L'Hôpital), differentiating both sides, and the definition of the
// derivative. Every step goes through the same numeric check as an algebra move: the kernel
// in calculus.ts says what a derivative or limit is worth.
import { Node, Eq, Deriv, Lim, num, sym, add, mul, neg, frac, pow, sqrt, fn, call, deriv, lim, eq, int, sum, find, findPath, replace, walk, cloneFresh, evaluate, symbols, relOf, primed, Env, children, withChildren, partial, vec, grad, varOrder, isVector, vectorValue, Grad, DEFS } from './ast';
import { dependsOn, derivative, limit2, substitute } from './calculus';
import { checked, MoveOk, MoveResult, isErr, indefiniteVars } from './moves';
import { gcd } from './terms';
import { newHints, simplify } from './simplify';
import { intStep, uSub, byParts, plugBounds, geometric, writeOut, finiteTerms, backSub, ratNode, pSeries, trigRewrite, trigSub } from './integrate';
import { toText } from './print';
import { timesOne } from './general';
import { distributeNode, expandAll } from './rewrite';

const one = () => 1;
const fresh = cloneFresh;
const isNum = (n: Node, v?: number) => n.k === 'num' && (v === undefined || n.v === v);

/** a product without the clutter: numbers (and number fractions) multiplied together in front,
 *  1s dropped, 0 wins; a fraction coefficient goes underneath: x^4/4, 2x^3/3 */
export function times(...fs: Node[]): Node {
  let p = 1, q = 1;
  const rest: Node[] = [];
  const take = (f: Node) => {
    if (f.k === 'mul') return f.factors.forEach(take);
    if (f.k === 'num') { p *= f.v; return; }
    if (f.k === 'neg') { p = -p; return take(f.arg); }
    if (f.k === 'frac' && f.den.k === 'num' && f.den.v !== 0) { q *= f.den.v; return take(f.num); }
    rest.push(f);
  };
  fs.forEach(take);
  if (p === 0) return num(0);
  const g = gcd(Math.round(Math.abs(p)), Math.round(Math.abs(q))) || 1;
  if (Number.isInteger(p) && Number.isInteger(q)) { p /= g; q /= g; }
  if (q < 0) { p = -p; q = -q; }
  // simple pieces (letters, powers of letters) read best in front: 2x·cos(x²)
  const simple = (n: Node) => n.k === 'sym' || (n.k === 'pow' && n.base.k === 'sym');
  const letter = (n: Node) => (n.k === 'sym' ? n.name : n.k === 'pow' && n.base.k === 'sym' ? n.base.name : '');
  // and a constant's letter before the variables, as written: kx, ax², not xk
  const rank = (n: Node) => { const l = letter(n), i = ['x', 'y', 'z', 't'].indexOf(l); return i >= 0 ? i : /^[a-df-zA-Zα-ω]$/.test(l) ? -1 : 9; };
  const sorted = [...rest.filter(simple).sort((a, b) => rank(a) - rank(b)), ...rest.filter(f => !simple(f))];
  const body = (c: number): Node => {
    if (!sorted.length) return num(c);
    if (c === 1) return sorted.length === 1 ? sorted[0] : mul(sorted);
    if (c === -1) return neg(sorted.length === 1 ? sorted[0] : mul(sorted));
    return mul([num(c), ...sorted]);
  };
  if (q === 1) return body(p);
  const top = body(Math.abs(p));
  return p < 0 ? neg(frac(top, num(q))) : frac(top, num(q));
}

/** a sum without zeros */
export function plus(...ts: Node[]): Node {
  const kept = ts.flatMap(t => (t.k === 'add' ? t.terms : [t])).filter(t => !isNum(t, 0));
  return kept.length === 0 ? num(0) : kept.length === 1 ? kept[0] : add(kept);
}

/** n − 1, kept exact: 3 → 2, 1/2 → −1/2 */
function minusOne(n: Node): Node {
  if (n.k === 'num') return num(n.v - 1);
  if (n.k === 'frac' && n.num.k === 'num' && n.den.k === 'num') return n.num.v - n.den.v < 0 ? neg(frac(num(n.den.v - n.num.v), num(n.den.v))) : frac(num(n.num.v - n.den.v), num(n.den.v));
  if (n.k === 'neg' && n.arg.k === 'num') return num(-n.arg.v - 1);
  return add([fresh(n), num(-1)]);
}

const powOf = (b: Node, e: Node): Node => (isNum(e, 1) ? b : isNum(e, 0) ? num(1) : pow(b, e));

/** what d/dv of fn(u) is, before the chain factor */
function outer(name: string, u: Node): Node {
  const U = () => fresh(u);
  switch (name) {
    case 'sin': return fn('cos', U());
    case 'cos': return neg(fn('sin', U()));
    case 'tan': return frac(num(1), pow(fn('cos', U()), num(2)));
    case 'asin': return frac(num(1), sqrt(add([num(1), neg(pow(U(), num(2)))])));
    case 'acos': return neg(frac(num(1), sqrt(add([num(1), neg(pow(U(), num(2)))]))));
    case 'atan': return frac(num(1), add([num(1), pow(U(), num(2))]));
    case 'ln': return frac(num(1), U());
    case 'log': return frac(num(1), mul([U(), fn('ln', num(10))]));
    default: return frac(U(), fn('abs', U()));
  }
}
const FN_NAME: Record<string, string> = { asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹', abs: '|u|' };

interface Ctx { v: string; dep: string[]; partial?: boolean }
const dep = (n: Node, c: Ctx) => dependsOn(n, c.v, c.dep);

/** the derivatives you'd just write down: constants, x, xⁿ, c·xⁿ, sin x, eˣ, ln x, and sums of them */
function quick(u: Node, c: Ctx): { d: Node; label: string } | null {
  if (!dep(u, c)) return { d: num(0), label: 'constant rule' };
  if (u.k === 'sym') return u.name === c.v ? { d: num(1), label: `d/d${c.v} ${c.v} = 1` } : { d: sym(primed(u.name)), label: `${u.name} depends on ${c.v}` };
  if (u.k === 'pow' && u.base.k === 'sym' && u.base.name === c.v && !dep(u.exp, c)) return { d: times(fresh(u.exp), powOf(fresh(u.base), minusOne(u.exp))), label: 'power rule' };
  if (u.k === 'pow' && u.base.k === 'sym' && u.base.name === 'e' && u.exp.k === 'sym' && u.exp.name === c.v) return { d: fresh(u), label: `d/d${c.v} e^${c.v} = e^${c.v}` };
  if (u.k === 'sqrt' && u.arg.k === 'sym' && u.arg.name === c.v) return { d: frac(num(1), mul([num(2), fresh(u)])), label: 'power rule' };
  if (u.k === 'fn' && u.arg.k === 'sym' && u.arg.name === c.v && u.name !== 'abs') return { d: outer(u.name, u.arg), label: `derivative of ${FN_NAME[u.name] ?? u.name}` };
  if (u.k === 'neg') { const q = quick(u.arg, c); return q && { d: times(num(-1), q.d), label: q.label }; }
  if (u.k === 'mul') {
    const consts = u.factors.filter(f => !dep(f, c)), vars = u.factors.filter(f => dep(f, c));
    if (vars.length !== 1) return null;
    const q = quick(vars[0], c);
    return q && { d: times(...consts.map(fresh), q.d), label: q.label };
  }
  if (u.k === 'add') {
    const qs = u.terms.map(t => quick(t, c));
    if (!qs.every(Boolean)) return null;
    return { d: plus(...qs.map(q => q!.d)), label: 'sum rule' };
  }
  return null;
}

/** d/dv u written out nicely: the quick rules, else the kernel's answer tidied */
export function prettyDerivative(u: Node, v: string): Node {
  const q = quick(u, { v, dep: [] });
  if (q) return q.d;
  const d = derivative(u, v);
  return d ? simplify(d, newHints()) : deriv(v, fresh(u));
}

/** d/dv w as the next piece of a rule: worked out if it is simple, otherwise left to do */
const inner = (w: Node, c: Ctx): Node => quick(w, c)?.d ?? (c.partial ? partial(c.v, fresh(w)) : deriv(c.v, fresh(w), c.dep));

/** the one rule that fits the outside of u */
function rule(u: Node, c: Ctx): { d: Node; label: string } | { error: string } {
  const q = quick(u, c);
  if (q) return q;
  switch (u.k) {
    case 'add': return { d: plus(...u.terms.map(t => inner(t, c))), label: 'sum rule' };
    case 'neg': return { d: times(num(-1), inner(u.arg, c)), label: 'constant multiple' };
    case 'mul': {
      const consts = u.factors.filter(f => !dep(f, c)), vars = u.factors.filter(f => dep(f, c));
      if (consts.length) return { d: times(...consts.map(fresh), inner(vars.length === 1 ? vars[0] : mul(vars), c)), label: 'constant multiple' };
      const a = vars[0], b = vars.length === 2 ? vars[1] : mul(vars.slice(1));
      return { d: plus(times(inner(a, c), fresh(b)), times(fresh(a), inner(b, c))), label: 'product rule' };
    }
    case 'frac': {
      if (!dep(u.den, c)) return { d: frac(inner(u.num, c), fresh(u.den)), label: 'constant multiple' };
      const top = plus(times(inner(u.num, c), fresh(u.den)), times(num(-1), fresh(u.num), inner(u.den, c)));
      return { d: frac(top, pow(fresh(u.den), num(2))), label: 'quotient rule' };
    }
    case 'pow': {
      const { base, exp } = u;
      if (!dep(exp, c)) return { d: times(fresh(exp), powOf(fresh(base), minusOne(exp)), inner(base, c)), label: 'chain rule (power)' };
      const isE = base.k === 'sym' && base.name === 'e';
      if (!dep(base, c)) return { d: times(fresh(u), ...(isE ? [] : [fn('ln', fresh(base))]), inner(exp, c)), label: isE ? 'chain rule (eᵘ)' : 'exponential rule' };
      return { d: times(fresh(u), inner(mul([fresh(exp), fn('ln', fresh(base))]), c)), label: 'logarithmic differentiation' };
    }
    case 'sqrt': return { d: frac(inner(u.arg, c), mul([num(2), fresh(u)])), label: 'chain rule (√)' };
    case 'fn': return { d: times(outer(u.name, u.arg), inner(u.arg, c)), label: u.name === 'abs' ? 'derivative of |u|' : `chain rule (${FN_NAME[u.name] ?? u.name})` };
    case 'call': return { d: times(call(primed(u.name), fresh(u.arg)), inner(u.arg, c)), label: u.arg.k === 'sym' && u.arg.name === c.v ? `${u.name}′` : `chain rule (${u.name})` };
    case 'int': {
      // an antiderivative's slope is what was integrated (the fundamental theorem)
      if (!(u.lo && u.hi) && u.v === c.v) return { d: fresh(u.arg), label: 'fundamental theorem' };
      // Leibniz's rule: d/dt ∫ₐᵇ f dx = ∫ₐᵇ ∂f/∂t dx + f(b)·b′ − f(a)·a′
      const under = u.v !== c.v && dep(u.arg, c) ? [int(u.v, quick(u.arg, c)?.d ?? partial(c.v, fresh(u.arg)), u.lo && fresh(u.lo), u.hi && fresh(u.hi))] : [];
      const ends = u.lo && u.hi ? [[u.hi, 1], [u.lo, -1]].filter(([b]) => dep(b as Node, c)).map(([b, s]) => times(num(s as number), substitute(fresh(u.arg), u.v, b as Node), inner(b as Node, c))) : [];
      if (!under.length && !ends.length) return { d: num(0), label: 'constant rule' };
      return { d: plus(...under, ...ends), label: under.length ? 'Leibniz rule: d/d' + c.v + ' under the ∫' : 'fundamental theorem' };
    }
    case 'sum': {
      if (u.prod || dep(u.lo, c) || dep(u.hi, c)) return { error: 'No rule for that: the bounds move, or it is a product.' };
      return { d: sum(u.v, fresh(u.lo), fresh(u.hi), inner(u.arg, c)), label: 'term by term' };
    }
    default: return { error: 'There is no derivative rule for that yet.' };
  }
}

const hasKind = (n: Node, k: 'deriv' | 'lim') => { let f = false; walk(n, m => { if (m.k === k) f = true; }); return f; };
export const hasDeriv = (n: Node) => hasKind(n, 'deriv');
export const hasLim = (n: Node) => hasKind(n, 'lim');

/** the derivative to work on: the one aimed at (or around the aim), innermost first */
function derivTarget(e: Eq, sel: string | null): Deriv | null {
  const path = sel && sel !== 'eq' ? findPath(e, sel) : null;
  const around = path ? ([...path].reverse().find(n => n.k === 'deriv') as Deriv | undefined) : undefined;
  let start: Node | undefined = around;
  // aimed at a piece that holds derivatives: the first one inside it
  if (!start && path) walk(path[path.length - 1], n => { if (!start && n.k === 'deriv') start = n; });
  if (!start) walk(e, n => { if (!start && n.k === 'deriv') start = n; });
  if (!start) return null;
  let d = start as Deriv;
  for (;;) {
    let next: Deriv | null = null;
    walk(d.arg, n => { if (!next && n.k === 'deriv') next = n; });
    if (!next) return d;
    d = next;
  }
}

/** one rule on one derivative: C + d, or a step of e */
export function derivStep(e: Eq, sel: string | null): MoveResult {
  const D = derivTarget(e, sel);
  if (!D) return { error: 'No derivative here. C + d takes one.' };
  if (hasLim(D.arg)) return { error: 'Work out the limit inside first.' };
  const r = rule(D.arg, { v: D.v, dep: D.dep ?? [], partial: D.partial });
  if ('error' in r) return r;
  return checked(e, { eq: replace(e, D.id, r.d), label: r.label, hints: newHints(), factor: one, select: null, rule: r.label });
}

/* ---------- limits ---------- */

function limTarget(e: Eq, sel: string | null): Lim | null {
  const path = sel && sel !== 'eq' ? findPath(e, sel) : null;
  let L = path ? ([...path].reverse().find(n => n.k === 'lim') as Lim | undefined) ?? null : null;
  if (!L) walk(e, n => { if (!L && n.k === 'lim') L = n; });
  if (!L) return null;
  // innermost first
  for (;;) {
    let next: Lim | null = null;
    walk((L as Lim).arg, n => { if (!next && n.k === 'lim') next = n; });
    if (!next) return L;
    L = next;
  }
}

/** the arg with v replaced by a copy of `to` */
function plugged(L: Lim): Node {
  const sub = (n: Node): Node => {
    if (n.k === 'sym' && n.name === L.v) return fresh(L.to);
    if (n.k === 'lim' && n.v === L.v) return n;
    const ks = children(n);
    return ks.length ? withChildren(n, ks.map(sub)) : n;
  };
  return sub(L.arg);
}

/** a sample of the free variables, to judge a limit numerically */
function sampleEnv(n: Node): Env {
  const env: Env = {};
  symbols(n).forEach((v, i) => (env[v] = 1.37 + 0.71 * i));
  return env;
}

const fmt = (x: number) => (x === Infinity ? '∞' : x === -Infinity ? '−∞' : Number.isInteger(x) ? String(x) : String(+x.toPrecision(4)));

/** a limit as (x, y) → (a, b): put the point in where that works; else every path and every small
 *  circle nearing one value; else name two paths that disagree, and there is no limit */
export function limit2Step(e: Eq, sel: string | null): MoveResult {
  const L = limTarget(e, sel);
  if (!L || !L.v.includes(',') || L.to.k !== 'vec') return { error: 'No two-letter limit here.' };
  if (hasDeriv(L.arg)) return { error: 'Work out the derivatives inside first (C + d).' };
  const [vx, vy] = L.v.split(','), [A, B] = L.to.items;
  const pt = `(${vx}, ${vy}) = (${toText(A)}, ${toText(B)})`;
  const r = limit2(L);
  const snapped = Number.isFinite(r.value) ? ratNode(Math.round(r.value * 1e9) / 1e9) : null;
  const sub = (n: Node): Node => {
    if (n.k === 'sym' && n.name === vx) return fresh(A);
    if (n.k === 'sym' && n.name === vy) return fresh(B);
    const ks = children(n);
    return ks.length ? withChildren(n, ks.map(sub)) : n;
  };
  const body = sub(L.arg), at = evaluate(body, {});
  if (Number.isFinite(r.value) && Number.isFinite(at) && Math.abs(at - r.value) <= 1e-9 * (1 + Math.abs(at))) {
    const h = newHints();
    return checked(e, { eq: replace(e, L.id, simplify(body, h)), label: `plug in ${pt}`, hints: h, factor: one, select: null, rule: 'continuous: plug in' });
  }
  if (snapped) {
    return checked(e, { eq: replace(e, L.id, snapped), label: `every path, and every small circle round (${toText(A)}, ${toText(B)}), nears ${toText(snapped)}`, hints: newHints(), factor: one, select: null, rule: 'squeeze' });
  }
  const v = (x: number) => (x === Infinity ? '∞' : x === -Infinity ? '−∞' : toText(ratNode(Math.round(x * 1e9) / 1e9) ?? num(+x.toPrecision(4))));
  if (r.value === Infinity || r.value === -Infinity) return { eq: e, label: `it grows without bound`, hints: newHints(), factor: one, select: null, answer: `the limit is ${v(r.value)}: it grows without bound along every path` };
  const p1 = r.paths[0], p2 = r.paths.find(p => !(Number.isFinite(p.value) && Number.isFinite(p1.value) && Math.abs(p.value - p1.value) <= 1e-6 * (1 + Math.abs(p1.value))) && Number.isFinite(p.value));
  if (Number.isFinite(p1.value) && p2) return { eq: e, label: 'two paths disagree', hints: newHints(), factor: one, select: null, answer: `no limit: along ${p1.name} it nears ${v(p1.value)}, but along ${p2.name} it nears ${v(p2.value)}` };
  return { error: `No single value: the paths toward (${toText(A)}, ${toText(B)}) don't settle. Try polar form, x = r cos θ, y = r sin θ.` };
}

/** C + p: put the value in. Only where the function is continuous: the check makes sure. */
export function plugIn(e: Eq, sel: string | null): MoveResult {
  const L = limTarget(e, sel);
  if (!L) return { error: 'No limit here.' };
  if (L.v.includes(',')) return limit2Step(e, sel);
  if (hasDeriv(L.arg)) return { error: 'Work out the derivatives inside first (C + d).' };
  const env = sampleEnv(L);
  const a = evaluate(L.to, env);
  if (!Number.isFinite(a)) {
    // toward ∞: the pieces that shrink go to 0. Only when the whole limit is a plain number.
    const val = symbols(L).length ? NaN : evaluate(L, {});
    const n = ratNode(Math.round(val * 1e8) / 1e8);
    if (!n) return { error: `You can't plug in ${fmt(a)} here. Try L'Hôpital (C + l), or divide top and bottom by the highest power (Tab).` };
    return checked(e, { eq: replace(e, L.id, n), label: `${L.v} → ${fmt(a)}`, hints: newHints(), factor: one, select: null, rule: 'limit at infinity' });
  }
  const body = plugged(L);
  // 0⁰ is a form, not 1: the power has to come down first
  let zz = false;
  walk(body, n => { if (n.k === 'pow' && evaluate(n.base, env) === 0 && evaluate(n.exp, env) === 0) zz = true; });
  if (zz) return { error: `Plugging in ${L.v} = ${toText(L.to)} gives 0⁰, which could be anything. Bring the power down: e^(lim g ln f).` };
  const at = evaluate(body, env);
  if (!Number.isFinite(at)) {
    if (L.arg.k === 'frac') {
      const t = evaluate(L.arg.num, { ...env, [L.v]: a }), b = evaluate(L.arg.den, { ...env, [L.v]: a });
      if (Math.abs(t) < 1e-12 && Math.abs(b) < 1e-12) return { error: `Plugging in ${L.v} = ${toText(L.to)} gives 0/0. Factor and cancel (Tab + f, then s), or use L'Hôpital (C + l).` };
      if (Math.abs(b) < 1e-12) return { error: `Plugging in gives ${fmt(t)}/0: the limit is infinite or doesn't exist. Look from each side.` };
    }
    return { error: oneSided(L, env, a) ?? `Plugging in ${L.v} = ${toText(L.to)} is undefined.` };
  }
  const r = checked(e, { eq: replace(e, L.id, body), label: `plug in ${L.v} = ${toText(L.to)}`, hints: newHints(), factor: one, select: null, rule: 'plug in' });
  const o = isErr(r) ? oneSided(L, env, a) : null;
  return o ? { error: o } : r;
}

/** defined on one side only (√x, x ln x at 0): the two-sided limit isn't there, a one-sided one is */
function oneSided(L: Lim, env: Env, a: number): string | null {
  if (L.side) return null;
  const f = (x: number) => evaluate(L.arg, { ...env, [L.v]: x });
  const only = ([1, -1] as const).find(s => [1e-3, 1e-6].every(h => Number.isNaN(f(a - s * h))) && [1e-3, 1e-6].every(h => Number.isFinite(f(a + s * h))));
  return only ? `${toText(L.arg).replace(/sqrt\(/g, '√(')} only exists to the ${only > 0 ? 'right' : 'left'} of ${L.v} = ${toText(L.to)}, so the limit can only come from that side: lim_(${L.v}→${toText(L.to)}${only > 0 ? '+' : '−'}).` : null;
}

/** C + l: 0/0 or ∞/∞ becomes the limit of the derivatives' quotient */
export function lhopital(e: Eq, sel: string | null): MoveResult {
  const L = limTarget(e, sel);
  if (!L) return { error: 'No limit here.' };
  if (L.v.includes(',')) return { error: "L'Hôpital is for one letter. With two, try paths (C + p), or polar form." };
  const f = L.arg;
  if (f.k !== 'frac') return { error: "L'Hôpital needs a fraction. Make it one first (Tab + c)." };
  const env = sampleEnv(L);
  // ±∞ from the two sides (1/x at 0) still counts as ∞
  const part = (n: Node) => { const x = evaluate(lim(L.v, L.to, n, L.side), env); return Number.isNaN(x) ? evaluate(lim(L.v, L.to, fn('abs', fresh(n)), L.side), env) : x; };
  const t = part(f.num), b = part(f.den);
  const zero = (x: number) => Math.abs(x) < 1e-9, inf = (x: number) => !Number.isFinite(x) && !Number.isNaN(x);
  if (!((zero(t) && zero(b)) || (inf(t) && inf(b)))) return { error: `L'Hôpital needs 0/0 or ∞/∞. Here it is ${fmt(t)}/${fmt(b)}${Number.isFinite(t) && Number.isFinite(b) && !zero(b) ? ', so just plug in (C + p)' : ''}.` };
  const c: Ctx = { v: L.v, dep: [] };
  const dt = inner(f.num, c), db = inner(f.den, c);
  const next = lim(L.v, L.to, db.k === 'num' && db.v === 1 ? dt : frac(dt, db), L.side, L.id);
  return checked(e, { eq: replace(e, L.id, next), label: `L'Hôpital (${zero(t) ? '0/0' : '∞/∞'})`, hints: newHints(), factor: one, select: null, rule: "L'Hôpital" });
}

/** what each piece of a limit's inside tends to */
function tends(L: Lim) {
  const env = sampleEnv(L);
  return (n: Node) => evaluate(lim(L.v, L.to, n, L.side), env);
}
const near = (x: number, y: number) => Math.abs(x - y) < 1e-6;
const huge = (x: number) => !Number.isFinite(x) && !Number.isNaN(x);

/** 1^∞, 0⁰ and ∞⁰: lim f^g = e^(lim g ln f), so the power comes down as a product */
export function expLog(e: Eq, sel: string | null): MoveResult {
  const L = limTarget(e, sel);
  if (!L || L.arg.k !== 'pow' || !dependsOn(L.arg.exp, L.v)) return { error: 'Needs a limit of f^g with the letter in the power.' };
  const t = tends(L), b = t(L.arg.base), x = Math.abs(t(L.arg.exp)) || t(fn('abs', fresh(L.arg.exp)));
  const form = near(b, 1) && huge(x) ? '1^∞' : near(b, 0) && near(x, 0) ? '0⁰' : huge(b) && near(x, 0) ? '∞⁰' : null;
  if (!form) return { error: 'Only for 1^∞, 0⁰ or ∞⁰.' };
  const next = pow(sym('e'), lim(L.v, fresh(L.to), mul([fresh(L.arg.exp), fn('ln', fresh(L.arg.base))]), L.side));
  return checked(e, { eq: replace(e, L.id, next), label: `${form}: bring the power down, e^(lim g ln f)`, hints: newHints(), factor: one, select: null, rule: 'limit of a power' });
}

/** 0·∞: one factor goes underneath as 1/it, so L'Hôpital can take the 0/0 */
export function asQuotient(e: Eq, sel: string | null): MoveResult {
  const L = limTarget(e, sel);
  if (!L || L.arg.k !== 'mul' || L.arg.factors.length !== 2) return { error: 'Needs a limit of a product.' };
  const t = tends(L), [A, B] = L.arg.factors, size = (n: Node) => { const x = t(n); return Number.isNaN(x) ? t(fn('abs', fresh(n))) : x; }, a = size(A), b = size(B);
  if (!((huge(a) && near(b, 0)) || (huge(b) && near(a, 0)))) return { error: 'Only for 0·∞.' };
  // a ln or an inverse trig stays on top (its derivative is the easy one); else the 0 does, for 0/0
  const keep = (n: Node) => n.k === 'fn' && ['ln', 'log', 'asin', 'acos', 'atan'].includes(n.name);
  const [top, other] = keep(A) ? [A, B] : keep(B) ? [B, A] : near(a, 0) ? [A, B] : [B, A];
  const under = other.k === 'frac' && other.num.k === 'num' && other.num.v === 1 ? fresh(other.den) : frac(num(1), fresh(other));
  const next = lim(L.v, fresh(L.to), frac(fresh(top), under), L.side, L.id);
  return checked(e, { eq: replace(e, L.id, next), label: '0·∞: write it as a fraction', hints: newHints(), factor: one, select: null, rule: 'limit of a product' });
}

/* ---------- e: finish all the calculus ---------- */

/** derivatives, limits, integrals, bounds or sums still to work out */
export const hasCalc = (n: Node) => { let f = false; walk(n, m => { if (CALC.includes(m.k) || isDot(m)) f = true; }); return f; };
/** two vectors side by side: a dot product to work out */
const isDot = (n: Node) => n.k === 'mul' && n.factors.filter(f => f.k === 'vec').length === 2;
const CALC = ['deriv', 'lim', 'int', 'at', 'sum', 'grad'];

/** the innermost piece of calculus: children before parents, left to right */
function nextCalc(n: Node): Node | null {
  // d/dt of an integral with t inside: Leibniz first, so the integral that is left is the easier one
  if (n.k === 'deriv' && n.arg.k === 'int' && n.arg.v !== n.v && dependsOn(n.arg.arg, n.v, n.dep)) return n;
  // ∫ d/dx(F) dx: the fundamental theorem gives F back, with no need to work the derivative out
  if (n.k === 'int' && !n.lo && n.arg.k === 'deriv' && n.arg.v === n.v && !n.arg.partial) return n;
  for (const c of children(n)) { const t = nextCalc(c); if (t) return t; }
  return CALC.includes(n.k) || isDot(n) ? n : null;
}

/** the steps that work out every derivative, limit and integral, in order; stops at the first
 *  one that won't go. subs: u-substitutions in force (u → what it stands for), to put back. */
export function finishCalc(e: Eq, subs: Record<string, Node> = {}): { steps: MoveOk[]; stuck?: string } {
  const steps: MoveOk[] = [];
  const active = { ...subs };
  let cur = e;
  // by parts on a side that is one integral: if that integral comes back (eˣ sin x), solve for it
  let origin: { side: 'lhs' | 'rhs'; f: Node; v: string } | null = null, parts = 0, trigs = 0, tsubs = 0;
  for (let i = 0; i < 60; i++) {
    const t = nextCalc(cur);
    let r: MoveResult;
    if (!t) {
      // all worked out: put any u back
      const u = Object.keys(active).find(w => symbols(cur).includes(w));
      if (!u) break;
      r = backSub(cur, u, active[u]);
      delete active[u];
    } else if (t.k === 'deriv') r = derivStep(cur, t.id);
    else if (t.k === 'lim' && t.v.includes(',')) {
      // two letters: a plug-in, a squeeze, or two paths that disagree (which ends it)
      r = limit2Step(cur, t.id);
      if (!isErr(r) && r.answer) { steps.push(r); return { steps }; }
    }
    else if (t.k === 'lim') {
      r = plugIn(cur, t.id);
      if (isErr(r)) { const h = lhopital(cur, t.id); if (!isErr(h)) r = h; }
      if (isErr(r)) { const h = expLog(cur, t.id); if (!isErr(h)) r = h; }
      if (isErr(r)) { const h = asQuotient(cur, t.id); if (!isErr(h)) r = h; }
    } else if (t.k === 'at') r = plugBounds(cur, t.id);
    else if (t.k === 'sum') {
      r = typeof finiteTerms(t) === 'string' ? geometric(cur, t.id) : writeOut(cur, t.id);
      if (isErr(r) && /^Not geometric/.test(r.error)) { const q = pSeries(cur, t.id); if (!isErr(q) || q.error !== 'Not a p-series.') r = q; }
    }
    else if (t.k === 'grad') r = gradStep(cur, t.id);
    else if (t.k === 'mul') r = dotStep(cur, t.id);
    else {
      const back = origin && t.k === 'int' ? cameBack(cur, origin.side, origin.f, origin.v, t) : null;
      r = back ?? intStep(cur, t.id);
      // an indefinite one inside a definite one: nothing else will fix that, it needs bounds
      if (isErr(r) && /has no bounds/.test(r.error)) return { steps, stuck: r.error };
      if (isErr(r)) {
        const s = uSub(cur, t.id);
        if (!isErr(s.move) && s.u && s.g) { r = s.move; if (s.side) active[s.u] = s.g; }
        else if (t.k === 'int' && expOver(cur, t)) r = expOver(cur, t)!;
        else if (!isErr(trigRewrite(cur, t.id)) && trigs++ < 4) r = trigRewrite(cur, t.id);
        else if (t.k === 'int' && tsubs < 1 && !isErr(trigSub(cur, t.id).move)) { const ts = trigSub(cur, t.id); r = ts.move; tsubs++; if (ts.u && ts.g && !t.lo) active[ts.u] = ts.g; }
        // a polynomial inside: multiply it out, never by parts (that only goes round)
        else if (polyInside(t) && expandInside(cur, t, true)) r = expandInside(cur, t, true)!;
        else {
          const b = byParts(cur, t.id);
          if (!isErr(b)) {
            if (++parts > 4) return { steps, stuck: 'By parts keeps going without the integral getting simpler. Try another u (aim at it, then C + b).' };
            const side = cur.lhs.id === t.id ? 'lhs' : cur.rhs.id === t.id ? 'rhs' : null;
            if (!origin && side && t.k === 'int' && !t.lo) origin = { side, f: t.arg, v: t.v };
            r = b;
          } else { const x = expandInside(cur, t); if (x) r = x; }
        }
      }
    }
    if (isErr(r)) return { steps, stuck: r.error };
    steps.push(r);
    cur = r.eq;
    // F(b) − F(a) just written: tidy it (1^(t+1)/(t+1) − 0/(t+1) is 1/(t+1))
    if (t?.k === 'at' && r.select) { const s = tidyAt(cur, r.select); if (s) { steps.push(s); cur = s.eq; } }
    // an inner integral just worked out: tidy what the outer one now holds
    // and a derivative just taken inside a limit (L'Hôpital): tidy the quotient before plugging in
    if (t?.k === 'at' || t?.k === 'int' || (t?.k === 'deriv' && (inLim(cur) || inInt(cur)))) { const s = tidyIntegrands(cur); if (s) { steps.push(s); cur = s.eq; } }
  }
  // out of turns with work left: that is going round, not done
  if (nextCalc(cur)) return { steps, stuck: 'This keeps going round without finishing. Try another route by hand.' };
  return { steps };
}

/** ∫ eˣ sin x by parts twice gives eˣ sin x − eˣ cos x − ∫ eˣ sin x: the integral I came back.
 *  The side was I all along, so I = A + kI, and I = A/(1 − k) */
function cameBack(e: Eq, side: 'lhs' | 'rhs', f: Node, v: string, t: Node): MoveResult | null {
  if (t.k !== 'int' || t.lo || t.v !== v || !findPath(e[side], t.id)) return null;
  const xs = [0.37, 0.91, 1.53];
  const ratios = xs.map(x => evaluate(t.arg, { [v]: x }) / evaluate(f, { [v]: x }));
  if (!ratios.every(r => Number.isFinite(r) && Math.abs(r - ratios[0]) < 1e-9 * (1 + Math.abs(r)))) return null;
  const S = e[side], A = replace(S, t.id, num(0)), B = replace(S, t.id, num(1));
  const ks = xs.map(x => evaluate(B, { [v]: x }) - evaluate(A, { [v]: x }));
  if (!ks.every(k => Math.abs(k - ks[0]) < 1e-9 * (1 + Math.abs(k)))) return null;
  const k = ks[0] * ratios[0];
  if (Math.abs(1 - k) < 1e-9) return null;
  const h = newHints();
  const I = simplify(frac(A, ratNode(1 - k) ?? num(1 - k)), h);
  const next = side === 'lhs' ? eq(plus(I, sym('C')), e.rhs, e.rel) : eq(e.lhs, plus(I, sym('C')), e.rel);
  const m = ratNode(Math.abs(k)), mt = !m ? `${+Math.abs(k).toPrecision(4)}I` : m.k === 'num' ? `${m.v === 1 ? '' : m.v}I` : m.k === 'frac' && m.num.k === 'num' && m.den.k === 'num' ? `${m.num.v === 1 ? '' : m.num.v}I/${m.den.v}` : 'kI';
  const r = checked(e, { eq: next, label: `the integral came back: I = … ${k > 0 ? '+' : '−'} ${mt}, so solve for I`, hints: h, factor: one, select: null, rule: 'solve for the integral' });
  return isErr(r) ? null : r;
}

/** an integral whose inside has no derivatives left to take (after Leibniz's rule) */
const inInt = (e: Eq) => { let f = false; walk(e, n => { if (n.k === 'int' && !hasCalc(n.arg)) f = true; }); return f; };
/** a limit whose inside has no derivatives left to take */
const inLim = (e: Eq) => { let f = false; walk(e, n => { if (n.k === 'lim' && !hasCalc(n.arg)) f = true; }); return f; };

/** ∫ 1/(1 + eˣ): × e⁻ˣ/e⁻ˣ (Tab m), when that lets u-substitution in */
function expOver(e: Eq, t: Node): MoveOk | null {
  if (t.k !== 'int' || t.arg.k !== 'frac' || t.arg.den.k !== 'add') return null;
  const ex = t.arg.den.terms.flatMap(x => (x.k === 'pow' && x.base.k === 'sym' && x.base.name === 'e' && dependsOn(x.exp, t.v) ? [x] : []));
  if (ex.length !== 1) return null;
  const r = timesOne(e, t.arg.id, `e^(${toText(neg(cloneFresh((ex[0] as Extract<Node, { k: 'pow' }>).exp)))})`);
  if (isErr(r)) return null;
  let T2: Node | null = null;
  walk(r.eq, n => { if (!T2 && n.k === 'int') T2 = n; });
  return T2 && !isErr(uSub(r.eq, (T2 as Node).id).move) ? r : null;
}

/** ∫ (1 − u²)²u² du: only sums, products and whole powers of the letter and numbers */
function polyInside(t: Node): boolean {
  if (t.k !== 'int') return false;
  let ok = true;
  walk(t.arg, n => {
    if (n.k === 'pow' && !(n.exp.k === 'num' && Number.isInteger(n.exp.v) && n.exp.v >= 0)) ok = false;
    else if (!['num', 'sym', 'add', 'mul', 'neg', 'pow'].includes(n.k)) ok = false;
  });
  return ok;
}

/** x²(sin x − x cos x): multiply the inside out, so the sum rule can take it term by term */
function expandInside(e: Eq, t: Node, all = false): MoveOk | null {
  if (t.k !== 'int' || hasCalc(t.arg)) return null;
  const h = newHints();
  const a = all ? expandAll(t.arg, h) : distributeNode(t.arg, h);
  if (!a || a.k !== 'add') return null;
  const r = checked(e, { eq: replace(e, t.arg.id, simplify(a, h)) as Eq, label: 'multiply out the inside', hints: h, factor: one, select: null });
  return isErr(r) ? null : r;
}

/** simplify one piece, when that changes it (no calculus left in it) */
function tidyAt(e: Eq, id: string): MoveOk | null {
  const n = find(e, id);
  if (!n || hasCalc(n)) return null;
  const h = newHints(), a = simplify(n, h);
  if (toText(a) === toText(n)) return null;
  const r = checked(e, { eq: replace(e, id, a), label: 'tidy', hints: h, factor: one, select: null, auto: true });
  return isErr(r) ? null : r;
}

/** simplify the inside of each integral that has no calculus left in it (a double integral's
 *  outer one, once the inner is done), and plain numbers left by plugged-in bounds */
function tidyIntegrands(e: Eq): MoveOk | null {
  const h = newHints();
  let changed = false;
  const busy = hasCalc(e);
  const go = (n: Node): Node => {
    // bounds just plugged in, with work still to do: 1^3 sin(1) − 0^3 sin(0) is sin(1) from here on
    if (busy && n.k !== 'num' && n.k !== 'sym' && !symbols(n).length && !hasCalc(n)) {
      const a = simplify(n, h);
      if (toText(a) !== toText(n)) { changed = true; return a; }
      return n;
    }
    if ((n.k === 'int' || n.k === 'lim') && !hasCalc(n.arg)) {
      const a = simplify(n.arg, h);
      if (toText(a) !== toText(n.arg)) { changed = true; return withChildren(n, children(n).map(c => (c === n.arg ? a : c))); }
      return n;
    }
    const ks = children(n);
    return ks.length ? withChildren(n, ks.map(go)) : n;
  };
  const next = go(e) as Eq;
  if (!changed) return null;
  const r = checked(e, { eq: next, label: 'tidy', hints: h, factor: one, select: null, auto: true });
  return isErr(r) ? null : r;
}

/* ---------- new work from the current equation ---------- */

/** the variable to differentiate by: aimed, else x, else t, else the only one */
export function calcVar(e: Eq, aimed: string | null): string | null {
  const vs = symbols(e).filter(v => !v.endsWith('′'));
  if (aimed && vs.includes(aimed)) return aimed;
  if (e.rel === 'def' && e.lhs.k === 'call' && e.lhs.arg.k === 'sym') return e.lhs.arg.name;
  return ['x', 't', 'θ'].find(v => vs.includes(v)) ?? (vs.length ? vs[0] : null);
}

/** C + d with no derivative in sight: what to work on next. An expression gets d/dx of it,
 *  f(x) = … gets f′(x) = d/dx(…). Equations differentiate in place (see bothSides). */
export function derivativeOf(e: Eq, v: string): Eq | { error: string } {
  if (relOf(e) === 'expr') return eq(deriv(v, fresh(e.lhs)), num(0), 'expr');
  if (relOf(e) === 'def' && e.lhs.k === 'call') return eq(call(primed(e.lhs.name), fresh(e.lhs.arg)), deriv(v, fresh(e.rhs)), 'def');
  return { error: 'Differentiate both sides instead.' };
}

/** C + c: where the slope is 0 */
export function criticalOf(e: Eq, v: string): Eq | { error: string } {
  const body = relOf(e) === 'expr' ? e.lhs : relOf(e) === 'def' ? e.rhs : null;
  if (!body) return { error: 'Critical points are for a function: type f(x) = … or an expression.' };
  return eq(deriv(v, fresh(body)), num(0));
}

/** C + d on an equation: d/dv both sides. The other variables depend on v (implicit
 *  differentiation), so y becomes y′. Not reversible: it is marked ⇒. */
export function bothSides(e: Eq, v: string): MoveResult {
  // a definition holds for every value, so its sides' slopes are equal too: I(t) = … gives I′(t) = …
  if (relOf(e) === 'def') e = eq(e.lhs, e.rhs);
  if (relOf(e) !== '=') return { error: 'Differentiate both sides of an equation (=). An inequality may not keep its order.' };
  // the letter of an indefinite ∫ … dx runs on its own: it doesn't depend on v (I(t) = ∫ f(x, t) dx)
  const own = indefiniteVars(e);
  const others = symbols(e).filter(w => w !== v && !w.endsWith('′') && !own.includes(w));
  const D = (s: Node) => deriv(v, s, others);
  const next = eq(D(e.lhs), D(e.rhs));
  const F = add([e.lhs, neg(e.rhs)]);
  const dF = derivative(F, v, others);
  if (!dF) return { error: 'There is no derivative rule for something in here yet.' };
  return checked(e, {
    eq: next, label: `d/d${v} both sides${others.length ? ` (${others.join(', ')} ${others.length > 1 ? 'depend' : 'depends'} on ${v})` : ''}`, hints: newHints(), factor: one, select: null, rule: 'differentiate both sides', implies: true,
    check: env => [[evaluate(pinned(next), env), evaluate(pinned(dF), env)]],
  });
}

/** for a numeric check only: every ∫ … dx with no bounds as one particular antiderivative,
 *  ∫ from a fixed start to x, so both sides of a check can be worked out (the same start on both,
 *  so the constants agree) */
export function pinned<T extends Node>(n: T): T {
  const ks = children(n);
  const m = (ks.length ? withChildren(n, ks.map(pinned)) : n) as Node;
  // a function you defined as such an ∫: its body, pinned the same way
  // (and I′, I″: the slopes of that body)
  const base = m.k === 'call' ? m.name.replace(/′+$/, '') : '', d = DEFS.get(base);
  if (m.k === 'call' && d && indefiniteVars(d.body).length) {
    let body: Node = d.body;
    for (let i = base.length; i < m.name.length; i++) body = deriv(d.param, body, []);
    return pinned(substitute(body, d.param, m.arg)) as T;
  }
  return (m.k === 'int' && !(m.lo && m.hi) ? { ...m, lo: num(0.37), hi: sym(m.v) } : m) as T;
}

/* ---------- forms for the C hub ---------- */

/** the definition: d/dx f = lim h→0 (f(x + h) − f(x))/h */
export function definitionForm(e: Eq, sel: string | null): MoveOk | null {
  const D = derivTarget(e, sel);
  if (!D || D.dep) return null;
  const h = symbols(e).includes('h') ? 'k' : 'h';
  const shifted = (n: Node): Node => {
    if (n.k === 'sym' && n.name === D.v) return add([sym(D.v), sym(h)]);
    const ks = children(n);
    return ks.length ? withChildren(n, ks.map(shifted)) : n;
  };
  const q = frac(add([shifted(fresh(D.arg)), neg(fresh(D.arg))]), sym(h));
  const r = checked(e, { eq: replace(e, D.id, lim(h, num(0), q)), label: 'the definition', hints: newHints(), factor: one, select: null, rule: 'definition of the derivative' });
  return isErr(r) ? null : r;
}

/* ---------- several variables ---------- */

/** the letters a function of several variables uses, x, y, z first (not y′, not λ) */
export function calcVars(e: Eq): string[] {
  const body = relOf(e) === 'def' ? e.rhs : e.lhs;
  return varOrder(symbols(body).filter(v => !v.endsWith('′') && v !== 'λ'));
}

const bodyOf = (e: Eq) => (relOf(e) === 'expr' ? e.lhs : relOf(e) === 'def' ? e.rhs : null);

/** C + d with two or more letters: ∂/∂v of it, as a new expression */
export function partialOf(e: Eq, v: string): Eq | { error: string } {
  const b = bodyOf(e);
  if (!b) return { error: 'Partial derivatives are for a function: type an expression in x and y.' };
  return eq(partial(v, fresh(b)), num(0), 'expr');
}

/** the innermost node of kind k, around the aim if there is one */
function target(e: Eq, sel: string | null, ok: (n: Node) => boolean): Node | null {
  const path = sel && sel !== 'eq' ? findPath(e, sel) : null;
  let t: Node | null = path ? [...path].reverse().find(ok) ?? null : null;
  if (!t && path) walk(path[path.length - 1], n => { if (!t && ok(n)) t = n; });
  if (!t) walk(e, n => { if (!t && ok(n)) t = n; });
  return t;
}

/** ∇f → ⟨∂f/∂x, ∂f/∂y, …⟩ */
export function gradStep(e: Eq, sel: string | null): MoveResult {
  const G = target(e, sel, n => n.k === 'grad') as Grad | null;
  if (!G) return { error: 'No gradient here.' };
  if (G.op) {
    const F = G.arg;
    if (F.k !== 'vec' || F.items.length !== G.vars.length) return { error: 'Divergence and curl need a field written out, like ⟨x y, y^2, z⟩.' };
    const d = (i: number, v: string) => partial(v, fresh(F.items[i]));
    const [x, y, z] = G.vars;
    const diff = (i: number, v: string, j: number, w: string) => add([d(i, v), neg(d(j, w))]);
    const next = G.op === 'div' ? add(G.vars.map((v, i) => d(i, v)))
      : G.vars.length === 2 ? diff(1, x, 0, y)
      : vec([diff(2, y, 1, z), diff(0, z, 2, x), diff(1, x, 0, y)]);
    const label = G.op === 'div' ? 'divergence: ∂P/∂x + ∂Q/∂y' + (z ? ' + ∂R/∂z' : '') : G.vars.length === 2 ? 'curl: ∂Q/∂x − ∂P/∂y' : 'curl: the cross product of ∇ with the field';
    return checked(e, { eq: replace(e, G.id, next), label, hints: newHints(), factor: one, select: null, rule: G.op === 'div' ? 'divergence' : 'curl' });
  }
  const next = vec(G.vars.map(v => partial(v, fresh(G.arg))));
  return checked(e, { eq: replace(e, G.id, next), label: 'gradient: a partial for each letter', hints: newHints(), factor: one, select: null, rule: 'gradient' });
}

/** ⟨a, b⟩ ⟨c, d⟩ → ac + bd */
export function dotStep(e: Eq, sel: string | null): MoveResult {
  const M = target(e, sel, isDot);
  if (!M || M.k !== 'mul') return { error: 'A dot product needs two vectors side by side, worked out.' };
  const [a, b] = M.factors.filter(f => f.k === 'vec') as { items: Node[] }[];
  if (a.items.length !== b.items.length) return { error: `These vectors have ${a.items.length} and ${b.items.length} entries, so they can't be dotted.` };
  const others = M.factors.filter(f => f.k !== 'vec').map(fresh);
  const dot = plus(...a.items.map((x, i) => times(fresh(x), fresh(b.items[i]))));
  const next = others.length ? times(...others, dot) : dot;
  return checked(e, { eq: replace(e, M.id, next), label: 'dot product', hints: newHints(), factor: one, select: null, rule: 'dot product' });
}

/** C + m with two or more letters: where every partial is 0, ∇f = 0 */
export function gradientZero(e: Eq): Eq | { error: string } {
  const b = bodyOf(e);
  if (!b) return { error: 'Critical points are for a function: type an expression in x and y.' };
  const vs = calcVars(e);
  return eq(grad(fresh(b), vs), vec(vs.map(() => num(0))));
}

/** C + k: f's extremes on the constraint g = c are where ∇f = λ∇g */
export function lagrange(f: Eq, constraint: Eq): Eq | { error: string } {
  const b = bodyOf(f);
  if (!b) return { error: 'Lagrange needs a function to make biggest or smallest: an expression in x and y.' };
  if (relOf(constraint) !== '=' || hasCalc(constraint)) return { error: 'The constraint is an equation like x + y = 4.' };
  const g = symbols(constraint.rhs).length ? add([fresh(constraint.lhs), neg(fresh(constraint.rhs))]) : fresh(constraint.lhs);
  const fv = calcVars(f), gv = symbols(g);
  if (!gv.some(v => fv.includes(v))) return { error: 'The constraint shares no letters with the function.' };
  const vs = varOrder([...new Set([...fv, ...gv])].filter(v => v !== 'λ'));
  return eq(grad(fresh(b), vs), mul([sym('λ'), grad(g, [...vs])]));
}

/** entry i of a worked-out vector expression; a plain 0 is the zero vector */
function entry(n: Node, i: number): Node | null {
  switch (n.k) {
    case 'vec': return n.items[i] ? fresh(n.items[i]) : null;
    case 'num': return n.v === 0 ? num(0) : null;
    case 'neg': { const a = entry(n.arg, i); return a && times(num(-1), a); }
    case 'mul': {
      const v = n.factors.filter(isVector);
      if (v.length !== 1) return null;
      const a = entry(v[0], i);
      return a && times(...n.factors.filter(f => f !== v[0]).map(fresh), a);
    }
    case 'frac': { const a = isVector(n.den) ? null : entry(n.num, i); return a && frac(a, fresh(n.den)); }
    case 'add': { const ts = n.terms.map(t => entry(t, i)); return ts.every(Boolean) ? plus(...(ts as Node[])) : null; }
    default: return null;
  }
}

/** a vector equation as one equation per entry: the first is a step (⇒), the rest new equations */
export function components(e: Eq): { first: MoveResult; rest: Eq[] } {
  const none = (error: string) => ({ first: { error }, rest: [] });
  if (relOf(e) !== '=' || !(isVector(e.lhs) || isVector(e.rhs))) return none('Splitting into components needs a vector equation, like ⟨2x, 2y⟩ = ⟨0, 0⟩.');
  if (hasCalc(e)) return none('Work out the gradients first (C + n, or e).');
  const env: Env = {};
  symbols(e).forEach((v, i) => (env[v] = 1.3 + 0.4 * i));
  const dim = (vectorValue(isVector(e.lhs) ? e.lhs : e.rhs, env) ?? []).length;
  const eqs: Eq[] = [];
  for (let i = 0; i < dim; i++) {
    const l = entry(e.lhs, i), r = entry(e.rhs, i);
    if (!l || !r) return none('I can only split vectors written out entry by entry.');
    eqs.push(eq(l, r));
  }
  if (!eqs.length) return none('This vector has no entries.');
  const value = (n: Node, en: Env) => (isVector(n) ? vectorValue(n, en) : n.k === 'num' && n.v === 0 ? Array(dim).fill(0) : null);
  const first = checked(e, {
    eq: eqs[0], label: 'split into components', hints: newHints(), factor: one, select: null, rule: 'components', implies: true,
    // every entry, not just the first: the others become equations of their own
    check: en => { const L = value(e.lhs, en), R = value(e.rhs, en); return eqs.map((q, i) => [evaluate(q, en), L && R ? L[i] - R[i] : NaN]); },
  });
  return { first, rest: eqs.slice(1) };
}
