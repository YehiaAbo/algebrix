// Tab q: take out a factor you type, from any sum, as on paper
import { describe, it, expect } from 'vitest';
import { parseExpr } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { divideOut, factorGuess } from '../src/engine/polytools';

const out = (n: string, d: string) => { const r = divideOut(parseExpr(n), parseExpr(d)); return 'error' in r ? r.error : toText(r); };

describe('take out a factor', () => {
  it('a number', () => expect(out('6x + 9', '3')).toBe('3(2x + 3)'));
  it('a number that leaves fractions, which is still true', () => expect(out('3x + 1', '3')).toBe('3(x + 1/3)'));
  it('a monomial', () => expect(out('2x^2 + 4x', '2x')).toBe('2x(x + 2)'));
  it('across two letters', () => expect(out('3a + 3b', '3')).toBe('3(a + b)'));
  it('a negative', () => expect(out('-2x - 4', '-2')).toBe('−2(x + 2)'));
  it('from a trig sum', () => expect(out('2 sin(x) + 4', '2')).toBe('2(sin(x) + 2)'));
  it('a polynomial factor still divides with what is left over', () => expect(out('x^2 - 3x + 2', 'x - 1')).toBe('(x − 1)(x − 2)'));
  it('0 is refused', () => expect(out('6x + 9', '0')).toMatch(/0/));
  it('the first guess is the common factor', () => { expect(factorGuess(parseExpr('6x + 9'))).toBe('3'); expect(factorGuess(parseExpr('x^2 - 3x + 2'))).toBe('x - 1'); });
});
