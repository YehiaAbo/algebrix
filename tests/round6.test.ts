import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { applyMove, MoveOk } from '../src/engine/moves';
import { Eq, Node, walk } from '../src/engine/ast';
import { group, ungroup, rangeOf } from '../src/engine/select';
import { moveAny } from '../src/engine/techniques';

const T = (e: Node) => toText(e);
const idOf = (e: Eq, text: string): string => {
  let hit: string | null = null;
  walk(e, n => { if (!hit && n.k !== 'eq' && T(n) === text) hit = n.id; });
  if (!hit) throw new Error(`no node "${text}" in ${T(e)}`);
  return hit;
};
const ok = <R,>(r: R | { error: string }): R => { if (r && typeof r === 'object' && 'error' in (r as object)) throw new Error((r as { error: string }).error); return r as R; };

/** group the named neighbouring pieces, run a move on the group, dissolve the group */
function onRange(src: string, names: string[], run: (e: Eq, id: string) => MoveOk | { error: string }) {
  const e = parseEquation(src);
  const g = ok(group(e, names.map(n => idOf(e, n))));
  expect(T(g.eq)).toBe(T(e)); // grouping never changes what you see
  const r = ok(run(g.eq, g.id));
  return T(ungroup(r.eq));
}

describe('partial selections', () => {
  it('moves two of three terms across', () => {
    expect(onRange('2x + 3 + 5 = 10', ['3', '5'], (e, id) => moveAny(e, id))).toBe('2x = 10 − 3 − 5');
  });
  it('simplifies only part of a sum', () => {
    expect(onRange('2x + 3 + 5 + y = 1', ['3', '5'], (e, id) => applyMove('simplify', e, id))).toBe('2x + 8 + y = 1');
  });
  it('factors only part of a sum', () => {
    expect(onRange('2x + 4y + 3 = 1', ['2x', '4y'], (e, id) => applyMove('factor', e, id))).toBe('2(x + 2y) + 3 = 1');
  });
  it('groups neighbouring factors', () => {
    expect(onRange('2xy = 6', ['x', 'y'], (e, id) => moveAny(e, id))).toBe('2 = 6/(xy)');
  });
  it('keeps negative terms readable', () => {
    expect(onRange('x - 3 - 4 = 0', ['−3', '−4'], (e, id) => applyMove('simplify', e, id))).toBe('x − 7 = 0');
  });
  it('refuses pieces that are not neighbours in one sum', () => {
    const e = parseEquation('a + b = c + d');
    expect('error' in group(e, [idOf(e, 'a'), idOf(e, 'c')])).toBe(true);
  });
  it('fills a run between two picks', () => {
    const e = parseEquation('a + b + c + d = 0');
    const r = ok(rangeOf(e, [idOf(e, 'a'), idOf(e, 'c')]));
    expect(r.ids.length).toBe(3);
  });
});

import { direction } from '../src/engine/moves';
import { wrapBoth } from '../src/engine/techniques';
describe('step records', () => {
  it('marks squaring both sides as one-way', () => {
    const r = ok(wrapBoth(parseEquation('sqrt(x) = x - 2'), 'square'));
    expect(direction(r)).toBe('⇒');
  });
  it('marks moving a term as reversible, with its rule', () => {
    const e = parseEquation('x + 3 = 5');
    const r = ok(applyMove('move', e, idOf(e, '3')));
    expect(direction(r)).toBe('⇔');
    expect(r.rule).toBe('move');
  });
});

import { longDivide, partialFractions, rationalize, trigForms } from '../src/engine/polytools';
import { parseExpr } from '../src/engine/parse';
import { evaluate } from '../src/engine/ast';
const same = (a: Node, b: Node) => {
  for (const x of [0.37, 1.9, -2.3, 4.1]) {
    const p = evaluate(a, { x }), q = evaluate(b, { x });
    if (Number.isFinite(p) && Number.isFinite(q)) expect(p).toBeCloseTo(q, 9);
  }
};
const E = (s: string) => parseExpr(s);
describe('polynomial tools', () => {
  it.each([
    ['(x^2 + 3x + 5)/(x + 1)', 'x + 2 + 3/(x + 1)'],
    ['(x^3 - 1)/(x - 1)', 'x^2 + x + 1'],
    ['(2x^2 + 3)/(x - 2)', '2x + 4 + 11/(x − 2)'],
  ])('long division %s', (src, want) => {
    const r = longDivide(E(src))!;
    expect(T(r)).toBe(want);
    same(r, E(src));
  });
  it.each([
    ['1/(x^2 - 1)', '1/(2(x − 1)) − 1/(2(x + 1))'],
    ['(3x + 5)/((x + 1)(x + 2))', '2/(x + 1) + 1/(x + 2)'],
    ['(x + 7)/(x^2 - x - 6)', '2/(x − 3) − 1/(x + 2)'],
    // a repeated factor gets a term for each power (playtest A13)
    ['(5x^2 + 20x + 8)/(2x(x + 1)^2)', '4/x − 3/(2(x + 1)) + 7/(2(x + 1)^2)'],
    ['1/(x^2(x - 1))', '1/(x − 1) − 1/x − 1/(x^2)'],
  ])('partial fractions %s', (src, want) => {
    const r = partialFractions(E(src))!;
    expect(T(r)).toBe(want);
    same(r, E(src));
  });
  it.each([
    ['1/sqrt(2)', 'sqrt(2)/2'],
    ['3/(2 sqrt(x))', '3 sqrt(x)/(2x)'],
    ['1/(1 + sqrt(2))', '(1 − sqrt(2))/(−1)'],
  ])('rationalize %s', (src, want) => {
    const r = rationalize(E(src))!;
    expect(T(r)).toBe(want);
    same(r, E(src));
  });
  it('offers trig identities', () => {
    const names = (s: string) => trigForms(E(s)).map(f => T(f.node));
    expect(names('tan(x)')).toContain('sin(x)/cos(x)');
    expect(names('sin(2x)')).toContain('2 sin(x) cos(x)');
    expect(names('cos(2x)')).toEqual(expect.arrayContaining(['cos(x)^2 − sin(x)^2', '1 − 2 sin(x)^2', '2 cos(x)^2 − 1']));
    expect(names('sin(x)^2 + cos(x)^2')).toContain('1');
    expect(names('1 - sin(x)^2')).toContain('cos(x)^2');
    for (const s of ['tan(x)', 'sin(2x)', 'cos(2x)', 'sin(x)^2', 'sin(x + 1)']) for (const f of trigForms(E(s))) same(f.node, E(s));
  });
});

import { formsFor } from '../src/engine/forms';
describe('new forms in the e menu', () => {
  it('parses cos(x)^2 as a power of cos', () => expect(T(parseEquation('cos(x)^2 = 1'))).toBe('cos(x)^2 = 1'));
  it.each([
    ['(x^2 + 3x + 5)/(x + 1) = y', '(x^2 + 3x + 5)/(x + 1)', 'long division'],
    ['1/(x^2 - 1) = y', '1/(x^2 − 1)', 'partial fractions'],
    ['1/sqrt(2) = y', '1/sqrt(2)', 'rationalized'],
    ['sin(2x) = y', 'sin(2x)', 'trig: double angle'],
  ])('%s offers %s', (src, piece, name) => {
    const e = parseEquation(src);
    expect(formsFor(e, idOf(e, piece)).map(f => f.name)).toContain(name);
  });
});

import { applyBothChecked } from '../src/engine/moves';
import { eliminate } from '../src/engine/techniques';
describe('elimination', () => {
  const two = parseEquation('x - y = 1');
  it('adds a multiple of another equation', () => {
    const e = parseEquation('2x + y = 8');
    const r = ok(applyBothChecked(e, '+#2', [e, two]));
    expect(T(r.eq)).toBe('2x + y + x − y = 8 + 1');
  });
  it('subtracts k times another equation', () => {
    const e = parseEquation('2x + y = 8');
    const r = ok(applyBothChecked(e, '-2#2', [e, two]));
    expect(T(r.eq)).toBe('2x + y − 2x + 2y = 8 − 2');
  });
  it('picks the multiple that cancels a variable', () => {
    const r = ok(eliminate(parseEquation('2x + 3y = 12'), parseEquation('x - y = 1'), 2, 'x'));
    expect(T(r.eq)).toBe('2x + 3y − 2x + 2y = 12 − 2');
  });
  it('refuses a missing equation', () => {
    expect('error' in applyBothChecked(parseEquation('x = 1'), '+#3', [two, two])).toBe(true);
  });
});

import { solveInequality } from '../src/engine/inequality';
import { isolate } from '../src/engine/techniques';
describe('inequalities', () => {
  it.each([
    ['x < 3', 'x < 3'], ['2x >= 5', '2x ≥ 5'], ['x <= 1', 'x ≤ 1'], ['\\frac{1}{x} \\geq 2', '1/x ≥ 2'],
  ])('parses %s', (src, want) => expect(T(parseEquation(src))).toBe(want));
  it('keeps the direction when dividing by a positive number', () => {
    const e = parseEquation('2x < 6');
    expect(T(ok(applyMove('divide', e, idOf(e, '2'))).eq)).toBe('x < 6/2');
  });
  it('flips when dividing by a negative number', () => {
    const e = parseEquation('-2x < 6');
    expect(T(ok(applyMove('divide', e, idOf(e, '−2'))).eq)).toBe('x > 6/(−2)');
  });
  it('flips when swapping sides', () => {
    const e = parseEquation('3 < x');
    expect(T(ok(applyMove('swap', e, null)).eq)).toBe('x > 3');
  });
  it('refuses dividing by something of unknown sign', () => {
    const e = parseEquation('x y < 6');
    expect('error' in applyMove('divide', e, idOf(e, 'y'))).toBe(true);
  });
  it('solves a linear inequality by moves', () => {
    expect(last(ok(isolate(parseEquation('-2x + 3 < 7'), 'x')))).toMatch(/^x > /);
  });
  it.each([
    ['x^2 - 5x + 6 > 0', 'x ∈ (−∞, 2) ∪ (3, ∞)'],
    ['(x - 1)/(x + 2) >= 0', 'x ∈ (−∞, −2) ∪ [1, ∞)'],
    ['x^2 + 1 < 0', 'no solution'],
    ['x^2 >= 0', 'every real x'],
    ['2x + 3 < 7', 'x ∈ (−∞, 2)'],
    ['x^2 <= 4', 'x ∈ [−2, 2]'],
    ['x^3 - x > 0', 'x ∈ (−1, 0) ∪ (1, ∞)'],
    ['ln(x) < 1', 'x ∈ (0, e)'],
    ['x^2 < 2', 'x ∈ (−√2, √2)'],
  ])('sign chart %s', (src, want) => expect(ok(solveInequality(parseEquation(src), 'x')).text).toBe(want));
});

const last = (r: MoveOk[]) => T(r[r.length - 1].eq);

import { DEFS } from '../src/engine/ast';
import { unfold, inverseFunction, isIdentity, isProved } from '../src/engine/goals';
describe('expressions, proofs and named functions', () => {
  it('parses a lone expression', () => expect(T(parseEquation('x^2 + 2x', true))).toBe('x^2 + 2x'));
  it('rewrites an expression but refuses both-sides moves', () => {
    const e = parseEquation('2(x + 3)', true);
    expect(T(ok(applyMove('distribute', e, idOf(e, '2(x + 3)'))).eq)).toBe('2x + 6');
    expect('error' in applyBothChecked(e, '+3')).toBe(true);
  });
  it('spots an identity and knows when it is proved', () => {
    const e = parseEquation('(x + 1)^2 = x^2 + 2x + 1');
    expect(isIdentity(e)).toBe(true);
    expect(isIdentity(parseEquation('x + 1 = 3'))).toBe(false);
    expect(isProved(parseEquation('x^2 + 2x + 1 = x^2 + 2x + 1'))).toBe(true);
  });
  it('in a proof, only rewrites one side', () => {
    const e = { ...parseEquation('(x + 1)^2 = x^2 + 2x + 1'), rel: '≟' as const };
    expect(T(formsFor(e, idOf(e, '(x + 1)^2')).find(f => f.name === 'expanded')!.eq)).toBe('x^2 + 2x + 1 = x^2 + 2x + 1');
    expect('error' in applyBothChecked(e, '-1')).toBe(true);
  });
  it('defines, calls and unfolds a function', () => {
    const d = parseEquation('f(x) = x^2 + 1');
    expect(d.rel).toBe('def');
    DEFS.set('f', { param: 'x', body: d.rhs });
    const e = parseEquation('f(3) = y');
    expect(T(e)).toBe('f(3) = y');
    expect(T(ok(unfold(e, null)).eq)).toBe('3^2 + 1 = y');
    const g = parseEquation('f(2t) = 5');
    expect(T(ok(unfold(g, null)).eq)).toBe('(2t)^2 + 1 = 5');
    DEFS.clear();
  });
  it('finds an inverse function', () => {
    const d = parseEquation('f(x) = 2x + 3');
    expect(T(ok(inverseFunction(d)))).toBe('f⁻¹(x) = (x − 3)/2');
  });
});
