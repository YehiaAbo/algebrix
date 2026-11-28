// The menu model (ui/menu/model.ts): arrows over cards as drawn, and every key's rule, the same in
// Tab, C and f.
import { describe, it, expect } from 'vitest';
import { linesOf, nextCard, menuKey, menuRelease, cardFor, Card, MenuSpec, MenuState, Rect } from '../src/ui/menu/model';

const card = (key: string, ok = true, extra: Partial<Card> = {}): Card => ({ key, label: `card ${key}`, ok, run: () => {}, ...extra });
/** cards laid in lines of `perLine`, 100 wide and 40 high, like a wrapping row */
const grid = (n: number, perLine: number, w = 100): Rect[] => Array.from({ length: n }, (_, i) => ({ x: (i % perLine) * (w + 6), y: Math.floor(i / perLine) * 46, w, h: 40 }));
const st = (o: Partial<MenuState> = {}): MenuState => ({ section: 0, at: null, sticky: true, chordUsed: false, ...o });

describe('arrows over the cards as drawn', () => {
  it('groups cards into lines by their middles, even with different heights', () => {
    const r: Rect[] = [{ x: 0, y: 0, w: 100, h: 40 }, { x: 110, y: 6, w: 100, h: 60 }, { x: 0, y: 80, w: 100, h: 40 }];
    expect(linesOf(r)).toEqual([[0, 1], [2]]);
  });
  it('↓ goes to the line below (the C series cards wrapped into two lines), ↑ comes back', () => {
    const r = grid(5, 2);
    expect(nextCard(r, 1, 'down')).toBe(3);
    expect(nextCard(r, 3, 'up')).toBe(1);
    expect(nextCard(r, 3, 'down')).toBe(4);
  });
  it('↑ from the top line leaves for the tabs; ↓ from the bottom line is an edge', () => {
    const r = grid(5, 2);
    expect(nextCard(r, 0, 'up')).toBe('out');
    expect(nextCard(r, 4, 'down')).toBe(null);
  });
  it('← → read across lines and wrap', () => {
    const r = grid(5, 2);
    expect(nextCard(r, 1, 'right')).toBe(2);
    expect(nextCard(r, 4, 'right')).toBe(0);
    expect(nextCard(r, 0, 'left')).toBe(4);
  });
  it('↓ lands on the card nearest by its middle, when the line below is shorter', () => {
    const r: Rect[] = [{ x: 0, y: 0, w: 100, h: 40 }, { x: 106, y: 0, w: 100, h: 40 }, { x: 212, y: 0, w: 100, h: 40 }, { x: 0, y: 46, w: 300, h: 40 }];
    expect(nextCard(r, 2, 'down')).toBe(3);
  });
  it('a card drawn out of order in the DOM still reads left to right', () => {
    const r: Rect[] = [{ x: 200, y: 0, w: 90, h: 40 }, { x: 0, y: 0, w: 90, h: 40 }, { x: 100, y: 0, w: 90, h: 40 }];
    expect(nextCard(r, 1, 'right')).toBe(2);
    expect(nextCard(r, 2, 'right')).toBe(0);
  });
});

describe('keys in a menu', () => {
  const C: MenuSpec = { id: 'calc', openKey: 'c', sections: [
    { name: 'Derivatives', rows: [[card('d'), card('h', false, { why: 'no h here' })]] },
    { name: 'Series', rows: [[card('['), card(']')], [card('{'), card('}'), card('b')]] },
  ] };
  const r = grid(5, 2);

  it('← → move between sections on the tabs, ↓ goes in at the first card that applies', () => {
    let s = menuKey(C, st(), 'ArrowRight', []).state;
    expect(s.section).toBe(1);
    const d = menuKey(C, s, 'ArrowDown', r);
    expect(d.state.at).toBe(0);
    expect(d.effect).toEqual({ k: 'peek', card: C.sections[1].rows[0][0] });
    s = menuKey(C, d.state, 'ArrowDown', r).state;
    expect(s.at).toBe(2);
  });
  it('Esc steps back: from a card to the tabs, then closed', () => {
    const a = menuKey(C, st({ section: 1, at: 3 }), 'Escape', r);
    expect(a.state.at).toBe(null);
    expect(menuKey(C, a.state, 'Escape', r).effect).toEqual({ k: 'close' });
  });
  it('a card\'s key applies it from any section; an off card refuses with its reason', () => {
    const a = menuKey(C, st(), 'b', r);
    expect(a.effect.k).toBe('run');
    expect(a.state).toMatchObject({ section: 1, at: 4 });
    expect(menuKey(C, st(), 'h', r).effect).toEqual({ k: 'refuse', why: 'no h here' });
  });
  it('the open key again applies what is browsed, or closes', () => {
    expect(menuKey(C, st({ section: 1, at: 1 }), 'c', r).effect).toEqual({ k: 'run', card: C.sections[1].rows[0][1] });
    expect(menuKey(C, st(), 'C', r).effect).toEqual({ k: 'close' });
  });
  it('a key the menu does not offer, tapped open and not browsed, closes it and does its usual job', () => {
    expect(menuKey(C, st(), 'm', r).effect).toEqual({ k: 'pass' });
    expect(menuKey(C, st({ sticky: false }), 'm', r).effect.k).toBe('refuse');
  });
  it('a card that asks for something typed asks first', () => {
    const ask = card('l', true, { ask: { prompt: 'x →', hint: 'a number', commit: () => {} } });
    const L: MenuSpec = { id: 'calc', openKey: 'c', sections: [{ name: 'Limits', rows: [[ask]] }] };
    const a = menuKey(L, st(), 'l', [r[0]]);
    expect(a.effect).toEqual({ k: 'ask', card: ask });
  });
  it('a key two sections share picks the one that applies', () => {
    const S: MenuSpec = { id: 'calc', openKey: 'c', sections: [{ name: 'A', rows: [[card('i', false)]] }, { name: 'B', rows: [[card('i')]] }] };
    expect(cardFor(S, 0, 'i')).toMatchObject({ section: 1, at: 0 });
  });
});

describe('one section (Tab): no tabs to go back to', () => {
  const T: MenuSpec = { id: 'tab', openKey: 'Tab', sections: [{ name: 'Algebra', rows: [[card('a'), card('q')], [card('z'), card('x'), card('s')]] }] };
  const r = grid(5, 3);
  it('→ starts at the first card, ← at the last', () => {
    expect(menuKey(T, st(), 'ArrowRight', r).state.at).toBe(0);
    expect(menuKey(T, st(), 'ArrowLeft', r).state.at).toBe(4);
  });
  it('↑ from the top line stays; Esc closes', () => {
    expect(menuKey(T, st({ at: 1 }), 'ArrowUp', r).state.at).toBe(1);
    expect(menuKey(T, st({ at: 1 }), 'Escape', r).effect).toEqual({ k: 'close' });
  });
});

describe('letting go of the open key', () => {
  const F: MenuSpec = { id: 'fn', openKey: 'f', sections: [{ name: 'Powers', rows: [[card('s')]] }] };
  it('applies what was browsed', () => expect(menuRelease(F, st({ sticky: false, at: 0 })).effect.k).toBe('run'));
  it('a card key that refused is not tried again on letting go', () => {
    const G: MenuSpec = { id: 'calc', openKey: 'c', sections: [{ name: 'Limits', rows: [[card('p', false, { why: '0/0' })]] }] };
    const a = menuKey(G, st({ sticky: false }), 'p', [{ x: 0, y: 0, w: 90, h: 40 }]);
    expect(a.effect).toEqual({ k: 'refuse', why: '0/0' });
    expect(menuRelease(G, { ...a.state, chordUsed: true }).effect).toEqual({ k: 'close' });
  });
  it('closes after a key was pressed while holding', () => expect(menuRelease(F, st({ sticky: false, chordUsed: true })).effect).toEqual({ k: 'close' }));
  it('stays open (sticky) after a plain tap', () => expect(menuRelease(F, st({ sticky: false })).state.sticky).toBe(true));
});
