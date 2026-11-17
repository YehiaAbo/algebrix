// The live preview while typing: what shows after each key, with □ for what is still to come.
import { describe, it, expect } from 'vitest';
import { livePreview } from '../src/ui/shared';
import { toText } from '../src/engine/print';

const show = (src: string) => { const g = livePreview(src); return g ? `${toText(g.eq)}${g.exact ? '' : ' …'}` : '-'; };
/** what shows after each key of src */
const steps = (src: string) => [...src].map((_, i) => show(src.slice(0, i + 1)));

describe('typing calculus', () => {
  it('int x dx never shows i·n on the way', () => {
    const s = steps('int x dx');
    expect(s.slice(1, 3).every(t => !t.startsWith('in'))).toBe(true);
    expect(s[2]).toBe('∫ □ dx …');
    expect(s[4]).toBe('∫ x dx …');
    expect(s[s.length - 1]).toBe('∫ x dx');
  });
  it('d/dx waits for what to differentiate', () => {
    expect(show('d/dx')).toBe('d/dx(□) …');
    expect(show('d/d')).not.toBe('d/d');
    expect(show('d/dx x^2')).toBe('d/dx(x^2)');
  });
  it('lim on its way', () => {
    expect(show('lim')).toBe('lim_{x→□} □ …');
    expect(show('lim x->')).toBe('lim_{x→□} □ …');
    expect(show('lim x->0')).toBe('lim_{x→0} □ …');
  });
  it('a definite integral', () => expect(show('int_0^1 x^2')).toBe('∫_{0}^{1} x^2 dx …'));
  it('sum', () => expect(show('sum')).toMatch(/^Σ/));
});

describe('typing algebra', () => {
  it('an operator waiting for its right side', () => {
    expect(show('x +')).toBe('x + □ …');
    expect(show('x^')).toBe('x^□ …');
    expect(show('2x =')).toBe('2x = □ …');
  });
  it('an open bracket closes itself', () => expect(show('(x + 1')).toBe('x + 1 …'));
  it('a word on its way does not show as letters', () => expect(show('x + si')).toBe('x + □ …'));
  it('complete input is exact', () => expect(show('x + 1 = 3')).toBe('x + 1 = 3'));
});
