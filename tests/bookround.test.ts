// Book problems that e couldn't finish (playtest round 2026-11-22, K22–K25): each guard names the
// general mechanic, with a problem from the bank and a sibling it never saw.
import { describe, it, expect } from 'vitest';
import { parseEquation, parseExpr } from '../src/engine/parse';
import { evaluate, Eq } from '../src/engine/ast';
import { toText } from '../src/engine/print';
import { partialFractions, slopeSplit } from '../src/engine/polytools';
import { finishCalc, plugIn, divideHighest, conjugateLim, asQuotient } from '../src/engine/calcmoves';
import { uSub } from '../src/engine/integrate';
import { isErr } from '../src/engine/moves';
import '../src/engine/calculus';

const T = (e: Eq) => toText(e);
const same = (a: string, b: string) => [0.7, 1.3, 2.9, -0.4].every(x => Math.abs(evaluate(parseExpr(a), { x }) - evaluate(parseExpr(b), { x })) < 1e-9);
const last = (s: string) => { const f = finishCalc(parseEquation(s, true)); if (f.stuck) throw new Error(f.stuck); return f.steps[f.steps.length - 1].eq; };
const value = (s: string) => evaluate(last(s).rhs, {});

describe('fractions over a quadratic with no rational roots (K22)', () => {
  it('partial fractions keep (Bx + C)/q pieces, for q, q², and two quadratics', () => {
    for (const s of ['1/(x^3 + x)', '(2x^2 + 3)/(x(x^2 + 1))', '1/((x^2+1)(x^2+4))', '(x^3 + 1)/(x(x^2+1)^2)', '1/((x-1)(x^2+x+1))']) {
      const r = partialFractions(parseExpr(s));
      expect(r, s).not.toBeNull();
      expect(same(s, toText(r!)), s).toBe(true);
    }
    expect(toText(partialFractions(parseExpr('1/(x^3 + x)'))!)).toBe('1/x − x/(x^2 + 1)');
  });
  it('(Bx + C)/quadratic splits into the slope over it plus a number over it, and e finishes', () => {
    expect(toText(slopeSplit(parseExpr('x/(x^2 + 2x + 5)'))!)).toBe('(1/2)((2x + 2)/(x^2 + 2x + 5)) − 1/(x^2 + 2x + 5)');
    expect(slopeSplit(parseExpr('(x + 1)/(x^2 + 2x + 5)'))).toBeNull();
    expect(T(last('y = int (3x + 1)/(x^2 + 4) dx'))).toContain('tan⁻¹');
  });
  it('u-sub sees through a constant multiple of the slope: (x + 1)/(x² + 2x + 5) is ½ du/u', () => {
    const r = uSub(parseEquation('y = int (x + 1)/(x^2 + 2x + 5) dx'), null).move;
    expect(isErr(r) ? r.error : T(r.eq)).toBe('y = ∫ 1/(2u) du');
  });
});

describe('limits toward ∞: forms are worked on, not plugged into (K23)', () => {
  it('plug in refuses ∞/∞, 0·∞, ∞ − ∞ and 1^∞ and names the form', () => {
    for (const [s, form] of [['y = lim x->inf (2x^2 + 1)/(x^2 - 3)', '∞/∞'], ['y = lim x->inf x e^(-x)', '0·∞'], ['y = lim x->inf (sqrt(x^2 + x) - x)', '∞ − ∞'], ['y = lim x->inf (1 + 1/x)^x', '1^∞']]) {
      const r = plugIn(parseEquation(s, true), null);
      expect(isErr(r) && r.error, s).toContain(form);
    }
  });
  it('what plugging in gives can be π/2, e or ∞', () => {
    const p = (s: string) => { const r = plugIn(parseEquation(s, true), null); return isErr(r) ? r.error : T(r.eq); };
    expect(p('y = lim x->inf atan(x)')).toBe('y = π/2');
    expect(p('y = lim x->inf x e^(1/x)')).toBe('y = ∞');
  });
  it('÷ the highest power, the conjugate, and 0·∞ with the simpler factor underneath', () => {
    const d = divideHighest(parseEquation('y = lim x->-inf (3x + 1)/sqrt(4x^2 + 1)', true), null);
    expect(isErr(d) ? d.error : T(d.eq)).toBe('y = lim_{x→−∞} (−3 − 1/x)/sqrt(4 + 1/(x^2))');
    const c = conjugateLim(parseEquation('y = lim x->inf (sqrt(x^2 + x) - x)', true), null);
    expect(isErr(c) ? c.error : T(c.eq)).toBe('y = lim_{x→∞} x/(sqrt(x^2 + x) + x)');
    const q = asQuotient(parseEquation('y = lim x->inf -x e^(-x)', true), null);
    expect(isErr(q) ? q.error : T(q.eq)).toBe('y = lim_{x→∞} (−x/(e^x))');
    expect(isErr(divideHighest(parseEquation('y = lim x->inf ln(x)/x', true), null))).toBe(true);
    expect(value('y = lim x->inf (sqrt(x^2 + 3x) - x)')).toBeCloseTo(1.5, 9);
    expect(value('y = lim x->inf x^2 e^(-x)')).toBe(0);
    expect(value('y = lim x->inf e^x/x^2')).toBe(Infinity);
  });
});

describe('|g| between bounds, and ends where it has no value (K24)', () => {
  it('splits where g turns, then each piece is ±g', () => {
    expect(value('y = int_0^2 abs(x - 1) dx')).toBeCloseTo(1, 12);
    expect(value('y = int_0^pi abs(cos(x)) dx')).toBeCloseTo(2, 12);
    expect(value('y = int_0^3 abs(x^2 - 2) dx')).toBeCloseTo(3 + 8 * Math.SQRT2 / 3, 10);
  });
  it('an end with no value goes in as a one-sided limit, and e finishes it', () => {
    expect(value('y = int_0^4 x ln(4x) dx')).toBeCloseTo(8 * Math.log(16) - 4, 9);
    expect(value('y = int_0^1 ln(x) dx')).toBeCloseTo(-1, 9);
  });
});
