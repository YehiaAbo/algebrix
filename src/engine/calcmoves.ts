// Calculus steps, one rule at a time: the derivative rules (power, product, quotient, chain…),
// limits (plug in, L'Hôpital), differentiating both sides, and the definition of the
// derivative. Every step goes through the same numeric check as an algebra move: the kernel
// in calculus.ts says what a derivative or limit is worth.
import { Node, Eq, Deriv, Lim, num, sym, add, mul, neg, frac, pow, sqrt, fn, call, deriv, lim, eq, findPath, replace, walk, cloneFresh, evaluate, symbols, relOf, primed, Env, children, withChildren } from './ast';
import { dependsOn, derivative } from './calculus';
import { checked, MoveOk, MoveResult, isErr } from './moves';
import { newHints } from './simplify';
import { toText } from './print';

const one = () => 1;
const fresh = cloneFresh;
const isNum = (n: Node, v?: number) => n.k === 'num' && (v === undefined || n.v === v);

/** a product without the clutter: numbers multiplied together in front, 1s dropped, 0 wins */
export function times(...fs: Node[]): Node {
  let c = 1, sign = 1;
  const rest: Node[] = [];
  for (const f of fs.flatMap(f => (f.k === 'mul' ? f.factors : [f]))) {
    if (f.k === 'num') c *= f.v;
    else if (f.k === 'neg') { sign = -sign; rest.push(...(f.arg.k === 'mul' ? f.arg.factors : [f.arg])); }
    else rest.push(f);
  }
  c *= sign;
  if (c === 0) return num(0);
  if (!rest.length) return num(c);
  // simple pieces (numbers, letters, powers) read best in front: 2x·cos(x²)
  const simple = (n: Node) => n.k === 'sym' || (n.k === 'pow' && n.base.k === 'sym');
  const sorted = [...rest.filter(simple), ...rest.filter(f => !simple(f))];
  if (c === 1) return sorted.length === 1 ? sorted[0] : mul(sorted);
  if (c === -1) return neg(sorted.length === 1 ? sorted[0] : mul(sorted));
  return mul([num(c), ...sorted]);
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

interface Ctx { v: string; dep: string[] }
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

/** d/dv w as the next piece of a rule: worked out if it is simple, otherwise left to do */
const inner = (w: Node, c: Ctx): Node => quick(w, c)?.d ?? deriv(c.v, fresh(w), c.dep);

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
  const r = rule(D.arg, { v: D.v, dep: D.dep ?? [] });
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

/** C + p: put the value in. Only where the function is continuous: the check makes sure. */
export function plugIn(e: Eq, sel: string | null): MoveResult {
  const L = limTarget(e, sel);
  if (!L) return { error: 'No limit here.' };
  if (hasDeriv(L.arg)) return { error: 'Work out the derivatives inside first (C + d).' };
  const env = sampleEnv(L);
  const a = evaluate(L.to, env);
  if (!Number.isFinite(a)) return { error: `You can't plug in ${fmt(a)}. Try L'Hôpital (C + l), or divide top and bottom by the highest power (Tab).` };
  const body = plugged(L);
  const at = evaluate(body, env);
  if (!Number.isFinite(at)) {
    if (L.arg.k === 'frac') {
      const t = evaluate(L.arg.num, { ...env, [L.v]: a }), b = evaluate(L.arg.den, { ...env, [L.v]: a });
      if (Math.abs(t) < 1e-12 && Math.abs(b) < 1e-12) return { error: `Plugging in ${L.v} = ${toText(L.to)} gives 0/0. Factor and cancel (Tab + f, then s), or use L'Hôpital (C + l).` };
      if (Math.abs(b) < 1e-12) return { error: `Plugging in gives ${fmt(t)}/0: the limit is infinite or doesn't exist. Look from each side.` };
    }
    return { error: `Plugging in ${L.v} = ${toText(L.to)} is undefined.` };
  }
  return checked(e, { eq: replace(e, L.id, body), label: `plug in ${L.v} = ${toText(L.to)}`, hints: newHints(), factor: one, select: null, rule: 'plug in' });
}

/** C + l: 0/0 or ∞/∞ becomes the limit of the derivatives' quotient */
export function lhopital(e: Eq, sel: string | null): MoveResult {
  const L = limTarget(e, sel);
  if (!L) return { error: 'No limit here.' };
  const f = L.arg;
  if (f.k !== 'frac') return { error: "L'Hôpital needs a fraction. Make it one first (Tab + c)." };
  const env = sampleEnv(L);
  const part = (n: Node) => evaluate(lim(L.v, L.to, n, L.side), env);
  const t = part(f.num), b = part(f.den);
  const zero = (x: number) => Math.abs(x) < 1e-9, inf = (x: number) => !Number.isFinite(x) && !Number.isNaN(x);
  if (!((zero(t) && zero(b)) || (inf(t) && inf(b)))) return { error: `L'Hôpital needs 0/0 or ∞/∞. Here it is ${fmt(t)}/${fmt(b)}${Number.isFinite(t) && Number.isFinite(b) && !zero(b) ? ', so just plug in (C + p)' : ''}.` };
  const c: Ctx = { v: L.v, dep: [] };
  const next = lim(L.v, L.to, frac(inner(f.num, c), inner(f.den, c)), L.side, L.id);
  return checked(e, { eq: replace(e, L.id, next), label: `L'Hôpital (${zero(t) ? '0/0' : '∞/∞'})`, hints: newHints(), factor: one, select: null, rule: "L'Hôpital" });
}

/* ---------- e: finish all the calculus ---------- */

/** the steps that work out every derivative and limit, in order; stops at the first one that won't go */
export function finishCalc(e: Eq): { steps: MoveOk[]; stuck?: string } {
  const steps: MoveOk[] = [];
  let cur = e;
  for (let i = 0; i < 40 && (hasDeriv(cur) || hasLim(cur)); i++) {
    const L = limTarget(cur, null);
    let r: MoveResult;
    if (L && !hasDeriv(L.arg)) {
      r = plugIn(cur, L.id);
      if (isErr(r)) { const h = lhopital(cur, L.id); if (!isErr(h)) r = h; }
    } else r = derivStep(cur, L && hasDeriv(L.arg) ? L.arg.id : null);
    if (isErr(r)) return { steps, stuck: r.error };
    steps.push(r);
    cur = r.eq;
  }
  return { steps };
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
  if (relOf(e) !== '=') return { error: 'Differentiate both sides of an equation (=). An inequality may not keep its order.' };
  const others = symbols(e).filter(w => w !== v && !w.endsWith('′'));
  const D = (s: Node) => deriv(v, s, others);
  const next = eq(D(e.lhs), D(e.rhs));
  const F = add([e.lhs, neg(e.rhs)]);
  const dF = derivative(F, v, others);
  if (!dF) return { error: 'There is no derivative rule for something in here yet.' };
  return checked(e, {
    eq: next, label: `d/d${v} both sides${others.length ? ` (${others.join(', ')} ${others.length > 1 ? 'depend' : 'depends'} on ${v})` : ''}`, hints: newHints(), factor: one, select: null, rule: 'differentiate both sides', implies: true,
    check: env => [[evaluate(next, env), evaluate(dF, env)]],
  });
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
