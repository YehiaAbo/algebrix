// Tab e, compare coefficients: an identity in x becomes one equation per power of x
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { compareCoefficients } from '../src/engine/systems';
import { isErr, MoveOk } from '../src/engine/moves';

describe('compare coefficients', () => {
  it('partial fractions by hand: 1 = A(x + 2) + B(x + 1)', () => {
    const r = compareCoefficients(parseEquation('1 = A(x + 2) + B(x + 1)'), 'x');
    expect(isErr(r.first)).toBe(false);
    expect([toText((r.first as MoveOk).eq), ...r.rest.map(q => toText(q))]).toEqual(['0 = A + B', '1 = 2A + B']);
  });
  it('a quadratic identity', () => {
    const r = compareCoefficients(parseEquation('x^2 + 3x + 5 = a x^2 + b x + c'), 'x');
    expect(r.rest.length).toBe(2);
  });
  it('says when the numbers already disagree', () => {
    const r = compareCoefficients(parseEquation('x + 1 = A x + 2'), 'x');
    expect(isErr(r.first) && r.first.error).toMatch(/don't match/);
  });
});
