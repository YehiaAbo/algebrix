// "Doing nothing" (user 2026-11-28): on the aimed piece, do something and undo it in one checked
// step: + n − n, × 2/2, ((x)²)^½, e^(ln x). A whole expression typed instead is "rewrite as".
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { isErr, CheckedResult } from '../src/engine/moves';
import { doNothing } from '../src/engine/general';

const at = (src: string, pick: (e: ReturnType<typeof parseEquation>) => string, text: string) => {
  const e = parseEquation(src);
  return doNothing(e, pick(e), text);
};
const txt = (r: CheckedResult) => (isErr(r) ? 'error: ' + r.error : toText(r.eq));
const conds = (r: CheckedResult) => (isErr(r) ? [] : r.conditions ?? []);

describe('do and undo on the aimed piece', () => {
  it('+ n − n, and − n + n', () => {
    expect(txt(at('y = x^2 + 2x', e => e.rhs.id, '+ 1'))).toBe('y = x^2 + 2x + 1 − 1');
    expect(txt(at('y = x^2 + 2x', e => e.rhs.id, '-1'))).toBe('y = x^2 + 2x − 1 + 1');
    expect(txt(at('y = 3x', e => e.rhs.id, '+ n'))).toBe('y = 3x + n − n');
  });
  it('× A/A and ÷ A × A', () => {
    expect(txt(at('y = 3x', e => e.rhs.id, '* 2'))).toBe('y = 3x·2/2');
    expect(txt(at('y = 3x', e => e.rhs.id, '/ 2'))).toBe('y = (3x/2)·2');
    // on a fraction, top and below (the e⁻ˣ trick before u = e⁻ˣ + 1)
    expect(txt(at('y = 1/(1 + e^x)', e => e.rhs.id, '* e^(-x)'))).toMatch(/^y = e\^\(?−x\)?\/\(/);
  });
  it('a power then its root, with the condition it needs', () => {
    const r = at('y = x + 1', e => e.rhs.id, '^2');
    expect(txt(r)).toBe('y = ((x + 1)^2)^(1/2)');
    expect(conds(r)).toEqual(['x + 1 ≥ 0']);
    // an odd power needs nothing
    const c = at('y = x + 1', e => e.rhs.id, '^3');
    expect(txt(c)).toBe('y = ((x + 1)^3)^(1/3)');
    expect(conds(c)).toEqual([]);
  });
  it('a function then its inverse: e^(ln x) needs x > 0; ln(e^x) needs nothing', () => {
    const r = at('y = x + 1', e => e.rhs.id, 'ln');
    expect(txt(r)).toBe('y = e^(ln(x + 1))');
    expect(conds(r)).toEqual(['x + 1 > 0']);
    const s = at('y = x', e => e.rhs.id, 'e^_');
    expect(txt(s)).toBe('y = ln(e^x)');
    expect(conds(s)).toEqual([]);
    const q = at('y = x', e => e.rhs.id, 'sqrt');
    expect(txt(q)).toBe('y = (sqrt(x))^2');
    expect(conds(q)).toEqual(['x ≥ 0']);
  });
  it('sin: sin⁻¹(sin x) is not x everywhere, so it goes the other way, sin(sin⁻¹ x) for −1 ≤ x ≤ 1', () => {
    const r = at('y = x', e => e.rhs.id, 'sin');
    expect(txt(r)).toBe('y = sin(sin⁻¹(x))');
    expect(conds(r)).toEqual(['−1 ≤ x ≤ 1']);
  });
  it('a whole expression is "rewrite as"', () => {
    expect(txt(at('y = x^2 - 1', e => e.rhs.id, '(x-1)(x+1)'))).toBe('y = (x − 1)(x + 1)');
    expect(txt(at('y = x^2 - 1', e => e.rhs.id, '= (x-1)(x+1)'))).toBe('y = (x − 1)(x + 1)');
    // a subscript is not a function's slot: ∫ from 0 to 1 is a form to rewrite as
    expect(txt(at('y = 1/2', e => e.rhs.id, 'int_{0}^{1} t dt'))).toBe('y = ∫_{0}^{1} t dt');
  });
  it('refusals say why', () => {
    expect(txt(at('y = x', () => 'eq', '+ 1'))).toMatch(/^error: Aim at/);
    expect(txt(at('y = x', e => e.rhs.id, '* 0'))).toMatch(/^error: .*0/);
    expect(txt(at('y = x', e => e.rhs.id, '^0'))).toMatch(/^error: /);
  });
});
