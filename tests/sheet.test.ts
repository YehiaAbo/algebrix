// The rules of the sheet (src/ui/sheet.ts): steps, undo past tidy steps, the equation limit.
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { newHints } from '../src/engine/simplify';
import { MoveOk, Checked } from '../src/engine/moves';
import { Sheet, place, addStep, undo, redo, removeCurrent, eqOf, MAX_EQUATIONS, areCases } from '../src/ui/sheet';

// the sheet's bookkeeping is tested here, not the maths: these steps stand in for checked ones
const move = (src: string, extra: Partial<MoveOk> = {}): Checked => ({ eq: parseEquation(src), label: src, hints: newHints(), factor: () => 1, ...extra }) as Checked;
const start = (src: string): Sheet => { const s: Sheet = { slots: [], cur: 0 }; place(s, parseEquation(src), true); return s; };
const now = (s: Sheet) => toText(eqOf(s, s.cur));

describe('steps', () => {
  it('a move adds a step, and a new move after undo drops the old future', () => {
    const s = start('2x + 3 = 7');
    addStep(s, move('2x = 4'));
    addStep(s, move('x = 2'));
    undo(s);
    addStep(s, move('2x = 4 + 0'));
    expect(s.slots[0].steps.map(t => toText(t.eq))).toEqual(['2x + 3 = 7', '2x = 4', '2x = 4 + 0']);
  });

  it('conditions carry forward without repeats', () => {
    const s = start('x/x = 1');
    addStep(s, move('1 = 1', { conditions: ['x ≠ 0'] }));
    const t = addStep(s, move('1 = 1', { conditions: ['x ≠ 0', 'y > 0'] }));
    expect(t.conditions).toEqual(['x ≠ 0', 'y > 0']);
  });

  it('a solved one-variable inequality gets its answer', () => {
    const s = start('2x < 4');
    expect(addStep(s, move('x < 2')).answer).toBeTruthy();
  });
});

describe('undo and redo', () => {
  it('undo skips automatic tidy steps, redo goes through them', () => {
    const s = start('2x + 3 = 7');
    addStep(s, move('2x = 7 - 3'));
    addStep(s, move('2x = 4', { auto: true }));
    undo(s);
    expect(now(s)).toBe('2x + 3 = 7');
    redo(s);
    expect(now(s)).toBe('2x = 4');
  });

  it('nothing to undo at the original, nothing to redo at the end', () => {
    const s = start('x = 1');
    expect(undo(s)).toBe(false);
    expect(redo(s)).toBe(false);
  });
});

describe('equations', () => {
  it(`at most ${MAX_EQUATIONS}`, () => {
    const s = start('x = 1');
    for (let i = 1; i < MAX_EQUATIONS; i++) expect(place(s, parseEquation(`x = ${i + 1}`), true)).toBeNull();
    expect(place(s, parseEquation('x = 99'), true)).toMatch(/limit/);
    expect(s.slots.length).toBe(MAX_EQUATIONS);
  });

  it('typing over replaces the current one', () => {
    const s = start('x = 1');
    place(s, parseEquation('y = 2'), false);
    expect(s.slots.length).toBe(1);
    expect(now(s)).toBe('y = 2');
  });

  it('removing keeps the last one, and moves to its neighbour', () => {
    const s = start('x = 1');
    expect(removeCurrent(s)).toBe(false);
    place(s, parseEquation('y = 2'), true);
    expect(removeCurrent(s)).toBe(true);
    expect(s.cur).toBe(0);
    expect(now(s)).toBe('x = 1');
  });
});

describe('cases are alternatives', () => {
  // equation 1 was split at its step s1; equation 2 is the other case; equation 3 names u
  const sheet = (): Sheet => ({ cur: 0, slots: [
    { uid: 'A', at: 1, sel: null, steps: [{ eq: parseEquation('u^2 + 5u = 12'), label: 'start', conditions: [], id: 's1' }, { eq: parseEquation('u = 1'), label: 'quadratic formula', conditions: [], id: 's2' }] },
    { uid: 'B', at: 0, sel: null, from: { slot: 'A', step: 's1' }, steps: [{ eq: parseEquation('u = 2'), label: 'case 2', conditions: [] }] },
    { uid: 'C', at: 0, sel: null, from: { slot: 'A', step: 's1' }, named: 'letter', steps: [{ eq: parseEquation('u = x^2'), label: 'name it', conditions: [] }] },
    { uid: 'D', at: 0, sel: null, from: { slot: 'A', step: 's1' }, steps: [{ eq: parseEquation('u = 3'), label: 'case 3', conditions: [] }] },
  ] });
  it('a case and the equation it split from', () => {
    expect(areCases(sheet(), 0, 1)).toBe(true);
    expect(areCases(sheet(), 1, 0)).toBe(true);
  });
  it('two cases of one split', () => expect(areCases(sheet(), 1, 3)).toBe(true));
  it('but a named letter is not a case', () => {
    expect(areCases(sheet(), 0, 2)).toBe(false);
    expect(areCases(sheet(), 1, 2)).toBe(false);
  });
});

describe('a move that comes back to an earlier step goes back to it (user: the tree explodes over reorders)', () => {
  it('reorder twice: back on the start, counted, nothing new', () => {
    const s = start('a + b = 1');
    addStep(s, move('b + a = 1'));
    const out = { again: false, back: 0 };
    addStep(s, move('a + b = 1'), { out });
    expect(s.slots[0].at).toBe(0);
    expect(s.slots[0].steps).toHaveLength(2);
    expect(out.back).toBe(1);
    expect(s.slots[0].steps[0].back).toBe(1);
    // and again: the count goes up
    addStep(s, move('b + a = 1'));
    addStep(s, move('a + b = 1'), { out });
    expect(s.slots[0].steps[0].back).toBe(2);
    expect(s.slots[0].steps).toHaveLength(2);
  });
  it('a move that undoes one further back returns there too', () => {
    const s = start('2x = 6');
    addStep(s, move('x = 3'));
    addStep(s, move('2x = 6'));
    expect(s.slots[0].at).toBe(0);
    expect(now(s)).toBe('2x = 6');
  });
});
