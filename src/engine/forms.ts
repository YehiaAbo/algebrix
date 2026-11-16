// Equivalent forms of the aimed expression (or the whole equation), for the
// forms strip. Every candidate goes through the same numeric check as a move.
import { Node, Eq, find, replace, eq, num, add, mul, frac, pow, sqrt, fn, walk, key, Env } from './ast';
import { negate } from './terms';
import { simplify, newHints, Hints } from './simplify';
import { distributeNode, expandAll, factorize, combineFractions, standardOrder, hasExpandable } from './rewrite';
import { verify, MoveOk } from './moves';
import { gcd } from './terms';

export interface Form extends MoveOk { name: string; chord: string }

const CHORDS: Record<string, string> = {
  'everything on one side': 'z', 'expanded': 'x', 'simplified': 's', 'sides swapped': 'w', 'one fraction': 'c',
  'factored': 'f', 'split into terms': 't', 'highest power first': 'o', 'log rules': 'l', 'as powers': 'p', 'as roots': 'r',
};

const one = () => 1;

export function formsFor(e: Eq, sel: string | null): Form[] {
  const out: Form[] = [];
  const seen = new Set<string>([key(e)]);
  const push = (name: string, next: Eq, h: Hints, factor: (env: Env) => number = one, select: string | null = sel) => {
    if (seen.has(key(next))) return;
    const f: Form = { name, chord: CHORDS[name] ?? (name.startsWith('clear') ? 'd' : ''), eq: next, label: name, hints: h, factor, select: select && find(next, select) ? select : null };
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
  at('one fraction', h => combineFractions(target, h));
  at('factored', h => factorize(target, h));
  at('expanded', h => (hasExpandable(target) ? expandAll(target, h) : null));
  at('split into terms', h => {
    const s = target.k === 'frac' ? distributeNode(target, h) : null;
    return s && s.k === 'add' ? { ...s, terms: s.terms.map(t => simplify(t, h)) } : null;
  });
  at('simplified', h => { const r = simplify(target, h); return key(r) === key(target) ? null : r; });
  at('highest power first', () => standardOrder(target));
  at('log rules', () => logRules(target));
  at('as powers', () => asPowers(target));
  at('as roots', () => asRoots(target));
  return out;
}

function denominatorLcm(e: Eq): number {
  let L = 1;
  walk(e, n => {
    if (n.k === 'frac' && n.den.k === 'num' && Number.isInteger(n.den.v) && n.den.v > 0) L = (L * n.den.v) / gcd(L, n.den.v);
  });
  return L <= 1e6 ? L : 1;
}


/** ln(ab) → ln a + ln b, ln(a/b) → ln a − ln b, ln(aⁿ) → n·ln a, applied once at the top */
function logRules(n: Node): Node | null {
  if (n.k !== 'fn' || (n.name !== 'ln' && n.name !== 'log')) {
    if (n.k === 'add' || n.k === 'mul') {
      const ks = n.k === 'add' ? n.terms : n.factors;
      let hit = false;
      const out = ks.map(k => { const r = logRules(k); if (r) hit = true; return r ?? k; });
      return hit ? (n.k === 'add' ? { ...n, terms: out } : { ...n, factors: out }) : null;
    }
    return null;
  }
  const L = (a: Node) => fn(n.name as 'ln' | 'log', a);
  const a = n.arg;
  if (a.k === 'mul') return add(a.factors.map((f, i) => (i === 0 ? fn(n.name as 'ln', f, n.id) : L(f))));
  if (a.k === 'frac') return add([fn(n.name as 'ln', a.num, n.id), negate(L(a.den))]);
  if (a.k === 'pow') return mul([a.exp, fn(n.name as 'ln', a.base, n.id)]);
  if (a.k === 'sqrt') return mul([frac(num(1), num(2)), fn(n.name as 'ln', a.arg, n.id)]);
  return null;
}

/** √a → a^(1/2), 1/aⁿ → a^(−n) */
function asPowers(n: Node): Node | null {
  if (n.k === 'sqrt') return pow(n.arg, frac(num(1), num(2)), n.id);
  if (n.k === 'frac' && n.num.k === 'num' && n.num.v === 1) {
    const d = n.den;
    if (d.k === 'pow' && d.exp.k === 'num') return pow(d.base, num(-d.exp.v, d.exp.id), n.id);
    if (d.k === 'sym') return pow(d, num(-1), n.id);
  }
  return null;
}

/** a^(1/2) → √a, a^(−n) → 1/aⁿ */
function asRoots(n: Node): Node | null {
  if (n.k !== 'pow') return null;
  const e = n.exp;
  if (e.k === 'frac' && e.num.k === 'num' && e.num.v === 1 && e.den.k === 'num' && e.den.v === 2) return sqrt(n.base, n.id);
  if (e.k === 'num' && e.v < 0) return frac(num(1), e.v === -1 ? n.base : pow(n.base, num(-e.v, e.id)), n.id);
  return null;
}
