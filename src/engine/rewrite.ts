// Node-level rewrites shared by single moves and the forms strip:
// distribute, expand, factor, combine fractions, tidy order.
import { Node, Add, Frac, num, add, mul, frac, pow, cloneFresh, children, replace, symbols, key, newId, evaluate } from './ast';
import { negate, isNeg, coefOf, termInfo, buildTerm, gcd, rat, rdiv, Rat } from './terms';
import { simplify, newHints, Hints } from './simplify';
import { parseExpr } from './parse';

type NumN = Extract<Node, { k: 'num' }>;

/** a(b + c) → ab + ac, −(a + b) → −a − b, (a + b)/c → a/c + b/c. Null if none applies. */
export function distributeNode(n: Node, h: Hints): Node | null {
  if (n.k === 'mul' && n.factors.some(f => f.k === 'add')) {
    const ai = n.factors.findIndex(f => f.k === 'add');
    const A = n.factors[ai] as Add;
    const outer = n.factors.filter((_, i) => i !== ai);
    const terms = A.terms.map((term, j) => {
      const outs = j === 0 ? outer : outer.map(cloneFresh);
      const neg = isNeg(term);
      const body = neg ? negate(term) : term;
      const bodyFs = body.k === 'mul' ? body.factors : [body];
      // numbers fold into the term's own coefficient; a copy of the outer number flies into it
      const outerNums = outs.filter(f => f.k === 'num') as NumN[];
      const innerNum = bodyFs.find(f => f.k === 'num') as NumN | undefined;
      let fs: Node[] = [...outs, ...bodyFs];
      if (outerNums.length && innerNum) {
        const v = [...outerNums, ...bodyFs.filter(f => f.k === 'num') as NumN[]].reduce((p, x) => p * x.v, 1);
        outerNums.forEach(x => (j === 0 ? h.absorbs.set(x.id, innerNum.id) : h.flights.push({ from: x.from!, to: innerNum.id })));
        fs = [num(v, innerNum.id), ...fs.filter(f => f.k !== 'num')];
      } else if (innerNum) {
        fs = [innerNum, ...fs.filter(f => f !== innerNum)];
      }
      const built: Node = fs.length === 1 ? fs[0] : mul(fs, body.k === 'mul' ? body.id : j === 0 ? n.id : newId());
      return neg ? negate(built) : built;
    });
    return add(terms, A.id);
  }
  if (n.k === 'neg' && n.arg.k === 'add') return { ...n.arg, terms: n.arg.terms.map(negate) };
  if (n.k === 'frac' && n.num.k === 'add') {
    const F = n as Frac;
    return add((F.num as Add).terms.map((term, j) =>
      frac(term, j === 0 ? F.den : cloneFresh(F.den), j === 0 ? F.id : newId())), F.num.id);
  }
  return null;
}

/** Pull out the gcd of the coefficients and the common powers of variables. */
export function factorCommon(n: Add, h: Hints): Node | null {
  const infos = n.terms.map(termInfo);
  let g = infos.every(i => i.coef.q === 1) ? infos.reduce((a, i) => gcd(a, i.coef.p), 0) : 1;
  if (isNeg(n.terms[0]) && g > 0) g = -g;
  // a factor is base^power; bases are compared by shape, so sin(x) or (x + 1) count like x does
  const split = (f: Node): { base: Node; p: number } =>
    f.k === 'pow' && f.exp.k === 'num' && Number.isInteger(f.exp.v) && f.exp.v > 0 ? { base: f.base, p: f.exp.v } : { base: f, p: 1 };
  const powerOf = (mono: Node[], name: string) => mono.reduce((s, f) => { const b = split(f); return s + (key(b.base) === name ? b.p : 0); }, 0);
  const common: { name: string; p: number; base: Node }[] = [];
  const names = [...new Set([...symbols(n), ...infos[0].mono.map(f => key(split(f).base))])];
  for (const name of names) {
    const p = Math.min(...infos.map(i => powerOf(i.mono, name)));
    const src = infos[0].mono.find(f => key(split(f).base) === name);
    if (p > 0 && src) common.push({ name, p, base: split(src).base });
  }
  if ((g === 1 || g === 0) && common.length === 0) return null;
  const first = n.terms[0];
  const outer: Node[] = [];
  if (g !== 1 && g !== 0) {
    const c = coefOf(first) ?? (first.k === 'num' ? first : null);
    const o = num(g); if (c) o.from = c.id;
    outer.push(o);
  }
  for (const c of common) {
    const base = cloneFresh(c.base);
    outer.push(c.p === 1 ? base : pow(base, num(c.p)));
  }
  const inner = n.terms.map((term, i) => {
    const mono: Node[] = [];
    const left = new Map(common.map(c => [c.name, c.p]));
    for (const f of infos[i].mono) {
      const b = split(f);
      const name = key(b.base);
      const have = b.p;
      const take = Math.min(left.get(name) ?? 0, have);
      if (take) left.set(name, (left.get(name) ?? 0) - take);
      const remain = have - take;
      if (take === 0) mono.push(f);
      else if (remain === 0) h.absorbs.set(f.id, outer[outer.length - 1]?.id ?? n.id);
      else if (remain === 1) mono.push(f.k === 'pow' ? f.base : f);
      else { const pw = f as Extract<Node, { k: 'pow' }>; mono.push(pow(pw.base, num(remain, pw.exp.id), pw.id)); }
    }
    return buildTerm(rdiv(infos[i].coef, rat(g)), mono, term);
  });
  return mul([...outer, { ...n, terms: inner }]);
}

/** Single-variable polynomial view, or null. */
export function polyOf(n: Node): { v: string; c: Rat[] } | null {
  const s = simplify(n, newHints());
  const terms = s.k === 'add' ? s.terms : [s];
  let v: string | null = null;
  const c: Rat[] = [];
  for (const t of terms) {
    const i = termInfo(t);
    let deg = 0;
    if (i.mono.length > 1) return null;
    if (i.mono.length === 1) {
      const m = i.mono[0];
      const name = m.k === 'sym' ? m.name : m.k === 'pow' && m.base.k === 'sym' && m.exp.k === 'num' && Number.isInteger(m.exp.v) && m.exp.v > 0 ? m.base.name : null;
      if (!name) return null;
      if (v && v !== name) return null;
      v = name;
      deg = m.k === "pow" ? (m.exp as NumN).v : 1;
    }
    while (c.length <= deg) c.push(rat(0));
    c[deg] = { p: c[deg].p * i.coef.q + i.coef.p * c[deg].q, q: c[deg].q * i.coef.q };
    c[deg] = rat(c[deg].p, c[deg].q);
  }
  while (c.length && c[c.length - 1].p === 0) c.pop();
  return v ? { v, c } : null;
}

const isqrt = (n: number) => { const r = Math.round(Math.sqrt(n)); return r * r === n ? r : -1; };

function linear(v: string, r: Rat): string {
  const lead = r.q === 1 ? v : `${r.q}${v}`;
  if (r.p === 0) return lead;
  return `(${lead} ${r.p < 0 ? '+' : '-'} ${Math.abs(r.p)})`;
}

/** ax² + bx + c with whole-number roots structure → a(px + q)(rx + s). */
function factorQuadratic(n: Node): Node | null {
  const P = polyOf(n);
  if (!P || P.c.length !== 3 || P.c.some(r => r.q !== 1)) return null;
  const [c, b, a] = P.c.map(r => r.p);
  if (c === 0) return null; // x(ax + b) is a common factor, handled before
  const D = b * b - 4 * a * c;
  if (D < 0) return null;
  const s = isqrt(D);
  if (s < 0) return null;
  let r1 = rat(-b + s, 2 * a), r2 = rat(-b - s, 2 * a);
  const size = (r: Rat) => Math.abs(r.p / r.q);
  if (size(r2) < size(r1) || (size(r2) === size(r1) && r2.p > r1.p)) [r1, r2] = [r2, r1];
  const lead = a / (r1.q * r2.q);
  if (!Number.isInteger(lead)) return null;
  const pre = lead === 1 ? '' : lead === -1 ? '-' : String(lead);
  const body = r1.p === r2.p && r1.q === r2.q ? `${linear(P.v, r1)}^2` : linear(P.v, r1) + linear(P.v, r2);
  const text = pre + (pre && !body.startsWith('(') ? `(${body})` : body);
  return parseExpr(text);
}

/** the k-th root of a term, if it is a perfect k-th power: 8x⁶ → 2x², k = 2 or 3 */
function rootTerm(i: ReturnType<typeof termInfo>, k: number): Node | null {
  const ir = (n: number) => (k === 2 ? isqrt(n) : (r => (r ** 3 === n ? r : -1))(Math.round(Math.cbrt(n))));
  const p = ir(Math.abs(i.coef.p)), q = ir(i.coef.q);
  if (p < 0 || q < 0) return null;
  const mono: Node[] = [];
  for (const f of i.mono) {
    if (f.k !== 'pow' || f.exp.k !== 'num' || f.exp.v % k !== 0) return null;
    const e = f.exp.v / k;
    mono.push(e === 1 ? cloneFresh(f.base) : pow(cloneFresh(f.base), num(e)));
  }
  return buildTerm(rat(p, q), mono, num(1));
}

/** u² − v² → (u − v)(u + v) */
function diffSquares(n: Node): Node | null {
  const s = simplify(n, newHints());
  if (s.k !== 'add' || s.terms.length !== 2) return null;
  const infos = s.terms.map(termInfo);
  const posI = infos.findIndex(i => i.coef.p > 0), negI = infos.findIndex(i => i.coef.p < 0);
  if (posI < 0 || negI < 0) return null;
  const u = rootTerm(infos[posI], 2), w = rootTerm(infos[negI], 2);
  if (!u || !w) return null;
  return mul([add([u, negate(w)]), add([cloneFresh(u), cloneFresh(w)])]);
}

/** u³ + v³ → (u + v)(u² − uv + v²), u³ − v³ → (u − v)(u² + uv + v²) */
function sumCubes(n: Node): Node | null {
  const s = simplify(n, newHints());
  if (s.k !== 'add' || s.terms.length !== 2) return null;
  const infos = s.terms.map(termInfo);
  if (infos[0].coef.p < 0) return null; // keep a leading minus for the common-factor step
  const u = rootTerm(infos[0], 3);
  const minus = infos[1].coef.p < 0;
  const w = rootTerm({ ...infos[1], coef: rat(Math.abs(infos[1].coef.p), infos[1].coef.q) }, 3);
  if (!u || !w || (u.k === 'num' && w.k === 'num')) return null;
  const h = newHints();
  const sq = (x: Node) => {
    const i = termInfo(x);
    return buildTerm(rat(i.coef.p ** 2, i.coef.q ** 2), i.mono.map(f => (f.k === 'pow' && f.exp.k === 'num' ? pow(cloneFresh(f.base), num(f.exp.v * 2)) : pow(cloneFresh(f), num(2)))), num(1));
  };
  const uw = simplify(mul([cloneFresh(u), cloneFresh(w)]), h);
  return mul([add([u, minus ? negate(w) : w]), add([sq(u), minus ? uw : negate(uw), sq(w)])]);
}

/** u² ± 2uv + v² → (u ± v)², for any two square terms */
function perfectSquare(n: Node): Node | null {
  const s = simplify(n, newHints());
  if (s.k !== 'add' || s.terms.length !== 3) return null;
  const infos = s.terms.map(termInfo);
  const vars = symbols(s);
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
    if (infos[i].coef.p < 0 || infos[j].coef.p < 0) continue;
    const u = rootTerm(infos[i], 2), w = rootTerm(infos[j], 2);
    if (!u || !w) continue;
    for (const sign of [1, -1]) {
      const cand = pow(add([u, sign > 0 ? w : negate(w)]), num(2));
      const same = [0.37, 1.3, -2.1].every(x => {
        const env = Object.fromEntries(vars.map((v, k) => [v, x + k * 0.71]));
        const a = evaluate(cand, env), b = evaluate(s, env);
        return Math.abs(a - b) <= 1e-9 * (1 + Math.abs(b));
      });
      if (same) return cand;
    }
  }
  return null;
}

let depth = 0;

/** Factor as far as whole numbers allow. Null if nothing factors. */
export function factorize(n: Node, h: Hints): Node | null {
  if (n.k === 'mul') {
    let changed = false;
    const fs = n.factors.flatMap(f => {
      const r = f.k === 'add' ? factorize(f, h) : null;
      if (!r) return [f];
      changed = true;
      return r.k === 'mul' ? r.factors : [r];
    });
    return changed ? mul(fs, n.id) : null;
  }
  if (n.k !== 'add') return null;
  const common = factorCommon(n, h);
  const outer = common && common.k === 'mul' ? common.factors.slice(0, -1) : [];
  const base = common && common.k === 'mul' ? common.factors[common.factors.length - 1] : n;
  const deeper = factorQuadratic(base) ?? diffSquares(base) ?? sumCubes(base) ?? perfectSquare(base);
  if (!common && !deeper) return null;
  const parts = [...outer, ...(deeper ? (deeper.k === 'mul' ? deeper.factors : [deeper]) : [base])];
  if (parts.length === 1) return parts[0];
  const out = mul(parts, common?.id ?? newId());
  if (!deeper || depth > 4) return out;
  // keep going: x⁴ − 16 → (x² − 4)(x² + 4) → (x − 2)(x + 2)(x² + 4)
  depth++;
  try { return factorize(out, h) ?? out; } finally { depth--; }
}

export function findExpandable(n: Node): Node | null {
  if (n.k === 'mul' && n.factors.some(f => f.k === 'add')) return n;
  if (n.k === 'neg' && n.arg.k === 'add') return n;
  if (n.k === 'pow' && n.base.k === 'add' && n.exp.k === 'num' && Number.isInteger(n.exp.v) && n.exp.v >= 2 && n.exp.v <= 6) return n;
  for (const c of children(n)) { const r = findExpandable(c); if (r) return r; }
  return null;
}

export const hasExpandable = (n: Node) => findExpandable(n) !== null;

/** Multiply everything out and collect like terms. */
export function expandAll(n: Node, h: Hints): Node {
  let cur = n;
  for (let i = 0; i < 80; i++) {
    const t = findExpandable(cur);
    if (!t) break;
    let rep: Node | null;
    if (t.k === 'pow') {
      const k = (t.exp as NumN).v;
      rep = distributeNode(mul([t.base, ...Array.from({ length: k - 1 }, () => cloneFresh(t.base))], t.id), h);
    } else rep = distributeNode(t, h);
    if (!rep) break;
    cur = simplify(replace(cur, t.id, rep), h);
  }
  return simplify(cur, h);
}

const lcm = (a: number, b: number) => Math.abs(a * b) / (gcd(a, b) || 1);

/** a/b + c/d → (ad + cb)/(bd), using the least common denominator for numbers. */
export function combineFractions(n: Node, h: Hints): Node | null {
  if (n.k !== 'add' || !n.terms.some(t => t.k === 'frac')) return null;
  const dens: Node[] = [];
  for (const t of n.terms) if (t.k === 'frac' && !dens.some(d => key(d) === key(t.den))) dens.push(t.den);
  const numeric = dens.every(d => d.k === 'num');
  let D: Node;
  const numer: Node[] = [];
  if (numeric) {
    const L = dens.reduce((a, d) => lcm(a, (d as NumN).v), 1);
    D = num(L);
    for (const t of n.terms) {
      const [top, d] = t.k === 'frac' ? [t.num, (t.den as NumN).v] : [t, 1];
      numer.push(L / d === 1 ? top : mul([num(L / d), top]));
    }
  } else {
    D = dens.length === 1 ? dens[0] : mul(dens.map(cloneFresh));
    for (const t of n.terms) {
      const [top, d] = t.k === 'frac' ? [t.num, t.den] : [t, null];
      const others = dens.filter(x => !d || key(x) !== key(d)).map(cloneFresh);
      numer.push(others.length ? mul([...others, top]) : top);
    }
  }
  const top = expandAll(add(numer), h);
  return frac(standardOrder(top) ?? top, simplify(D, h));
}

/** Highest power first, constants last. Null if already in that order. */
export function standardOrder(n: Node): Node | null {
  if (n.k !== 'add') return null;
  const deg = (t: Node) => termInfo(t).mono.reduce((s, f) => s + (f.k === 'pow' && f.exp.k === 'num' ? f.exp.v : f.k === 'sym' ? 1 : 0.5), 0);
  const sorted = n.terms.map((t, i) => ({ t, i, d: deg(t) })).sort((a, b) => b.d - a.d || a.i - b.i).map(x => x.t);
  if (sorted.every((t, i) => t === n.terms[i])) return null;
  return { ...n, terms: sorted };
}
