// The general moves on their own, and the techniques done by hand with them (no shortcut).
import { describe, it, expect, beforeEach } from 'vitest';
import { parseEquation, parseExpr } from '../src/engine/parse';
import { Eq, Node, walk, key, LETS, DEFS } from '../src/engine/ast';
import { isErr, MoveResult, applyBoth, applyMove } from '../src/engine/moves';
import { toText } from '../src/engine/print';
import { appearsIn, nameIt, subIn, differentialsBoth, putValue, integrateBoth, separateChain, characteristicChain } from '../src/engine/general';
import { bothSides, finishCalc } from '../src/engine/calcmoves';
import { simplify, newHints } from '../src/engine/simplify';
import { formsFor } from '../src/engine/forms';
import { intStep, byParts } from '../src/engine/integrate';

const T = (e: Eq) => toText(e);
const idOf = (e: Eq, text: string): string => {
  let id: string | null = null;
  walk(e, n => { if (!id && n.k !== 'eq' && toText(n) === text) id = n.id; });
  if (!id) throw new Error(`no ${text} in ${T(e)}`);
  return id;
};
const ok = (r: MoveResult): Eq => { if (isErr(r)) throw new Error(r.error); return r.eq; };

beforeEach(() => { LETS.clear(); DEFS.clear(); });

describe('name it', () => {
  it('a new letter for a piece: u = x², and x² is u here', () => {
    const e = parseEquation('int 2x cos(x^2) dx', true);
    const r = nameIt(e, idOf(e, 'x^2'), 'u');
    if ('error' in r) throw new Error(r.error);
    expect(T(r.def)).toBe('u = x^2');
    expect(T(r.step.eq)).toBe('∫ 2x cos(u) dx');
  });
  it('a number becomes a parameter, only where aimed', () => {
    const e = parseEquation('int_0^1 (x^2 - 1)/ln(x) dx', true);
    let two: string | null = null;
    walk(e, n => { if (!two && n.k === 'num' && n.v === 2) two = n.id; });
    const r = nameIt(e, two, 't');
    if ('error' in r) throw new Error(r.error);
    expect(T(r.def)).toBe('t = 2');
    expect(T(r.step.eq)).toContain('x^t');
  });
  it('a letter already in use is refused', () => {
    const e = parseEquation('x^2 + u = 3');
    expect('error' in nameIt(e, idOf(e, 'x^2'), 'u')).toBe(true);
  });
  it('an expression for a letter: x = sin θ', () => {
    const e = parseEquation('int sqrt(1 - x^2) dx', true);
    let x: string | null = null;
    walk(e, n => { if (!x && n.k === 'sym' && n.name === 'x') x = n.id; });
    const r = nameIt(e, x, 'sin(θ)');
    if ('error' in r) throw new Error(r.error);
    expect(T(r.def)).toBe('x = sin(θ)');
    expect(T(r.step.eq)).toContain('sin(θ)');
  });
  it('a guess for a function: y = e^(rx) puts its slopes in for y′ and y″', () => {
    const e = parseEquation("y'' - 3y' + 2y = 0");
    const r = nameIt(e, idOf(e, 'y'), 'e^(r x)');
    if ('error' in r) throw new Error(r.error);
    expect(T(r.step.eq)).not.toMatch(/y/);
  });
});

describe('u-substitution by hand: name it, differentials, sub in, integrate, sub back', () => {
  it('∫ 2x cos(x²) dx = sin(x²) + C', () => {
    let e = parseEquation('int 2x cos(x^2) dx', true);
    const n = nameIt(e, idOf(e, 'x^2'), 'u');
    if ('error' in n) throw new Error(n.error);
    e = n.step.eq;
    LETS.set('u', n.def.rhs);
    // integrating now, with u still tied to x, is refused
    expect(isErr(intStep(e, null))).toBe(true);
    const du = ok(differentialsBoth(n.def));
    expect(T(du)).toBe('du = 2x dx');
    e = ok(subIn(e, du, null, 'equation 2'));
    expect(T(e)).toBe('∫ cos(u) du');
    e = ok(intStep(e, null));
    expect(T(e)).toBe('sin(u) + C');
    e = ok(subIn(e, n.def, null, 'equation 2'));
    expect(T(e)).toBe('sin(x^2) + C');
  });
  it('a definite one moves its bounds with the name', () => {
    let e = parseEquation('int_0^2 x e^(x^2) dx', true);
    const n = nameIt(e, idOf(e, 'x^2'), 'u');
    if ('error' in n) throw new Error(n.error);
    LETS.set('u', n.def.rhs);
    e = ok(subIn(n.step.eq, ok(differentialsBoth(n.def)), null, 'equation 2'));
    expect(T(e)).toBe('∫_{0}^{4} e^u/2 du');
  });
});

describe('Feynman technique by hand', () => {
  it('∫₀¹ (x² − 1)/ln x dx = ln 3: parameter, I(t), d/dt both sides, Leibniz, ∫ back, find C', () => {
    let e = parseEquation('int_0^1 (x^2 - 1)/ln(x) dx', true);
    let two: string | null = null;
    walk(e, n => { if (!two && n.k === 'num' && n.v === 2) two = n.id; });
    const p = nameIt(e, two, 't');
    if ('error' in p) throw new Error(p.error);
    e = p.step.eq;
    const I = nameIt(e, e.lhs.id, 'I(t)');
    if ('error' in I) throw new Error(I.error);
    expect(T(I.def)).toBe('I(t) = ∫_{0}^{1} (x^t − 1)/ln(x) dx');
    expect(T(I.step.eq)).toBe('I(t)');
    DEFS.set('I', { param: 't', body: I.def.rhs });
    // d/dt both sides; Leibniz takes d/dt under the integral, and the one left is easy
    const work = (q: Eq) => { const f = finishCalc(q); if (f.stuck) throw new Error(f.stuck); return f.steps.length ? f.steps[f.steps.length - 1].eq : q; };
    const slope = work(ok(bothSides(I.def, 't')));
    expect(T(slope)).toBe('I′(t) = 1/(t + 1)');
    // ∫ both sides dt: I(t) = ln|t + 1| + C
    const back = work(ok(integrateBoth(slope, 't')));
    expect(T(back)).toBe('I(t) = ln|t + 1| + C');
    // the constant: I(0) two ways. From the definition it is ∫ 0 dx = 0
    const def0 = putValue(I.def, 't', '0');
    if ('error' in def0) throw new Error(def0.error);
    expect(T(def0)).toBe('I(0) = ∫_{0}^{1} (x^0 − 1)/ln(x) dx');
    const zero = work(def0);
    expect(T(zero)).toBe('I(0) = 0');
    const at0 = putValue(back, 't', '0');
    if ('error' in at0) throw new Error(at0.error);
    let call: string | null = null;
    walk(at0, n => { if (!call && n.k === 'call') call = n.id; });
    const c = ok(subIn(at0, zero, call, 'Equation 4'));
    expect(T(simplify(c, newHints()) as Eq)).toBe('0 = C');
    // C = 0 in, then t = 2: the integral we wanted
    let C: string | null = null;
    walk(back, n => { if (!C && n.k === 'sym' && n.name === 'C') C = n.id; });
    const done = ok(subIn(back, parseEquation('C = 0'), C, 'Equation 5'));
    const at2 = putValue(done, 't', '2');
    if ('error' in at2) throw new Error(at2.error);
    expect(T(simplify(at2, newHints()) as Eq)).toBe('I(2) = ln(3)');
  });
});

describe('techniques as chains of general moves', () => {
  it('integrating factor by hand: × e^(x²), expand, product rule backwards, ∫ both sides', () => {
    let e = parseEquation("y' + 2x y = x");
    e = ok(applyBoth(e, '* e^(x^2)'));
    e = formsFor(e, e.lhs.id).find(f => f.name === 'expanded')!.eq;
    const b = formsFor(e, e.lhs.id).find(f => f.name === 'product rule backwards');
    expect(b && T(b.eq)).toBe('d/dx(e^(x^2)y) = e^(x^2)x');
    const f = finishCalc(ok(integrateBoth(b!.eq, 'x')));
    expect(f.stuck).toBeUndefined();
    expect(T(f.steps[f.steps.length - 1].eq)).toBe('e^(x^2)y = e^(x^2)/2 + C');
  });
  it('product rule backwards on its own', () => {
    const q = parseEquation('e^x sin(x) + e^x cos(x)', true);
    expect(formsFor(q, q.lhs.id).some(f => f.name === 'product rule backwards')).toBe(true);
  });
  it('separating is a chain: y′ = x y gives dy/y = x dx', () => {
    const steps = separateChain(parseEquation("y' = x y"), 'y', 'x');
    if (!Array.isArray(steps)) throw new Error(steps.error);
    expect(T(steps[steps.length - 1].eq)).toBe('dy/y = x dx');
  });
  it('the characteristic equation is a chain: try y = e^(rx)', () => {
    const steps = characteristicChain(parseEquation("y'' - 3y' + 2y = 0"), 'y');
    if (!Array.isArray(steps)) throw new Error(steps.error);
    expect(T(steps[steps.length - 1].eq)).toMatch(/r\^2 − 3r \+ 2 = 0|\(r − 1\)\(r − 2\) = 0/);
  });
});

describe('both sides', () => {
  it('∫ both sides of a separated equation', () => {
    const e = parseEquation('dy/y = x dx');
    void e;
    const f = parseEquation("y' = 2x");
    const r = ok(integrateBoth(f, 'x'));
    expect(T(r)).toBe("∫ y′ dx = ∫ 2x dx");
    const s = ok(intStep(r, null));
    expect(T(s)).toBe('y = ∫ 2x dx');
  });
  it('putting a value into an equation to solve is refused', () => {
    expect('error' in putValue(parseEquation('x^2 = 4'), 'x', '3')).toBe(true);
  });
});
describe('found by the blind review', () => {
  it('u-sub where the inside takes every x: ∫ cos(3x) dx', () => {
    const e = parseEquation('int cos(3x) dx', true);
    const n = nameIt(e, idOf(e, '3x'), 'u');
    if ('error' in n) throw new Error(n.error);
    LETS.set('u', n.def.rhs);
    const d = ok(differentialsBoth(n.def));
    expect(T(ok(subIn(n.step.eq, d, null, 'Equation 2')))).toBe('∫ cos(u)/3 du');
  });
  it('by parts with a parameter, and over [0, ∞)', () => {
    expect(isErr(byParts(parseEquation('int sin(x) e^(-t x) dx', true), null))).toBe(false);
    expect(isErr(byParts(parseEquation('int_0^inf x e^(-x) dx', true), null))).toBe(false);
  });
  it('p on an identity with unknowns: partial fractions by putting in x = 1', () => {
    const r = putValue(parseEquation('1 = A(x+1) + B(x-1)'), 'x', '1');
    expect('error' in r ? r.error : T(r)).toBe('1 = A(1 + 1) + B(1 − 1)');
  });
  it('like terms inside a Σ cancel, and Σ 0 is 0', () => {
    expect(toText(simplify(parseExpr('sum_{k=2}^{n} (1/k - 1/k) + 1'), newHints()))).toBe('1');
    expect(toText(simplify(parseExpr('2/k + 3/k'), newHints()))).toBe('5/k');
  });
  it('definite trig substitution: x = sin θ moves the bounds to 0 and π/2', () => {
    const e = parseEquation('int_0^1 sqrt(1 - x^2) dx', true);
    const n = nameIt(e, idOf(e, 'x'), 'sin(θ)');
    if ('error' in n) throw new Error(n.error);
    expect(T(n.step.eq)).toBe(T(e));
    LETS.set('x', n.def.rhs);
    const c = ok(subIn(n.step.eq, ok(differentialsBoth(n.def)), null, 'Equation 2'));
    expect(T(c)).toBe('∫_{0}^{π/2} sqrt(1 − x^2) cos(θ) dθ');
    expect(T(ok(subIn(c, n.def, null, 'Equation 2')))).toBe('∫_{0}^{π/2} sqrt(1 − sin(θ)^2) cos(θ) dθ');
  });
  it('forms: |u| on a range, the triangle, the top rationalized, ∫ constant out', () => {
    const names = (src: string, pick: (n: Node) => boolean) => { const q = parseEquation(src, true); let id: string | null = null; walk(q, m => { if (!id && pick(m)) id = m.id; }); return formsFor(q, id).map(f => f.name + ': ' + T(f.eq)); };
    expect(names('abs(cos(θ))', n => n.k === 'fn' && n.name === 'abs')).toContain('without | |, where ≥ 0: cos(θ)');
    expect(names('cos(asin(x))', n => n.k === 'fn' && n.name === 'cos')).toContain('from the triangle: sqrt(1 − x^2)');
    expect(names('lim_(x->0) (sqrt(x+1) - 1)/x', n => n.k === 'frac').some(f => f.startsWith('top rationalized'))).toBe(true);
    expect(names('int -e^x sin(x) dx', n => n.k === 'int')).toContain('constant out: −∫ e^x sin(x) dx');
  });
  it('a minus goes through a bracket; 4/3 π r³ reads as (4/3)·π r³', () => {
    const q = parseEquation('2x - (5 - x) = 1');
    expect(T(ok(applyMove('distribute', q, idOf(q, '5 − x'))))).toBe('2x − 5 + x = 1');
    expect(toText(parseExpr('4/3 pi r^3'))).toBe('(4/3)πr^3');
    expect(toText(parseExpr('1/2x'))).toBe('1/(2x)');
  });
  it('∫ both sides of differentials integrates each side in its own letter', () => {
    expect(T(ok(integrateBoth(parseEquation('dy/y = x dx'), 'x')))).toBe('∫ 1/y dy = ∫ x dx');
  });
});
void key; void ({} as Node);

describe('p refuses a value that makes a bottom 0 (playtest A13)', () => {
  it('says which bottom', () => {
    const e = parseEquation('5x^2 + 8 = 2x(x+1)^2 (A/x + B/(x+1))');
    const r = putValue(e, 'x', '0');
    expect('error' in r && r.error).toMatch(/x = 0 makes .* 0/);
    expect('error' in putValue(e, 'x', '1')).toBe(false);
  });
});

describe('sub in a value of a function (K42)', () => {
  const def = (src: string) => { const d = parseEquation(src); if (d.lhs.k === 'call' && d.lhs.arg.k === 'sym') DEFS.set(d.lhs.name, { param: d.lhs.arg.name, body: d.rhs }); };
  it('I(0) = 0 goes into I(0) = ln|0 + 1| + C, aimed or not', () => {
    def('I(t) = int_0^1 (x^t - 1)/ln(x) dx');
    const e = parseEquation('I(0) = ln|0 + 1| + C'), src = parseEquation('I(0) = 0');
    expect(appearsIn(e, src)).toBe(true);
    expect(T(ok(subIn(e, src, null, 'Equation 3')))).toBe('0 = ln|0 + 1| + C');
    expect(T(ok(subIn(e, src, idOf(e, 'I(0)'), 'Equation 3')))).toBe('0 = ln|0 + 1| + C');
  });
  it('f(2) = 5 goes into an equation holding f(2), either way round', () => {
    def('f(x) = x^2 + 1');
    const e = parseEquation('y = 3f(2) - 1');
    expect(T(ok(subIn(e, parseEquation('5 = f(2)'), null, 'Equation 2')))).toBe('y = 3·5 − 1');
  });
  it('an equation sharing nothing does not appear', () => {
    expect(appearsIn(parseEquation('y = 2x'), parseEquation('z = 4'))).toBe(false);
  });
});

describe('∫ both sides only follows from an equation true for every value (player, 2026-11-28)', () => {
  it('refuses on an equation solved by particular x: e^(2x) − e^x − 132 = 0 is not an identity', () => {
    const r = integrateBoth(parseEquation('e^(2x) - e^x - 132 = 0'), 'x');
    expect(isErr(r) && r.error).toMatch(/only at some x/);
  });
  it('still takes an identity in x, and an equation about y(x)', () => {
    expect(isErr(integrateBoth(parseEquation('2x + 2 = 2(x + 1)'), 'x'))).toBe(false);
    expect(isErr(integrateBoth(parseEquation("y' = 2x"), 'x'))).toBe(false);
  });
});

describe('sub in du cancels what is left of the old letter (player, 2026-11-28)', () => {
  it('∫ (x + 1)/(x² + 2x + 5) dx with u = x² + 2x + 5 becomes ∫ 1/(2u) du', () => {
    LETS.set('u', parseExpr('x^2 + 2x + 5'));
    try {
      const r = subIn(parseEquation('F = int (x + 1)/u dx'), parseEquation('du = (2x + 2) dx'), null, 'the name');
      expect(isErr(r) ? r.error : toText(r.eq)).toMatch(/^F = ∫ 1\/\(2u\) du$/);
    } finally { LETS.delete('u'); }
  });
});

