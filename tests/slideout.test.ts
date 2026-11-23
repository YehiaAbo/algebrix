// Shift ← → pushes ANY factor out of what holds it, not only numbers, from either end, and back in:
// √(ab) = √a √b with the conditions it needs, |ab| = |a||b|, ln(ab), (ab)ⁿ, a^(mn) = (a^m)^n, and the
// same base joining a^m a^n = a^(m + n). The safety net still decides; a refusal says what is needed.
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { walk } from '../src/engine/ast';
import { applyMove, isErr } from '../src/engine/moves';

const go = (src: string, piece: string, dir: 'slideL' | 'slideR', nth = 0) => {
  const e = parseEquation(src, true); const hits: string[] = [];
  walk(e, n => { if (n.k !== 'eq' && toText(n) === piece) hits.push(n.id); });
  if (!hits[nth]) throw new Error(`no ${piece} in ${toText(e)}`);
  const r = applyMove(dir, e, hits[nth]);
  return isErr(r) ? `error: ${r.error}` : `${toText(r.eq)}${r.conditions?.length ? ` | ${r.conditions.join('; ')}` : ''}`;
};
const S = 'sum_(n=1)^99 sqrt(n + sqrt(n^2-1))/(n + sqrt((n+1)(n-1)))';

describe('out of a root, any factor', () => {
  it('the user’s sum: (n + 1) out to the left, (n − 1) out to the right, no condition since n runs 1 to 99', () => {
    const want = 'Σ_{n=1}^{99} sqrt(n + sqrt(n^2 − 1))/(n + sqrt(n + 1) sqrt(n − 1))';
    expect(go(S, 'n + 1', 'slideL')).toBe(want);
    expect(go(S, 'n − 1', 'slideR')).toBe(want);
  });
  it('with free letters it says what it needs', () => {
    expect(go('y = sqrt((x+1)(x-1))', 'x + 1', 'slideL')).toBe('y = sqrt(x + 1) sqrt(x − 1) | x + 1 ≥ 0; x − 1 ≥ 0');
    expect(go('y = sqrt(x^2 y)', 'x^2', 'slideL')).toBe('y = sqrt(x^2) sqrt(y) | y ≥ 0');
  });
  it('a root joins a root next to it, and a letter goes in only when it is ≥ 0', () => {
    expect(go('y = sqrt(x) sqrt(y)', 'sqrt(x)', 'slideR')).toBe('y = sqrt(xy)');
    expect(go('y = sqrt(x) sqrt(y)', 'sqrt(y)', 'slideL')).toBe('y = sqrt(xy)');
    expect(go('y = x sqrt(y)', 'x', 'slideR')).toMatch(/^error: a√b = √\(a²b\) needs x ≥ 0/);
  });
});

describe('out of |…|, ln, powers and exponents', () => {
  it('|ab| = |a||b| for any a, from either end', () => {
    expect(go('y = |x y|', 'x', 'slideL')).toBe('y = |x|·|y|');
    expect(go('y = |x y|', 'y', 'slideR', 1)).toBe('y = |x|·|y|');
  });
  it('ln and powers, from the right too', () => {
    expect(go('y = ln(x y)', 'y', 'slideR', 1)).toBe('y = ln(x) + ln(y) | y > 0; x > 0');
    expect(go('y = (x y)^3', 'y', 'slideR', 1)).toBe('y = x^3y^3');
    expect(go('y = e^(x + 2)', '2', 'slideR')).toBe('y = e^xe^2');
  });
  it('a factor of an exponent comes out as the outer power', () => {
    expect(go('y = e^(2x)', '2', 'slideL')).toBe('y = (e^x)^2');
    expect(go('y = e^(x 2)', '2', 'slideR')).toBe('y = (e^x)^2');
  });
  it('the same base joins: the powers add', () => {
    expect(go('y = x^2 x^3', 'x^2', 'slideR')).toBe('y = x^(2 + 3)');
    expect(go('y = x x^3', 'x', 'slideR')).toBe('y = x^(1 + 3)');
    expect(go('y = 2^x 2', '2', 'slideL', 1)).toBe('y = 2^(x + 1)');
    expect(go('y = x^3 y^3', 'x^3', 'slideR')).toBe('y = y^3x^3');
  });
  it('in from the right, like from the left', () => {
    expect(go('y = (1/2) x', 'x', 'slideL')).toBe('y = x/2');
    expect(go('y = int x^2 dx 3', '3', 'slideL')).toBe('y = ∫ x^2·3 dx');
  });
});
