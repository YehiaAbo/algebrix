// A Σ or ∏ written out as on paper: the first few terms, ⋯, the last one (or ⋯ alone to ∞). The ⋯
// is a real Σ over the terms in the middle (dots: true), so every step here is the plain algebra of
// taking a term out of a Σ or putting it back, and is checked by value like any other. Crossing
// out is general too: in any sum, pieces that add to 0 are struck (in any product, a factor on top
// that equals one underneath), and the ⋯ of a telescoping Σ is struck with the pieces it cancels.
import { Node, Eq, Sum, Env, num, sym, add, neg, mul, frac, lim, sum, findPath, replace, evaluate, symbols, cloneFresh, walk, children, withChildren } from './ast';
import { MoveResult, MoveOk, checked } from './moves';
import { substitute, dependsOn } from './calculus';
import { simplify, newHints } from './simplify';
import { toText } from './print';

const one = () => 1;
const isInf = (n: Node) => n.k === 'sym' && n.name === '∞';
const tidy = (n: Node) => simplify(n, newHints());
const plus = (n: Node, d: number) => tidy(add([cloneFresh(n), num(d)]));

/** a term as you'd write it: the index put in, sums of whole numbers worked out (k + 1 → 3), 1s and
 *  −1s tidied, but the shape kept, so 1/2 − 1/3 is not 1/6 and 1/(2·3) still shows its factors */
export function light(n: Node): Node {
  const kids = children(n).map(light);
  let m = kids.length ? withChildren(n, kids) : n;
  const allNum = (xs: Node[]) => xs.every(x => x.k === 'num');
  if (m.k === 'add' && m.terms.some(t => t.k === 'add')) m = { ...m, terms: m.terms.flatMap(t => (t.k === 'add' ? t.terms : [t])) };
  if (m.k === 'add' && allNum(m.terms)) return num(m.terms.reduce((a, t) => a + (t as { v: number }).v, 0));
  if (m.k === 'add' && m.terms.filter(t => t.k === 'num').length > 1) {
    // n − 1 + 2 is n + 1: the numbers in a sum, added up, at the end
    const c = m.terms.reduce((a, t) => a + (t.k === 'num' ? t.v : 0), 0);
    const rest = m.terms.filter(t => t.k !== 'num');
    const ts = c ? [...rest, num(c)] : rest;
    m = ts.length === 1 ? ts[0] : { ...m, terms: ts };
  }
  if (m.k === 'neg' && m.arg.k === 'num') return num(-m.arg.v);
  if (m.k === 'neg' && m.arg.k === 'neg') return m.arg.arg;
  if (m.k === 'pow' && m.base.k === 'num' && m.base.v === -1 && m.exp.k === 'num' && Number.isInteger(m.exp.v)) return num(m.exp.v % 2 ? -1 : 1);
  if (m.k === 'pow' && m.exp.k === 'num' && m.exp.v === 1) return m.base;
  if (m.k === 'pow' && m.exp.k === 'num' && m.exp.v === 0) return num(1);
  if (m.k === 'frac' && m.den.k === 'num' && m.den.v === 1) return m.num;
  if (m.k === 'mul') {
    const fs = m.factors.filter(f => !(f.k === 'num' && f.v === 1));
    const minus = fs.filter(f => f.k === 'num' && f.v === -1).length;
    const rest = fs.filter(f => !(f.k === 'num' && f.v === -1));
    const body = rest.length === 0 ? num(1) : rest.length === 1 ? rest[0] : { ...m, factors: rest };
    m = minus % 2 ? (body.k === 'num' ? num(-body.v) : neg(body)) : body;
  }
  return m;
}

/** the term of S at index k (a whole number, or a node like n) */
export function termOf(S: Sum, k: number | Node): Node {
  const at = (n: Node) => light(substitute(cloneFresh(n), S.v, typeof k === 'number' ? num(k) : cloneFresh(k)));
  // a factor of a product keeps its top and bottom (2/1 · 3/2 ⋯), so what cancels can be seen
  const t = S.prod && S.arg.k === 'frac' ? frac(at(S.arg.num), at(S.arg.den)) : at(S.arg);
  // each piece that is only numbers is worked out (1/2², not 1/(2^2)); the pieces stay apart
  const done = (n: Node) => (symbols(n).length || hasSum(n) ? n : tidy(n));
  const parts = (n: Node, ...ps: Node[]) => withChildren(n, ps);
  let out: Node;
  if (!S.prod && t.k === 'add') out = parts(t, ...t.terms.map(done));
  else if (S.prod && t.k === 'frac') out = parts(t, factorsDone(t.num, done), factorsDone(t.den, done));
  else if (S.prod && t.k === 'mul') out = parts(t, ...t.factors.map(done));
  else out = done(t);
  return cloneFresh(out);
}
const factorsDone = (n: Node, done: (n: Node) => Node) => (n.k === 'mul' ? withChildren(n, n.factors.map(done)) : done(n));
const hasSum = (n: Node) => { let h = false; walk(n, m => { if (m.k === 'sum') h = true; }); return h; };

const dotsOf = (S: Sum, lo: Node, hi: Node, id?: string): Sum => ({ ...sum(S.v, lo, hi, cloneFresh(S.arg), id, !!S.prod), dots: true });

/** whole number value of a bound, or null */
const whole = (n: Node) => (n.k === 'num' && Number.isInteger(n.v) ? n.v : null);

/** S written out: three terms, ⋯, the last term (to ∞: ⋯ alone). A short finite one is all of it. */
export function writtenOut(S: Sum, head = 3): Node {
  const lo = whole(S.lo), hi = whole(S.hi);
  // a telescoping one shows a whole step's worth at each end, so every cancelling pair is in sight
  const d = telescopeOf(S)?.d ?? 1;
  head = Math.max(head, d + 1);
  const tail = d;
  const join = (ts: Node[]) => (ts.length === 0 ? num(S.prod ? 1 : 0) : ts.length === 1 ? ts[0] : S.prod ? mul(ts) : add(ts));
  if (lo !== null && hi !== null && hi - lo + 1 <= head + tail + 2) {
    const ts: Node[] = [];
    for (let k = lo; k <= hi; k++) ts.push(termOf(S, k));
    return join(ts);
  }
  const first: Node[] = [];
  for (let j = 0; j < head; j++) first.push(termOf(S, plus(S.lo, j)));
  if (isInf(S.hi)) return join([...first, dotsOf(S, plus(S.lo, head), sym('∞'))]);
  const last: Node[] = [];
  for (let j = tail - 1; j >= 0; j--) last.push(termOf(S, plus(S.hi, -j)));
  return join([...first, dotsOf(S, plus(S.lo, head), plus(S.hi, -tail)), ...last]);
}

/** samples where the letters in bounds are whole numbers well past where the terms start */
function envs(...ns: Node[]): Env[] {
  const bounds = new Set<string>(), other = new Set<string>();
  for (const n of ns) walk(n, m => { if (m.k === 'sum') [m.lo, m.hi].forEach(b => symbols(b).forEach(w => bounds.add(w))); });
  for (const n of ns) symbols(n).forEach(w => { if (!bounds.has(w)) other.add(w); });
  return [0, 1, 2].map(i => {
    const env: Env = {};
    bounds.forEach(w => (env[w] = 9 + 3 * i));
    [...other].forEach((w, j) => (env[w] = 0.31 + 0.23 * i + 0.17 * j));
    return env;
  });
}
const close = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * (1 + Math.abs(a) + Math.abs(b));
const same = (a: Node, b: Node, E: Env[]) => E.every(env => close(evaluate(a, env), evaluate(b, env)));

/** a written-out Σ/∏ the aim is on or in: the sum or product holding a ⋯, and the ⋯ */
function written(e: Eq, sel: string | null): { host: Node; D: Sum } | null {
  const path = sel && sel !== 'eq' ? findPath(e, sel) : null;
  const holds = (n: Node): Sum | null => (n.k === 'add' || n.k === 'mul' ? ((n.k === 'add' ? n.terms : n.factors).find(t => t.k === 'sum' && t.dots) as Sum | undefined) ?? null : null);
  if (path) for (const n of [...path].reverse()) { const D = holds(n); if (D) return { host: n, D }; if (n.k === 'sum' && n.dots) { const up = path[path.indexOf(n) - 1]; if (up && holds(up) === n) return { host: up, D: n }; } }
  let out: { host: Node; D: Sum } | null = null;
  walk(e, n => { if (!out) { const D = holds(n); if (D) out = { host: n, D }; } });
  return out;
}
const partsOf = (h: Node) => (h.k === 'add' ? h.terms : h.k === 'mul' ? h.factors : [h]);
const withParts = (h: Node, ps: Node[]): Node => (ps.length === 0 ? num(h.k === 'mul' ? 1 : 0) : ps.length === 1 ? ps[0] : h.k === 'add' ? { ...h, terms: ps } : { ...h, factors: ps } as Node);

/** the terms next to the ⋯ that are its own terms: how many before (k = lo − 1, lo − 2 …) and after */
function run(host: Node, D: Sum): { before: number; after: number; piecesBefore: number; piecesAfter: number } {
  const ps = partsOf(host), at = ps.indexOf(D), E = envs(host);
  // a term may lie spread in the sum (1 − 1/2 is two pieces of it once written): match its pieces
  const width = (t: Node) => (host.k === 'add' && t.k === 'add' ? t.terms.length : host.k === 'mul' && t.k === 'mul' ? t.factors.length : 1);
  const joined = (xs: Node[]) => (xs.length === 1 ? xs[0] : host.k === 'add' ? add(xs) : mul(xs));
  let before = 0, after = 0, pb = 0, pa = 0;
  for (;;) {
    const t = termOf(D, plus(D.lo, -(before + 1))), w = width(t);
    if (at - pb - w < 0) break;
    const got = ps.slice(at - pb - w, at - pb);
    if (same(joined(got), t, E)) { before++; pb += w; } else if (w > 1 && same(ps[at - pb - 1], t, E)) { before++; pb += 1; } else break;
  }
  if (!isInf(D.hi)) for (;;) {
    const t = termOf(D, plus(D.hi, after + 1)), w = width(t);
    if (at + pa + w >= ps.length) break;
    const got = ps.slice(at + pa + 1, at + pa + 1 + w);
    if (same(joined(got), t, E)) { after++; pa += w; } else if (w > 1 && same(ps[at + pa + 1], t, E)) { after++; pa += 1; } else break;
  }
  return { before, after, piecesBefore: pb, piecesAfter: pa };
}
/** how many pieces the term next to the ⋯ takes up on that side */
function edgeWidth(host: Node, D: Sum, end: 'start' | 'end'): number {
  const ps = partsOf(host), at = ps.indexOf(D), E = envs(host);
  const t = termOf(D, end === 'start' ? plus(D.lo, -1) : plus(D.hi, 1));
  const w = host.k === 'add' && t.k === 'add' ? t.terms.length : host.k === 'mul' && t.k === 'mul' ? t.factors.length : 1;
  const got = end === 'start' ? ps.slice(Math.max(0, at - w), at) : ps.slice(at + 1, at + 1 + w);
  return got.length === w && same(got.length === 1 ? got[0] : host.k === 'add' ? add(got) : mul(got), t, E) ? w : 1;
}

const ok = (e: Eq, host: Node, next: Node, label: string, select: string | null = null, extra: Partial<MoveOk> = {}): MoveResult =>
  checked(e, { eq: replace(e, host.id, next), label, hints: newHints(), factor: one, select, rule: label, ...extra });

/** Σ or ∏ written out with ⋯ */
export function writeOutDots(e: Eq, sel: string | null): MoveResult {
  const path = sel && sel !== 'eq' ? findPath(e, sel) : null;
  let S = path ? ([...path].reverse().find(n => n.k === 'sum' && !n.dots) as Sum | undefined) : undefined;
  if (!S) walk(e, n => { if (!S && n.k === 'sum' && !n.dots) S = n; });
  if (!S) return { error: 'No Σ or ∏ here to write out.' };
  const W = writtenOut(S);
  return ok(e, S, W, S.prod ? 'write the product out' : 'write the sum out', W.id);
}

/** one more term out of the ⋯, at its start or its end */
export function moreTerms(e: Eq, sel: string | null, end: 'start' | 'end'): MoveResult {
  const w = written(e, sel);
  if (!w) return { error: 'Write a Σ out first (it shows ⋯).' };
  const { host, D } = w;
  if (end === 'end' && isInf(D.hi)) return { error: 'This one runs to ∞: there is no last term to write.' };
  const ps = partsOf(host), at = ps.indexOf(D);
  const t = termOf(D, end === 'start' ? D.lo : D.hi);
  const lo = end === 'start' ? plus(D.lo, 1) : cloneFresh(D.lo), hi = end === 'end' ? plus(D.hi, -1) : cloneFresh(D.hi);
  const a = whole(lo), b = whole(hi);
  // the ⋯ is used up: what's left is all written
  const gone = a !== null && b !== null && b < a;
  const D2 = dotsOf(D, lo, hi, D.id);
  const mid = gone ? [] : [D2];
  const next = withParts(host, [...ps.slice(0, at), ...(end === 'start' ? [t, ...mid] : [...mid, t]), ...ps.slice(at + 1)]);
  return ok(e, host, next, end === 'start' ? 'one more term at the start' : 'one more term at the end', gone ? next.id : D.id, { conditions: conds(D) });
}

/** a term next to the ⋯ goes back into it */
export function fewerTerms(e: Eq, sel: string | null, end: 'start' | 'end'): MoveResult {
  const w = written(e, sel);
  if (!w) return { error: 'Write a Σ out first (it shows ⋯).' };
  const { host, D } = w;
  const r = run(host, D);
  if ((end === 'start' ? r.before : r.after) === 0) return { error: end === 'start' ? 'No term before the ⋯ to put back.' : 'No term after the ⋯ to put back.' };
  const ps = partsOf(host), at = ps.indexOf(D);
  const D2 = dotsOf(D, end === 'start' ? plus(D.lo, -1) : cloneFresh(D.lo), end === 'end' ? plus(D.hi, 1) : cloneFresh(D.hi), D.id);
  const wd = edgeWidth(host, D, end);
  const next = withParts(host, end === 'start' ? [...ps.slice(0, at - wd), D2, ...ps.slice(at + 1)] : [...ps.slice(0, at), D2, ...ps.slice(at + 1 + wd)]);
  return ok(e, host, next, `a term back into ⋯ at the ${end}`, D.id);
}

/** all the terms next to the ⋯ that belong to it go back in: one Σ again */
export function foldBack(e: Eq, sel: string | null): MoveResult {
  const w = written(e, sel);
  if (!w) return foldTerms(e, sel);
  const { host, D } = w;
  const r = run(host, D);
  const ps = partsOf(host), at = ps.indexOf(D);
  const S: Sum = { ...sum(D.v, plus(D.lo, -r.before), r.after ? plus(D.hi, r.after) : cloneFresh(D.hi), cloneFresh(D.arg), D.id, !!D.prod) };
  const rest = [...ps.slice(0, at - r.piecesBefore), S, ...ps.slice(at + r.piecesAfter + 1)];
  return ok(e, host, withParts(host, rest), D.prod ? 'back into one ∏' : 'back into one Σ', S.id);
}

/** what writing out assumes: the letter in the top bound counts past the terms written */
function conds(D: Sum): string[] {
  return [];
}

/* ---------- crossing out ---------- */

/** f(k) − f(k + d) (or ∏ f(k + d)/f(k)): f, d and which way round, read off the two pieces */
export function telescopeOf(S: Sum): { g: Node; d: number; flip: boolean } | null {
  const E = envs(S).map(env => env);
  const at = (n: Node, k: number) => substitute(cloneFresh(n), S.v, add([sym(S.v), num(k)]));
  const eqv = (x: Node, y: Node) => [2, 3, 5, 7].every(k => E.every(env => close(evaluate(x, { ...env, [S.v]: k }), evaluate(y, { ...env, [S.v]: k }))));
  if (!S.prod && S.arg.k === 'add' && S.arg.terms.length === 2) {
    const [A, B] = S.arg.terms;
    for (let d = 1; d <= 4; d++) {
      if (eqv(neg(cloneFresh(B)), at(A, d))) return { g: A, d, flip: false };
      if (eqv(neg(cloneFresh(A)), at(B, d))) return { g: B, d, flip: false };
    }
  }
  if (S.prod && S.arg.k === 'frac') {
    const { num: N, den: Dn } = S.arg;
    // ∏ g(k + d)/g(k): g is the bottom; ∏ g(k)/g(k + d): g is the top
    for (let d = 1; d <= 4; d++) {
      if (eqv(N, at(Dn, d))) return { g: Dn, d, flip: false };
      if (eqv(Dn, at(N, d))) return { g: N, d, flip: true };
    }
  }
  return null;
}

interface Piece { node: Node; sign: 1 | -1; owner: Node; virtual?: boolean }

/** the pieces of a sum (terms, and the terms inside a bracketed term) or of a product (factors on
 *  top +1, underneath −1), with what the ⋯ of a telescoping Σ leaves at its two ends */
function piecesOf(host: Node, E: Env[]): Piece[] {
  const out: Piece[] = [];
  if (host.k === 'add') {
    for (const t of host.terms) {
      if (t.k === 'sum' && t.dots) {
        const tel = telescopeOf(t);
        if (!tel) continue;
        // Σ_{lo}^{hi} (g(k) − g(k + d)) leaves g(lo … lo + d − 1) and −g(hi + 1 … hi + d)
        const G = (k: Node) => light(substitute(cloneFresh(tel.g), t.v, k));
        for (let j = 0; j < tel.d; j++) out.push({ node: G(plus(t.lo, j)), sign: 1, owner: t, virtual: true });
        if (!isInf(t.hi)) for (let j = 1; j <= tel.d; j++) out.push({ node: G(plus(t.hi, j)), sign: -1, owner: t, virtual: true });
        continue;
      }
      const inner = t.k === 'add' ? t.terms : [t];
      for (const p of inner) out.push({ node: p, sign: 1, owner: p });
    }
  } else if (host.k === 'mul') {
    for (const f of host.factors) {
      if (f.k === 'sum' && f.dots) {
        const tel = telescopeOf(f);
        if (!tel) continue;
        const G = (k: Node) => light(substitute(cloneFresh(tel.g), f.v, k));
        // ∏ g(k + d)/g(k) leaves g(hi + 1 … hi + d) on top, g(lo … lo + d − 1) underneath
        const topSign = tel.flip ? -1 : 1;
        if (!isInf(f.hi)) for (let j = 1; j <= tel.d; j++) out.push({ node: G(plus(f.hi, j)), sign: topSign as 1 | -1, owner: f, virtual: true });
        for (let j = 0; j < tel.d; j++) out.push({ node: G(plus(f.lo, j)), sign: -topSign as 1 | -1, owner: f, virtual: true });
        continue;
      }
      const ups = f.k === 'frac' ? [f.num] : [f], downs = f.k === 'frac' ? [f.den] : [];
      for (const u of ups) for (const x of u.k === 'mul' ? u.factors : [u]) out.push({ node: x, sign: 1, owner: x });
      for (const dn of downs) for (const x of dn.k === 'mul' ? dn.factors : [dn]) out.push({ node: x, sign: -1, owner: x });
    }
  }
  void E;
  return out;
}

/** what is crossed out: the visible nodes, and the ⋯ when every piece it leaves found a partner */
function pairUp(host: Node): { struck: Set<string>; dots: Sum | null; tail: Sum | null } | null {
  const E = envs(host);
  const ps = piecesOf(host, E);
  const used = new Set<number>();
  const val = (p: Piece) => E.map(env => evaluate(p.node, env));
  const vs = ps.map(val);
  // in a sum, two pieces that add to 0; in a product, a factor on top equal to one underneath
  const cancels = (i: number, j: number) => host.k === 'add'
    ? vs[i].every((x, t) => close(ps[i].sign * x, -ps[j].sign * vs[j][t])) && vs[i].some(x => Math.abs(x) > 1e-12)
    : ps[i].sign === -ps[j].sign && vs[i].every((x, t) => close(x, vs[j][t])) && vs[i].every(x => Math.abs(x) > 1e-12);
  for (let i = 0; i < ps.length; i++) {
    if (used.has(i)) continue;
    // the nearest partner: neighbours cancel first, as on paper
    for (let j = i + 1; j < ps.length; j++) {
      if (used.has(j) || ps[j].owner === ps[i].owner) continue;
      if (cancels(i, j)) { used.add(i); used.add(j); break; }
    }
  }
  const struck = new Set<string>();
  // the ⋯ goes only if everything it leaves was paired; then its partners go with it
  const D = partsOf(host).find(t => t.k === 'sum' && t.dots) as Sum | undefined;
  const mine = ps.map((p, i) => i).filter(i => ps[i].virtual);
  const dotsGone = !!D && mine.length > 0 && mine.every(i => used.has(i));
  ps.forEach((p, i) => { if (used.has(i) && !p.virtual) struck.add(p.owner.id); });
  if (D && !dotsGone) {
    // partners of the ⋯'s pieces stay: un-strike them
    for (const i of mine) if (used.has(i)) {
      const j = ps.findIndex((q, t) => t !== i && used.has(t) && !q.virtual && cancels(i, t) && struck.has(q.owner.id));
      if (j >= 0) struck.delete(ps[j].owner.id);
    }
  }
  if (!struck.size && !dotsGone) return null;
  return { struck, dots: dotsGone ? D! : null, tail: dotsGone && isInf(D!.hi) ? D! : null };
}

const mark = (n: Node, ids: Set<string>): Node => {
  const kids = children(n).map(c => mark(c, ids));
  const m = kids.length ? withChildren(n, kids) : n;
  return ids.has(n.id) ? { ...m, struck: true } : m;
};

/** strike what cancels, in the aimed sum or product (or the one holding the ⋯) */
export function crossOut(e: Eq, sel: string | null): MoveResult {
  const w = written(e, sel);
  const path = sel && sel !== 'eq' ? findPath(e, sel) : null;
  const host = w?.host ?? (path ? [...path].reverse().find(n => n.k === 'add' || n.k === 'mul') : null) ?? (() => { let h: Node | null = null; walk(e, n => { if (!h && (n.k === 'add' || n.k === 'mul')) h = n; }); return h; })();
  if (!host) return { error: 'Aim at a sum or product to cross out what cancels.' };
  if (w && !telescopeOf(w.D)) return { error: `The terms of ${toText({ ...w.D, dots: false })} don't cancel in pairs as they stand. Split its term first (partial fractions, Tab), then write it out.` };
  const p = pairUp(host);
  if (!p) return { error: host.k === 'mul' ? 'Nothing on top matches anything underneath.' : 'No two pieces here add to 0.' };
  const ids = new Set(p.struck);
  if (p.dots) ids.add(p.dots.id);
  return { eq: replace(e, host.id, mark(host, ids)) as Eq, label: 'cross out what cancels', hints: newHints(), factor: one, select: host.id, rule: 'cross out what cancels' };
}

/** the struck pieces go (an auto step after crossing out); an infinite ⋯ leaves its limit */
export function dropStruck(e: Eq): MoveResult | null {
  let host: Node | null = null;
  walk(e, n => { if (!host && (n.k === 'add' || n.k === 'mul') && partsOf(n).some(t => t.struck || children(t).some(c => c.struck))) host = n; });
  if (!host) return null;
  const H = host as Node;
  const extra: Node[] = [];
  const keep = (n: Node): Node | null => {
    if (n.struck) {
      if (n.k === 'sum' && n.dots && isInf(n.hi)) {
        const tel = telescopeOf(n);
        if (tel) {
          const L = lim(n.v, sym('∞'), cloneFresh(tel.g));
          const Ln = tel.d === 1 ? L : mul([num(tel.d), L]);
          if (H.k === 'add') extra.push(neg(Ln));
          else extra.push(tel.flip ? Ln : frac(num(1), Ln));
        }
      }
      return null;
    }
    if (n.k === 'add') { const ts = n.terms.map(keep).filter(Boolean) as Node[]; return ts.length === 0 ? null : ts.length === 1 ? ts[0] : { ...n, terms: ts }; }
    if (n.k === 'mul') { const fs = n.factors.map(keep).filter(Boolean) as Node[]; return fs.length === 0 ? (H.k === 'mul' ? num(1) : null) : fs.length === 1 ? fs[0] : { ...n, factors: fs }; }
    if (n.k === 'frac') { const t = keep(n.num) ?? num(1), b = keep(n.den); return b ? { ...n, num: t, den: b } : t; }
    if (n.k === 'neg') { const a = keep(n.arg); return a ? { ...n, arg: a } : null; }
    return n;
  };
  const kept = keep(H);
  const parts = [...(kept ? (kept.k === H.k ? partsOf(kept) : [kept]) : []), ...extra];
  let next = withParts(H, parts.length ? parts : [num(H.k === 'mul' ? 1 : 0)]);
  // what's left of a product, as one fraction: the tops over the bottoms, 1s gone
  if (H.k === 'mul') {
    const tops: Node[] = [], bots: Node[] = [];
    for (const f of partsOf(next)) {
      if (f.k === 'frac') { tops.push(...(f.num.k === 'mul' ? f.num.factors : [f.num])); bots.push(...(f.den.k === 'mul' ? f.den.factors : [f.den])); }
      else tops.push(f);
    }
    const t = tops.filter(x => !(x.k === 'num' && x.v === 1)), b = bots.filter(x => !(x.k === 'num' && x.v === 1));
    const T = t.length === 0 ? num(1) : t.length === 1 ? t[0] : mul(t), B = b.length === 0 ? null : b.length === 1 ? b[0] : mul(b);
    next = B ? frac(T, B) : T;
  }
  return checked(e, { eq: replace(e, H.id, next), label: 'what was crossed out cancels', hints: newHints(), factor: one, select: next.id, rule: 'cancel', auto: true });
}

/* ---------- a pattern in written terms: back to Σ ---------- */

/** the general term of t₁, t₂, t₃ …: the trees are the same apart from numbers, and each number that
 *  changes changes the same amount every time (or is a fixed power apart: 2, 4, 8). k counts from 1. */
export function patternOf(ts: Node[], v: string, last?: Node): Node | null {
  if (ts.length < (last ? 2 : 3)) return null;
  return shapePattern(ts, v) ?? numberPattern(ts, v);
}

/** only numbers: the tops and the bottoms in lowest terms, each with a pattern of its own */
function numberPattern(ts: Node[], v: string): Node | null {
  if (ts.every(t => !symbols(t).length)) {
    const qs = ts.map(t => ratio(evaluate(t, {})));
    if (qs.every(Boolean)) {
      const K = sym(v);
      const sg = qs.map(q => Math.sign(q![0]));
      const alt = sg.every((x, i) => i === 0 || x === -sg[i - 1]);
      const top = fit(qs.map(q => (alt ? Math.abs(q![0]) : q![0])), K), bot = fit(qs.map(q => q![1]), K);
      if (top && bot) {
        const body = bot.k === 'num' && bot.v === 1 ? top : frac(top, bot);
        const signed = alt ? mul([{ k: 'pow', id: '', base: num(-1), exp: sg[0] === 1 ? add([sym(v), num(1)]) : sym(v) } as Node, body]) : body;
        return tidy(signed);
      }
    }
  }
  return null;
}

/** the shape: the tree with its numbers taken out */
const shape = (n: Node): string => n.k === 'num' ? '#' : n.k === 'neg' && n.arg.k === 'num' ? '#' : `${n.k}${'name' in n ? (n as { name: string }).name : ''}(${children(n).map(shape).join(',')})`;

function shapePattern(ts: Node[], v: string): Node | null {
  // x is x¹, x/1 …: a term that is short of the last one's shape is read in it
  const target = shape(ts[ts.length - 1]);
  const lifts = (t: Node): Node[] => [t, { k: 'pow', id: '', base: t, exp: num(1) } as Node, frac(t, num(1)), frac({ k: 'pow', id: '', base: t, exp: num(1) } as Node, num(1)), mul([num(1), t])];
  ts = ts.map(t => lifts(t).find(l => shape(l) === target) ?? t).map(t => (shape(t) === target ? t : liftTo(t, ts[ts.length - 1])));
  const sh = ts.map(shape);
  if (sh.some(s => s !== sh[0])) return alternating(ts, v);
  const nums = (n: Node, out: number[] = []): number[] => { if (n.k === 'num') out.push(n.v); else if (n.k === 'neg' && n.arg.k === 'num') out.push(-n.arg.v); else children(n).forEach(c => nums(c, out)); return out; };
  const cols = ts.map(t => nums(t));
  const K = sym(v);
  const exprs: Node[] = [];
  for (let c = 0; c < cols[0].length; c++) {
    const xs = cols.map(r => r[c]);
    const f = fit(xs, K);
    if (!f) return alternating(ts, v);
    exprs.push(f);
  }
  let i = 0;
  const build = (n: Node): Node => (n.k === 'num' || (n.k === 'neg' && n.arg.k === 'num') ? cloneFresh(exprs[i++]) : withChildren(n, children(n).map(build)));
  return tidy(build(cloneFresh(ts[0])));
}

/** a number as top/bottom in lowest terms (bottom up to 10⁶), or null */
function ratio(x: number): [number, number] | null {
  if (!Number.isFinite(x)) return null;
  for (let q = 1; q <= 1e6; q++) { const p = Math.round(x * q); if (Math.abs(p / q - x) < 1e-12 * (1 + Math.abs(x))) return [p, q]; }
  return null;
}

/** a k-th number: constant, a + b(k − 1), a·rᵏ⁻¹, or a square/cube of a line */
function fit(xs: number[], K: Node): Node | null {
  const n = xs.length;
  if (xs.every(x => x === xs[0])) return num(xs[0]);
  const d = xs[1] - xs[0];
  if (xs.every((x, i) => i === 0 || Math.abs(x - xs[i - 1] - d) < 1e-9)) return tidy(add([mul([num(d), cloneFresh(K)]), num(xs[0] - d)]));
  if (xs[0] !== 0) {
    const r = xs[1] / xs[0];
    if (Number.isInteger(r) && Math.abs(r) > 1 && xs.every((x, i) => i === 0 || Math.abs(x - xs[i - 1] * r) < 1e-9)) {
      const c = xs[0] / r;
      return tidy(c === 1 ? { k: 'pow', id: '', base: num(r), exp: cloneFresh(K) } as Node : mul([num(c), { k: 'pow', id: '', base: num(r), exp: cloneFresh(K) } as Node]));
    }
  }
  for (const p of [2, 3]) {
    const roots = xs.map(x => Math.round(Math.sign(x) * Math.abs(x) ** (1 / p)));
    if (n >= 2 && roots.some((r, i) => r !== xs[i]) && roots.every((r, i) => r ** p === xs[i])) {
      const inner = fit(roots, K);
      if (inner && inner.k !== 'num') return tidy({ k: 'pow', id: '', base: inner, exp: num(p) } as Node);
    }
  }
  return null;
}

/** +, −, +, −: the pattern of the sizes, times (−1)^(k + 1) */
function alternating(ts: Node[], v: string): Node | null {
  const sign = (n: Node) => (n.k === 'neg' || (n.k === 'num' && n.v < 0) ? -1 : 1);
  const s = ts.map(sign);
  if (!s.every((x, i) => i === 0 || x === -s[i - 1])) return null;
  const abs = ts.map(t => (t.k === 'neg' ? t.arg : t.k === 'num' ? num(Math.abs(t.v)) : t));
  if (abs.some(a => a.k === 'neg')) return null;
  const p = patternOf(abs, v);
  if (!p) return null;
  const e = s[0] === 1 ? add([sym(v), num(1)]) : sym(v);
  return tidy(mul([{ k: 'pow', id: '', base: num(-1), exp: e } as Node, p]));
}

/** typed terms with a pattern (1 + 1/4 + 1/9 + …): one Σ again */
export function foldTerms(e: Eq, sel: string | null): MoveResult {
  const path = sel && sel !== 'eq' ? findPath(e, sel) : null;
  const host = (path ? [...path].reverse().find(n => n.k === 'add' || n.k === 'mul') : null) ?? null;
  if (!host) return { error: 'Aim at written-out terms (a sum or a product) to fold them into Σ.' };
  const ts = partsOf(host);
  const v = ['k', 'n', 'j', 'i'].find(c => !symbols(host).includes(c))!;
  const g = patternOf(ts, v);
  if (!g) return { error: 'No pattern found in these terms (each must be the same shape, its numbers stepping evenly).' };
  const S = sum(v, num(1), num(ts.length), g, undefined, host.k === 'mul');
  return ok(e, host, S, host.k === 'mul' ? 'fold into ∏' : 'fold into Σ', S.id);
}

/** the term number of t in the pattern g (counting from k = 1), if one whole number fits */
export function indexOf(g: Node, v: string, t: Node, upTo = 100000): Node | null {
  const E = envs(t, g);
  // a letter in the last term (… + 1/n²) names the top bound: match k against it
  const letters = symbols(t).filter(w => !symbols(g).includes(w) || w === v);
  for (const w of letters) {
    for (const off of [0, 1, -1, 2, -2]) {
      const k = tidy(add([sym(w), num(off)]));
      if (same(substitute(cloneFresh(g), v, k), t, E)) return k;
    }
  }
  const x = evaluate(t, E[0]);
  for (let k = 1; k <= upTo; k++) if (close(evaluate(g, { ...E[0], [v]: k }), x) && same(substitute(cloneFresh(g), v, num(k)), t, E)) return num(k);
  return null;
}

export { dependsOn };

/** the Tab forms of a written-out Σ/∏ (or a Σ to write out, or terms to fold) */
export function seriesForms(e: Eq, sel: string | null): MoveOk[] {
  const out: MoveOk[] = [];
  const take = (r: MoveResult) => { if (!('error' in r)) out.push(r); };
  if (written(e, sel)) {
    take(moreTerms(e, sel, 'start'));
    take(moreTerms(e, sel, 'end'));
    take(fewerTerms(e, sel, 'start'));
    take(fewerTerms(e, sel, 'end'));
    take(foldBack(e, sel));
    return out;
  }
  const path = sel && sel !== 'eq' ? findPath(e, sel) : null;
  if (path?.some(n => n.k === 'sum' && !n.dots)) take(writeOutDots(e, sel));
  else if (path && [...path].reverse().find(n => n.k === 'add' || n.k === 'mul')) take(foldTerms(e, sel));
  return out;
}

/** typed with ⋯ (1 + 1/4 + 1/9 + ⋯, 1 + 2 + ⋯ + n): the terms before it set the pattern (k from 1);
 *  a term after it is the last one (its k is the top bound), none means on to ∞. A term may be
 *  several pieces ((1 − 1/2) + (1/2 − 1/3) + ⋯ reads as pieces): two or three to a term are tried. */
export function fromDots(h: Node): Node | { error: string } {
  const ps = partsOf(h);
  const at = ps.findIndex(t => t.k === 'sym' && t.name === '⋯');
  if (ps.filter(t => t.k === 'sym' && t.name === '⋯').length > 1) return { error: 'One ⋯ in a sum, please.' };
  const before = ps.slice(0, at), after = ps.slice(at + 1);
  if (before.length < 2) return { error: 'Write at least two terms before ⋯, so the pattern shows (1 + 1/2 + 1/3 + ⋯).' };
  const v = ['k', 'n', 'j', 'i', 'm'].find(c => !symbols(h).includes(c))!;
  const prod = h.k === 'mul';
  const chunk = (xs: Node[]) => (xs.length === 1 ? xs[0] : prod ? mul(xs) : add(xs));
  let why = '';
  for (const w of [1, 2, 3]) {
    if (before.length % w || (after.length && after.length !== w) || before.length / w < (after.length ? 2 : 3)) continue;
    const bs: Node[] = [];
    for (let i = 0; i < before.length; i += w) bs.push(chunk(before.slice(i, i + w)));
    const last = after.length ? chunk(after) : null;
    // the last term shows the shape (4 and 9 next to 100² are 2² and 3²): read the first ones in it too
    const cands = (last ? [patternOf(bs.map(t => liftTo(t, last)), v, last), patternOf(bs, v, last)] : [patternOf(bs, v)]).filter(Boolean) as Node[];
    const g = last ? cands.find(c => indexOf(c, v, last)) : cands[0];
    if (!g) { if (last && cands.length) why = `${toText(last)} isn't a term of the pattern ${toText(cands[0])} (k = 1, 2, 3 …).`; continue; }
    const m = bs.length;
    if (!last) return withParts(h, [...before, { ...sum(v, num(m + 1), sym('∞'), g, undefined, prod), dots: true }]);
    const N = indexOf(g, v, last)!;
    return withParts(h, [...before, { ...sum(v, num(m + 1), plus(N, -1), g, undefined, prod), dots: true }, ...after]);
  }
  if (after.length > 3) return { error: 'After ⋯, write just the last term (1 + 2 + ⋯ + n).' };
  return { error: why || `No pattern I can read in ${before.map(t => toText(t)).join(prod ? ' · ' : ' + ')} …: write three terms, or a Σ.` };
}

/** t written in the shape of L where it can be: a number where L has a power is that power of its root */
function liftTo(t: Node, L: Node): Node {
  if (L.k === 'pow' && L.exp.k === 'num' && Number.isInteger(L.exp.v) && L.exp.v > 1 && t.k === 'num' && t.v > 0) {
    const r = Math.round(t.v ** (1 / L.exp.v));
    if (r ** L.exp.v === t.v) return { k: 'pow', id: t.id, base: num(r), exp: num(L.exp.v) } as Node;
  }
  if (t.k !== L.k) {
    // 1 where the shape has a fraction is 1/1; x where it has a power is x¹
    const up = L.k === 'frac' ? frac(t, num(1)) : L.k === 'pow' && L.exp.k === 'num' ? ({ k: 'pow', id: t.id, base: t, exp: num(1) } as Node) : null;
    return up ? liftTo(up, L) : t;
  }
  const a = children(t), b = children(L);
  return a.length && a.length === b.length ? withChildren(t, a.map((c, i) => liftTo(c, b[i]))) : t;
}

/** a written-out sum or product as you'd type it again: the pieces of each written term put back
 *  together as that term (so it reads back with the same pattern), the ⋯ in its place */
export function writtenParts(host: Node): { parts: Node[]; grouped: Set<Node> } | null {
  const D = partsOf(host).find(t => t.k === 'sum' && t.dots) as Sum | undefined;
  if (!D) return null;
  const r = run(host, D);
  const ps = partsOf(host), at = ps.indexOf(D);
  const grouped = new Set<Node>();
  const term = (k: Node) => { const t = termOf(D, k); if ((host.k === 'add' && t.k === 'add') || (host.k === 'mul' && t.k === 'mul')) grouped.add(t); return t; };
  const before: Node[] = [], after: Node[] = [];
  for (let j = r.before; j >= 1; j--) before.push(term(plus(D.lo, -j)));
  for (let j = 1; j <= r.after; j++) after.push(term(plus(D.hi, j)));
  return { parts: [...ps.slice(0, at - r.piecesBefore), ...before, D, ...after, ...ps.slice(at + r.piecesAfter + 1)], grouped };
}
