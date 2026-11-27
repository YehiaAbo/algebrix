// A Σ or ∏ written out with ⋯ (user 2026-11-27): terms come out at either end and go back in,
// telescoping pieces are crossed out and cancel, and written terms with a pattern fold into Σ.
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { walk, Eq, Node } from '../src/engine/ast';
import { isErr, MoveResult } from '../src/engine/moves';
import { writeOutDots, moreTerms, fewerTerms, foldBack, crossOut, dropStruck, foldTerms, patternOf, telescopeOf } from '../src/engine/series';

const show = (n: Node): string => {
  // ⋯ for the written-out middle, [x] for what is struck
  const t = (m: Node): string => {
    if (m.k === 'sum' && m.dots) return '⋯';
    return toText(m);
  };
  return t(n);
};
const txt = (r: MoveResult) => (isErr(r) ? 'error: ' + r.error : toText(r.eq));
const dotsText = (e: Eq) => { let s = toText(e); walk(e, n => { if (n.k === 'sum' && n.dots) s = s.replace(toText({ ...n, dots: false }), '⋯'); }); return s; };
const step = (e: Eq, f: (e: Eq, sel: string | null) => MoveResult, sel: string | null = null): Eq => { const r = f(e, sel); if (isErr(r)) throw new Error(r.error); return r.eq; };
const struck = (e: Eq) => { const out: string[] = []; walk(e, n => { if (n.struck) out.push(n.k === 'sum' ? '⋯' : toText(n)); }); return out; };
void show;

describe('written out with ⋯', () => {
  it('three terms, ⋯, the last; to ∞ just ⋯', () => {
    expect(dotsText(step(parseEquation('S = sum_{k=1}^{n} k^2'), writeOutDots))).toBe('S = 1 + 4 + 9 + ⋯ + n^2');
    expect(dotsText(step(parseEquation('S = sum_{k=1}^{∞} 1/k^2'), writeOutDots))).toBe('S = 1 + 1/4 + 1/9 + ⋯');
    expect(dotsText(step(parseEquation('P = prod_{k=2}^{n} (1 - 1/k^2)'), writeOutDots))).toBe('P = (3/4)(8/9)(15/16) ⋯(1 − 1/(n^2))');
  });
  it('more at the start and the end, and back again', () => {
    let e = step(parseEquation('S = sum_{k=1}^{n} 1/k'), writeOutDots);
    e = step(e, (q, s) => moreTerms(q, s, 'start'));
    expect(dotsText(e)).toBe('S = 1 + 1/2 + 1/3 + 1/4 + ⋯ + 1/n');
    e = step(e, (q, s) => moreTerms(q, s, 'end'));
    expect(dotsText(e)).toBe('S = 1 + 1/2 + 1/3 + 1/4 + ⋯ + 1/(n − 1) + 1/n');
    e = step(e, (q, s) => fewerTerms(q, s, 'start'));
    expect(dotsText(e)).toBe('S = 1 + 1/2 + 1/3 + ⋯ + 1/(n − 1) + 1/n');
    expect(toText(step(e, foldBack))).toBe('S = Σ_{k=1}^{n} 1/k');
  });
  it('a short finite one is written in full', () => {
    expect(toText(step(parseEquation('S = sum_{k=1}^{4} k'), writeOutDots))).toBe('S = 1 + 2 + 3 + 4');
  });
});

describe('crossing out', () => {
  it('a telescoping Σ: the middle goes, the ends stay', () => {
    let e = step(parseEquation('S = sum_{k=1}^{n} (1/k - 1/(k + 1))'), writeOutDots);
    e = step(e, crossOut);
    expect(struck(e).length).toBeGreaterThan(3);
    expect(struck(e)).toContain('⋯');
    const r = dropStruck(e)!;
    expect(txt(r)).toBe('S = 1 − 1/(n + 1)');
  });
  it('to ∞ it leaves the limit', () => {
    let e = step(parseEquation('S = sum_{k=1}^{∞} (1/k - 1/(k + 1))'), writeOutDots);
    e = step(e, crossOut);
    expect(txt(dropStruck(e)!)).toBe('S = 1 − lim_{k→∞} 1/k');
  });
  it('step 2: two at each end stay', () => {
    let e = step(parseEquation('S = sum_{k=1}^{n} (1/k - 1/(k + 2))'), writeOutDots);
    e = step(e, crossOut);
    expect(txt(dropStruck(e)!)).toBe('S = 1 + 1/2 − 1/(n + 1) − 1/(n + 2)');
  });
  it('a telescoping product: tops and bottoms', () => {
    let e = step(parseEquation('P = prod_{k=1}^{n} (k + 1)/k'), writeOutDots);
    e = step(e, crossOut);
    expect(txt(dropStruck(e)!)).toBe('P = n + 1');
  });
  it('typed pieces that cancel', () => {
    const e = step(parseEquation('y = 1 - 1/2 + 1/2 - 1/3 + 1/3 - 1/4'), crossOut, null);
    expect(txt(dropStruck(e)!)).toBe('y = 1 − 1/4');
  });
  it('nothing cancels: says so', () => {
    expect(txt(crossOut(parseEquation('y = 1 + 1/2'), null))).toMatch(/^error/);
  });
  it('telescope found with its step', () => {
    const S = parseEquation('y = sum_{k=1}^{n} (sqrt(k + 1) - sqrt(k))').rhs;
    expect(telescopeOf(S as never)?.d).toBe(1);
  });
});

describe('the pattern in written terms', () => {
  const pat = (src: string) => { const e = parseEquation('y = ' + src); const ts = e.rhs.k === 'add' ? e.rhs.terms : (e.rhs as { factors: Node[] }).factors; const g = patternOf(ts, 'k'); return g ? toText(g) : null; };
  it('squares, reciprocals, geometric, alternating, products of lines', () => {
    expect(pat('1/1 + 1/4 + 1/9 + 1/16')).toBe('1/(k^2)');
    expect(pat('1/(1*2) + 1/(2*3) + 1/(3*4)')).toBe('1/(k(k + 1))');
    expect(pat('2 + 4 + 8 + 16')).toBe('2^k');
    expect(pat('1 - 1/2 + 1/3 - 1/4')).toBe('(−1)^(k + 1)/k');
    expect(pat('x^2/2 + x^3/3 + x^4/4')).toBe('x^(k + 1)/(k + 1)');
  });
  it('fold into Σ', () => {
    const e = parseEquation('y = 1 + 1/4 + 1/9 + 1/16');
    expect(txt(foldTerms(e, e.rhs.id))).toBe('y = Σ_{k=1}^{4} 1/(k^2)');
  });
});

describe('written terms spread in the sum (as the app keeps them)', () => {
  it('back into Σ and a term back into ⋯ find the pieces of each term', async () => {
    const { ungroup } = await import('../src/engine/select');
    let e = ungroup(step(parseEquation('S = sum_{k=1}^{n} (1/k - 1/(k + 1))'), writeOutDots));
    expect(toText(step(e, foldBack))).toBe('S = Σ_{k=1}^{n} (1/k − 1/(k + 1))');
    e = ungroup(step(e, (q, s) => fewerTerms(q, s, 'start')));
    expect(dotsText(e)).toBe('S = 1 − 1/2 + 1/2 − 1/3 + ⋯ + 1/n − 1/(n + 1)');
  });
});
