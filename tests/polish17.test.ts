// Round 17's small things: answers that read like a textbook, the integrals and limits a first
// course meets, and constants of integration that stay one plain C.
import { describe, expect, it } from 'vitest';
import '../src/engine/calculus';
import { parseEquation, parseExpr } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { Eq } from '../src/engine/ast';
import { isErr, MoveOk } from '../src/engine/moves';
import { simplify, newHints } from '../src/engine/simplify';
import { isolate, tidy } from '../src/engine/techniques';
import { finishCalc, plugIn } from '../src/engine/calcmoves';
import { formsFor } from '../src/engine/forms';
import { absorbConstant, renameConstant, shareExponential } from '../src/engine/ode';

const P = (s: string) => parseEquation(s, true);
const S = (s: string) => toText(simplify(parseExpr(s), newHints()));
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
    ['int x/(x^2+1) dx', 'ln(x^2 + 1)/2 + C'], ['int 1/x^2 dx', '−1/x + C'], ['int 1/(3x) dx', 'ln(|x|)/3 + C'], ['int 1/sqrt(x) dx', '2 sqrt(x) + C'],
    ['int sin(x)^2 dx', 'x/2 − sin(2x)/4 + C'], ['int cos(3x)^2 dx', 'x/2 + sin(6x)/12 + C'],
    ['int 1/(x^2 + 3x + 2) dx', 'ln(|x + 1|) − ln(|x + 2|) + C'], ['int x/(x+1) dx', 'x − ln(|x + 1|) + C'],
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
