// Tab + =: rewrite the aimed piece as a form you type, checked before it lands.
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { walk, allIds } from '../src/engine/ast';
import { rewriteAs } from '../src/engine/general';
import { isErr } from '../src/engine/moves';

const aim = (src: string, piece: string) => {
  const e = parseEquation(src, !src.includes('=')); let id = '';
  walk(e, n => { if (n.k !== 'eq' && !id && toText(n) === piece) id = n.id; });
  return { e, id };
};
const as = (src: string, piece: string, text: string) => {
  const { e, id } = aim(src, piece);
  const r = rewriteAs(e, id, text);
  return isErr(r) ? `error: ${r.error}` : toText(r.eq);
};

describe('rewrite as', () => {
  it('takes any equal form you type', () => {
    expect(as('y = x^2 - 1', 'x^2 − 1', '(x-1)(x+1)')).toBe('y = (x − 1)(x + 1)');
    expect(as('y = sin(2x) + 3', 'sin(2x)', '2 sin(x) cos(x)')).toBe('y = 2 sin(x) cos(x) + 3');
    expect(as('y = 12', '12', '3*4')).toBe('y = 3·4');
    expect(as('x^2 + 6x + 5', 'x^2 + 6x + 5', '(x+3)^2 - 4')).toBe('(x + 3)^2 − 4');
  });
  it('refuses a form that is not equal, says why, and needs an aim', () => {
    expect(as('y = x^2 - 1', 'x^2 − 1', '(x-1)^2')).toMatch(/isn’t equal to x\^2 − 1/);
    expect(as('y = x^2 - 1', 'x^2 − 1', 'x^2 - 1')).toMatch(/written now/);
    expect(isErr(rewriteAs(parseEquation('y = x'), null, 'x'))).toBe(true);
  });
  it('pieces written again keep who they are, so they stay in place', () => {
    const { e, id } = aim('y = (x+1)^2 + sin(x)', '(x + 1)^2');
    let s = ''; walk(e, n => { if (toText(n) === 'x + 1') s = n.id; });
    const r = rewriteAs(e, id, '(x+1)(x+1)');
    if (isErr(r)) throw new Error(r.error);
    const ids = allIds(r.eq);
    expect(ids).toContain(s);
    expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('q keeps a form: the simplify marks skip it', () => {
  it('offers the next piece, or nothing, once a form is kept', async () => {
    const { simplifySpot } = await import('../src/engine/spot');
    const { key, find } = await import('../src/engine/ast');
    const e = parseEquation('y = 2·3 x + x/1');
    const first = simplifySpot(e)!;
    const kept = new Set([key(find(e, first.node)!)]);
    const next = simplifySpot(e, kept);
    expect(next).not.toBeNull();
    expect(next!.node).not.toBe(first.node);
    kept.add(key(find(e, next!.node)!));
    expect(simplifySpot(e, kept)).toBeNull();
  });
});
