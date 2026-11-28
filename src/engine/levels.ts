// Shift ↑ / ↓ (user 2026-11-28): a piece on a level of the notation (above or below a bar, a bound)
// travels; a whole object aimed opens up one level with ↑ (Σ written out, ∫ and d/dx one rule) and
// closes back with ↓. Each step is the same checked move the C menu plays.
import { Eq, Node, Int, Deriv, Lim, find, findPath, children, walk, replace, cloneFresh, int, deriv, add } from './ast';
import { applyMove, checked, CheckedResult, isErr } from './moves';
import { newHints } from './simplify';
import { writeOutDots, moreTerms, foldBack } from './series';
import { intStep, plugBounds } from './integrate';
import { derivStep, plugIn } from './calcmoves';

const holdsDots = (n: Node) => (n.k === 'add' || n.k === 'mul') && (n.k === 'add' ? n.terms : n.factors).some(t => t.k === 'sum' && t.dots);
const isInf = (n: Node | undefined) => !!n && n.k === 'sym' && n.name === '∞';

/** ↑ (dir −1) opens the aimed object one level, ↓ (dir 1) closes it; null when it is not one */
export function openClose(e: Eq, sel: string | null, dir: -1 | 1): CheckedResult | null {
  const node = sel && sel !== 'eq' ? find(e, sel) : null;
  if (!node) return null;
  const up = dir === -1;
  if (holdsDots(node) || (node.k === 'sum' && node.dots)) {
    if (!up) return foldBack(e, sel);
    const D = (node.k === 'sum' ? node : (node.k === 'add' ? node.terms : (node as Extract<Node, { k: 'mul' }>).factors).find(t => t.k === 'sum' && t.dots)) as Extract<Node, { k: 'sum' }>;
    return moreTerms(e, sel, isInf(D.hi) ? 'start' : 'end');
  }
  const closed = (what: string) => ({ error: `${what} is as closed as it gets: Shift + ↑ opens it up, one step at a time.` });
  if (node.k === 'sum') return up ? writeOutDots(e, sel) : closed(node.prod ? 'This ∏' : 'This Σ');
  // a ∫ or d/dx aimed, or a piece still holding one (what the last ↑ left): the first one, one pure rule
  let T: Node | null = null;
  walk(node, n => { if (!T && (n.k === 'int' || n.k === 'deriv' || n.k === 'lim')) T = n; });
  if (!T) {
    // [F] from a to b left by the last ∫: ↑ puts the bounds in, F(b) − F(a)
    let A: Node | null = null;
    walk(node, n => { if (!A && n.k === 'at') A = n; });
    if (!A) return null;
    return up ? aimAt(e, node, plugBounds(e, (A as Node).id)) : closed('This');
  }
  const t = T as Int | Deriv | Lim;
  if (!up) return closed(t.k === 'int' ? 'This integral' : t.k === 'lim' ? 'This limit' : 'This derivative');
  return aimAt(e, node, t.k === 'lim' ? plugIn(e, t.id) : pureRule(e, t));
}

/** one rule, nothing more: over a sum it only splits (sum rule); otherwise the rule C plays */
function pureRule(e: Eq, T: Int | Deriv): CheckedResult {
  if (T.arg.k === 'add') {
    const parts = T.arg.terms.map(t => (T.k === 'int' ? int(T.v, cloneFresh(t), T.lo && cloneFresh(T.lo), T.hi && cloneFresh(T.hi)) : deriv(T.v, cloneFresh(t), T.dep)));
    const label = T.k === 'int' ? 'split over +: ∫(f + g) = ∫f + ∫g' : 'sum rule: (f + g)′ = f′ + g′';
    return checked(e, { eq: replace(e, T.id, add(parts)) as Eq, label, hints: newHints(), factor: () => 1, select: null, rule: 'sum rule' });
  }
  return T.k === 'int' ? intStep(e, T.id) : derivStep(e, T.id);
}

/** Shift ↑ / ↓: travel when the piece can, else open or close it */
export function shiftVertical(e: Eq, sel: string | null, dir: -1 | 1): CheckedResult {
  const travel = applyMove(dir === -1 ? 'lift' : 'drop', e, sel);
  if (!isErr(travel)) return travel;
  const oc = openClose(e, sel, dir);
  if (oc) return oc;
  // a worked-out piece with nothing left to open: say that, not why it cannot travel
  const node = sel && sel !== 'eq' ? find(e, sel) : null;
  if (node && node.k === 'add' && /none of those/.test(travel.error)) return { error: 'Nothing in here opens up any further. s tidies it.' };
  return travel;
}

/** keep the aim where the object was, so the next ↑ works on what it became */
function aimAt(e: Eq, was: Node, r: CheckedResult): CheckedResult {
  if (isErr(r)) return r;
  const path = findPath(e, was.id);
  if (!path) return r;
  let at: Node = r.eq;
  for (let i = 1; i < path.length; i++) {
    const k = children(path[i - 1]).indexOf(path[i]);
    const next: Node | undefined = children(at)[k];
    if (!next) return r;
    at = next;
  }
  return { ...r, select: at.id };
}
