// Taking a factor you choose out of a polynomial (playtest C4): the rational root theorem by hand.
import { describe, it, expect } from 'vitest';
import { parseExpr } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { divideOut } from '../src/engine/polytools';

const out = (p: string, d: string) => { const r = divideOut(parseExpr(p), parseExpr(d)); return 'error' in r ? r.error : toText(r); };

describe('take a factor out', () => {
  it('a root leaves nothing over', () => {
    expect(out('4x^4 + 4x^3 - 25x^2 - x + 6', 'x - 2')).toBe('(x − 2)(4x^3 + 12x^2 − x − 3)');
  });
  it('a non-root leaves a remainder', () => {
    expect(out('x^3 - 2x - 4', 'x - 1')).toBe('(x − 1)(x^2 + x − 1) − 5');
  });
  it('a factor with a leading number', () => {
    expect(out('2x^3 - 3x^2 - 32x - 15', '2x + 1')).toBe('(2x + 1)(x^2 − 2x − 15)');
  });
  it('says what is wrong', () => {
    expect(out('x^2 + 1', 'y - 1')).toContain('in x');
    expect(out('x + 1', 'x - 1')).toContain('polynomial');
  });
});
