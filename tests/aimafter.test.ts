// After a move the aim stays on what you just worked on (user report: after a C or Tab move the
// aim vanished and the arrows did nothing until Space).
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { find, walk } from '../src/engine/ast';
import { aimAfter } from '../src/ui/nav';
import { applyMove, isErr } from '../src/engine/moves';
import { formsFor } from '../src/engine/forms';

const idOf = (e: ReturnType<typeof parseEquation>, t: string) => { let id = ''; walk(e, n => { if (!id && n.k !== 'eq' && toText(n) === t) id = n.id; }); return id; };

describe('aim after a move', () => {
  it('keeps the piece when it survives', () => {
    const e = parseEquation('2x + 3 = 7');
    const sel = idOf(e, '3');
    const r = applyMove('move', e, sel);
    if (isErr(r)) throw new Error(r.error);
    const a = aimAfter(e, r.eq, sel, null);
    expect(a && toText(find(r.eq, a)!)).toMatch(/3/);
  });
  it('lands on what replaced a piece that is gone', () => {
    const e = parseEquation('y = (x + 1)^2', true);
    const sel = idOf(e, '(x + 1)^2');
    const f = formsFor(e, sel).find(x => x.name === 'expanded')!;
    const a = aimAfter(e, f.eq, sel, null);
    expect(a).not.toBeNull();
    expect(toText(find(f.eq, a!)!)).toContain('x^2');
  });
  it('stays off when nothing was aimed', () => {
    const e = parseEquation('2x + 3 = 7');
    expect(aimAfter(e, e, null, null)).toBeNull();
  });
});
