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
export type FnName = 'sin' | 'cos' | 'tan' | 'asin' | 'acos' | 'atan' | 'ln' | 'log' | 'abs';
export interface Fn extends Base { k: 'fn'; name: FnName; arg: Node }
/** a named function you defined, like f(x + 1) */
export interface Call extends Base { k: 'call'; name: string; arg: Node }
/** d/dv of arg. dep: variables that depend on v (implicit differentiation): d/dx y = y′ */
export interface Deriv extends Base { k: 'deriv'; v: string; arg: Node; dep?: string[] }
/** the limit of arg as v goes to `to` (from one side with side); v is bound inside */
export interface Lim extends Base { k: 'lim'; v: string; to: Node; side?: '+' | '-'; arg: Node }
/** How the two sides relate. 'expr' is a lone expression (the right side is an unused 0);
 *  '≟' is an identity to prove: each side may only be rewritten into an equal form. */
export type Rel = '=' | '<' | '>' | '≤' | '≥' | 'expr' | '≟' | 'def';
export interface Eq extends Base { k: 'eq'; lhs: Node; rhs: Node; rel?: Rel }
export type Node = Num | Sym | Add | Mul | Neg | Frac | Pow | Sqrt | Fn | Call | Deriv | Lim | Eq;

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
export const lim = (v: string, to: Node, arg: Node, side?: '+' | '-', id = newId()): Lim => (side ? { k: 'lim', id, v, to, arg, side } : { k: 'lim', id, v, to, arg });
/** the name of a derivative: y → y′, f′ → f″ */
export const primed = (name: string) => name + '′';
/** names that read as function calls when followed by "(" */
export const FUNC_NAMES = ['f', 'g', 'h'];
/** the functions defined so far (name → parameter and body); the app keeps this in sync with your definitions */
export const DEFS = new Map<string, { param: string; body: Node }>();
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
    case 'neg': case 'sqrt': case 'fn': case 'call': case 'deriv': return [n.arg];
    case 'lim': return [n.to, n.arg];
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
    case 'neg': case 'sqrt': case 'fn': case 'call': case 'deriv': return { ...n, arg: kids[0] };
    case 'lim': return { ...n, to: kids[0], arg: kids[1] };
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
    case 'deriv': return '(d/d' + n.v + (n.dep ? '[' + n.dep.join(',') + ']' : '') + ' ' + key(n.arg) + ')';
    case 'lim': return '(lim ' + n.v + ' ' + key(n.to) + (n.side ?? '') + ' ' + key(n.arg) + ')';
    case 'eq': return '(' + (n.rel ?? '=') + ' ' + key(n.lhs) + ' ' + key(n.rhs) + ')';
  }
}

export type Env = Record<string, number>;
export function evaluate(n: Node, env: Env): number {
  switch (n.k) {
    case 'num': return n.v;
    case 'sym': return n.name in env ? env[n.name] : n.name in CONSTS ? CONSTS[n.name] : NaN;
    case 'add': return n.terms.reduce((s, t) => s + evaluate(t, env), 0);
    case 'mul': return n.factors.reduce((s, t) => s * evaluate(t, env), 1);
    case 'neg': return -evaluate(n.arg, env);
    case 'frac': return evaluate(n.num, env) / evaluate(n.den, env);
    case 'pow': return Math.pow(evaluate(n.base, env), evaluate(n.exp, env));
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
    case 'eq': return evaluate(n.lhs, env) - evaluate(n.rhs, env);
  }
}

/** the free variables: a limit's variable is bound inside it, and d/dx y brings in y′ */
export function symbols(n: Node): string[] {
  const s = new Set<string>();
  const visit = (m: Node, bound: Set<string>) => {
    if (m.k === 'sym') { if (!(m.name in CONSTS) && !bound.has(m.name)) s.add(m.name); return; }
    if (m.k === 'lim') { visit(m.to, bound); visit(m.arg, new Set([...bound, m.v])); return; }
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
  primeDef: (name: string) => { param: string; body: Node } | undefined;
} = { derive: () => null, limit: () => NaN, primeDef: () => undefined };

export const hasSymbols = (n: Node) => symbols(n).length > 0;

export function allIds(n: Node): string[] {
  const ids: string[] = [];
  walk(n, m => ids.push(m.id));
  return ids;
}
