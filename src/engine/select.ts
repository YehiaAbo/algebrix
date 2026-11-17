// Partial selections: several neighbouring terms of one sum (or factors of one product)
// are wrapped in a temporary group node, so every move that works on "a term" works on
// the run as a whole. The group prints and lays out exactly like before; `ungroup`
// dissolves it again after the move.
import { Node, Eq, findPath, replace, add, mul, children, withChildren } from './ast';

export interface Range { parent: string; ids: string[] }

/** The run of neighbouring siblings spanned by `ids` (they must share one sum or product). */
export function rangeOf(e: Eq, ids: string[]): Range | { error: string } {
  const paths = ids.map(id => findPath(e, id));
  if (paths.some(p => !p || p.length < 3)) return { error: 'Pick pieces inside one side.' };
  const parents = new Set(paths.map(p => p![p!.length - 2].id));
  if (parents.size !== 1) return { error: 'Those pieces aren’t neighbours in one sum or product.' };
  const parent = paths[0]![paths[0]!.length - 2];
  if (parent.k !== 'add' && parent.k !== 'mul') return { error: 'Only terms of a sum or factors of a product can be picked together.' };
  const kids = children(parent);
  const idx = ids.map(id => kids.findIndex(k => k.id === id)).sort((a, b) => a - b);
  return { parent: parent.id, ids: kids.slice(idx[0], idx[idx.length - 1] + 1).map(k => k.id) };
}

/** Wrap the run in a group node. A run of one is just that piece; the whole list is the parent. */
export function group(e: Eq, ids: string[]): { eq: Eq; id: string } | { error: string } {
  const r = rangeOf(e, ids);
  if ('error' in r) return r;
  const parent = findPath(e, r.parent)!.pop()!;
  const kids = children(parent);
  if (r.ids.length === 1) return { eq: e, id: r.ids[0] };
  if (r.ids.length === kids.length) return { eq: e, id: parent.id };
  const i = kids.findIndex(k => k.id === r.ids[0]);
  const run = kids.slice(i, i + r.ids.length);
  const g = parent.k === 'add' ? add(run) : mul(run);
  const next = withChildren(parent, [...kids.slice(0, i), g, ...kids.slice(i + r.ids.length)]);
  return { eq: replace(e, parent.id, next), id: g.id };
}

/** Merge every sum inside a sum and product inside a product (what a group leaves behind). */
export function ungroup<T extends Node>(n: T): T {
  const kids = children(n).map(ungroup);
  if (n.k === 'add') return { ...n, terms: kids.flatMap(k => (k.k === 'add' ? k.terms : [k])) };
  if (n.k === 'mul') return { ...n, factors: kids.flatMap(k => (k.k === 'mul' ? k.factors : [k])) };
  return withChildren(n, kids);
}
