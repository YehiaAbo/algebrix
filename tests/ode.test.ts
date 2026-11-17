// Calculus 4: differential equations (separable, linear first order, constant coefficients) and
// vector calculus (divergence, curl).
import { describe, it, expect } from 'vitest';
import { parseEquation, parseExpr } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { evaluate } from '../src/engine/ast';
import { separate, linearSteps, characteristic, generalSolution, odeKind } from '../src/engine/ode';
import { finishCalc } from '../src/engine/calcmoves';
import { isErr, MoveResult } from '../src/engine/moves';
import { tidy } from '../src/engine/techniques';

const ex = (src: string) => parseEquation(src, true);
const txt = (r: MoveResult) => (isErr(r) ? `error: ${r.error}` : toText(r.eq));
const done = (src: string) => { const { steps, stuck } = finishCalc(ex(src)); if (stuck) return `stuck: ${stuck}`; const last = steps[steps.length - 1].eq; return toText(tidy(last)?.eq ?? last); };

describe('which kind', () => {
  it.each([
    ["y' = x y", 'separable'],
    ["y' = x^2/y", 'separable'],
    ["y' + 2y = e^x", 'linear'],
    ["x y' + y = x^2", 'linear'],
    ["y'' - 3y' + 2y = 0", 'second'],
    ['x^2 + y = 3', null],
  ])('%s', (src, want) => expect(odeKind(ex(src))).toBe(want));
});

describe('separable', () => {
  it('dy and dx apart, under integrals', () => expect(txt(separate(ex("y' = x y")))).toBe('∫ 1/y dy = ∫ x dx'));
  it('a fraction', () => expect(txt(separate(ex("y' = x^2/y")))).toBe('∫ y dy = ∫ x^2 dx'));
  it('is one-way (⇒)', () => { const r = separate(ex("y' = x y")); expect(!isErr(r) && r.implies).toBe(true); });
  it('refuses what does not separate', () => expect(isErr(separate(ex("y' = x + y")))).toBe(true));
  it('e then integrates both sides, with one + C', () => {
    const r = separate(ex("y' = x^2/y"));
    if (isErr(r)) throw new Error(r.error);
    const { steps, stuck } = finishCalc(r.eq);
    expect(stuck).toBeUndefined();
    expect(toText(steps[steps.length - 1].eq)).toBe('y^2/2 = x^3/3 + C');
  });
});

describe('linear first order', () => {
  it('integrating factor, product rule backwards, integrate', () => {
    const s = linearSteps(ex("y' + 2y = e^x"));
    if (!Array.isArray(s)) throw new Error(s.error);
    expect(s.map(m => m.label)).toEqual(['× the integrating factor e^(2x)', 'the left side is (ye^(2x))′', 'integrate both sides']);
    expect(toText(s[s.length - 1].eq)).toBe('ye^(2x) = ∫ e^(3x) dx');
  });
  it('puts it in standard form first', () => {
    const s = linearSteps(ex("x y' + y = x^2"));
    if (!Array.isArray(s)) throw new Error(s.error);
    expect(s[0].label).toBe('standard form: ÷ x');
    expect(s[1].label).toBe('× the integrating factor x');
  });
});

describe('constant coefficients', () => {
  it('the characteristic equation', () => expect(toText(characteristic(ex("y'' - 3y' + 2y = 0")) as never)).toBe('r^2 − 3r + 2 = 0'));
  const sol = (src: string) => { const s = generalSolution(ex(src)); return 'error' in s ? s.error : toText(s); };
  it('two real roots', () => expect(sol("y'' - 3y' + 2y = 0")).toBe('y = C_1 e^x + C_2 e^(2x)'));
  it('a repeated root', () => expect(sol("y'' + 4y' + 4y = 0")).toBe('y = (C_1 + C_2 x)e^(−2x)'));
  it('complex roots', () => expect(sol("y'' + 2y' + 5y = 0")).toBe('y = e^(−x)(C_1 cos(2x) + C_2 sin(2x))'));
  it('pure oscillation', () => expect(sol("y'' + 9y = 0")).toBe('y = C_1 cos(3x) + C_2 sin(3x)'));
  it('only = 0 for now', () => expect(sol("y'' + y = x")).toMatch(/0/));
  it('the solution satisfies the equation', () => {
    const s = generalSolution(ex("y'' - y' - 6y = 0"));
    if ('error' in s) throw new Error(s.error);
    const y = (x: number) => evaluate(s.rhs, { x, C_1: 1.3, C_2: -0.7 });
    const h = 1e-3, x = 0.4;
    const y1 = (y(x + h) - y(x - h)) / (2 * h), y2 = (y(x + h) - 2 * y(x) + y(x - h)) / (h * h);
    expect(y2 - y1 - 6 * y(x)).toBeCloseTo(0, 2);
  });
});

describe('typing', () => {
  it("y'' reads as y″", () => expect(toText(ex("y'' + y = 0"))).toBe('y″ + y = 0'));
  it('C_1 and C_2', () => expect(evaluate(parseExpr('C_1 + C_2'), { C_1: 1, C_2: 2 })).toBe(3));
});

describe('divergence and curl', () => {
  const val = (src: string, env: Record<string, number>) => evaluate(parseExpr(src), env);
  it.each([
    ['div(x y, y^2, z)', '∇·⟨xy, y^2, z⟩'],
    ['∇·⟨x, y⟩', '∇·⟨x, y⟩'],
    ['curl(-y, x, 0)', '∇×⟨−y, x, 0⟩'],
    ['∇×⟨-y, x⟩', '∇×⟨−y, x⟩'],
  ])('%s', (src, want) => expect(toText(ex(src))).toBe(want));
  it('divergence is worth the sum of the partials', () => expect(val('div(x y, y^2, z)', { x: 2, y: 3, z: 1 })).toBeCloseTo(3 + 6 + 1));
  it('a 2D curl is a number', () => expect(val('∇×⟨-y, x⟩', { x: 1, y: 1 })).toBeCloseTo(2));
  it('e works out a divergence', () => expect(done('div(x y, y^2, z)')).toBe('3y + 1'));
  it('e works out a curl', () => expect(done('curl(-y, x, 0)')).toBe('⟨0, 0, 2⟩'));
});

describe('not a proof', () => {
  it("y″ − 3y′ + 2y = 0 is an equation, not an identity (y, y′ and y″ sample apart)", async () => {
    const { isIdentity } = await import('../src/engine/goals');
    expect(isIdentity(ex("y'' - 3y' + 2y = 0"))).toBe(false);
  });
});

describe('fresh ids', () => {
  it('new equations never share a node', async () => {
    const { allIds } = await import('../src/engine/ast');
    for (const e of [characteristic(ex("y'' - 3y' + 2y = 0")), generalSolution(ex("y'' + 4y' + 4y = 0")), generalSolution(ex("y'' + 2y' + 5y = 0"))]) {
      const ids = allIds(e as never);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
