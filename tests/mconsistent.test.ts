// m always moves the aimed piece across, a whole side too (user 2026-11-26: m on x² in
// f(x) − 2x = x² took a root with |…| instead). Undoing an outer function is f + i.
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { walk } from '../src/engine/ast';
import { isErr } from '../src/engine/moves';
import { moveAny } from '../src/engine/techniques';

const m = (src: string, piece: string) => {
  const e = parseEquation(src); let id = '';
  walk(e, n => { if (n.k !== 'eq' && !id && toText(n) === piece) id = n.id; });
  const r = moveAny(e, id);
  return isErr(r) ? `error: ${r.error}` : toText(r.eq);
};

describe('m on a whole side moves it across', () => {
  it('a power, a root, a function call', () => {
    expect(m('f(x) - 2x = x^2', 'x^2')).toBe('f(x) − 2x − x^2 = 0');
    expect(m('sqrt(x + 1) = 3', 'sqrt(x + 1)')).toBe('0 = 3 − sqrt(x + 1)');
    expect(m('f(x) = x^2 + 2x', 'f(x)')).toBe('0 = x^2 + 2x − f(x)');
  });
  it('aiming inside still takes the inverse across: the exponent of x² = 9', () => {
    expect(m('x^2 = 9', '2')).not.toMatch(/^error/);
  });
});
