// The slope written three ways: y′, dy/dx, and as differentials (dy = … dx). dy and dx are
// letters of their own, so once they are in, every ordinary move (× dx, ÷ y) works on them and
// is checked as usual. Only the bridges need care: y′ and dy/dx are the same number when
// dy = y′·dx, so those steps are checked with dy put to exactly that.
import { Node, Eq, Env, sym, num, frac, pow, mul, eq, find, replace, walk, symbols, evaluate, primed, isDiff, isLeibniz2, relOf, int } from './ast';
import { simplify, newHints } from './simplify';
import { checked, MoveOk, MoveResult } from './moves';
import { splitXY } from './ode';
import { toText } from './print';

const one = () => 1;
const S = (n: Node) => simplify(n, newHints());

/** dy/dx as a fraction of two differentials */
export const isLeibniz = (n: Node): n is Node & { k: 'frac' } =>
  n.k === 'frac' && n.num.k === 'sym' && isDiff(n.num.name) && n.den.k === 'sym' && isDiff(n.den.name) && n.num.name !== n.den.name;

/** which letter is the function (y) and which the variable (x): from y′, dy/dx, or dy and dx */
export function letters(e: Eq): { y: string; x: string } | null {
  let y: string | null = null, x: string | null = null;
  walk(e, n => {
    if (y) return;
    if (isLeibniz2(n) && n.k === 'frac' && n.num.k === 'sym' && n.den.k === 'pow' && n.den.base.k === 'sym') { y = n.num.name.slice(2); x = n.den.base.name.slice(1); }
    else if (isLeibniz(n)) { y = (n.num as { name: string }).name.slice(1); x = (n.den as { name: string }).name.slice(1); }
    else if (n.k === 'sym' && /^[a-zA-Zα-ω][′″]$/.test(n.name)) y = n.name.slice(0, -1);
  });
  const ds = symbols(e).filter(isDiff).map(d => d.slice(1));
  if (!y && ds.length >= 2) {
    // dy and dx: x (or t) is the variable when it is there, the other is the function
    x = ds.includes('x') ? 'x' : ds.includes('t') ? 't' : ds[ds.length - 1];
    y = ds.find(d => d !== x)!;
  }
  if (!y) return null;
  if (!x) x = symbols(e).find(v => v !== y && v.length === 1 && v !== 'C' && v !== 'e') ?? (y === 'x' ? 't' : 'x');
  return { y, x };
}

export const hasDifferentials = (e: Eq) => symbols(e).some(isDiff);

/** the variable, when the equation names it (dy/dt, d²x/dt², dt): else the methods read y′ in x */
export function slopeVar(e: Eq): string | undefined {
  let named = hasDifferentials(e);
  walk(e, n => { if (isLeibniz2(n)) named = true; });
  return named ? letters(e)?.x : undefined;
}

/** checked with dy = y′·dx: the one fact that ties the three ways of writing a slope together */
function bridge(before: Eq, next: Eq, y: string, x: string, factor: (env: Env) => number = one): MoveOk['check'] {
  const yp = primed(y), dy = 'd' + y, dx = 'd' + x, ypp = y + '″', d2y = 'd²' + y;
  return env => {
    const at = { ...env };
    if (yp in at && dx in at) at[dy] = at[yp] * at[dx];
    // and d²y/dx² is y″ when d²y = y″·dx²
    if (ypp in at && dx in at) at[d2y] = at[ypp] * at[dx] * at[dx];
    return [[evaluate(next, at), factor(at) * evaluate(before, at)]];
  };
}

/** y′ (aimed) → dy/dx */
export function toLeibniz(e: Eq, id: string): MoveResult {
  const n = find(e, id);
  const L = letters(e);
  if (!n || n.k !== 'sym' || !/^[a-zA-Zα-ω][′″]$/.test(n.name) || !L) return { error: 'Aim at a y′ to write it as dy/dx.' };
  const y = n.name.slice(0, -1), second = n.name.endsWith('″');
  const d = second ? frac(sym('d²' + y), pow(sym('d' + L.x), num(2))) : frac(sym('d' + y), sym('d' + L.x));
  const next = replace(e, id, d) as Eq;
  return checked(e, { eq: next, label: second ? `as d²${y}/d${L.x}²` : `as d${y}/d${L.x}`, hints: newHints(), factor: one, select: d.id, rule: 'Leibniz notation', check: bridge(e, next, y, L.x) });
}

/** dy/dx (aimed) → y′ */
export function toPrime(e: Eq, id: string): MoveResult {
  const n = find(e, id);
  if (n && isLeibniz2(n) && n.k === 'frac' && n.num.k === 'sym' && n.den.k === 'pow' && n.den.base.k === 'sym') {
    const y = n.num.name.slice(2), x = n.den.base.name.slice(1), p = sym(y + '″');
    const next = replace(e, id, p) as Eq;
    return checked(e, { eq: next, label: `as ${y}″`, hints: newHints(), factor: one, select: p.id, rule: 'Leibniz notation', check: bridge(e, next, y, x) });
  }
  if (!n || !isLeibniz(n)) return { error: 'Aim at a dy/dx to write it as y′.' };
  const y = (n.num as { name: string }).name.slice(1), x = (n.den as { name: string }).name.slice(1);
  const p = sym(primed(y));
  const next = replace(e, id, p) as Eq;
  return checked(e, { eq: next, label: `as ${y}′`, hints: newHints(), factor: one, select: p.id, rule: 'Leibniz notation', check: bridge(e, next, y, x) });
}

/** y′ = R or dy/dx = R → dy = R dx: the slope split into differentials */
export function toDifferentials(e: Eq): MoveResult {
  const L = letters(e);
  if (!L || relOf(e) !== '=') return { error: 'Differentials need an equation with y′ or dy/dx in it.' };
  const yp = primed(L.y);
  const lone = (n: Node) => (n.k === 'sym' && n.name === yp) || (isLeibniz(n) && (n.num as { name: string }).name === 'd' + L.y);
  const [s, R] = lone(e.lhs) ? [e.lhs, e.rhs] : lone(e.rhs) ? [e.rhs, e.lhs] : [null, null];
  if (!s || !R) return { error: `Get ${yp} (or d${L.y}/d${L.x}) on its own on one side first.` };
  if (symbols(R).some(v => v === yp || isDiff(v))) return { error: `The other side still has a slope in it.` };
  const dy = sym('d' + L.y), rhs = S(mul([R, sym('d' + L.x)]));
  const next = s === e.lhs ? eq(dy, rhs) : eq(rhs, dy);
  return checked(e, { eq: next, label: `as differentials: × d${L.x}`, hints: newHints(), factor: env => env['d' + L.x], select: null, rule: 'differentials', check: bridge(e, next, L.y, L.x, env => env['d' + L.x]) });
}

/** A(y) dy = B(x) dx → ∫ A dy = ∫ B dx, once each side holds only its own letter */
export function integrateDifferentials(e: Eq): MoveResult {
  const L = letters(e);
  if (!L || relOf(e) !== '=' || !hasDifferentials(e)) return { error: 'Integrating both sides needs dy on one side and dx on the other.' };
  const dy = 'd' + L.y, dx = 'd' + L.x;
  // the coefficient of the differential, once simplified, must hold only its own letter
  const coef = (side: Node, d: string, other: string, od: string) => {
    if (!symbols(side).includes(d)) return null;
    const c = S(frac(side, sym(d)));
    const vs = symbols(c);
    return vs.includes(d) || vs.includes(od) || vs.includes(other) || vs.some(v => v.endsWith('′')) ? null : c;
  };
  let A = coef(e.lhs, dy, L.x, dx), B = coef(e.rhs, dx, L.y, dy), flip = false;
  if (!A || !B) { A = coef(e.rhs, dy, L.x, dx); B = coef(e.lhs, dx, L.y, dy); flip = true; }
  if (!A || !B) {
    // say what to divide by, when it separates at all: P dy = Q dx with P = a(x)b(y), Q = c(x)d(y)
    // separates by dividing by a(x)·d(y)
    const side = symbols(e.lhs).includes(dy) ? e.lhs : e.rhs, other = side === e.lhs ? e.rhs : e.lhs;
    const Pc = symbols(other).includes(dy) ? null : S(frac(side, sym(dy))), Qc = symbols(side).includes(dx) ? null : S(frac(other, sym(dx)));
    const p = Pc && !symbols(Pc).some(isDiff) ? splitXY(Pc, L.x, L.y) : null, q = Qc && !symbols(Qc).some(isDiff) ? splitXY(Qc, L.x, L.y) : null;
    if (!p || !q) return { error: `This one doesn't separate into ${L.y}s with d${L.y} and ${L.x}s with d${L.x}. Try the integrating factor (C, then f).` };
    const h = toText(S(mul([p.g, q.h])));
    if (h !== '1') return { error: `Divide both sides by ${h} first (/ then ${h}), so only ${L.y}s sit with d${L.y} and only ${L.x}s with d${L.x}.` };
    return { error: `Get only ${L.y}s with d${L.y} on one side and only ${L.x}s with d${L.x} on the other first.` };
  }
  const left = int(L.y, A), right = int(L.x, B);
  const next = flip ? eq(right, left) : eq(left, right);
  // one way only (a constant appears). ∫ A dy = ∫ B dx differentiates back to A dy = B dx, so check
  // that A dy − B dx is exactly the old equation (the coefficients were read off right)
  return checked(e, {
    eq: next, label: 'integrate both sides', hints: newHints(), factor: one, select: null, rule: 'integrate both sides', implies: true,
    check: env => [[evaluate(A!, env) * env[dy] - evaluate(B!, env) * env[dx], (flip ? -1 : 1) * (evaluate(e.lhs, env) - evaluate(e.rhs, env))]],
  });
}

/** the same equation written with y′ only, for the methods and the graph: dy/dx → y′, dy → y′, dx → 1 */
export function asPrime(e: Eq): Eq {
  const L = letters(e);
  if (!L) return e;
  // d²y/dx² → y″ first, so its dx isn't read as a loose differential
  walk(e, n => { if (isLeibniz2(n) && n.k === 'frac' && n.num.k === 'sym') e = replace(e, n.id, sym(n.num.name.slice(2) + '″')) as Eq; });
  if (!hasDifferentials(e)) return e;
  const yp = primed(L.y), dy = 'd' + L.y, dx = 'd' + L.x;
  const swap = (n: Node): Node => {
    if (isLeibniz(n) && (n.num as { name: string }).name === dy && (n.den as { name: string }).name === dx) return sym(yp);
    return n;
  };
  let r: Eq = e;
  walk(e, n => { if (isLeibniz(n)) r = replace(r, n.id, swap(n)) as Eq; });
  if (!hasDifferentials(r)) return r;
  const sub = (n: Node): Node => {
    if (n.k === 'sym' && n.name === dy) return sym(yp);
    if (n.k === 'sym' && n.name === dx) return { k: 'num', id: n.id, v: 1 } as Node;
    return n;
  };
  walk(r, n => { if (n.k === 'sym' && (n.name === dy || n.name === dx)) r = replace(r, n.id, sub(n)) as Eq; });
  return eq(S(r.lhs), S(r.rhs), relOf(r) === '=' ? undefined : relOf(r));
}

