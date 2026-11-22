// fold: unfold backwards. A piece written like a function you defined becomes that function of something.
import { describe, it, expect, beforeEach } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { DEFS, Eq, walk } from '../src/engine/ast';
import { isErr } from '../src/engine/moves';
import { toText } from '../src/engine/print';
import { fold, unfold } from '../src/engine/goals';

const def = (src: string) => { const d = parseEquation(src); if (d.lhs.k === 'call' && d.lhs.arg.k === 'sym') DEFS.set(d.lhs.name, { param: d.lhs.arg.name, body: d.rhs }); };
const idOf = (e: Eq, text: string) => { let id = ''; walk(e, n => { if (!id && n.k !== 'eq' && toText(n) === text) id = n.id; }); return id; };
const T = (r: ReturnType<typeof fold>) => (isErr(r) ? r.error : toText(r.eq));

beforeEach(() => DEFS.clear());

describe('fold', () => {
  it('the Feynman integral at 5 is I(5), and unfolds back', () => {
    def('I(t) = int_0^1 (x^t - 1)/ln x dx');
    const e = parseEquation('y = int_0^1 (x^5 - 1)/ln x dx');
    const r = fold(e, idOf(e, '∫_{0}^{1} (x^5 − 1)/ln(x) dx'));
    expect(T(r)).toBe('y = I(5)');
    if (isErr(r)) return;
    expect(toText((unfold(r.eq, null) as { eq: Eq }).eq)).toBe('y = ∫_{0}^{1} (x^5 − 1)/ln(x) dx');
  });
  it('any argument: f(x) = x^2 + 1 folds (a + b)^2 + 1 into f(a + b)', () => {
    def('f(x) = x^2 + 1');
    const e = parseEquation('y = (a + b)^2 + 1');
    expect(T(fold(e, e.rhs.id))).toBe('y = f(a + b)');
  });
  it('one letter must read the same everywhere it sits', () => {
    def('g(x) = x^2 + x');
    const e = parseEquation('y = 3^2 + 4');
    expect(isErr(fold(e, e.rhs.id))).toBe(true);
  });
});

describe('fold finds the piece itself (K43)', () => {
  it('aimed inside the integral, it folds the integral around the aim', () => {
    def('I(t) = int_0^1 (x^t - 1)/ln x dx');
    const e = parseEquation('int_0^1 (x^0 - 1)/ln x dx = ln|0 + 1| + C');
    expect(T(fold(e, idOf(e, 'x^0')))).toBe('I(0) = ln|0 + 1| + C');
  });
  it('nothing aimed: the first piece that folds', () => {
    def('f(x) = x^2 + 1');
    const e = parseEquation('y = 3((a + b)^2 + 1)');
    expect(T(fold(e, null))).toBe('y = 3f(a + b)');
  });
  it('nothing that folds says so', () => {
    def('f(x) = x^2 + 1');
    expect(T(fold(parseEquation('y = 2x'), null))).toContain('Nothing here');
  });
});
