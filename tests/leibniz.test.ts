// y′, dy/dx and differentials: typing them, moving between them, and integrating both sides.
import { describe, expect, it } from 'vitest';
import '../src/engine/calculus';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { walk, Eq } from '../src/engine/ast';
import { isErr, applyBothChecked, MoveOk } from '../src/engine/moves';
import { toLeibniz, toPrime, toDifferentials, integrateDifferentials, asPrime } from '../src/engine/leibniz';
import { absorbConstant } from '../src/engine/ode';
import { formsFor } from '../src/engine/forms';

const P = (s: string) => parseEquation(s, true);
const ok = (r: unknown) => { if (isErr(r as never)) throw new Error((r as { error: string }).error); return r as MoveOk; };
const idOf = (e: Eq, test: (n: { k: string; name?: string }) => boolean) => { let id = ''; walk(e, n => { if (!id && test(n as never)) id = n.id; }); return id; };

describe('typing slopes and differentials', () => {
  it.each([
    ['dy/dx = x y', 'dy/dx = xy'], ['\\frac{dy}{dx} = 3', 'dy/dx = 3'], ['2dy/dx + y = 0', '2 dy/dx + y = 0'], ['x dy/dx = y', 'x dy/dx = y'],
    ['dy = x y dx', 'dy = xy dx'], ['dy/y = x dx', 'dy/y = x dx'], ['x dy = y dx', 'x dy = y dx'], ["y' = x y", 'y′ = xy'],
    ['int x dx', '∫ x dx'], ['d x', 'd·x'], ['delta + 1', 'δ + 1'],
  ])('%s reads as %s, and reads back the same', (src, want) => {
    const e = P(src);
    expect(toText(e)).toBe(want);
    for (const ascii of [false, true]) expect(toText(P(toText(e, ascii)), ascii)).toBe(toText(e, ascii));
  });
  it('the methods read every spelling as y′', () => {
    for (const s of ['dy/dx = x y', 'dy = x y dx', 'dy/y = x dx']) expect(toText(asPrime(P(s)))).toMatch(/^y′(\/y)? = xy?$/);
  });
});

describe('moving between them', () => {
  const e = P("y' = x y");
  it('y′ opens up as dy/dx, and closes again', () => {
    const a = ok(toLeibniz(e, idOf(e, n => n.name === 'y′')));
    expect(toText(a.eq)).toBe('dy/dx = xy');
    expect(toText(ok(toPrime(a.eq, idOf(a.eq, n => n.k === 'frac'))).eq)).toBe('y′ = xy');
  });
  it('splits into differentials from either spelling', () => {
    expect(toText(ok(toDifferentials(e)).eq)).toBe('dy = xy dx');
    expect(toText(ok(toDifferentials(P('dy/dx = x y'))).eq)).toBe('dy = xy dx');
  });
  it('the Tab forms offer them where y′ is aimed', () => {
    const names = formsFor(e, idOf(e, n => n.name === 'y′')).map(f => `${f.chord} ${f.name}`);
    expect(names).toContain('y as dy/dx');
    expect(names).toContain('k as differentials');
  });
  it('integrates both sides once separated, and says what to divide by before', () => {
    const d = ok(toDifferentials(e)).eq;
    expect((integrateDifferentials(d) as { error: string }).error).toMatch(/^Divide both sides by y first/);
    const sep = ok(applyBothChecked(d, '/y')).eq;
    expect(toText(ok(integrateDifferentials(sep)).eq)).toBe('∫ 1/y dy = ∫ x dx');
    const xy = P('x dy = y dx');
    expect((integrateDifferentials(xy) as { error: string }).error).toMatch(/^Divide both sides by xy first/);
    const xySep = ok(applyBothChecked(xy, '/(x y)')).eq;
    expect(toText(ok(integrateDifferentials(xySep)).eq)).toBe('∫ 1/y dy = ∫ 1/x dx');
  });
  it('a ± e^C pair is one constant', () => {
    expect(toText(ok(absorbConstant(P('|y| = e^(x^2/2 + C)'), 'y')).eq)).toBe('y = Ce^(x^2/2)');
    expect(isErr(absorbConstant(P('|y| = e^(x^2/2)'), 'y') as never)).toBe(true);
  });
});
