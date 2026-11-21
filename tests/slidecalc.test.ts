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
