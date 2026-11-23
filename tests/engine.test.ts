import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { applyMove, applyBothChecked, isErr, MoveName, MoveOk, solvedFor, verify } from '../src/engine/moves';
import { Eq, find, walk, Node, allIds } from '../src/engine/ast';

const T = (e: Node) => toText(e);
const idOf = (e: Eq, text: string): string => {
  let hit: string | null = null;
  walk(e, n => { if (!hit && n.k !== 'eq' && T(n) === text) hit = n.id; });
  if (!hit) throw new Error(`no node "${text}" in ${T(e)}`);
  return hit;
};
const go = (e: Eq, m: MoveName, sel: string | null): MoveOk => {
  const r = applyMove(m, e, sel);
  if (isErr(r)) throw new Error(`${m}: ${r.error}`);
  return r;
};

describe('parse', () => {
  it.each([
    ['7y + 3x = 20', '7y + 3x = 20'],
    ['7y+3x-20=0', '7y + 3x − 20 = 0'],
    ['1/2x = 3', '1/(2x) = 3'],
    ['3x/7 = y', '3x/7 = y'],
    ['2(x+3) = -4', '2(x + 3) = −4'],
    ['x^2 - 5x + 6 = 0', 'x^2 − 5x + 6 = 0'],
    ['\\frac{x+1}{2} = 3x^{2}', '(x + 1)/2 = 3x^2'],
    ['2.5x = 10', '(5/2)x = 10'],
    ['-x = 4', '−x = 4'],
    ['3 \\cdot 4 = y', '3·4 = y'],
  ])('%s', (src, want) => expect(T(parseEquation(src))).toBe(want));
  it('rejects non-equations', () => expect(() => parseEquation('3x + 1')).toThrow(/=/));
  it('rejects junk', () => expect(() => parseEquation('3x + = 1')).toThrow());
});

describe('the flagship loop: 7y + 3x = 20 → y', () => {
  it('solves by hand in a few moves', () => {
    let e = parseEquation('7y + 3x = 20');
    const threeX = idOf(e, '3x');
    const r1 = go(e, 'move', threeX);
    expect(T(r1.eq)).toBe('7y = 20 − 3x');
    expect(r1.focus).toBe(threeX); // same 3x travelled
    e = r1.eq;
    const r2 = go(e, 'divide', idOf(e, '7y')); // smart target: divides by the coefficient
    expect(T(r2.eq)).toBe('y = (20 − 3x)/7');
    expect(r2.label).toBe('÷ 7');
    e = r2.eq;
    const r3 = go(e, 'distribute', idOf(e, '(20 − 3x)/7'));
    expect(T(r3.eq)).toBe('y = 20/7 − 3x/7');
    const r4 = go(r3.eq, 'slideR', idOf(r3.eq, '20/7'));
    expect(T(r4.eq)).toBe('y = −3x/7 + 20/7');
    expect(solvedFor(r4.eq)).toBe('y');
  });
});

describe('moves', () => {
  it('moves the whole side', () => {
    const e = parseEquation('2x + 3 = 7');
    expect(T(go(e, 'move', e.lhs.id).eq)).toBe('0 = 7 − 2x − 3');
  });
  it('moving into a 0 side replaces the 0', () => {
    const e = parseEquation('2x - 4 = 0');
    expect(T(go(e, 'move', idOf(e, '−4')).eq)).toBe('2x = 4');
  });
  it('refuses moving a factor and says why', () => {
    const e = parseEquation('7y = 20');
    const r = applyMove('move', e, idOf(e, '7'));
    expect(isErr(r) && r.error).toMatch(/factor/);
  });
  it('divide by a symbol records a condition', () => {
    const e = parseEquation('x y = 4');
    const r = go(e, 'divide', idOf(e, 'x'));
    expect(T(r.eq)).toBe('y = 4/x');
    expect(r.conditions).toEqual(['x ≠ 0']);
  });
  it('multiply clears a denominator', () => {
    const e = parseEquation('x/3 = 5');
    expect(T(go(e, 'multiply', idOf(e, '3')).eq)).toBe('x = 3·5');
  });
  it('distributes with numbers folded', () => {
    const e = parseEquation('2(3x - 4) = 10');
    expect(T(go(e, 'distribute', e.lhs.id).eq)).toBe('6x − 8 = 10');
  });
  it('distributes a symbol as a visible copy', () => {
    const e = parseEquation('x(x + 1) = 6');
    const r = go(e, 'distribute', e.lhs.id);
    expect(T(r.eq)).toBe('xx + x = 6');
    const copies: Node[] = [];
    walk(r.eq, n => { if (n.from) copies.push(n); });
    expect(copies.length).toBe(1);
    expect(T(go(r.eq, 'simplify', null).eq)).toBe('x^2 + x = 6');
  });
  it('simplifies like terms and arithmetic', () => {
    const e = parseEquation('3x + 5x - 2 + 7 = 2·3');
    expect(T(go(e, 'simplify', null).eq)).toBe('8x + 5 = 6');
  });
  it('cancels to zero', () => {
    const e = parseEquation('3x - 3x + y = 1');
    expect(T(go(e, 'simplify', null).eq)).toBe('y = 1');
  });
  it('reduces fractions and cancels factors', () => {
    expect(T(go(parseEquation('y = 6/4'), 'simplify', null).eq)).toBe('y = 3/2');
    expect(T(go(parseEquation('7y/7 = 3'), 'simplify', null).eq)).toBe('y = 3');
    expect(T(go(parseEquation('y = (6x + 4)/2'), 'simplify', null).eq)).toBe('y = 3x + 2');
    expect(T(go(parseEquation('y = 20/7 + 1'), 'simplify', null).eq)).toBe('y = 27/7');
  });
  it('factors out', () => {
    const e = parseEquation('6x^2 + 4x = 0');
    expect(T(go(e, 'factor', e.lhs.id).eq)).toBe('2x(3x + 2) = 0');
    const e2 = parseEquation('-2x - 4 = 0');
    expect(T(go(e2, 'factor', e2.lhs.id).eq)).toBe('−2(x + 2) = 0');
  });
  it('applies an operation to both sides', () => {
    const e = parseEquation('2x + 3 = 7');
    const r = applyBothChecked(e, '-3');
    expect(!isErr(r) && T(r.eq)).toBe('2x + 3 − 3 = 7 − 3');
    const r2 = applyBothChecked(e, '/x');
    expect(!isErr(r2) && r2.conditions).toEqual(['x ≠ 0']);
    expect(isErr(applyBothChecked(e, '*0'))).toBe(true);
  });
  it('swap sides', () => {
    expect(T(go(parseEquation('20 = 7y'), 'swap', null).eq)).toBe('7y = 20');
  });
  it('safety net catches a wrong rewrite', () => {
    const e = parseEquation('x + 1 = 3');
    const bad = { ...go(e, 'swap', null), factor: () => 1 };
    expect(verify(e, bad)).toMatch(/mismatch/);
  });
});

describe('fuzz: random legal moves never break the equation', () => {
  const seeds = ['7y + 3x = 20', '2(x - 3) + 4x = 5x/2 + 1', 'x^2 - 5x + 6 = 2x(x + 1)', '(3x + 6)/3 = y - 4', 'a b + 2a = 6 - b/2'];
  const names: MoveName[] = ['move', 'divide', 'multiply', 'distribute', 'simplify', 'factor', 'slideL', 'slideR', 'swap', 'lift', 'drop'];
  it.each(seeds)('%s', src => {
    let e = parseEquation(src);
    let rng = 7;
    const r = () => (rng = (rng * 16807) % 2147483647) / 2147483647;
    let applied = 0;
    for (let i = 0; i < 3000 && applied < 400; i++) {
      const ids = allIds(e).filter(id => id !== 'eq');
      const sel = ids[Math.floor(r() * ids.length)];
      const res = applyMove(names[Math.floor(r() * names.length)], e, sel);
      if (isErr(res)) { expect(res.error).not.toMatch(/engine refused/); continue; }
      applied++;
      e = res.eq;
      if (find(e, 'eq') === null) throw new Error('lost root');
    }
    expect(applied).toBeGreaterThan(10);
  });
});

import { formsFor } from '../src/engine/forms';
import { factorize, expandAll, combineFractions } from '../src/engine/rewrite';
import { newHints } from '../src/engine/simplify';
import { parseExpr } from '../src/engine/parse';

describe('rewrites', () => {
  const F = (s: string) => { const r = factorize(parseExpr(s), newHints()); return r ? T(r) : null; };
  it.each([
    ['x^2 + 5x + 6', '(x + 2)(x + 3)'],
    ['x^2 - 5x + 6', '(x − 2)(x − 3)'],
    ['2x^2 + 7x + 3', '(2x + 1)(x + 3)'],
    ['x^2 - 9', '(x − 3)(x + 3)'],
    ['4x^2 - 25', '(2x − 5)(2x + 5)'],
    ['x^2 + 6x + 9', '(x + 3)^2'],
    ['2x^2 + 10x + 12', '2(x + 2)(x + 3)'],
    ['6x^2 + 4x', '2x(3x + 2)'],
    ['x^2 + 1', null],
  ])('factor %s', (src, want) => expect(F(src)).toBe(want));
  it.each([
    ['(x + 2)(x + 3)', 'x^2 + 5x + 6'],
    ['(x - 1)^2', 'x^2 − 2x + 1'],
    ['2(x + 1) - 3(x - 2)', '−x + 8'],
  ])('expand %s', (src, want) => expect(T(expandAll(parseExpr(src), newHints()))).toBe(want));
  it('combines fractions over the least common denominator', () => {
    expect(T(combineFractions(parseExpr('x/2 + x/3'), newHints())!)).toBe('5x/6');
    expect(T(combineFractions(parseExpr('1/x + 1/2'), newHints())!)).toBe('(x + 2)/(2x)');
  });
});

describe('forms strip', () => {
  it('offers factored and expanded forms for a sum', () => {
    const e = parseEquation('x^2 + 5x + 6 = 0');
    const names = formsFor(e, e.lhs.id).map(f => `${f.name}: ${T(f.eq)}`);
    expect(names).toContain('factored: (x + 2)(x + 3) = 0');
  });
  it('offers equation-level forms', () => {
    const e = parseEquation('x/2 + 1 = x/3');
    const names = formsFor(e, null).map(f => `${f.name}: ${T(f.eq)}`);
    expect(names).toContain('clear fractions (× 6): 3x + 6 = 2x');
  });
  it('every form is verified', () => {
    for (const src of ['(x+1)(x-1) = 3', 'x/2 + x/3 = 5', '2(x+3)/4 = y', '(x^2 - 4)/(x - 2) = 1']) {
      const e = parseEquation(src);
      for (const id of [null, e.lhs.id, e.rhs.id]) for (const f of formsFor(e, id)) expect(verify(e, f)).toBeNull();
    }
  });
});
