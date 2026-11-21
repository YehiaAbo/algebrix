// Shift + ← → slides a constant out of or into ∫, Σ, d/dx and lim, and d/dt into ∫ (Leibniz),
// the same key that reorders (user: calculus should be as hands-on as algebra).
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { walk } from '../src/engine/ast';
import { applyMove, isErr } from '../src/engine/moves';

const slideOf = (src: string, piece: string, dir: 'slideL' | 'slideR', nth = 0) => {
  const e = parseEquation(src, !src.includes('='));
  const hits: string[] = [];
  walk(e, n => { if (n.k !== 'eq' && toText(n) === piece) hits.push(n.id); });
  if (!hits[nth]) throw new Error(`no ${piece} in ${toText(e)}`);
  const r = applyMove(dir, e, hits[nth]);
  return isErr(r) ? `error: ${r.error}` : toText(r.eq);
};

describe('constants slide out of and into calculus', () => {
  it('out of an integral, to the left', () => {
    expect(slideOf('int 3x^2 dx', '3', 'slideL')).toBe('3 ∫ x^2 dx');
  });
  it('out of a sum and a derivative', () => {
    expect(slideOf('sum_(n=1)^10 5n = y', '5', 'slideL')).toBe('5 Σ_{n=1}^{10} n = y');
    expect(slideOf('d/dx (4 sin(x)) = y', '4', 'slideL')).toBe('4 d/dx(sin(x)) = y');
  });
  it('back in, to the right', () => {
    expect(slideOf('3 int x^2 dx', '3', 'slideR')).toBe('∫ 3x^2 dx');
  });
  it('refuses what depends on the letter', () => {
    expect(slideOf('int x sin(x) dx', 'x', 'slideL')).toMatch(/^error: .*depends on x/);
    expect(slideOf('x int sin(x) dx', 'x', 'slideR')).toMatch(/^error: .*depends on x/);
  });
});

describe('Leibniz: d/dt slides into an integral and back out', () => {
  it('in', () => {
    expect(slideOf('d/dt int_0^1 x^t dx = y', 'd/dt(∫_{0}^{1} x^t dx)', 'slideR')).toBe('∫_{0}^{1} ∂/∂t(x^t) dx = y');
  });
  it('out', () => {
    expect(slideOf('int_0^1 ∂/∂t(x^t) dx = y', '∫_{0}^{1} ∂/∂t(x^t) dx', 'slideL')).toBe('d/dt(∫_{0}^{1} x^t dx) = y');
  });
  it('not when a bound moves with t', () => {
    expect(slideOf('d/dt int_0^t x^2 dx = y', 'd/dt(∫_{0}^{t} x^2 dx)', 'slideR')).toMatch(/^error/);
  });
});

describe('Shift through everything (user: fractions, roots, powers, anything)', () => {
  it('out of a fraction, from the top or the bottom', () => {
    expect(slideOf('(3x)/5 = y', '3', 'slideL')).toBe('3(x/5) = y');
    expect(slideOf('x/(2y) = 1', '2', 'slideL')).toBe('(1/2)(x/y) = 1');
  });
  it('one level per press: out of the fraction, then out of the integral', () => {
    const e1 = slideOf('int (3x)/2 dx = y', '3', 'slideL');
    expect(e1).toBe('∫ 3(x/2) dx = y');
    expect(slideOf(e1, '3', 'slideL')).toBe('3 ∫ x/2 dx = y');
  });
  it('into a fraction', () => {
    expect(slideOf('3(x/5) = y', '3', 'slideR')).toBe('3x/5 = y');
  });
  it('out of a root, a power, an absolute value, a log, an exponent', () => {
    expect(slideOf('sqrt(4x) = 6', '4', 'slideL')).toBe('sqrt(4) sqrt(x) = 6');
    expect(slideOf('(3x)^2 = 36', '3', 'slideL')).toBe('3^2x^2 = 36');
    expect(slideOf('|3x| = 6', '3', 'slideL')).toBe('3·|x| = 6');
    expect(slideOf('ln(3x) = 2', '3', 'slideL')).toBe('ln(3) + ln(x) = 2');
    expect(slideOf('e^(2 + x) = y', '2', 'slideL')).toBe('e^2e^x = y');
  });
  it('into a root and an absolute value', () => {
    expect(slideOf('3 sqrt(x) = 6', '3', 'slideR')).toBe('sqrt(3^2x) = 6');
    expect(slideOf('3|x| = 6', '3', 'slideR')).toBe('|3x| = 6');
  });
  it('refuses a negative out of a root', () => {
    expect(slideOf('sqrt(-4x) = 6', '−4', 'slideL')).toMatch(/^error/);
  });
});
