// Sign handling and the coefficient × monomial view of a term.
import { Node, Mul, num, neg, mul, frac, key, newId, allIds } from './ast';

export const gcd = (a: number, b: number): number => {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

/** Rational number p/q, q > 0, reduced. */
export interface Rat { p: number; q: number }
export const rat = (p: number, q = 1): Rat => {
  if (q < 0) { p = -p; q = -q; }
  const g = gcd(p, q) || 1;
  return { p: p / g === 0 ? 0 : p / g, q: q / g };
};
export const rmul = (a: Rat, b: Rat) => rat(a.p * b.p, a.q * b.q);
export const radd = (a: Rat, b: Rat) => rat(a.p * b.q + b.p * a.q, a.q * b.q);
export const rdiv = (a: Rat, b: Rat) => rat(a.p * b.q, a.q * b.p);
export const safe = (n: number) => Number.isSafeInteger(n) && Math.abs(n) < 1e12;

/** The numeric coefficient factor of a product, if it has one in front. */
export const coefOf = (n: Node) => (n.k === 'mul' && n.factors[0]?.k === 'num' ? n.factors[0] : null);

export function isNeg(n: Node): boolean {
  switch (n.k) {
    case 'num': return n.v < 0;
    case 'neg': return true;
    case 'mul': { const c = coefOf(n); return !!c && c.v < 0; }
    case 'frac': return isNeg(n.num);
    default: return false;
  }
}

/** -n, keeping ids wherever the sign can live inside an existing node. */
export function negate(n: Node): Node {
  switch (n.k) {
    case 'num': return num(-n.v, n.id);
    case 'neg': return n.arg;
    case 'mul': {
      const c = coefOf(n);
      if (c) return { ...n, factors: [num(-c.v, c.id), ...n.factors.slice(1)] };
      return neg(n);
    }
    case 'frac': return { ...n, num: negate(n.num) };
    case 'add': return { ...n, terms: n.terms.map(negate) };
    default: return neg(n);
  }
}

/** |n| for display: the sign is drawn separately by whoever holds the term. */
export function absOf(n: Node): Node {
  return isNeg(n) ? negate(n) : n;
}

/** Id that owns the +/− glyph in front of a term, stable across negation. */
export function signKey(n: Node): string {
  return n.k === 'neg' ? signKey(n.arg) : n.id;
}

export interface TermInfo { coef: Rat; mono: Node[]; mkey: string }

/** View a term as coefficient × monomial (the non-numeric factors). */
export function termInfo(n: Node): TermInfo {
  let coef = rat(1);
  const mono: Node[] = [];
  const visit = (m: Node) => {
    if (m.k === 'num') coef = rmul(coef, rat(m.v));
    else if (m.k === 'neg') { coef = rmul(coef, rat(-1)); visit(m.arg); }
    else if (m.k === 'mul') m.factors.forEach(visit);
    else if (m.k === 'frac' && m.den.k === 'num' && m.den.v !== 0) { visit(m.num); coef = rdiv(coef, rat(m.den.v)); }
    else mono.push(m);
  };
  visit(n);
  return { coef, mono, mkey: mono.map(key).sort().join('·') };
}

/** Build coef × mono, reusing the ids of `hint` (the term this result replaces) so it animates as the same object. */
export function buildTerm(coef: Rat, mono: Node[], hint: Node): Node {
  const used = new Set(mono.flatMap(allIds));
  const own = (id: string) => (used.has(id) ? newId() : id);
  const h = hint.k === 'neg' ? hint.arg : hint;
  if (coef.q !== 1) {
    const fr = h.k === 'frac' ? h : null;
    const numPart = buildTerm(rat(coef.p), mono, fr ? fr.num : h);
    const denId = fr && fr.den.k === 'num' ? own(fr.den.id) : newId();
    return frac(numPart, num(coef.q, denId), fr ? own(fr.id) : newId());
  }
  const base = h.k === 'frac' ? h.num : h;
  const c = coefOf(base) ?? (base.k === 'num' ? base : null);
  const mulId = base.k === 'mul' ? own(base.id) : newId();
  const coefId = c ? own(c.id) : newId();
  if (mono.length === 0) return num(coef.p, c ? own(c.id) : own(base.id));
  if (coef.p === 1) return mono.length === 1 ? mono[0] : mul(mono, mulId);
  if (coef.p === -1 && mono.length === 1 && !c) return neg(mono[0], hint.k === 'neg' ? own(hint.id) : newId());
  return mul([num(coef.p, coefId), ...mono], mulId) as Mul;
}
