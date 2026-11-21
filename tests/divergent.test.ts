// An equation holding a piece with no value (a divergent ∫): moves around it, inside it, and names
// for it are still checked, and a name for the integral's letter subs in through its differentials.
import { describe, it, expect, beforeEach } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { Eq, walk, LETS, DEFS } from '../src/engine/ast';
import { isErr, MoveResult, applyMove, checked } from '../src/engine/moves';
import { toText } from '../src/engine/print';
import { nameIt, subIn } from '../src/engine/general';

const T = (e: Eq) => toText(e);
const idOf = (e: Eq, text: string): string => {
  let id: string | null = null;
  walk(e, n => { if (!id && n.k !== 'eq' && toText(n) === text) id = n.id; });
  if (!id) throw new Error(`no ${text} in ${T(e)}`);
  return id;
};
const ok = (r: MoveResult): Eq => { if (isErr(r)) throw new Error(r.error); return r.eq; };
const SRC = 'I = int_1^0 (x^2 + 1)/ln x dx';

beforeEach(() => { LETS.clear(); DEFS.clear(); });

describe('a divergent integral', () => {
  it('m and x work around it', () => {
    const e = parseEquation(SRC);
    const m = ok(applyMove('move', e, idOf(e, 'I')));
    expect(T(m)).toBe('0 = ∫_{1}^{0} (x^2 + 1)/ln(x) dx − I');
    expect(T(ok(applyMove('swap', m, null)))).toBe('∫_{1}^{0} (x^2 + 1)/ln(x) dx − I = 0');
  });
  it('a true rewrite inside it is allowed, a false one refused', () => {
    const e = parseEquation(SRC);
    const good = parseEquation('I = int_1^0 (x^2/ln x + 1/ln x) dx');
    const bad = parseEquation('I = int_1^0 (x^2 + 2)/ln x dx');
    const step = (to: Eq) => checked(e, { eq: to, label: 'test', hints: { seen: new Set() } as never, factor: () => 1, select: null });
    expect(isErr(step(good))).toBe(false);
    expect(isErr(step(bad))).toBe(true);
  });
  it('a bound can be named (the Feynman way)', () => {
    const e = parseEquation(SRC);
    let lo = '';
    walk(e, n => { if (n.k === 'int' && n.lo) lo = n.lo.id; });
    const n = nameIt(e, lo, 't');
    if ('error' in n) throw new Error(n.error);
    expect(T(n.step.eq)).toBe('I = ∫_{t}^{0} (x^2 + 1)/ln(x) dx');
  });
  it('a typed name for x subs in: dx, the integrand and the bounds (to −∞) all change', () => {
    const e = parseEquation(SRC);
    expect(T(ok(subIn(e, parseEquation('x = e^u'), null, 'Equation 2')))).toBe('I = ∫_{0}^{−∞} (e^u((e^u)^2 + 1))/u du');
  });
});

describe('a typed name for an integral\'s letter', () => {
  it('u = x² on ∫₀¹ x e^(x²) dx gives ∫₀¹ e^u/2 du', () => {
    const e = parseEquation('I = int_0^1 x e^(x^2) dx');
    expect(T(ok(subIn(e, parseEquation('u = x^2'), null, 'Equation 2')))).toBe('I = ∫_{0}^{1} e^u/2 du');
  });
});

describe('defining a function, any letter', () => {
  it('I(t) = … typed is a definition of I, not I times t', () => {
    const e = parseEquation('I(t) = int_0^1 (x^t - 1)/ln x dx');
    expect(e.rel).toBe('def');
    expect(T(e)).toBe('I(t) = ∫_{0}^{1} (x^t − 1)/ln(x) dx');
  });
  it('a letter times a bracket stays a product when the letter in it is not on the right', () => {
    expect(parseEquation('a(x) = 3').rel).not.toBe('def');
    expect(T(parseEquation('x(x+1) = 6'))).toBe('x(x + 1) = 6');
  });
  it('b with I(t) on the integral of I = ∫ …: the equation becomes the definition', () => {
    const e = parseEquation('I = int_0^1 (x^t - 1)/ln x dx');
    const n = nameIt(e, e.rhs.id, 'I(t)');
    if ('error' in n) throw new Error(n.error);
    expect(n.inPlace).toBe(true);
    expect(T(n.step.eq)).toBe('I(t) = ∫_{0}^{1} (x^t − 1)/ln(x) dx');
    expect(n.step.eq.rel).toBe('def');
  });
});
