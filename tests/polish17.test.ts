// Round 17's small things: answers that read like a textbook, the integrals and limits a first
// course meets, and constants of integration that stay one plain C.
import { describe, expect, it } from 'vitest';
import '../src/engine/calculus';
import { parseEquation, parseExpr } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { Eq, walk } from '../src/engine/ast';
import { isErr, MoveOk, neverZero } from '../src/engine/moves';
import { simplify, newHints } from '../src/engine/simplify';
import { isolate, tidy, splitCases, everyTrigSolution } from '../src/engine/techniques';
import { finishCalc, plugIn } from '../src/engine/calcmoves';
import { formsFor } from '../src/engine/forms';
import { absorbConstant, renameConstant, shareExponential, generalSolution, odeKind, separate } from '../src/engine/ode';
import { asPrime, slopeVar, toLeibniz, toPrime } from '../src/engine/leibniz';

const P = (s: string) => parseEquation(s, true);
const S = (s: string) => toText(simplify(parseExpr(s), newHints()));
const idOf = (e: Eq, test: (n: { k: string; name?: string }) => boolean) => { let id = ''; walk(e, n => { if (!id && test(n as never)) id = n.id; }); return id; };
const ok = (r: unknown) => { if (isErr(r as never)) throw new Error((r as { error: string }).error); return r as MoveOk; };
const solved = (s: string) => { const r = isolate(P(s), 'x'); if (!Array.isArray(r)) throw new Error(r.error); return toText(r[r.length - 1].eq); };
/** what e ends on: every piece of calculus worked out, then simplified, as the app does */
function finish(s: string): string {
  const { steps, stuck } = finishCalc(P(s));
  if (stuck) throw new Error(stuck);
  let e: Eq = steps[steps.length - 1].eq;
  const f = formsFor(e, null).find(x => x.name === 'simplified' || x.name === 'expanded');
  if (f) e = f.eq;
  else { const t = tidy(e); if (t) e = t.eq; }
  return toText(e);
}

describe('simplify reads like a textbook', () => {
  it.each([
    ['e^(5 ln(2))', '32'], ['e^(2 ln(x))', 'x^2'], ['e^(-ln(3))', '1/3'],
    ['x^3/x^2', 'x'], ['x/x^3', '1/(x^2)'], ['(x^2 y)/(x y^2)', 'x/y'], ['x^2/(-x)', '−x'], ['-x/(-y)', 'x/y'],
    ['-ln(3)/(ln(2) - ln(3))', 'ln(3)/(ln(3) − ln(2))'], ['-3/(2 - x)', '3/(x − 2)'], ['1/(1 - x)', '1/(1 − x)'],
    ['abs(x^2 + 1)', 'x^2 + 1'], ['abs(e^x + 1)', 'e^x + 1'], ['abs(x - 1)', '|x − 1|'],
  ])('%s is %s', (src, want) => expect(S(src)).toBe(want));
});

describe('solving with letters underneath and in powers', () => {
  it.each([
    ['2/(x+1) = 1/x', 'x = 1'], ['3/x = 6', 'x = 1/2'], ['2^x = 3^(x-1)', 'x = ln(3)/(ln(3) − ln(2))'],
  ])('%s gives %s', (src, want) => expect(solved(src)).toBe(want));
  it('1/(x−1) + 1/(x+1) = 1 clears both fractions at once', () => {
    const r = isolate(P('1/(x-1) + 1/(x+1) = 1'), 'x');
    expect(Array.isArray(r) && r.some(s => /clear/.test(s.label))).toBe(true);
  });
});

describe('integrals a first course meets', () => {
  it.each([
    ['int 1/(x^2 + 1) dx', 'tan⁻¹(x) + C'], ['int 1/(4 + x^2) dx', 'tan⁻¹(x/2)/2 + C'], ['int 1/sqrt(9 - x^2) dx', 'sin⁻¹(x/3) + C'],
    ['int x/(x^2+1) dx', 'ln(x^2 + 1)/2 + C'], ['int 1/x^2 dx', '−1/x + C'], ['int 1/(3x) dx', 'ln|x|/3 + C'], ['int 1/sqrt(x) dx', '2 sqrt(x) + C'],
    ['int sin(x)^2 dx', 'x/2 − sin(2x)/4 + C'], ['int cos(3x)^2 dx', 'x/2 + sin(6x)/12 + C'],
    ['int 1/(x^2 + 3x + 2) dx', 'ln|x + 1| − ln|x + 2| + C'], ['int x/(x+1) dx', 'x − ln|x + 1| + C'],
  ])('%s = %s', (src, want) => expect(finish(src)).toBe(want));
  it('∫₀^π sin² is π/2', () => expect(finish('int_0^pi sin(x)^2 dx')).toBe('π/2'));
});

describe('limits of powers and products', () => {
  it.each([
    ['lim x->inf (1 + 1/x)^x', 'e'], ['lim x->inf (1 + 2/x)^x', 'e^2'], ['lim x->0 (1+x)^(1/x)', 'e'],
    ['lim x->0+ x^x', '1'], ['lim x->0+ x ln(x)', '0'],
  ])('%s = %s', (src, want) => expect(finish(src)).toBe(want));
  it('a limit that only exists from one side says which side', () => {
    for (const s of ['lim x->0 sqrt(x)', 'lim x->0 x ln(x)']) expect((plugIn(P(s), null) as { error: string }).error).toMatch(/right of x = 0.*x→0\+/);
  });
  it('0⁰ is a form, not 1', () => expect((plugIn(P('lim x->0+ x^x'), null) as { error: string }).error).toMatch(/0⁰/));
});

describe('one plain constant of integration', () => {
  it('2C, C/3 and −C are each just C', () => {
    expect(toText(ok(renameConstant(P('y = sqrt(2C - x^2)'))).eq)).toBe('y = sqrt(C − x^2)');
    expect(toText(ok(renameConstant(P('y = x^2 + C/3'))).eq)).toBe('y = x^2 + C');
    expect(isErr(renameConstant(P('y = 1/(C - x^2)')))).toBe(true);
    expect(toText(ok(renameConstant(P('y = 1/(-x^2/2 - C)'))).eq)).toBe('y = 1/(−x^2/2 + C)');
  });
  it('|y| = e^(g + C) is one family y = C e^g, signs and all', () => {
    expect(toText(ok(absorbConstant(P('abs(y) = e^(x^2/2 + C)'), 'y')).eq)).toBe('y = Ce^(x^2/2)');
    expect(toText(ok(absorbConstant(P('abs(y) = abs(x) e^C'), 'y')).eq)).toBe('y = Cx');
  });
  it('an exponential bottom is shared out over the top', () => {
    expect(toText(ok(shareExponential(P('y = (e^(3x)/3 + C)/e^(2x)'))).eq)).toBe('y = e^x/3 + Ce^(−2x)');
  });
});

describe('the second derivative in Leibniz notation', () => {
  it.each([
    ['d^2y/dx^2 + y = 0', 'd²y/dx^2 + y = 0'], ['d²y/dx² = -y', 'd²y/dx^2 = −y'], ['\\frac{d^2y}{dx^2} = 4y', 'd²y/dx^2 = 4y'],
    ['d^2y/dx^2 - 3 dy/dx + 2y = 0', 'd²y/dx^2 − 3 dy/dx + 2y = 0'], ['d^2x/dt^2 = -x', 'd²x/dt^2 = −x'],
  ])('%s reads as %s, and reads back the same', (src, want) => {
    const e = P(src);
    expect(toText(e)).toBe(want);
    expect(toText(P(toText(e, true)))).toBe(want);
    expect(toText(P(toText(e)))).toBe(want);
  });
  it('the methods read it as y″, in the variable it names', () => {
    expect(toText(asPrime(P('d^2y/dx^2 - 3 dy/dx + 2y = 0')))).toBe('y″ − 3y′ + 2y = 0');
    expect(slopeVar(P('d^2x/dt^2 = -4x'))).toBe('t');
    expect(slopeVar(P("x'' = -4x"))).toBeUndefined();
    expect(toText(generalSolution(asPrime(P('d^2x/dt^2 = -4x')), 't') as Eq)).toBe('x = C_1 cos(2t) + C_2 sin(2t)');
  });
  it('aimed y″ is d²y/dx², and back', () => {
    const e = P("y'' + y = 0");
    const yy = idOf(e, n => n.k === 'sym' && n.name === 'y″');
    const l = ok(toLeibniz(e, yy));
    expect(toText(l.eq)).toBe('d²y/dx^2 + y = 0');
    expect(toText(ok(toPrime(l.eq, idOf(l.eq, n => n.k === 'frac'))).eq)).toBe('y″ + y = 0');
  });
});

describe('small readings', () => {
  it('y′ = −ky: k is a constant, x the variable, and −kx reads constant first', () => {
    expect(odeKind(P("y' = -k y"))).toBe('separable');
    const s = ok(separate(P("y' = -k y")));
    expect(toText(s.eq)).toBe('∫ 1/y dy = ∫ (−k) dx');
    expect(finishCalc(s.eq).steps.map(x => toText(x.eq)).pop()).toBe('ln|y| = −kx + C');
  });
  it('nothing that cannot be 0 is noted as ≠ 0', () => {
    for (const s of ['e^(2x)', 'x^2 + 1', '3e^x', '2^x', '(x^2+1)^2']) expect(neverZero(parseExpr(s)), s).toBe(true);
    for (const s of ['x', 'x^2', 'x - 1', 'sin(x)', 'x^2 - 1', 'sqrt(x)']) expect(neverZero(parseExpr(s)), s).toBe(false);
  });
});

describe('algebra walk', () => {
  it.each([
    ['ln(x) + ln(x - 2) = ln(3)', 'ln a + ln b = ln(ab)'], ['ln(x + 1) - ln(x) = 1', 'ln a − ln b = ln(a/b)'], ['log(x) + log(x - 3) = 1', 'log a + log b = log(ab)'],
  ])('%s starts by combining the logs', (src, label) => {
    const r = isolate(P(src), 'x');
    expect(Array.isArray(r) && r[0].label).toBe(label);
  });
  it('every bottom clears at once, numbers too', () => {
    const r = isolate(P('1/x + 1/(x+1) = 5/6'), 'x');
    expect(Array.isArray(r) && r[0].label).toBe('× 6x(x + 1) to clear fractions');
    const q = isolate(P('x/2 + 3/x = 2'), 'x');
    expect(Array.isArray(q) && q[0].label).toBe('× 2x to clear fractions');
    expect((q as { stuck?: string }).stuck).toMatch(/no real solutions/);
  });
  it('|A| = |B| is two cases, A = B or A = −B', () => {
    expect(isolate(P('|x - 1| = |2x|'), 'x')).toEqual([]);
    const c = splitCases(P('|x - 1| = |2x|'), 'x')!;
    expect(toText(c.first.eq)).toBe('x − 1 = 2x');
    expect(c.rest.map(e => toText(e))).toEqual(['x − 1 = −2x']);
  });
  it('a whole number reads first in an answer: 1 + √2', () => {
    const c = splitCases(P('|x - 1| = sqrt(2)'), 'x')!;
    for (const e of [c.first.eq, ...c.rest]) { const r = isolate(e, 'x') as MoveOk[]; expect(toText(r[r.length - 1].eq)).toMatch(/^x = 1 [+−] sqrt\(2\)$/); }
  });
  it('2x² = 1 takes the root and rationalizes: √2/2', () => {
    const r = isolate(P('2x^2 = 1'), 'x');
    expect(Array.isArray(r) && r.map(s => s.label)).not.toContain('complete the square');
    expect(S('sqrt(1/2)')).toBe('sqrt(2)/2');
    expect(S('sqrt(3/2)')).toBe('sqrt(6)/2');
  });
});

describe('every solution of a trig equation', () => {
  const every = (src: string) => {
    const r = isolate(P(src), 'x') as MoveOk[];
    const peeled = r.find(s => /⁻¹ both sides$/.test(s.label))!;
    return everyTrigSolution(peeled.eq, r[r.length - 1].eq, 'x');
  };
  it.each([
    ['sin(x) = 1/2', 'x = π/6 + 2kπ or x = 5π/6 + 2kπ'],
    ['cos(x) = 1/2', 'x = π/3 + 2kπ or x = −π/3 + 2kπ'],
    ['tan(x) = 1', 'x = π/4 + kπ'],
    ['sin(2x) = 1/2', 'x = π/12 + kπ or x = 5π/12 + kπ'],
    ['cos(x) = 1', 'x = 2kπ'],
    ['sin(x) = 1', 'x = π/2 + 2kπ'],
    ['cos(3x - 1) = 0', 'x = (π/2 + 1)/3 + 2kπ/3 or x = (−π/2 + 1)/3 + 2kπ/3'],
  ])('%s: %s', (src, want) => expect(every(src)).toBe(`every solution: ${want}, for any whole number k`));
});
