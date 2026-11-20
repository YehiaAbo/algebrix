// The next polish walk: odd typing, x gathered where there's more of it, and Tab forms
// for a lone expression (with the conditions a cancelled bottom leaves behind).
import { describe, expect, it } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { isolate } from '../src/engine/techniques';
import { formsFor } from '../src/engine/forms';
import '../src/engine/calculus';
import { parseExpr } from '../src/engine/parse';
import { simplify, newHints } from '../src/engine/simplify';
import { evaluate } from '../src/engine/ast';
import { finishCalc, lhopital } from '../src/engine/calcmoves';
import { separate } from '../src/engine/ode';
import { isErr } from '../src/engine/moves';
import { solveInequality } from '../src/engine/inequality';

const P = (s: string) => parseEquation(s, true);
const steps = (s: string, v = 'x') => { const r = isolate(P(s), v); if (!Array.isArray(r)) throw new Error(r.error); return r.map(m => m.label); };
const last = (s: string, v = 'x') => { const r = isolate(P(s), v); if (!Array.isArray(r)) throw new Error(r.error); return toText(r[r.length - 1].eq); };
const form = (s: string, name: string) => formsFor(P(s), null).find(f => f.name === name);

describe('typing', () => {
  it('reads log2(x) and log10 x as bases, as in code', () => {
    expect(toText(P('log2(x)=3'))).toBe('ln(x)/ln(2) = 3');
    expect(toText(P('log2x = 3'))).toBe('ln(x)/ln(2) = 3');
    expect(toText(P('log10(x)=2'))).toBe('log(x) = 2');
    expect(toText(P('log 2 = x'))).toBe('log(2) = x');
    expect(toText(P('log(2)x = 1'))).toBe('log(2)x = 1');
  });
});

describe('gathering x like by hand', () => {
  it('takes the smaller x term across, so nothing is divided by a negative', () => {
    expect(steps('x + 1 = 3x')).toEqual(['move x across', 'tidy', '÷ 2', 'swap sides']);
    expect(last('x + 1 = 3x')).toBe('x = 1/2');
    expect(steps('7 - x = 2x + 1').some(l => l.includes('−'))).toBe(true);
    expect(steps('7 - x = 2x + 1').some(l => l.startsWith('÷ −'))).toBe(false);
    expect(last('2x + 3 = 5x - 6')).toBe('x = 3');
    expect(steps('2x + 3 = 5x - 6')[0]).toBe('move 2x across');
  });
  it('still gathers on the left when the left has more', () => {
    expect(steps('3x - 4 = x + 2')[0]).toBe('move x across');
    expect(last('3x - 4 = x + 2')).toBe('x = 3');
  });
});

describe('|A| = 0', () => {
  it('is one case, not two', () => {
    expect(steps('|x-1| = 0')).toEqual(['|x − 1| = 0 only when x − 1 = 0', 'move −1 across']);
    expect(last('(x-1)^2 = 0')).toBe('x = 1');
  });
});

describe('Tab on a lone expression', () => {
  it('offers the whole expression its forms with nothing aimed', () => {
    expect(toText(form('(x^2-1)/(x-1)', 'factored')!.eq)).toBe('((x − 1)(x + 1))/(x − 1)');
    expect(toText(form('1/(x^2-1)', 'partial fractions')!.eq)).toBe('1/(2(x − 1)) − 1/(2(x + 1))');
    expect(toText(form('x^-2', 'as roots')!.eq)).toBe('1/(x^2)');
  });
  it('keeps the cancelled bottom as a condition', () => {
    expect(form('(x-1)(x+1)/(x-1)', 'simplified')!.conditions).toEqual(['x − 1 ≠ 0']);
    expect(form('x/x', 'simplified')!.conditions).toEqual(['x ≠ 0']);
    expect(form('1/(x^2-1)', 'partial fractions')!.conditions ?? []).toEqual([]);
  });
  it('combines logs, with where that holds', () => {
    const f = form('ln(x) + ln(y)', 'one log')!;
    expect(toText(f.eq)).toBe('ln(xy)');
    expect(f.chord).toBe('l');
    expect(f.conditions).toEqual(['x > 0', 'y > 0']);
    expect(toText(form('ln(2x) + ln(x)', 'one log')!.eq)).toBe('ln(2x^2)');
    expect(toText(form('ln(x) + ln(x-2) = ln(3)', 'one log')!.eq)).toBe('ln(x(x − 2)) = ln(3)');
  });
  it('reads sin x cos x as half of sin 2x', () => {
    expect(toText(form('sin(x)cos(x)', 'trig: double angle')!.eq)).toBe('sin(2x)/2');
  });
});

describe('powers with the same base', () => {
  const S = (s: string) => toText(simplify(parseExpr(s), newHints()));
  it('adds the exponents (eˣ·eˣ was once e², which only the safety net caught)', () => {
    expect(S('e^x e^x')).toBe('e^(2x)');
    expect(S('e^x e^(-x)')).toBe('1');
    expect(S('e^x e^(2x) e')).toBe('e^(3x + 1)');
    expect(S('x^n x')).toBe('x^(n + 1)');
    for (const s of ['e^x e^x', 'e^x(1 + e^x) - e^x e^x', '2^x 2^x']) {
      const n = parseExpr(s);
      expect(evaluate(simplify(n, newHints()), { x: -0.7 })).toBeCloseTo(evaluate(n, { x: -0.7 }), 9);
    }
  });
  it('keeps the sign an even power forgot: (y⁻²)^(1/2) is 1/|y|', () => {
    const n = parseExpr('(y^(-2))^(1/2)');
    expect(evaluate(simplify(n, newHints()), { y: -0.8 })).toBeCloseTo(1.25, 9);
  });
  it('keeps eˣ·eʸ apart, as separating needs it', () => {
    expect(S('e^x e^y')).toBe('e^xe^y');
  });
});

describe('calculus read-outs', () => {
  const done = (s: string) => { const r = finishCalc(P(s)); return toText(r.steps[r.steps.length - 1].eq); };
  it('integrates an exponential below by bringing it up', () => {
    expect(done('int 1/e^y dy')).toBe('−e^(−y) + C');
    expect(done('int 1/2^y dy')).toBe('−2^(−y)/ln(2) + C');
    expect(done('int x/e^x dx')).toBe('−xe^(−x) − e^(−x) + C');
  });
  it('writes F/a with the sign in front and one bottom', () => {
    expect(done('int 1/e^(2x) dx')).toBe('−e^(−2x)/2 + C');
    expect(done('int 3^(2x) dx')).toBe('3^(2x)/(2 ln(3)) + C');
    expect(done('int 1/(2-3x) dx')).toBe('−ln|2 − 3x|/3 + C');
  });
  it('separates e^(x + y) as eˣ·eʸ', () => {
    expect(isErr(separate(P("y' = e^(x+y)")))).toBe(false);
    expect(isErr(separate(P("y' = x e^(x-y)")))).toBe(false);
  });
});

describe('sign charts', () => {
  const chart = (s: string) => { const r = solveInequality(P(s), 'x'); return 'error' in r ? r.error : r.text; };
  it('names e, ln 2, √2 and log ratios', () => {
    expect(chart('e^x > 2')).toBe('x ∈ (ln 2, ∞)');
    expect(chart('ln(x) < 1')).toBe('x ∈ (0, e)');
    expect(chart('x^2 >= 3')).toBe('x ∈ (−∞, −√3] ∪ [√3, ∞)');
    expect(chart('2^x <= 10')).toBe('x ∈ (−∞, ln 10/ln 2]');
  });
  it("doesn't take a float overflow for an end (eˣ past 709)", () => {
    expect(chart('e^x > 2')).not.toContain('709');
  });
  it('gives a repeating answer once, with + 2kπ', () => {
    expect(chart('sin(x) > 0')).toBe('x ∈ (2kπ, π + 2kπ), for any whole number k');
    expect(chart('2sin(x) + 1 > 0')).toBe('x ∈ (−π/6 + 2kπ, 7π/6 + 2kπ), for any whole number k');
    expect(chart('tan(x) > 1')).toBe('x ∈ (π/4 + kπ, π/2 + kπ), for any whole number k');
    expect(chart('sin(x) >= 1')).toBe('x = π/2 + 2kπ, for any whole number k');
    expect(chart('sin(x) > 2')).toBe('no solution');
    expect(chart('sin(x) <= 1')).toBe('every real x');
  });
  it('charts a mix of trig and x the usual way', () => {
    expect(chart('sin(x) > x/10')).toContain('∪');
  });
});

describe('roots and powers of numbers', () => {
  const S = (s: string) => toText(simplify(parseExpr(s), newHints()));
  it('works out whole rational powers', () => {
    expect(S('8^(2/3)')).toBe('4');
    expect(S('9^(3/2)')).toBe('27');
    expect(S('4^(-1/2)')).toBe('1/2');
    expect(S('2^(1/3)')).toBe('2^(1/3)');
  });
  it('takes odd roots of negatives, as real numbers', () => {
    expect(S('(-8)^(1/3)')).toBe('−2');
    expect(S('cbrt(-27)')).toBe('−3');
    expect(evaluate(parseExpr('(-8)^(1/3)'), {})).toBeCloseTo(-2, 12);
    expect(evaluate(parseExpr('(-8)^(2/3)'), {})).toBeCloseTo(4, 12);
  });
  it('brings squares out of roots', () => {
    expect(S('sqrt(3)^3')).toBe('3 sqrt(3)');
    expect(S('sqrt(x^4)')).toBe('x^2');
    expect(S('sqrt(x^6)')).toBe('|x^3|');
    expect(S('sqrt(4x^2)')).toBe('2·|x|');
    expect(S('sqrt(2x^2)')).toBe('sqrt(2)·|x|');
  });
});

describe('odd roots in solving', () => {
  it('cube-roots a negative side', () => {
    expect(last('x^3 = -8')).toBe('x = −2');
    expect(last('(x-1)^3 = -1')).toBe('x = 0');
  });
});

describe('limits in two letters', () => {
  const run = (s: string) => { const r = finishCalc(P(s)); const m = r.steps[r.steps.length - 1]; return m.answer ?? toText(m.eq); };
  it('reads (x, y) → (a, b) and prints it back', () => {
    expect(toText(P('lim (x,y)->(0,0) (x^2 + y^2)'))).toBe('lim_{(x,y)→(0,0)} (x^2 + y^2)');
    expect(toText(P('lim_{(x,y)→(1,2)} x y'))).toBe('lim_{(x,y)→(1,2)} xy');
  });
  it('plugs in where it is continuous', () => {
    expect(run('lim_{(x,y)→(1,2)} x y')).toBe('2');
    expect(run('lim (x,y)->(0,0) e^(x+y)')).toBe('1');
  });
  it('squeezes when every path and circle agree', () => {
    expect(run('lim (x,y)->(0,0) x^2 y/(x^2+y^2)')).toBe('0');
    expect(run('lim (x,y)->(0,0) sin(x^2+y^2)/(x^2+y^2)')).toBe('1');
  });
  it('names two paths that disagree', () => {
    expect(run('lim (x,y)->(0,0) xy/(x^2+y^2)')).toBe('no limit: along y = 0 it nears 0, but along y = x it nears 1/2');
    expect(run('lim (x,y)->(0,0) x y^2/(x^2+y^4)')).toContain('along x = y² it nears 1/2');
  });
  it("won't take L'Hôpital", () => {
    expect(isErr(lhopital(P('lim (x,y)->(0,0) xy/(x^2+y^2)'), null))).toBe(true);
  });
});

describe('vectors typed with < >', () => {
  it('reads <1, 2> as ⟨1, 2⟩ but x < 3 as less-than', () => {
    expect(toText(P('div <x, y, z>'))).toBe('∇·⟨x, y, z⟩');
    expect(toText(P('x < 3'))).toBe('x < 3');
  });
});
