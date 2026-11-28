// Functions on both sides: apply one (√, ln, sin⁻¹, your own), peel the outer one off a side, and
// move anything across "=" (m). The f menu's list of them is in ui/fntabs.ts.
import { Node, Eq, logBase, children, withChildren, findPath, cloneFresh, num, sym, add, frac, pow, sqrt, fn, eq, evaluate, Env, symbols, hasSymbols, walk, key, relOf, call, DEFS, oneToOne } from './ast';
import { parseExpr } from './parse';
import { simplify, newHints, nonneg as isNonneg } from './simplify';
import { toText } from './print';
import { MoveOk, MoveResult, CheckedResult, isErr, moveAcross, divideBoth, multiplyBoth, checked, neverZero } from './moves';

const t = (n: Node) => toText(n);
const one = () => 1;

/* ---------- functions on both sides ---------- */

export type Wrap = 'square' | 'cube' | 'power' | 'recip' | 'sqrt' | 'cbrt' | 'root'
  | 'exp' | 'pow10' | 'powb' | 'ln' | 'log' | 'logb' | 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan';


const nonNeg = (n: Node) => (n.k === 'num' && n.v >= 0) || n.k === 'sqrt' || (n.k === 'fn' && n.name === 'abs') || (n.k === 'pow' && n.exp.k === 'num' && n.exp.v % 2 === 0) || (n.k === 'pow' && n.base.k === 'sym' && n.base.name === 'e');
const positive = (n: Node) => (n.k === 'num' && n.v > 0) || (n.k === 'pow' && n.base.k === 'sym' && n.base.name === 'e') || (n.k === 'pow' && n.base.k === 'num' && n.base.v > 0);
const fresh = (n: Node) => { const c = cloneFresh(n); walk(c, m => { m.from = undefined; }); return c; };

function wrapNode(s: Node, f: Wrap, arg: Node): Node {
  switch (f) {
    case 'square': return pow(s, num(2));
    case 'cube': return pow(s, num(3));
    case 'power': return pow(s, fresh(arg));
    case 'recip': return frac(num(1), s);
    case 'sqrt': return sqrt(s);
    case 'cbrt': return pow(s, frac(num(1), num(3)));
    case 'root': return pow(s, frac(num(1), fresh(arg)));
    case 'exp': return pow(sym('e'), s);
    case 'pow10': return pow(num(10), s);
    case 'powb': return pow(fresh(arg), s);
    case 'ln': return fn('ln', s);
    case 'log': return fn('log', s);
    case 'logb': return frac(fn('ln', s), fn('ln', fresh(arg)));
    default: return fn(f, s);
  }
}

const NUMERIC: Record<Wrap, (v: number, k: number) => number> = {
  square: v => v * v, cube: v => v ** 3, power: (v, k) => Math.pow(v, k), recip: v => 1 / v,
  sqrt: v => Math.sqrt(v), cbrt: v => Math.cbrt(v), root: (v, k) => (v < 0 && Number.isInteger(k) && k % 2 === 1 ? -Math.pow(-v, 1 / k) : Math.pow(v, 1 / k)),
  exp: v => Math.exp(v), pow10: v => 10 ** v, powb: (v, k) => Math.pow(k, v),
  ln: v => (v > 0 ? Math.log(v) : NaN), log: v => (v > 0 ? Math.log10(v) : NaN), logb: (v, k) => (v > 0 ? Math.log(v) / Math.log(k) : NaN),
  sin: Math.sin, cos: Math.cos, tan: v => Math.tan(v), asin: Math.asin, acos: Math.acos, atan: Math.atan,
};

const LABELS: Partial<Record<Wrap, string>> = {
  square: 'square both sides', cube: 'cube both sides', recip: 'flip both sides', sqrt: 'square root both sides',
  cbrt: 'cube root both sides', exp: 'e to both sides', pow10: '10 to both sides', ln: 'ln both sides', log: 'log both sides',
};

/** Wrap both sides in f. Pointwise checked: new side = f(old side). */
export function wrapBoth(e: Eq, f: Wrap, arg: Node = num(2)): MoveResult {
  // a power, root or base with letters in it (xⁿ, log_a): the same function, written with a hole for
  // each side and applied as any typed function is, plus what the letters have to be
  if (hasSymbols(arg)) {
    const r = applyFn(e, wrapNode(sym(HOLE), f, arg));
    if (isErr(r)) return r;
    const a = t(arg), conditions = [...(r.conditions ?? [])];
    const add = (c: string) => { if (!conditions.includes(c)) conditions.push(c); };
    if (f === 'power') { add(`${a} ≠ 0`); add('this can add solutions: check answers'); }
    if (f === 'root') { add(`${a} ≠ 0`); add('this can add solutions: check answers'); }
    if (f === 'powb' || f === 'logb') { add(`${a} > 0`); add(`${a} ≠ 1`); }
    const label = ({ power: `power ${a} both sides`, root: `root ${a} both sides`, powb: `${a} to both sides`, logb: `log base ${a} both sides` } as Record<string, string>)[f] ?? r.label;
    return { ...r, label, conditions };
  }
  const k = evaluate(arg, {});
  const a = t(arg);
  if (!Number.isFinite(k)) return { error: `${a} isn't a usable number.` };
  if (f === 'root' && k === 0) return { error: 'There is no 0th root.' };
  if (f === 'power' && k === 0) return { error: 'Raising to the power 0 turns both sides into 1 and loses the equation.' };
  if ((f === 'powb' || f === 'logb') && (k <= 0 || k === 1)) return { error: 'The base has to be positive and not 1.' };
  if (f === 'recip' && (key(e.lhs) === '0' || key(e.rhs) === '0')) return { error: 'A side is 0, and 1/0 is undefined.' };
  const L = wrapNode(e.lhs, f, arg), R = wrapNode(e.rhs, f, arg);
  const conditions: string[] = [];
  const sides = [e.lhs, e.rhs];
  const even = (x: number) => Number.isInteger(x) && x % 2 === 0;
  if (f === 'square' || (f === 'power' && even(k)) || f === 'sin' || f === 'cos' || f === 'tan') conditions.push('this can add solutions: check answers');
  if (f === 'sqrt' || (f === 'root' && !(Number.isInteger(k) && k % 2 === 1)) || (f === 'power' && !Number.isInteger(k))) sides.filter(s => !nonNeg(s) && hasSymbols(s)).forEach(s => conditions.push(`${t(s)} ≥ 0`));
  if (f === 'ln' || f === 'log' || f === 'logb') sides.filter(s => !positive(s)).forEach(s => conditions.push(`${t(s)} > 0`));
  if (f === 'recip' || (f === 'power' && k < 0)) sides.filter(s => hasSymbols(s) && !neverZero(s)).forEach(s => conditions.push(`${t(s)} ≠ 0`));
  if (f === 'asin' || f === 'acos') sides.filter(s => hasSymbols(s)).forEach(s => conditions.push(`−1 ≤ ${t(s)} ≤ 1`));
  const g = NUMERIC[f];
  const label = LABELS[f] ?? ({ power: `power ${a} both sides`, root: `${a}th root both sides`, powb: `${a} to both sides`, logb: `log base ${a} both sides` } as Record<string, string>)[f] ?? `${FN_LABEL[f] ?? f} both sides`;
  return {
    eq: eq(L, R), label, hints: newHints(), factor: one, select: null, conditions,
    check: env => [[evaluate(L, env), g(evaluate(e.lhs, env), k)], [evaluate(R, env), g(evaluate(e.rhs, env), k)]],
  };
}
const FN_LABEL: Partial<Record<Wrap, string>> = { asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹' };

/* ---------- any function on both sides ---------- */

const HOLE = '□';
/** what you typed as a function of each side: a name (ln, sin, I) or an expression with □ in it.
 *  _ and () stand for □ too, since □ is hard to type. */
export function fnTemplate(text: string): Node | { error: string } {
  const src = text.trim().replace(/\(\s*\)/g, `(${HOLE})`).replace(/_/g, HOLE);
  if (!src) return { error: 'Type a function: a name like ln or I, or an expression with _ for each side, like e^_ or _^2 + 1.' };
  let F: Node;
  // a name on its own: that function of each side
  const name = /^([A-Za-zα-ω]+(?:⁻¹|\^-1|\^\(-1\))?)$/.exec(src);
  try { F = name ? parseExpr(`${name[1]}(${HOLE})`) : parseExpr(src); } catch (err) { return { error: (err as Error).message }; }
  if (!symbols(F).includes(HOLE)) return { error: name ? `${name[1]} isn't a function here. Define it first (${name[1]}(t) = …), or write it with _ for each side.` : 'Write _ where each side goes, like e^_ or 1/(_ + 1).' };
  return F;
}

/** F(each side): F(L) = F(R). Holds whenever L = R; the way back needs F one-to-one, so a
 *  function that isn't (□², sin) is marked as one that can add solutions, and where F needs
 *  its input positive or ≥ 0 that is recorded for each side. */
export function applyFn(e: Eq, F: Node): MoveResult {
  if (relOf(e) === 'def') e = eq(e.lhs, e.rhs);
  if (relOf(e) !== '=') return { error: 'A function on both sides is for an equation (=).' };
  // the side itself goes into the first □ (it keeps its pieces, so they are carried in); copies into any others
  const put = (s: Node) => { let used = false; const go = (m: Node): Node => m.k === 'sym' && m.name === HOLE ? (used ? fresh(s) : (used = true, s)) : withChildren(m, children(m).map(go)); return go(fresh(F)); };
  const L = put(e.lhs), R = put(e.rhs);
  const params = symbols(F).filter(v => v !== HOLE);
  const at = (v: number, env: Env = {}) => evaluate(F, { ...Object.fromEntries(params.map(p => [p, 0.7])), ...env, [HOLE]: v });
  // one-to-one, read off a fine sweep: every step the same way where it is defined
  const grid = Array.from({ length: 97 }, (_, i) => -6 + i / 8);
  const ys = grid.map(v => at(v));
  const ok = ys.map((y, i) => [grid[i], y] as const).filter(([, y]) => Number.isFinite(y));
  const steps = ok.slice(1).map(([, y], i) => Math.sign(y - ok[i][1]));
  const conditions: string[] = [];
  if (steps.some(d => d === 0) || new Set(steps).size > 1) conditions.push('this can add solutions: check answers');
  // undefined below 0 (ln, √): the sides have to be where F is defined
  const neg = ok.length && grid.filter(v => v < 0).every(v => !Number.isFinite(at(v)));
  if (neg && ok.length) {
    const rel = Number.isFinite(at(0)) ? '≥ 0' : '> 0';
    [e.lhs, e.rhs].filter(s => hasSymbols(s) && !(rel === '≥ 0' ? isNonneg(s) : neverZero(s) && isNonneg(s))).forEach(s => conditions.push(`${t(s)} ${rel}`));
  }
  const show = t(F);
  return {
    eq: eq(L, R), label: `${show} both sides`, hints: newHints(), factor: one, select: null, conditions,
    check: env => [[evaluate(L, env), at(evaluate(e.lhs, env), env)], [evaluate(R, env), at(evaluate(e.rhs, env), env)]],
  };
}

/** The function that undoes the outer layer of a side, if there is one. */
export function inverseOf(side: Node): { f: Wrap; arg?: Node } | null {
  if (side.k === 'pow') {
    const { base, exp } = side;
    if (exp.k === 'num' && Number.isInteger(exp.v) && exp.v >= 2) return exp.v === 2 ? { f: 'sqrt' } : exp.v === 3 ? { f: 'cbrt' } : { f: 'root', arg: num(exp.v) };
    if (exp.k === 'num' && exp.v === -1) return { f: 'recip' };
    if (base.k === 'sym' && base.name === 'e') return { f: 'ln' };
    if (base.k === 'num' && base.v === 10) return { f: 'log' };
    if (base.k === 'num' && base.v > 0 && base.v !== 1 && hasSymbols(exp)) return { f: 'logb', arg: num(base.v) };
    if (exp.k === 'frac' && exp.num.k === 'num' && exp.num.v === 1 && !hasSymbols(exp.den)) return key(exp.den) === '3' ? { f: 'cube' } : { f: 'power', arg: exp.den };
    // any other fraction: raise to its reciprocal, (x − 1)^(3/4) to the 4/3
    if (exp.k === 'frac' && exp.num.k === 'num' && exp.den.k === 'num' && Number.isInteger(exp.num.v) && Number.isInteger(exp.den.v) && exp.num.v !== 0) return { f: 'power', arg: frac(num(exp.den.v), num(exp.num.v)) };
  }
  if (side.k === 'sqrt') return { f: 'square' };
  // log₂ A is undone by 2 to both sides
  const lb = logBase(side);
  if (lb) return { f: 'powb', arg: fresh(lb.base) };
  if (side.k === 'fn') {
    const m: Partial<Record<string, Wrap>> = { ln: 'exp', log: 'pow10', sin: 'asin', cos: 'acos', tan: 'atan', asin: 'sin', acos: 'cos', atan: 'tan' };
    if (m[side.name]) return { f: m[side.name]! };
  }
  if (side.k === 'frac' && side.num.k === 'num' && side.num.v === 1 && hasSymbols(side.den)) return { f: 'recip' };
  return null;
}

/** a function you defined (or its inverse) as the outer layer: f(x + 1), f⁻¹(y) */
export function yourCall(side: Node): string | null {
  if (side.k !== 'call') return null;
  const F = side.name.endsWith('⁻¹') ? side.name.slice(0, -2) : side.name;
  return DEFS.has(F) ? F : null;
}

/** f(A) = B → A = f⁻¹(B), and f⁻¹(A) = B → A = f(B): undoing a function of yours. Only a
 *  one-to-one f has an inverse that gives back every answer. */
function peelCall(e: Eq, s: 'lhs' | 'rhs'): MoveResult {
  const side = e[s] as Extract<Node, { k: 'call' }>, F = yourCall(side)!;
  const B = s === 'lhs' ? e.rhs : e.lhs;
  if (!oneToOne(F)) return { error: `${F} isn't one-to-one (two inputs give the same value), so undoing it would lose answers. Unfold it (Tab u) and solve that.` };
  const back = side.name === F ? `${F}⁻¹` : F;
  const R = call(back, B);
  const A = side.arg;
  return {
    eq: s === 'lhs' ? eq(A, R) : eq(R, A), label: `${back} both sides`, hints: newHints(), factor: () => 1, select: null,
    check: env => [[evaluate(call(side.name, R), env), evaluate(B, env)]],
  };
}

/** Which side to peel: the aimed side, else the one holding the variables. */
function sideFor(e: Eq, sel: string | null): 'lhs' | 'rhs' {
  if (sel && sel !== 'eq') {
    const p = findPath(e, sel);
    if (p) return p[1] === e.lhs ? 'lhs' : 'rhs';
  }
  const l = inverseOf(e.lhs) || yourCall(e.lhs), r = inverseOf(e.rhs) || yourCall(e.rhs);
  if (l && !r) return 'lhs';
  if (r && !l) return 'rhs';
  return hasSymbols(e.lhs) || !hasSymbols(e.rhs) ? 'lhs' : 'rhs';
}

const TRIG_MORE: Record<string, string> = {
  sin: 'one solution of many: also π − that, and every 2π more',
  cos: 'one solution of many: also minus that, and every 2π more',
  tan: 'one solution of many: also every π more',
};

/** sin(X) = B → X = sin⁻¹(B). Checked by sin(arcsin B) = B; the lost solutions are noted. */
function peelTrig(e: Eq, s: 'lhs' | 'rhs'): MoveResult {
  const side = e[s] as Extract<Node, { k: 'fn' }>;
  const B = s === 'lhs' ? e.rhs : e.lhs;
  const inv = ('a' + side.name) as 'asin';
  if (!hasSymbols(B) && side.name !== 'tan' && Math.abs(evaluate(B, {})) > 1) return { error: `${side.name} never reaches ${t(B)}: no solutions.` };
  const R = fn(inv, B);
  const next = s === 'lhs' ? eq(side.arg, R) : eq(R, side.arg);
  const f = NUMERIC[side.name as Wrap];
  return {
    eq: next, label: `${FN_LABEL[inv]} both sides`, hints: newHints(), factor: one, select: null,
    conditions: [TRIG_MORE[side.name], ...(hasSymbols(B) && side.name !== 'tan' ? [`−1 ≤ ${t(B)} ≤ 1`] : [])],
    check: env => [[f(evaluate(R, env), 0), evaluate(B, env)]],
  };
}

export function peel(e: Eq, sel: string | null): MoveResult {
  const s = sideFor(e, sel);
  const side = e[s];
  if (side.k === 'fn' && side.name === 'abs') return { error: 'Absolute value has two cases. Hold e and press a to split it.' };
  if (side.k === 'fn' && (side.name === 'sin' || side.name === 'cos' || side.name === 'tan')) return peelTrig(e, s);
  if (yourCall(side)) return peelCall(e, s);
  const inv = inverseOf(side);
  if (!inv) return { error: `Nothing to undo on ${t(side)}. This works on powers, roots, exponentials, logs and trig.` };
  const r = wrapBoth(e, inv.f, inv.arg);
  if (isErr(r)) return r;
  // undoing means the function cancels on its own side; the other side is left for you to simplify
  const h = newHints();
  return { ...r, eq: s === 'lhs' ? eq(simplify(r.eq.lhs, h), r.eq.rhs) : eq(r.eq.lhs, simplify(r.eq.rhs, h)) };
}

/** "Move it across": the engine picks the inverse operation from what is aimed. */
export function moveAny(e: Eq, sel: string | null): CheckedResult {
  // every path goes through checked(), which also carries an inequality's sign (flipping it when needed)
  const r = moveAnyRaw(e, sel);
  return isErr(r) ? r : checked(e, r);
}

/** a whole side moved across stays aimed: what it became on the other side is held as one group
 *  (the app melts the group into the sum and keeps the aim on exactly those terms) */
function holdSide(e: Eq, side: Node, a: MoveOk): MoveResult {
  const n = side.k === 'add' ? side.terms.length : 1;
  const s = e.lhs === side ? 'rhs' : 'lhs', there = a.eq[s];
  if (n === 1 || there.k !== 'add') return { ...a, select: there.id };
  if (there.terms.length === n) return { ...a, select: there.id };
  const g = add(there.terms.slice(-n));
  const eq2 = { ...a.eq, [s]: { ...there, terms: [...there.terms.slice(0, -n), g] } };
  return { ...a, eq: eq2, select: g.id };
}

function moveAnyRaw(e: Eq, sel: string | null): MoveResult {
  if (!sel || sel === 'eq') return { error: 'Aim at a piece first (Space), then m moves it across the =.' };
  const path = findPath(e, sel);
  if (!path) return { error: 'Aim at a piece first.' };
  const node = path[path.length - 1], parent = path[path.length - 2], root = path[1];
  // m is always "move it across", a whole side too (x² = … leaves 0 there); f + i undoes an outer function
  const a = moveAcross(e, sel);
  if (!isErr(a)) return a.select || node !== root ? a : holdSide(e, root, a);
  if (parent === root && root.k === 'mul') return divideBoth(e, sel);
  if (root.k === 'frac' && (node === root.den || parent === root.den)) return multiplyBoth(e, sel);
  if (parent === root && root.k === 'pow' && node === root.exp) return peel(e, root.id);
  if (parent === root && root.k === 'pow' && node === root.base && inverseOf(root)) return peel(e, root.id);
  if (parent === root && (root.k === 'sqrt' || root.k === 'fn' || yourCall(root))) return peel(e, root.id);
  return a;
}
