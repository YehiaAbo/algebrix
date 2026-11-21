// Integrals from the OpenStax bank that e used to stop on (playtest/problems/openstax-calc*.txt)
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { finishCalc } from '../src/engine/calcmoves';
import { evaluate } from '../src/engine/ast';

const run = (s: string) => { const r = finishCalc(parseEquation(s, true)); expect(r.stuck).toBeUndefined(); return r.steps[r.steps.length - 1].eq.lhs; };
/** an antiderivative: its slope matches the integrand */
const slopeOk = (s: string, f: (x: number) => number) => {
  const F = run(s), h = 1e-5;
  for (const x of [0.4, 0.9, 1.3]) expect((evaluate(F, { x: x + h, C: 0 }) - evaluate(F, { x: x - h, C: 0 })) / (2 * h)).toBeCloseTo(f(x), 4);
};

describe('integrals the bank found', () => {
  it('an odd power of sin keeps one back: sin³ x', () => slopeOk('int sin^3 x dx', x => Math.sin(x) ** 3));
  it('sin⁵ x cos² x, then the polynomial is multiplied out, not done by parts', () => slopeOk('int sin^5 x cos^2 x dx', x => Math.sin(x) ** 5 * Math.cos(x) ** 2));
  it('sec x tan x is sin x/cos² x', () => slopeOk('int sec x tan x dx', x => Math.sin(x) / Math.cos(x) ** 2));
  it('csc² is −cot, and fine up to π/2', () => expect(evaluate(run('int_(pi/4)^(pi/2) csc^2 θ dθ'), {})).toBeCloseTo(1, 9));
  it('(ln x)² by parts with dv = dx', () => slopeOk('int (ln x)^2 dx', x => Math.log(x) ** 2));
  it('sec x is ln|sec + tan|', () => slopeOk('int sec x dx', x => 1 / Math.cos(x)));
  it('tan² x = sec² x − 1', () => slopeOk('int tan(x)^2 dx', x => Math.tan(x) ** 2));
  it('u = eˣ sees e^(2x) as u²', () => slopeOk('int e^x/(1 + e^(2x)) dx', x => Math.exp(x) / (1 + Math.exp(2 * x))));
  it('u = x² sees the x² left in x³ e^(x²)', () => slopeOk('int x^3 e^(x^2) dx', x => x ** 3 * Math.exp(x * x)));
  it('product to sum: cos 2x cos x', () => slopeOk('int cos(2x) cos(x) dx', x => Math.cos(2 * x) * Math.cos(x)));
  it('x sin x cos x is x sin 2x/2, then by parts', () => slopeOk('int x sin(x) cos(x) dx', x => x * Math.sin(x) * Math.cos(x)));
  it('sin² x cos² x by both half-angles', () => slopeOk('int sin(x)^2 cos(x)^2 dx', x => (Math.sin(x) * Math.cos(x)) ** 2));
  it('trig substitution: √(9 − x²)', () => slopeOk('int sqrt(9 - x^2) dx', x => Math.sqrt(9 - x * x)));
  it('completing the square: 2/(x² + 2x + 10)', () => slopeOk('int 2/(x^2 + 2x + 10) dx', x => 2 / (x * x + 2 * x + 10)));
  it('× e⁻ˣ/e⁻ˣ on 1/(1 + eˣ)', () => slopeOk('int 1/(1 + e^x) dx', x => 1 / (1 + Math.exp(x))));
  it('an end where the inside blows up but the area is finite: ∫₀² 1/√(4 − x²)', () => expect(evaluate(run('int_(0)^(2) 1/sqrt(4 - x^2) dx'), {})).toBeCloseTo(Math.PI / 2, 9));
});
