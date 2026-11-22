// Calculus 2 steps: antiderivatives a rule at a time, u-substitution, integration by parts,
// the bounds of a definite integral, and series (geometric sums, Taylor polynomials, the ratio
// test). Checked like everything else: a definite integral by its value, an indefinite one by
// its slope (calculus.ts and verify in moves.ts).
import { Node, Eq, Int, At, Sum, num, sym, add, mul, neg, frac, pow, fn, call, int, at, lim, eq, findPath, replace, walk, cloneFresh, evaluate, symbols, key, Env, children, withChildren, sqrt as sqrtN, linkedTo, LETS } from './ast';
import { toText } from './print';
import { dependsOn, derivative, substitute } from './calculus';
import { checked, MoveOk, MoveResult, isErr, indefiniteVars } from './moves';
import { newHints, simplify } from './simplify';
import { times, plus, prettyDerivative, knownNumber } from './calcmoves';
import { partialFractions, longDivide, slopeSplit } from './polytools';
import { expandAll } from './rewrite';

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
/** a x² + b x + c with a square to complete: k ± m (x + h)², the sign of x² being s */
function quadShift(n: Node, v: string, s: 1 | -1): { k: number; m: number; h: Node } | null {
  const at = (x: number) => evaluate(n, { [v]: x });
  const C = at(0), A = (at(1) + at(-1)) / 2 - C, B = (at(1) - at(-1)) / 2;
  if (!Number.isFinite(A + B + C) || Math.abs(B) < 1e-12 || Math.sign(A) !== s) return null;
  for (const x of [0.5, 1.3, -2.1, 3.7]) if (Math.abs(at(x) - (A * x * x + B * x + C)) > 1e-9 * (1 + Math.abs(C))) return null;
  const k = C - (B * B) / (4 * A), hv = B / (2 * A), h = ratNode(hv);
  if (!(k > 0) || !h) return null;
  return { k, m: Math.abs(A), h };
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
        // a plain number below divides the way you'd write it: −ln|u|, not ln|u|/(−1)
        const c = cs.every(x => x.k === 'num') ? cs.reduce((p, x) => p * (x as Extract<Node, { k: 'num' }>).v, 1) : NaN;
        if (q && Number.isFinite(c) && c !== 0) return { F: over(q.F, c), label: q.label };
        return q && { F: frac(q.F, cs.length === 1 ? fresh(cs[0]) : mul(cs.map(fresh))), label: q.label };
      }
    }
    const c = isNum(u.num, 1) ? [] : [fresh(u.num)];
    const d = u.den;
    let q: { F: Node; label: string } | null = null;
    // ∫ sec = ln|sec + tan|, written (1 + sin)/cos; ∫ csc = ln|(1 − cos)/sin|
    if (d.k === 'fn' && (d.name === 'cos' || d.name === 'sin')) {
      const a = slope(d.arg, v), L = () => fresh(d.arg);
      if (a !== null) q = d.name === 'cos'
        ? { F: over(fn('ln', fn('abs', frac(add([num(1), fn('sin', L())]), fn('cos', L())))), a), label: '∫ sec = ln|sec + tan|' }
        : { F: over(fn('ln', fn('abs', frac(add([num(1), neg(fn('cos', L()))]), fn('sin', L())))), a), label: '∫ csc = ln|csc − cot|' };
    }
    else if (d.k === 'pow' && d.base.k === 'fn' && d.base.name === 'cos' && isNum(d.exp, 2)) { const a = slope(d.base.arg, v); if (a !== null) q = { F: over(fn('tan', fresh(d.base.arg)), a), label: '∫ sec² = tan' }; }
    else if (d.k === 'pow' && d.base.k === 'fn' && d.base.name === 'sin' && isNum(d.exp, 2)) { const a = slope(d.base.arg, v); if (a !== null) q = { F: over(times(num(-1), frac(fn('cos', fresh(d.base.arg)), fn('sin', fresh(d.base.arg)))), a), label: '∫ csc² = −cot' }; }
    else if (d.k === 'pow' && !dependsOn(d.exp, v)) { const n = exponent(d.exp); if (n !== null) q = powerOf(d.base, -n); }
    // k − x² under a root, k + x² below, in any order: sin⁻¹ and tan⁻¹ (scaled when k isn't 1)
    else if (d.k === 'sqrt' && quadK(d.arg, v, -1)) { const { k, m } = quadK(d.arg, v, -1)!; q = arcRule('asin', k, m, V, v); }
    // −x² + 10x is 25 − (x − 5)², x² + 2x + 10 is (x + 1)² + 9: the square completed, then the same rules
    else if (d.k === 'sqrt' && quadShift(d.arg, v, -1)) { const { k, m, h } = quadShift(d.arg, v, -1)!; q = arcRule('asin', k, m, () => tidy(add([V(), h])), `(${toText(tidy(add([V(), h])))})`); q.label += ', the square completed'; }
    else if (d.k === 'sqrt') q = powerOf(d.arg, -0.5);
    else if (quadK(d, v, 1)) { const { k, m } = quadK(d, v, 1)!; q = arcRule('atan', k, m, V, v); }
    else if (quadShift(d, v, 1)) { const { k, m, h } = quadShift(d, v, 1)!; q = arcRule('atan', k, m, () => tidy(add([V(), h])), `(${toText(tidy(add([V(), h])))})`); q.label += ', the square completed'; }
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

/** a fraction with 1/v, 1/v² … inside its top or bottom: × vᵐ top and bottom, multiplied out */
function clearInner(u: Extract<Node, { k: 'frac' }>, v: string): { n: Node; by: Node } | null {
  const h0 = newHints();
  const N = tidy(expandAll(fresh(u.num), h0)), D = tidy(expandAll(fresh(u.den), h0));
  // the lowest power of v among the terms: c·vᵏ read off at two points
  let low = 0;
  for (const side of [N, D]) for (const t of side.k === 'add' ? side.terms : [side]) {
    if (!dependsOn(t, v)) continue;
    const a = evaluate(t, { [v]: 1.7 }), b = evaluate(t, { [v]: 3.4 });
    const k = Math.log2(b / a);
    if (!Number.isFinite(k) || Math.abs(k - Math.round(k)) > 1e-9) return null;
    low = Math.min(low, Math.round(k));
  }
  if (low === 0) return null;
  const by = low === -1 ? sym(v) : pow(sym(v), num(-low));
  const h = newHints();
  const n = frac(simplify(expandAll(mul([N, fresh(by)]), h), h), simplify(expandAll(mul([D, fresh(by)]), h), h));
  return partialFractions(n) || longDivide(n) ? { n, by } : null;
}

/** a fraction of polynomials made integrable: partial fractions, or long division first */
function rational(u: Node): { p: Node; label: string } | null {
  const pf = partialFractions(u);
  if (pf && key(pf) !== key(u)) return { p: pf, label: 'partial fractions' };
  const ld = longDivide(u);
  return ld && key(ld) !== key(u) ? { p: ld, label: 'long division' } : null;
}

/** the well-known integrals with no elementary antiderivative, by name: eᵘ/u, sin u/u, e^(−u²),
 *  1/ln u, sin(u²), with u any linear a·v + b (and a constant base for the power) */
function noFormula(u: Node, v: string): string | null {
  const linear = (n: Node) => { const d = derivative(n, v); return !!d && dependsOn(n, v) && !dependsOn(d, v); };
  const expOf = (n: Node): Node | null => n.k === 'pow' && !dependsOn(n.base, v) ? n.exp : null;
  const square = (n: Node) => n.k === 'pow' && n.exp.k === 'num' && n.exp.v === 2 && linear(n.base);
  const lone = (n: Node) => (n.k === 'mul' ? n.factors.filter(f => dependsOn(f, v)) : [n]);
  if (u.k === 'frac' && linear(u.den)) {
    const top = lone(u.num);
    if (top.length === 1) {
      const t = top[0], x = expOf(t);
      if (x && linear(x)) return 'the exponential integral, Ei';
      if (t.k === 'fn' && (t.name === 'sin' || t.name === 'cos') && linear(t.arg)) return t.name === 'sin' ? 'the sine integral, Si' : 'the cosine integral, Ci';
    }
  }
  if (u.k === 'frac' && !dependsOn(u.num, v) && u.den.k === 'fn' && u.den.name === 'ln' && linear(u.den.arg)) return 'the logarithmic integral, li';
  const one = lone(u);
  if (one.length === 1) {
    const t = one[0], x = expOf(t);
    if (x && (square(x) || (x.k === 'neg' && square(x.arg)) || (x.k === 'mul' && lone(x).length === 1 && square(lone(x)[0])))) return 'the error function, erf';
    if (t.k === 'fn' && (t.name === 'sin' || t.name === 'cos') && square(t.arg)) return 'a Fresnel integral';
  }
  return null;
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
  // |g| between bounds: split where g changes sign, then on each piece |g| is g or −g
  const ab = def ? absPieces(T) : null;
  if (ab) return checked(e, { eq: replace(e, T.id, ab.next), label: ab.label, hints: newHints(), factor: one, select: null, rule: 'absolute value' });
  const q = quick(u, v);
  if (q) { next = wrap(q.F); label = q.label; if (q.conditions) return finish(e, T, next, label, { conditions: q.conditions }); }
  else if (u.k === 'add') { next = plus(...u.terms.map(piece)); label = 'sum rule'; }
  else if (u.k === 'neg') { next = times(num(-1), piece(u.arg)); label = 'constant multiple'; }
  else if (u.k === 'frac' && u.num.k === 'neg') { next = times(num(-1), piece(frac(fresh(u.num.arg), fresh(u.den)))); label = 'constant multiple'; }
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
  else if (u.k === 'frac' && slopeSplit(u)) {
    // (Bx + C)/(quadratic): a multiple of the bottom's slope over it (a log) plus a number over it (tan⁻¹)
    return checked(e, { eq: replace(e, T.arg.id, slopeSplit(u)!), label: 'top as the bottom’s slope plus a number', hints: newHints(), factor: one, select: null, rule: 'simplify' });
  }
  else if (u.k === 'frac' && u.den.k === 'pow' && !dependsOn(u.den.base, v) && dependsOn(u.den.exp, v)) {
    // 1/eˣ is e⁻ˣ, x/2ˣ is x·2⁻ˣ: up on top, it is a rule (or by parts)
    const up = pow(fresh(u.den.base), neg(fresh(u.den.exp)));
    const top = u.num.k === 'num' && u.num.v === 1 ? up : mul([fresh(u.num), up]);
    return checked(e, { eq: replace(e, T.arg.id, top), label: '1/aᵘ = a⁻ᵘ', hints: newHints(), factor: one, select: null, rule: 'simplify' });
  }
  else if (u.k === 'frac' && clearInner(u, v)) {
    // 1/((u − 1/u)² u): × u² top and bottom clears the little fractions, and it is a fraction of polynomials
    const c = clearInner(u, v)!;
    return checked(e, { eq: replace(e, T.arg.id, c.n), label: `× ${toText(c.by)} top and bottom`, hints: newHints(), factor: one, select: null, rule: 'simplify' });
  }
  else {
    const known = noFormula(u, v);
    if (known) return { error: `∫ ${toText(u)} d${v} has no formula in ordinary functions (it is ${known}), so no rule can finish it.${def ? '' : ' With bounds, it is still a number.'}` };
    return { error: 'No rule fits as it stands. Name a piece (b) and sub it in, try by parts (C + b), or rewrite the inside first (Tab: expand, partial fractions).' };
  }
  return finish(e, T, next, label);
}

/** ∫ₐᵇ with |g| inside: the pieces between the places g is 0, or, with none inside, |g| as ±g */
function absPieces(T: Int): { next: Node; label: string } | null {
  const v = T.v, lo = evaluate(T.lo!, {}), hi = evaluate(T.hi!, {});
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) return null;
  let A: Extract<Node, { k: 'fn' }> | null = null;
  walk(T.arg, n => { if (!A && n.k === 'fn' && n.name === 'abs' && dependsOn(n.arg, v) && symbols(n.arg).every(w => w === v)) A = n; });
  const g = A as Extract<Node, { k: 'fn' }> | null;
  if (!g) return null;
  const at = (x: number) => evaluate(g.arg, { [v]: x });
  // where g changes sign inside (lo, hi), found on a fine grid and narrowed down, then made exact
  const cuts: Node[] = [];
  const N = 400;
  for (let i = 0; i < N; i++) {
    let a = lo + ((hi - lo) * i) / N, b = lo + ((hi - lo) * (i + 1)) / N;
    if (!(at(a) * at(b) < 0) && !(at(b) === 0 && i < N - 1)) continue;
    if (at(b) === 0) { const c = ratNode(b); if (c) cuts.push(c); continue; }
    for (let k = 0; k < 60; k++) { const m = (a + b) / 2; if (at(a) * at(m) <= 0) b = m; else a = m; }
    const x = (a + b) / 2;
    // a turn at an end (√2 as the top bound) isn't inside
    if (Math.min(x - lo, hi - x) < 1e-9 * (1 + Math.abs(x))) continue;
    const c = knownNumber(x) ?? sqrtCut(x);
    if (!c) return null;
    cuts.push(c);
  }
  const name = `|${toText(g.arg)}|`;
  if (cuts.length) {
    const ends = [fresh(T.lo!), ...cuts, fresh(T.hi!)];
    const parts = ends.slice(1).map((b, i) => int(v, fresh(T.arg), i ? fresh(ends[i]) : ends[i], b));
    return { next: plus(...parts), label: `split where ${name} turns: ${cuts.map(c => `${v} = ${toText(c)}`).join(', ')}` };
  }
  // no turn inside: one sign all the way
  const sgn = Math.sign(at((lo + hi) / 2));
  if (!sgn) return null;
  const swap = (n: Node): Node => (n === g ? (sgn > 0 ? fresh(g.arg) : neg(fresh(g.arg))) : withKids(n, swap));
  return { next: int(v, swap(T.arg), fresh(T.lo!), fresh(T.hi!)), label: `${name} = ${sgn > 0 ? '' : '−'}(${toText(g.arg)}) from ${toText(T.lo!)} to ${toText(T.hi!)}` };
}
const sqrtCut = (x: number): Node | null => { const s = ratNode(Math.round(x * x * 1e9) / 1e9); return s && s.k === 'num' ? (x > 0 ? sqrtN(s) : neg(sqrtN(s))) : null; };

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
  const cands: Node[] = [], exps: Node[] = [];
  const consider = (n: Node) => { if (dependsOn(n, v) && !(n.k === 'sym') && !cands.some(c => key(c) === key(n))) cands.push(n); };
  if (aimed && aimed !== T && findPath(T.arg, aimed.id)) consider(aimed);
  else walk(f, n => {
    if (n.k === 'fn' || n.k === 'sqrt') consider(n.arg);
    if (n.k === 'pow') { consider(n.base); consider(n.exp); }
    if (n.k === 'frac') consider(n.den);
    if (n.k === 'fn' && (n.name === 'ln' || n.name === 'sin' || n.name === 'cos')) consider(n);
    // eˣ in ∫ eˣ/(1 + e^(2x)): u = eˣ, and e^(2x) is u² (tried after the insides)
    if (n.k === 'pow' && !dependsOn(n.base, v) && dependsOn(n, v) && !exps.some(c => key(c) === key(n))) exps.push(n);
    // √u in ∫ √u/(1 + u) du: w = √u (u = w²) clears the root, tried last too
    if (n.k === 'sqrt' && dependsOn(n, v) && !exps.some(c => key(c) === key(n))) exps.push(n);
  });
  cands.sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length);
  cands.push(...exps.filter(x => !cands.some(c => key(c) === key(x))));
  for (const g of cands) {
    const dg = derivative(g, v);
    if (!dg) continue;
    const swap = (n: Node): Node => (key(n) === key(g) ? sym(u) : withKids(n, swap));
    let Q = tidy(frac(swap(fresh(f)), tidy(dg)));
    // what's left may be a power of g: x² with u = x² (∫ x³ e^(x²)), e^(2x) with u = eˣ
    if (dependsOn(Q, v)) Q = tidy(powersOf(Q, g, v, u));
    // x is still written there but doesn't change anything ((x + 1)/(u(2x + 2)) is 1/(2u)): put
    // in a value of x where it is defined, and the numbers check it
    if (dependsOn(Q, v)) Q = idleIn(Q, v, u) ?? Q;
    if (dependsOn(Q, v)) continue;
    const def = !!(T.lo && T.hi);
    const bound = (b: Node) => endOf(g, v, b);
    const next = def ? int(u, Q, bound(T.lo!), bound(T.hi!)) : int(u, Q);
    const label = `u-substitution: ${u} = ${toText(g)}`;
    const check = def ? undefined : (env: Env) => [[evaluate(Q, { ...env, [u]: evaluate(g, env) }) * evaluate(dg, env), evaluate(f, env)]] as [number, number][];
    const move = checked(e, { eq: replace(e, T.id, next), label, hints: newHints(), factor: one, select: null, rule: 'u-substitution', check });
    if (isErr(move)) continue;
    return { move, side: def ? undefined : eq(sym(u), fresh(g)), u, g };
  }
  // aimed at one that doesn't work: say which one would
  const other = aimed ? uSub(e, null) : null;
  const hint = other && !isErr(other.move) && other.g ? ` u = ${toText(other.g)} works: aim at it (or at nothing).` : ' Aim at another inside piece.';
  return { move: { error: aimed ? `Its derivative isn't there, so u = ${toText(aimed)} doesn't work.${hint}` : 'No inside function whose derivative is also there. Try by parts (C + b).' } };
}

/** where a new letter's end lands: g at the old end, and at ∞ the number it heads to (cos⁻¹(1/x) → π/2) */
function endOf(g: Node, v: string, b: Node): Node {
  const t = tidy(substitute(fresh(g), v, b));
  let inf = false;
  walk(t, n => { if (n.k === 'sym' && n.name === '∞') inf = true; });
  if (!inf) return t;
  const x = evaluate(t, {});
  if (x === Infinity) return sym('∞');
  if (x === -Infinity) return neg(sym('∞'));
  return knownNumber(x) ?? t;
}

/** n with v in it only for show (it cancels): n at a whole-number v, else null */
function idleIn(n: Node, v: string, u: string): Node | null {
  const xs = [0.37, 0.71, 1.13, 1.9], us = [0.6, 1.7];
  for (const uv of us) {
    const ys = xs.map(x => evaluate(n, { [v]: x, [u]: uv }));
    if (!ys.every(y => Number.isFinite(y) && Math.abs(y - ys[0]) < 1e-9 * (1 + Math.abs(ys[0])))) return null;
  }
  for (const x0 of [0, 1, 2, 3, -1]) {
    const m = tidy(substitute(fresh(n), v, num(x0)));
    if (us.every(uv => Math.abs(evaluate(m, { [u]: uv }) - evaluate(n, { [v]: 0.71, [u]: uv })) < 1e-9 * (1 + Math.abs(evaluate(m, { [u]: uv }))))) return m;
  }
  return null;
}

/** every piece of n that is c·gᵏ (checked at a few points) written c·uᵏ */
function powersOf(n: Node, g: Node, v: string, u: string): Node {
  const xs = [0.37, 0.71, 1.13];
  const gv = xs.map(x => evaluate(g, { [v]: x }));
  if (!gv.every(y => Number.isFinite(y) && Math.abs(Math.abs(y) - 1) > 1e-6)) return n;
  const go = (m: Node): Node => {
    // the letter itself only when g is a root or power of it (u = w² with w = √u)
    const ofLetter = (g.k === 'sqrt' && g.arg.k === 'sym' && g.arg.name === v) || (g.k === 'pow' && g.base.k === 'sym' && g.base.name === v);
    if ((m.k === 'pow' || m.k === 'sqrt' || (ofLetter && m.k === 'sym' && m.name === v)) && dependsOn(m, v)) {
      const mv = xs.map(x => evaluate(m, { [v]: x }));
      // negative ones too: e^(−t) is 1/u with u = eᵗ
      for (const k of [1, 2, 3, 4, -1, -2, -3, -4]) {
        const r = mv.map((y, i) => y / gv[i] ** k);
        if (r.every(y => Number.isFinite(y) && Math.abs(y - r[0]) < 1e-9 * (1 + Math.abs(r[0])))) {
          const c = ratNode(r[0]);
          if (!c) break;
          const p = k === 1 ? sym(u) : k === -1 ? frac(num(1), sym(u)) : k < 0 ? frac(num(1), pow(sym(u), ratNode(-k)!)) : pow(sym(u), ratNode(k)!);
          return isNum(c, 1) ? p : mul([c, p]);
        }
      }
      // or a line in g, or a power of one: y³ with u = 1 − y³ is 1 − u, x⁴ with u = x² + 1 is (u − 1)²
      for (const k of [1, 2, 3]) {
        const rv = mv.map(y => (k === 2 ? Math.sqrt(y) : Math.cbrt(y) ** (k === 1 ? 3 : 1)));
        const b1 = (rv[1] - rv[0]) / (gv[1] - gv[0]), a1 = rv[0] - b1 * gv[0];
        if (!(Number.isFinite(b1) && Math.abs(b1) > 1e-12 && Math.abs(a1 + b1 * gv[2] - rv[2]) < 1e-9 * (1 + Math.abs(rv[2])))) continue;
        const A = ratNode(Math.round(a1 * 1e9) / 1e9), B = ratNode(Math.round(b1 * 1e9) / 1e9);
        if (!A || !B) continue;
        const line = tidy(add([A, isNum(B, 1) ? sym(u) : mul([B, sym(u)])]));
        return k === 1 ? line : pow(line, num(k));
      }
      // not a power of g as a whole: its pieces may be ((eᵗ − e⁻ᵗ)² has e⁻ᵗ inside)
      return withKids(m, go);
    }
    return withKids(m, go);
  };
  return go(n);
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
/** a trig function of an inverse one, read off the triangle: cos(sin⁻¹ x) = √(1 − x²) */
function triangle(n: Node): Node {
  const m = withKids(n, triangle);
  if (m.k !== 'fn' || m.arg.k !== 'fn' || !['sin', 'cos', 'tan'].includes(m.name) || !['asin', 'acos', 'atan'].includes(m.arg.name)) return m;
  const x = () => fresh((m.arg as Extract<Node, { k: 'fn' }>).arg);
  const r1 = () => sqrtN(add([num(1), neg(pow(x(), num(2)))])), r2 = () => sqrtN(add([num(1), pow(x(), num(2))]));
  const T: Record<string, () => Node> = {
    'sin asin': x, 'cos acos': x, 'tan atan': x, 'cos asin': r1, 'sin acos': r1,
    'tan asin': () => frac(x(), r1()), 'tan acos': () => frac(r1(), x()), 'sin atan': () => frac(x(), r2()), 'cos atan': () => frac(num(1), r2()),
  };
  return T[`${m.name} ${m.arg.name}`]?.() ?? m;
}

export function backSub(e: Eq, u: string, g: Node): MoveResult {
  const inverse = g.k === 'fn' && ['asin', 'acos', 'atan'].includes(g.name);
  const raw = substitute(e, u, g) as Eq;
  const next = inverse ? (fresh(tidy(triangle(raw))) as Eq) : raw;
  return checked(e, { eq: next, label: `back to ${symbols(g).join(', ')}: ${u} = ${toText(g)}`, hints: newHints(), factor: one, select: null, rule: 'substitute back', check: env => [[evaluate(next, env), evaluate(e, { ...env, [u]: evaluate(g, env) })]] });
}

/* ---------- trig substitution ---------- */

/** (3 sin θ)³ is 27 sin³ θ and (sin/cos)² is sin²/cos², so the rules can see the powers */
function spread(x: Node): Node {
  const y = withKids(x, spread);
  if (y.k !== 'pow' || y.exp.k !== 'num' || !Number.isInteger(y.exp.v)) return y;
  const n = (y.exp as Extract<Node, { k: 'num' }>).v;
  if (y.base.k === 'mul') return mul(y.base.factors.map(b => pow(fresh(b), num(n))));
  if (y.base.k === 'frac') return frac(pow(fresh(y.base.num), num(n)), pow(fresh(y.base.den), num(n)));
  return y;
}

/** √(k − m x²), √(k + m x²) or √(m x² − k) (or that to a half power): x = a sin θ, a tan θ or
 *  a sec θ, so the root is a cos θ, a sec θ or a tan θ, and dx comes along. One step that plays
 *  what b (x = 3 sin θ), C k and sub in do by hand. Returns θ and what it is in x, for going back. */
export function trigSub(e: Eq, sel: string | null): { move: MoveResult; u?: string; g?: Node } {
  const T = target(e, sel, 'int');
  if (!T) return { move: { error: 'No integral here.' } };
  const v = T.v, f = T.arg;
  let R: Node | null = null;
  walk(f, n => {
    if (R) return;
    const q = n.k === 'sqrt' ? n.arg : n.k === 'pow' && n.exp.k === 'frac' && isNum(n.exp.den, 2) && n.exp.num.k === 'num' ? n.base : null;
    if (q && dependsOn(q, v) && (quadK(q, v, -1) || quadK(q, v, 1) || quadK(neg(fresh(q)), v, -1))) R = n;
  });
  if (!R) return { move: { error: 'No √(a² − x²), √(a² + x²) or √(x² − a²) here.' } };
  const r = R as Node;
  const q = r.k === 'sqrt' ? r.arg : (r as Extract<Node, { k: 'pow' }>).base;
  const half = r.k === 'sqrt' ? 1 : ((r as Extract<Node, { k: 'pow' }>).exp as Extract<Node, { k: 'frac' }>).num as Extract<Node, { k: 'num' }>;
  const n = typeof half === 'number' ? 1 : half.v;
  const th = ['θ', 'φ', 'ψ'].find(c => !symbols(e).includes(c))!;
  const TH = () => sym(th), sin = () => fn('sin', TH()), cos = () => fn('cos', TH()), tan = () => fn('tan', TH());
  let kind: 'sin' | 'tan' | 'sec', k: number, m: number;
  if (quadK(q, v, -1)) { kind = 'sin'; ({ k, m } = quadK(q, v, -1)!); }
  else if (quadK(q, v, 1)) { kind = 'tan'; ({ k, m } = quadK(q, v, 1)!); }
  else { kind = 'sec'; ({ k, m } = quadK(neg(fresh(q)), v, -1)!); }
  const a = rootOf(k / m), rk = rootOf(k);
  // x, the root, and dx/dθ, each in θ
  const X = kind === 'sin' ? times(a, sin()) : kind === 'tan' ? times(a, tan()) : frac(fresh(a), cos());
  const root = kind === 'sin' ? times(rk, cos()) : kind === 'tan' ? frac(fresh(rk), cos()) : times(rk, tan());
  const dX = kind === 'sin' ? times(fresh(a), cos()) : kind === 'tan' ? frac(fresh(a), pow(cos(), num(2))) : frac(times(fresh(a), sin()), pow(cos(), num(2)));
  const swap = (x: Node): Node => (x === r ? (n === 1 ? root : pow(fresh(root), num(n))) : x.k === 'sym' && x.name === v ? fresh(X) : withKids(x, swap));
  const Q = tidy(spread(tidy(times(swap(f), dX))));
  if (dependsOn(Q, v)) return { move: { error: 'The substitution leaves some x behind.' } };
  // θ in x: sin⁻¹(x/a), tan⁻¹(x/a), and for sec, cos⁻¹(a/x) (x > a)
  const ratio = () => (isNum(a, 1) ? sym(v) : frac(sym(v), fresh(a)));
  const g = tidy(kind === 'sin' ? fn('asin', ratio()) : kind === 'tan' ? fn('atan', ratio()) : fn('acos', frac(fresh(a), sym(v))));
  const def = !!(T.lo && T.hi);
  const bound = (b: Node) => endOf(g, v, b);
  const next = def ? int(th, Q, bound(T.lo!), bound(T.hi!)) : int(th, Q);
  const label = `trig substitution: ${v} = ${toText(X)}, so ${toText(r)} = ${toText(n === 1 ? root : pow(fresh(root), num(n)))}`;
  const dg = derivative(g, v);
  // x = a sec θ covers x > a only (θ in [0, π/2)), so that is where it is checked
  const aV = evaluate(a, {});
  const check = def || !dg ? undefined : (env: Env) => (kind === 'sec' && !(env[v] > aV) ? [[NaN, NaN]] : [[evaluate(Q, { ...env, [th]: evaluate(g, env) }) * evaluate(dg, env), evaluate(f, env)]]) as [number, number][];
  // and says so: the answer it leads to holds there (√(x² − 1) = tan θ needs tan θ ≥ 0)
  const move = checked(e, { eq: replace(e, T.id, next), label, hints: newHints(), factor: one, select: null, rule: 'trig substitution', check, conditions: kind === 'sec' && !def ? [`${v} > ${toText(a)}`] : [] });
  return isErr(move) ? { move } : { move, u: th, g };
}

/* ---------- trig rewrites ---------- */

/** the identity a trig integral needs before a rule or u-substitution fits:
 *  tan = sin/cos (so sec x tan x is sin x/cos² x, a u = cos x), and an odd power keeps one
 *  factor back: sin³ x = (1 − cos² x) sin x, sin⁵ x cos² x = (1 − cos² x)² cos² x sin x */
export function trigRewrite(e: Eq, sel: string | null): MoveResult {
  const T = target(e, sel, 'int');
  if (!T) return { error: 'No integral here.' };
  const v = T.v, f = T.arg;
  let hasTan = false;
  walk(f, n => { if (n.k === 'fn' && n.name === 'tan' && dependsOn(n, v)) hasTan = true; });
  const done = (next: Node, label: string, rule: string) => checked(e, { eq: replace(e, T.arg.id, next), label, hints: newHints(), factor: one, select: null, rule });
  if (hasTan && !(f.k === 'fn' && f.name === 'tan')) {
    const swap = (n: Node): Node => (n.k === 'fn' && n.name === 'tan' ? frac(fn('sin', swap(fresh(n.arg))), fn('cos', swap(fresh(n.arg)))) : withKids(n, swap));
    return done(tidy(spread(tidy(swap(fresh(f))))), 'tan = sin/cos', 'trig identity');
  }
  // tan² = sec² − 1 (and cot² = csc² − 1): sin²/cos² is 1/cos² − 1
  const sq = (n: Node, nm: string) => n.k === 'pow' && isNum(n.exp, 2) && n.base.k === 'fn' && n.base.name === nm ? n.base.arg : null;
  if (f.k === 'frac' && ((sq(f.num, 'sin') && sq(f.den, 'cos')) || (sq(f.num, 'cos') && sq(f.den, 'sin')))) {
    const top = (f.num as Extract<Node, { k: 'pow' }>).base as Extract<Node, { k: 'fn' }>, bot = (f.den as Extract<Node, { k: 'pow' }>).base as Extract<Node, { k: 'fn' }>;
    if (key(top.arg) === key(bot.arg)) return done(add([frac(num(1), pow(fn(bot.name, fresh(bot.arg)), num(2))), num(-1)]), top.name === 'sin' ? 'tan² = sec² − 1' : 'cot² = csc² − 1', 'trig identity');
  }
  const fs = f.k === 'mul' ? f.factors : [f];
  const powOfTrig = (n: Node, name: 'sin' | 'cos') => (n.k === 'fn' && n.name === name ? { L: n.arg, n: 1 } : n.k === 'pow' && n.base.k === 'fn' && n.base.name === name && n.exp.k === 'num' && Number.isInteger(n.exp.v) && n.exp.v > 0 ? { L: n.base.arg, n: n.exp.v } : null);
  // sin⁵x/cos⁶x is sin⁵x·cos⁻⁶x: the bottom's powers of the other one count too
  const ups = f.k === 'frac' ? [...(f.num.k === 'mul' ? f.num.factors : [f.num]), ...(f.den.k === 'mul' ? f.den.factors : [f.den]).map(d => { const q = (['sin', 'cos'] as const).map(nm => powOfTrig(d, nm)).find(Boolean); return q ? pow((d.k === 'pow' ? d.base : d), num(-q.n)) : frac(num(1), d); })] : fs;
  const anyPow = (n: Node, name: 'sin' | 'cos') => powOfTrig(n, name) ?? (n.k === 'pow' && n.base.k === 'fn' && n.base.name === name && n.exp.k === 'num' && Number.isInteger(n.exp.v) ? { L: n.base.arg, n: n.exp.v } : null);
  for (const [name, other] of [['sin', 'cos'], ['cos', 'sin']] as const) {
    const fs = ups;
    const i = fs.findIndex(x => { const p = powOfTrig(x, name); return !!p && p.n >= 3 && p.n % 2 === 1; });
    if (i < 0) continue;
    const p = powOfTrig(fs[i], name)!;
    // the rest must be powers of the other one (same inside, on top or below) or constants
    if (!fs.every((x, j) => j === i || !dependsOn(x, v) || (anyPow(x, other) && key(anyPow(x, other)!.L) === key(p.L)))) continue;
    const k = (p.n - 1) / 2;
    const sq = add([num(1), neg(pow(fn(other, fresh(p.L)), num(2)))]);
    const kept = [...fs.slice(0, i).map(fresh), k === 1 ? sq : pow(sq, num(k)), ...fs.slice(i + 1).map(fresh), fn(name, fresh(p.L))];
    const below = kept.filter(x => x.k === 'pow' && x.exp.k === 'num' && x.exp.v < 0) as Extract<Node, { k: 'pow' }>[];
    const shaped = below.length ? frac(mul(kept.filter(x => !below.includes(x as Extract<Node, { k: 'pow' }>))), mul(below.map(x => pow(x.base, num(-(x.exp as Extract<Node, { k: 'num' }>).v))))) : mul(kept);
    return done(shaped, `${name}${k === 1 ? '²' : ''}${k > 1 ? `^${2 * k}` : ''} = ${k > 1 ? '(' : ''}1 − ${other}²${k > 1 ? `)^${k}` : ''}, keeping one ${name} back`, 'trig identity');
  }
  // an odd power on the bottom (sin² x/cos³ x): × cos/cos makes it even, cos⁴ = (1 − sin²)², and u = sin x is ready
  // sec³ x is (1/cos x)³: read as 1/cos³ x
  const fq = f.k === 'pow' && f.base.k === 'frac' && f.exp.k === 'num' && Number.isInteger(f.exp.v) && f.exp.v > 0 ? frac(pow(fresh(f.base.num), num(f.exp.v)), pow(fresh(f.base.den), num(f.exp.v))) : f;
  if (fq.k === 'frac') {
    const tops = (fq.num.k === 'mul' ? fq.num.factors : [fq.num]).filter(x => !(x.k === 'pow' && x.base.k === 'num' && x.base.v === 1));
    for (const [name, other] of [['cos', 'sin'], ['sin', 'cos']] as const) {
      const p = powOfTrig(fq.den, name);
      if (!p || p.n % 2 === 0) continue;
      if (!tops.every(x => !dependsOn(x, v) || (powOfTrig(x, other) && key(powOfTrig(x, other)!.L) === key(p.L)))) continue;
      const k = (p.n + 1) / 2;
      const sq = add([num(1), neg(pow(fn(other, fresh(p.L)), num(2)))]);
      return done(frac(mul([...tops.map(fresh), fn(name, fresh(p.L))]), k === 1 ? sq : pow(sq, num(k))), `× ${name}/${name}: ${name}${k === 1 ? '²' : `^${2 * k}`} = ${k === 1 ? '' : '('}1 − ${other}²${k === 1 ? '' : `)^${k}`}`, 'trig identity');
    }
  }
  // two waves multiplied: sin A cos B = (sin(A + B) + sin(A − B))/2, and the like; sin x cos x is sin 2x/2
  const waves = fs.filter(x => x.k === 'fn' && (x.name === 'sin' || x.name === 'cos') && slope(x.arg, v) !== null);
  if (waves.length >= 2) {
    const [p, q] = waves as Extract<Node, { k: 'fn' }>[];
    const [s1, c1] = p.name === 'sin' || q.name !== 'sin' ? [p, q] : [q, p];
    const A = () => fresh(s1.arg), B = () => fresh(c1.arg);
    const sum = () => tidy(add([A(), B()])), diff = () => tidy(add([A(), neg(B())]));
    const pair = s1.name === 'sin' && c1.name === 'cos' ? add([fn('sin', sum()), fn('sin', diff())])
      : s1.name === 'cos' ? add([fn('cos', diff()), fn('cos', sum())])
      : add([fn('cos', diff()), neg(fn('cos', sum()))]);
    const rest = fs.filter(x => x !== p && x !== q).map(fresh);
    const h = newHints();
    return done(simplify(mul([...rest, frac(pair, num(2))]), h), s1.name === 'sin' && c1.name === 'cos' ? 'sin A cos B = (sin(A + B) + sin(A − B))/2' : s1.name === 'cos' ? 'cos A cos B = (cos(A − B) + cos(A + B))/2' : 'sin A sin B = (cos(A − B) − cos(A + B))/2', 'trig identity');
  }
  // even powers of both (sin² x cos² x): each by its half-angle identity, then multiply out
  const evens = fs.filter(x => (['sin', 'cos'] as const).some(nm => { const p = powOfTrig(x, nm); return !!p && p.n >= 2 && p.n % 2 === 0; }));
  if (evens.length >= 2 && fs.every(x => evens.includes(x) || !dependsOn(x, v))) {
    const half = (x: Node) => { const pw = x as Extract<Node, { k: 'pow' }>, b = pw.base as Extract<Node, { k: 'fn' }>, k = (pw.exp as Extract<Node, { k: 'num' }>).v / 2; const w = add([num(1), b.name === 'sin' ? neg(fn('cos', times(num(2), fresh(b.arg)))) : fn('cos', times(num(2), fresh(b.arg)))]); return [frac(num(1), num(2 ** k)), k === 1 ? w : pow(w, num(k))]; };
    const h = newHints();
    const next = simplify(expandAll(mul(fs.flatMap(x => (evens.includes(x) ? half(x) : [fresh(x)]))), h), h);
    return done(next, 'sin² = (1 − cos 2x)/2 and cos² = (1 + cos 2x)/2, then multiply out', 'trig identity');
  }
  // an even power alone (cos⁴ θ): the half-angle identity, then multiply out
  const ev = fs.findIndex(x => (['sin', 'cos'] as const).some(nm => { const p = powOfTrig(x, nm); return !!p && p.n >= 4 && p.n % 2 === 0; }));
  if (ev >= 0 && fs.every((x, j) => j === ev || !dependsOn(x, v))) {
    const x = fs[ev] as Extract<Node, { k: 'pow' }>, b = x.base as Extract<Node, { k: 'fn' }>, k = (x.exp as Extract<Node, { k: 'num' }>).v / 2;
    const halfAngle = add([num(1), b.name === 'sin' ? neg(fn('cos', times(num(2), fresh(b.arg)))) : fn('cos', times(num(2), fresh(b.arg)))]);
    const h = newHints();
    const next = simplify(expandAll(mul([...fs.filter((_, j) => j !== ev).map(fresh), frac(num(1), num(2 ** k)), pow(halfAngle, num(k))]), h), h);
    return done(next, `${b.name}² = (1 ${b.name === 'sin' ? '−' : '+'} cos 2θ)/2, then multiply out`, 'trig identity');
  }
  // the half angle read backwards under a root: √(c − c cos A) = √(2c)·|sin(A/2)|, √(c + c cos A) = √(2c)·|cos(A/2)|
  let root: Extract<Node, { k: 'sqrt' }> | null = null, out: Node | null = null;
  walk(f, n => {
    if (root || n.k !== 'sqrt' || n.arg.k !== 'add' || n.arg.terms.length !== 2 || !dependsOn(n, v)) return;
    const [a, b] = n.arg.terms;
    const [c, w] = a.k === 'num' ? [a, b] : b.k === 'num' ? [b, a] : [null, null];
    if (!c || !w || c.v <= 0) return;
    const k = w.k === 'fn' && w.name === 'cos' ? { s: 1, cs: w } : w.k === 'neg' && w.arg.k === 'fn' && w.arg.name === 'cos' ? { s: -1, cs: w.arg } : w.k === 'mul' && w.factors.length === 2 && w.factors[0].k === 'num' && w.factors[1].k === 'fn' && w.factors[1].name === 'cos' ? { s: w.factors[0].v, cs: w.factors[1] } : null;
    if (!k || Math.abs(Math.abs(k.s) - c.v) > 1e-12) return;
    root = n;
    out = mul([sqrtN(num(2 * c.v)), fn('abs', fn(k.s < 0 ? 'sin' : 'cos', tidy(frac(fresh(k.cs.arg), num(2)))))]);
  });
  if (root && out) {
    const r = root as Extract<Node, { k: 'sqrt' }>;
    return done(tidy(replace(f, r.id, out)), `1 ${r.arg.k === 'add' && toText(r.arg).includes('−') ? '− cos A = 2 sin²' : '+ cos A = 2 cos²'}(A/2), under the root`, 'trig identity');
  }
  return { error: 'No trig identity helps here.' };
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
  const lone = fs.length === 1 && fs[0].k === 'pow' && !dependsOn(fs[0].exp, v) ? fs[0].base : fs[0];
  // or a function of ln v (sin(ln x)): its slope times v is the same kind again, so it comes back
  let ofLn = false;
  walk(lone, n => { if (n !== lone && n.k === 'fn' && (n.name === 'ln' || n.name === 'log') && n.arg.k === 'sym' && n.arg.name === v) ofLn = true; });
  if (fs.length === 1 && LIATE(lone) > 1 && !(ofLn && lone.k === 'fn')) return { error: 'By parts needs a product (or a lone ln or inverse trig).' };
  const aimed = sel && sel !== 'eq' ? fs.find(f => f.id === sel) : undefined;
  const order = aimed ? [aimed] : [...fs].filter(f => dependsOn(f, v)).sort((a, b) => LIATE(a) - LIATE(b));
  for (const U of order) {
    const rest = fs.filter(f => f !== U);
    const dv = rest.length === 0 ? num(1) : rest.length === 1 ? rest[0] : mul(rest);
    const V = quick(dv, v) ?? quick(tidy(dv), v);
    if (!V) continue;
    const du = fresh(prettyDerivative(U, v));
    const def = !!(T.lo && T.hi);
    const uv = times(fresh(U), fresh(V.F));
    const vdu = tidy(times(fresh(V.F), du));
    const next = def ? plus(at(v, uv, fresh(T.lo!), fresh(T.hi!)), times(num(-1), int(v, vdu, fresh(T.lo!), fresh(T.hi!)))) : plus(uv, times(num(-1), int(v, vdu)));
    const r = checked(e, { eq: replace(e, T.id, next), label: `by parts: ${v === 'u' ? 'f' : 'u'} = ${toText(U)}`, hints: newHints(), factor: one, select: null, rule: 'by parts' });
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
  // an end at ±∞, or one where it has no value (x² ln x at 0), goes in as a limit from inside
  const side = (b: Node, keep: boolean, s: '+' | '-') => {
    const x = evaluate(b, env);
    if (!Number.isFinite(x)) return limOf(A, b);
    return Number.isFinite(evaluate(A.arg, { ...env, [A.v]: x })) || !symbols(A.arg).includes(A.v) ? substitute(keep ? A.arg : fresh(A.arg), A.v, b) : lim(A.v, fresh(b), fresh(A.arg), s);
  };
  // 0 to a power with a letter in it (x^(t+1) at x = 0) is 0 where the integral is defined: say where
  const conditions: string[] = [];
  const zeroPow = (n: Node): Node => {
    if (n.k === 'pow' && isNum(n.base, 0) && symbols(n.exp).length) { conditions.push(`${toText(n.exp)} > 0`); return num(0); }
    const ks = children(n);
    return ks.length ? withChildren(n, ks.map(zeroPow)) : n;
  };
  const next = plus(zeroPow(side(A.hi, true, '-')), times(num(-1), zeroPow(side(A.lo, false, '+'))));
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

