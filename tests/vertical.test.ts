// Shift + ↑ / ↓: a piece moves up or down through the notation. Across the fraction bar its
// power changes sign; a power comes down off a log and a coefficient goes up into one; a bound
// goes over to the other end and the integral turns round. Every one is checked.
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { walk } from '../src/engine/ast';
import { applyMove, isErr } from '../src/engine/moves';

const go = (src: string, piece: string, dir: 'lift' | 'drop', nth = 0) => {
  const e = parseEquation(src, !src.includes('='));
  const hits: string[] = [];
  walk(e, n => { if (n.k !== 'eq' && toText(n) === piece) hits.push(n.id); });
  if (!hits[nth]) throw new Error(`no ${piece} in ${toText(e)}`);
  const r = applyMove(dir, e, hits[nth]);
  return isErr(r) ? `error: ${r.error}` : toText(r.eq);
};

describe('Shift + ↑ ↓ across the fraction bar', () => {
  it('a factor under the bar comes up with its power negated, and goes back down', () => {
    expect(go('y = 1/x^2', 'x^2', 'lift')).toBe('y = x^(−2)');
    expect(go('y = 3/(x^2 y)', 'x^2', 'lift')).toBe('y = 3x^(−2)/y');
    expect(go('y = x^(-2) z', 'x^(−2)', 'drop')).toBe('y = z/(x^2)');
    expect(go('y = e^(-x) z', 'e^(−x)', 'drop')).toBe('y = z/(e^x)');
  });
  it('a factor on top goes below as its reciprocal', () => {
    expect(go('y = (a b)/c', 'b', 'drop')).toBe('y = a/(cb^(−1))');
    expect(go('y = (x+1)/(x-1)', 'x + 1', 'drop')).toBe('y = 1/((x − 1)(x + 1)^(−1))');
  });
  it('says which way is open when the piece is already there', () => {
    expect(go('y = (a b)/c', 'b', 'lift')).toMatch(/already on top/);
    expect(go('y = 1/x^2', 'x^2', 'drop')).toMatch(/already below/);
    expect(go('y = x + 2', 'x', 'lift')).toMatch(/^error: Shift \+ ↑ lifts/);
    expect(go('y = 0/x', '0', 'drop')).toMatch(/no reciprocal/);
  });
});

describe('Shift + ↑ ↓ through a log', () => {
  it('the power comes down in front, |…| when it is even', () => {
    expect(go('y = ln(x^3)', '3', 'drop')).toBe('y = 3 ln(x)');
    expect(go('y = ln(x^2)', '2', 'drop')).toBe('y = 2 ln|x|');
  });
  it('a coefficient goes up as the power', () => {
    expect(go('y = 2 ln(x)', '2', 'lift')).toBe('y = ln(x^2)');
  });
});

describe('Shift + ↑ ↓ on integral bounds', () => {
  it('a bound goes over to the other end and the integral turns round', () => {
    expect(go('y = int_0^1 x dx', '0', 'lift')).toBe('y = −∫_{1}^{0} x dx');
    expect(go('y = int_0^1 x dx', '1', 'drop')).toBe('y = −∫_{1}^{0} x dx');
    expect(go('y = int_0^1 x dx', '1', 'lift')).toMatch(/already up/);
  });
});
