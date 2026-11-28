import { describe, it, expect } from 'vitest';
import { parseEquation, parseExpr } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { isErr, MoveOk, applyBothChecked } from '../src/engine/moves';
import { Eq, Node, walk } from '../src/engine/ast';
import { isolate, tidy, splitAbs, splitCases } from '../src/engine/isolate';
import { substitute } from '../src/engine/systems';
import { wrapBoth, peel, moveAny } from '../src/engine/wrap';
import { simplifySpot } from '../src/engine/spot';
import { evaluate } from '../src/engine/ast';

const T = (e: Node) => toText(e);
const idOf = (e: Eq, text: string): string => {
  let hit: string | null = null;
  walk(e, n => { if (!hit && n.k !== 'eq' && T(n) === text) hit = n.id; });
  if (!hit) throw new Error(`no node "${text}" in ${T(e)}`);
  return hit;
};
const ok = <R,>(r: R | { error: string }): R => { if (r && typeof r === 'object' && 'error' in (r as object)) throw new Error((r as { error: string }).error); return r as R; };
const last = (r: MoveOk[]) => T(r[r.length - 1].eq);

describe('functions', () => {
  it.each([
    ['sin(x) + cos x = 1', 'sin(x) + cos(x) = 1'],
    ['ln(x+1) = 2', 'ln(x + 1) = 2'],
    ['|x - 3| = 5', '|x − 3| = 5'],
    ['e^x = 4', 'e^x = 4'],
    ['exp(2x) = 4', 'e^(2x) = 4'],
    ['\\sqrt[3]{x} = 2', 'x^(1/3) = 2'],
    ['2pi r = 10', '2πr = 10'],
    ['\\left|x\\right| = 2', '|x| = 2'],
    ['|x| + |y| = 1', '|x| + |y| = 1'],
  ])('%s', (src, want) => expect(T(parseEquation(src))).toBe(want));
  it('evaluates constants', () => expect(evaluate(parseExpr('ln(e^2)'), {})).toBeCloseTo(2));
});

describe('isolate', () => {
  it.each([
    ['7y + 3x = 20', 'y', 'y = (20 − 3x)/7'],
    ['7y + 3x = 20', 'x', 'x = (20 − 7y)/3'],
    ['3x + 2 = x + 6', 'x', 'x = 2'],
    ['2(x + 3) = 10', 'x', 'x = 2'],
    ['(x + 1)/2 = 3', 'x', 'x = 5'],
    ['1/x + 1 = 3', 'x', 'x = 1/2'],
    ['a x + b x = c', 'x', 'x = c/(a + b)'],
    ['5 = 2x - 1', 'x', 'x = 3'],
    ['sqrt(x) = 4', 'x', 'x = 16'],
    ['e^x = 5', 'x', 'x = ln(5)'],
    ['ln(x) = 2', 'x', 'x = e^2'],
    ['-x = 4', 'x', 'x = −4'],
  ])('%s for %s', (src, v, want) => expect(last(ok(isolate(parseEquation(src), v)))).toBe(want));
  it.each([
    ['x^2 + x = 2', '(x − 1)(x + 2) = 0'],
    ['x^2 = 9', '|x| = 3'],
    ['x^2 + 2x - 1 = 0', '|x + 1| = sqrt(2)'],
    ['sqrt(x + 1) = x - 1', 'x(x − 3) = 0'],
    ['(2x + 1)/3 = (x - 1)/2', 'x = −5'],
    ['-3x/7 + 20/7 = y', 'x = (20 − 7y)/3'],
    ['2^x = 8', 'x = 3'],
    ['sin(x) = 1/2', 'x = π/6'],
    ['x^(-1) = 2', 'x = 1/2'],
    ['-2x = -4', 'x = 2'],
    ['x^3 = 4x', 'x(x − 2)(x + 2) = 0'],
    ['x^4 - 5x^2 + 4 = 0', '(x − 1)(x + 1)(x − 2)(x + 2) = 0'],
    ['2x^3 = x^2', 'x^2(2x − 1) = 0'],
    ['x^3 = 8', 'x = 2'],
  ])('%s ends at %s', (src, want) => expect(last(ok(isolate(parseEquation(src), 'x')))).toBe(want));
  it('stops when the variable cancels', () => expect(isErr(isolate(parseEquation('x - x + 1 = y'), 'x') as never)).toBe(true));
  it('a cubic with no nice factors says where it crosses instead of going round', () => {
    const r = isolate(parseEquation('x^3 = x + 1'), 'x') as { error: string };
    expect(r.error).toMatch(/^x³ − x − 1 = 0 has no nice factors.*x ≈ 1\.325/);
  });
  it.each([
    ['x^2 = -4', 'x² is never negative, so it can\'t be −4: no real x works.'],
    ['sqrt(x) = -1', '√x is never negative, so it can\'t be −1: no real x works.'],
    ['x^(1/2) = -3', 'x^(1/2) is never negative, so it can\'t be −3: no real x works.'],
    ['|x - 1| = -2', '|x − 1| is never negative, so it can\'t be −2: no real x works.'],
    ['e^x = 0', 'eˣ is always positive, so it can\'t be 0: no real x works.'],
    ['2^x = -8', '2ˣ is always positive, so it can\'t be −8: no real x works.'],
  ])('%s says why no x works, and never squares into a wrong answer', (src, why) => expect((isolate(parseEquation(src), 'x') as { error: string }).error).toBe(why));
  it('no real solutions', () => expect(isErr(isolate(parseEquation('x^2 + 1 = 0'), 'x') as never)).toBe(true));
});

describe('free arithmetic + tidy', () => {
  it('subtract then tidy', () => {
    const e = parseEquation('7y + 3x = 20');
    const r = ok(applyBothChecked(e, '-3x'));
    expect(T(ok(tidy(r.eq)!).eq)).toBe('7y = 20 − 3x');
  });
  it('divide then tidy', () => {
    const e = parseEquation('7y = 20 - 3x');
    const r = ok(applyBothChecked(e, '/7'));
    expect(T(tidy(r.eq)!.eq)).toBe('y = (20 − 3x)/7');
  });
});

describe('peel and wrap', () => {
  it('square root of a square gives |x|', () => {
    const r = ok(peel(parseEquation('x^2 = 9'), null));
    expect(T(tidy(r.eq)!.eq)).toBe('|x| = 3');
  });
  it('undoing cancels on its own side and leaves the other side for you', () => {
    expect(T(ok(peel(parseEquation('x^2 = 9'), null)).eq)).toBe('|x| = sqrt(9)');
    expect(T(ok(peel(parseEquation('e^(2x) = 5'), null)).eq)).toBe('2x = ln(5)');
  });
  it('splits |x| = 3', () => {
    const r = ok(splitAbs(parseEquation('|x - 1| = 3')));
    expect(T(r.a.eq)).toBe('x − 1 = 3');
    expect(T(r.b)).toBe('x − 1 = −3');
  });
  it('ln both sides', () => {
    const r = ok(wrapBoth(parseEquation('2^x = 8'), 'ln'));
    expect(T(tidy(r.eq)!.eq)).toBe('x ln(2) = 3 ln(2)');
  });
  it('m on a coefficient divides, on a denominator multiplies, on an exponent roots', () => {
    const e = parseEquation('7y = 20');
    expect(ok(moveAny(e, idOf(e, '7'))).label).toBe('÷ 7');
    const f = parseEquation('y/2 = 3');
    expect(ok(moveAny(f, idOf(f, '2'))).label).toBe('× 2');
    const g = parseEquation('x^3 = 8');
    expect(T(tidy(ok(moveAny(g, idOf(g, '3'))).eq)!.eq)).toBe('x = 2');
  });
});

describe('substitute', () => {
  it('plugs a solved equation in', () => {
    const a = parseEquation('x + y = 10'), b = parseEquation('y = 2x');
    const r = ok(substitute(a, b, null, '(2)'));
    expect(T(r.eq)).toBe('x + 2x = 10');
  });
  it('solves a copy when needed', () => {
    const a = parseEquation('2x + 3y = 12'), b = parseEquation('x - y = 1');
    const r = ok(substitute(a, b, 'x', '(2)'));
    expect(T(r.eq)).toBe('2(1 + y) + 3y = 12');
  });
});

describe('cases', () => {
  it('zero product splits into each factor', () => {
    const c = splitCases(parseEquation('(x - 2)(x + 3) = 0'))!;
    expect(T(c.first.eq)).toBe('x − 2 = 0');
    expect(c.rest.map(T)).toEqual(['x + 3 = 0']);
  });
  it('a number factor stays out of the cases', () => {
    const c = splitCases(parseEquation('2x(x - 1) = 0'))!;
    expect([T(c.first.eq), ...c.rest.map(T)]).toEqual(['x = 0', 'x − 1 = 0']);
  });
});

describe('function menu', () => {
  it('nth root of a 4th power', () => expect(T(tidy(ok(peel(parseEquation('x^4 = 16'), null)).eq)!.eq)).toBe('|x| = 2'));
  it('log base b', () => expect(T(tidy(ok(peel(parseEquation('3^x = 81'), null)).eq)!.eq)).toBe('x = 4'));
  it('power n typed in', () => expect(T(tidy(ok(wrapBoth(parseEquation('x^(1/5) = 2'), 'power', parseExpr('5'))).eq)!.eq)).toBe('x = 32'));
  it('arcsin needs |B| ≤ 1', () => expect(isErr(peel(parseEquation('sin(x) = 3'), null))).toBe(true));
  it('exact trig values', () => expect(T(tidy(parseEquation('y = sin(π/6) + cos(π/4)'))!.eq)).toBe('y = 1/2 + sqrt(2)/2'));
});

describe('simplify suggestions', () => {
  it('points at the terms that cancel', () => {
    const e = parseEquation('7y + 3x - 3x = 20 - 3x');
    const s = simplifySpot(e)!;
    expect(s.marks.map(id => T(walkFind(e, id)))).toEqual(['3x', '−3x']);
    expect(T(s.move.eq)).toBe('7y = 20 − 3x');
  });
  it('nothing to suggest on a tidy equation', () => expect(simplifySpot(parseEquation('7y = 20 - 3x'))).toBeNull());
  it('a small piece, not the whole side', () => {
    const e = parseEquation('x^2 + 2·3x = sqrt(9)');
    const s = simplifySpot(e)!;
    expect(T(walkFind(e, s.node))).toBe('2·3x');
  });
});
function walkFind(e: Eq, id: string): Node { let hit: Node | null = null; walk(e, n => { if (n.id === id) hit = n; }); return hit!; }
