// The notation picker: type part of a word (int, lim, alpha, \sum…) and cards offer the notation.
import { describe, it, expect } from 'vitest';
import { NOTATION, notationFor, insertNotation } from '../src/ui/notation';
import { parseEquation } from '../src/engine/parse';

const names = (src: string) => notationFor(src, src.length)?.items.map(n => n.name) ?? [];

describe('which cards', () => {
  it('int offers the integrals', () => expect(names('int')).toEqual(expect.arrayContaining(['integral', 'definite integral', 'double integral'])));
  it('a LaTeX command works too', () => expect(names('\\su')[0]).toBe('sum to ∞'));
  it('Greek by name', () => expect(names('x + alp')).toContain('alpha'));
  it('one letter is just a letter', () => expect(names('x + a')).toEqual([]));
  it('nothing after a space', () => expect(names('int ')).toEqual([]));
  it('at most six', () => expect(names('in').length).toBeLessThanOrEqual(6));
  it('an exact word comes first', () => expect(names('lim')[0]).toBe('limit'));
});

describe('taking one', () => {
  it('replaces the word and puts the caret where you type next', () => {
    const got = notationFor('2 + int', 7)!;
    const r = insertNotation('2 + int', got, got.items.find(n => n.name === 'definite integral')!);
    expect(r.text).toBe('2 + int_0^1  dx');
    expect(r.caret).toBe('2 + int_0^1 '.length);
  });
  it('a backslash goes too', () => {
    const got = notationFor('\\alpha', 6)!;
    expect(insertNotation('\\alpha', got, got.items[0]).text).toBe('α');
  });
});

describe('every card makes something the parser reads', () => {
  it.each(NOTATION.map(n => [n.name, n.insert] as const))('%s', (_, ins) => {
    const filled = ins.replace('$', ins.includes('dx') || ins.includes('dy') || /^(sum|prod)/.test(ins) ? 'x' : ins.startsWith('_') ? '1' : ins.startsWith('^') ? '2' : 'x');
    const src = /^[_^!']/.test(filled) ? 'y' + filled : filled.startsWith('<') || filled.startsWith('>') ? 'x ' + filled + ' 1' : filled;
    expect(() => parseEquation(src, true)).not.toThrow();
  });
});
