// The simplify spot: the smallest piece that would simplify, offered with a dashed box (s takes it),
// never done on its own.
import { Node, Eq, find, children, allIds, findPath, symbols, walk, key, replace } from './ast';
import { simplify, newHints } from './simplify';
import { toText } from './print';
import { Checked, isErr, checked } from './moves';
import { isSubject } from './isolate';

const one = () => 1;

/* ---------- a possible simplification, offered instead of done automatically ---------- */

export interface Spot { node: string; marks: string[]; move: Checked }

/** The smallest piece that would simplify, the parts that would change, and the move that does it. */
const hasCalcNode = (n: Node) => { let f = false; walk(n, m => { if (['deriv', 'lim', 'int', 'at', 'sum', 'grad'].includes(m.k)) f = true; }); return f; };

/** kept: forms you said to leave as written (q), by key. A piece that is or holds one is not offered. */
export function simplifySpot(e: Eq, kept: Set<string> = new Set()): Spot | null {
  const skip = (n: Node) => { if (!kept.size) return false; let k = false; walk(n, m => { if (!k && kept.has(key(m))) k = true; }); return k; };
  let hit: { n: Node; r: Node; h: ReturnType<typeof newHints> } | null = null;
  const visit = (n: Node) => {
    for (const c of children(n)) { visit(c); if (hit) return; }
    if (hit || n.k === 'eq' || isSubject(e, n) || skip(n)) return;
    const h = newHints();
    const r = simplify(n, h);
    // a change you couldn't see isn't worth a press
    if (key(r) !== key(n) && toText(r) !== toText(n)) hit = { n, r, h };
  };
  visit(e);
  if (!hit) return null;
  // plain arithmetic goes all the way in one press: the largest piece with no letters around it
  const found = hit as { n: Node; r: Node; h: ReturnType<typeof newHints> };
  if (!symbols(found.n).length) {
    const top = findPath(e, found.n.id)?.find(m => m.k !== 'eq' && !symbols(m).length && !hasCalcNode(m) && !isSubject(e, m));
    if (top && top !== found.n && !skip(top)) {
      const h = newHints(), r = simplify(top, h);
      if (key(r) !== key(top) && toText(r) !== toText(top)) hit = { n: top, r, h };
    }
  }
  const { n, r, h } = hit as { n: Node; r: Node; h: ReturnType<typeof newHints> };
  const move = checked(e, { eq: replace(e, n.id, r), label: 'simplify', hints: h, factor: one, select: null });
  if (isErr(move)) return null;
  const left = new Set(allIds(move.eq));
  const marks: string[] = [];
  const gone = (m: Node) => { if (!left.has(m.id)) { marks.push(m.id); return; } children(m).forEach(gone); };
  children(n).forEach(gone);
  for (const [from, to] of h.absorbs) if (left.has(to) && marks.includes(from) && !marks.includes(to) && find(e, to)) marks.push(to);
  return { node: n.id, marks: marks.length ? marks : [n.id], move };
}
