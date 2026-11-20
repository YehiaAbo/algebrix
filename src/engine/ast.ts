// Expression tree with stable node ids. Ids survive moves so the renderer can
// animate "the same 3x" from its old place to its new one.

interface Base { id: string; from?: string }
export interface Num extends Base { k: 'num'; v: number }
export interface Sym extends Base { k: 'sym'; name: string }
export interface Add extends Base { k: 'add'; terms: Node[] }
export interface Mul extends Base { k: 'mul'; factors: Node[] }
export interface Neg extends Base { k: 'neg'; arg: Node }
export interface Frac extends Base { k: 'frac'; num: Node; den: Node }
export interface Pow extends Base { k: 'pow'; base: Node; exp: Node }
export interface Sqrt extends Base { k: 'sqrt'; arg: Node }
/** how a function name is written */
export const FN_TEXT: Record<string, string> = { asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹' };
export type FnName = 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan' | 'ln' | 'log' | 'abs' | 'fact';
export interface Fn extends Base { k: 'fn'; name: FnName; arg: Node }
/** a named function you defined, like f(x + 1) */
export interface Call extends Base { k: 'call'; name: string; arg: Node }
/** d/dv of arg. dep: variables that depend on v (implicit differentiation): d/dx y = y′ */
export interface Deriv extends Base { k: 'deriv'; v: string; arg: Node; dep?: string[]; partial?: boolean }
/** the limit of arg as v goes to `to` (from one side with side); v is bound inside */
export interface Lim extends Base { k: 'lim'; v: string; to: Node; side?: '+' | '-'; arg: Node }
/** ∫ arg dv, from lo to hi when both are there (then v is bound inside) */
export interface Int extends Base { k: 'int'; v: string; arg: Node; lo?: Node; hi?: Node }
/** [arg] from v = lo to v = hi: what an antiderivative is worth between two bounds */
export interface At extends Base { k: 'at'; v: string; arg: Node; lo: Node; hi: Node }
/** Σ arg for v = lo to hi (hi may be ∞), or ∏ when prod; v is bound inside */
export interface Sum extends Base { k: 'sum'; v: string; lo: Node; hi: Node; arg: Node; prod?: boolean }
/** a vector ⟨a, b, c⟩ */
export interface Vec extends Base { k: 'vec'; items: Node[] }
/** ∇f: the vector of partial derivatives along vars. With op, ∇·F (divergence) or ∇×F (curl) of a field ⟨…⟩ */
export interface Grad extends Base { k: 'grad'; arg: Node; vars: string[]; op?: 'div' | 'curl' }
/** How the two sides relate. 'expr' is a lone expression (the right side is an unused 0);
 *  '≟' is an identity to prove: each side may only be rewritten into an equal form. */
export type Rel = '=' | '<' | '>' | '≤' | '≥' | 'expr' | '≟' | 'def';
export interface Eq extends Base { k: 'eq'; lhs: Node; rhs: Node; rel?: Rel }
export type Node = Num | Sym | Add | Mul | Neg | Frac | Pow | Sqrt | Fn | Call | Deriv | Lim | Int | At | Sum | Vec | Grad | Eq;

/** Named constants: they look like symbols but are never variables. */
export const CONSTS: Record<string, number> = { e: Math.E, π: Math.PI, '∞': Infinity };
export const isConst = (n: Node) => n.k === 'sym' && n.name in CONSTS;

let counter = 0;
export const newId = (): string => 'n' + (++counter).toString(36);
/** Make sure future ids never collide with ids already in `root` (after restoring saved state). */
export function bumpIds(root: Node) {
  walk(root, n => {
    const m = /^n([0-9a-z]+)$/.exec(n.id);
    if (m) counter = Math.max(counter, parseInt(m[1], 36));
  });
}

export const num = (v: number, id = newId()): Num => ({ k: 'num', id, v: v === 0 ? 0 : v });
export const sym = (name: string, id = newId()): Sym => ({ k: 'sym', id, name });
export const add = (terms: Node[], id = newId()): Add => ({ k: 'add', id, terms });
export const mul = (factors: Node[], id = newId()): Mul => ({ k: 'mul', id, factors });
export const neg = (arg: Node, id = newId()): Neg => ({ k: 'neg', id, arg });
export const frac = (n: Node, d: Node, id = newId()): Frac => ({ k: 'frac', id, num: n, den: d });
export const pow = (base: Node, exp: Node, id = newId()): Pow => ({ k: 'pow', id, base, exp });
export const sqrt = (arg: Node, id = newId()): Sqrt => ({ k: 'sqrt', id, arg });
export const fn = (name: FnName, arg: Node, id = newId()): Fn => ({ k: 'fn', id, name, arg });
export const call = (name: string, arg: Node, id = newId()): Call => ({ k: 'call', id, name, arg });
export const deriv = (v: string, arg: Node, dep?: string[], id = newId()): Deriv => (dep?.length ? { k: 'deriv', id, v, arg, dep } : { k: 'deriv', id, v, arg });
/** ∂/∂v: other variables held constant */
export const partial = (v: string, arg: Node, id = newId()): Deriv => ({ k: 'deriv', id, v, arg, partial: true });
export const vec = (items: Node[], id = newId()): Vec => ({ k: 'vec', id, items });
export const grad = (arg: Node, vars: string[], id = newId(), op?: 'div' | 'curl'): Grad => (op ? { k: 'grad', id, arg, vars, op } : { k: 'grad', id, arg, vars });
/** ∇·F or ∇×F, the letters x, y, z as many as F has entries */
export const fieldOp = (op: 'div' | 'curl', F: Node, id = newId()): Grad => grad(F, ['x', 'y', 'z'].slice(0, F.k === 'vec' ? F.items.length : 3), id, op);
/** the variables of a function in the usual order: x, y, z first */
export const varOrder = (vs: string[]) => [...vs].sort((a, b) => { const r = (v: string) => { const i = ['x', 'y', 'z', 't'].indexOf(v); return i < 0 ? 9 : i; }; return r(a) - r(b) || a.localeCompare(b); });
export const lim = (v: string, to: Node, arg: Node, side?: '+' | '-', id = newId()): Lim => (side ? { k: 'lim', id, v, to, arg, side } : { k: 'lim', id, v, to, arg });
export const int = (v: string, arg: Node, lo?: Node, hi?: Node, id = newId()): Int => (lo && hi ? { k: 'int', id, v, arg, lo, hi } : { k: 'int', id, v, arg });
export const at = (v: string, arg: Node, lo: Node, hi: Node, id = newId()): At => ({ k: 'at', id, v, arg, lo, hi });
export const sum = (v: string, lo: Node, hi: Node, arg: Node, id = newId(), prod = false): Sum => (prod ? { k: 'sum', id, v, lo, hi, arg, prod } : { k: 'sum', id, v, lo, hi, arg });
/** the name of a derivative: y → y′, f′ → f″ */
export const primed = (name: string) => name + '′';
/** a differential: dx, dy, dt (a letter of its own, d + one letter; written with an upright d) */
export const isDiff = (name: string) => /^d[a-zA-Zα-ω]$/.test(name);
/** d²y: the top of a second derivative d²y/dx² */
export const isDiff2 = (name: string) => /^d²[a-zA-Zα-ω]$/.test(name);
/** d²y/dx²: the second derivative as a fraction, d²y over (dx)² */
export const isLeibniz2 = (n: Node): boolean =>
  n.k === 'frac' && n.num.k === 'sym' && isDiff2(n.num.name) && n.den.k === 'pow' && n.den.base.k === 'sym' && isDiff(n.den.base.name) && n.den.exp.k === 'num' && n.den.exp.v === 2;
/** names that read as function calls when followed by "(" */
export const FUNC_NAMES = ['f', 'g', 'h'];
/** the functions defined so far (name → parameter and body); the app keeps this in sync with your definitions */
export const DEFS = new Map<string, { param: string; body: Node }>();
/** the letters you named (b): u → x², x → sin θ. A named letter is tied to the letters it was
 *  made from, so calculus treats it as changing with them (∫ cos u dx is not cos u · x) */
export const LETS = new Map<string, Node>();
/** the letters that change with v through a name: u when u = x², θ when x = sin θ */
export function linkedTo(v: string): string[] {
  const out = new Set<string>();
  for (const [u, e] of LETS) {
    const vs = symbols(e);
    if (vs.includes(v)) out.add(u);
    if (u === v) vs.forEach(w => out.add(w));
  }
  out.delete(v);
  return [...out];
}
let callDepth = 0;
export const eq = (lhs: Node, rhs: Node, rel?: Rel): Eq => (rel && rel !== '=' ? { k: 'eq', id: 'eq', lhs, rhs, rel } : { k: 'eq', id: 'eq', lhs, rhs });
export const relOf = (e: Eq): Rel => e.rel ?? '=';
export const isIneq = (e: Eq) => ['<', '>', '≤', '≥'].includes(relOf(e));
/** the same relation read from the other side: a < b ⇔ b > a */
export const flipRel = (r: Rel): Rel => (({ '<': '>', '>': '<', '≤': '≥', '≥': '≤' } as Record<string, Rel>)[r] ?? r);
/** does the relation hold at this point? (NaN when either side is undefined) */
export function holds(e: Eq, env: Env): boolean | null {
  const d = evaluate(e.lhs, env) - evaluate(e.rhs, env);
  if (!Number.isFinite(d)) return null;
  const tol = 1e-9 * (1 + Math.abs(evaluate(e.lhs, env)));
  switch (relOf(e)) {
    case '<': return d < -tol;
    case '>': return d > tol;
    case '≤': return d <= tol;
    case '≥': return d >= -tol;
    default: return Math.abs(d) <= tol;
  }
}

export function children(n: Node): Node[] {
  switch (n.k) {
    case 'num': case 'sym': return [];
    case 'add': return n.terms;
    case 'mul': return n.factors;
    case 'neg': case 'sqrt': case 'fn': case 'call': case 'deriv': case 'grad': return [n.arg];
    case 'vec': return n.items;
    case 'lim': return [n.to, n.arg];
    case 'int': return n.lo && n.hi ? [n.lo, n.hi, n.arg] : [n.arg];
    case 'at': return [n.arg, n.lo, n.hi];
    case 'sum': return [n.lo, n.hi, n.arg];
    case 'frac': return [n.num, n.den];
    case 'pow': return [n.base, n.exp];
    case 'eq': return [n.lhs, n.rhs];
  }
}

/** Same node (same id), new children. */
export function withChildren<T extends Node>(n: T, kids: Node[]): T {
  switch (n.k) {
    case 'num': case 'sym': return n;
    case 'add': return { ...n, terms: kids };
    case 'mul': return { ...n, factors: kids };
    case 'neg': case 'sqrt': case 'fn': case 'call': case 'deriv': case 'grad': return { ...n, arg: kids[0] };
    case 'vec': return { ...n, items: kids };
    case 'lim': return { ...n, to: kids[0], arg: kids[1] };
    case 'int': return n.lo && n.hi ? { ...n, lo: kids[0], hi: kids[1], arg: kids[2] } : { ...n, arg: kids[0] };
    case 'at': return { ...n, arg: kids[0], lo: kids[1], hi: kids[2] };
    case 'sum': return { ...n, lo: kids[0], hi: kids[1], arg: kids[2] };
    case 'frac': return { ...n, num: kids[0], den: kids[1] };
    case 'pow': return { ...n, base: kids[0], exp: kids[1] };
    case 'eq': return { ...n, lhs: kids[0], rhs: kids[1] };
  }
  return n;
}

export function walk(n: Node, visit: (n: Node, parent: Node | null) => void, parent: Node | null = null) {
  visit(n, parent);
  for (const c of children(n)) walk(c, visit, n);
}

/** Deep copy with fresh ids; every copied node remembers which node it was copied from. */
export function cloneFresh<T extends Node>(n: T): T {
  const kids = children(n).map(cloneFresh);
  const copy = withChildren({ ...n }, kids) as T;
  copy.id = newId();
  copy.from = n.id;
  return copy;
}

/** Ancestors from the root down to the node with `id` (inclusive), or null. */
export function findPath(root: Node, id: string): Node[] | null {
  if (root.id === id) return [root];
  for (const c of children(root)) {
    const p = findPath(c, id);
    if (p) return [root, ...p];
  }
  return null;
}

export function find(root: Node, id: string): Node | null {
  const p = findPath(root, id);
  return p ? p[p.length - 1] : null;
}

export function replace<T extends Node>(root: T, id: string, repl: Node): T {
  if (root.id === id) return repl as T;
  const kids = children(root);
  let changed = false;
  const next = kids.map(c => {
    const r = replace(c, id, repl);
    if (r !== c) changed = true;
    return r;
  });
  return changed ? withChildren(root, next) : root;
}

/** Structural key, ignoring ids. Equal keys = identical expressions. */
export function key(n: Node): string {
  switch (n.k) {
    case 'num': return String(n.v);
    case 'sym': return n.name;
    case 'add': return '(+ ' + n.terms.map(key).join(' ') + ')';
    case 'mul': return '(* ' + n.factors.map(key).join(' ') + ')';
    case 'neg': return '(- ' + key(n.arg) + ')';
    case 'frac': return '(/ ' + key(n.num) + ' ' + key(n.den) + ')';
    case 'pow': return '(^ ' + key(n.base) + ' ' + key(n.exp) + ')';
    case 'sqrt': return '(sqrt ' + key(n.arg) + ')';
    case 'fn': return '(' + n.name + ' ' + key(n.arg) + ')';
    case 'call': return '(call ' + n.name + ' ' + key(n.arg) + ')';
    case 'deriv': return '(' + (n.partial ? '∂' : 'd') + '/d' + n.v + (n.dep ? '[' + n.dep.join(',') + ']' : '') + ' ' + key(n.arg) + ')';
    case 'vec': return '(vec ' + n.items.map(key).join(' ') + ')';
    case 'grad': return '(' + (n.op ?? 'grad') + ' ' + n.vars.join(',') + ' ' + key(n.arg) + ')';
    case 'lim': return '(lim ' + n.v + ' ' + key(n.to) + (n.side ?? '') + ' ' + key(n.arg) + ')';
    case 'int': return '(int ' + n.v + (n.lo && n.hi ? ' ' + key(n.lo) + ' ' + key(n.hi) : '') + ' ' + key(n.arg) + ')';
    case 'at': return '(at ' + n.v + ' ' + key(n.lo) + ' ' + key(n.hi) + ' ' + key(n.arg) + ')';
    case 'sum': return (n.prod ? '(prod ' : '(sum ') + n.v + ' ' + key(n.lo) + ' ' + key(n.hi) + ' ' + key(n.arg) + ')';
    case 'eq': return '(' + (n.rel ?? '=') + ' ' + key(n.lhs) + ' ' + key(n.rhs) + ')';
  }
}

export type Env = Record<string, number>;
export function evaluate(n: Node, env: Env): number {
  switch (n.k) {
    case 'num': return n.v;
    case 'sym': return n.name in env ? env[n.name] : n.name in CONSTS ? CONSTS[n.name] : NaN;
    case 'add': return n.terms.reduce((s, t) => s + evaluate(t, env), 0);
    case 'mul': {
      // two vectors in a product: their dot product
      const vs = n.factors.filter(isVector);
      if (vs.length === 2) {
        const a = vectorValue(vs[0], env), b = vectorValue(vs[1], env);
        if (!a || !b || a.length !== b.length) return NaN;
        return n.factors.filter(f => !vs.includes(f)).reduce((s, t) => s * evaluate(t, env), a.reduce((s, x, i) => s + x * b[i], 0));
      }
      if (vs.length > 2) return NaN;
      return n.factors.reduce((s, t) => s * evaluate(t, env), 1);
    }
    case 'neg': return -evaluate(n.arg, env);
    case 'frac': return evaluate(n.num, env) / evaluate(n.den, env);
    case 'pow': {
      const b = evaluate(n.base, env), x = evaluate(n.exp, env);
      // an odd root of a negative is real: (−8)^(1/3) = −2, (−8)^(2/3) = 4
      if (b < 0 && !Number.isInteger(x)) {
        const e = n.exp.k === 'neg' ? n.exp.arg : n.exp, sg = n.exp.k === 'neg' ? -1 : 1;
        if (e.k === 'frac' && e.num.k === 'num' && e.den.k === 'num' && Number.isInteger(e.num.v) && Number.isInteger(e.den.v) && Math.abs(e.den.v) % 2 === 1) {
          const m = Math.pow(-b, x);
          return Math.abs(e.num.v * sg) % 2 === 0 ? m : -m;
        }
      }
      return Math.pow(b, x);
    }
    case 'sqrt': return Math.sqrt(evaluate(n.arg, env));
    case 'fn': {
      const a = evaluate(n.arg, env);
      switch (n.name) {
        case 'sin': return Math.sin(a);
        case 'cos': return Math.cos(a);
        case 'tan': return Math.abs(Math.cos(a)) < 1e-9 ? NaN : Math.tan(a);
        case 'asin': return Math.asin(a);
        case 'acos': return Math.acos(a);
        case 'atan': return Math.atan(a);
        case 'ln': return a > 0 ? Math.log(a) : NaN;
        case 'log': return a > 0 ? Math.log10(a) : NaN;
        case 'abs': return Math.abs(a);
        case 'fact': return a >= 0 && a <= 170 && Number.isInteger(a) ? factorial(a) : CALC.gamma(a + 1);
      }
      return NaN;
    }
    case 'call': {
      const d = DEFS.get(n.name) ?? CALC.primeDef(n.name);
      if (!d || callDepth > 40) return NaN;
      callDepth++;
      try { return evaluate(d.body, { ...env, [d.param]: evaluate(n.arg, env) }); } finally { callDepth--; }
    }
    case 'deriv': { const d = CALC.derive(n); return d ? evaluate(d, env) : NaN; }
    case 'lim': return CALC.limit(n, env);
    case 'int': return n.lo && n.hi ? CALC.integral(n, env) : NaN;
    case 'at': return evaluate(n.arg, { ...env, [n.v]: evaluate(n.hi, env) }) - evaluate(n.arg, { ...env, [n.v]: evaluate(n.lo, env) });
    case 'sum': return CALC.series(n, env);
    case 'grad': if (n.op && !isVector(n)) return fieldValue(n, env) as number;
    // falls through
    case 'vec': { const v = vectorValue(n, env); return v ? project(v) : NaN; }
    case 'eq': return evaluate(n.lhs, env) - evaluate(n.rhs, env);
  }
}

/** the free variables: a limit's variable is bound inside it, and d/dx y brings in y′ */
export function symbols(n: Node): string[] {
  const s = new Set<string>();
  const visit = (m: Node, bound: Set<string>) => {
    if (m.k === 'sym') { if (!(m.name in CONSTS) && !bound.has(m.name)) s.add(m.name); return; }
    if (m.k === 'lim') { visit(m.to, bound); visit(m.arg, new Set([...bound, ...m.v.split(',')])); return; }
    if ((m.k === 'int' && m.lo && m.hi) || m.k === 'at' || m.k === 'sum') { children(m).forEach(c => visit(c, c === m.arg ? new Set([...bound, m.v]) : bound)); return; }
    if (m.k === 'deriv' && m.dep) { const inner = new Set<string>(); walk(m.arg, q => { if (q.k === 'sym') inner.add(q.name); }); m.dep.forEach(w => { if (inner.has(w) && !bound.has(w)) s.add(primed(w)); }); }
    children(m).forEach(c => visit(c, bound));
  };
  visit(n, new Set());
  return [...s].sort();
}

/** what calculus.ts supplies, so evaluating a derivative or a limit needs no import cycle */
export const CALC: {
  derive: (n: Deriv) => Node | null;
  limit: (n: Lim, env: Env) => number;
  integral: (n: Int, env: Env) => number;
  series: (n: Sum, env: Env) => number;
  gamma: (x: number) => number;
  partialOf: (n: Node, v: string) => Node | null;
  primeDef: (name: string) => { param: string; body: Node } | undefined;
} = { derive: () => null, limit: () => NaN, integral: () => NaN, series: () => NaN, gamma: () => NaN, partialOf: () => null, primeDef: () => undefined };

/** A vector is checked through one fixed, irrational mix of its entries: equal vectors give
 *  equal numbers, and different ones almost never do. Sums and multiples keep the mix. */
const WEIGHTS = [1, Math.SQRT2, Math.sqrt(3), Math.sqrt(5), Math.sqrt(7), Math.sqrt(11)];
const project = (v: number[]) => v.reduce((s, x, i) => s + x * WEIGHTS[i % WEIGHTS.length] * (1 + Math.floor(i / WEIGHTS.length)), 0);

/** is this piece a vector (so a product of two is a dot product)? */
export function isVector(n: Node): boolean {
  switch (n.k) {
    case 'vec': return true;
    case 'grad': return n.op === 'div' ? false : n.op === 'curl' ? n.vars.length === 3 : true;
    case 'neg': return isVector(n.arg);
    case 'mul': return n.factors.filter(isVector).length === 1;
    case 'frac': return isVector(n.num) && !isVector(n.den);
    case 'add': return n.terms.length > 0 && n.terms.every(isVector);
    default: return false;
  }
}

/** a vector's entries */
export function vectorValue(n: Node, env: Env): number[] | null {
  switch (n.k) {
    case 'vec': return n.items.map(i => evaluate(i, env));
    case 'grad': if (n.op) { const f = fieldValue(n, env); return Array.isArray(f) ? f : null; }
      return n.vars.map(v => { const d = CALC.partialOf(n.arg, v); return d ? evaluate(d, env) : NaN; });
    case 'neg': { const a = vectorValue(n.arg, env); return a && a.map(x => -x); }
    case 'mul': {
      const v = n.factors.find(isVector);
      const a = v ? vectorValue(v, env) : null;
      if (!a) return null;
      const k = n.factors.filter(f => f !== v).reduce((s, t) => s * evaluate(t, env), 1);
      return a.map(x => x * k);
    }
    case 'frac': { const a = vectorValue(n.num, env); const k = evaluate(n.den, env); return a && a.map(x => x / k); }
    case 'add': {
      const vs = n.terms.map(t => vectorValue(t, env));
      if (vs.some(v => !v || v.length !== vs[0]!.length)) return null;
      return vs[0]!.map((_, i) => vs.reduce((s, v) => s + v![i], 0));
    }
    default: return null;
  }
}

function factorial(n: number) { let p = 1; for (let i = 2; i <= n; i++) p *= i; return p; }

export const hasSymbols = (n: Node) => symbols(n).length > 0;

export function allIds(n: Node): string[] {
  const ids: string[] = [];
  walk(n, m => ids.push(m.id));
  return ids;
}

/** ∇·F (a number) or ∇×F (a vector in 3D, a number in 2D) of a field written out as ⟨P, Q, R⟩ */
function fieldValue(n: Grad, env: Env): number | number[] {
  const F = n.arg;
  if (F.k !== 'vec' || F.items.length !== n.vars.length) return NaN;
  const d = (i: number, v: string) => { const p = CALC.partialOf(F.items[i], v); return p ? evaluate(p, env) : NaN; };
  const [x, y, z] = n.vars;
  if (n.op === 'div') return n.vars.reduce((s, v, i) => s + d(i, v), 0);
  if (n.vars.length === 2) return d(1, x) - d(0, y);
  if (n.vars.length !== 3) return NaN;
  return [d(2, y) - d(1, z), d(0, z) - d(2, x), d(1, x) - d(0, y)];
}
