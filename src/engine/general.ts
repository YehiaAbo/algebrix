// The general moves that every technique is built from (docs/specs/2026-11-20-general-moves.md):
// name a piece (b), sub a piece in from another equation, put a value into a statement that holds
// for every value, and ∫ both sides. With the facts (the derivative and integral rules, the
// theorems) these are enough for u-substitution, trig substitution, separable and linear ODEs,
// the Feynman technique, and the rest, one checked step at a time.
import { Node, Eq, Int, num, sym, add, neg, mul, frac, call, deriv, int, eq, find, findPath, replace, walk, cloneFresh, evaluate, symbols, key, relOf, isDiff, children, withChildren, Env, LETS, DEFS, CONSTS, fn } from './ast';
import { MoveOk, MoveResult, checked, isErr, solvedFor, applyBothChecked, applyMove } from './moves';
import { derivative, dependsOn, substitute } from './calculus';
import { newHints, simplify } from './simplify';
import { solvedForm } from './techniques';
import { parseExpr } from './parse';
import { toText } from './print';
import { letters, toDifferentials, hasDifferentials, integrateDifferentials } from './leibniz';
import { splitXY } from './ode';
import { expandAll } from './rewrite';
import { finishCalc } from './calcmoves';

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

export interface Named { step: MoveOk; def: Eq; letter: string | null }

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

  // a function of a letter: I(t)
  const fm = /^([A-Za-zα-ω])\s*\(\s*([a-zA-Zα-ω])\s*\)$/.exec(src);
  if (fm) {
    const [, F, p] = fm;
    if (used.has(F) || DEFS.has(F)) return { error: `${F} is already in use. Pick another name.` };
    if (!pieceLetters.includes(p)) return { error: `${t(P)} doesn't change with ${p}, so it isn't a function of ${p}.` };
    const I = () => call(F, sym(p));
    const next = replace(e, P.id, I()) as Eq;
    const def = eq(I(), fresh(P), 'def');
    // nothing to check by number: putting the definition back gives exactly what was there
    return { step: { eq: next, label: `let ${F}(${p}) = ${brief(P)}`, hints: newHints(), factor: one, select: null, rule: 'name it' }, def, letter: null };
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
    return { step: { eq: e, label: `let ${t(P)} = ${brief(E)}`, hints: newHints(), factor: one, select: null, rule: 'name it' }, def, letter: P.name };
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
export function subIn(e: Eq, src: Eq, sel: string | null, name: string): MoveResult {
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
      if (T) return changeVariable(e, T, src, dX, ds.find(d => d !== dX)!, name);
    }
    return { error: `${name} is about differentials, but there is no integral in ${ds.map(d => d.slice(1)).join(' or ')} here.` };
  }
  const here = symbols(e);
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

/** is this occurrence of v bound by a definite integral, sum or limit around it? */
function boundAt(e: Eq, m: Node, v: string): boolean {
  const path = findPath(e, m.id) ?? [];
  return path.some(n => n !== m && ((n.k === 'int' && n.lo) || n.k === 'sum' || n.k === 'lim' || n.k === 'at') && (n as { v: string }).v === v);
}

/** ∫ f dX with a·dX = b·dW (from differentiating a name): dX = (b/a) dW, so ∫ f·(b/a) dW.
 *  Bounds move with the name when the new letter is named from the old (u = g(x): g(lo), g(hi)). */
function changeVariable(e: Eq, T: Int, src: Eq, dX: string, dW: string, name: string): MoveResult {
  const X = dX.slice(1), W = dW.slice(1);
  // src is linear in the two differentials: lhs − rhs = A·dX + B·dW
  const D = add([cloneFresh(src.lhs), neg(cloneFresh(src.rhs))]);
  const A = derivative(D, dX), B = derivative(D, dW);
  if (!A || !B || dependsOn(A, dX) || dependsOn(A, dW) || dependsOn(B, dX) || dependsOn(B, dW)) return { error: `${name} isn't of the form du = … dx.` };
  // dX = −(B/A) dW
  const ratio = tidy(frac(mul([num(-1), cloneFresh(B)]), cloneFresh(A)));
  if (symbols(ratio).some(isDiff)) return { error: `${name} isn't of the form du = … dx.` };
  const integrand = tidy(mul([fresh(T.arg), ratio]));
  let lo: Node | undefined, hi: Node | undefined;
  if (T.lo && T.hi) {
    const g = LETS.get(W), h = LETS.get(X);
    if (g) { lo = tidy(substitute(cloneFresh(g), X, T.lo)); hi = tidy(substitute(cloneFresh(g), X, T.hi)); }
    else if (h) {
      // x = sin θ: the new bounds are the θ that give the old ones (θ = sin⁻¹ of each)
      lo = invert(h, W, T.lo) ?? undefined; hi = invert(h, W, T.hi) ?? undefined;
      if (!lo || !hi) return { error: `Couldn't work out which ${W} gives ${X} = ${t(T.lo)} and ${t(T.hi)}. Work out the integral first and put ${X} back.` };
    }
    else return { error: `To change the bounds too, name ${W} from ${X} (like ${W} = …${X}…), or work out the integral first and put ${X} back.` };
  }
  const next = replace(e, T.id, int(W, integrand, lo, hi)) as Eq;
  const label = `sub in d${X} = ${t(tidy(ratio))} d${W}`;
  // definite: the values match once the name is read back in (u = x² inside ∫ … dx)
  if (lo && hi) {
    if (LETS.get(W)) return checked(e, { eq: next, label, hints: newHints(), factor: one, select: null, rule: 'sub in', ties: { [W]: LETS.get(W)! } });
    // x = h(θ): the new integral, with x read as h(θ), has the old one's value
    const hx = LETS.get(X)!;
    const after = substitute(next, X, hx) as Eq;
    return checked(e, { eq: next, label, hints: newHints(), factor: one, select: null, rule: 'sub in', check: env => [[evaluate(after, env), evaluate(e, env)]] });
  }
  // indefinite: the integrands, read with the name, match: f(x) dx = g(u) du
  const g = LETS.get(W), h = LETS.get(X);
  const check = (env: Env): [number, number][] => {
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
  };
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
  let a: Node;
  try { a = parseExpr(text); } catch (err) { return { error: (err as Error).message }; }
  if (!symbols(e).includes(v)) return { error: `There is no ${v} here to put a value in for.` };
  if (!holdsForEvery(e, v)) return { error: `This says which ${v} works, not something true for every ${v}, so a value can't just be put in. To check a value, press e.` };
  const next = substitute(e, v, a) as Eq;
  // A/x at x = 0 is not a value of anything: say which bottom it zeroes instead of giving A/0
  let zero: Node | null = null;
  walk(e, n => { if (!zero && n.k === 'frac' && symbols(n.den).includes(v)) { const d = substitute(n.den, v, a); if (!symbols(d).length && evaluate(d, {}) === 0) zero = n.den; } });
  if (zero) return { error: `${v} = ${toText(a)} makes ${toText(zero)} 0, and it is on a bottom here. Multiply it out first, or pick another value.` };
  return eq(next.lhs, next.rhs);
}

/** a definition, an equation about a function of v (I(t) = …), or a relation between v and other
 *  letters: something to put a value of v into */
export function holdsForEvery(e: Eq, v: string): boolean {
  if (relOf(e) === 'def') return true;
  // a relation with other letters (1 = A(x + 1) + B(x − 1), x² + y² = 25): what follows at a value
  // of v is a consequence (⇒), not a claim that v is that value
  if (relOf(e) === '=' && symbols(e).some(w => w !== v && w !== 'C' && !isDiff(w))) return true;
  let fnOf = false;
  walk(e, n => { if (n.k === 'call' && symbols(n.arg).includes(v)) fnOf = true; });
  return fnOf;
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
export function integrateBoth(e: Eq, v: string): MoveResult {
  if (relOf(e) !== '=') return { error: 'Integrate both sides of an equation (=).' };
  // already in differentials (dy/y = x dx): each side carries its own d
  if (hasDifferentials(e)) return integrateDifferentials(e);
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
export function differentialsBoth(e: Eq): MoveResult {
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
  const next = eq(tidy(L), tidy(R));
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
export function separateChain(e: Eq, y: string, x: string): MoveOk[] | { error: string } {
  const d = toDifferentials(e);
  if (isErr(d)) return d;
  const steps: MoveOk[] = [d];
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
export function characteristicChain(e: Eq, y: string): MoveOk[] | { error: string } {
  let yId: string | null = null;
  walk(e, n => { if (!yId && n.k === 'sym' && n.name === y) yId = n.id; });
  if (!yId) return { error: `There is no ${y} on its own here to try e^(rx) for.` };
  const x = letters(e)?.x ?? 'x';
  const r = symbols(e).includes('r') ? 'm' : 'r';
  const n = nameIt(e, yId, `e^(${r}${x})`);
  if ('error' in n) return n;
  const steps: MoveOk[] = [n.step];
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
export function timesOne(e: Eq, sel: string | null, text: string): MoveResult {
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
