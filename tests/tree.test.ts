// The work tree (src/ui/tree.ts and the tree rules in sheet.ts): nothing you try is lost, the same
// move twice goes back to the step you had, and the layout keeps equations level.
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { newHints } from '../src/engine/simplify';
import { MoveOk } from '../src/engine/moves';
import { Sheet, place, addStep, undo, redo, eqOf } from '../src/ui/sheet';
import { treeOf, goto, layoutTree, here, visibleAt, Tree } from '../src/ui/tree';

const move = (src: string, extra: Partial<MoveOk> = {}): MoveOk => ({ eq: parseEquation(src), label: src, hints: newHints(), factor: () => 1, ...extra });
const start = (src: string): Sheet => { const s: Sheet = { slots: [], cur: 0 }; place(s, parseEquation(src), true); return s; };
const now = (s: Sheet) => toText(eqOf(s, s.cur));
const text = (t: Tree, id: string) => toText(t.nodes.get(id)!.eq);
const measure = () => ({ w: 40, h: 20 });
const opts = { fold: false, rowGap: 10, colGap: 30, laneGap: 12 };

describe('the tree keeps every line', () => {
  it('a new move after undo forks: the old line stays in the tree', () => {
    const s = start('2x + 3 = 7');
    addStep(s, move('2x = 4'));
    addStep(s, move('x = 2'));
    undo(s); undo(s);
    addStep(s, move('2x = 7 - 3'));
    const t = treeOf(s.slots[0]);
    expect(t.nodes.size).toBe(4);
    expect(t.nodes.get(t.root)!.kids.map(k => text(t, k))).toEqual(['2x = 4', '2x = 7 − 3']);
    expect(t.line.map(id => text(t, id))).toEqual(['2x + 3 = 7', '2x = 7 − 3']);
    expect(text(t, t.at)).toBe('2x = 7 − 3');
  });

  it('the same move again goes back to the step you had, with its future', () => {
    const s = start('2x + 3 = 7');
    addStep(s, move('2x = 4'));
    addStep(s, move('x = 2'));
    undo(s); undo(s);
    addStep(s, move('2x = 7 - 3'));
    undo(s);
    const out = { again: false };
    addStep(s, move('2x = 4'), { out });
    expect(out.again).toBe(true);
    expect(now(s)).toBe('2x = 4');
    expect(treeOf(s.slots[0]).nodes.size).toBe(4);
    expect(redo(s)).toBe(true);
    expect(now(s)).toBe('x = 2');
  });

  it('goto jumps to a step on another line, and the line you leave is kept', () => {
    const s = start('x + 1 = 3');
    addStep(s, move('x = 3 - 1'));
    undo(s);
    addStep(s, move('x + 1 - 1 = 3 - 1'));
    const t = treeOf(s.slots[0]);
    const other = t.nodes.get(t.root)!.kids.find(k => text(t, k) === 'x = 3 − 1')!;
    expect(goto(s.slots[0], other)).toBe(true);
    expect(now(s)).toBe('x = 3 − 1');
    const t2 = treeOf(s.slots[0]);
    expect(t2.nodes.size).toBe(3);
    expect(s.slots[0].alts!.length).toBe(1);
  });

  it('automatic tidy steps belong to the move before them', () => {
    const s = start('2x + 3 = 7');
    addStep(s, move('2x = 7 - 3'));
    addStep(s, move('2x = 4', { auto: true }));
    const t = treeOf(s.slots[0]);
    expect(t.line.map(id => text(t, id))).toEqual(['2x + 3 = 7', '2x = 4']);
    expect(t.nodes.get(t.at)!.label).toBe('2x = 7 - 3');
    expect(visibleAt(s.slots[0])).toBe(t.at);
  });

  it('a step that used another equation links to it', () => {
    const s = start('x + y = 10');
    place(s, parseEquation('y = 2'), true);
    const link = here(s.slots[1]);
    s.cur = 0;
    addStep(s, move('x + 2 = 10'), { link });
    const trees = s.slots.map(treeOf);
    const L = layoutTree(trees, measure, opts);
    expect(L.arrows).toHaveLength(1);
    expect(L.arrows[0].from).toBe(`${trees[1].uid}:${trees[1].root}`);
    expect(L.arrows[0].to).toBe(`${trees[0].uid}:${trees[0].at}`);
  });
});

describe('layout', () => {
  const long = () => {
    const s = start('x = 0');
    for (let i = 1; i <= 8; i++) addStep(s, move(`x = ${i}`));
    for (let i = 0; i < 4; i++) undo(s);
    return s;
  };

  it('the strip folds the middle of a long line, keeping where you are and both ends', () => {
    const s = long();
    const L = layoutTree([treeOf(s.slots[0])], measure, { ...opts, fold: true, strip: { height: 400, top: 30, bottom: 10, focus: 0 } });
    const shown = L.items.map(i => (i.id ? toText(treeOf(s.slots[0]).nodes.get(i.id)!.eq) : `${i.ids.length} steps`));
    expect(shown).toEqual(['x = 0', '2 steps', 'x = 3', 'x = 4', 'x = 5', '2 steps', 'x = 8']);
    // the start shows under the top, and the steps after where you are stay in view
    expect(Math.min(...L.items.map(i => i.y - i.h / 2))).toBeGreaterThanOrEqual(30 - 5);
    expect(Math.max(...L.items.map(i => i.y + i.h / 2))).toBeLessThanOrEqual(400 - 10 + 5);
  });

  it('the big view shows every step, starts level at the top', () => {
    const s = long();
    const L = layoutTree([treeOf(s.slots[0])], measure, opts);
    expect(L.items).toHaveLength(9);
    expect(L.items.every(i => i.id)).toBe(true);
    expect(L.items[0].y).toBeLessThan(L.items[1].y);
  });

  it('a line you left grows in its own lane, and equations do not overlap', () => {
    const s = start('2x + 3 = 7');
    addStep(s, move('2x = 4'));
    undo(s);
    addStep(s, move('2x = 7 - 3'));
    place(s, parseEquation('y = 1'), true);
    const L = layoutTree(s.slots.map(treeOf), measure, opts);
    const a = L.items.filter(i => i.col === 0), b = L.items.filter(i => i.col === 1);
    expect(new Set(a.map(i => i.lane))).toEqual(new Set([0, 1]));
    const right = Math.max(...a.map(i => i.x + i.w / 2)), left = Math.min(...b.map(i => i.x - i.w / 2));
    expect(left).toBeGreaterThan(right);
    // the first equation's other line goes to its outer side (left)
    expect(a.find(i => i.lane === 1)!.x).toBeLessThan(a.find(i => i.lane === 0)!.x);
  });
});
