// A parameter inside an integral (I(a) = ∫ … with a in it): substitutions, ends at ∞, limits.
import { describe, it, expect, beforeEach } from 'vitest';
import { parseEquation, parseExpr } from '../src/engine/parse';
import { LETS, DEFS } from '../src/engine/ast';
import { isErr, MoveResult, setDomains } from '../src/engine/moves';
import { toText } from '../src/engine/print';
import { differentialsBoth, subIn } from '../src/engine/general';
import { uSub, intStep } from '../src/engine/integrate';
import { plugIn } from '../src/engine/calcmoves';
import { simplify, newHints } from '../src/engine/simplify';

const T = (r: MoveResult) => (isErr(r) ? r.error : toText(r.eq));
beforeEach(() => { LETS.clear(); DEFS.clear(); setDomains({}); });

describe('a parameter inside an integral', () => {
  it('K45 du = x da + a dx subs into ∫ … dx: a is held fixed there, so da is 0', () => {
    setDomains({ a: 'positive' });
    LETS.set('u', parseExpr('a x'));
    const d = differentialsBoth(parseEquation('u = a x'));
    if (isErr(d)) throw new Error(d.error);
    expect(T(subIn(parseEquation('y = int_0^oo 1/(1 + u^2) dx'), d.eq, null, 'Equation 2'))).toBe('y = ∫_{0}^{∞} 1/(a(1 + u^2)) du');
  });
  it('K46 where u = ax goes at ∞ depends on the sign of a: said, and settled by a > 0', () => {
    const e = parseEquation('y = int_0^oo 1/(1 + (a x)^2) dx');
    expect(T(uSub(e, null).move)).toContain('depending on the sign of a');
    setDomains({ a: 'positive' });
    expect(T(uSub(e, null).move)).toBe('y = ∫_{0}^{∞} 1/((1 + u^2)a) du');
  });
  it('K47 a letter written outside the integral is a parameter of it, not tied to u', () => {
    setDomains({ a: 'positive' });
    LETS.set('u', parseExpr('a x'));
    expect(T(intStep(parseEquation('b = int 1/(a(1 + u^2)) du + a'), null))).not.toContain("isn't a constant");
  });
  it('K48 a limit at ∞ with another letter in it: each piece goes to its number', () => {
    expect(T(plugIn(parseEquation('y = lim_{u->oo} tan^-1(u)/a'), null))).toBe('y = π/(2a)');
  });
  it('|a| is a when a > 0', () => {
    setDomains({ a: 'positive' });
    expect(toText(simplify(parseExpr('abs(a)'), newHints()))).toBe('a');
    setDomains({});
    expect(toText(simplify(parseExpr('abs(a)'), newHints()))).toBe('|a|');
  });
});
