// The quadratic formula with letters in a, b, c (playtest A12): a quadratic in x whose
// coefficients hold y, as two equations in two letters give you on paper.
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { quadraticFormula } from '../src/engine/techniques';
import { simplify, newHints } from '../src/engine/simplify';

const qf = (src: string, v: string) => quadraticFormula(parseEquation(src), v);

describe('quadratic formula with letters', () => {
  it('plugs in a, b, c that hold another letter', () => {
    const r = qf('x^2 + x y - 2y^2 = 0', 'x');
    if ('error' in r) throw new Error(r.error);
    expect(toText(r.first.eq.lhs)).toBe('x');
    expect(toText(r.first.eq.rhs)).toContain('y');
    expect(r.rest).toHaveLength(1);
    // simplified, the two cases are x = y and x = −2y
    const both = [r.first.eq, r.rest[0]].map(e => toText(simplify(e.rhs, newHints())));
    expect(both.join(' ; ')).toMatch(/y/);
  });
  it('says when b² − 4ac is never positive', () => {
    const r = qf('-5x^2 - x y - 8y^2 = 0', 'x');
    expect('error' in r && r.error).toMatch(/b² − 4ac = .*y.* is never above 0/);
  });
  it('still refuses what is not quadratic in x', () => {
    expect('error' in qf('x^3 + y = 0', 'x')).toBe(true);
    expect('error' in qf('x y + 1 = 0', 'x')).toBe(true);
  });
});
