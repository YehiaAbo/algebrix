// The calculus kernel: typing it, what derivatives and limits are worth.
import { describe, it, expect } from 'vitest';
import { parseEquation, parseExpr } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { evaluate, symbols, Node } from '../src/engine/ast';
import { derivative } from '../src/engine/calculus';

const val = (src: string, env: Record<string, number> = {}) => evaluate(parseExpr(src), env);

describe('typing calculus', () => {
  it.each([
    ['lim x->0+ 1/x', 'lim_{x->0+} 1/x'],
    ['lim x->0- 1/x', 'lim_{x->0-} 1/x'],
    ['lim x->0 + 1/x', 'lim_{x->0} 1/x'],
    ['x - 1 = 2', 'x - 1 = 2'],
    ['d/dx(x^2)', 'd/dx(x^2)'],
    ['d/dx x^3 sin x', 'd/dx(x^3 sin(x))'],
    ['\\frac{d}{dx}(x^2+1)', 'd/dx(x^2 + 1)'],
    ['d^2/dx^2 x^4', 'd/dx(d/dx(x^4))'],
    ['lim x->0 sin(x)/x', 'lim_{x->0} sin(x)/x'],
    ['lim_{x\\to 0^+} ln x', 'lim_{x->0+} ln(x)'],
    ['lim_{x->0+} ln(x)', 'lim_{x->0+} ln(x)'],
    ['\\lim_{x \\to \\infty} (1 + 1/x)^x', 'lim_{x->∞} (1 + 1/x)^x'],
    ["y' = 2x", 'y′ = 2x'],
    ['dy/dx = 3', 'dy/dx = 3'],
  ])('%s', (src, text) => expect(toText(parseEquation(src, true), true).replace(' = 0', '')).toBe(text));

  it('a limit binds its variable; y′ is a variable of its own', () => {
    expect(symbols(parseExpr('lim x->a (x^2 + b)'))).toEqual(['a', 'b']);
    expect(symbols(parseEquation("y' = 2x"))).toEqual(['x', 'y′']);
  });
});

describe('derivatives are worth the true slope', () => {
  const cases = ['x^3', '3x^2 - 5x + 1', 'sin(x) cos(x)', 'x/(x^2 + 1)', 'e^(2x)', 'ln(x^2 + 1)', 'sqrt(x^2 + 3)', 'tan(x)', 'sin^-1(x/2)', 'cos^-1(x/3)', 'tan^-1(x)', 'x^x', '2^x', 'log(x)', '|x - 1|', '(x^2 + 1)^(1/3)', 'sin(cos(x))', 'e^x/(1 + x^2)'];
  it.each(cases)('d/dx %s', src => {
    const f = parseExpr(src), d = derivative(f, 'x')!;
    for (const x of [0.37, 1.3, 1.9]) {
      const h = 1e-5, fd = (evaluate(f, { x: x + h }) - evaluate(f, { x: x - h })) / (2 * h);
      expect(evaluate(d, { x })).toBeCloseTo(fd, 5);
      expect(val(`d/dx(${src})`, { x })).toBeCloseTo(fd, 5);
    }
  });
  it('second derivatives', () => expect(val('d^2/dx^2 x^4', { x: 2 })).toBeCloseTo(48, 9));
  it('implicit: d/dx y² is 2y·y′', () => {
    const d = derivative(parseExpr('y^2'), 'x', ['y']) as Node;
    expect(evaluate(d, { y: 3, 'y′': 5 })).toBeCloseTo(30, 9);
  });
});

describe('limits', () => {
  it.each([
    ['lim x->0 sin(x)/x', 1],
    ['lim x->0 (1 - cos(x))/x^2', 0.5],
    ['lim x->2 (x^2 - 4)/(x - 2)', 4],
    ['lim x->∞ (1 + 1/x)^x', Math.E],
    ['lim x->∞ (3x^2 + 1)/(x^2 - 5)', 3],
    ['lim x->0 (e^x - 1)/x', 1],
    ['lim x->1 ln(x)/(x - 1)', 1],
    ['lim x->3 x^2', 9],
  ])('%s', (src, want) => expect(val(src)).toBeCloseTo(want as number, 7));

  it('a limit with another variable: the derivative from first principles', () => {
    expect(val('lim h->0 ((x + h)^2 - x^2)/h', { x: 3 })).toBeCloseTo(6, 7);
  });
  it('one-sided and missing limits', () => {
    expect(val('lim_{x->0+} 1/x')).toBe(Infinity);
    expect(val('lim x->0 |x|/x')).toBeNaN();
    expect(val('lim_{x->0-} |x|/x')).toBeCloseTo(-1, 9);
    expect(val('lim x->0 sin(1/x)')).toBeNaN();
  });
});

import { derivStep, finishCalc, plugIn, lhopital, bothSides, definitionForm } from '../src/engine/calcmoves';
import { isErr, MoveResult, MoveOk } from '../src/engine/moves';
import { tidy } from '../src/engine/techniques';

const ex = (src: string) => parseEquation(src, true);
const txt = (r: MoveResult) => (isErr(r) ? `error: ${r.error}` : toText(r.eq));
const step = (src: string) => { const r = derivStep(ex(src), null); return isErr(r) ? `error: ${r.error}` : `${r.label}: ${toText(r.eq)}`; };

describe('one rule at a time', () => {
  it.each([
    ['d/dx x^3', 'power rule: 3x^2'],
    ['d/dx (x^3 + 2x - 7)', 'sum rule: 3x^2 + 2'],
    ['d/dx 5x^4', 'power rule: 20x^3'],
    ['d/dx x^2 sin(x)', 'product rule: 2x sin(x) + x^2 cos(x)'],
    ['d/dx sin(x^2)', 'chain rule (sin): 2x cos(x^2)'],
    ['d/dx sin(x)/x', 'quotient rule: (x cos(x) − sin(x))/(x^2)'],
    ['d/dx sqrt(x)', 'power rule: 1/(2 sqrt(x))'],
    ['d/dx e^(3x)', 'chain rule (eᵘ): 3e^(3x)'],
    ['d/dx (x^2 + 1)^5', 'chain rule (power): 10x(x^2 + 1)^4'],
  ])('%s', (src, want) => expect(step(src)).toBe(want));

  it('a chain with a chain inside leaves the inside for the next step', () => {
    const r = derivStep(ex('d/dx sin(cos(x^2))'), null);
    expect(txt(r)).toBe('cos(cos(x^2)) d/dx(cos(x^2))');
  });

  it('e works it all out, every step checked', () => {
    const { steps, stuck } = finishCalc(ex('d/dx (x^2 + 1)^3 sin(x)'));
    expect(stuck).toBeUndefined();
    expect(steps.length).toBeGreaterThan(1);
    const last = steps[steps.length - 1].eq;
    expect(hasNoCalc(last)).toBe(true);
  });
});

const hasNoCalc = (e: Node) => !JSON.stringify(e).includes('"deriv"') && !JSON.stringify(e).includes('"lim"');

describe('limits by steps', () => {
  it('plug in where it is continuous', () => expect(txt(plugIn(ex('lim x->2 (x^2 + 1)'), null))).toBe('2^2 + 1'));
  it('a step that cannot be checked does not happen: √x has no two-sided limit at 0', () => expect(txt(plugIn(ex('lim x->0 sqrt(x)'), null))).toMatch(/^error/));
  it('0/0 says what to do', () => expect(txt(plugIn(ex('lim x->2 (x^2 - 4)/(x - 2)'), null))).toMatch(/0\/0/));
  it("L'Hôpital on 0/0, then plug in", () => {
    const r = lhopital(ex('lim x->0 sin(x)/x'), null);
    expect(txt(r)).toBe('lim_{x→0} cos(x)/1');
  });
  it("L'Hôpital refuses when it isn't 0/0 or ∞/∞", () => expect(txt(lhopital(ex('lim x->1 (x + 1)/x'), null))).toMatch(/plug in/));
  it('e finishes a limit', () => {
    const { steps } = finishCalc(ex('lim x->0 (e^x - 1)/x'));
    const t = tidy(steps[steps.length - 1].eq);
    expect(toText((t ?? steps[steps.length - 1]).eq)).toBe('1');
  });
});

describe('differentiating both sides', () => {
  it('a circle: y depends on x', () => {
    const r = bothSides(ex('x^2 + y^2 = 25'), 'x');
    expect(isErr(r)).toBe(false);
    const { steps, stuck } = finishCalc((r as MoveOk).eq);
    expect(stuck).toBeUndefined();
    expect(toText(steps[steps.length - 1].eq)).toBe('2x + 2yy′ = 0');
  });
  it('the definition of the derivative', () => {
    const r = definitionForm(ex('d/dx x^2'), null);
    expect(r && toText(r.eq)).toBe('lim_{h→0} ((x + h)^2 − x^2)/h');
  });
});
