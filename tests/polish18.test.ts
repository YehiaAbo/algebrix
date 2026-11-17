// The next polish walk: odd typing, x gathered where there's more of it, and Tab forms
// for a lone expression (with the conditions a cancelled bottom leaves behind).
import { describe, expect, it } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { isolate } from '../src/engine/techniques';
import { formsFor } from '../src/engine/forms';

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
