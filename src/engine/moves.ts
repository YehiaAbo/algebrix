// Legal moves. Each one is a small, explicit rewrite; `applyMove` then checks it
// numerically and refuses anything that isn't provably the same equation.
import {
  Node, Eq, Mul, find, findPath, replace, cloneFresh, num, add, mul, frac, eq,
  evaluate, Env, symbols, hasSymbols, allIds, key, Rel, relOf, flipRel, holds, walk, neg,
  isDiff, linkedTo, deriv, partial,
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
}

/** ⇔: the new equation has exactly the same solutions. ⇒: every old solution survives but new ones may
 *  appear (squaring both sides, multiplying by something that might be 0), so answers must be checked. */
export function direction(r: MoveOk): '⇔' | '⇒' {
  return r.implies || (r.conditions ?? []).some(c => c.includes('add solutions')) ? '⇒' : '⇔';
}
export type MoveResult = MoveOk | { error: string };
export const isErr = (r: MoveResult): r is { error: string } => 'error' in r;

export type MoveName = 'move' | 'divide' | 'multiply' | 'distribute' | 'simplify' | 'factor' | 'slideL' | 'slideR' | 'swap';

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
  // out: the first (or last) factor inside an operator slides out past its sign
  const inner = parent.k === 'mul' ? parent : null;
  const op = inner ? path[path.length - 3] : parent;
  if (isOp(op) && (inner ? op.arg === inner : op.arg === node) && dir === -1) {
    const fs = factorsOf(op.arg);
    if (fs.length < 2 || fs[0] !== node) return null;
    const bad = symbols(node).includes(op.v);
    if (bad) return { error: `${toText(node)} depends on ${op.v}, so it can't come out of ${opName(op)}.` };
    const out = { ...op, arg: product(fs.slice(1), inner!.id) } as Node;
    const host = path[path.length - 4];
    // already in a product: the factor takes its place beside the operator
    if (host?.k === 'mul') return { eq: replace(e, host.id, { ...host, factors: host.factors.flatMap(f => (f === op ? [node, out] : [f])) }), ...label(`${toText(node)} out of ${SIGN[op.k]}`) };
    return { eq: replace(e, op.id, mul([node, out])), ...label(`${toText(node)} out of ${SIGN[op.k]}`) };
  }
  // in: a factor next to an operator in a product slides into it
  if (parent.k === 'mul' && dir === 1) {
    const i = parent.factors.indexOf(node), nb = parent.factors[i + 1];
    if (!isOp(nb)) return null;
    if (symbols(node).includes(nb.v)) return { error: `${toText(node)} depends on ${nb.v}, so it can't go into ${opName(nb)}.` };
    const into = { ...nb, arg: product([node, ...factorsOf(nb.arg)], nb.arg.k === 'mul' ? nb.arg.id : undefined) } as Node;
    const rest = parent.factors.flatMap((f, j) => (j === i ? [] : j === i + 1 ? [into] : [f]));
    return { eq: replace(e, parent.id, product(rest, parent.id)), ...label(`${toText(node)} into ${SIGN[nb.k]}`) };
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

export function swapSides(e: Eq, sel: string | null): MoveResult {
  return { eq: eq(e.rhs, e.lhs), label: 'swap sides', hints: newHints(), factor: () => -1, select: sel };
}

const MOVES: Record<MoveName, (e: Eq, sel: string | null) => MoveResult> = {
  move: moveAcross, divide: divideBoth, multiply: multiplyBoth, distribute, simplify: simplifyMove,
  factor: factorMove, slideL: (e, s) => slide(e, s, -1), slideR: (e, s) => slide(e, s, 1), swap: swapSides,
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
    L = div(e.lhs, x); R = div(e.rhs, c);
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
  if (relOf(o) !== '=') return { error: `Equation ${j} isn’t an equation (it’s ${relOf(o) === 'expr' ? 'an expression' : 'an inequality or a definition'}), so it can’t be added to both sides.` };
  let k: Node;
  try { k = coefText.trim() ? parseExpr(coefText) : num(1); } catch (err) { return { error: (err as Error).message }; }
  if (hasSymbols(k)) return { error: 'Use a plain number to multiply the other equation by.' };
  const kv = evaluate(k, {});
  if (!Number.isFinite(kv) || kv === 0) return { error: 'Multiplying an equation by 0 adds nothing.' };
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
    check: env => [[evaluate(L, env) - evaluate(R, env), evaluate(e.lhs, env) - evaluate(e.rhs, env) + sgn * kv * (evaluate(o.lhs, env) - evaluate(o.rhs, env))]],
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
    const pairs: [number, number][] = r.check ? r.check(env) : (() => {
      const d0 = evaluate(before, env), d1 = evaluate(r.eq, env), f = r.factor(env);
      return Number.isFinite(f) && Number.isFinite(d0) ? [[d1, f * d0]] : [[NaN, NaN]];
    })();
    if (!pairs.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b))) { if (!vars.length) break; continue; }
    checked++;
    for (const [got, want] of pairs) {
      if (Math.abs(got - want) > 1e-6 * (1 + Math.abs(want) + Math.abs(got))) return `mismatch at ${JSON.stringify(env)}: ${got} vs ${want}`;
    }
  }
  if (checked < (vars.length ? 2 : 1)) return 'could not check: undefined almost everywhere';
  return null;
}

/* ---------- variable domains: which values each variable may take ---------- */
export type Domain = 'real' | 'positive' | 'nonneg' | 'integer';
let DOMAINS: Record<string, Domain> = {};
/** the app sets this so sign questions ("is x positive?") use what you declared */
export function setDomains(d: Record<string, Domain>) { DOMAINS = d; }
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
    return key(r.eq.lhs) === key(before.lhs) && !r.check && same(r.eq.rhs, before.rhs) ? 'def'
      : { error: 'This defines a function. You can rewrite its right side, but not move things across.' };
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

export function checked(e: Eq, r: MoveResult): MoveResult {
  if (isErr(r)) return r;
  const rel = relAfter(e, r);
  if (typeof rel !== 'string') return rel;
  if (relOf(r.eq) !== rel) r = { ...r, eq: eq(r.eq.lhs, r.eq.rhs, rel) };
  const problem = verify(e, r);
  if (problem) {
    console.error('[algebrix] refused move', r.label, problem);
    return { error: 'The engine refused this: it would not keep the equation true.' };
  }
  return r;
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
