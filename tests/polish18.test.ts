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
import { finishCalc } from '../src/engine/calcmoves';
import { separate } from '../src/engine/ode';
import { isErr } from '../src/engine/moves';

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
