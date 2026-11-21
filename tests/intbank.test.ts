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
});
