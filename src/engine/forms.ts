// Equivalent forms of the aimed expression (or the whole equation), for the
// forms strip. Every candidate goes through the same numeric check as a move.
import { Node, Eq, find, replace, eq, num, add, mul, frac, pow, sqrt, fn, walk, key, Env, relOf, findPath, evaluate, isLeibniz2 } from './ast';
import { negate } from './terms';
import { simplify, newHints, Hints } from './simplify';
import { distributeNode, expandAll, combineFractions, standardOrder, hasExpandable } from './rewrite';
import { verify, MoveOk, MoveResult, relAfter, isErr } from './moves';
import { isLeibniz, toLeibniz, toPrime, toDifferentials } from './leibniz';
import { gcd } from './terms';
import { longDivide, partialFractions, rationalize, trigForms, completeSquare, Range, factorFully } from './polytools';

export interface Form extends MoveOk { name: string; chord: string }

const CHORDS: Record<string, string> = {
  'everything on one side': 'z', 'expanded': 'x', 'simplified': 's', 'sides swapped': 'w', 'one fraction': 'c',
  'factored': 'f', 'split into terms': 't', 'highest power first': 'o', 'log rules': 'l', 'as powers': 'p', 'as roots': 'r',
  'long division': 'q', 'partial fractions': 'v', 'rationalized': 'n', 'completed square': 'h',
  'as dy/dx': 'y', 'as y′': 'y', 'as d²y/dx²': 'y', 'as y″': 'y', 'as differentials': 'k',
};

const one = () => 1;

export function formsFor(e: Eq, sel: string | null): Form[] {
  const out: Form[] = [];
  const sides = (q: Eq) => key(q.lhs) + '|' + key(q.rhs);
  const seen = new Set<string>([sides(e)]);
  const push = (name: string, next: Eq, h: Hints, factor: (env: Env) => number = one, select: string | null = sel, range?: Range) => {
    if (seen.has(sides(next))) return;
    const f: Form = { name, chord: CHORDS[name] ?? (name.startsWith('clear') ? 'd' : ''), eq: next, label: name, hints: h, factor, select: select && find(next, select) ? select : null };
    if (range) {
      // true only on a range: say so, and check only there
      f.conditions = [range.text];
      f.check = env => { const u = evaluate(range.u, env); return u >= range.lo && u <= range.hi ? [[evaluate(next, env), evaluate(e, env)]] : [[NaN, NaN]]; };
    }
    if (verify(e, f)) return;
    const rel = relAfter(e, f);
    if (typeof rel !== 'string') return;
    f.eq = eq(f.eq.lhs, f.eq.rhs, rel);
    seen.add(sides(next));
    out.push(f);
  };

  // the slope's other spellings: y′ ↔ dy/dx, and dy = … dx (already checked with dy = y′·dx)
  const slope = (name: string, r: MoveResult) => {
    if (isErr(r) || seen.has(sides(r.eq))) return;
    seen.add(sides(r.eq));
    out.push({ ...r, name, chord: CHORDS[name] });
  };
  const target = sel && sel !== 'eq' ? find(e, sel) : null;
  if (target?.k === 'sym' && /^[a-zA-Zα-ω][′″]$/.test(target.name)) slope(target.name.endsWith('″') ? 'as d²y/dx²' : 'as dy/dx', toLeibniz(e, target.id));
  if (target && (isLeibniz(target) || isLeibniz2(target))) slope(isLeibniz2(target) ? 'as y″' : 'as y′', toPrime(e, target.id));
  if (!target || (target.k === 'sym' && target.name.endsWith('′')) || isLeibniz(target)) slope('as differentials', toDifferentials(e));
  if (!target) {
    let h = newHints();
    if (relOf(e) !== 'expr') push('everything on one side', eq(simplify(expandAll(add([e.lhs, negate(e.rhs)]), h), h), num(0)), h, one, null);
    const L = denominatorLcm(e);
    if (L > 1 && relOf(e) !== 'expr') {
      h = newHints();
      const clear = (s: Node) => simplify(expandAll(mul([num(L), s]), h), h);
      push(`clear fractions (× ${L})`, eq(clear(e.lhs), clear(e.rhs)), h, () => L, null);
    }
    h = newHints();
    const fl = factorFully(e.lhs, h), fr = factorFully(e.rhs, h);
    if (fl || fr) push('factored', eq(fl ?? e.lhs, fr ?? e.rhs), h, one, null);
    h = newHints();
    const cl = combineFractions(e.lhs, h), cr = relOf(e) === 'expr' ? null : combineFractions(e.rhs, h);
    if (cl || cr) push('one fraction', eq(cl ?? e.lhs, cr ?? e.rhs), h, one, null);
    const sl = completeSquare(e.lhs), sr = relOf(e) === 'expr' ? null : completeSquare(e.rhs);
    if (sl || sr) push('completed square', eq(sl ?? e.lhs, sr ?? e.rhs), newHints(), one, null);
    h = newHints();
    // with nothing to multiply out, "expanded" is really a full simplify (the quadratic formula's answer)
    push(hasExpandable(e) ? 'expanded' : 'simplified', eq(expandAll(e.lhs, h), expandAll(e.rhs, h)), h, one, null);
    h = newHints();
    push('simplified', eq(simplify(e.lhs, h), simplify(e.rhs, h)), h, one, null);
    h = newHints();
    if (relOf(e) !== 'expr') push('sides swapped', eq(e.rhs, e.lhs), h, () => -1, null);
    const ll = logRules(e.lhs), lr = relOf(e) === 'expr' ? null : logRules(e.rhs);
    if (ll || lr) push('log rules', eq(ll ?? e.lhs, lr ?? e.rhs), newHints(), one, null);
    // identities on a whole side, so sin²x + cos²x needs no aiming
    for (const side of ['lhs', 'rhs'] as const) for (const f of trigForms(e[side])) push(`trig: ${f.name}`, side === 'lhs' ? eq(f.node, e.rhs) : eq(e.lhs, f.node), newHints(), one, null, f.range);
    return out;
  }

  const at = (name: string, build: (h: Hints) => Node | null, range?: Range) => {
    const h = newHints();
    const r = build(h);
    if (r) push(name, replace(e, target.id, r), h, one, r.id, range);
  };
  at('one fraction', h => combineFractions(target, h));
  at('factored', h => factorFully(target, h));
  if (!out.some(f => f.name === 'factored')) {
    // aimed at a piece of a sum: offer factoring the nearest sum around it that factors
    const path = findPath(e, target.id) ?? [];
    for (let i = path.length - 2; i >= 0; i--) {
      const n = path[i];
      if (n.k !== 'add' && n.k !== 'mul') continue;
      const h = newHints();
      const r = factorFully(n, h);
      if (r) { push('factored', replace(e, n.id, r), h, one, r.id); break; }
    }
  }
  at('completed square', () => completeSquare(target));
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
  at('long division', () => longDivide(target));
  at('partial fractions', () => partialFractions(target));
  at('rationalized', () => rationalize(target));
  for (const f of trigForms(target)) at(`trig: ${f.name}`, () => f.node, f.range);
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
