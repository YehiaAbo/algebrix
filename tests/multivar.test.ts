// Calculus 3: partial derivatives, the gradient, vectors and dot products, critical points in
// several variables, Lagrange multipliers and double integrals.
import { describe, it, expect } from 'vitest';
import { parseEquation, parseExpr } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { evaluate, eq as mkEq, num } from '../src/engine/ast';
import { derivStep, finishCalc, gradStep, dotStep, components, partialOf, gradientZero, lagrange, calcVars } from '../src/engine/calcmoves';
import { isErr, MoveResult } from '../src/engine/moves';
import { tidy } from '../src/engine/techniques';
import { intStep } from '../src/engine/integrate';

const intStepOf = (src: string) => intStep(ex(src), null);
/** aimed at the outer integral */
const intStepAim = (src: string) => { const e = ex(src); return intStep(e, e.lhs.id); };

const ex = (src: string) => parseEquation(src, true);
const val = (src: string, env: Record<string, number> = {}) => evaluate(parseExpr(src), env);
const txt = (r: MoveResult) => (isErr(r) ? `error: ${r.error}` : toText(r.eq));
const done = (src: string) => { const { steps, stuck } = finishCalc(ex(src)); if (stuck) return `stuck: ${stuck}`; const last = steps[steps.length - 1].eq; return toText(tidy(last)?.eq ?? last); };

describe('typing', () => {
  it.each([
    ['∂/∂x (x^2 y)', '∂/∂x(x^2y)'],
    ['\\frac{\\partial}{\\partial y} x y^2', '∂/∂y(xy^2)'],
    ['∇(x^2 + y^2)', '∇(x^2 + y^2)'],
    ['⟨1, 2⟩ · ⟨3, 4⟩', '⟨1, 2⟩⟨3, 4⟩'],
    ['∫_0^1 ∫_0^2 x y dy dx', '∫_{0}^{1} ∫_{0}^{2} xy dy dx'],
  ])('%s', (src, want) => expect(toText(ex(src))).toBe(want));
});

describe('what they are worth', () => {
  it('a partial derivative holds the other letters still', () => expect(val('∂/∂x (x^2 y)', { x: 3, y: 5 })).toBeCloseTo(30));
  it('a dot product', () => expect(val('⟨1, 2⟩⟨3, 4⟩')).toBeCloseTo(11));
  it('a gradient dotted with a direction', () => expect(val('∇(x^2 y) ⟨1, 0⟩', { x: 2, y: 3 })).toBeCloseTo(12));
  it('a double integral', () => expect(val('∫_0^1 ∫_0^2 x y dy dx')).toBeCloseTo(1));
  it('a double integral with a moving bound', () => expect(val('∫_0^1 ∫_0^x 1 dy dx')).toBeCloseTo(0.5));
});

describe('a rule at a time', () => {
  it('∂/∂x treats y as a number', () => expect(txt(derivStep(ex('∂/∂x (x^2 y)'), null))).toBe('2xy'));
  it('the product rule stays partial', () => expect(txt(derivStep(ex('∂/∂x (x sin(x y))'), null))).toContain('∂/∂x'));
  it('the gradient is the partials side by side', () => expect(txt(gradStep(ex('∇(x^2 + y^2)'), null))).toBe('⟨∂/∂x(x^2 + y^2), ∂/∂y(x^2 + y^2)⟩'));
  it('the dot product', () => expect(txt(dotStep(ex('⟨2x, 3⟩ ⟨1, y⟩'), null))).toBe('2x + 3y'));
  it('e works out a directional derivative', () => expect(done('∇(x^2 y) ⟨3/5, 4/5⟩')).toMatch(/xy|x\^2/));
  it('e works out a double integral', () => expect(done('∫_0^1 ∫_0^2 x y dy dx')).toBe('1'));
});

describe('new work', () => {
  it('finds the letters of a function of two', () => expect(calcVars(ex('x^2 y + y^3'))).toEqual(['x', 'y']));
  it('∂f/∂y of an expression', () => expect(toText(partialOf(ex('x^2 y'), 'y') as never)).toBe('∂/∂y(x^2y)'));
  it('critical points: the gradient is zero', () => expect(toText(gradientZero(ex('x^2 + y^2 - 2x')) as never)).toBe('∇(x^2 + y^2 − 2x) = ⟨0, 0⟩'));
  it('Lagrange: ∇f = λ∇g', () => {
    const r = lagrange(ex('x y'), parseEquation('x + y = 4'));
    expect(toText(r as never)).toBe('∇(xy) = λ∇(x + y)');
  });
  it('a constraint must share the letters', () => expect('error' in (lagrange(ex('x y'), parseEquation('z = 1')) as object)).toBe(true));
});

describe('components', () => {
  it('a vector equation splits into one per entry', () => {
    const c = components(ex('⟨2x, 2y - 2⟩ = ⟨0, 0⟩'));
    expect(isErr(c.first)).toBe(false);
    expect(txt(c.first)).toBe('2x = 0');
    expect(c.rest.map(e => toText(e))).toEqual(['2y − 2 = 0']);
  });
  it('a multiple of a vector', () => {
    const c = components(ex('⟨y, x⟩ = λ ⟨1, 1⟩'));
    expect(txt(c.first)).toBe('y = λ');
    expect(c.rest.map(e => toText(e))).toEqual(['x = λ']);
  });
  it('a plain equation has none', () => expect(isErr(components(mkEq(parseExpr('x'), num(1))).first)).toBe(true));
});

describe('C + i on a double integral', () => {
  it('works the inner one first', () => expect(txt(intStepOf('int_0^1 int_0^2 x y dy dx'))).toBe('∫_{0}^{1} [xy^2/2]_{y=0}^{2} dx'));
  it('refuses the outer one while the inner is there', () => expect(isErr(intStepAim('int_0^1 int_0^2 x y dy dx'))).toBe(true));
});

describe('stacked indefinite integrals', () => {
  it('the inner one works out, checked by the mixed slope', () => expect(txt(intStepOf('int int x y dx dy'))).toBe('∫ x^2y/2 dy'));
  it('e works out a double one, with one + C', () => expect(done('int int x y dx dy')).toBe('x^2y^2/4 + C'));
  it('an indefinite one inside a definite one asks for bounds', () => expect(done('int_0^1 int x y dy dx')).toMatch(/bounds/));
  it('and a triple one', () => expect(done('int int int x y z dx dy dz')).toBe('x^2y^2z^2/8 + C'));
  it('still refuses a wrong step: two separate integrals do not hide each other', async () => {
    const { verify } = await import('../src/engine/moves');
    const before = ex('int int x y dx dy');
    const wrong = { eq: ex('int (x^2 y/2 + x) dy'), label: 'wrong', hints: { } as never, factor: () => 1, select: null } as never;
    expect(verify(before, wrong)).not.toBeNull();
  });
});
