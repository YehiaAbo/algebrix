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

import { moveAny, eliminate } from '../src/engine/techniques';
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
