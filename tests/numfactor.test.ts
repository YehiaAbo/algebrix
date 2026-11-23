// A number is something you can take apart too: its primes as a form (Tab f), and any factor you
// type taken out of it (Tab q), the same as for a sum.
import { describe, it, expect } from 'vitest';
import { parseEquation, parseExpr } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { walk } from '../src/engine/ast';
import { formsFor } from '../src/engine/forms';
import { divideOut, primeFactors, polyTarget, factorGuess } from '../src/engine/polytools';

const aim = (src: string, piece: string) => {
  const e = parseEquation(src); let id = '';
  walk(e, n => { if (n.k !== 'eq' && toText(n) === piece) id = n.id; });
  return { e, id };
};
const primes = (src: string, piece: string) => {
  const { e, id } = aim(src, piece);
  const f = formsFor(e, id).find(x => x.name === 'prime factors');
  return f ? `${toText(f.eq)} (${f.chord})` : null;
};

describe('prime factors', () => {
  it('splits a whole number into primes and powers', () => {
    expect(primeFactors(360)).toEqual([[2, 3], [3, 2], [5, 1]]);
    expect(primes('y = 360', '360')).toBe('y = 2^3·3^2·5 (f)');
    expect(primes('y = 8', '8')).toBe('y = 2^3 (f)');
    expect(primes('y = sqrt(72)', '72')).toBe('y = sqrt(2^3·3^2) (f)');
  });
  it('has nothing to offer for a prime, 0, 1 or a decimal', () => {
    expect(primes('y = 7', '7')).toBeNull();
    expect(primeFactors(1)).toBeNull();
    expect(primeFactors(0)).toBeNull();
    expect(primeFactors(2.5)).toBeNull();
  });
});

describe('Tab q on a number', () => {
  it('aims at the number and guesses its smallest prime', () => {
    const { e, id } = aim('y = 12x', '12');
    expect(polyTarget(e, id)).toBe(id);
    expect(factorGuess(parseExpr('12'))).toBe('2');
    expect(factorGuess(parseExpr('7'))).toBe('2');
    const one = aim('y = 1 + x', '1');
    expect(polyTarget(one.e, one.id)).toBeNull();
  });
  it('takes out any factor you type, whole or not', () => {
    const out = (n: string, d: string) => toText(divideOut(parseExpr(n), parseExpr(d)) as never);
    expect(out('12', '3')).toBe('3·4');
    expect(out('72', '36')).toBe('36·2');
    expect(out('12', '5')).toBe('5(12/5)');
  });
});
