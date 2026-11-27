// Legal moves. Each one is a small, explicit rewrite; `applyMove` then checks it
// numerically and refuses anything that isn't provably the same equation.
import {
  Node, Eq, Mul, find, findPath, replace, cloneFresh, num, add, mul, frac, eq,
  evaluate, Env, symbols, hasSymbols, allIds, key, Rel, relOf, flipRel, holds, walk, neg,
  isDiff, linkedTo, deriv, partial, pow, sqrt, fn, children, withChildren, EVAL,
  LIMITS,
} from './ast';
import { negate, isNeg, coefOf } from './terms';
import { simplify, newHints, Hints } from './simplify';
import { derivative, substitute } from './calculus';
import { distributeNode, factorize } from './rewrite';
import { toText } from './print';
import { parseExpr } from './parse';

export interface MoveOk {
  eq: Eq;
  label: string;
  /** node that travels: gets the arc animation */
  focus?: string;
  /** what should be selected afterwards (null = clear) */
  select?: string | null;
  conditions?: string[];
  hints: Hints;
  /** lhs−rhs of the new equation = factor × (lhs−rhs of the old one) */
  factor: (env: Env) => number;
  /** a one-way step (⇒): what follows from the equation, not the same as it */
  implies?: boolean;
  /** custom relation instead of `factor`: pairs (got, want) that must match at every sample */
  check?: (env: Env) => [number, number][];
  /** a tidy-up that follows another step; undo skips over it */
  auto?: boolean;
  /** which rule this step used (a move name, a form, a technique) */
  rule?: string;
  /** a final answer that isn't an equation, like x ∈ (−∞, 2) ∪ (3, ∞) */
  answer?: string;
  /** checked as if these letters stood for these expressions: u = x² when x² was just named u */
  ties?: Record<string, Node>;
  /** text renamed in the conditions carried forward: 2C is called C from here on */
  rename?: [string, string][];
  /** what to say if the safety net refuses it (a rule that holds only where a part is ≥ 0) */
  ifRefused?: string;
}

/** ⇔: the new equation has exactly the same solutions. ⇒: every old solution survives but new ones may
 *  appear (squaring both sides, multiplying by something that might be 0), so answers must be checked. */
export function direction(r: MoveOk): '⇔' | '⇒' {
  return r.implies || (r.conditions ?? []).some(c => c.includes('add solutions')) ? '⇒' : '⇔';
}
export type MoveResult = MoveOk | { error: string };
export const isErr = (r: MoveResult): r is { error: string } => 'error' in r;

export type MoveName = 'move' | 'divide' | 'multiply' | 'distribute' | 'simplify' | 'factor' | 'slideL' | 'slideR' | 'swap' | 'lift' | 'drop';

const one = () => 1;
const t = (n: Node) => toText(n);
const side = (e: Eq, s: 'lhs' | 'rhs') => e[s];
const other = (s: 'lhs' | 'rhs') => (s === 'lhs' ? 'rhs' : 'lhs');

function locate(e: Eq, sel: string | null) {
  if (!sel || sel === 'eq') return null;
  const path = findPath(e, sel);
  if (!path) return null;
  const s: 'lhs' | 'rhs' = path[1] === e.lhs ? 'lhs' : 'rhs';
  return { path, node: path[path.length - 1], parent: path[path.length - 2], s, root: side(e, s) };
}

function appendTerms(target: Node, terms: Node[]): Node {
  if (target.k === 'num' && target.v === 0) return terms.length === 1 ? terms[0] : add(terms);
  if (target.k === 'add') return { ...target, terms: [...target.terms, ...terms] };
  return add([target, ...terms]);
}

function withSides(e: Eq, s: 'lhs' | 'rhs', mine: Node, theirs: Node): Eq {
  return s === 'lhs' ? eq(mine, theirs) : eq(theirs, mine);
}

/* ---------- move a term across "=" ---------- */
export function moveAcross(e: Eq, sel: string | null): MoveResult {
  const at = locate(e, sel);
  if (!at) return { error: 'Pick a term to move across the =.' };
  const { node, parent, s, root } = at;
  // aimed at f in −f: the term is −f, so it moves with its sign (m, m, m … keeps crossing)
  if (node !== root && parent.k === 'neg') return moveAcross(e, parent.id);
  let moving: Node[];
  let mine: Node;
  if (node === root) {
    if (node.k === 'num' && node.v === 0) return { error: 'This side is already 0. Nothing to move.' };
    moving = node.k === 'add' ? node.terms : [node];
    mine = num(0);
  } else if (parent === root && root.k === 'add') {
    const rest = root.terms.filter(x => x !== node);
    moving = [node];
    mine = rest.length === 1 ? rest[0] : { ...root, terms: rest };
  } else if (parent.k === 'mul' && parent === root) {
    return { error: `${t(node)} is a factor, not a term. Factors leave by dividing.` };
  } else if (parent.k === 'frac' && parent === root && parent.den === node) {
    return { error: `${t(node)} is a denominator. It leaves by multiplying.` };
  } else {
    return { error: `${t(node)} is inside ${t(parent)}. Only a whole term on a side can cross the =. Press k to grow the selection.` };
  }
  const moved = moving.map(negate);
  const theirs = appendTerms(side(e, other(s)), moved);
  const label = moving.length === 1 ? `move ${isNeg(moving[0]) ? '−' : ''}${t(isNeg(moving[0]) ? negate(moving[0]) : moving[0])} across` : 'move side';
  return {
    eq: withSides(e, s, mine, theirs), label, focus: moved.length === 1 ? moved[0].id : undefined,
    select: moved.length === 1 ? moved[0].id : null, hints: newHints(), factor: one,
  };
}

/* ---------- divide both sides ---------- */
export function divideBoth(e: Eq, sel: string | null): MoveResult {
  const at = locate(e, sel);
  if (!at) return { error: 'Pick the factor to divide both sides by.' };
  const { node, parent, s, root } = at;
  let divisor: Node;
  if (node === root && root.k === 'mul' && coefOf(root) && coefOf(root)!.v !== 1) divisor = coefOf(root)!;
  else if (parent === root && root.k === 'mul') divisor = node;
  else if (root.k === 'add') return { error: node === root ? 'This side is a sum, so there is no single factor to divide by. Move terms across first, or press o to divide both sides by anything.' : `${t(node)} is one term of a sum. Move the other terms across first, then divide.` };
  else return { error: `${t(node)} isn't a factor of the whole side, so I can't divide it out.` };
  if (divisor.k === 'num' && divisor.v === 0) return { error: 'Dividing by 0 is undefined.' };
  const rest = (root as Mul).factors.filter(f => f !== divisor);
  const mine = rest.length === 0 ? num(1) : rest.length === 1 ? rest[0] : { ...(root as Mul), factors: rest };
  const o = side(e, other(s));
  const theirs = o.k === 'frac' ? { ...o, den: o.den.k === 'mul' ? { ...o.den, factors: [...o.den.factors, divisor] } : mul([o.den, divisor]) } : frac(o, divisor);
  return {
    eq: withSides(e, s, mine, theirs), label: `÷ ${t(divisor)}`, focus: divisor.id, select: divisor.id,
    conditions: hasSymbols(divisor) && !neverZero(divisor) ? [`${t(divisor)} ≠ 0`] : [], hints: newHints(),
    factor: env => 1 / evaluate(divisor, env),
  };
}

/* ---------- multiply both sides (clear a denominator) ---------- */
export function multiplyBoth(e: Eq, sel: string | null): MoveResult {
  const at = locate(e, sel);
  if (!at) return { error: 'Pick a denominator to multiply both sides by.' };
  const { node, parent, s, root } = at;
  let m: Node, mine: Node;
  if (root.k === 'frac' && (node === root || node === root.den)) { m = root.den; mine = root.num; }
  else if (root.k === 'frac' && root.den.k === 'mul' && parent === root.den) {
    m = node;
    const rest = root.den.factors.filter(f => f !== node);
    mine = frac(root.num, rest.length === 1 ? rest[0] : { ...root.den, factors: rest }, root.id);
  } else return { error: '× clears a denominator. Select the bottom of a side that is a fraction.' };
  const o = side(e, other(s));
  const theirs = o.k === 'mul' ? { ...o, factors: [m, ...o.factors] } : mul([m, o]);
  return {
    eq: withSides(e, s, mine, theirs), label: `× ${t(m)}`, focus: m.id, select: m.id,
    conditions: hasSymbols(m) && !neverZero(m) ? [`${t(m)} ≠ 0`] : [], hints: newHints(),
    factor: env => evaluate(m, env),
  };
}

/* ---------- distribute / split a fraction ---------- */
function distribute(e: Eq, sel: string | null): MoveResult {
  let n = sel && sel !== 'eq' ? find(e, sel) : null;
  // aimed at the bracket of −(5 − x): the minus goes through it
  const up = n && n.k === 'add' ? findPath(e, n.id)?.slice(-2)[0] : null;
  if (up && up.k === 'neg') n = up;
  const h = newHints();
  const out = n ? distributeNode(n, h) : null;
  if (!n || !out) return { error: 'Nothing to distribute. Select a product with a bracket, like 2(x + 3), or a sum over a denominator.' };
  return { eq: replace(e, n.id, out), label: n.k === 'frac' ? 'split fraction' : 'distribute', hints: h, factor: one, select: out.id };
}

/* ---------- simplify the selection ---------- */
function simplifyMove(e: Eq, sel: string | null): MoveResult {
  const h = newHints();
  const target = sel && sel !== 'eq' ? find(e, sel) : null;
  let next: Eq;
  if (!target) next = eq(simplify(e.lhs, h), simplify(e.rhs, h));
  else next = replace(e, target.id, simplify(target, h));
  if (key(next) === key(e)) return { error: 'Already as simple as it gets.' };
  const keep = target && find(next, target.id) ? target.id : null;
  return { eq: next, label: 'simplify', hints: h, factor: one, select: target ? keep : null };
}

/* ---------- factor: as far as it goes (common factor, quadratics, difference of squares) ---------- */
function factorMove(e: Eq, sel: string | null): MoveResult {
  // nothing aimed (or the whole equation): factor each side that factors
  if (!sel || sel === 'eq') {
    const h = newHints();
    const fl = factorize(e.lhs, h), fr = relOf(e) === 'expr' ? null : factorize(e.rhs, h);
    if (!fl && !fr) return { error: 'Nothing here factors over whole numbers. Aim at a sum, like x² + 5x + 6.' };
    return { eq: eq(fl ?? e.lhs, fr ?? e.rhs, e.rel), label: 'factor', hints: h, factor: one, select: null };
  }
  // aimed inside a sum: climb to the nearest sum or product that factors
  const path = findPath(e, sel) ?? [];
  for (let i = path.length - 1; i >= 0; i--) {
    const n = path[i];
    if (n.k !== 'add' && n.k !== 'mul') continue;
    const h = newHints();
    const out = factorize(n, h);
    if (out) return { eq: replace(e, n.id, out), label: `factor`, hints: h, factor: one, select: out.id };
  }
  const n = find(e, sel);
  return { error: n && (n.k === 'add' || n.k === 'mul') ? `${t(n)} doesn't factor over whole numbers.` : 'Aim at a sum to factor it, like x² + 5x + 6.' };
}

/* ---------- reorder inside a sum or product ---------- */
/** ∫, Σ, d/dx and lim: what a constant can slide through, and the letter it must not hold */
type Op = Extract<Node, { k: 'int' | 'sum' | 'deriv' | 'lim' }>;
const isOp = (n: Node | undefined): n is Op => !!n && (n.k === 'int' || (n.k === 'sum' && !n.prod) || n.k === 'deriv' || n.k === 'lim');
const SIGN: Record<Op['k'], string> = { int: '∫', sum: 'Σ', deriv: 'd/d', lim: 'lim' };
const opName = (o: Op) => (o.k === 'int' ? `∫ … d${o.v}` : o.k === 'deriv' ? `d/d${o.v}` : SIGN[o.k]);
const factorsOf = (n: Node) => (n.k === 'mul' ? n.factors : [n]);
const product = (fs: Node[], id?: string) => (fs.length === 1 ? fs[0] : mul(fs, id));

type Need = [Node, '≥ 0' | '> 0'];
type Slid = { node: Node; label: string; select?: string; ifRefused?: string; needs?: Need[] } | { error: string };
/** the parts a rule needs ≥ 0 (or > 0) that could be otherwise here, as conditions: a letter a Σ or a
 *  definite ∫ around it runs over takes the values of its range, any other letter those of its domain */
function needed(needs: Need[] | undefined, path: Node[]): string[] {
  const out: string[] = [];
  for (const [n, rel] of needs ?? []) {
    const bad = (v: number) => (rel === '> 0' ? v <= 0 : v < 0);
    const range: Record<string, number[]> = {};
    for (const P of path) {
      if (P.k === 'sum' && isConstNum(P.lo) && isConstNum(P.hi)) {
        const lo = Math.ceil(evaluate(P.lo, {})), hi = Math.min(Math.floor(evaluate(P.hi, {})), lo + 200);
        range[P.v] = Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i);
      } else if (P.k === 'int' && P.lo && P.hi && isConstNum(P.lo) && isConstNum(P.hi)) {
        const a = evaluate(P.lo, {}), b = evaluate(P.hi, {});
        range[P.v] = Array.from({ length: 41 }, (_, i) => a + (b - a) * (i + 0.5) / 41);
      }
    }
    let neg = false;
    for (let i = 0; i < 60 && !neg; i++) {
      const env: Env = {};
      for (const v of symbols(n)) env[v] = range[v] ? range[v][i % range[v].length] : sampleIn(v, i);
      try { const v = evaluate(n, env); if (Number.isFinite(v) && bad(v)) neg = true; } catch { /* undefined there */ }
    }
    if (neg) out.push(`${toText(n)} ${rel}`);
  }
  return out;
}
/** a rule that needs a part ≥ 0: what to say when the letters allow it to be negative */
const needsNonneg = (rule: string, c: Node) => `${rule} needs ${toText(c)} ≥ 0, and it can be negative here. Click a letter on the left to say it is positive (or the sum's range keeps it ≥ 0).`;
const isConstNum = (n: Node) => !hasSymbols(n) && Number.isFinite(evaluate(n, {}));

/** c (the first factor of holder, which sits in W) out of W: the rest stays inside */
function slideOut(W: Node, holder: Node, c: Node, rest: Node | null): Slid | null {
  const keep = rest ?? num(1);
  if (isOp(W) && W.arg === holder) {
    // Σ ∫ and ∫ Σ (and ∫∫, ΣΣ) change places: the inner one comes out, what was beside it goes in
    const outer = (n: Node) => (n.k === 'sum' && !n.prod) || (n.k === 'int' && !!n.lo && !!n.hi);
    if (outer(W) && outer(c)) {
      const C = c as Extract<Node, { k: 'int' | 'sum' }>, Wo = W as Extract<Node, { k: 'int' | 'sum' }>;
      if ([C.lo, C.hi].some(b => b && symbols(b).includes(Wo.v))) return { error: `The ends of the inner ${C.k === 'sum' ? 'Σ' : '∫'} hold ${Wo.v}, so the two can't change places as they are.` };
      if (rest && symbols(rest).includes(C.v)) return null;
      const both = `${Wo.k === 'sum' ? 'Σ' : '∫'} and ${C.k === 'sum' ? 'Σ' : '∫'} change places`;
      return { node: { ...C, arg: { ...Wo, arg: rest ? mul([rest, C.arg]) : C.arg } as Node } as Node, label: both };
    }
    if (!rest) return null;
    if (symbols(c).includes(W.v)) return { error: `${toText(c)} depends on ${W.v}, so it can't come out of ${opName(W)}.` };
    return { node: mul([c, { ...W, arg: rest } as Node]), label: `${toText(c)} out of ${SIGN[W.k]}` };
  }
  if (W.k === 'frac' && W.num === holder) {
    if (!rest) return null;
    return { node: mul([c, { ...W, num: rest }]), label: `${toText(c)} out of the fraction` };
  }
  if (W.k === 'frac' && W.den === holder) {
    const one_ = frac(num(1), c);
    return { node: mul([one_, rest ? { ...W, den: rest } : W.num]), label: `${toText(c)} out of the bottom`, select: one_.id };
  }
  if (!rest) return null;
  if (W.k === 'sqrt' && W.arg === holder) {
    if (isConstNum(c) && evaluate(c, {}) < 0) return { error: `√(ab) = √a √b needs a ≥ 0, and ${toText(c)} is negative.` };
    const r = sqrt(c);
    return { node: mul([r, { ...W, arg: keep }]), label: '√(ab) = √a √b', select: r.id, ifRefused: needsNonneg('√(ab) = √a √b', c), needs: [[c, '≥ 0'], [keep, '≥ 0']] };
  }
  if (W.k === 'fn' && W.name === 'abs' && W.arg === holder) {
    // |ab| = |a| |b| always; a number at least 0 comes out bare
    const out = isConstNum(c) && evaluate(c, {}) >= 0 ? c : fn('abs', c);
    return { node: mul([out, { ...W, arg: keep }]), label: '|ab| = |a| |b|', select: out.id };
  }
  if ((W.k === 'fn' && (W.name === 'ln' || W.name === 'log')) && W.arg === holder) {
    const l = fn(W.name, c);
    return { node: add([l, { ...W, arg: keep }]), label: `${W.name}(ab) = ${W.name} a + ${W.name} b`, select: l.id, ifRefused: needsNonneg(`${W.name}(ab) = ${W.name} a + ${W.name} b`, c).replace('≥ 0', '> 0'), needs: [[c, '> 0'], [keep, '> 0']] };
  }
  // a factor of an exponent comes out as the outer power: a^(2x) = (a^x)²
  if (W.k === 'pow' && W.exp === holder) {
    const inner = { ...W, exp: keep };
    return { node: pow(inner, c), label: `${toText(c)} out of the exponent: a^(mn) = (a^m)^n`, ifRefused: `a^(mn) = (a^m)^n needs a > 0 or a whole power; ${toText(W.base)} can be negative here.` };
  }
  if (W.k === 'pow' && W.base === holder) {
    const p = pow(c, cloneFresh(W.exp));
    return { node: mul([p, { ...W, base: keep }]), label: '(ab)ⁿ = aⁿ bⁿ', select: p.id, ifRefused: needsNonneg('(ab)ⁿ = aⁿ bⁿ for a power that is not whole', c), needs: W.exp.k === 'num' && Number.isInteger(W.exp.v) ? [] : [[c, '≥ 0'], [keep, '≥ 0']] };
  }
  return null;
}

/** c (beside W in a product: on its left, or on its right when fromRight) into W */
function slideIn(W: Node, c: Node, fromRight = false): Slid | null {
  const join = (inside: Node, x: Node = c) => product(fromRight ? [...factorsOf(inside), x] : [x, ...factorsOf(inside)], inside.k === 'mul' ? inside.id : undefined);
  if (isOp(W)) {
    if (symbols(c).includes(W.v)) return { error: `${toText(c)} depends on ${W.v}, so it can't go into ${opName(W)}.` };
    return { node: { ...W, arg: join(W.arg) } as Node, label: `${toText(c)} into ${SIGN[W.k]}` };
  }
  if (W.k === 'frac') return { node: { ...W, num: join(W.num) }, label: `${toText(c)} into the fraction` };
  // the same base: the powers add, a^m a^n = a^(m + n) (a alone counts as a¹)
  const base = (n: Node) => (n.k === 'pow' ? n.base : n), expOf = (n: Node) => (n.k === 'pow' ? n.exp : num(1));
  if (W.k === 'pow' && key(base(c)) === key(W.base)) {
    const terms = (n: Node) => (n.k === 'add' ? n.terms : [n]);
    const sum = add(fromRight ? [...terms(W.exp), ...terms(expOf(c))] : [...terms(expOf(c)), ...terms(W.exp)], W.exp.k === 'add' ? W.exp.id : undefined);
    return { node: { ...W, exp: sum }, label: `${toText(c)} joins the power: a^m a^n = a^(m + n)` };
  }
  if (W.k === 'sqrt' || (W.k === 'fn' && W.name === 'abs')) {
    if (isConstNum(c) && evaluate(c, {}) < 0) return { error: `Only what is at least 0 goes in: a√b = √(a²b), a|b| = |ab|. ${toText(c)} is negative.` };
    // a root into a root (√a √b = √(ab)) and |a| into |…| go in as what they hold; anything else as its square
    const same = W.k === 'sqrt' ? c.k === 'sqrt' : c.k === 'fn' && c.name === 'abs';
    const inside = same ? (c as { arg: Node }).arg : W.k === 'sqrt' ? pow(c, num(2)) : c;
    const node = { ...W, arg: join(W.arg, inside) } as Node;
    const rule = W.k === 'sqrt' ? 'a√b = √(a²b)' : 'a|b| = |ab|';
    return { node, label: same ? `${toText(c)} joins it: ${W.k === 'sqrt' ? '√a √b = √(ab)' : '|a| |b| = |ab|'}` : W.k === 'sqrt' ? `${toText(c)} into the root, as ${toText(c)}²` : `${toText(c)} into |…|`, ifRefused: same ? undefined : needsNonneg(rule, c), needs: same ? [] : [[c, '≥ 0']] };
  }
  return null;
}

/** Shift + ← →  through ∫, Σ, d/dx and lim: a constant factor slides out of one or into one,
 *  and d/dt slides into an integral over another letter (Leibniz) or back out. */
function slideCalc(e: Eq, sel: string | null, dir: -1 | 1): MoveResult | null {
  const at = locate(e, sel);
  if (!at) return null;
  const { node, parent, path } = at;
  const label = (what: string) => ({ hints: newHints(), factor: one, select: node.id, label: what });
  // d/dt ∫ f dx → ∫ ∂f/∂t dx, and back
  if (dir === 1 && node.k === 'deriv' && node.arg.k === 'int' && !node.partial) {
    const I = node.arg, t = node.v;
    if (I.v === t) return { error: `The integral is in ${t} itself: d/d${t} of it is the function, not a slide.` };
    if ((I.lo && symbols(I.lo).includes(t)) || (I.hi && symbols(I.hi).includes(t))) return { error: `A bound moves with ${t}, so d/d${t} can't just slide in: the full Leibniz rule adds the bound terms (C d).` };
    return { eq: replace(e, node.id, { ...I, id: node.id, arg: partial(t, I.arg, I.id) }), ...label(`d/d${t} into the integral (Leibniz)`) };
  }
  if (dir === -1 && node.k === 'int' && node.arg.k === 'deriv' && node.arg.v !== node.v) {
    const t = node.arg.v;
    if ((node.lo && symbols(node.lo).includes(t)) || (node.hi && symbols(node.hi).includes(t))) return { error: `A bound moves with ${t}, so d/d${t} can't just slide out.` };
    return { eq: replace(e, node.id, deriv(t, { ...node, id: node.arg.id, arg: node.arg.arg }, undefined, node.id)), ...label(`d/d${t} out of the integral (Leibniz)`) };
  }
  // out: the first factor inside a wrapper (∫ Σ d/dx lim, a fraction, √, a power, |…|, ln) slides
  // out past it, one level per press; a first term of an exponent comes out as its own power
  const inner = parent.k === 'mul' ? parent : null;
  const W = inner ? path[path.length - 3] : parent;
  // (the last factor goes out to the right the same way, with → )
  const edge = inner ? (dir === -1 ? inner.factors[0] : inner.factors[inner.factors.length - 1]) : node;
  if (W && edge === node && !(dir === 1 && !inner && W.k !== 'frac')) {
    const holder = inner ?? node;
    const rest = inner ? product(dir === -1 ? inner.factors.slice(1) : inner.factors.slice(0, -1), inner.id) : null;
    const out = slideOut(W, holder, node, rest);
    if (out) {
      if ('error' in out) return out;
      const host = path[path.length - (inner ? 4 : 3)];
      let R = out.node;
      if (dir === 1 && (R.k === 'mul' || R.k === 'add')) R = R.k === 'mul' ? { ...R, factors: [...R.factors].reverse() } : { ...R, terms: [...R.terms].reverse() };
      const eq2 = host?.k === 'mul' && R.k === 'mul'
        ? replace(e, host.id, { ...host, factors: host.factors.flatMap(f => (f === W ? R.factors : [f])) })
        : replace(e, W.id, R);
      return { eq: eq2, ...label(out.label), select: out.select ?? node.id, ifRefused: out.ifRefused, conditions: needed(out.needs, path) };
    }
  }
  if (parent.k === 'add' && parent.terms[dir === -1 ? 0 : parent.terms.length - 1] === node) {
    const P = path[path.length - 3];
    if (P?.k === 'pow' && P.exp === parent && parent.terms.length > 1) {
      const others = dir === -1 ? parent.terms.slice(1) : parent.terms.slice(0, -1);
      const rest = others.length === 1 ? others[0] : add(others, parent.id);
      const a = pow(cloneFresh(P.base), node);
      const rest2 = { ...P, exp: rest };
      return { eq: replace(e, P.id, mul(dir === -1 ? [a, rest2] : [rest2, a])), ...label(`${toText(node)} out of the power: a^(m + n) = a^m a^n`), select: a.id };
    }
  }
  // in: a factor next to a wrapper in a product slides into it, from either side
  if (parent.k === 'mul') {
    const i = parent.factors.indexOf(node), nb = parent.factors[i + dir];
    const into = nb ? slideIn(nb, node, dir === -1) : null;
    if (!into) return null;
    if ('error' in into) return into;
    const rest = parent.factors.flatMap((f, j) => (j === i ? [] : j === i + dir ? [into.node] : [f]));
    return { eq: replace(e, parent.id, product(rest, parent.id)), ...label(into.label), ifRefused: into.ifRefused, conditions: needed(into.needs, path) };
  }
  return null;
}

function slide(e: Eq, sel: string | null, dir: -1 | 1): MoveResult {
  const c = slideCalc(e, sel, dir);
  if (c) return c;
  const at = locate(e, sel);
  if (!at || (at.parent.k !== 'add' && at.parent.k !== 'mul')) return { error: 'Only a term in a sum or a factor in a product can slide.' };
  const list = at.parent.k === 'add' ? at.parent.terms : at.parent.factors;
  const i = list.indexOf(at.node), j = i + dir;
  if (j < 0 || j >= list.length) return { error: 'Already at the edge.' };
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  const p = at.parent.k === 'add' ? { ...at.parent, terms: next } : { ...at.parent, factors: next };
  return { eq: replace(e, at.parent.id, p), label: 'reorder', hints: newHints(), factor: one, select: at.node.id };
}

/* ---------- Shift + ↑ ↓: up and down through the notation ---------- */
/** a factor across the fraction bar flips the sign of its power (1/x² ↑ is x⁻², e⁻ˣ ↓ is 1/eˣ);
 *  a power comes down in front of its log (ln x³ ↓ is 3 ln x) and goes back up (3 ln x ↑);
 *  a bound of an integral goes over to the other end (∫ₐᵇ = −∫ᵇₐ). dir −1 is up, 1 is down. */
function vertical(e: Eq, sel: string | null, dir: -1 | 1): MoveResult {
  const at = locate(e, sel);
  if (!at) return { error: 'Aim at a piece first: Shift + ↑ lifts it, Shift + ↓ drops it.' };
  const { node, parent, path } = at;
  const done = (eq2: Eq, label: string, select: string = node.id): MoveResult => ({ eq: eq2, label, hints: newHints(), factor: one, select });
  /** the factor with its power's sign flipped, keeping the pieces it is made of */
  const flip = (f: Node): Node => {
    if (f.k === 'pow') {
      const x = f.exp.k === 'num' ? num(-f.exp.v, f.exp.id) : f.exp.k === 'neg' ? f.exp.arg : neg(f.exp);
      return x.k === 'num' && x.v === 1 ? f.base : { ...f, exp: x };
    }
    if (f.k === 'frac' && f.num.k === 'num' && f.num.v === 1) return f.den;
    return pow(f, num(-1));
  };
  const negPow = (f: Node) => f.k === 'pow' && (isNeg(f.exp) || (f.exp.k === 'num' && f.exp.v < 0));
  // a bound: over to the other end, and the integral turns round
  const I = parent;
  if (I.k === 'int' && I.lo && I.hi && (node === I.lo || node === I.hi)) {
    if ((dir === -1 && node !== I.lo) || (dir === 1 && node !== I.hi)) return { error: dir === -1 ? 'The top bound is already up: Shift + ↓ takes it down.' : 'The bottom bound is already down: Shift + ↑ takes it up.' };
    const turned = neg({ ...I, lo: I.hi, hi: I.lo });
    return done(replace(e, I.id, turned) as Eq, `${toText(node)} to the ${dir === -1 ? 'top' : 'bottom'}: ∫ₐᵇ = −∫ᵇₐ`);
  }
  // a power down in front of its log, and back up
  const L = path[path.length - 3];
  if (dir === 1 && parent.k === 'pow' && node === parent.exp && L?.k === 'fn' && (L.name === 'ln' || L.name === 'log') && L.arg === parent) {
    const even = parent.exp.k === 'num' && Number.isInteger(parent.exp.v) && parent.exp.v % 2 === 0;
    const base = even ? fn('abs', parent.base) : parent.base;
    return done(replace(e, L.id, mul([node, { ...L, arg: base }])) as Eq, `the power comes down: ln(aⁿ) = n ln ${even ? '|a|' : 'a'}`);
  }
  if (dir === -1 && parent.k === 'mul' && parent.factors.length === 2) {
    const other = parent.factors.find(f => f !== node)!;
    if (other.k === 'fn' && (other.name === 'ln' || other.name === 'log') && !(node.k === 'fn' && (node.name === 'ln' || node.name === 'log'))) {
      const up = { ...other, arg: pow(other.arg, node) };
      return done(replace(e, parent.id, up) as Eq, `${toText(node)} goes up as the power: n ln a = ln(aⁿ)`);
    }
  }
  // across the fraction bar
  const holder = parent.k === 'mul' ? parent : node;
  const F = parent.k === 'mul' ? path[path.length - 3] : parent;
  const others = parent.k === 'mul' ? parent.factors.filter(f => f !== node) : [];
  const rest = others.length ? (others.length === 1 ? others[0] : { ...(parent as Mul), factors: others }) : null;
  const zero = node.k === 'num' && node.v === 0;
  if (F?.k === 'frac' && (F.den === holder || F.num === holder)) {
    const onTop = F.num === holder;
    if (zero) return { error: '0 has no reciprocal, so it cannot cross the bar.' };
    if (onTop && dir === -1) return { error: `${toText(node)} is already on top: Shift + ↓ takes it below the bar.` };
    if (!onTop && dir === 1) return { error: `${toText(node)} is already below: Shift + ↑ takes it up.` };
    const moved = flip(node);
    let out: Node;
    if (onTop) {
      const den = F.den.k === 'mul' ? { ...F.den, factors: [...F.den.factors, moved] } : mul([F.den, moved]);
      out = { ...F, num: rest ?? num(1), den };
    } else {
      const top = F.num.k === 'num' && F.num.v === 1 ? moved : F.num.k === 'mul' ? { ...F.num, factors: [...F.num.factors, moved] } : mul([F.num, moved]);
      out = rest ? { ...F, num: top, den: rest } : top;
    }
    const sign = negPow(moved) ? 'negative' : 'positive';
    return done(replace(e, F.id, out) as Eq, `${toText(node)} ${onTop ? 'below' : 'over'} the bar: its power turns ${sign}`, moved.id);
  }
  // not in a fraction: a negative power drops below a new bar, x⁻² y is y/x²
  if (dir === 1 && negPow(node)) {
    const moved = flip(node);
    const out = frac(rest ?? num(1), moved);
    return done(replace(e, holder.id, out) as Eq, `${toText(node)} below the bar: its power turns positive`, moved.id);
  }
  if (dir === 1) return { error: `${toText(node)} has no bar to cross and no negative power to drop. Shift + ↓ takes a factor below a fraction bar, a negative power below a new one, or a power down off a log.` };
  return { error: `Shift + ↑ lifts a factor from under the bar, a number in front of a log into its power, or a bottom bound to the top. ${toText(node)} is none of those.` };
}

export function swapSides(e: Eq, sel: string | null): MoveResult {
  return { eq: eq(e.rhs, e.lhs), label: 'swap sides', hints: newHints(), factor: () => -1, select: sel };
}

const MOVES: Record<MoveName, (e: Eq, sel: string | null) => MoveResult> = {
  move: moveAcross, divide: divideBoth, multiply: multiplyBoth, distribute, simplify: simplifyMove,
  factor: factorMove, slideL: (e, s) => slide(e, s, -1), slideR: (e, s) => slide(e, s, 1), swap: swapSides,
  lift: (e, s) => vertical(e, s, -1), drop: (e, s) => vertical(e, s, 1),
};

/* ---------- apply an operation to both sides ---------- */
export function applyBoth(e: Eq, text: string, others: Eq[] = []): MoveResult {
  const m = /^\s*([+\-−*×·/÷])\s*(.+)$/.exec(text);
  if (!m) return { error: 'Start with + − * or /, like “/7” or “+3x”.' };
  const op = ({ '−': '-', '×': '*', '·': '*', '÷': '/' } as Record<string, string>)[m[1]] ?? m[1];
  const ref = /^(.*?)\s*[*×·]?\s*#\s*(\d)\s*$/.exec(m[2]);
  if (ref) return addEquation(e, op, ref[1], Number(ref[2]), others);
  let x: Node;
  try { x = parseExpr(m[2]); } catch (err) { return { error: (err as Error).message }; }
  const isZero = !hasSymbols(x) && Math.abs(evaluate(x, {})) < 1e-12;
  if ((op === '*' || op === '/') && isZero) return { error: op === '/' ? 'Dividing by 0 is undefined.' : 'Multiplying by 0 erases the equation.' };
  const c = cloneFresh(x); c.from = undefined;
  const cond = hasSymbols(x) && !neverZero(x) && (op === '*' || op === '/') ? [`${t(x)} ≠ 0`] : [];
  let L: Node, R: Node, factor: (env: Env) => number = one;
  if (op === '+' || op === '-') {
    L = appendTerms(e.lhs, [op === '-' ? negate(x) : x]);
    R = appendTerms(e.rhs, [op === '-' ? negate(c) : c]);
  } else if (op === '*') {
    // a differential goes at the end, the way it is written: x y dx
    const last = x.k === 'sym' && isDiff(x.name);
    const pre = (f: Node, s: Node): Node => (last ? (s.k === 'mul' ? { ...s, factors: [...s.factors, f] } : mul([s, f])) : s.k === 'mul' ? { ...s, factors: [f, ...s.factors] } : mul([f, s]));
    L = pre(x, e.lhs); R = pre(c, e.rhs);
    factor = env => evaluate(x, env);
  } else {
    const div = (s: Node, f: Node): Node => (s.k === 'frac' ? { ...s, den: s.den.k === 'mul' ? { ...s.den, factors: [...s.den.factors, f] } : mul([s.den, f]) } : frac(s, f));
    // ÷ dt on differentials: each one becomes a rate (2x dx + 2y dy = 0 gives 2x dx/dt + 2y dy/dt = 0)
    const dt = x.k === 'sym' && isDiff(x.name) ? x : null;
    const hasD = (s: Node) => symbols(s).some(w => isDiff(w) && w !== dt?.name);
    const rate = (s: Node): Node | null => {
      if (s.k === 'num' && s.v === 0) return s;
      if (s.k === 'sym' && isDiff(s.name) && s.name !== dt!.name) return frac(s, cloneFresh(dt!));
      if (s.k === 'neg') { const a = rate(s.arg); return a && { ...s, arg: a }; }
      if (s.k === 'add') { const ts = s.terms.map(rate); return ts.every(Boolean) ? { ...s, terms: ts as Node[] } : null; }
      if (s.k === 'mul') { const i = s.factors.findIndex(f => f.k === 'sym' && isDiff(f.name) && f.name !== dt!.name); if (i < 0) return null; const fs = [...s.factors]; fs[i] = frac(fs[i], cloneFresh(dt!)); return { ...s, factors: fs }; }
      return null;
    };
    const rates = dt && (hasD(e.lhs) || hasD(e.rhs)) ? [rate(e.lhs), rate(e.rhs)] : null;
    if (rates && rates[0] && rates[1]) { L = rates[0]; R = rates[1]; } else { L = div(e.lhs, x); R = div(e.rhs, c); }
    factor = env => 1 / evaluate(x, env);
  }
  const sym = { '+': '+', '-': '−', '*': '×', '/': '÷' }[op]!;
  return { eq: eq(L, R), label: `${sym} ${t(x)} both sides`, hints: newHints(), factor, conditions: cond, select: null };
}

/* ---------- elimination: add or subtract a multiple of another equation ---------- */
function addEquation(e: Eq, op: string, coefText: string, j: number, others: Eq[]): MoveResult {
  if (op !== '+' && op !== '-') return { error: 'Equations can be added or subtracted, like “-2#2”.' };
  const o = others[j - 1];
  if (!o) return { error: `There is no equation ${j}.` };
  if (relOf(o) !== '=' && relOf(o) !== 'def') return { error: `Equation ${j} isn’t an equation (it’s ${relOf(o) === 'expr' ? 'an expression' : 'an inequality'}), so it can’t be added to both sides.` };
  let k: Node;
  try { k = coefText.trim() ? parseExpr(coefText) : num(1); } catch (err) { return { error: (err as Error).message }; }
  // any multiple, letters too: what equation j says is 0 (its left minus its right) times anything is 0
  const kv = hasSymbols(k) ? NaN : evaluate(k, {});
  if (!hasSymbols(k) && (!Number.isFinite(kv) || kv === 0)) return { error: 'Multiplying an equation by 0 adds nothing.' };
  // the other equation's terms come in one by one, already scaled (2·(x − y) arrives as −2x + 2y),
  // so what cancels sits next to what it cancels
  const h0 = newHints();
  const spread = (n: Node) => (n.k === 'add' ? n.terms : [n]);
  const scaledTerms = (side: Node) => spread(cloneFresh(side)).map(t => {
    const c = kv === 1 ? t : simplify(mul([cloneFresh(k), t]), h0);
    return op === '-' ? negate(c) : c;
  });
  const L = appendTerms(e.lhs, scaledTerms(o.lhs)), R = appendTerms(e.rhs, scaledTerms(o.rhs));
  const sgn = op === '-' ? -1 : 1;
  return {
    eq: eq(L, R), label: `${op === '-' ? '−' : '+'} ${kv === 1 ? '' : t(k) + '× '}equation ${j}`, hints: newHints(), factor: one, select: null, rule: 'eliminate',
    check: env => [[evaluate(L, env) - evaluate(R, env), evaluate(e.lhs, env) - evaluate(e.rhs, env) + sgn * evaluate(k, env) * (evaluate(o.lhs, env) - evaluate(o.rhs, env))]],
  };
}

/* ---------- the safety net ---------- */
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

/** the variables of indefinite integrals (∫ f dx with no bounds) in n */
export function indefiniteVars(n: Node): string[] {
  const vs = new Set<string>();
  walk(n, m => { if (m.k === 'int' && !(m.lo && m.hi)) vs.add(m.v); });
  return [...vs];
}

/** are the indefinite integrals in n one inside the next (∫ ∫ f dx dy), rather than side by side? */
/** an indefinite integral inside another (∫ ∫ f dx dy, or ∫ (∫ f dx + ∫ g dx) dy once split) */
function stacked(n: Node): boolean {
  let found = false;
  walk(n, m => { if (m.k === 'int' && !(m.lo && m.hi)) walk(m.arg, k => { if (k.k === 'int' && !(k.lo && k.hi)) found = true; }); });
  return found;
}

export function verify(before: Eq, r: MoveOk): string | null {
  const was = EVAL.anyFn;
  EVAL.anyFn = true;
  try { return verifyAt(before, r); } finally { EVAL.anyFn = was; }
}

function verifyAt(before: Eq, r: MoveOk): string | null {
  // the same values every time: whether a move passes can't depend on what was checked before it
  seed = 12345;
  const ids = allIds(r.eq);
  if (new Set(ids).size !== ids.length) return 'duplicate ids';
  // a name or a substitution: both sides read with the letters put back
  if (r.ties) {
    const put = (n: Eq) => Object.entries(r.ties!).reduce<Node>((a, [u, w]) => substitute(a, u, w), n) as Eq;
    return verify(put(before), { ...r, eq: put(r.eq), ties: undefined });
  }
  // an indefinite integral is only known up to a constant: compare slopes instead of values
  const ivs = r.check ? [] : [...new Set([...indefiniteVars(before), ...indefiniteVars(r.eq)])];
  if (ivs.length) {
    // stacked ones (∫ ∫ f dx dy): the mixed slope ∂/∂x ∂/∂y …, which every one's constant drops out of
    const by = ivs.length > 1 && (stacked(before) || stacked(r.eq)) ? [ivs] : ivs.map(v => [v]);
    // y′ in sight: y is a function (of the letter it is differentiated by), so its slope is y′
    const names = new Set([...symbols(before), ...symbols(r.eq)]);
    const dep = [...names].filter(s => names.has(s + '′')).concat([...names].filter(s => s.endsWith('′') && names.has(s + '′')));
    const d = (n: Node, vs: string[]) => vs.reduce<Node | null>((a, v) => a && derivative(a, v, [...dep, ...linkedTo(v)].filter(s => s !== v)), n);
    const pairs = by.map(vs => [d(add([r.eq.lhs, neg(r.eq.rhs)]), vs), d(add([before.lhs, neg(before.rhs)]), vs)] as const);
    if (pairs.some(([a, b]) => !a || !b)) return 'could not check: no derivative';
    const slope: MoveOk = { ...r, check: env => { const f = r.factor(env); return pairs.map(([a, b]) => [evaluate(a!, env), f * evaluate(b!, env)]); } };
    return verify(before, slope);
  }
  const vars = symbols(eq(before.lhs, add([before.rhs, r.eq.lhs, r.eq.rhs])));
  // a letter in the bounds of a Σ or ∏ counts terms, so it takes whole numbers
  const whole = new Set<string>();
  for (const q of [before, r.eq]) walk(q, n => { if (n.k === 'sum') [n.lo, n.hi].forEach(b => symbols(b).forEach(w => whole.add(w))); });
  let checked = 0;
  // with nothing to vary, one look is enough (and integrals in several dimensions aren't cheap)
  const enough = vars.length ? 6 : 1;
  for (let i = 0; i < 120 && checked < enough; i++) {
    // small values first, then positive ones (logs, roots), then wide ones
    const span = i < 40 ? () => rand() * 9 - 4.5 : i < 80 ? () => rand() * 9 + 0.05 : () => rand() * 120 - 60;
    const env: Env = {};
    for (const v of vars) env[v] = whole.has(v) ? 1 + Math.floor(rand() * 8) : Math.round(span() * 1000) / 1000 + 0.137;
    // lhs − rhs before and after; how big the sides are sets the tolerance, so a side worked out
    // numerically (∫₀¹ x^t dx near its edge) isn't held to 10⁻⁶ when the sides are much bigger
    let size = 0;
    const pairs: [number, number][] = r.check ? r.check(env) : (() => {
      const [l0, r0, l1, r1] = [before.lhs, before.rhs, r.eq.lhs, r.eq.rhs].map(n => evaluate(n, env)), f = r.factor(env);
      size = Math.abs(l1) + Math.abs(r1) + Math.abs(f) * (Math.abs(l0) + Math.abs(r0));
      if (Number.isFinite(f) && Number.isFinite(l0 - r0)) return [[l1 - r1, f * (l0 - r0)]];
      // a side that is ∞ (a limit that grows without bound): each side has to stay what it was
      const same = (a: number, b: number) => a === b || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-7 * (1 + Math.abs(a)));
      const inf = [l0, r0, l1, r1].some(x => Math.abs(x) === Infinity);
      if (f === 1 && inf && ![l0, r0, l1, r1].some(Number.isNaN) && same(l0, l1) && same(r0, r1)) return [[0, 0]];
      return [[NaN, NaN]];
    })();
    if (!pairs.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b))) { if (!vars.length) break; continue; }
    checked++;
    for (const [got, want] of pairs) {
      if (Math.abs(got - want) > 1e-6 * (1 + Math.abs(want) + Math.abs(got) + size)) return `mismatch at ${JSON.stringify(env)}: ${got} vs ${want}`;
    }
  }
  if (checked < (vars.length ? 2 : 1)) return 'could not check: undefined almost everywhere';
  return null;
}

/* ---------- variable domains: which values each variable may take ---------- */
export type Domain = 'real' | 'positive' | 'nonneg' | 'integer';
let DOMAINS: Record<string, Domain> = {};
/** the app sets this so sign questions ("is x positive?") use what you declared */
export function setDomains(d: Record<string, Domain>) { DOMAINS = d; LIMITS.nonneg = new Set(Object.keys(d).filter(v => d[v] === 'positive' || d[v] === 'nonneg')); }
export const domainOf = (name: string): Domain => DOMAINS[name] ?? 'real';
export function sampleIn(name: string, i: number): number {
  const d = DOMAINS[name] ?? 'real';
  // every character counts, so y, y′ and y″ get values of their own
  let h = name.charCodeAt(0);
  for (let k = 1; k < name.length; k++) h += name.charCodeAt(k) * (k + 0.618);
  const x = (Math.sin(i * 12.9898 + h * 78.233) * 43758.5453) % 1;
  const u = i < 30 ? x * 9 : x * 60;
  if (d === 'positive') return Math.abs(u) + 0.013;
  if (d === 'nonneg') return Math.abs(u);
  if (d === 'integer') return Math.round(u);
  return u + 0.137;
}

/** The relation after a step. Equations stay equations. An inequality keeps its direction when
 *  the step multiplies by something positive, flips for negative, and refuses an unknown sign. An
 *  expression may only be rewritten, and a proof goal may only rewrite each side into an equal form. */
export function relAfter(before: Eq, r: MoveOk): Rel | { error: string } {
  const rel = relOf(before);
  if (rel === '=') return '=';
  const vars = symbols(eq(before.lhs, add([before.rhs, r.eq.lhs, r.eq.rhs])));
  const envs: Env[] = [];
  for (let i = 0; i < 60; i++) { const env: Env = {}; vars.forEach(v => (env[v] = sampleIn(v, i))); envs.push(env); }
  const same = (a: Node, b: Node) => envs.every(env => {
    const x = evaluate(a, env), y = evaluate(b, env);
    return !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x - y) <= 1e-7 * (1 + Math.abs(x));
  });
  if (rel === 'expr') return key(r.eq.rhs) === key(before.rhs) ? 'expr' : { error: 'This is an expression, so there is no other side. Rewrite it with e, s, d, or the forms.' };
  if (rel === 'def') {
    // rewriting the right side keeps it the definition (the move's own check vouches for the new
    // right side, which a numeric compare can't always: ∫₀¹ x^t dx has no value for t < −1); moving
    // things across makes an ordinary equation of it, and the function stays defined by the step before
    return key(r.eq.lhs) === key(before.lhs) && !r.check ? 'def' : '=';
  }
  if (rel === '≟') {
    return !r.check && same(r.eq.lhs, before.lhs) && same(r.eq.rhs, before.rhs) ? '≟'
      : { error: 'In a proof, rewrite one side at a time. Doing the same thing to both sides assumes what you are proving.' };
  }
  // adding equal amounts (both sides of an equation) to both sides keeps the order
  if (r.rule === 'eliminate') return rel;
  if (r.check) {
    // functions on both sides etc.: the new inequality must be true exactly where the old one was
    for (const cand of [rel, flipRel(rel)]) {
      const next = eq(r.eq.lhs, r.eq.rhs, cand);
      let seen = 0;
      const ok = envs.every(env => { const a = holds(before, env), b = holds(next, env); if (a === null || b === null) return true; seen++; return a === b; });
      if (ok && seen >= 5) return cand;
    }
    return { error: 'That function doesn’t keep the order of the two sides, so the inequality would change.' };
  }
  let pos = 0, neg = 0;
  for (const env of envs) { const f = r.factor(env); if (Number.isFinite(f)) { if (f > 0) pos++; else if (f < 0) neg++; } }
  if (pos && !neg) return rel;
  if (neg && !pos) return flipRel(rel);
  return { error: 'I can’t tell if that is positive or negative, so I don’t know which way the inequality points. Set the variable’s domain in the rail, or split into cases.' };
}

/** before and after with each ∫ₐᵇ, lim and Σ that is in both (the same, untouched) as a letter */
function asAtoms(before: Eq, after: Eq): [Eq, Eq] | null {
  const keys = new Map<string, string>();
  const inAfter = new Set<string>();
  walk(after, n => { inAfter.add(key(n)); });
  walk(before, n => {
    if (((n.k === 'int' && n.lo) || n.k === 'lim' || n.k === 'sum') && inAfter.has(key(n)) && !keys.has(key(n))) keys.set(key(n), `⟦${keys.size}⟧`);
  });
  if (!keys.size) return null;
  const swap = (n: Node): Node => {
    const k = keys.get(key(n));
    if (k) return { k: 'sym', id: n.id, name: k } as Node;
    const ks = children(n);
    return ks.length ? withChildren(n, ks.map(swap)) : n;
  };
  return [swap(before) as Eq, swap(after) as Eq];
}

/** the one place two trees differ: the smallest pair of pieces such that the rest is the same */
function changed(before: Node, after: Node): [Node, Node] | null {
  if (key(before) === key(after)) return null;
  const kb = children(before), ka = children(after);
  if (before.k !== after.k || kb.length !== ka.length) return [before, after];
  const diff = kb.map((c, i) => key(c) !== key(ka[i]));
  const i = diff.indexOf(true);
  if (i < 0 || diff.lastIndexOf(true) !== i) return [before, after];
  // the node itself (an operator, the letter of a dx, a bound held outside the children) must match too
  if (key(withChildren(before, kb.map((c, j) => j === i ? ka[i] : c))) !== key(after)) return [before, after];
  return changed(kb[i], ka[i]);
}

export function checked(e: Eq, r: MoveResult): MoveResult {
  if (isErr(r)) return r;
  const rel = relAfter(e, r);
  if (typeof rel !== 'string') return rel;
  if (relOf(r.eq) !== rel) r = { ...r, eq: eq(r.eq.lhs, r.eq.rhs, rel) };
  let problem = verify(e, r);
  // a piece that has no value (a divergent ∫, a limit that doesn't exist) and that the move leaves
  // whole: algebra around it holds whatever it is, so check with it as an unknown letter
  // (a name or a substitution first puts its letters back: if that gives the equation exactly, it holds)
  if (problem?.startsWith('could not check') && !r.check) {
    const put = (n: Eq) => Object.entries(r.ties ?? {}).reduce<Node>((a, [u, w]) => substitute(a, u, w), n) as Eq;
    const b = put(e), a = put(r.eq);
    if (key(b) === key(a)) problem = null;
    else {
      const ab = asAtoms(b, a);
      if (ab) problem = verify(ab[0], { ...r, eq: ab[1], ties: undefined });
      // a move inside such a piece (splitting the fraction under a divergent ∫): the one piece it
      // changed must be the same expression before and after, for every value of its letters
      const d = problem && relOf(a) === relOf(b) ? changed(b, a) : null;
      if (d && d[0].k !== 'eq') problem = verify(eq(d[0], { k: 'num', id: 'z0', v: 0 } as Node), { ...r, eq: eq(d[1], { k: 'num', id: 'z1', v: 0 } as Node), ties: undefined, factor: () => 1 });
    }
  }
  if (problem) {
    console.error('[algebrix] refused move', r.label, problem);
    return { error: r.ifRefused ?? 'The engine refused this: it would not keep the equation true.' };
  }
  return r;
}

/** what a move would do, before the safety net checks it: cheap, for hints that only need the label */
export function previewMove(name: MoveName, e: Eq, sel: string | null): MoveResult {
  return MOVES[name](e, sel);
}

export function applyMove(name: MoveName, e: Eq, sel: string | null): MoveResult {
  const r = checked(e, MOVES[name](e, sel));
  return isErr(r) ? r : { ...r, rule: r.rule ?? name };
}

export function applyBothChecked(e: Eq, text: string, others: Eq[] = []): MoveResult {
  return checked(e, applyBoth(e, text, others));
}

/** Is this equation solved for some variable? Returns that variable. */
/** can't be 0 whatever the letters are: e^(2x), x² + 1, 3e^x. Saying "≠ 0" about these is noise. */
export function neverZero(n: Node): boolean {
  const nonneg = (m: Node): boolean => (m.k === 'num' && m.v >= 0) || (m.k === 'pow' && ((m.exp.k === 'num' && m.exp.v % 2 === 0) || neverZero(m))) || m.k === 'sqrt' || (m.k === 'fn' && m.name === 'abs') || (m.k === 'mul' && m.factors.every(nonneg)) || (m.k === 'add' && m.terms.every(nonneg));
  switch (n.k) {
    case 'num': return n.v !== 0;
    case 'neg': return neverZero(n.arg);
    case 'pow': return (n.base.k === 'sym' && n.base.name === 'e') || (n.base.k === 'num' && n.base.v > 0) || (n.exp.k === 'num' && n.exp.v > 0 && neverZero(n.base));
    case 'mul': return n.factors.every(neverZero);
    case 'frac': return neverZero(n.num);
    case 'add': return n.terms.every(nonneg) && n.terms.some(t => t.k === 'num' && t.v > 0);
    default: return false;
  }
}

export function solvedFor(e: Eq): string | null {
  // an expression (a limit that came out as e) isn't solved for anything
  if (e.rel === 'expr' || e.rel === 'def') return null;
  for (const [a, b] of [[e.lhs, e.rhs], [e.rhs, e.lhs]] as const) {
    if (a.k === 'sym' && !isDiff(a.name) && !a.name.startsWith('d²') && a.name !== 'e' && a.name !== 'π' && !symbols(b).includes(a.name)) return a.name;
  }
  return null;
}
