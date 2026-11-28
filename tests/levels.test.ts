// Shift ↑ opens a whole Σ, ∏, ∫ or d/dx one level (written out, one rule); Shift ↓ closes a
// written-out sum back. A piece that can travel (across a bar, a bound) still travels first.
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { walk, find, Eq } from '../src/engine/ast';
import { isErr } from '../src/engine/moves';
import { shiftVertical } from '../src/engine/levels';

const aimed = (e: Eq, piece: string) => { let id: string | null = null; walk(e, n => { if (!id && n.k !== 'eq' && toText(n) === piece) id = n.id; }); if (!id) throw new Error(`no ${piece} in ${toText(e)}`); return id; };
/** press Shift ↑/↓ several times, following the aim the move leaves */
const press = (src: string, piece: string, dirs: (-1 | 1)[]) => {
  let e = parseEquation(src, !src.includes('=')), sel: string | null = aimed(e, piece);
  const out: string[] = [];
  for (const d of dirs) {
    const r = shiftVertical(e, sel, d);
    if (isErr(r)) { out.push(`error: ${r.error}`); break; }
    e = r.eq; sel = r.select && find(e, r.select) ? r.select : sel;
    out.push(toText(e));
  }
  return out;
};

describe('Shift ↑ ↓ open and close', () => {
  it('a Σ writes out with ⋯, ↑ again writes one more term, ↓ folds it back', () => {
    const s = press('S = sum_(n=1)^N n^2', 'Σ_{n=1}^{N} n^2', [-1, -1, 1]);
    expect(s[0]).toMatch(/^S = 1 \+ 4 \+ 9 \+/);
    expect(s[2]).toBe('S = Σ_{n=1}^{N} n^2');
    expect(s[1].split('+').length).toBeGreaterThan(s[0].split('+').length);
  });
  it('a ∏ writes out the same way', () => {
    expect(press('P = prod_(k=1)^N k', '∏_{k=1}^{N} k', [-1])[0]).toMatch(/^P = 1·2·3/);
  });
  it('↓ on a closed Σ says it is closed', () => {
    expect(press('S = sum_(n=1)^N n^2', 'Σ_{n=1}^{N} n^2', [1])[0]).toMatch(/^error: .*closed/);
  });
  it('an integral: ↑ splits over +, then one rule per ↑ on what is left, then the bounds go in', () => {
    expect(press('y = int (x^2 + cos x) dx', '∫ (x^2 + cos(x)) dx', [-1, -1, -1])).toEqual([
      'y = ∫ x^2 dx + ∫ cos(x) dx', 'y = x^3/3 + ∫ cos(x) dx', 'y = x^3/3 + sin(x) + C']);
    const d = press('y = int_0^1 (3x^2 + 2) dx', '∫_{0}^{1} (3x^2 + 2) dx', [-1, -1, -1, -1, -1]);
    expect(d[2]).toBe('y = [x^3]_{x=0}^{1} + [2x]_{x=0}^{1}');
    expect(d[4]).not.toMatch(/\[/);
  });
  it('a derivative: the sum rule only splits, then each piece is one rule; nothing left says so', () => {
    expect(press('y = d/dx(x^3 + sin(x))', 'd/dx(x^3 + sin(x))', [-1, -1, -1, -1])).toEqual([
      'y = d/dx(x^3) + d/dx(sin(x))', 'y = 3x^2 + d/dx(sin(x))', 'y = 3x^2 + cos(x)', 'error: Nothing in here opens up any further. s tidies it.']);
  });
  it('a limit: ↑ puts the value in', () => {
    expect(press('y = lim_(x->2) (x^2 + 1)', 'lim_{x→2} (x^2 + 1)', [-1])[0]).toMatch(/2\^2 \+ 1|5/);
  });
  it('↓ on an integral or derivative says it is closed', () => {
    expect(press('y = int x^2 dx', '∫ x^2 dx', [1])[0]).toMatch(/^error: .*closed/);
  });
  it('a factor under a bar still travels first', () => {
    expect(press('y = 1/x^2', 'x^2', [-1])[0]).toBe('y = x^(−2)');
  });
});
