// Local simplification: arithmetic, like terms, cancellation. Each rule keeps the
// ids of what survives and reports what got absorbed into what, so the renderer
// can fly the absorbed pieces into their target instead of just deleting them.
import { Node, children, withChildren, num, mul, frac, pow, key } from './ast';
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
    case 'frac': return fracRule(n.num, n.den, n.id, h);
    case 'pow': {
      const { base, exp } = n;
      if (exp.k === 'num' && exp.v === 1) return base;
      if (exp.k === 'num' && exp.v === 0) return num(1, exp.id);
      if (base.k === 'num' && exp.k === 'num' && Number.isInteger(exp.v) && exp.v > 0 && exp.v <= 12) {
        const v = base.v ** exp.v;
        if (safe(v)) { h.absorbs.set(exp.id, base.id); return num(v, base.id); }
      }
      if (base.k === 'pow' && base.exp.k === 'num' && exp.k === 'num') {
        h.absorbs.set(exp.id, base.exp.id);
        return pow(base.base, num(base.exp.v * exp.v, base.exp.id), n.id);
      }
      return null;
    }
    case 'sqrt': {
      const a = n.arg;
      if (a.k === 'num' && a.v >= 0 && Number.isInteger(Math.sqrt(a.v))) return num(Math.sqrt(a.v), a.id);
      return null;
    }
    default: return null;
  }
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
  const fi = fs.findIndex(f => f.k === 'frac');
  if (fi >= 0) {
    const F = fs[fi] as Extract<Node, { k: 'frac' }>;
    const others = fs.filter((_, i) => i !== fi);
    return frac(mul([...others, F.num], id), F.den, F.id);
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
      : first.k === 'pow' ? pow(first.base, num(total, (first.exp as Node).id), first.id)
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
  if (cancelled) return frac(mulOf(nf, a.k === 'mul' ? a.id : undefined), mulOf(df, d.k === 'mul' ? d.id : undefined), id);
  return null;
}
