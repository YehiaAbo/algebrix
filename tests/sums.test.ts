// Sums and products, the general way: the Tab rewrites (each checked by value, letters in the
// bounds put to whole numbers) and the known sums on C k.
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { Eq, walk } from '../src/engine/ast';
import { isErr, MoveResult } from '../src/engine/moves';
import { toText } from '../src/engine/print';
import { formsFor } from '../src/engine/forms';
import { knownSum } from '../src/engine/sums';

const T = (e: Eq) => toText(e);
const sumId = (e: Eq): string => { let id: string | null = null; walk(e, n => { if (!id && n.k === 'sum') id = n.id; }); return id!; };
const ok = (r: MoveResult): Eq => { if (isErr(r)) throw new Error(r.error); return r.eq; };
const names = (src: string) => { const e = parseEquation(src, true); return formsFor(e, sumId(e)).map(f => f.name); };
const form = (src: string, name: string) => {
  const e = parseEquation(src, true);
  const f = formsFor(e, sumId(e)).find(x => x.name === name);
  if (!f) throw new Error(`no ${name} for ${src}: ${formsFor(e, sumId(e)).map(x => x.name).join(', ')}`);
  return T(f.eq);
};

describe('sum forms (Tab)', () => {
  it('splits a sum and pulls a constant out', () => {
    expect(names('sum_{k=1}^{n} (k^2 + 3k)')).toContain('split the sum');
    expect(form('sum_{k=1}^{n} 3k', 'constant out')).toBe('3 Σ_{k=1}^{n} k');
  });
  it('takes the first and last terms out, with a letter bound', () => {
    expect(names('sum_{k=1}^{n} k^2')).toEqual(expect.arrayContaining(['first term out', 'last term out']));
  });
  it('shifts the index both ways', () => {
    const ns = names('sum_{k=1}^{n} 1/k');
    expect(ns).toEqual(expect.arrayContaining(['shift: k → k + 1', 'shift: k → k − 1']));
  });
  it('writes an infinite sum as the limit of its partial sums', () => {
    expect(form('sum_{n=1}^∞ 1/n^2', 'as a limit of partial sums')).toMatch(/lim/);
  });
  it('splits a product and turns a log of a product into a sum of logs', () => {
    expect(names('prod_{k=1}^{n} 2k')).toEqual(expect.arrayContaining(['split the product', 'constant out']));
    expect(names('ln(prod_{k=1}^{n} k)')).toContain('a sum of logs');
  });
});

describe('known sums (C k)', () => {
  const known = (src: string) => { const e = parseEquation(src, true); return T(ok(knownSum(e, sumId(e)))); };
  it('Σ k, Σ k², Σ k³', () => {
    expect(known('sum_{k=1}^{n} k')).toBe('(n(n + 1))/2');
    expect(() => known('sum_{k=1}^{n} k^2')).not.toThrow();
    expect(() => known('sum_{k=1}^{n} k^3')).not.toThrow();
  });
  it('telescoping after partial fractions: Σ (1/k − 1/(k + 1)) = 1 − 1/(n + 1)', () => {
    expect(known('sum_{k=1}^{n} (1/k - 1/(k+1))')).toMatch(/1 − 1\s*\/\s*\(n \+ 1\)|1 - 1\/\(n \+ 1\)/);
  });
  it('a finite geometric sum, and the infinite one', () => {
    expect(() => known('sum_{k=0}^{n} 2^k')).not.toThrow();
    expect(known('sum_{k=0}^∞ (1/2)^k')).toMatch(/2/);
  });
  it('∏ k = n!, and Σ xⁿ/n! = eˣ', () => {
    expect(known('prod_{k=1}^{n} k')).toMatch(/n!/);
    expect(known('sum_{n=0}^∞ x^n / n!')).toMatch(/e\^x/);
  });
  it('says what to try when nothing fits', () => {
    const e = parseEquation('sum_{k=1}^{n} sin(k)', true);
    const r = knownSum(e, sumId(e));
    expect(isErr(r) && r.error).toMatch(/Split it/);
  });
});
