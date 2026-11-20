// Equivalent forms of the aimed expression (or the whole equation), for the
// forms strip. Every candidate goes through the same numeric check as a move.
import { Node, Eq, find, replace, eq, num, add, mul, frac, pow, sqrt, fn, walk, key, Env, relOf, findPath, evaluate, isLeibniz2, symbols, cloneFresh, deriv } from './ast';
import { dependsOn, derivative } from './calculus';
import { quick } from './integrate';
import { negate } from './terms';
import { simplify, newHints, Hints } from './simplify';
import { distributeNode, expandAll, combineFractions, standardOrder, hasExpandable } from './rewrite';
import { verify, MoveOk, MoveResult, relAfter, isErr, neverZero } from './moves';
import { toText } from './print';
import { isLeibniz, toLeibniz, toPrime, toDifferentials, letters } from './leibniz';
import { gcd } from './terms';
import { combineLogs } from './techniques';
import { sumForms } from './sums';
import { longDivide, partialFractions, rationalize, rationalizeTop, trigForms, completeSquare, Range, factorFully } from './polytools';

export interface Form extends MoveOk { name: string; chord: string }

const CHORDS: Record<string, string> = {
  'everything on one side': 'z', 'expanded': 'x', 'simplified': 's', 'sides swapped': 'w', 'one fraction': 'c',
  'factored': 'f', 'split into terms': 't', 'highest power first': 'o', 'log rules': 'l', 'as powers': 'p', 'as roots': 'r',
  'one log': 'l', 'long division': 'q', 'partial fractions': 'v', 'rationalized': 'n', 'completed square': 'h',
  'as dy/dx': 'y', 'as y′': 'y', 'as d²y/dx²': 'y', 'as y″': 'y', 'as differentials': 'k', 'product rule backwards': 'b',
  'split the sum': 't', 'split the product': 't', 'as a limit of partial sums': 'm',
};

const one = () => 1;

export function formsFor(e: Eq, sel: string | null): Form[] {
  const out: Form[] = [];
  const sides = (q: Eq) => key(q.lhs) + '|' + key(q.rhs);
  const seen = new Set<string>([sides(e)]);
  const push = (name: string, next: Eq, h: Hints, factor: (env: Env) => number = one, select: string | null = sel, range?: Range, pieces?: [Node, Node]) => {
    if (seen.has(sides(next))) return;
    const f: Form = { name, chord: CHORDS[name] ?? (name.startsWith('clear') ? 'd' : ''), eq: next, label: name, hints: h, factor, select: select && find(next, select) ? select : null };
    if (range) {
      // true only on a range: say so, and check only there
      f.conditions = [range.text];
      // a piece rewritten (|cos θ| → cos θ inside ∫ … dθ): the piece and its new form agree on the range
      const [a, b] = pieces ?? [next, e];
      f.check = env => { const u = evaluate(range.u, env); return u >= range.lo && u <= range.hi ? [[evaluate(b, env), evaluate(a, env)]] : [[NaN, NaN]]; };
    }
    if (verify(e, f)) return;
    // cancelling a bottom away (x²−1)/(x−1) → x + 1 keeps x − 1 ≠ 0 from the original
    const lost = lostBottoms(e, next);
    if (lost.length) f.conditions = [...(f.conditions ?? []), ...lost];
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
  // a lone expression with nothing aimed: its forms are the whole thing's
  const target = sel && sel !== 'eq' ? find(e, sel) : relOf(e) === 'expr' ? e.lhs : null;
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
    const cl1 = combineLogs(e.lhs), cr1 = relOf(e) === 'expr' ? null : combineLogs(e.rhs);
    if (cl1 || cr1) {
      h = newHints();
      push('one log', eq(cl1 ? simplify(cl1.n, h) : e.lhs, cr1 ? simplify(cr1.n, h) : e.rhs), h, one, null);
      const f = out.find(x => x.name === 'one log');
      if (f) f.conditions = [...(f.conditions ?? []), ...(cl1?.conditions ?? []), ...(cr1?.conditions ?? [])];
    }
    // identities on a whole side, so sin²x + cos²x needs no aiming
    for (const side of ['lhs', 'rhs'] as const) for (const f of trigForms(e[side])) push(`trig: ${f.name}`, side === 'lhs' ? eq(f.node, e.rhs) : eq(e.lhs, f.node), newHints(), one, null, f.range);
    return out;
  }

  const at = (name: string, build: (h: Hints) => Node | null, range?: Range) => {
    const h = newHints();
    const r = build(h);
    if (r) push(name, replace(e, target.id, r), h, one, sel ? r.id : null, range, range ? [target, r] : undefined);
  };
  at('one fraction', h => combineFractions(target, h));
  // a fraction factors top and bottom, so a common factor shows: (x − 1)(x + 1)/(x − 1)
  at('factored', h => {
    if (target.k !== 'frac') return factorFully(target, h);
    const t = factorFully(target.num, h), b = factorFully(target.den, h);
    return t || b ? frac(t ?? target.num, b ?? target.den, target.id) : null;
  });
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
  // ln x + ln y = ln(xy), only where each is positive
  const logs = combineLogs(target);
  if (logs) { at('one log', h => simplify(logs.n, h)); const f = out.find(x => x.name === 'one log'); if (f) f.conditions = logs.conditions; }
  at('as powers', () => asPowers(target));
  at('as roots', () => asRoots(target));
  at('long division', () => longDivide(target));
  at('partial fractions', () => partialFractions(target));
  at('rationalized', () => rationalize(target));
  at('top rationalized', () => rationalizeTop(target));
  // a trig function of an inverse trig function: draw the triangle (cos(sin⁻¹ x) = √(1 − x²))
  if (target.k === 'fn' && target.arg.k === 'fn' && ['asin', 'acos', 'atan'].includes(target.arg.name) && ['sin', 'cos', 'tan'].includes(target.name)) {
    const x = () => cloneFresh((target.arg as Extract<Node, { k: 'fn' }>).arg);
    const r1 = () => sqrt(add([num(1), negate(pow(x(), num(2)))])), r2 = () => sqrt(add([num(1), pow(x(), num(2))]));
    const table: Record<string, () => Node> = {
      'sin asin': x, 'cos acos': x, 'tan atan': x,
      'cos asin': r1, 'sin acos': r1, 'tan asin': () => frac(x(), r1()), 'tan acos': () => frac(r1(), x()),
      'sin atan': () => frac(x(), r2()), 'cos atan': () => frac(num(1), r2()),
    };
    const make = table[`${target.name} ${target.arg.name}`];
    if (make) at('from the triangle', () => make());
  }
  // |u| on a range where u keeps one sign (|cos θ| with −π/2 ≤ θ ≤ π/2, after x = sin θ)
  if (target.k === 'fn' && target.name === 'abs') {
    const u = target.arg, txt = toText(u);
    at('without | |, where ≥ 0', () => cloneFresh(u), { u, lo: 0, hi: Infinity, text: `${txt} ≥ 0` });
    at('without | |, where ≤ 0', () => negate(cloneFresh(u)), { u, lo: -Infinity, hi: 0, text: `${txt} ≤ 0` });
  }
  for (const f of trigForms(target)) at(`trig: ${f.name}`, () => f.node, f.range);
  // f·g′ + f′·g is the product rule read backwards: d/dx(f·g) (the step in an integrating factor)
  const back = productBackwards(target, e);
  if (back) at('product rule backwards', () => back);
  // ∫ is linear: split it over a sum, take constants out (where aimed, or around the aim)
  const I = target.k === 'int' ? target : [...(findPath(e, target.id) ?? [])].reverse().find(n => n.k === 'int');
  if (I && I.k === 'int') for (const f of intLinear(I)) push(f.name, replace(e, I.id, f.node), newHints(), one, null);
  // Σ and ∏: on the aimed one, or the one the aimed piece sits in
  const path = findPath(e, target.id) ?? [];
  const up = path[path.length - 2];
  // aimed at the ∏ inside ln(∏ …): the log's forms too
  const S = up?.k === 'fn' && up.name === 'ln' && target.k === 'sum' && target.prod ? up : sumForms(target).length ? target : [...path].reverse().find(n => n.k === 'sum');
  for (const f of S ? sumForms(S) : []) {
    const n = out.length;
    push(f.name, replace(e, S!.id, f.node), newHints(), one, sel ? f.node.id : null);
    if (out.length > n && f.conditions) out[n].conditions = [...(out[n].conditions ?? []), ...f.conditions];
  }
  return out;
}

/** the letter factors of the bottoms in `a` that no bottom in `b` still has, as "… ≠ 0" */
function lostBottoms(a: Eq, b: Eq): string[] {
  const factors = (e: Eq) => {
    const out = new Map<string, Node>();
    walk(e, n => {
      if (n.k !== 'frac' || !hasLetters(n.den)) return;
      const f = factorFully(n.den, newHints()) ?? n.den;
      for (const x of f.k === 'mul' ? f.factors : [f]) {
        const base = x.k === 'pow' && x.exp.k === 'num' ? x.base : x;
        if (hasLetters(base) && !neverZero(base)) out.set(key(base), base);
      }
    });
    return out;
  };
  const after = factors(b);
  return [...factors(a)].filter(([k]) => !after.has(k)).map(([, n]) => `${toText(n)} ≠ 0`);
}
const hasLetters = (n: Node) => { let y = false; walk(n, x => { if (x.k === 'sym' && x.name !== 'e' && x.name !== 'π') y = true; }); return y; };

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

/** f·g′ + f′·g → d/dx(f·g): for each factor of a term, its antiderivative is tried as g */
function productBackwards(n: Node, e: Eq): Node | null {
  if (n.k !== 'add' || n.terms.length !== 2) return null;
  const x = letters(e)?.x ?? symbols(n).find(s => !s.endsWith('′')) ?? 'x';
  const names = symbols(e);
  const dep = names.filter(s => names.includes(s + '′'));
  const sample = (k: number): Env => Object.fromEntries([...names, x].map((s, i) => [s, 0.3 + 0.7 * Math.sin(k * 3.1 + i * 1.7)]));
  const same = (a: Node, b: Node) => [1, 2, 3, 4].every(k => { const p = evaluate(a, sample(k)), q = evaluate(b, sample(k)); return Number.isFinite(p) && Math.abs(p - q) <= 1e-9 * (1 + Math.abs(q)); });
  for (const t of n.terms) {
    const fs = t.k === 'mul' ? t.factors : [t];
    for (let i = 0; i < fs.length; i++) {
      const rest = fs.filter((_, j) => j !== i);
      if (!rest.some(r => dependsOn(r, x, dep))) continue;
      const g = quick(fs[i], x);
      if (!g) continue;
      const P = mul([...rest.map(r => cloneFresh(r)), g.F]);
      const dP = derivative(P, x, dep);
      if (dP && same(dP, n)) return deriv(x, simplify(P, newHints()), dep.length ? dep : undefined);
    }
  }
  return null;
}

/** ∫(f + g) = ∫f + ∫g, and ∫ c·f = c ∫ f (c without the letter) */
function intLinear(I: Extract<Node, { k: 'int' }>): { name: string; node: Node }[] {
  const out: { name: string; node: Node }[] = [];
  const again = (arg: Node) => ({ ...cloneFresh(I), arg });
  const a = I.arg;
  if (a.k === 'add') out.push({ name: 'split the integral', node: add(a.terms.map(t => again(cloneFresh(t)))) });
  const fs = a.k === 'mul' ? a.factors : a.k === 'neg' ? [num(-1), a.arg] : a.k === 'frac' && !dependsOn(a.den, I.v) ? [frac(num(1), a.den), a.num] : [];
  const cs = fs.filter(f => !dependsOn(f, I.v)), vs = fs.filter(f => dependsOn(f, I.v));
  if (cs.length && vs.length) out.push({ name: 'constant out', node: mul([...cs.map(c => cloneFresh(c)), again(vs.length === 1 ? cloneFresh(vs[0]) : mul(vs.map(v => cloneFresh(v))))]) });
  return out;
}
