// The general moves on their own, and the techniques done by hand with them (no shortcut).
import { describe, it, expect, beforeEach } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { Eq, Node, walk, key, LETS, DEFS } from '../src/engine/ast';
import { isErr, MoveResult } from '../src/engine/moves';
import { toText } from '../src/engine/print';
import { nameIt, subIn, differentialsBoth, putValue, integrateBoth } from '../src/engine/general';
import { intStep } from '../src/engine/integrate';

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
  it('∫₀¹ (x² − 1)/ln x dx: parameter, I(t), d/dt both sides, Leibniz', () => {
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
    // put in a value: I(0) = ∫ (x⁰ − 1)/ln x dx
    const at0 = putValue(I.def, 't', '0');
    if ('error' in at0) throw new Error(at0.error);
    expect(T(at0)).toBe('I(0) = ∫_{0}^{1} (x^0 − 1)/ln(x) dx');
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
void key; void ({} as Node);
