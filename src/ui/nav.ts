// Aiming with the arrows, as pure functions over the tree. ↑ grows the aim, ↓ shrinks it,
// ← → walk to neighbours. A fraction is vertical: ↓ from its top goes to its bottom and
// ↑ from its bottom goes to its top. Each returns the id to aim at, or null at an edge
// (where nothing happens: the edge isn't a mistake, so nothing shakes).
import { Node, Eq, findPath, children as kidsOf } from '../engine/ast';

export interface NavView {
  root: Eq;
  /** the children that are drawn (a hidden ×1 or ×−1 is skipped) */
  kids(n: Node): Node[];
  /** two pieces drawn in exactly the same box (a group around one thing) */
  same(a: string, b: string): boolean;
  /** parent id → the child we last came up from, so ↓ goes back where you were */
  memory: Map<string, string>;
}

const LEAVES_INSIDE = ['frac', 'pow', 'sqrt', 'fn'];

function parentOf(v: NavView, id: string): Node | null {
  const p = findPath(v.root, id);
  return p && p.length > 1 ? p[p.length - 2] : null;
}

/** the fraction this piece is the top (or bottom) of, if any */
function fracPart(v: NavView, id: string): { f: Extract<Node, { k: 'frac' }>; top: boolean } | null {
  const p = parentOf(v, id);
  return p?.k === 'frac' ? { f: p, top: p.num.id === id } : null;
}

/** ↑: the bottom of a fraction goes to its top; otherwise the piece around this one */
export function up(v: NavView, sel: string | null): string {
  if (!sel) return 'eq';
  const fp = fracPart(v, sel);
  if (fp && !fp.top) return fp.f.num.id;
  let id = sel;
  let p = parentOf(v, id);
  while (p && v.same(p.id, id)) { v.memory.set(p.id, id); id = p.id; p = parentOf(v, id); }
  if (!p) return 'eq';
  v.memory.set(p.id, id);
  return p.id;
}

/** ↓: the top of a fraction goes to its bottom; otherwise into this piece (a fraction: its top) */
export function down(v: NavView, sel: string | null): string | null {
  if (!sel) return v.root.lhs.id;
  const fp = fracPart(v, sel);
  if (fp?.top) return fp.f.den.id;
  let n = findPath(v.root, sel)?.at(-1);
  while (n) {
    const kids = v.kids(n);
    if (!kids.length) return null;
    const remembered = n.k === 'frac' ? undefined : v.memory.get(n.id);
    const next = kids.find(k => k.id === remembered) ?? kids[0];
    if (v.same(next.id, n.id)) { n = next; continue; }
    return next.id;
  }
  return null;
}

/** ← →: the neighbour on that side. On the top or bottom of a fraction, walk into it. */
export function side(v: NavView, sel: string | null, dir: -1 | 1): string | null {
  if (!sel || sel === 'eq') {
    const firstOrLast = (n: Node): Node => { const k = v.kids(n); return n.k === 'add' && k.length ? (dir > 0 ? k[0] : k[k.length - 1]) : n; };
    return firstOrLast(dir > 0 ? v.root.lhs : v.root.rhs).id;
  }
  if (fracPart(v, sel)) {
    const here = findPath(v.root, sel)!.at(-1)!;
    const ks = v.kids(here);
    if (ks.length) return (dir > 0 ? ks[0] : ks[ks.length - 1]).id;
  }
  let id = sel;
  let climbed = 0;
  for (;;) {
    const p = parentOf(v, id);
    if (!p) return null;
    const sibs = v.kids(p);
    const j = sibs.findIndex(s => s.id === id) + dir;
    // top and bottom of a fraction aren't left/right of each other: step out instead
    if (p.k !== 'frac' && j >= 0 && j < sibs.length) {
      let n = sibs[j];
      for (let d = 0; d < climbed; d++) {
        const ks = v.kids(n);
        if (!ks.length || LEAVES_INSIDE.includes(n.k)) break;
        n = dir > 0 ? ks[0] : ks[ks.length - 1];
      }
      return n.id;
    }
    id = p.id;
    // leaving a fraction, power, root or function lands on the next piece itself, not deep inside it
    climbed = LEAVES_INSIDE.includes(p.k) ? 0 : climbed + 1;
  }
}

/** Shift+Tab: inside a fraction, flip between top and bottom; otherwise between the two sides */
export function flip(v: NavView, sel: string | null, dive: (n: Node) => Node): string {
  const path = sel && sel !== 'eq' ? findPath(v.root, sel) : null;
  if (path) {
    for (let i = path.length - 2; i >= 1; i--) {
      const f = path[i];
      if (f.k !== 'frac') continue;
      const target = path[i + 1] === f.num ? f.den : f.num;
      v.memory.set(f.id, target.id);
      return dive(target).id;
    }
  }
  return path?.[1] === v.root.lhs ? v.root.rhs.id : v.root.lhs.id;
}

/** the same piece in another tree of the same shape: a move that lands on a step taken before
 *  goes back to that step, whose pieces have their own ids (m, m, m … keeps its aim) */
export function carryAim(from: Node, to: Node, id: string): string | undefined {
  if (from.id === id) return to.id;
  const a = kidsOf(from), b = kidsOf(to);
  for (let i = 0; i < a.length && i < b.length; i++) { const r = carryAim(a[i], b[i], id); if (r) return r; }
  return undefined;
}

/** Where the aim goes after a move, so the arrows keep working without a fresh Space: what the
 *  move names; else the piece you had; else what the move made where it was (the new pieces'
 *  smallest common parent); else its nearest part that survived; else the whole equation. */
export function aimAfter(before: Eq, after: Eq, sel: string | null, select?: string | null): string | null {
  const ids = (n: Node, out = new Set<string>()) => { out.add(n.id); for (const c of kidsOf(n)) ids(c, out); return out; };
  const now = ids(after);
  if (select && (select === 'eq' || now.has(select))) return select;
  if (!sel) return null;
  if (sel === 'eq' || now.has(sel)) return sel;
  const old = ids(before);
  const path = findPath(before, sel) ?? [];
  const anc = [...path].reverse().find(n => n.k !== 'eq' && now.has(n.id)) ?? null;
  const fresh = [...now].filter(id => !old.has(id)).map(id => findPath(after, id)!).filter(Boolean);
  if (fresh.length) {
    let common = fresh[0];
    for (const p of fresh.slice(1)) { let i = 0; while (i < common.length && i < p.length && common[i].id === p[i].id) i++; common = common.slice(0, i); }
    const lca = common[common.length - 1];
    const inside = !anc || common.some(n => n.id === anc.id);
    if (lca && lca.k !== 'eq' && inside) return lca.id;
  }
  return anc?.id ?? 'eq';
}
