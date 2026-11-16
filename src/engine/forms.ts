// Equivalent forms of the aimed expression (or the whole equation), for the
// forms strip. Every candidate goes through the same numeric check as a move.
import { Node, Eq, find, replace, eq, num, add, mul, walk, key, Env } from './ast';
import { negate } from './terms';
import { simplify, newHints, Hints } from './simplify';
import { distributeNode, expandAll, factorize, combineFractions, standardOrder } from './rewrite';
import { verify, MoveOk } from './moves';
import { gcd } from './terms';

export interface Form extends MoveOk { name: string }

const one = () => 1;

export function formsFor(e: Eq, sel: string | null): Form[] {
  const out: Form[] = [];
  const seen = new Set<string>([key(e)]);
  const push = (name: string, next: Eq, h: Hints, factor: (env: Env) => number = one, select: string | null = sel) => {
    if (seen.has(key(next))) return;
    const f: Form = { name, eq: next, label: name, hints: h, factor, select: select && find(next, select) ? select : null };
    if (verify(e, f)) return;
    seen.add(key(next));
    out.push(f);
  };

  const target = sel && sel !== 'eq' ? find(e, sel) : null;
  if (!target) {
    let h = newHints();
    push('everything on one side', eq(simplify(expandAll(add([e.lhs, negate(e.rhs)]), h), h), num(0)), h, one, null);
    const L = denominatorLcm(e);
    if (L > 1) {
      h = newHints();
      const clear = (s: Node) => simplify(expandAll(mul([num(L), s]), h), h);
      push(`clear fractions (× ${L})`, eq(clear(e.lhs), clear(e.rhs)), h, () => L, null);
    }
    h = newHints();
    push('expanded', eq(expandAll(e.lhs, h), expandAll(e.rhs, h)), h, one, null);
    h = newHints();
    push('simplified', eq(simplify(e.lhs, h), simplify(e.rhs, h)), h, one, null);
    h = newHints();
    push('sides swapped', eq(e.rhs, e.lhs), h, () => -1, null);
    return out;
  }

  const at = (name: string, build: (h: Hints) => Node | null) => {
    const h = newHints();
    const r = build(h);
    if (r) push(name, replace(e, target.id, r), h, one, r.id);
  };
  at('factored', h => factorize(target, h));
  at('expanded', h => { const r = expandAll(target, h); return key(r) === key(target) ? null : r; });
  at('one fraction', h => combineFractions(simplify(target, h), h));
  at('split into terms', h => {
    const s = target.k === 'frac' ? distributeNode(target, h) : null;
    return s && s.k === 'add' ? { ...s, terms: s.terms.map(t => simplify(t, h)) } : null;
  });
  at('simplified', h => { const r = simplify(target, h); return key(r) === key(target) ? null : r; });
  at('highest power first', () => standardOrder(target));
  return out;
}

function denominatorLcm(e: Eq): number {
  let L = 1;
  walk(e, n => {
    if (n.k === 'frac' && n.den.k === 'num' && Number.isInteger(n.den.v) && n.den.v > 0) L = (L * n.den.v) / gcd(L, n.den.v);
  });
  return L <= 1e6 ? L : 1;
}

