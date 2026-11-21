// Equations from the OpenStax bank that e used to stop on (playtest/problems/openstax-algebra.txt)
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { solveAll } from '../src/engine/solve';

const sols = (s: string, v = 'x') => { const r = solveAll(parseEquation(s), v); if ('error' in r) throw new Error(r.error); return r.values.map(x => +x.toFixed(9)); };

describe('solving what the bank found', () => {
  it('a quadratic in eˣ factors as one, and the eˣ = −2 case has no answer', () => expect(sols('e^(2x) - e^x - 6 = 0')).toEqual([+Math.log(3).toFixed(9)]));
  it('a quadratic in x^(1/3)', () => expect(sols('x^(2/3) - 5x^(1/3) + 6 = 0')).toEqual([8, 27]));
  it('a case with no real answer drops out instead of ending it', () => expect(sols('(x^2 - 1)^2 + (x^2 - 1) - 12 = 0')).toEqual([-2, 2]));
  it('the same log each side', () => expect(sols('log_9(3 - x) = log_9(4x - 8)')).toEqual([2.2]));
  it('a log of a product comes apart after ln both sides', () => expect(sols('2^(-3n) (1/4) = 2^(n + 2)', 'n')).toEqual([-1]));
  it('two roots: one across, square, the last root alone, square again', () => expect(sols('sqrt(3x + 7) + sqrt(x + 2) = 1')).toEqual([-2]));
  it('a log base 2 on each term: × ln 2, then one log', () => expect(sols('log_2(x) + log_2(x + 2) = 3')).toEqual([2]));
  it('a quadratic in √x', () => expect(sols('x - 5 sqrt(x) + 6 = 0')).toEqual([4, 9]));
  it('a difference of roots', () => expect(sols('sqrt(x + 5) - sqrt(x) = 1')).toEqual([4]));
});
