// Calculus 2 steps: antiderivatives a rule at a time, u-substitution, integration by parts,
// the bounds of a definite integral, and series (geometric sums, Taylor polynomials, the ratio
// test). Checked like everything else: a definite integral by its value, an indefinite one by
// its slope (calculus.ts and verify in moves.ts).
import { Node, Eq, Int, At, Sum, num, sym, add, mul, neg, frac, pow, fn, call, int, at, lim, eq, findPath, replace, walk, cloneFresh, evaluate, symbols, key, Env, children, withChildren, sqrt as sqrtN, linkedTo, LETS } from './ast';
import { toText } from './print';
import { dependsOn, derivative, substitute } from './calculus';
import { checked, MoveOk, MoveResult, isErr, indefiniteVars } from './moves';
import { newHints, simplify } from './simplify';
import { times, plus, prettyDerivative } from './calcmoves';
import { partialFractions, longDivide } from './polytools';

const one = () => 1;
/** a letter raised, for labels: eˣ, eʸ, eᵗ */
const SUP: Record<string, string> = { x: 'ˣ', y: 'ʸ', t: 'ᵗ', u: 'ᵘ', s: 'ˢ', w: 'ʷ', z: 'ᶻ' };
const fresh = cloneFresh;
const isNum = (n: Node, v?: number) => n.k === 'num' && (v === undefined || n.v === v);
const tidy = (n: Node) => simplify(n, newHints());

/** a number as an exact node when it is a simple fraction: 0.75 → 3/4 */
export function ratNode(x: number): Node | null {
  if (!Number.isFinite(x)) return null;
  if (Number.isInteger(x)) return num(x);
  for (let q = 2; q <= 5040; q++) {
    const p = Math.round(x * q);
    if (Math.abs(p / q - x) < 1e-11 * (1 + Math.abs(x))) return p < 0 ? neg(frac(num(-p), num(q))) : frac(num(p), num(q));
  }
  return null;
}

const powOf = (b: Node, e: Node): Node => (isNum(e, 1) ? b : isNum(e, 0) ? num(1) : e.k === 'frac' && isNum(e.num, 1) && isNum(e.den, 2) ? sqrtN(b) : pow(b, e));

/** u = a·v + b with a a plain number: a, else null */
function slope(u: Node, v: string): number | null {
  if (!dependsOn(u, v)) return null;
  const d = derivative(u, v);
  if (!d || dependsOn(d, v) || symbols(d).length) return null;
  const a = evaluate(d, {});
  return Number.isFinite(a) && a !== 0 ? a : null;
}

/** F/a for the reverse chain rule on a linear inside */
// F/a, written the way you would: −e^(−2x)/2, not e^(−2x)/(−2); 3^(2x)/(2 ln 3), not a fraction over 2
const over = (F: Node, a: number): Node => (a === 1 ? F : a < 0 ? times(num(-1), over(F, -a)) : Number.isInteger(1 / a) ? times(num(1 / a), F)
  : F.k === 'frac' && Number.isInteger(a) ? frac(F.num, times(num(a), F.den)) : frac(F, ratNode(a) ?? num(a)));

const exponent = (n: Node): number | null => {
  const x = n.k === 'num' ? n.v : n.k === 'frac' && n.num.k === 'num' && n.den.k === 'num' ? n.num.v / n.den.v : n.k === 'neg' && n.arg.k === 'num' ? -n.arg.v : null;
  return x;
};

/** k ± m x² (s = +1 or −1 for the sign of x²), in any order: k and m when it is, else null */
function quadK(n: Node, v: string, s: 1 | -1): { k: number; m: number } | null {
  const at = (x: number) => evaluate(n, { [v]: x });
  const k = at(0), m = s * (at(1) - k);
  if (!(k > 0) || !(m > 0) || !Number.isFinite(k) || !Number.isFinite(m)) return null;
  for (const x of [0.5, 1.3, -2.1]) if (Math.abs(at(x) - (k + s * m * x * x)) > 1e-9 * (1 + Math.abs(k))) return null;
  return { k, m };
}
/** √q as an exact node: 2, 1/2, √3, √2/2 */
const rootOf = (q: number): Node => tidy(sqrtN(ratNode(q) ?? num(q)));
/** ∫ 1/(k + m x²) = tan⁻¹(x√(m/k))/√(km), ∫ 1/√(k − m x²) = sin⁻¹(x√(m/k))/√m */
function arcRule(kind: 'atan' | 'asin', k: number, m: number, V: () => Node, v: string): { F: Node; label: string } {
  const inner = m === k ? V() : times(rootOf(m / k), V());
  const outer = kind === 'atan' ? k * m : m;
  const F = outer === 1 ? fn(kind, inner) : frac(fn(kind, inner), rootOf(outer));
  const shown = (c: number) => (Number.isInteger(c) ? String(c) : toText(ratNode(c) ?? num(c)));
  return { F: tidy(F), label: kind === 'atan' ? `∫ 1/(${shown(k)} + ${m === 1 ? '' : shown(m)}${v}²) = tan⁻¹` : `∫ 1/√(${shown(k)} − ${m === 1 ? '' : shown(m)}${v}²) = sin⁻¹` };
}

/** the antiderivatives you'd just write down: xⁿ, 1/x, eˣ, sin, cos, sec², 1/(1+x²)…, with a
 *  linear inside (reverse chain), constant multiples and sums of them */
export function quick(u: Node, v: string): { F: Node; label: string; conditions?: string[] } | null {
  const V = () => sym(v);
  // what was differentiated comes back (the fundamental theorem): ∫ y′ dx = y, ∫ I′(t) dt = I(t), ∫ (uv)′ dx = uv
  if (u.k === 'sym' && /^[a-zA-Zα-ω]′$/.test(u.name) && u.name[0] !== v) return { F: sym(u.name.slice(0, -1)), label: 'fundamental theorem' };
  if (!dependsOn(u, v)) return { F: isNum(u, 1) ? V() : times(fresh(u), V()), label: 'constant rule' };
  if (u.k === 'sym' && u.name === v) return { F: frac(pow(V(), num(2)), num(2)), label: 'power rule' };
  if (u.k === 'call' && u.name.endsWith('′') && u.arg.k === 'sym' && u.arg.name === v) return { F: call(u.name.slice(0, -1), V()), label: 'fundamental theorem' };
  if (u.k === 'deriv' && u.v === v && !u.partial) return { F: fresh(u.arg), label: 'fundamental theorem' };
  if (u.k === 'neg') { const q = quick(u.arg, v); return q && { F: times(num(-1), q.F), label: q.label }; }
  if (u.k === 'mul') {
    const consts = u.factors.filter(f => !dependsOn(f, v)), vars = u.factors.filter(f => dependsOn(f, v));
    if (vars.length !== 1) return null;
    const q = quick(vars[0], v);
    return q && { F: times(...consts.map(fresh), q.F), label: q.label };
  }
  if (u.k === 'add') {
    const qs = u.terms.map(t => quick(t, v));
    return qs.every(Boolean) ? { F: plus(...qs.map(q => q!.F)), label: 'sum rule' } : null;
  }
  // powers of a linear inside: Lⁿ → Lⁿ⁺¹/((n+1)a), and 1/L → ln|L|/a
  const powerOf = (base: Node, n: number) => {
    const a = slope(base, v);
    if (a === null) return null;
    if (n === -1) { const u = base.k === 'sym' ? base.name : 'u'; return { F: over(fn('ln', fn('abs', fresh(base))), a), label: `∫ 1/${u} = ln|${u}|` }; }
    // a negative whole power comes out as a fraction, the way you'd write it: ∫ y^(−2) = −1/y
    if (Number.isInteger(n) && n < -1) { const m = -(n + 1); return { F: over(times(num(-1), frac(num(1), m === 1 ? fresh(base) : times(num(m), pow(fresh(base), num(m))))), a), label: 'power rule' }; }
    const k = ratNode(n + 1)!;
    return { F: over(times(ratNode(1 / (n + 1)) ?? frac(num(1), k), powOf(fresh(base), k)), a), label: 'power rule' };
  };
  // sin² and cos² by the half-angle identities: sin² L = (1 − cos 2L)/2
  if (u.k === 'pow' && isNum(u.exp, 2) && u.base.k === 'fn' && (u.base.name === 'sin' || u.base.name === 'cos')) {
    const L = u.base.arg, a = slope(L, v);
    if (a === null) return null;
    const half = frac(fresh(L), num(2));
    const wave = over(frac(fn('sin', times(num(2), fresh(L))), num(4)), a);
    return { F: u.base.name === 'sin' ? plus(over(half, a), times(num(-1), wave)) : plus(over(half, a), wave), label: `half-angle: ${u.base.name}² = (1 ${u.base.name === 'sin' ? '−' : '+'} cos 2θ)/2` };
  }
  if (u.k === 'pow' && !dependsOn(u.exp, v)) {
    const n = exponent(u.exp);
    if (n !== null) return powerOf(u.base, n);
    // a letter for the power: ∫ xᵗ dx = xᵗ⁺¹/(t + 1), for t ≠ −1
    const a = slope(u.base, v);
    if (a === null) return null;
    const k = tidy(add([fresh(u.exp), num(1)]));
    return { F: over(frac(pow(fresh(u.base), k), fresh(k)), a), label: 'power rule', conditions: [`${toText(k)} ≠ 0`] };
  }
  if (u.k === 'sqrt') return powerOf(u.arg, 0.5);
  if (u.k === 'frac' && !dependsOn(u.num, v)) {
    // a constant below comes out first: 1/(2u) is ½ · 1/u, so ½ ln|u| and not ln|2u|/2
    if (u.den.k === 'mul') {
      const cs = u.den.factors.filter(f => !dependsOn(f, v)), vs = u.den.factors.filter(f => dependsOn(f, v));
      if (cs.length && vs.length) {
        const q = quick(frac(fresh(u.num), vs.length === 1 ? fresh(vs[0]) : mul(vs.map(fresh))), v);
        return q && { F: frac(q.F, cs.length === 1 ? fresh(cs[0]) : mul(cs.map(fresh))), label: q.label };
      }
    }
    const c = isNum(u.num, 1) ? [] : [fresh(u.num)];
    const d = u.den;
    let q: { F: Node; label: string } | null = null;
    if (d.k === 'pow' && d.base.k === 'fn' && d.base.name === 'cos' && isNum(d.exp, 2)) { const a = slope(d.base.arg, v); if (a !== null) q = { F: over(fn('tan', fresh(d.base.arg)), a), label: '∫ sec² = tan' }; }
    else if (d.k === 'pow' && !dependsOn(d.exp, v)) { const n = exponent(d.exp); if (n !== null) q = powerOf(d.base, -n); }
    // k − x² under a root, k + x² below, in any order: sin⁻¹ and tan⁻¹ (scaled when k isn't 1)
    else if (d.k === 'sqrt' && quadK(d.arg, v, -1)) { const { k, m } = quadK(d.arg, v, -1)!; q = arcRule('asin', k, m, V, v); }
    else if (d.k === 'sqrt') q = powerOf(d.arg, -0.5);
    else if (quadK(d, v, 1)) { const { k, m } = quadK(d, v, 1)!; q = arcRule('atan', k, m, V, v); }
    else q = powerOf(d, -1);
    return q && { F: times(...c, q.F), label: q.label };
  }
  if (u.k === 'pow' && !dependsOn(u.base, v)) {
    const a = slope(u.exp, v);
    if (a === null) return null;
    const isE = u.base.k === 'sym' && u.base.name === 'e';
    return { F: over(isE ? fresh(u) : frac(fresh(u), fn('ln', fresh(u.base))), a), label: isE ? `∫ e${SUP[v] ?? '^' + v} = e${SUP[v] ?? '^' + v}` : `∫ a${SUP[v] ?? '^' + v} = a${SUP[v] ?? '^' + v}/ln a` };
  }
  if (u.k === 'fn' && (u.name === 'sin' || u.name === 'cos')) {
    const a = slope(u.arg, v);
    if (a === null) return null;
    return u.name === 'sin' ? { F: over(times(num(-1), fn('cos', fresh(u.arg))), a), label: '∫ sin = −cos' } : { F: over(fn('sin', fresh(u.arg)), a), label: '∫ cos = sin' };
  }
  // tan = sin/cos, and the top is minus the bottom's slope
  if (u.k === 'fn' && u.name === 'tan') {
    const a = slope(u.arg, v);
    if (a === null) return null;
    return { F: over(times(num(-1), fn('ln', fn('abs', fn('cos', fresh(u.arg))))), a), label: '∫ tan = −ln|cos|' };
  }
  return null;
}

/* ---------- picking the integral to work on ---------- */

const CALC_KINDS = ['deriv', 'lim', 'int', 'at', 'sum'];
const holdsCalc = (n: Node) => { let f = false; walk(n, m => { if (m !== n && CALC_KINDS.includes(m.k)) f = true; }); return f; };

function target<K extends 'int' | 'at' | 'sum'>(e: Eq, sel: string | null, k: K): Extract<Node, { k: K }> | null {
  const path = sel && sel !== 'eq' ? findPath(e, sel) : null;
  let t = path ? [...path].reverse().find(n => n.k === k) : undefined;
  if (!t) walk(e, n => { if (!t && n.k === k && !holdsCalc(n)) t = n; });
  if (!t) walk(e, n => { if (!t && n.k === k) t = n; });
  return (t as Extract<Node, { k: K }>) ?? null;
}

/** a fraction of polynomials made integrable: partial fractions, or long division first */
function rational(u: Node): { p: Node; label: string } | null {
  const pf = partialFractions(u);
  if (pf && key(pf) !== key(u)) return { p: pf, label: 'partial fractions' };
  const ld = longDivide(u);
  return ld && key(ld) !== key(u) ? { p: ld, label: 'long division' } : null;
}

/** C + i: one integration rule on one integral */
export function intStep(e: Eq, sel: string | null): MoveResult {
  const T = target(e, sel, 'int');
  if (!T) return { error: 'No integral here.' };
  const ftc = !T.lo && T.arg.k === 'deriv' && T.arg.v === T.v && !T.arg.partial;
  if (holdsCalc(T) && !ftc) return { error: 'Work out what is inside the integral first.' };
  if (!(T.lo && T.hi) && findPath(e, T.id)?.some(n => n !== T && n.k === 'int' && n.lo && n.hi)) return { error: 'The inside integral has no bounds, so its + C would end up inside the outer one. Give it bounds too.' };
  const v = T.v, def = !!(T.lo && T.hi);
  // a named letter tied to v (u = x² inside ∫ … dx) isn't a constant: finish the substitution first
  const tied = linkedTo(v).filter(w => symbols(T.arg).includes(w));
  if (tied.length) return { error: `${tied[0]} changes with ${v} (${letDef(tied[0], v)}), so it isn't a constant here. Sub in d${v} too, so the integral is all in one letter.` };
  const wrap = (F: Node): Node => (def ? at(v, F, fresh(T.lo!), fresh(T.hi!)) : F);
  const piece = (w: Node): Node => { const q = quick(w, v); return q ? wrap(q.F) : int(v, fresh(w), T.lo && fresh(T.lo), T.hi && fresh(T.hi)); };
  const u = T.arg;
  let next: Node, label: string;
  const q = quick(u, v);
  if (q) { next = wrap(q.F); label = q.label; if (q.conditions) return finish(e, T, next, label, { conditions: q.conditions }); }
  else if (u.k === 'add') { next = plus(...u.terms.map(piece)); label = 'sum rule'; }
  else if (u.k === 'neg') { next = times(num(-1), piece(u.arg)); label = 'constant multiple'; }
  else if (u.k === 'mul' && u.factors.some(f => !dependsOn(f, v))) {
    const consts = u.factors.filter(f => !dependsOn(f, v)), vars = u.factors.filter(f => dependsOn(f, v));
    next = times(...consts.map(fresh), piece(vars.length === 1 ? vars[0] : mul(vars)));
    label = 'constant multiple';
  } else if (u.k === 'frac' && !dependsOn(u.den, v)) { next = frac(piece(u.num), fresh(u.den)); label = 'constant multiple'; }
  else if (key(tidy(u)) !== key(u) && quick(tidy(u), v)) {
    // (1/cos x)²: tidied, it is a rule (1/cos² x)
    return checked(e, { eq: replace(e, T.arg.id, tidy(u)), label: 'simplify the inside', hints: newHints(), factor: one, select: null, rule: 'simplify' });
  }
  else if (u.k === 'frac' && rational(u)) {
    // a fraction of polynomials: divide out and split into simple fractions first, then each is a rule
    const { p, label } = rational(u)!;
    return checked(e, { eq: replace(e, T.id, int(v, p, T.lo && fresh(T.lo), T.hi && fresh(T.hi))), label, hints: newHints(), factor: one, select: null, rule: label });
  }
  else if (u.k === 'frac' && u.den.k === 'pow' && !dependsOn(u.den.base, v) && dependsOn(u.den.exp, v)) {
    // 1/eˣ is e⁻ˣ, x/2ˣ is x·2⁻ˣ: up on top, it is a rule (or by parts)
    const up = pow(fresh(u.den.base), neg(fresh(u.den.exp)));
    const top = u.num.k === 'num' && u.num.v === 1 ? up : mul([fresh(u.num), up]);
    return checked(e, { eq: replace(e, T.arg.id, top), label: '1/aᵘ = a⁻ᵘ', hints: newHints(), factor: one, select: null, rule: 'simplify' });
  }
  else return { error: 'No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions).' };
  return finish(e, T, next, label);
}

/** how u and v are tied, for messages: u = x² */
const letDef = (u: string, v: string) => (LETS.has(u) ? `${u} = ${toText(LETS.get(u)!)}` : LETS.has(v) ? `${v} = ${toText(LETS.get(v)!)}` : `${u} depends on ${v}`);

/** replace the integral, add + C when it was the last indefinite one, and check */
function finish(e: Eq, T: Int, next: Node, label: string, extra: Partial<MoveOk> = {}): MoveResult {
  let out = replace(e, T.id, next);
  if (!(T.lo && T.hi) && !indefiniteVars(out).length && !symbols(out).includes('C')) {
    const inL = !!findPath(e.lhs, T.id);
    const C = sym('C');
    out = inL ? eq(plus(out.lhs, C), out.rhs, out.rel) : eq(out.lhs, plus(out.rhs, C), out.rel);
    label += ', + C';
  }
  return checked(e, { eq: out, label, hints: newHints(), factor: one, select: null, rule: label, ...extra });
}

/* ---------- u-substitution ---------- */

/** C + u: find the inside g whose derivative is there too, and integrate in u = g instead.
 *  Aim at the inside to choose it. The side equation u = g comes back with the step. */
export function uSub(e: Eq, sel: string | null): { move: MoveResult; side?: Eq; u?: string; g?: Node } {
  const T = target(e, sel, 'int');
  if (!T) return { move: { error: 'No integral here.' } };
  const v = T.v, f = T.arg;
  const used = new Set(symbols(e));
  const u = ['u', 'w', 's'].find(n => !used.has(n) && n !== v) ?? 'u';
  const aimed = sel && sel !== 'eq' ? findPath(e, sel)?.slice(-1)[0] : null;
  const cands: Node[] = [];
  const consider = (n: Node) => { if (dependsOn(n, v) && !(n.k === 'sym') && !cands.some(c => key(c) === key(n))) cands.push(n); };
  if (aimed && aimed !== T && findPath(T.arg, aimed.id)) consider(aimed);
  else walk(f, n => {
    if (n.k === 'fn' || n.k === 'sqrt') consider(n.arg);
    if (n.k === 'pow') { consider(n.base); consider(n.exp); }
    if (n.k === 'frac') consider(n.den);
    if (n.k === 'fn' && (n.name === 'ln' || n.name === 'sin' || n.name === 'cos')) consider(n);
  });
  cands.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length);
  for (const g of cands) {
    const dg = derivative(g, v);
    if (!dg) continue;
    const swap = (n: Node): Node => (key(n) === key(g) ? sym(u) : withKids(n, swap));
    const Q = tidy(frac(swap(fresh(f)), tidy(dg)));
    if (dependsOn(Q, v)) continue;
    const def = !!(T.lo && T.hi);
    const bound = (b: Node) => tidy(substitute(fresh(g), v, b));
    const next = def ? int(u, Q, bound(T.lo!), bound(T.hi!)) : int(u, Q);
    const label = `u-substitution: ${u} = ${toText(g)}`;
    const check = def ? undefined : (env: Env) => [[evaluate(Q, { ...env, [u]: evaluate(g, env) }) * evaluate(dg, env), evaluate(f, env)]] as [number, number][];
    const move = checked(e, { eq: replace(e, T.id, next), label, hints: newHints(), factor: one, select: null, rule: 'u-substitution', check });
    if (isErr(move)) continue;
    return { move, side: def ? undefined : eq(sym(u), fresh(g)), u, g };
  }
  return { move: { error: aimed ? `Its derivative isn't there, so u = that doesn't work. Aim at another inside piece.` : 'No inside function whose derivative is also there. Try by parts (C + b).' } };
}

/** the inside g that u-substitution would name: aimed, else the one whose derivative is there too */
export function uCandidate(e: Eq, sel: string | null): Node | null {
  const T = target(e, sel, 'int');
  if (!T) return null;
  const r = uSub(e, sel);
  if (isErr(r.move) || !r.g) return null;
  const k = key(r.g);
  let hit: Node | null = null;
  walk(T.arg, n => { if (!hit && key(n) === k) hit = n; });
  return hit;
}

const withKids = (n: Node, f: (c: Node) => Node): Node => { const ks = children(n); return ks.length ? withChildren(n, ks.map(f)) : n; };

/** back from u to x once the u-integral is done: the check puts u = g in */
export function backSub(e: Eq, u: string, g: Node): MoveResult {
  const next = substitute(e, u, g) as Eq;
  return checked(e, { eq: next, label: `back to ${symbols(g).join(', ')}: ${u} = ${toText(g)}`, hints: newHints(), factor: one, select: null, rule: 'substitute back', check: env => [[evaluate(next, env), evaluate(e, { ...env, [u]: evaluate(g, env) })]] });
}

/* ---------- by parts ---------- */

const LIATE = (n: Node): number => {
  if (n.k === 'fn' && (n.name === 'ln' || n.name === 'log')) return 0;
  if (n.k === 'fn' && ['asin', 'acos', 'atan'].includes(n.name)) return 1;
  if (n.k === 'fn' && ['sin', 'cos', 'tan'].includes(n.name)) return 3;
  if (n.k === 'pow' && n.base.k === 'sym' && n.base.name === 'e') return 4;
  return 2;
};

/** C + b: ∫ u dv = uv − ∫ v du. u is the aimed factor, or the first by LIATE */
export function byParts(e: Eq, sel: string | null): MoveResult {
  const T = target(e, sel, 'int');
  if (!T) return { error: 'No integral here.' };
  const v = T.v;
  const fs = T.arg.k === 'mul' ? T.arg.factors : [T.arg];
  // a lone factor only when it is a log or inverse trig (∫ ln x dx: u = ln x, dv = dx)
  if (fs.length === 1 && LIATE(fs[0]) > 1) return { error: 'By parts needs a product (or a lone ln or inverse trig).' };
  const aimed = sel && sel !== 'eq' ? fs.find(f => f.id === sel) : undefined;
  const order = aimed ? [aimed] : [...fs].filter(f => dependsOn(f, v)).sort((a, b) => LIATE(a) - LIATE(b));
  for (const U of order) {
    const rest = fs.filter(f => f !== U);
    const dv = rest.length === 0 ? num(1) : rest.length === 1 ? rest[0] : mul(rest);
    const V = quick(dv, v);
    if (!V) continue;
    const du = prettyDerivative(U, v);
    const def = !!(T.lo && T.hi);
    const uv = times(fresh(U), fresh(V.F));
    const vdu = tidy(times(fresh(V.F), du));
    const next = def ? plus(at(v, uv, fresh(T.lo!), fresh(T.hi!)), times(num(-1), int(v, vdu, fresh(T.lo!), fresh(T.hi!)))) : plus(uv, times(num(-1), int(v, vdu)));
    const r = checked(e, { eq: replace(e, T.id, next), label: `by parts: u = ${toText(U)}`, hints: newHints(), factor: one, select: null, rule: 'by parts' });
    if (!isErr(r)) return r;
  }
  return { error: aimed ? "∫ of the rest has no quick answer. Aim at the other factor to make it u." : 'By parts needs a product where one factor integrates easily.' };
}

/* ---------- bounds ---------- */

/** C + p on F|ₐᵇ: F(b) − F(a). An infinite bound becomes a limit. */
export function plugBounds(e: Eq, sel: string | null): MoveResult {
  const A = target(e, sel, 'at') as At | null;
  if (!A) return { error: 'Nothing to plug the bounds into.' };
  const env: Env = {};
  symbols(A).forEach((s, i) => (env[s] = 1.3 + i));
  const side = (b: Node, keep: boolean) => (Number.isFinite(evaluate(b, env)) ? substitute(keep ? A.arg : fresh(A.arg), A.v, b) : limOf(A, b));
  // 0 to a power with a letter in it (x^(t+1) at x = 0) is 0 where the integral is defined: say where
  const conditions: string[] = [];
  const zeroPow = (n: Node): Node => {
    if (n.k === 'pow' && isNum(n.base, 0) && symbols(n.exp).length) { conditions.push(`${toText(n.exp)} > 0`); return num(0); }
    const ks = children(n);
    return ks.length ? withChildren(n, ks.map(zeroPow)) : n;
  };
  const next = plus(zeroPow(side(A.hi, true)), times(num(-1), zeroPow(side(A.lo, false))));
  return checked(e, { eq: replace(e, A.id, next), label: 'plug in the bounds', hints: newHints(), factor: one, select: next.id, rule: 'fundamental theorem', conditions });
}
const limOf = (A: At, b: Node): Node => lim(A.v, fresh(b), fresh(A.arg));

/* ---------- series ---------- */

/** a·rⁿ: the ratio r (free of n), if every factor is a constant or a constant to a linear power of n */
function ratio(a: Node, n: string): Node | null {
  const r = tidy(frac(substitute(a, n, add([sym(n), num(1)])), fresh(a)));
  if (!dependsOn(r, n)) return r;
  // powers b^(n + k) over the same: simplify may not see it, so check numerically and build it
  const env: Env = {};
  symbols(a).filter(s => s !== n).forEach((s, i) => (env[s] = 0.3 + 0.1 * i));
  const at = (k: number) => evaluate(a, { ...env, [n]: k + 1 }) / evaluate(a, { ...env, [n]: k });
  const r0 = at(2);
  if (![3, 5, 9].every(k => Math.abs(at(k) - r0) < 1e-9 * (1 + Math.abs(r0)))) return null;
  const parts: Node[] = [];
  const visit = (m: Node, inv: boolean) => {
    if (m.k === 'mul') return m.factors.forEach(f => visit(f, inv));
    if (m.k === 'frac') { visit(m.num, inv); visit(m.den, !inv); return; }
    if (m.k === 'neg') return visit(m.arg, inv);
    if (m.k === 'pow' && !dependsOn(m.base, n) && dependsOn(m.exp, n)) {
      const d = derivative(m.exp, n);
      if (d && !dependsOn(d, n)) parts.push(inv ? frac(num(1), powOf(fresh(m.base), tidy(d))) : powOf(fresh(m.base), tidy(d)));
    }
  };
  visit(a, false);
  if (!parts.length) return null;
  const R = tidy(parts.length === 1 ? parts[0] : mul(parts));
  return Math.abs(evaluate(R, env) - r0) < 1e-9 * (1 + Math.abs(r0)) ? R : null;
}

/** C + g on Σ a·rⁿ to ∞: first term/(1 − r), for |r| < 1 */
export function geometric(e: Eq, sel: string | null): MoveResult {
  const S = target(e, sel, 'sum') as Sum | null;
  if (!S) return { error: 'No sum here.' };
  if (S.prod) return { error: 'That is a product, not a sum.' };
  const env: Env = {};
  symbols(S).forEach((s, i) => (env[s] = 0.3 + 0.1 * i));
  if (evaluate(S.hi, env) !== Infinity) return { error: 'The geometric series formula is for a sum to ∞.' };
  const r = ratio(S.arg, S.v);
  if (!r) return { error: 'Not geometric: the ratio between terms changes with ' + S.v + '.' };
  const first = tidy(substitute(S.arg, S.v, S.lo));
  const next = frac(first, plus(num(1), times(num(-1), fresh(r))));
  const rv = evaluate(r, env);
  if (!symbols(r).length && Math.abs(rv) >= 1) return { error: `The ratio is ${toText(r)}, and |r| ≥ 1, so it diverges.` };
  const cond = `|${toText(r)}| < 1`;
  return checked(e, {
    eq: replace(e, S.id, next), label: `geometric series, r = ${toText(r)}`, hints: newHints(), factor: one, select: null, rule: 'geometric series', conditions: symbols(r).length ? [cond] : [],
    check: symbols(r).length ? env2 => (Math.abs(evaluate(r, env2)) < 0.9 ? [[evaluate(replace(e, S.id, next), env2), evaluate(e, env2)]] : [[NaN, NaN]]) : undefined,
  });
}

/** Σ c/nᵖ from n = 1 to ∞: π²/6 and π⁴/90 by name; else whether it converges (p > 1) or not */
export function pSeries(e: Eq, sel: string | null): MoveResult {
  const S = target(e, sel, 'sum') as Sum | null;
  if (!S || S.prod) return { error: 'No sum here.' };
  if (evaluate(S.hi, {}) !== Infinity || !isNum(S.lo, 1)) return { error: 'A p-series runs from 1 to ∞.' };
  // c/nᵖ: the term at n and 2n differ by 2ᵖ whatever n is
  const at = (n: number) => evaluate(S.arg, { [S.v]: n });
  const p = Math.log2(at(3) / at(6)), c = at(1);
  if (!Number.isFinite(p) || !Number.isFinite(c) || c === 0 || symbols(S.arg).some(w => w !== S.v)) return { error: 'Not a p-series.' };
  for (const n of [2, 5, 7]) if (Math.abs(at(n) - c / n ** p) > 1e-9 * Math.abs(c)) return { error: 'Not a p-series.' };
  const P = Math.round(p * 1e9) / 1e9, pt = ratNode(P) ? toText(ratNode(P)!) : String(+P.toPrecision(4));
  if (P <= 1) return { error: `A p-series with p = ${pt} ≤ 1${P === 1 ? ' (the harmonic series)' : ''}: it diverges.` };
  const known: Record<number, Node> = { 2: frac(pow(sym('π'), num(2)), num(6)), 4: frac(pow(sym('π'), num(4)), num(90)) };
  if (!known[P]) return { error: `A p-series with p = ${pt} > 1, so it converges (to about ${+(c * zeta(P)).toPrecision(6)}), but has no simple closed form.` };
  const next = tidy(times(ratNode(c) ?? num(c), known[P]));
  return checked(e, { eq: replace(e, S.id, next), label: `p-series, p = ${pt}: ${P === 2 ? 'Σ 1/n² = π²/6' : 'Σ 1/n⁴ = π⁴/90'}`, hints: newHints(), factor: one, select: null, rule: 'p-series' });
}
/** ζ(p) by summing, with the tail as an integral */
function zeta(p: number) { let s = 0; const N = 2000; for (let n = 1; n < N; n++) s += n ** -p; return s + N ** (1 - p) / (p - 1) + 0.5 * N ** -p; }

/** a Σ or ∏ with whole-number bounds and at most 12 terms: how many, or why not */
export function finiteTerms(S: Sum): number[] | string {
  const env: Env = {};
  symbols(S).forEach((s, i) => (env[s] = 0.3 + 0.1 * i));
  const lo = evaluate(S.lo, env), hi = evaluate(S.hi, env);
  if (hi === Infinity) return 'It goes on forever, so it can’t be written out.';
  if (!Number.isInteger(lo) || !Number.isInteger(hi)) return 'The bounds must be whole numbers to write it out.';
  if (hi - lo > 11) return `That is ${hi - lo + 1} terms: too many to write out.`;
  return Array.from({ length: Math.max(0, hi - lo + 1) }, (_, i) => lo + i);
}

/** C + x: a finite Σ or ∏ written out, term by term */
export function writeOut(e: Eq, sel: string | null): MoveResult {
  const S = target(e, sel, 'sum') as Sum | null;
  if (!S) return { error: 'No sum or product here.' };
  const ks = finiteTerms(S);
  if (typeof ks === 'string') return { error: ks };
  const terms = ks.map(k => cloneFresh(substitute(S.arg, S.v, num(k))));
  const next = terms.length === 0 ? num(S.prod ? 1 : 0) : terms.length === 1 ? terms[0] : S.prod ? mul(terms) : add(terms);
  const label = S.prod ? 'write out the product' : 'write out the sum';
  return checked(e, { eq: replace(e, S.id, next), label, hints: newHints(), factor: one, select: null, rule: label });
}

/** C + r on a series: the ratio test, as a verdict for the bar */
export function ratioTest(e: Eq, sel: string | null): string {
  const S = target(e, sel, 'sum') as Sum | null;
  if (!S) return 'No sum here.';
  if (S.prod) return 'The ratio test is for sums.';
  const env: Env = {};
  symbols(S).forEach((s, i) => (env[s] = 0.5 + 0.1 * i));
  const a = (k: number) => Math.abs(evaluate(S.arg, { ...env, [S.v]: k }));
  const rs = [400, 800].map(k => a(k + 1) / a(k));
  if (!rs.every(Number.isFinite)) return 'Ratio test: the terms are undefined far out.';
  // the ratio settles like L + c/n: extrapolate
  const L = 2 * rs[1] - rs[0];
  const shown = ratNode(Math.round(L * 1e6) / 1e6);
  const t = shown ? toText(shown) : L.toFixed(4);
  if (Math.abs(L - 1) < 2e-3) return `Ratio test: |aₙ₊₁/aₙ| → 1, so it can't tell. Compare with ∫ or a p-series instead.`;
  return L < 1 ? `Ratio test: |aₙ₊₁/aₙ| → ${t} < 1, so it converges.` : `Ratio test: |aₙ₊₁/aₙ| → ${t} > 1, so it diverges.`;
}

/** C + t: the Taylor polynomial of degree k about a (0, else 1), as a new expression */
export function taylor(e: Eq, v: string, k = 5): { poly: Eq; about: number } | { error: string } {
  const f = e.rel === 'expr' ? e.lhs : e.rel === 'def' ? e.rhs : null;
  if (!f) return { error: 'Taylor polynomials are for a function: type f(x) = … or an expression.' };
  if (symbols(f).some(s => s !== v)) return { error: `Only ${v} may vary here.` };
  for (const a of [0, 1]) {
    let d: Node | null = f;
    const terms: Node[] = [];
    let ok = true;
    let fact = 1;
    for (let j = 0; j <= k && d; j++) {
      if (j > 0) fact *= j;
      const c = ratNode(evaluate(d, { [v]: a }) / fact);
      if (!c) { ok = false; break; }
      if (!isNum(c, 0)) terms.push(times(c, a === 0 ? powOf(sym(v), num(j)) : powOf(add([sym(v), num(-a)]), num(j))));
      d = derivative(d, v);
    }
    if (ok && d) return { poly: eq(terms.length ? plus(...terms) : num(0), num(0), 'expr'), about: a };
  }
  return { error: 'Its coefficients aren’t simple numbers, so I can’t write the Taylor polynomial exactly.' };
}

