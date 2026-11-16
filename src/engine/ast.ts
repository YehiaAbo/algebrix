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
export interface Eq extends Base { k: 'eq'; lhs: Node; rhs: Node }
export type Node = Num | Sym | Add | Mul | Neg | Frac | Pow | Sqrt | Eq;

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
export const eq = (lhs: Node, rhs: Node): Eq => ({ k: 'eq', id: 'eq', lhs, rhs });

export function children(n: Node): Node[] {
  switch (n.k) {
    case 'num': case 'sym': return [];
    case 'add': return n.terms;
    case 'mul': return n.factors;
    case 'neg': case 'sqrt': return [n.arg];
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
    case 'neg': case 'sqrt': return { ...n, arg: kids[0] };
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
    case 'eq': return '(= ' + key(n.lhs) + ' ' + key(n.rhs) + ')';
  }
}

export type Env = Record<string, number>;
export function evaluate(n: Node, env: Env): number {
  switch (n.k) {
    case 'num': return n.v;
    case 'sym': return n.name in env ? env[n.name] : NaN;
    case 'add': return n.terms.reduce((s, t) => s + evaluate(t, env), 0);
    case 'mul': return n.factors.reduce((s, t) => s * evaluate(t, env), 1);
    case 'neg': return -evaluate(n.arg, env);
    case 'frac': return evaluate(n.num, env) / evaluate(n.den, env);
    case 'pow': return Math.pow(evaluate(n.base, env), evaluate(n.exp, env));
    case 'sqrt': return Math.sqrt(evaluate(n.arg, env));
    case 'eq': return evaluate(n.lhs, env) - evaluate(n.rhs, env);
  }
}

export function symbols(n: Node): string[] {
  const s = new Set<string>();
  walk(n, m => { if (m.k === 'sym') s.add(m.name); });
  return [...s].sort();
}

export const hasSymbols = (n: Node) => symbols(n).length > 0;

export function allIds(n: Node): string[] {
  const ids: string[] = [];
  walk(n, m => ids.push(m.id));
  return ids;
}
