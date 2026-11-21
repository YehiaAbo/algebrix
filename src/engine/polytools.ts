// Rewrites for rational expressions and trig: polynomial long division, partial
// fractions, rationalizing a denominator, and a pack of trig identities. Each returns
// an equivalent expression (or null); the forms strip checks every one numerically.
import { Node, Frac, Eq, num, add, mul, frac, pow, fn, cloneFresh, key, find, symbols as symbolsOf, sqrt as sqrtN, evaluate as evaluateNode } from './ast';
import { rat, Rat, rmul, radd, rdiv, negate, coefOf, gcd } from './terms';
import { simplify, newHints, Hints } from './simplify';
import { expandAll, polyOf, factorize } from './rewrite';
import { parseExpr } from './parse';
import { toText } from './print';

const hints = () => newHints();
const isZero = (r: Rat) => r.p === 0;

/** coefficients, lowest power first, of a polynomial in one variable (after expanding) */
function poly(n: Node): { v: string; c: Rat[] } | null {
  const P = polyOf(expandAll(n, hints()));
  if (P) return P;
  const s = simplify(n, hints());
  if (s.k === 'num' && Number.isInteger(s.v)) return { v: '', c: [rat(s.v)] };
  return null;
}

const ratText = (r: Rat) => (r.q === 1 ? String(Math.abs(r.p)) : `(${Math.abs(r.p)}/${r.q})`);

/** text of a polynomial, highest power first */
function polyText(v: string, c: Rat[]): string {
  let out = '';
  for (let k = c.length - 1; k >= 0; k--) {
    const r = c[k];
    if (isZero(r)) continue;
    const mag = k > 0 && Math.abs(r.p) === r.q ? '' : ratText(r);
    const term = mag + (k === 0 ? '' : k === 1 ? v : `${v}^${k}`);
    out += out === '' ? (r.p < 0 ? '-' : '') + term : (r.p < 0 ? ' - ' : ' + ') + term;
  }
  return out || '0';
}

function divide(N: Rat[], D: Rat[]): { q: Rat[]; r: Rat[] } {
  const r = [...N], q: Rat[] = Array.from({ length: Math.max(1, N.length - D.length + 1) }, () => rat(0));
  const lead = D[D.length - 1];
  for (let k = N.length - D.length; k >= 0; k--) {
    const f = rdiv(r[k + D.length - 1], lead);
    q[k] = f;
    for (let j = 0; j < D.length; j++) r[k + j] = radd(r[k + j], rmul(f, rat(-D[j].p, D[j].q)));
  }
  while (r.length && isZero(r[r.length - 1])) r.pop();
  return { q, r };
}

/** (x² + 3x + 5)/(x + 1) → x + 2 + 3/(x + 1) */
export function longDivide(n: Node): Node | null {
  if (n.k !== 'frac') return null;
  const P = poly(n.num), Q = poly(n.den);
  if (!P || !Q || Q.c.length < 2 || P.c.length < Q.c.length) return null;
  if (P.v && P.v !== Q.v) return null;
  const v = Q.v;
  const { q, r } = divide(P.c, Q.c);
  const parts: Node[] = [];
  const qn = parseExpr(polyText(v, q));
  parts.push(...(qn.k === 'add' ? qn.terms : [qn]));
  if (r.length) {
    const lead = r[r.length - 1];
    const body = parseExpr(polyText(v, lead.p < 0 ? r.map(x => rat(-x.p, x.q)) : r));
    const f = frac(body, cloneFresh(n.den));
    parts.push(lead.p < 0 ? negate(f) : f);
  }
  return parts.length === 1 ? parts[0] : add(parts);
}

/** rational roots of an integer-coefficient polynomial (rational root theorem) */
function rationalRoots(c: Rat[]): Rat[] {
  const L = c.reduce((m, r) => (m * r.q) / gcd(m, r.q), 1);
  const a = c.map(r => (r.p * L) / r.q);
  const roots: Rat[] = [];
  let low = 0;
  while (low < a.length && a[low] === 0) low++;
  if (low > 0) roots.push(rat(0));
  const a0 = Math.abs(a[low]), an = Math.abs(a[a.length - 1]);
  if (a0 > 1e6 || an > 1e6) return roots;
  const divs = (m: number) => Array.from({ length: m }, (_, i) => i + 1).filter(d => m % d === 0);
  const at = (x: Rat) => a.reduceRight((s, k) => radd(rmul(s, x), rat(k)), rat(0));
  for (const p of divs(a0)) for (const q of divs(an)) for (const sgn of [1, -1]) {
    const r = rat(sgn * p, q);
    if (!roots.some(x => x.p === r.p && x.q === r.q) && isZero(at(r))) roots.push(r);
  }
  return roots;
}

const evalPoly = (c: Rat[], x: Rat) => c.reduceRight((s, k) => radd(rmul(s, x), k), rat(0));
const derive = (c: Rat[]) => c.slice(1).map((k, i) => rmul(k, rat(i + 1)));

/** A/((x − a)(x − b)…) → sum of A_i/(x − r_i), for distinct rational roots */
export function partialFractions(n: Node): Node | null {
  if (n.k !== 'frac') return null;
  const P = poly(n.num), Q = poly(n.den);
  if (!P || !Q || Q.c.length < 3 || (P.v && P.v !== Q.v)) return null;
  const v = Q.v;
  let lead: Node[] = [];
  let N = P.c;
  if (N.length >= Q.c.length) {
    const d = divide(N, Q.c);
    const qn = parseExpr(polyText(v, d.q));
    lead = qn.k === 'add' ? qn.terms : [qn];
    N = d.r;
    if (!N.length) return null;
  }
  const roots = rationalRoots(Q.c).sort((x, y) => y.p / y.q - x.p / x.q);
  if (roots.length !== Q.c.length - 1) return null;
  const dQ = derive(Q.c);
  let text = '';
  for (const r of roots) {
    // A/(x − p/q) = (A·q)/(qx − p)
    const A = rmul(rdiv(evalPoly(N, r), evalPoly(dQ, r)), rat(r.q));
    if (isZero(A)) continue;
    const lin = r.p === 0 ? v : `${r.q === 1 ? '' : r.q}${v} ${r.p > 0 ? '-' : '+'} ${Math.abs(r.p)}`;
    const den = A.q === 1 ? (r.p === 0 ? lin : `(${lin})`) : `(${A.q}(${lin}))`;
    const term = `${Math.abs(A.p)}/${den}`;
    text += text === '' ? (A.p < 0 ? '-' : '') + term : (A.p < 0 ? ' - ' : ' + ') + term;
  }
  const pf = parseExpr(text);
  const parts = [...lead, ...(pf.k === 'add' ? pf.terms : [pf])];
  return parts.length === 1 ? parts[0] : add(parts);
}

const hasSqrt = (n: Node): boolean => n.k === 'sqrt' || (n.k === 'mul' && n.factors.some(hasSqrt)) || (n.k === 'neg' && hasSqrt(n.arg));

/** a/√b → a√b/b, a/(c + √d) → a(c − √d)/(c² − d) */
export function rationalize(n: Node): Node | null {
  if (n.k !== 'frac') return null;
  const F = n as Frac, d = F.den, h = hints();
  if (d.k === 'sqrt' || (d.k === 'mul' && d.factors.some(f => f.k === 'sqrt'))) {
    const r = d.k === 'sqrt' ? d : (d.factors.find(f => f.k === 'sqrt')!);
    if (r.k !== 'sqrt') return null;
    const rest = d.k === 'mul' ? d.factors.filter(f => f !== r) : [];
    const top = simplify(mul([F.num, sqrtN(cloneFresh(r.arg))]), h);
    const bottom = rest.length ? mul([...rest, r.arg]) : r.arg;
    return frac(top, bottom, F.id);
  }
  if (d.k === 'add' && d.terms.length === 2 && d.terms.some(hasSqrt)) {
    const i = d.terms.findIndex(hasSqrt);
    const conj = add(d.terms.map((t, j) => (j === i ? negate(cloneFresh(t)) : cloneFresh(t))));
    const top = F.num.k === 'num' && F.num.v === 1 ? conj : mul([F.num, conj]);
    const bottom = simplify(expandAll(mul([cloneFresh(d), cloneFresh(conj)]), h), h);
    return frac(top, bottom, F.id);
  }
  return null;
}

/** the top's root moved to the bottom: (√(x + 1) − 1)/x → x/(x(√(x + 1) + 1)), and on its own
 *  √(x² + x) − x → (x² + x − x²)/(√(x² + x) + x): times the conjugate over itself */
export function rationalizeTop(n: Node): Node | null {
  const top = n.k === 'frac' ? n.num : n, bot = n.k === 'frac' ? n.den : null;
  if (top.k !== 'add' || top.terms.length !== 2 || !top.terms.some(hasSqrt)) return null;
  const h = hints();
  const i = top.terms.findIndex(hasSqrt);
  const conj = add(top.terms.map((t, j) => (j === i ? cloneFresh(t) : negate(cloneFresh(t)))));
  const newTop = simplify(expandAll(mul([cloneFresh(top), cloneFresh(conj)]), h), h);
  return frac(newTop, bot ? mul([cloneFresh(bot), conj]) : conj, n.k === 'frac' ? n.id : undefined);
}

/* ---------- trig identities ---------- */

/** a v² + b v + c → a(v + b/2a)² + (c − b²/4a) */
export function completeSquare(n: Node): Node | null {
  const P = poly(n);
  if (!P || !P.v || P.c.length !== 3 || isZero(P.c[1])) return null;
  const [c, b, a] = P.c;
  const shift = rdiv(b, rmul(rat(2), a));
  const k = radd(c, rmul(rat(-1), rdiv(rmul(b, b), rmul(rat(4), a))));
  const r = (x: Rat) => (x.q === 1 ? String(Math.abs(x.p)) : `${Math.abs(x.p)}/${x.q}`);
  const lead = a.p === a.q ? '' : a.p === -a.q ? '-' : a.q === 1 ? String(a.p) : `(${a.p}/${a.q})`;
  let text = `${lead}(${P.v} ${shift.p < 0 ? '-' : '+'} ${r(shift)})^2`;
  if (!isZero(k)) text += ` ${k.p < 0 ? '-' : '+'} ${r(k)}`;
  return parseExpr(text);
}

/** where a form holds: u must lie in [lo, hi] (the range of the inverse function) */
export interface Range { u: Node; lo: number; hi: number; text: string }
export interface TrigForm { name: string; node: Node; range?: Range }
type TrigFn = 'sin' | 'cos' | 'tan';
const isF = (n: Node, name: TrigFn): n is Extract<Node, { k: 'fn' }> => n.k === 'fn' && n.name === name;
const sq = (n: Node, name: TrigFn) => n.k === 'pow' && n.exp.k === 'num' && n.exp.v === 2 && isF(n.base, name) ? n.base.arg : null;
const F = (name: TrigFn, u: Node) => fn(name, cloneFresh(u));
const F2 = (name: TrigFn, u: Node) => pow(F(name, u), num(2));
/** the u in −u (a minus sign or a negative coefficient), or null */
function minusOf(a: Node): Node | null {
  if (a.k === 'neg') return a.arg;
  const c = coefOf(a);
  if (a.k === 'mul' && c && c.v < 0) return c.v === -1 && a.factors.length === 2 ? a.factors[1] : mul([num(-c.v), ...a.factors.slice(1).map(cloneFresh)]);
  if (a.k === 'num' && a.v < 0) return num(-a.v);
  return null;
}

/** the u in 2u, or null */
function half(a: Node): Node | null {
  const c = coefOf(a);
  if (a.k !== 'mul' || !c || c.v !== 2) return null;
  const rest = a.factors.slice(1);
  return rest.length === 1 ? rest[0] : mul(rest.map(cloneFresh));
}

export function trigForms(n: Node): TrigForm[] {
  const out: TrigForm[] = [];
  const offer = (name: string, node: Node, range?: Range) => { if (!out.some(o => key(o.node) === key(node))) out.push({ name, node, range }); };
  // sin⁻¹(sin u) = u only where u is in sin⁻¹'s range, so it is offered with that condition
  const INV = { asin: ['sin', -Math.PI / 2, Math.PI / 2, '−π/2 ≤ u ≤ π/2'], acos: ['cos', 0, Math.PI, '0 ≤ u ≤ π'], atan: ['tan', -Math.PI / 2, Math.PI / 2, '−π/2 < u < π/2'] } as const;
  if (n.k === 'fn' && n.name in INV) {
    const [inner, lo, hi, txt] = INV[n.name as keyof typeof INV];
    if (isF(n.arg, inner)) offer('inverse cancels', cloneFresh(n.arg.arg), { u: n.arg.arg, lo, hi, text: txt.replace('u', toText(n.arg.arg)) });
  }
  if (isF(n, 'tan')) offer('as sin / cos', frac(F('sin', n.arg), F('cos', n.arg)));
  if (n.k === 'frac' && isF(n.num, 'sin') && isF(n.den, 'cos') && key(n.num.arg) === key(n.den.arg)) offer('as tan', fn('tan', cloneFresh(n.num.arg)));
  if (isF(n, 'sin')) {
    const u = half(n.arg);
    if (u) offer('double angle', mul([num(2), F('sin', u), F('cos', u)]));
    if (n.arg.k === 'add' && n.arg.terms.length === 2) {
      const [a, b] = n.arg.terms;
      const d = minusOf(b);
      if (d) offer('angle difference', add([mul([F('sin', a), F('cos', d)]), negate(mul([F('cos', a), F('sin', d)]))]));
      else offer('angle sum', add([mul([F('sin', a), F('cos', b)]), mul([F('cos', a), F('sin', b)])]));
    }
  }
  if (isF(n, 'cos')) {
    const u = half(n.arg);
    if (u) {
      offer('double angle', add([F2('cos', u), negate(F2('sin', u))]));
      offer('double angle (cos only)', add([mul([num(2), F2('cos', u)]), num(-1)]));
      offer('double angle (sin only)', add([num(1), mul([num(-2), F2('sin', u)])]));
    }
    if (n.arg.k === 'add' && n.arg.terms.length === 2) {
      const [a, b] = n.arg.terms;
      const d = minusOf(b);
      if (d) offer('angle difference', add([mul([F('cos', a), F('cos', d)]), mul([F('sin', a), F('sin', d)])]));
      else offer('angle sum', add([mul([F('cos', a), F('cos', b)]), negate(mul([F('sin', a), F('sin', b)]))]));
    }
  }
  // even and odd: cos(−u) = cos u, sin(−u) = −sin u, tan(−u) = −tan u
  if (n.k === 'fn' && (n.name === 'sin' || n.name === 'cos' || n.name === 'tan')) {
    const u = minusOf(n.arg);
    if (u) offer('even/odd', n.name === 'cos' ? F('cos', u) : negate(F(n.name, u)));
  }
  if (isF(n, 'tan')) {
    const u = half(n.arg);
    if (u) offer('double angle', frac(mul([num(2), F('tan', u)]), add([num(1), negate(F2('tan', u))])));
  }
  const s2 = sq(n, 'sin'), c2 = sq(n, 'cos');
  if (s2) offer('Pythagorean', add([num(1), negate(F2('cos', s2))]));
  if (c2) offer('Pythagorean', add([num(1), negate(F2('sin', c2))]));
  const twice = (u: Node) => (u.k === 'mul' && u.factors[0].k === 'num' ? mul([num(2 * u.factors[0].v), ...u.factors.slice(1).map(cloneFresh)]) : mul([num(2), cloneFresh(u)]));
  if (s2) offer('power reduction', frac(add([num(1), negate(fn('cos', twice(s2)))]), num(2)));
  if (c2) offer('power reduction', frac(add([num(1), fn('cos', twice(c2))]), num(2)));
  if (n.k === 'mul' && n.factors.length === 3 && n.factors[0].k === 'num' && n.factors[0].v === 2 && isF(n.factors[1], 'sin') && isF(n.factors[2], 'cos') && key(n.factors[1].arg) === key(n.factors[2].arg)) {
    offer('double angle', fn('sin', mul([num(2), cloneFresh(n.factors[1].arg)])));
  }
  // sin u cos u is half of sin 2u
  if (n.k === 'mul' && n.factors.length === 2 && isF(n.factors[0], 'sin') && isF(n.factors[1], 'cos') && key(n.factors[0].arg) === key(n.factors[1].arg)) {
    offer('double angle', frac(fn('sin', mul([num(2), cloneFresh(n.factors[0].arg)])), num(2)));
  }
  if (n.k === 'add') {
    const ts = n.terms;
    // sin²u + cos²u → 1
    for (let i = 0; i < ts.length; i++) for (let j = 0; j < ts.length; j++) {
      const u = sq(ts[i], 'sin'), w = sq(ts[j], 'cos');
      if (i !== j && u && w && key(u) === key(w)) {
        const rest = ts.filter((_, k) => k !== i && k !== j);
        offer('Pythagorean', rest.length ? add([num(1), ...rest]) : num(1));
      }
    }
    // 1 − sin²u → cos²u, 1 − cos²u → sin²u
    const oneI = ts.findIndex(t => t.k === 'num' && t.v === 1);
    if (oneI >= 0) for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      const inner = t.k === 'neg' ? t.arg : t.k === 'mul' && coefOf(t)?.v === -1 && t.factors.length === 2 ? t.factors[1] : null;
      if (!inner) continue;
      for (const [from, to] of [['sin', 'cos'], ['cos', 'sin']] as const) {
        const u = sq(inner, from);
        if (!u) continue;
        const rest = ts.filter((_, k) => k !== i && k !== oneI);
        offer('Pythagorean', rest.length ? add([F2(to, u), ...rest]) : F2(to, u));
      }
    }
  }
  return out;
}

/** x³ − 4x → x(x − 2)(x + 2), x⁴ − 5x² + 4 → (x − 1)(x + 1)(x − 2)(x + 2): every rational root
 *  (rational root theorem) comes out as a factor, repeated ones as a power; what is left stays
 *  as one factor. Null below degree 3 (quadratics have their own rules) or with no rational root */
export function factorByRoots(n: Node): Node | null {
  const P = poly(n);
  if (!P || !P.v || P.c.length < 4) return null;
  const v = P.v;
  // whole-number coefficients first: L·P, with 1/L in front
  const L = P.c.reduce((m, r) => (m * r.q) / gcd(m, r.q), 1);
  let c = P.c.map(r => rat((r.p * L) / r.q));
  const roots = rationalRoots(c);
  if (!roots.length) return null;
  const parts: Node[] = [];
  for (const r of roots) {
    let times = 0;
    for (;;) {
      if (c.length < 2) break;
      const { q, r: rem } = divide(c, [rat(-r.p), rat(r.q)]);
      if (rem.length) break;
      c = q; times++;
    }
    if (!times) continue;
    const f = parseExpr(r.p === 0 ? v : `${r.q === 1 ? '' : r.q}${v} ${r.p < 0 ? '+' : '-'} ${Math.abs(r.p)}`);
    parts.push(times === 1 ? f : pow(f, num(times)));
  }
  // what is left: a constant, or a polynomial with no rational roots
  const lead = rdiv(c.length === 1 ? c[0] : rat(1), rat(L));
  if (c.length > 1) {
    // pull the sign out so the leftover starts positive
    const neg = c[c.length - 1].p < 0;
    const rest = parseExpr(polyText(v, neg ? c.map(k => rat(-k.p, k.q)) : c));
    parts.push(rest);
    const k = rdiv(rat(neg ? -1 : 1), rat(L));
    if (k.p !== 1 || k.q !== 1) parts.unshift(k.q === 1 ? num(k.p) : frac(num(k.p), num(k.q)));
  } else if (lead.p !== 1 || lead.q !== 1) parts.unshift(lead.q === 1 ? num(lead.p) : frac(num(lead.p), num(lead.q)));
  if (parts.length < 2) return null;
  const out = mul(parts);
  // the safety net: the same polynomial at a few points
  const at = (m: Node, x: number) => evalNum(m, v, x);
  return [0.31, -1.7, 2.9].every(x => Math.abs(at(out, x) - at(n, x)) <= 1e-8 * (1 + Math.abs(at(n, x)))) ? out : null;
}

const evalNum = (m: Node, v: string, x: number) => evaluateNode(m, { [v]: x });

/** factor as far as whole numbers allow, then take out any rational roots of what is left */
export function factorFully(n: Node, h: Hints): Node | null {
  const r = factorize(n, h);
  if (!r) return factorByRoots(n);
  if (r.k !== 'mul') return r;
  let changed = false;
  const fs = r.factors.flatMap(f => { const g = f.k === 'add' ? factorByRoots(f) : null; if (!g) return [f]; changed = true; return g.k === 'mul' ? g.factors : [g]; });
  return changed ? mul(fs, r.id) : r;
}

/** P written as D·Q + R, for a D you choose: take (x − 2) out of 4x⁴ + 4x³ − 25x² − x + 6 to test
 *  whether 2 is a root (R = 0 means it is) and get the rest to work on. */
export function divideOut(n: Node, d: Node): Node | { error: string } {
  const P = poly(n), D = poly(d);
  if (!P || P.c.length < 3) return { error: 'Aim at a polynomial, like x³ − 2x − 4, to take a factor out of it.' };
  if (!D || D.c.length < 2) return { error: 'Type a factor with the letter in it, like x − 2.' };
  if (D.v !== P.v) return { error: `Type a factor in ${P.v}, like ${P.v} − 2.` };
  if (D.c.length > P.c.length) return { error: 'That factor has a higher power than the polynomial.' };
  const { q, r } = divide(P.c, D.c);
  const Q = parseExpr(polyText(P.v, q));
  const DQ = mul([cloneFresh(d), Q]);
  if (!r.length) return DQ;
  const R = parseExpr(polyText(P.v, r));
  return add([DQ, R]);
}

/** the polynomial Tab q would take a factor out of: the aimed piece, or a side that is one */
export function polyTarget(e: Eq, sel: string | null): string | null {
  const ok = (n: Node | null) => !!n && n.k !== 'frac' && n.k !== 'eq' && symbolsOf(n).length === 1 && !('error' in divideOut(n, parseExpr(`${symbolsOf(n)[0]} - 1`)));
  const aimed = sel && sel !== 'eq' ? find(e, sel) : null;
  if (aimed) return ok(aimed) ? aimed.id : null;
  return ok(e.lhs) ? e.lhs.id : ok(e.rhs) ? e.rhs.id : null;
}
