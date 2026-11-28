// The general moves that every technique is built from (docs/specs/2026-11-20-general-moves.md):
// name a piece (b), sub a piece in from another equation, put a value into a statement that holds
// for every value, and ∫ both sides. With the facts (the derivative and integral rules, the
// theorems) these are enough for u-substitution, trig substitution, separable and linear ODEs,
// the Feynman technique, and the rest, one checked step at a time.
import { Node, Eq, Int, num, sym, add, neg, mul, frac, call, deriv, int, eq, find, findPath, replace, walk, cloneFresh, evaluate, symbols, key, relOf, isDiff, children, withChildren, Env, LETS, DEFS, CONSTS, fn, lim, holds, CALC, pow } from './ast';
import { CheckedResult, Checked, introduced, checked, isErr, solvedFor, applyBothChecked, applyMove, sampleIn, neverZero } from './moves';
import { derivative, dependsOn, substitute } from './calculus';
import { newHints, simplify } from './simplify';
import { solvedForm } from './systems';
import { parseExpr } from './parse';
import { fold } from './goals';
import { toText } from './print';
import { letters, toDifferentials, hasDifferentials, integrateDifferentials } from './leibniz';
import { splitXY } from './ode';
import { signedInf, endDepends } from './integrate';
import { expandAll } from './rewrite';
import { finishCalc } from './calcmoves';
import { fnTemplate, inverseOf, wrapNode } from './wrap';
import { nonneg } from './simplify';

const one = () => 1;
const t = (n: Node) => toText(n);
const fresh = <T extends Node>(n: T): T => { const c = cloneFresh(n); walk(c, m => { m.from = undefined; }); return c; };
const tidy = (n: Node) => simplify(n, newHints());

/** every place in n that reads the same as `what` (by shape, not by id) */
function copiesOf(n: Node, what: Node): Node[] {
  const k = key(what), out: Node[] = [];
  walk(n, m => { if (key(m) === k) out.push(m); });
  // not the ones inside another copy
  return out.filter(m => !out.some(o => o !== m && findPath(o, m.id)));
}

/** I(t) typed for a piece with no t in it: say how to make one of its numbers the t */
function notFnOf(P: Node, F: string, p: string): string {
  const nums: Node[] = [];
  walk(P, m => { if (m.k === 'num' && !isBound(P, m) && m.v !== 1 && m.v !== 0) nums.push(m); });
  return nums.length ? `${brief(P)} has no ${p} in it yet. To make the ${t(nums[0])} into ${p}, type ${F}(${t(nums[0])}), or ${F}(${p} = ${t(nums[0])}).`
    : `${brief(P)} doesn't change with ${p}, so it isn't a function of ${p}.`;
}

/** a bound of an integral (or sum) in n: the 1 in ∫₀¹ */
function isBound(n: Node, m: Node): boolean {
  let hit = false;
  walk(n, q => { if ((q.k === 'int' || q.k === 'sum') && (q.lo?.id === m.id || q.hi?.id === m.id)) hit = true; });
  return hit;
}

/** n with each node in `at` swapped for a fresh copy of what make() gives */
function swapAll(n: Node, at: Node[], make: () => Node): Node {
  const ids = new Set(at.map(m => m.id));
  const go = (m: Node): Node => {
    if (ids.has(m.id)) return make();
    const ks = children(m);
    return ks.length ? withChildren(m, ks.map(go)) : m;
  };
  return go(n);
}

const isLetterName = (s: string) => /^[a-zA-Zα-ω](?:_[a-zA-Z0-9]+)?$/.test(s) && !(s in CONSTS) && !isDiff(s);

/** a piece as text for a step's label: itself when short, else what kind of thing it is */
export function brief(n: Node): string {
  const s = t(n);
  if (s.length <= 18) return s;
  return n.k === 'int' ? 'the integral' : n.k === 'sum' ? (n.prod ? 'the product' : 'the sum') : n.k === 'lim' ? 'the limit' : n.k === 'frac' ? 'the fraction' : 'the piece';
}

export interface Named { step: Checked; def: Eq; letter: string | null; inPlace?: boolean; folded?: boolean; note?: string }

/** b: let a new letter, a function of a letter, or an expression stand for the aimed piece.
 *  - `u`: u = x² becomes an equation of its own, and x² is u here (every copy of it). Aimed at a
 *    plain number it is a parameter: t = 2, and only that 2 becomes t.
 *  - `I(t)`: I(t) = … is a definition, and the piece is I(t) here.
 *  - an expression, `sin(θ)` aimed at x: x = sin θ, and x is sin θ here. When the letter is a
 *    function (y with y′ in sight), y′ and y″ become d/dx of what you typed.
 *  taken: letters already used in the other equations. */
export function nameIt(e: Eq, sel: string | null, text: string, taken: string[] = []): Named | { error: string } {
  const P = sel && sel !== 'eq' ? find(e, sel) : null;
  if (!P || P.k === 'eq') return { error: 'Aim at the piece to name first, then press b.' };
  const src = text.trim();
  if (!src) return { error: 'Type a new letter (u), a function (I(t)), or what it equals (sin θ).' };
  const used = new Set([...symbols(e), ...taken, ...DEFS.keys()]);
  const pieceLetters = symbols(P);

  // a function at a value: I(5), or I(t = 5) to name its letter. The piece is I at 5: the 5s in it
  // become t, I(t) = that is the definition, and the piece is I(5) here
  const vm = /^([A-Za-zα-ω])\s*\(\s*(?:([a-zA-Zα-ω])\s*:?=\s*)?(.+?)\s*\)$/.exec(src);
  if (vm && !(vm[2] === undefined && /^[a-zA-Zα-ω]$/.test(vm[3]))) {
    const [, F, named, valText] = vm;
    let V: Node;
    try { V = parseExpr(valText); } catch (err) { return { error: (err as Error).message }; }
    // a function you already have: the piece is that function at whatever it says (fold)
    if (DEFS.has(F)) {
      const r = fold(e, sel, new Map([[F, DEFS.get(F)!]]));
      return isErr(r) ? { error: `${t(P)} isn't ${F} at any value: ${F}(${DEFS.get(F)!.param}) = ${brief(DEFS.get(F)!.body)}.` } : { step: r, def: eq(call(F, sym(DEFS.get(F)!.param)), fresh(DEFS.get(F)!.body), 'def'), letter: null, inPlace: false, folded: true };
    }
    // I = ∫ … with I(5) typed for the ∫: I was this at 5 all along, and the equation becomes I(t) = …
    const side = e.lhs.k === 'sym' && e.lhs.name === F && e.rhs.id === P.id ? 'rhs' : e.rhs.k === 'sym' && e.rhs.name === F && e.lhs.id === P.id ? 'lhs' : null;
    if (used.has(F) && !(side && relOf(e) === '=' && !taken.includes(F) && !symbols(P).includes(F))) return { error: `${F} is already a letter here. Pick another name for the function.` };
    const p = named ?? ['t', 's', 'a', 'k', 'λ'].find(c => !used.has(c) && !pieceLetters.includes(c));
    if (!p) return { error: `Name its letter too, like ${F}(t = ${valText}).` };
    if (pieceLetters.includes(p)) return { error: `${p} is already in ${brief(P)}. Pick another letter, like ${F}(s = ${valText}).` };
    let at = copiesOf(P, V);
    // a bound of the integral is left alone when the value also sits inside it
    const inside = at.filter(m => !isBound(P, m));
    if (inside.length) at = inside;
    if (!at.length) return { error: `There is no ${t(V)} in ${brief(P)} to turn into ${p}.` };
    const body = swapAll(P, at, () => sym(p));
    const def = eq(call(F, sym(p)), fresh(body), 'def');
    const many0 = at.length > 1 ? ` (all ${at.length} of them)` : '';
    if (side) return { step: introduced({ eq: def, label: `${F} is a function of ${p}, at ${p} = ${t(V)}`, hints: newHints(), factor: one, select: null, rule: 'name it' }, 'a definition'), def, letter: null, inPlace: true, note: `${t(V)}${many0} became ${p}; you want ${F}(${t(V)})` };
    const next = replace(e, P.id, call(F, fresh(V))) as Eq;
    const many = at.length > 1 ? ` (all ${at.length} of them)` : '';
    return { step: introduced({ eq: next, label: `let ${F}(${p}) = ${brief(body)}, at ${p} = ${t(V)}`, hints: newHints(), factor: one, select: null, rule: 'name it' }, 'a definition'), def, letter: null, note: `${t(V)}${many} became ${p}` };
  }

  // a function of a letter: I(t)
  const fm = /^([A-Za-zα-ω])\s*\(\s*([a-zA-Zα-ω])\s*\)$/.exec(src);
  if (fm) {
    const [, F, p] = fm;
    // I = ∫ … with I(t) typed for the ∫: I was a name for it all along, and now it is a function of t
    const side = e.lhs.k === 'sym' && e.lhs.name === F && e.rhs.id === P.id ? 'rhs' : e.rhs.k === 'sym' && e.rhs.name === F && e.lhs.id === P.id ? 'lhs' : null;
    if (side && relOf(e) === '=' && !taken.includes(F) && !DEFS.has(F) && !symbols(P).includes(F)) {
      if (!pieceLetters.includes(p)) return { error: notFnOf(P, F, p) };
      const def = eq(call(F, sym(p)), fresh(P), 'def');
      return { step: introduced({ eq: def, label: `${F} is a function of ${p}`, hints: newHints(), factor: one, select: null, rule: 'name it' }, 'a definition'), def, letter: null, inPlace: true };
    }
    if (used.has(F) || DEFS.has(F)) return { error: `${F} is already in use. Pick another name.` };
    if (!pieceLetters.includes(p)) return { error: notFnOf(P, F, p) };
    const I = () => call(F, sym(p));
    const next = replace(e, P.id, I()) as Eq;
    const def = eq(I(), fresh(P), 'def');
    // nothing to check by number: putting the definition back gives exactly what was there
    return { step: introduced({ eq: next, label: `let ${F}(${p}) = ${brief(P)}`, hints: newHints(), factor: one, select: null, rule: 'name it' }, 'a definition'), def, letter: null };
  }

  // a new letter
  if (isLetterName(src)) {
    if (used.has(src)) return { error: `${src} is already in use. Pick a new letter.` };
    // a plain number becomes a parameter: only the one you aimed at changes (the 2 in x², not every 2)
    const constant = pieceLetters.length === 0;
    const at = constant ? [P] : copiesOf(e, P);
    const next = swapAll(e, at, () => sym(src)) as Eq;
    const def = eq(sym(src), fresh(P));
    const step = checked(e, {
      eq: next, label: constant ? `let ${src} = ${t(P)}, a parameter` : `let ${src} = ${brief(P)}`, hints: newHints(), factor: one, select: null, rule: 'name it',
      ties: { [src]: fresh(P) },
    });
    if (isErr(step)) return step;
    return { step, def, letter: constant ? null : src };
  }

  // what it equals: x = sin θ, y = e^(rx)
  let E: Node;
  try { E = parseExpr(src); } catch (err) { return { error: (err as Error).message }; }
  if (key(E) === key(P)) return { error: 'That is the same as what is there.' };
  // the letter of a definite integral (x in ∫₀¹ … dx) is bound: the name is its own equation, and
  // the integral changes all at once when you sub in its differentials (bounds and all)
  const at = copiesOf(e, P).filter(m => !(P.k === 'sym' && boundAt(e, m, P.name)));
  if (P.k === 'sym' && !at.length) {
    const def = eq(fresh(P), fresh(E));
    return { step: introduced({ eq: e, label: `let ${t(P)} = ${brief(E)}`, hints: newHints(), factor: one, select: null, rule: 'name it' }, 'a definition'), def, letter: P.name };
  }
  let next = swapAll(e, at, () => fresh(E)) as Eq;
  const ties: Record<string, Node> = {};
  if (P.k === 'sym') {
    // y with y′, y″ in sight: they are the slopes of what y now is
    const x = letters(e)?.x ?? 'x';
    for (const [p, order] of [[P.name + '′', 1], [P.name + '″', 2]] as const) {
      if (!symbols(e).includes(p)) continue;
      const make = () => (order === 1 ? deriv(x, fresh(E)) : deriv(x, deriv(x, fresh(E))));
      const occ: Node[] = [];
      walk(next, m => { if (m.k === 'sym' && m.name === p) occ.push(m); });
      next = swapAll(next, occ, make) as Eq;
      const d1 = derivative(E, x);
      const d = order === 1 ? d1 : d1 && derivative(d1, x);
      if (!d) return { error: `I can't differentiate ${t(E)} to put in ${p}.` };
      ties[p] = d;
    }
    ties[P.name] = E;
  }
  const def = eq(fresh(P), fresh(E));
  const step = checked(e, { eq: next, label: `let ${brief(P)} = ${brief(E)}`, hints: newHints(), factor: one, select: null, rule: 'name it', ties: P.k === 'sym' ? ties : tieFrom(def) });
  if (isErr(step)) return step;
  return { step, def, letter: P.k === 'sym' ? P.name : null };
}

/** an equation as a tie: the letter it is solved for, and what that is */
function tieFrom(src: Eq): Record<string, Node> | undefined {
  const s = solvedForm(src, symbols(src));
  return s ? { [s.v]: s.expr } : undefined;
}

/* ---------- sub in ---------- */

/** the integral to change: the aimed one (or the one around the aim), else the first */
function intIn(e: Eq, sel: string | null, v?: string): Int | null {
  const path = sel && sel !== 'eq' ? findPath(e, sel) : null;
  let T = path ? ([...path].reverse().find(n => n.k === 'int') as Int | undefined) : undefined;
  if (!T) walk(e, n => { if (!T && n.k === 'int' && (!v || n.v === v)) T = n; });
  return T && (!v || T.v === v) ? T : null;
}

/** Sub in: use the equation `src` (A = B) to replace a piece of this one.
 *  - aimed at a piece that reads like one side: it becomes the other side;
 *  - a differential (du = 2x dx) with an integral in x here: dx becomes du/(2x), so the integral is in u;
 *  - else a letter src is solved for (y = 3, u = x²) is replaced by what it equals, or, when that
 *    letter isn't here, every copy of what it equals becomes the letter (x² → u). */
export function subIn(e: Eq, src: Eq, sel: string | null, name: string): CheckedResult {
  if (relOf(src) !== '=' && relOf(src) !== 'def') return { error: `${name} isn't an equation, so it says nothing to sub in.` };
  const aimed = sel && sel !== 'eq' ? find(e, sel) : null;
  if (aimed && aimed.k !== 'eq') {
    for (const [A, B] of [[src.lhs, src.rhs], [src.rhs, src.lhs]] as const) {
      if (key(aimed) !== key(A)) continue;
      const at = copiesOf(e, aimed);
      const next = swapAll(e, at, () => fresh(B)) as Eq;
      return checked(e, { eq: next, label: `sub in ${t(A)} = ${t(B)}`, hints: newHints(), factor: one, select: null, rule: 'sub in', ties: tieFrom(src) });
    }
  }
  // a differential: change the variable of an integral
  const ds = symbols(src).filter(isDiff);
  if (ds.length >= 2) {
    for (const dX of ds) {
      const T = intIn(e, sel, dX.slice(1));
      if (!T) continue;
      if (ds.length === 2) return changeVariable(e, T, src, dX, ds.find(d => d !== dX)!, name);
      // du = x da + a dx inside ∫ … dx: a is held fixed there, so da is 0. The new letter is the
      // one written inside the integral; the others are constants of it
      const inside = symbols(T.arg), rest = ds.filter(d => d !== dX);
      const neu = rest.filter(d => inside.includes(d.slice(1)));
      if (neu.length !== 1) continue;
      let fixed: Eq = src;
      for (const d of rest) if (d !== neu[0]) fixed = eq(tidy(substitute(fixed.lhs, d, num(0))), tidy(substitute(fixed.rhs, d, num(0))));
      return changeVariable(e, T, fixed, dX, neu[0], name);
    }
    return { error: `${name} is about differentials, but there is no integral in ${ds.map(d => d.slice(1)).join(' or ')} here.` };
  }
  const here = symbols(e);
  // a name for the letter an integral runs over (x = e^u, u = x² with ∫ … dx here): x lives only
  // inside the integral, so sub in goes through the differentials of the name, bounds and all
  const lets = symbols(src).filter(w => !here.includes(w));
  for (const X of lets) {
    const T = intIn(e, sel, X);
    const W = symbols(src).filter(w => w !== X);
    if (!T || W.length !== 1 || here.includes(W[0])) continue;
    const d = differentialsBoth(src);
    if (isErr(d)) return d;
    const g = solvedForm(src, W)?.expr, h = solvedForm(src, [X])?.expr;
    return changeVariable(e, T, d.eq, 'd' + X, 'd' + W[0], name, { g, h });
  }
  // neither side a lone letter (I(0) = 0, f(2) = 5): a side that is here becomes the other side
  if (src.lhs.k !== 'sym' && src.rhs.k !== 'sym') {
    for (const [A, B] of [[src.lhs, src.rhs], [src.rhs, src.lhs]] as const) {
      const at = A.k === 'num' ? [] : copiesOf(e, A);
      if (!at.length) continue;
      const next = swapAll(e, at, () => fresh(B)) as Eq;
      return checked(e, { eq: next, label: `sub in ${t(A)} = ${t(B)}`, hints: newHints(), factor: one, select: null, rule: 'sub in', ties: tieFrom(src) });
    }
  }
  const L = solvedFor(src);
  const letter = L ?? (src.lhs.k === 'sym' ? src.lhs.name : src.rhs.k === 'sym' ? src.rhs.name : null);
  if (letter) {
    const other = src.lhs.k === 'sym' && src.lhs.name === letter ? src.rhs : src.lhs;
    // the letter is here: put in what it equals
    if (here.includes(letter)) {
      const occ: Node[] = [];
      walk(e, m => { if (m.k === 'sym' && m.name === letter) occ.push(m); });
      const free = occ.filter(m => !boundAt(e, m, letter));
      const next = swapAll(e, free, () => fresh(other)) as Eq;
      return checked(e, { eq: next, label: `sub in ${letter} = ${t(other)}`, hints: newHints(), factor: one, select: null, rule: 'sub in', ties: { [letter]: other } });
    }
    // what it equals is here: that becomes the letter
    const at = other.k === 'num' ? [] : copiesOf(e, other);
    if (at.length) {
      const next = swapAll(e, at, () => sym(letter)) as Eq;
      return checked(e, { eq: next, label: `sub in ${t(other)} = ${letter}`, hints: newHints(), factor: one, select: null, rule: 'sub in', ties: { [letter]: other } });
    }
  }
  // neither side is a lone letter: solve it for a letter this equation shares (the old way)
  const shared = here.filter(v => symbols(src).includes(v));
  if (!shared.length) return { error: `${name} shares nothing with this equation. Aim at the piece to replace.` };
  const sf = solvedForm(src, shared);
  if (!sf) return { error: `Couldn't solve ${name} for ${shared.join(' or ')} to sub it in.` };
  const occ: Node[] = [];
  walk(e, m => { if (m.k === 'sym' && m.name === sf.v && !boundAt(e, m, sf.v)) occ.push(m); });
  const next = swapAll(e, occ, () => fresh(sf.expr)) as Eq;
  return checked(e, { eq: next, label: `sub in ${sf.v} = ${t(sf.expr)}`, hints: newHints(), factor: one, select: null, rule: 'sub in', ties: { [sf.v]: sf.expr } });
}

/** does src say anything about this equation: a shared letter, the letter an integral here runs
 *  over, or one of its sides written here (I(0), f(2), sin θ) */
export function appearsIn(e: Eq, src: Eq): boolean {
  const here = new Set(symbols(e));
  walk(e, n => { if (n.k === 'int') here.add(n.v); });
  if (symbols(src).some(v => here.has(v))) return true;
  return [src.lhs, src.rhs].some(A => A.k !== 'num' && copiesOf(e, A).length > 0);
}

/** is this occurrence of v bound by a definite integral, sum or limit around it? */
function boundAt(e: Eq, m: Node, v: string): boolean {
  const path = findPath(e, m.id) ?? [];
  return path.some(n => n !== m && ((n.k === 'int' && n.lo) || n.k === 'sum' || n.k === 'lim' || n.k === 'at') && (n as { v: string }).v === v);
}

/** ∫ f dX with a·dX = b·dW (from differentiating a name): dX = (b/a) dW, so ∫ f·(b/a) dW.
 *  Bounds move with the name when the new letter is named from the old (u = g(x): g(lo), g(hi)). */
/** n with the letter x gone, when n doesn't change with x at all (sampled): x set to a value where n
 *  is defined. null when it does change with x */
function without(n: Node, x: string): Node | null {
  const others = symbols(n).filter(v => v !== x);
  const at = (env: Record<string, number>, xv: number) => evaluate(n, { ...env, [x]: xv });
  let seen = 0;
  for (let i = 0; i < 12; i++) {
    const env: Record<string, number> = {};
    for (const v of others) env[v] = 0.3 + 2.7 * ((i * 0.618 + others.indexOf(v) * 0.29) % 1);
    const a = at(env, 0.37 + i * 0.41), b = at(env, -1.9 + i * 0.73);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.abs(a - b) > 1e-9 * (1 + Math.abs(a))) return null;
    seen++;
  }
  if (seen < 6) return null;
  for (const v of [0, 1, 2, 3]) {
    const m = tidy(substitute(cloneFresh(n), x, num(v)));
    if (Number.isFinite(evaluate(m, Object.fromEntries(others.map(o => [o, 1.3]))))) return m;
  }
  return null;
}

function changeVariable(e: Eq, T: Int, src: Eq, dX: string, dW: string, name: string, named: { g?: Node; h?: Node } = {}): CheckedResult {
  const X = dX.slice(1), W = dW.slice(1);
  // src is linear in the two differentials: lhs − rhs = A·dX + B·dW
  const D = add([cloneFresh(src.lhs), neg(cloneFresh(src.rhs))]);
  const A = derivative(D, dX), B = derivative(D, dW);
  if (!A || !B || dependsOn(A, dX) || dependsOn(A, dW) || dependsOn(B, dX) || dependsOn(B, dW)) return { error: `${name} isn't of the form du = … dx.` };
  // dX = −(B/A) dW
  const ratio = tidy(frac(mul([num(-1), cloneFresh(B)]), cloneFresh(A)));
  if (symbols(ratio).some(isDiff)) return { error: `${name} isn't of the form du = … dx.` };
  let integrand = tidy(mul([fresh(T.arg), ratio]));
  // a name typed as its own equation (x = e^u, u = x²): the integral is written all in the new letter
  if (named.g || named.h) {
    const body = named.g ? swapAll(T.arg, copiesOf(T.arg, named.g), () => sym(W)) : T.arg;
    integrand = tidy(mul([fresh(body), cloneFresh(ratio)]));
    if (dependsOn(integrand, X) && named.h) integrand = tidy(substitute(integrand, X, named.h));
    if (dependsOn(integrand, X)) return { error: `Couldn't write the integral all in ${W}: ${X} is left over. Name ${W} the other way round (${X} = …${W}…).` };
  }
  // what is left of the old letter often cancels ((x + 1)/(2x + 2) after du = (2x + 2) dx): when the
  // integrand doesn't change with it at all, any value of it gives the same, and it is all in the new one
  if (dependsOn(integrand, X)) { const flat = without(integrand, X); if (flat) integrand = flat; }

  let lo: Node | undefined, hi: Node | undefined;
  if (T.lo && T.hi) {
    const g = named.g ?? LETS.get(W), h = named.h ?? LETS.get(X);
    if (g) { lo = tidy(substitute(cloneFresh(g), X, T.lo)); hi = tidy(substitute(cloneFresh(g), X, T.hi)); }
    else if (h) {
      // x = sin θ: the new bounds are the θ that give the old ones (θ = sin⁻¹ of each)
      lo = invert(h, W, T.lo) ?? undefined; hi = invert(h, W, T.hi) ?? undefined;
      if (!lo || !hi) return { error: `Couldn't work out which ${W} gives ${X} = ${t(T.lo)} and ${t(T.hi)}. Work out the integral first and put ${X} back.` };
    }
    else return { error: `To change the bounds too, name ${W} from ${X} (like ${W} = …${X}…), or work out the integral first and put ${X} back.` };
    // a bound the name sends off to infinity (u = ln x at x = 0): the limit from inside, written ∞
    const a = evaluate(T.lo, {}), b = evaluate(T.hi, {});
    // With other letters in the name (u = ax), where it goes can depend on them: the limit is tried
    // at values each letter may take (its domain); one answer for all of them, or say what decides it
    const params = g ? symbols(g).filter(p => p !== X) : [];
    let unsure: string | null = null;
    const edge = (n: Node, at: Node, side: '+' | '-'): Node => {
      if (!g || !Number.isNaN(evaluate(n, {}))) return n;
      const L = lim(X, cloneFresh(at), cloneFresh(g), side);
      if (!params.length) { const v = evaluate(L, {}); return v === Infinity ? sym('∞') : v === -Infinity ? neg(sym('∞')) : n; }
      const s = signedInf(L, i => Object.fromEntries(params.map(p => [p, sampleIn(p, i)])));
      if (s === 'depends') unsure = endDepends(n, undefined, W, g) ?? `${W} = ${t(g)} heads to ∞ or −∞ depending on the sign of ${params.join(', ')}. Click ${params[0]} in the letters on the left and choose positive, then sub in again.`;
      return s && s !== 'depends' ? s : n;
    };
    lo = edge(lo!, T.lo, a < b ? '+' : '-'); hi = edge(hi!, T.hi, a < b ? '-' : '+');
    if (unsure) return { error: unsure };
  }
  const next = replace(e, T.id, int(W, integrand, lo, hi)) as Eq;
  const label = `sub in d${X} = ${t(tidy(ratio))} d${W}`;
  const g = named.g ?? LETS.get(W), h = named.h ?? LETS.get(X);
  // definite: the values match once the name is read back in (u = x² inside ∫ … dx)
  // a typed name: the values match, or, where the integral has no value, the rule holds at each point
  if (lo && hi && (named.g || named.h)) {
    const value = (env: Env): [number, number][] => { const a = evaluate(next, env), b = evaluate(e, env); return Number.isFinite(a) && Number.isFinite(b) ? [[a, b]] : check(env); };
    return checked(e, { eq: next, label, hints: newHints(), factor: one, select: null, rule: 'sub in', check: value });
  }
  if (lo && hi) {
    const r = g ? checked(e, { eq: next, label, hints: newHints(), factor: one, select: null, rule: 'sub in', ties: { [W]: g } })
      // x = h(θ): the new integral, with x read as h(θ), has the old one's value
      : (() => { const after = substitute(next, X, h!) as Eq; return checked(e, { eq: next, label, hints: newHints(), factor: one, select: null, rule: 'sub in', check: env => [[evaluate(after, env), evaluate(e, env)]] }); })();
    // an integral with no value (it diverges) can't be compared by value: the rule itself still
    // holds, f(x) dx = g(u) du at every point, and the bounds were read off the name
    const at: Env = {};
    symbols(T).forEach(w => { at[w] = 0.737; });
    if (!isErr(r) || Number.isFinite(evaluate(T, at))) return r;
  }
  // indefinite: the integrands, read with the name, match: f(x) dx = g(u) du
  function check(env: Env): [number, number][] {
    const at: Env = { ...env };
    // the old letter may be gone from both sides (∫ cos(u) dx with u = 3x): any value of it will do,
    // since the other letter is read off it
    const seed = Object.values(env)[0] ?? 0.53;
    if (g) { if (!(X in at)) at[X] = 0.3 + 0.7 * seed; at[W] = evaluate(g, at); }
    else if (h) { if (!(W in at)) at[W] = 0.3 + 0.7 * seed; at[X] = evaluate(h, at); }
    else return [[NaN, NaN]];
    // dX/dW along the name, the number the ratio should be
    const slope = g ? 1 / evaluate(derivative(g, X) ?? num(NaN), at) : evaluate(derivative(h!, W) ?? num(NaN), at);
    return [[evaluate(integrand, at), evaluate(T.arg, at) * slope], [evaluate(ratio, at), slope]];
  }
  return checked(e, { eq: next, label, hints: newHints(), factor: one, select: null, rule: 'sub in', check });
}

/** the w with h(w) = value, peeling h one layer at a time: + c, × c, sin, cos, tan (principal values) */
function invert(h: Node, w: string, value: Node): Node | null {
  let f = h, v: Node = cloneFresh(value);
  for (let i = 0; i < 8; i++) {
    if (f.k === 'sym' && f.name === w) return tidy(v);
    if (f.k === 'add') {
      const keep = f.terms.filter(x => dependsOn(x, w)), rest = f.terms.filter(x => !dependsOn(x, w));
      if (keep.length !== 1) return null;
      v = add([v, ...rest.map(x => neg(cloneFresh(x)))]); f = keep[0]; continue;
    }
    if (f.k === 'mul') {
      const keep = f.factors.filter(x => dependsOn(x, w)), rest = f.factors.filter(x => !dependsOn(x, w));
      if (keep.length !== 1) return null;
      v = frac(v, mul(rest.map(x => cloneFresh(x)))); f = keep[0]; continue;
    }
    if (f.k === 'fn' && (f.name === 'sin' || f.name === 'cos' || f.name === 'tan')) { v = fn(('a' + f.name) as 'asin', tidy(v)); f = f.arg; continue; }
    return null;
  }
  return null;
}

/* ---------- put in a value ---------- */

/** p: a statement that holds for every value of v (a definition, or one about a function such as
 *  I(t) = ln(t + 1) + C) at v = a, as an equation of its own. */
export function putValue(e: Eq, v: string, text: string): Eq | { error: string } {
  // typed however it comes: 0, t = 0, t := 0, or several at once (a = 1, b = 2)
  const parts = valueParts(text, v);
  if ('error' in parts) return parts;
  if (parts.length > 1) {
    let cur: Eq | { error: string } = e;
    for (const [w, t] of parts) { cur = putValue(cur as Eq, w, t); if ('error' in cur) return cur; }
    return cur;
  }
  [[v, text]] = parts;
  let a: Node;
  try { a = parseExpr(text); } catch (err) { return { error: (err as Error).message }; }
  // a rate (dx/dt = 2): every dx/dt here is that value
  const r = /^(d.+)\/(d.+)$/.exec(v);
  if (r) {
    const isRate = (n: Node) => n.k === 'frac' && n.num.k === 'sym' && n.num.name === r[1] && n.den.k === 'sym' && n.den.name === r[2];
    let seen = false;
    walk(e, n => { if (isRate(n)) seen = true; });
    if (!seen) return { error: `There is no ${v} here to put a value in for.` };
    if (!holdsForEvery(e, v)) return { error: `This says which ${v} works, so a value can't just be put in.` };
    const swap = (n: Node): Node => (isRate(n) ? cloneFresh(a) : withChildren(n, children(n).map(swap)));
    const out = swap(e) as Eq;
    return eq(out.lhs, out.rhs);
  }
  if (!symbols(e).includes(v)) return { error: `There is no ${v} here to put a value in for.` };
  if (!holdsForEvery(e, v)) return { error: `This says which ${v} works, not something true for every ${v}, so a value can't just be put in. To check a value, press e.` };
  const next = substitute(e, v, a) as Eq;
  // A/x at x = 0 is not a value of anything: say which bottom it zeroes instead of giving A/0
  let zero: Node | null = null;
  walk(e, n => { if (!zero && n.k === 'frac' && symbols(n.den).includes(v)) { const d = substitute(n.den, v, a); if (!symbols(d).length && evaluate(d, {}) === 0) zero = n.den; } });
  if (zero) return { error: `${v} = ${toText(a)} makes ${toText(zero)} 0, and it is on a bottom here. Multiply it out first, or pick another value.` };
  return eq(next.lhs, next.rhs);
}

/** p on an equation that says which v works (x² = 4): trying a value checks it, nothing more.
 *  The verdict, with what each side comes to */
export function tryValue(e: Eq, v: string, text: string): { text: string; holds: boolean | null } | { error: string } {
  const parts = valueParts(text, v);
  if ('error' in parts) return parts;
  const env: Env = {};
  let cur: Node = e;
  for (const [w, t] of parts) {
    let a: Node;
    try { a = parseExpr(t); } catch (err) { return { error: (err as Error).message }; }
    if (!symbols(cur).includes(w)) return { error: `There is no ${w} here to put a value in for.` };
    cur = substitute(cur, w, a);
    env[w] = evaluate(a, {});
    if (!symbols(a).length && !Number.isFinite(env[w])) return { error: `${toText(a)} isn’t a real number, so there is nothing to try for ${w}.` };
  }
  const left = symbols(cur);
  const shown = parts.map(([w, t]) => `${w} = ${t.trim()}`).join(', ');
  if (left.length) return { error: `${shown} still leaves ${left.join(', ')}: put in a value for ${left.length > 1 ? 'each' : 'it'} too (a = 1, b = 2).` };
  const ok = holds(e, env);
  const r = cur as Eq;
  const side = (n: Node) => { const x = evaluate(n, {}); return Number.isFinite(x) ? String(Math.round(x * 1e6) / 1e6) : null; };
  const [L, R] = [side(r.lhs), side(r.rhs)];
  if (L === null || R === null) return { text: `${shown}: the ${L === null && R === null ? 'two sides have' : L === null ? 'left side has' : 'right side has'} no value there, so it is not a solution`, holds: null };
  return { text: `${shown}: ${L} ${relOf(e)} ${R}, ${ok === null ? 'no value there' : ok ? 'true, it works' : 'false, it doesn’t'}`, holds: ok };
}

/** what was typed into p, as letter and value pairs: "0" is a value of v, "t = 0" names its letter */
export function valueParts(text: string, v: string): [string, string][] | { error: string } {
  const out: [string, string][] = [];
  for (const piece of text.split(/[,;]/)) {
    const m = /^\s*(d[A-Za-zα-ω]\s*\/\s*d[A-Za-zα-ω]|[A-Za-zα-ωΑ-Ω](?:_\w+)?)\s*(?::=|=|→|->)\s*(.*)$/.exec(piece);
    if (m) out.push([m[1].replace(/\s+/g, ''), m[2]]);
    else if (piece.trim()) out.push([v, piece]);
  }
  if (!out.length || out.some(([, t]) => !t.trim())) return { error: 'Type a value, like 0 or t = 0.' };
  return out;
}

/** a definition, an equation about a function of v (I(t) = …), or a relation between v and other
 *  letters: something to put a value of v into */
export function holdsForEvery(e: Eq, v: string): boolean {
  if (relOf(e) === 'def' || relOf(e) === '≟') return true;
  // a relation with other letters (1 = A(x + 1) + B(x − 1), x² + y² = 25): what follows at a value
  // of v is a consequence (⇒), not a claim that v is that value
  if (relOf(e) === '=' && symbols(e).some(w => w !== v && w !== 'C' && !isDiff(w))) return true;
  // a rate is an unknown too (2·3 dx/dt + 2y dy/dt = 0 at x = 3): related rates put values in one by one
  let rate = false;
  walk(e, n => { if (n.k === 'frac' && n.num.k === 'sym' && n.den.k === 'sym' && isDiff(n.num.name) && isDiff(n.den.name) && n.num.name !== `d${v}`) rate = true; });
  if (relOf(e) === '=' && rate) return true;
  // about a function of v: one with no definition (I(t) = … while I is unknown) holds for every t;
  // one you defined (f(x) = 7 with f(x) = 2x + 3) only when the sides really agree everywhere
  let unknown = false, known = false;
  walk(e, n => { if (n.k === 'call' && symbols(n.arg).includes(v)) { if (DEFS.has(n.name) || CALC.primeDef(n.name)) known = true; else unknown = true; } });
  return unknown || (known && sameEverywhere(e, v));
}

/** both sides agree at every value of v tried (numerically, with room for integrals worked out by
 *  number). With a constant C in it (I(t) = ln|t + 1| + C), agreeing up to that constant is enough:
 *  some C makes it true for every t. */
export function sameEverywhere(e: Eq, v: string): boolean {
  if (!symbols(e).includes(v)) return false;
  const withC = v !== 'C' && symbols(e).includes('C');
  let hits = 0, gap: number | null = null;
  for (let i = 0; i < 12; i++) {
    const env: Env = {};
    // only v moves; the other letters stay put (y = x + C is not true for every x)
    symbols(e).forEach((w, j) => (env[w] = w === v ? 0.3 + 0.37 * i : w === 'C' && withC ? 0 : 0.41 + 0.23 * j));
    const a = evaluate(e.lhs, env), b = evaluate(e.rhs, env);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const d = withC ? a - b - (gap ??= a - b) : a - b;
    if (Math.abs(d) > 1e-6 * (1 + Math.abs(a) + Math.abs(b))) return false;
    hits++;
  }
  return hits >= 6;
}

/** the letter to put a value in for: aimed, else the argument of a function here, else the only one */
export function valueVar(e: Eq, sel: string | null): string | null {
  const aimed = sel && sel !== 'eq' ? find(e, sel) : null;
  if (aimed?.k === 'sym' && symbols(e).includes(aimed.name)) return aimed.name;
  let v: string | null = null;
  walk(e, n => { if (!v && n.k === 'call' && n.arg.k === 'sym') v = n.arg.name; });
  if (v) return v;
  if (relOf(e) === 'def' && e.lhs.k === 'call' && e.lhs.arg.k === 'sym') return e.lhs.arg.name;
  const vs = symbols(e).filter(w => w !== 'C');
  return vs.length === 1 ? vs[0] : null;
}

/* ---------- ∫ both sides ---------- */

/** C + i on an equation: ∫ … dv of both sides. One constant comes in when the last integral is done. */
export function integrateBoth(e: Eq, v: string): CheckedResult {
  // a definition is an equation too (I(t) = …): what follows from it is an ordinary one
  if (relOf(e) === 'def') e = eq(e.lhs, e.rhs);
  if (relOf(e) !== '=') return { error: 'Integrate both sides of an equation (=).' };
  // already in differentials (dy/y = x dx): each side carries its own d
  if (hasDifferentials(e)) return integrateDifferentials(e);
  // integrating is about how the sides change with v, so they must agree for every v (an identity, or an
  // equation about y(x) or other letters); one solved by particular values (eˣ = 3) says nothing about
  // the areas under its sides
  if (!holdsForEvery(e, v) && !sameEverywhere(e, v)) return { error: `This holds only at some ${v} (it is solved by particular values), so ∫ of both sides doesn't follow from it. ∫ both sides is for an equation true for every ${v}, like y′ = 2${v}.` };
  const next = eq(int(v, cloneFresh(e.lhs)), int(v, cloneFresh(e.rhs)));
  // the new sides' slope in v is what the old sides were
  const slope = derivative(add([next.lhs, neg(next.rhs)]), v);
  if (!slope) return { error: 'There is no rule for something in here yet.' };
  return checked(e, { eq: next, label: `∫ both sides d${v}`, hints: newHints(), factor: one, select: null, rule: 'integrate both sides', implies: true, check: env => [[evaluate(slope, env), evaluate(e, env)]] });
}

/** the letter to integrate or differentiate both sides by: aimed, else the variable of a function
 *  here (t in I′(t)), else x, else the only letter */
export function bothVar(e: Eq, sel: string | null): string | null {
  const aimed = sel && sel !== 'eq' ? find(e, sel) : null;
  if (aimed?.k === 'sym' && !isDiff(aimed.name)) return aimed.name;
  let v: string | null = null;
  walk(e, n => { if (!v && n.k === 'call' && n.arg.k === 'sym') v = n.arg.name; });
  if (v) return v;
  const l = letters(e);
  if (l) return l.x;
  const vs = symbols(e).filter(w => w !== 'C' && !w.endsWith('′'));
  return vs.includes('x') ? 'x' : vs.includes('t') ? 't' : vs[0] ?? null;
}

/* ---------- differentials of both sides ---------- */

/** d of both sides as differentials: u = x² gives du = 2x dx, x = sin θ gives dx = cos θ dθ,
 *  x² + y² = 1 gives 2x dx + 2y dy = 0. Every letter on a side brings its own d. */
export function differentialsBoth(e: Eq): CheckedResult {
  if (relOf(e) !== '=' && relOf(e) !== 'def') return { error: 'Take the differential of both sides of an equation (=).' };
  if (symbols(e).some(isDiff)) return { error: 'This is already in differentials.' };
  const vars = (n: Node) => symbols(n).filter(w => w !== 'C' && !w.endsWith('′'));
  const dOf = (n: Node): Node | null => {
    const parts: Node[] = [];
    for (const w of vars(n)) {
      const p = derivative(n, w);
      if (!p) return null;
      const pt = tidy(p);
      if (pt.k === 'num' && pt.v === 0) continue;
      parts.push(pt.k === 'num' && pt.v === 1 ? sym('d' + w) : mul([pt, sym('d' + w)]));
    }
    return parts.length === 0 ? num(0) : parts.length === 1 ? parts[0] : add(parts);
  };
  const L = dOf(e.lhs), R = dOf(e.rhs);
  if (!L || !R) return { error: 'There is no derivative rule for something in here yet.' };
  // a derivative can share pieces with what it came from (−e^(−x) and e^(−x)): fresh ids for all
  const next = cloneFresh(eq(tidy(L), tidy(R)));
  const F = add([cloneFresh(e.lhs), neg(cloneFresh(e.rhs))]);
  const ws = vars(F);
  const dF = ws.map(w => derivative(F, w));
  if (dF.some(d => !d)) return { error: 'There is no derivative rule for something in here yet.' };
  return checked(e, {
    eq: next, label: 'differentials of both sides', hints: newHints(), factor: one, select: null, rule: 'differentiate both sides', implies: true,
    check: env => [[evaluate(next, env), ws.reduce((s, w, i) => s + evaluate(dF[i]!, env) * (env['d' + w] ?? NaN), 0)]],
  });
}

/* ---------- shortcuts, as chains of the moves above ---------- */

/** separate the variables: write it in differentials, divide by the y part, tidy */
export function separateChain(e: Eq, y: string, x: string): Checked[] | { error: string } {
  const d = toDifferentials(e);
  if (isErr(d)) return d;
  const steps: Checked[] = [d];
  const dy = 'd' + y, dx = 'd' + x;
  const R = d.eq.lhs.k === 'sym' && d.eq.lhs.name === dy ? d.eq.rhs : d.eq.lhs;
  const without = simplify(frac(cloneFresh(R), sym(dx)), newHints());
  const p = splitXY(without, x, y);
  if (!p) return { error: `This doesn't split into (something in ${x}) × (something in ${y}). Try the integrating factor (C + f).` };
  if (!(p.h.k === 'num' && p.h.v === 1)) {
    // 1/y² is cleared by × y², anything else by ÷ it
    const h = p.h;
    const r = h.k === 'frac' && h.num.k === 'num' && h.num.v === 1 ? applyBothChecked(d.eq, '* (' + toText(h.den) + ')') : applyBothChecked(d.eq, '/ (' + toText(h) + ')');
    if (isErr(r)) return r;
    steps.push(r);
    const s = applyMove('simplify', r.eq, null);
    if (!isErr(s)) steps.push({ ...s, label: 'simplify' });
  }
  return steps;
}

/** try y = e^(rx): name y, work out the slopes, take e^(rx) out, divide it away (it is never 0) */
export function characteristicChain(e: Eq, y: string): Checked[] | { error: string } {
  let yId: string | null = null;
  walk(e, n => { if (!yId && n.k === 'sym' && n.name === y) yId = n.id; });
  if (!yId) return { error: `There is no ${y} on its own here to try e^(rx) for.` };
  const x = letters(e)?.x ?? 'x';
  const r = symbols(e).includes('r') ? 'm' : 'r';
  const n = nameIt(e, yId, `e^(${r}${x})`);
  if ('error' in n) return n;
  const steps: Checked[] = [n.step];
  let cur = n.step.eq;
  const fc = finishCalc(cur);
  if (fc.stuck) return { error: fc.stuck };
  steps.push(...fc.steps);
  cur = fc.steps.length ? fc.steps[fc.steps.length - 1].eq : cur;
  const t0 = applyMove('simplify', cur, null);
  if (!isErr(t0)) { steps.push({ ...t0, label: 'simplify' }); cur = t0.eq; }
  const f = applyMove('factor', cur, null);
  if (isErr(f)) return f;
  steps.push(f);
  cur = f.eq;
  // the e^(rx) factor of the side that holds it
  let E: string | null = null;
  walk(cur, m => { if (!E && m.k === 'pow' && m.base.k === 'sym' && m.base.name === 'e' && symbols(m.exp).includes(r)) E = m.id; });
  if (E) {
    const dv = applyMove('divide', cur, E);
    if (!isErr(dv)) {
      steps.push(dv);
      const s = applyMove('simplify', dv.eq, null);
      if (!isErr(s)) steps.push({ ...s, label: 'simplify' });
    }
  }
  return steps;
}

/* ---------- multiply by 1 ---------- */

/** Tab m: the aimed piece times A/A, which is 1. On a fraction A goes on top and below, each
 *  multiplied out (1/(1 + eˣ) with e⁻ˣ is e⁻ˣ/(e⁻ˣ + 1), ready for u = e⁻ˣ + 1); on anything
 *  else the piece becomes (piece·A)/A. Rationalizing and the conjugate trick are this move. */
export function timesOne(e: Eq, sel: string | null, text: string): CheckedResult {
  let A: Node;
  try { A = parseExpr(text); } catch (err) { return { error: (err as Error).message }; }
  const T = sel && sel !== 'eq' ? find(e, sel) : null;
  if (!T || T.k === 'eq') return { error: 'Aim at the piece to multiply by 1.' };
  if (A.k === 'num' && A.v === 0) return { error: '0/0 is not 1: pick something that is never 0.' };
  const h = newHints();
  const times = (n: Node) => simplify(expandAll(mul([cloneFresh(n), cloneFresh(A)]), h), h);
  const next = T.k === 'frac' ? frac(times(T.num), times(T.den)) : frac(mul([cloneFresh(T), cloneFresh(A)]), cloneFresh(A));
  const shown = A.k === 'add' ? `(${toText(A)})` : toText(A);
  return checked(e, { eq: replace(e, T.id, next) as Eq, label: `× ${shown}/${shown}, which is 1`, hints: h, factor: () => 1, select: next.id, rule: 'multiply by 1', conditions: symbols(A).length ? [`${toText(A)} ≠ 0`] : [] });
}

/* ---------- doing nothing ---------- */

/** where a piece is defined, for each function in it that holds the aimed piece T: ln and log need
 *  > 0, √ and even roots ≥ 0, sin⁻¹ and cos⁻¹ between −1 and 1 */
function definedWhere(n: Node, T: Node): string[] {
  const out: string[] = [];
  const holds = (m: Node) => { let h = false; walk(m, c => { if (c === T) h = true; }); return h; };
  walk(n, m => {
    if (!holds(m) || m === T) return;
    const a = m.k === 'fn' || m.k === 'sqrt' ? m.arg : m.k === 'pow' ? m.base : null;
    if (!a || !holds(a)) return;
    const s = toText(a);
    if (m.k === 'fn' && (m.name === 'ln' || m.name === 'log')) { if (!(nonneg(a) && neverZero(a))) out.push(`${s} > 0`); }
    else if (m.k === 'sqrt' && !nonneg(a)) out.push(`${s} ≥ 0`);
    else if (m.k === 'fn' && (m.name === 'asin' || m.name === 'acos')) out.push(`−1 ≤ ${s} ≤ 1`);
    else if (m.k === 'pow' && !nonneg(a)) {
      const k = evaluate(m.exp, {});
      // a root of even order (^(1/2), ^(1/4)) needs the base ≥ 0
      if (Number.isFinite(k) && !Number.isInteger(k) && Number.isInteger(1 / k) && (1 / k) % 2 === 0) out.push(`${s} ≥ 0`);
    }
  });
  return [...new Set(out)];
}

/** Tab's box: do something to the aimed piece and undo it, in one checked step ("doing nothing",
 *  user 2026-11-28): + n gives T + n − n, × 2 gives (T·2)/2, ÷ 2 gives T/2 · 2, ^2 gives (T²)^½,
 *  a function gives its inverse of it (e^(ln T)), or it of its inverse where only that way holds
 *  (sin(sin⁻¹ T)). Anything else typed is the form to rewrite T as. */
export function doNothing(e: Eq, sel: string | null, text: string): CheckedResult {
  const T = sel && sel !== 'eq' ? find(e, sel) : relOf(e) === 'expr' ? e.lhs : null;
  if (!T || T.k === 'eq') return { error: 'Aim at a piece first, then type what to do to it and undo: + n, × 2, ^2, ln.' };
  const src = text.trim();
  if (!src) return { error: `Type what to do to ${toText(T)} and undo: + n, × 2, ^2, ln. Or a form to rewrite it as.` };
  const op = /^([+\-−*×·/÷^])\s*(.*)$/.exec(src);
  const parsed = (s: string): Node | { error: string } => { try { return parseExpr(s); } catch (err) { return { error: (err as Error).message }; } };
  const go = (next: Node, label: string, conditions: string[] = [], where = (_: Env) => true): CheckedResult => checked(e, {
    eq: replace(e, T.id, next) as Eq, label, rule: 'do nothing', hints: newHints(), factor: () => 1, select: next.id, conditions,
    // checked where the new form is defined (and where the conditions hold); the conditions say where that is
    check: conditions.length ? env => { const a = evaluate(next, env); return Number.isFinite(a) && where(env) ? [[a, evaluate(T, env)]] : [[NaN, NaN]]; } : undefined,
  });
  if (op) {
    const A = parsed(op[2]);
    if ('error' in A) return A;
    const s = A.k === 'add' ? `(${toText(A)})` : toText(A);
    const zero = A.k === 'num' && A.v === 0;
    switch (op[1]) {
      case '+': return go(add([...(T.k === 'add' ? T.terms : [T]), A, neg(cloneFresh(A))], T.k === 'add' ? T.id : undefined), `+ ${s} − ${s}, which is 0`);
      case '-': case '−': return go(add([...(T.k === 'add' ? T.terms : [T]), neg(A), cloneFresh(A)], T.k === 'add' ? T.id : undefined), `− ${s} + ${s}, which is 0`);
      case '*': case '×': case '·':
        if (zero) return { error: '0/0 is not 1: pick something that is never 0.' };
        // on a fraction A goes on top and below, each multiplied out (Tab m as it always was)
        if (T.k === 'frac') return timesOne(e, T.id, op[2]);
        return go(frac(mul([T, A]), cloneFresh(A)), `× ${s}/${s}, which is 1`, symbols(A).length ? [`${toText(A)} ≠ 0`] : []);
      case '/': case '÷':
        if (zero) return { error: 'Dividing by 0 can’t be undone: pick something that is never 0.' };
        return go(mul([frac(T, A), cloneFresh(A)]), `÷ ${s} × ${s}, which is 1`, symbols(A).length ? [`${toText(A)} ≠ 0`] : []);
      case '^': {
        if (zero) return { error: 'A power of 0 is 1 whatever it was, so it can’t be undone.' };
        const next = pow(pow(T, A), frac(num(1), cloneFresh(A)));
        // an even power forgets the sign: (T²)^½ is |T|, so it is T only where T ≥ 0
        const k = evaluate(A, {});
        const even = !(Number.isInteger(k) && k % 2 !== 0) && !nonneg(T);
        const cs = even ? [...new Set([`${toText(T)} ≥ 0`, ...definedWhere(next, T)])] : definedWhere(next, T);
        return go(next, `to the ${s}, then the ${s} root`, cs, even ? env => evaluate(T, env) >= 0 : undefined);
      }
    }
  }
  // a function: f then its inverse, or the inverse then f where only that way gives T back
  const F = /^(=|[(\d])/.test(src) ? null : fnTemplate(src);
  if (F && !('error' in F)) {
    const put = (x: Node, G: Node) => { const go2 = (m: Node): Node => (m.k === 'sym' && m.name === '□' ? x : withChildren(m, children(m).map(go2))); return go2(cloneFresh(G)); };
    const inv = inverseOf(put(sym('x'), F));
    if (!inv) return { error: `${src} has no inverse to undo it with here.` };
    const G = wrapNode(sym('□'), inv.f, inv.arg ?? num(2));
    for (const next of [put(put(T, F), G), put(put(T, G), F)]) {
      const r = go(next, `${toText(put(sym('□'), F))} and back`, definedWhere(next, T));
      if (!isErr(r)) return r;
    }
    return { error: `${src} and its inverse don’t give ${toText(T)} back here.` };
  }
  return rewriteAs(e, sel, src.replace(/^=\s*/, ''));
}

/** Tab + =: the aimed piece rewritten as the form you type (x² − 1 as (x − 1)(x + 1)), kept only if
 *  it is equal. Pieces you wrote again keep their identity, so they stay put and the rest moves. */
export function rewriteAs(e: Eq, at: string | null, text: string): CheckedResult {
  const target = at && at !== 'eq' ? find(e, at) : relOf(e) === 'expr' ? e.lhs : null;
  if (!target) return { error: 'Aim at the piece to rewrite first (i types over the whole line).' };
  if (!text.trim()) return { error: `Type the form you want for ${toText(target)}.` };
  let n: Node;
  try { n = parseExpr(text); } catch (err) { return { error: (err as Error).message }; }
  if (key(n) === key(target)) return { error: 'That is how it is written now. Change it to the form you want.' };
  const pool = new Map<string, Node[]>();
  walk(target, m => { const k = key(m); pool.set(k, [...(pool.get(k) ?? []), m]); });
  const used = new Set<string>();
  const graft = (m: Node): Node => {
    // a piece none of which is in use yet (a bigger one holding an n already taken would repeat it)
    const free = (c: Node) => { let ok = true; walk(c, d => { if (used.has(d.id)) ok = false; }); return ok; };
    const hit = pool.get(key(m))?.find(free);
    if (hit) { walk(hit, c => { used.add(c.id); }); return hit; }
    return withChildren(m, children(m).map(graft));
  };
  let out = graft(n);
  // a new whole takes the old one's place; a piece of the old one written alone stays itself
  if (!used.has(out.id)) out = { ...out, id: target.id };
  const r = checked(e, { eq: replace(e, target.id, out) as Eq, label: `rewrite as ${toText(n)}`, rule: 'rewrite as', hints: newHints(), factor: () => 1, select: out.id });
  return isErr(r) ? { error: `${toText(n)} isn’t equal to ${toText(target)} here, so it can’t take its place.` } : r;
}
