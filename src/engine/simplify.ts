// Local simplification: arithmetic, like terms, cancellation. Each rule keeps the
// ids of what survives and reports what got absorbed into what, so the renderer
// can fly the absorbed pieces into their target instead of just deleting them.
import { Node, children, withChildren, num, sym, add, mul, neg, frac, pow, sqrt, fn, key, evaluate, hasSymbols, symbols, isDiff, DEFS, cloneFresh, oneToOne } from './ast';
import { negate, coefOf, termInfo, buildTerm, gcd, rat, radd, rdiv, safe } from './terms';

export interface Hints {
  /** removed node id → id of the node it merged into */
  absorbs: Map<string, string>;
  /** a ghost copy of `from` (old tree) flies to `to` (new tree) */
  flights: { from: string; to: string }[];
}
export const newHints = (): Hints => ({ absorbs: new Map(), flights: [] });

export function simplify(n: Node, h: Hints): Node {
  let cur = n;
  for (let i = 0; i < 30; i++) {
    const next = pass(cur, h);
    if (next === cur) return cur;
    cur = next;
  }
  return cur;
}

function pass(n: Node, h: Hints): Node {
  const kids = children(n);
  let changed = false;
  const next = kids.map(c => {
    const r = pass(c, h);
    if (r !== c) changed = true;
    return r;
  });
  const m = changed ? withChildren(n, next) : n;
  return rule(m, h) ?? m;
}

/** a function you defined, at a number, worked out when it comes out a number: f(3) = 10 with
 *  f(x) = x² + 1. Anything else (f(a), or I(0) with I(t) = ∫ …) stays for Tab u to unfold */
function callRule(name: string, arg: Node, id: string, h: Hints): Node | null {
  // f⁻¹(f(a)) = a and f(f⁻¹(a)) = a, for a function that has an inverse (one-to-one)
  if (arg.k === 'call') {
    const F = name.endsWith('⁻¹') ? name.slice(0, -2) : name;
    const pair = name.endsWith('⁻¹') ? arg.name === F : arg.name === F + '⁻¹';
    if (pair && oneToOne(F)) return arg.arg;
  }
  // f⁻¹(7) with no formula for f⁻¹ yet: the input f takes to 7, when it is a plain fraction
  // (checked exactly: f at that fraction is 7)
  if (name.endsWith('⁻¹') && !DEFS.has(name) && DEFS.has(name.slice(0, -2)) && !hasSymbols(arg) && oneToOne(name.slice(0, -2))) {
    const want = evaluate(arg, {}), y = evaluate({ k: 'call', id, name, arg }, {}), d = DEFS.get(name.slice(0, -2))!;
    for (let q = 1; q <= 12 && Number.isFinite(y); q++) {
      const p = Math.round(y * q);
      if (Math.abs(evaluate(d.body, { [d.param]: p / q }) - want) <= 1e-12 * (1 + Math.abs(want))) return q === 1 ? num(p, id) : p < 0 ? { k: 'neg', id, arg: frac(num(-p), num(q)) } as Node : frac(num(p), num(q), id);
    }
  }
  const d = DEFS.get(name);
  if (!d || hasSymbols(arg)) return null;
  // a definition with calculus in it (I(t) = ∫ …) is worked out by you, not by s
  let calc = false;
  const look = (m: Node) => { if (['deriv', 'lim', 'int', 'at', 'sum', 'grad', 'call'].includes(m.k)) calc = true; children(m).forEach(look); };
  look(d.body);
  if (calc) return null;
  const ps = d.param.split(','), as = arg.k === 'vec' && ps.length > 1 ? arg.items : [arg];
  if (as.length !== ps.length) return null;
  const put = (m: Node): Node => (m.k === 'sym' && ps.includes(m.name) ? cloneFresh(as[ps.indexOf(m.name)]) : withChildren(m, children(m).map(put)));
  const r = simplify(put(cloneFresh(d.body)), h);
  if (hasSymbols(r)) return null;
  h.absorbs.set(arg.id, id);
  return { ...r, id };
}

const mulOf = (fs: Node[], id?: string): Node => (fs.length === 0 ? num(1) : fs.length === 1 ? fs[0] : mul(fs, id));

function rule(n: Node, h: Hints): Node | null {
  switch (n.k) {
    case 'neg': {
      const a = n.arg;
      if (a.k === 'neg') return a.arg;
      if (a.k === 'num' || a.k === 'frac' || coefOf(a)) return negate(a);
      return null;
    }
    case 'mul': return mulRule(n.factors, n.id, h);
    case 'add': return addRule(n.terms, n.id, h);
    // Σ 0 = 0 and ∏ 1 = 1, whatever the range
    case 'sum': return n.arg.k === 'num' && n.arg.v === (n.prod ? 1 : 0) ? num(n.arg.v, n.id) : null;
    case 'frac': return fracRule(n.num, n.den, n.id, h);
    case 'pow': {
      const { base, exp } = n;
      if (exp.k === 'num' && exp.v === 1) return base;
      if (exp.k === 'num' && exp.v === 0) return num(1, exp.id);
      // 1 to any power is 1
      if (base.k === 'num' && base.v === 1) { h.absorbs.set(exp.id, base.id); return base; }
      if (base.k === 'num' && exp.k === 'num' && Number.isInteger(exp.v) && exp.v > 0 && exp.v <= 12) {
        const v = base.v ** exp.v;
        if (safe(v)) { h.absorbs.set(exp.id, base.id); return num(v, base.id); }
      }
      if (base.k === 'num' && exp.k === 'num' && Number.isInteger(exp.v) && exp.v < 0 && exp.v >= -12 && base.v !== 0) {
        const v = base.v ** -exp.v;
        if (safe(v)) return frac(num(1), num(v, base.id), n.id);
      }
      // (1/b)ⁿ = 1/bⁿ: sec² typed as (1/cos x)² is 1/cos² x
      if (base.k === 'frac' && base.num.k === 'num' && base.num.v === 1 && exp.k === 'num' && Number.isInteger(exp.v) && exp.v > 1) return frac(base.num, pow(base.den, exp), n.id);
      // a minus or a fraction of numbers to a whole power: (−a)ⁿ = ±aⁿ, (a/b)ⁿ = aⁿ/bⁿ, so (−1/2)² is 1/4
      if (exp.k === 'num' && Number.isInteger(exp.v) && exp.v > 1 && exp.v <= 12 && !hasSymbols(base)) {
        if (base.k === 'neg') return exp.v % 2 ? neg(pow(base.arg, exp), n.id) : pow(base.arg, exp, n.id);
        if (base.k === 'frac' && base.num.k === 'num' && base.den.k === 'num') return frac(pow(base.num, num(exp.v)), pow(base.den, exp), n.id);
      }
      // whole roots of numbers: 8^(1/3) → 2, 8^(2/3) → 4, 4^(−1/2) → 1/2, (−8)^(1/3) → −2
      const pq = ratOf(exp.k === 'neg' ? exp.arg : exp);
      if (base.k === 'num' && Number.isInteger(base.v) && base.v !== 0 && pq && pq.q > 1 && Math.abs(pq.p) <= 6 && (base.v > 0 || pq.q % 2 === 1)) {
        const p = exp.k === 'neg' ? -pq.p : pq.p;
        const r = Math.round(Math.abs(base.v) ** (1 / pq.q)) * Math.sign(base.v);
        if (r ** pq.q === base.v) {
          h.absorbs.set(exp.id, base.id);
          const v = r ** Math.abs(p);
          if (safe(v)) return p > 0 ? num(v, base.id) : frac(num(1), num(v, base.id), n.id);
        }
      }
      // √3³ → 3√3: whole squares come out of a root's power
      if (base.k === 'sqrt' && exp.k === 'num' && Number.isInteger(exp.v) && exp.v > 2) {
        const k = Math.floor(exp.v / 2);
        return mul([pow(base.arg, num(k)), ...(exp.v % 2 ? [base] : [])], n.id);
      }
      // inverse pairs: e^(ln a) = a, 10^(log a) = a, (√a)² = a
      if (base.k === 'sym' && base.name === 'e' && exp.k === 'fn' && exp.name === 'ln') return exp.arg;
      // e^(k ln a) = a^k: e^(5 ln 2) is 32
      if (base.k === 'sym' && base.name === 'e' && exp.k === 'mul' && exp.factors.length === 2 && exp.factors[0].k === 'num' && exp.factors[1].k === 'fn' && exp.factors[1].name === 'ln') {
        return pow(exp.factors[1].arg, exp.factors[0], n.id);
      }
      // e^(−ln a) = 1/a
      if (base.k === 'sym' && base.name === 'e' && exp.k === 'neg' && exp.arg.k === 'fn' && exp.arg.name === 'ln') return frac(num(1), exp.arg.arg, n.id);
      // e^(ln a + b) = a·e^b
      if (base.k === 'sym' && base.name === 'e' && exp.k === 'add' && exp.terms.some(x => x.k === 'fn' && x.name === 'ln')) {
        const logs = exp.terms.filter(x => x.k === 'fn' && x.name === 'ln') as Extract<Node, { k: 'fn' }>[];
        const rest = exp.terms.filter(x => !logs.includes(x as never));
        return mulOf([...logs.map(l => l.arg), pow(base, rest.length === 1 ? rest[0] : { ...exp, terms: rest }, n.id)]);
      }
      if (base.k === 'num' && base.v === 10 && exp.k === 'fn' && exp.name === 'log') return exp.arg;
      // 2^(log₂ a) = a (log₂ a kept as ln a/ln 2)
      if (base.k === 'num' && exp.k === 'frac' && exp.num.k === 'fn' && exp.num.name === 'ln' && exp.den.k === 'fn' && exp.den.name === 'ln' && exp.den.arg.k === 'num' && exp.den.arg.v === base.v) return exp.num.arg;
      if (base.k === 'sqrt' && exp.k === 'num' && exp.v === 2) { h.absorbs.set(exp.id, base.arg.id); return base.arg; }
      if (base.k === 'fn' && base.name === 'abs' && exp.k === 'num' && exp.v % 2 === 0) return pow(base.arg, exp, n.id);
      // (b^n)^(1/n) = b for odd n, |b| for even n
      const r1 = ratOf(exp);
      if (base.k === 'pow' && base.exp.k === 'num' && Number.isInteger(base.exp.v) && r1 && r1.p === 1 && r1.q === base.exp.v) {
        h.absorbs.set(base.exp.id, base.base.id);
        return base.exp.v % 2 === 0 ? fn('abs', base.base, n.id) : base.base;
      }
      // (b^(1/n))^n = b wherever the root is defined
      const r0 = base.k === 'pow' ? ratOf(base.exp) : null;
      if (base.k === 'pow' && r0 && r0.p === 1 && r0.q > 1 && exp.k === 'num' && exp.v === r0.q) {
        h.absorbs.set(exp.id, base.base.id);
        return base.base;
      }
      // (b^r)^s = b^(rs) when a root cancels: ((x − 1)^(3/4))^(4/3) = x − 1, (x²)^(3/2) = |x|³.
      // b^(even/odd) forgets b's sign, so unless the result is an even power again, |b| comes back.
      // (An even root, like the 4 in 3/4, already needs b ≥ 0, so nothing is lost there.)
      // A power of a power with nothing cancelling, (x^(1/3))² or (x²)², is a form you chose
      // (to name x^(1/3) or x²), so s leaves it; Tab p combines it.
      if (base.k === 'pow' && r0 && r1 && (r0.q > 1 || r1.q > 1) && rat(r0.p * r1.p, r0.q * r1.q).q === 1) {
        h.absorbs.set(exp.id, base.exp.id);
        const r = rat(r0.p * r1.p, r0.q * r1.q);
        const lost = r0.p % 2 === 0 && r0.q % 2 === 1 && !(r.q % 2 === 1 && r.p % 2 === 0);
        const b = lost ? fn('abs', base.base) : base.base;
        if (r.p === 1 && r.q === 1) return b;
        return pow(b, r.q === 1 ? num(r.p, base.exp.id) : frac(num(r.p), num(r.q), base.exp.id), n.id);
      }
      // (−a)ⁿ = aⁿ for an even n
      if (base.k === 'neg' && exp.k === 'num' && Number.isInteger(exp.v) && exp.v % 2 === 0) return pow(base.arg, exp, n.id);
      return null;
    }
    case 'sqrt': {
      const a = n.arg;
      if (a.k === 'num' && a.v >= 0 && Number.isInteger(Math.sqrt(a.v))) return num(Math.sqrt(a.v), a.id);
      // √12 → 2√3
      if (a.k === 'num' && Number.isInteger(a.v) && a.v > 3) {
        for (let k = Math.floor(Math.sqrt(a.v)); k > 1; k--) {
          if (a.v % (k * k) === 0) return mul([num(k), sqrt(num(a.v / (k * k), a.id), n.id)]);
        }
      }
      // √(a/b²) = √a / b
      if (a.k === 'frac' && a.den.k === 'num' && a.den.v > 1 && Number.isInteger(Math.sqrt(a.den.v))) return frac(sqrt(a.num, n.id), num(Math.sqrt(a.den.v), a.den.id));
      // √(a/b) with numbers = √(ab)/b, no root left on the bottom: √(1/2) = √2/2
      if (a.k === 'frac' && a.den.k === 'num' && a.den.v > 1 && Number.isInteger(a.den.v) && a.num.k === 'num' && a.num.v > 0 && Number.isInteger(a.num.v)) return frac(sqrt(num(a.num.v * a.den.v, a.num.id), n.id), num(a.den.v, a.den.id));
      // √(b²) = |b|
      if (a.k === 'pow' && a.exp.k === 'num' && a.exp.v === 2) { h.absorbs.set(a.exp.id, a.base.id); return fn('abs', a.base, n.id); }
      // √(x⁴) = x², √(x⁶) = |x³|
      if (a.k === 'pow' && a.exp.k === 'num' && Number.isInteger(a.exp.v) && a.exp.v > 2 && a.exp.v % 2 === 0) {
        const half = pow(a.base, num(a.exp.v / 2, a.exp.id));
        return (a.exp.v / 2) % 2 === 0 ? half : fn('abs', half, n.id);
      }
      // √(4x²) = 2|x|: the factors that are squares come out
      if (a.k === 'mul') {
        const out: Node[] = [], keep: Node[] = [];
        for (const f of a.factors) {
          if (f.k === 'num' && f.v > 0 && Number.isInteger(Math.sqrt(f.v))) out.push(num(Math.sqrt(f.v), f.id));
          else if (f.k === 'pow' && f.exp.k === 'num' && Number.isInteger(f.exp.v) && f.exp.v % 2 === 0 && f.exp.v > 0) out.push(sqrt(f, f.id + 'r'));
          else keep.push(f);
        }
        // the number, then what stays under the root, then the letters: 3√2·|x|
        const nums = out.filter(f => f.k === 'num'), rest = out.filter(f => f.k !== 'num');
        if (out.length && !(out.length === 1 && out[0].k === 'num' && out[0].v === 1 && !keep.length)) return mul([...nums, ...(keep.length ? [sqrt(keep.length === 1 ? keep[0] : mul(keep), n.id)] : []), ...rest]);
      }
      return null;
    }
    case 'fn': return fnRule(n.name, n.arg, n.id, h);
    case 'call': return callRule(n.name, n.arg, n.id, h);
    // nothing to add up: a definite integral of 0 is 0
    case 'int': return n.arg.k === 'num' && n.arg.v === 0 && n.lo && n.hi ? num(0, n.id) : null;
    default: return null;
  }
}

const ratOf = (n: Node) => (n.k === 'num' ? rat(n.v) : n.k === 'frac' && n.num.k === 'num' && n.den.k === 'num' && n.den.v !== 0 ? rat(n.num.v, n.den.v) : null);

/** never below 0, whatever the letters are: squares, exponentials, roots, and sums and products of them */
export function nonneg(n: Node): boolean {
  switch (n.k) {
    case 'num': return n.v >= 0;
    case 'sym': return n.name === 'e' || n.name === 'π';
    case 'sqrt': return true;
    case 'fn': return n.name === 'abs';
    case 'pow': return (n.exp.k === 'num' && n.exp.v % 2 === 0) || (n.base.k === 'sym' && n.base.name === 'e') || (n.base.k === 'num' && n.base.v > 0) || nonneg(n.base);
    case 'add': return n.terms.every(nonneg);
    case 'mul': return n.factors.every(nonneg);
    case 'frac': return nonneg(n.num) && nonneg(n.den);
    default: return false;
  }
}

function fnRule(name: string, a: Node, id: string, h: Hints): Node | null {
  switch (name) {
    case 'abs':
      if (a.k === 'num') return num(Math.abs(a.v), a.id);
      if (a.k === 'neg') return fn('abs', a.arg, id);
      if (a.k === 'fn' && a.name === 'abs') return a;
      if (a.k === 'sqrt') return a;
      if (a.k === 'pow' && a.exp.k === 'num' && a.exp.v % 2 === 0) return a;
      // |x² + 1| is x² + 1: nothing inside can go below 0
      if (nonneg(a)) return a;
      if (a.k === 'mul' && a.factors[0]?.k === 'num' && a.factors[0].v < 0) return fn('abs', { ...a, factors: [num(-a.factors[0].v, a.factors[0].id), ...a.factors.slice(1)] }, id);
      return null;
    case 'ln':
      if (a.k === 'num' && a.v === 1) return num(0, a.id);
      if (a.k === 'sym' && a.name === 'e') return num(1, a.id);
      // ln 8 = 3 ln 2, so ln 8 / ln 2 cancels
      if (a.k === 'num' && Number.isInteger(a.v) && a.v > 3) {
        for (let b = 2; b * b <= a.v; b++) {
          let k = 0, m = a.v;
          while (m % b === 0) { m /= b; k++; }
          if (m === 1 && k > 1) return mul([num(k), fn('ln', num(b, a.id), id)]);
        }
      }
      if (a.k === 'pow' && a.base.k === 'sym' && a.base.name === 'e') { h.absorbs.set(a.base.id, a.exp.id); return a.exp; }
      // ln(c^b) = b·ln c for a positive number c
      if (a.k === 'pow' && a.base.k === 'num' && a.base.v > 0) return mul([a.exp, fn('ln', a.base, a.id)], id);
      return null;
    case 'log':
      if (a.k === 'num' && a.v > 0 && Number.isInteger(Math.log10(a.v))) return num(Math.round(Math.log10(a.v)), a.id);
      if (a.k === 'pow' && a.base.k === 'num' && a.base.v === 10) { h.absorbs.set(a.base.id, a.exp.id); return a.exp; }
      return null;
    case 'sin': case 'cos': case 'tan': {
      const inv = 'a' + name;
      if (a.k === 'fn' && a.name === inv) return a.arg; // sin(arcsin x) = x wherever it is defined
      return exactTrig(name, a);
    }
    case 'asin': case 'acos': case 'atan':
      return exactArc(name, a);
  }
  return null;
}

function mulRule(fs: Node[], id: string, h: Hints): Node | null {
  if (fs.length === 0) return num(1);
  if (fs.length === 1) return fs[0];
  if (fs.some(f => f.k === 'mul')) return mul(fs.flatMap(f => (f.k === 'mul' ? f.factors : [f])), id);
  const negI = fs.findIndex(f => f.k === 'neg');
  if (negI >= 0) {
    const rest = fs.map((f, i) => (i === negI ? (f as { arg: Node }).arg : f));
    const c = coefOf({ k: 'mul', id, factors: rest } as Node);
    return c ? mul([num(-c.v, c.id), ...rest.slice(1)], id) : mul([num(-1), ...rest], id);
  }
  // a differential is written last, outside any fraction: x²/y² dx
  const isD = (f: Node) => f.k === 'sym' && isDiff(f.name);
  if (fs.some((f, i) => isD(f) && fs.slice(i + 1).some(g => !isD(g)))) return mul([...fs.filter(f => !isD(f)), ...fs.filter(isD)], id);
  const fi = fs.findIndex(f => f.k === 'frac');
  if (fi >= 0) {
    const F = fs[fi] as Extract<Node, { k: 'frac' }>;
    const others = fs.filter((_, i) => i !== fi);
    const ds = others.filter(isD), rest = others.filter(f => !isD(f));
    // (a dx below cancels with the one beside it: dy/dx · dx is dy)
    const keepOut = ds.length && !symbols(F.den).some(isDiff);
    if (keepOut && !rest.length) { /* x²/y² dx stays as it is */ }
    else if (keepOut) return mul([frac(mul([...rest, F.num]), F.den, F.id), ...ds], id);
    else return frac(mul([...others, F.num], id), F.den, F.id);
  }
  const nums = fs.filter(f => f.k === 'num') as Extract<Node, { k: 'num' }>[];
  if (nums.length > 1) {
    const v = nums.reduce((s, x) => s * x.v, 1);
    if (!safe(v)) return null;
    nums.slice(1).forEach(x => h.absorbs.set(x.id, nums[0].id));
    return mul([num(v, nums[0].id), ...fs.filter(f => f.k !== 'num')], id);
  }
  if (nums.length === 1) {
    const c = nums[0];
    if (c.v === 0) { fs.forEach(f => f !== c && h.absorbs.set(f.id, c.id)); return c; }
    if (c.v === 1) return mulOf(fs.filter(f => f !== c), id);
    if (fs[0] !== c) return mul([c, ...fs.filter(f => f !== c)], id);
  }
  // eˣ·eˣ → e²ˣ, xⁿ·x → xⁿ⁺¹: a letter power with the same base adds its exponents
  // (but eˣ·eʸ stays apart, as separating variables needs it)
  const oneLetter = (a: Node, b: Node) => new Set([...symbols(a), ...symbols(b)].filter(n => n !== 'e' && n !== 'π')).size <= 1;
  for (let i = 0; i < fs.length; i++) {
    const a = fs[i];
    if (a.k !== 'pow' || a.exp.k === 'num') continue;
    const j = fs.findIndex((b, k) => k !== i && b.k !== 'num' && (b.k === 'pow' ? key(b.base) === key(a.base) && oneLetter(a.exp, b.exp) : key(b) === key(a.base)));
    if (j < 0) continue;
    const b = fs[j];
    h.absorbs.set(b.id, a.id);
    const merged = pow(a.base, add([a.exp, b.k === 'pow' ? b.exp : num(1)]), a.id);
    return mulOf(fs.flatMap((f, k) => (k === i ? [merged] : k === j ? [] : [f])), id);
  }
  // x·x → x², x·x² → x³
  const baseOf = (f: Node) => (f.k === 'pow' && f.exp.k === 'num' ? f.base : f);
  const expOf = (f: Node) => (f.k === 'pow' && f.exp.k === 'num' ? f.exp.v : 1);
  const seen = new Map<string, number>();
  for (let i = 0; i < fs.length; i++) {
    if (fs[i].k === 'num') continue;
    const k = key(baseOf(fs[i]));
    if (!seen.has(k)) { seen.set(k, i); continue; }
    const first = fs[seen.get(k)!];
    const group = fs.filter(f => f.k !== 'num' && key(baseOf(f)) === k);
    const total = group.reduce((s, f) => s + expOf(f), 0);
    group.slice(1).forEach(f => h.absorbs.set(f.id, baseOf(first).id));
    const merged = total === 1 ? baseOf(first)
      : first.k === 'pow' && first.exp.k === 'num' ? pow(first.base, num(total, first.exp.id), first.id)
      : pow(first, num(total));
    const out: Node[] = [];
    fs.forEach(f => {
      if (f === first) out.push(total === 0 ? num(1) : merged);
      else if (!group.includes(f)) out.push(f);
    });
    return mulOf(out, id);
  }
  return null;
}

function addRule(ts: Node[], id: string, h: Hints): Node | null {
  if (ts.length === 0) return num(0);
  if (ts.length === 1) return ts[0];
  if (ts.some(t => t.k === 'add')) {
    return { k: 'add', id, terms: ts.flatMap(t => (t.k === 'add' ? t.terms : [t])) };
  }
  const infos = ts.map(termInfo);
  const groups = new Map<string, number[]>();
  infos.forEach((inf, i) => {
    const g = groups.get(inf.mkey);
    g ? g.push(i) : groups.set(inf.mkey, [i]);
  });
  let changed = false;
  const out: Node[] = [];
  const done = new Set<number>();
  ts.forEach((t, i) => {
    if (done.has(i)) return;
    const g = groups.get(infos[i].mkey)!;
    g.forEach(j => done.add(j));
    const total = g.reduce((s, j) => radd(s, infos[j].coef), rat(0));
    if (g.length === 1 && total.p !== 0) { out.push(t); return; }
    changed = true;
    if (total.p === 0) return; // they cancel: everything in the group vanishes
    const built = buildTerm(total, infos[i].mono, t);
    g.slice(1).forEach(j => h.absorbs.set(ts[j].id, built.id));
    out.push(built);
  });
  if (!changed) return null;
  if (out.length === 0) return num(0);
  return out.length === 1 ? out[0] : { k: 'add', id, terms: out };
}

/** gcd of the integer coefficients (1 if any coefficient is fractional). */
function content(n: Node): number {
  if (n.k === 'add') {
    const infos = n.terms.map(termInfo);
    if (infos.some(i => i.coef.q !== 1)) return 1;
    return infos.reduce((g, i) => gcd(g, i.coef.p), 0) || 1;
  }
  const i = termInfo(n);
  return i.coef.q === 1 ? Math.abs(i.coef.p) || 1 : 1;
}

function divideContent(n: Node, g: number): Node {
  if (n.k === 'add') return { ...n, terms: n.terms.map(t => divideContent(t, g)) };
  const i = termInfo(n);
  return buildTerm(rdiv(i.coef, rat(g)), i.mono, n);
}

function fracRule(a: Node, d: Node, id: string, h: Hints): Node | null {
  if (a.k === 'num' && a.v === 0 && !(d.k === 'num' && d.v === 0)) return a;
  // log_b(b^E) = E, and log₂ 8 = 3 (log_b kept as ln/ln b)
  if (a.k === 'fn' && a.name === 'ln' && d.k === 'fn' && d.name === 'ln' && d.arg.k === 'num' && d.arg.v > 1) {
    const b = d.arg.v, A = a.arg;
    if (A.k === 'pow' && A.base.k === 'num' && A.base.v === b) return A.exp;
    if (A.k === 'num' && A.v > 0) { const k = Math.round(Math.log(A.v) / Math.log(b)); if (Math.abs(k) <= 64 && b ** k === A.v) return num(k); }
    if (A.k === 'frac' && A.num.k === 'num' && A.num.v === 1 && A.den.k === 'num') { const k = Math.round(Math.log(A.den.v) / Math.log(b)); if (k > 0 && k <= 64 && b ** k === A.den.v) return num(-k); }
  }
  // x² dx over y²: the differential comes out, x²/y² dx (once nothing on top cancels with it)
  const isD = (f: Node) => f.k === 'sym' && isDiff(f.name);
  if (a.k === 'mul' && a.factors.some(isD) && !a.factors.every(isD) && !symbols(d).some(isDiff)) {
    const rest = a.factors.filter(f => !isD(f));
    return mul([frac(rest.length === 1 ? rest[0] : mul(rest), d, id), ...a.factors.filter(isD)]);
  }
  // −x²/x: cancel under the minus
  if (a.k === 'neg') { const r = fracRule(a.arg, d, id, h); if (r) return negate(r); }
  // a / b^(−k) = a·b^k
  if (d.k === 'pow' && d.exp.k === 'num' && d.exp.v < 0) return mulOf([a, pow(d.base, num(-d.exp.v, d.exp.id), d.id)].filter(f => !(f.k === 'num' && f.v === 1)), id);
  if (d.k === 'num') {
    if (d.v === 1) return a;
    if (d.v === -1) return negate(a);
    if (d.v < 0) return frac(negate(a), num(-d.v, d.id), id);
  }
  if (a.k === 'frac') return frac(a.num, mul([a.den, d]), id);
  if (d.k === 'frac') return frac(mul([a, d.den]), d.num, id);
  const g = gcd(content(a), content(d));
  if (g > 1 && !(d.k === 'num' && d.v === 0)) return frac(divideContent(a, g), divideContent(d, g), id);
  // cancel identical factors top and bottom
  const nf = a.k === 'mul' ? [...a.factors] : [a];
  const df = d.k === 'mul' ? [...d.factors] : [d];
  let cancelled = false;
  for (let i = df.length - 1; i >= 0; i--) {
    if (df[i].k === 'num') continue;
    const j = nf.findIndex(f => f.k !== 'num' && key(f) === key(df[i]));
    if (j >= 0) {
      h.absorbs.set(nf[j].id, df[i].id);
      nf.splice(j, 1); df.splice(i, 1); cancelled = true;
    }
  }
  // a thing over its own root: x/√x = √x
  for (let i = df.length - 1; i >= 0; i--) {
    const r = df[i];
    if (r.k !== 'sqrt') continue;
    const j = nf.findIndex(f => key(f) === key(r.arg));
    if (j < 0) continue;
    h.absorbs.set(nf[j].id, r.id);
    nf[j] = r; df.splice(i, 1); cancelled = true;
  }
  // powers of the same thing: x³/x² = x, x/x³ = 1/x²
  const baseOf = (f: Node) => (f.k === 'pow' && f.exp.k === 'num' && Number.isInteger(f.exp.v) && f.exp.v > 0 ? f.base : f);
  const expOf = (f: Node) => (f.k === 'pow' && f.exp.k === 'num' && Number.isInteger(f.exp.v) && f.exp.v > 0 ? f.exp.v : 1);
  for (let i = df.length - 1; i >= 0; i--) {
    if (df[i].k === 'num') continue;
    const b = key(baseOf(df[i]));
    const j = nf.findIndex(f => f.k !== 'num' && key(baseOf(f)) === b);
    if (j < 0) continue;
    const r = expOf(nf[j]) - expOf(df[i]), base = baseOf(nf[j]);
    const p = (k: number, like: Node) => (k === 1 ? base : pow(base, num(k), like.id));
    h.absorbs.set((r >= 0 ? df[i] : nf[j]).id, (r >= 0 ? nf[j] : df[i]).id);
    if (r > 0) { nf[j] = p(r, nf[j]); df.splice(i, 1); }
    else if (r < 0) { df[i] = p(-r, df[i]); nf.splice(j, 1); }
    else { nf.splice(j, 1); df.splice(i, 1); }
    cancelled = true;
  }
  if (cancelled) return frac(mulOf(nf, a.k === 'mul' ? a.id : undefined), mulOf(df, d.k === 'mul' ? d.id : undefined), id);
  // a minus underneath goes on top: x/(−y) = −x/y
  if (d.k === 'neg') return fracRule(negate(a), d.arg, id, h) ?? frac(negate(a), d.arg, id);
  // a minus on top over a difference: turn the bottom round instead, −3/(2 − x) = 3/(x − 2)
  const negTop = a.k === 'neg' || (a.k === 'num' && a.v < 0) || (a.k === 'mul' && a.factors[0].k === 'num' && a.factors[0].v < 0);
  if (negTop && d.k === 'add' && d.terms.length === 2 && d.terms[0].k !== 'neg' && !(d.terms[0].k === 'num' && d.terms[0].v < 0) && d.terms[1].k === 'neg')
    return frac(negate(a), add([d.terms[1].arg, negate(d.terms[0])], d.id), id);
  return null;
}

/* ---------- exact trig values at multiples of π/6 and π/4 ---------- */

/** r if n is r·π */
function piMultiple(n: Node): { p: number; q: number } | null {
  if (n.k === 'sym' && n.name === 'π') return { p: 1, q: 1 };
  if (n.k === 'num' && n.v === 0) return { p: 0, q: 1 };
  if (n.k === 'mul' && n.factors.length === 2 && n.factors[0].k === 'num' && n.factors[1].k === 'sym' && n.factors[1].name === 'π') return { p: n.factors[0].v, q: 1 };
  if (n.k === 'frac' && n.den.k === 'num') { const t = piMultiple(n.num); return t ? rat(t.p, t.q * n.den.v) : null; }
  if (n.k === 'neg') { const t = piMultiple(n.arg); return t ? rat(-t.p, t.q) : null; }
  return null;
}

const NICE: [number, () => Node][] = [
  [0, () => num(0)], [0.5, () => frac(num(1), num(2))], [1, () => num(1)],
  [Math.SQRT2 / 2, () => frac(sqrt(num(2)), num(2))], [Math.sqrt(3) / 2, () => frac(sqrt(num(3)), num(2))],
  [Math.sqrt(3), () => sqrt(num(3))], [Math.sqrt(3) / 3, () => frac(sqrt(num(3)), num(3))],
];

function niceValue(v: number): Node | null {
  for (const [x, mk] of NICE) {
    if (Math.abs(Math.abs(v) - x) < 1e-12) { const n = mk(); return v < 0 ? negate(n) : n; }
  }
  return null;
}

function exactTrig(name: string, a: Node): Node | null {
  const r = piMultiple(a);
  if (!r || ![1, 2, 3, 4, 6].includes(r.q)) return null;
  const x = (r.p / r.q) * Math.PI;
  const v = name === 'sin' ? Math.sin(x) : name === 'cos' ? Math.cos(x) : Math.cos(x) === 0 || Math.abs(Math.cos(x)) < 1e-12 ? NaN : Math.tan(x);
  return Number.isFinite(v) ? niceValue(v) : null;
}

const ARC_RANGE: Record<string, number[]> = {
  asin: [-1 / 2, -1 / 3, -1 / 4, -1 / 6, 0, 1 / 6, 1 / 4, 1 / 3, 1 / 2],
  acos: [0, 1 / 6, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 5 / 6, 1],
  atan: [-1 / 3, -1 / 4, -1 / 6, 0, 1 / 6, 1 / 4, 1 / 3],
};

function exactArc(name: string, a: Node): Node | null {
  if (hasSymbols(a) || a.k === 'fn') return null;
  if (!(a.k === 'num' || a.k === 'frac' || a.k === 'sqrt' || a.k === 'neg' || a.k === 'mul')) return null;
  const v = evaluate(a, {});
  if (!Number.isFinite(v)) return null;
  const f = name === 'asin' ? Math.sin : name === 'acos' ? Math.cos : Math.tan;
  for (const t of ARC_RANGE[name]) {
    if (Math.abs(f(t * Math.PI) - v) < 1e-12) {
      const r = rat(Math.round(t * 12), 12);
      if (r.p === 0) return num(0);
      const top = Math.abs(r.p) === 1 ? sym('π') : mul([num(Math.abs(r.p)), sym('π')]);
      const body = r.q === 1 ? top : frac(top, num(r.q));
      return r.p < 0 ? negate(body) : body;
    }
  }
  return null;
}
