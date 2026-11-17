// Aiming with the arrows (src/ui/nav.ts), on a view where every piece is drawn in its own box.
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { children, find, Eq } from '../src/engine/ast';
import { up, down, side, flip, NavView } from '../src/ui/nav';

const view = (src: string): NavView => ({ root: parseEquation(src), kids: children, same: () => false, memory: new Map() });
const txt = (v: NavView, id: string | null) => (id === null ? null : id === 'eq' ? 'eq' : toText(find(v.root as Eq, id)!));
const idOf = (v: NavView, text: string) => {
  let hit = '';
  const visit = (n: any) => { if (!hit && n.k !== 'eq' && toText(n) === text) hit = n.id; children(n).forEach(visit); };
  visit(v.root);
  return hit;
};

describe('fractions by keyboard', () => {
  const v = view('y = (x + 1)/(x - 1)');
  const f = () => idOf(v, '(x + 1)/(x − 1)');
  it('↓ on a fraction goes to its top', () => expect(txt(v, down(v, f()))).toBe('x + 1'));
  it('↓ on the top goes to the bottom', () => expect(txt(v, down(v, idOf(v, 'x + 1')))).toBe('x − 1'));
  it('↑ on the bottom goes to the top', () => expect(txt(v, up(v, idOf(v, 'x − 1')))).toBe('x + 1'));
  it('↑ on the top goes to the whole fraction', () => expect(txt(v, up(v, idOf(v, 'x + 1')))).toBe('(x + 1)/(x − 1)'));
  it('↓ on a fraction always starts at the top, even after visiting the bottom', () => {
    up(v, idOf(v, '−1'));
    expect(txt(v, down(v, f()))).toBe('x + 1');
  });
  it('↓ on the bottom goes inside it', () => { const w = view('y = (x + 1)/(x - 1)'); expect(txt(w, down(w, idOf(w, 'x − 1')))).toBe('x'); });
  it('→ on the top walks into its first piece, ← into its last', () => {
    expect(txt(v, side(v, idOf(v, 'x + 1'), 1))).toBe('x');
    expect(txt(v, side(v, idOf(v, 'x + 1'), -1))).toBe('1');
  });
  it('Shift+Tab still flips top and bottom', () => expect(txt(v, flip(v, idOf(v, 'x + 1'), n => n))).toBe('x − 1'));
});

describe('edges do nothing', () => {
  const v = view('2x + 3 = 7');
  it('→ past the last piece gives nothing', () => expect(side(v, idOf(v, '7'), 1)).toBeNull());
  it('← past the first piece gives nothing', () => expect(side(v, idOf(v, '2x'), -1)).toBeNull());
  it('↓ on the smallest piece gives nothing', () => expect(down(v, idOf(v, '3'))).toBeNull());
  it('walking still crosses the equals sign', () => expect(txt(v, side(v, idOf(v, '3'), 1))).toBe('7'));
});
