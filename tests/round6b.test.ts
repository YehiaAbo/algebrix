import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { formsFor } from '../src/engine/forms';
import { toText } from '../src/engine/print';

describe('forms with nothing aimed', () => {
  it('offers factoring a side, so Tab works before aiming', () => {
    const f = formsFor(parseEquation('x^2 - 5x + 6 = 0'), null).find(x => x.name === 'factored');
    expect(f && toText(f.eq)).toBe('(x − 2)(x − 3) = 0');
  });
});

import { moveAny } from '../src/engine/wrap';
import { eliminate } from '../src/engine/systems';
import { applyBothChecked, isErr, MoveOk } from '../src/engine/moves';
import { relOf, walk, Node } from '../src/engine/ast';

describe('inequalities keep their sign', () => {
  it('m (move across) on every piece keeps or flips the relation, never "="', () => {
    for (const src of ['x + y > z', '2x - 3 <= y', 'x/2 + y >= 1', '-x < 3']) {
      const e = parseEquation(src);
      const ids: string[] = []; walk(e, (n: Node) => { if (n.k !== 'eq') ids.push(n.id); });
      for (const id of ids) {
        const r = moveAny(e, id);
        if (!isErr(r)) expect(['<', '>', '≤', '≥']).toContain(relOf((r as MoveOk).eq));
      }
    }
  });
  it('adding an equation to an inequality keeps the inequality', () => {
    const e = parseEquation('x + y > z'), o = parseEquation('y = 2x');
    const r = applyBothChecked(e, '-#2', [e, o]) as MoveOk;
    expect(toText(r.eq)).toBe('x + y − y > z − 2x');
  });
  it('an inequality can’t be added like an equation', () => {
    const e = parseEquation('x + y = 3'), o = parseEquation('x > 1');
    expect(isErr(applyBothChecked(e, '+#2', [e, o]))).toBe(true);
  });
  it('elimination picks the variable that cancels most simply', () => {
    const r = eliminate(parseEquation('y = 2x + 1'), parseEquation('y = x - 3'), 2) as MoveOk;
    expect(toText(r.eq)).toBe('y − y = 2x + 1 − x + 3');
  });
});

describe('subscript variables', () => {
  it('reads x_1, v_0, a_n and x_{max} as their own names', () => {
    const e = parseEquation('v_0 + a_n t = x_{max} - 2x_1');
    expect(toText(e)).toBe('v_0 + a_n t = x_max − 2x_1');
  });
});

describe('factoring without a precise aim', () => {
  it('factors an expression with nothing aimed', async () => {
    const { applyMove } = await import('../src/engine/moves');
    const e = parseEquation('x^2 - 5x + 6', true);
    expect(toText((applyMove('factor', e, null) as MoveOk).eq)).toBe('(x − 2)(x − 3)');
    expect(toText((applyMove('factor', e, 'eq') as MoveOk).eq)).toBe('(x − 2)(x − 3)');
  });
  it('factors the side that factors when the whole equation is aimed', async () => {
    const { applyMove } = await import('../src/engine/moves');
    const e = parseEquation('0 = x^2 - 9');
    expect(toText((applyMove('factor', e, 'eq') as MoveOk).eq)).toBe('0 = (x − 3)(x + 3)');
  });
  it('aiming inside a sum factors the sum around it', async () => {
    const { applyMove } = await import('../src/engine/moves');
    const e = parseEquation('3x^2 + 6x = 0');
    let xid = ''; walk(e, (n: Node) => { if (!xid && n.k === 'sym') xid = n.id; });
    expect(toText((applyMove('factor', e, xid) as MoveOk).eq)).toBe('3x(x + 2) = 0');
  });
  it('an expression is not offered "everything on one side"', () => {
    expect(formsFor(parseEquation('2x + 4', true), null).map(f => f.name)).not.toContain('everything on one side');
  });
});

describe('distribute keeps every number in a term', () => {
  it('(−1)·(a + 3·(−1)·x) keeps both minus signs', async () => {
    const { distributeNode } = await import('../src/engine/rewrite');
    const { newHints } = await import('../src/engine/simplify');
    const { num, sym, add, mul, evaluate } = await import('../src/engine/ast');
    const n = mul([num(-1), add([sym('a'), mul([num(3), num(-1), sym('x')])])]);
    const out = distributeNode(n, newHints())!;
    const env = { a: 2, x: 1.3 };
    expect(evaluate(out, env)).toBeCloseTo(evaluate(n, env));
  });
});
