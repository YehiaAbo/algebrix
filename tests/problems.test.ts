// The "done enough" bar for the algebra engine: 50 classic problems that must solve
// completely by the engine's own moves (e + i in the app), with no extraneous answers.
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { solveAll } from '../src/engine/solve';

const S = Math.sqrt;
const PROBLEMS: [string, number[] | string][] = [
  // linear
  ['3x + 7 = 22', [5]], ['2(x - 3) = 10', [8]], ['5x - 2 = 3x + 8', [5]], ['x/3 + 2 = 5', [9]],
  ['(2x + 1)/5 = 3', [7]], ['x/2 + x/3 = 10', [12]], ['0.5x + 1.5 = 4', [5]], ['4 - (x + 2) = 3x', [0.5]],
  ['7 = 3 - 2x', [-2]], ['3(x + 1) - 2(x - 1) = 9', [4]],
  // quadratic and polynomial
  ['x^2 = 9', [-3, 3]], ['x^2 + 5x + 6 = 0', [-3, -2]], ['x^2 - 4x = 0', [0, 4]], ['2x^2 - 8 = 0', [-2, 2]],
  ['x^2 + 2x - 1 = 0', [-1 - S(2), -1 + S(2)]], ['x^2 = 2x + 15', [-3, 5]], ['(x - 1)(x + 4) = 0', [-4, 1]],
  ['x^2 - 6x + 9 = 0', [3]], ['3x^2 = 12x', [0, 4]], ['x(x + 1) = 12', [-4, 3]],
  // rational
  ['1/x = 4', [0.25]], ['3/(x - 1) = 6', [1.5]], ['x/(x + 2) = 3', [-3]], ['2/x + 1 = 3', [1]],
  ['(x + 1)/(x - 1) = 2', [3]],
  // roots and absolute value
  ['sqrt(x) = 4', [16]], ['sqrt(x + 5) = 3', [4]], ['sqrt(x + 1) = x - 1', [3]], ['|x - 2| = 5', [-3, 7]],
  ['|2x + 1| = 7', [-4, 3]], ['cbrt(x) = 2', [8]],
  // exponentials and logs
  ['2^x = 32', [5]], ['e^x = 5', [Math.log(5)]], ['ln(x) = 2', [Math.exp(2)]], ['10^x = 1000', [3]],
  ['3e^(2x) = 12', [Math.log(4) / 2]], ['log(x) = 2', [100]], ['ln(x + 1) = 0', [0]],
  // trig (principal values)
  ['2sin(x) = 1', [Math.PI / 6]], ['cos(x) = 0', [Math.PI / 2]], ['tan(x) = 1', [Math.PI / 4]],
  // inequalities
  ['2x + 3 < 7', 'x ∈ (−∞, 2)'], ['-3x >= 9', 'x ∈ (−∞, −3]'], ['x^2 - 5x + 6 > 0', 'x ∈ (−∞, 2) ∪ (3, ∞)'],
  ['x^2 <= 4', 'x ∈ [−2, 2]'], ['(x - 1)/(x + 2) >= 0', 'x ∈ (−∞, −2) ∪ [1, ∞)'], ['x^2 + 1 < 0', 'no solution'],
  ['|x - 1| < 3', 'x ∈ (−2, 4)'], ['1/x > 2', 'x ∈ (0, 1/2)'], ['x^3 > x', 'x ∈ (−1, 0) ∪ (1, ∞)'],
];

describe('done-enough problem set', () => {
  it('has 50 problems', () => expect(PROBLEMS.length).toBe(50));
  it.each(PROBLEMS)('%s', (src, want) => {
    const r = solveAll(parseEquation(src), 'x');
    if ('error' in r) throw new Error(r.error);
    if (typeof want === 'string') expect(r.text).toBe(want);
    else {
      expect(r.values.length).toBe(want.length);
      want.forEach((w, i) => expect(r.values[i]).toBeCloseTo(w, 6));
    }
  });
});
