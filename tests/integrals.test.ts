// Calculus 2: integrals and series, typed, worth the right amount, and worked a rule at a time.
import { describe, it, expect } from 'vitest';
import { parseEquation, parseExpr } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { evaluate, Node } from '../src/engine/ast';
import { intStep, uSub, byParts, plugBounds, geometric, taylor, ratioTest, writeOut } from '../src/engine/integrate';
import { finishCalc } from '../src/engine/calcmoves';
import { isErr, MoveResult } from '../src/engine/moves';
import { tidy } from '../src/engine/techniques';

const ex = (src: string) => parseEquation(src, true);
const val = (src: string, env: Record<string, number> = {}) => evaluate(parseExpr(src), env);
const txt = (r: MoveResult) => (isErr(r) ? `error: ${r.error}` : toText(r.eq));
const done = (src: string) => { const { steps, stuck } = finishCalc(ex(src)); if (stuck) return `stuck: ${stuck}`; const last = steps[steps.length - 1].eq; return toText(tidy(last)?.eq ?? last); };

describe('typing', () => {
  it.each([
    ['int x^2 dx', '∫ x^2 dx'],
    ['∫_0^1 x^2 dx', '∫_{0}^{1} x^2 dx'],
    ['\\int_{0}^{\\pi} \\sin x \\, dx', '∫_{0}^{π} sin(x) dx'],
    ['int (x + 1) dx', '∫ (x + 1) dx'],
    ['sum_{n=1}^∞ 1/n^2', 'Σ_{n=1}^{∞} 1/(n^2)'],
    ['n! + 1', 'n! + 1'],
    ['[x^2]_{x=0}^{3}', '[x^2]_{x=0}^{3}'],
  ])('%s', (src, want) => expect(toText(ex(src))).toBe(want));
  it('a sum bound with = is not the relation', () => expect(toText(parseEquation('y = sum_{n=0}^{3} n'))).toBe('y = Σ_{n=0}^{3} n'));
});

describe('what they are worth', () => {
  it.each([
    ['int_0^1 x^2 dx', 1 / 3],
    ['int_0^π sin(x) dx', 2],
    ['int_1^∞ 1/x^2 dx', 1],
    ['int_0^1 1/sqrt(x) dx', 2],
    ['int_{-∞}^{∞} e^(-x^2) dx', Math.sqrt(Math.PI)],
    ['sum_{n=0}^{∞} (1/2)^n', 2],
    ['sum_{n=1}^{∞} 1/n^2', Math.PI ** 2 / 6],
    ['sum_{n=1}^{∞} (-1)^(n+1)/n', Math.log(2)],
    ['sum_{n=0}^{∞} 1/n!', Math.E],
    ['sum_{k=1}^{10} k', 55],
    ['5!', 120],
  ])('%s', (src, want) => expect(val(src)).toBeCloseTo(want as number, 7));
  it('d/dx of ∫ from 0 to x is the integrand (the fundamental theorem)', () => expect(val('d/dx int_0^x cos(t) dt', { x: 0.7 })).toBeCloseTo(Math.cos(0.7), 9));
});

describe('a rule at a time', () => {
  it.each([
    ['int x^3 dx', 'x^4/4 + C'],
    ['int (3x^2 + 2x) dx', 'x^3 + x^2 + C'],
    ['int cos(2x) dx', 'sin(2x)/2 + C'],
    ['int e^(3x) dx', 'e^(3x)/3 + C'],
    ['int 1/x dx', 'ln|x| + C'],
    ['int 5 dx', '5x + C'],
    ['int_0^2 x^2 dx', '[x^3/3]_{x=0}^{2}'],
  ])('%s', (src, want) => expect(txt(intStep(ex(src), null))).toBe(want));

  it('no rule fits: it says what to try', () => expect(txt(intStep(ex('int x cos(x^2) dx'), null))).toMatch(/u-substitution/));

  it('u-substitution finds the inside and its derivative', () => {
    const r = uSub(ex('int 2x cos(x^2) dx'), null);
    expect(txt(r.move)).toBe('∫ cos(u) du');
    expect(r.side && toText(r.side)).toBe('u = x^2');
  });
  it('by parts: LIATE picks u = x', () => expect(txt(byParts(ex('int x e^x dx'), null))).toBe('xe^x − ∫ e^x dx'));
  it('plugging in bounds', () => expect(txt(plugBounds(ex('[x^3]_{x=1}^{2}'), null))).toBe('2^3 − 1^3'));
  it('geometric series', () => expect(txt(geometric(ex('sum_{n=0}^{∞} 3(1/2)^n'), null))).toMatch(/^3\/\(1 − 1\/2\)/));
});

describe('e works them out', () => {
  it.each([
    ['int_0^2 x^2 dx', /^8\/3|^2\^3/],
    ['int 2x cos(x^2) dx', /sin\(x\^2\) \+ C/],
    ['int x e^x dx', /e\^x/],
    ['int_1^∞ 1/x^2 dx', /^1$|1/],
    ['int x sin(x) dx', /sin\(x\)/],
    ['int ln(x) dx', /ln/],
  ])('%s', (src, want) => expect(done(src)).toMatch(want));
  it('a definite u-substitution changes the bounds and lands on the number', () => {
    const { steps, stuck } = finishCalc(ex('int_0^1 2x e^(x^2) dx'));
    expect(stuck).toBeUndefined();
    expect(evaluate(steps[steps.length - 1].eq, {})).toBeCloseTo(Math.E - 1, 9);
    expect(steps.some(s => s.label.startsWith('u-substitution'))).toBe(true);
  });
});

describe('series helpers', () => {
  it('Taylor polynomial of e^x', () => {
    const t = taylor(ex('e^x'), 'x', 4);
    expect('poly' in t && toText(t.poly)).toBe('1 + x + x^2/2 + x^3/6 + x^4/24');
  });
  it('ratio test', () => {
    expect(ratioTest(ex('sum_{n=1}^{∞} n/2^n'), null)).toMatch(/1\/2 < 1, so it converges/);
    expect(ratioTest(ex('sum_{n=1}^{∞} 1/n^2'), null)).toMatch(/can't tell/);
  });
});

void (null as unknown as Node);

describe('products and finite sums', () => {
  it.each([
    ['prod_{k=1}^{5} k', '∏_{k=1}^{5} k'],
    ['∏_{j=0}^{3} (j + 1)', '∏_{j=0}^{3} (j + 1)'],
    ['\\prod_{n=1}^{∞} (1 + 1/n^2)', '∏_{n=1}^{∞} (1 + 1/(n^2))'],
  ])('%s', (src, want) => expect(toText(ex(src))).toBe(want));
  it('a finite product is worth its factors multiplied', () => expect(val('prod_{k=1}^{5} k')).toBe(120));
  it('an infinite one through its logs', () => expect(val('prod_{n=2}^{∞} (1 - 1/n^2)')).toBeCloseTo(0.5, 6));
  it('write out a finite sum', () => expect(txt(writeOut(ex('sum_{i=1}^{3} i^2'), null))).toBe('1^2 + 2^2 + 3^2'));
  it('write out a finite product', () => expect(txt(writeOut(ex('prod_{j=0}^{3} (j + 1)'), null))).toBe('(0 + 1)(1 + 1)(2 + 1)(3 + 1)'));
  it('refuses an infinite one', () => expect(isErr(writeOut(ex('sum_{n=1}^{∞} 1/n^2'), null))).toBe(true));
  it('a product is not a geometric series', () => expect(isErr(geometric(ex('prod_{n=0}^{∞} (1/2)^n'), null))).toBe(true));
  it('e works out a sum of products', () => expect(done('sum_{i=1}^{2} prod_{j=0}^{3} (i + j)')).toBe('144'));
  it('e works out a finite sum', () => expect(done('sum_{k=1}^{4} k')).toBe('10'));
});
