// Any function on both sides (f, then = and type it): a name, or a template with □ for each side.
import { describe, it, expect, beforeEach } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { DEFS } from '../src/engine/ast';
import { isErr, checked, direction, MoveOk } from '../src/engine/moves';
import { toText } from '../src/engine/print';
import { fnTemplate, applyFn } from '../src/engine/wrap';

const run = (src: string, text: string) => {
  const F = fnTemplate(text);
  if ('error' in F) return F.error;
  const r = checked(parseEquation(src), applyFn(parseEquation(src), F));
  return isErr(r) ? r.error : r;
};
const T = (r: unknown) => (typeof r === 'string' ? r : toText((r as MoveOk).eq));

beforeEach(() => DEFS.clear());

describe('fnTemplate', () => {
  it('reads a name, □, _ and () as the hole', () => {
    expect(toText(fnTemplate('ln') as never)).toBe('ln(□)');
    expect(toText(fnTemplate('e^_') as never)).toBe('e^□');
    expect(toText(fnTemplate('()^2 + 1') as never)).toBe('□^2 + 1');
    expect(toText(fnTemplate('1/(□ + 1)') as never)).toBe('1/(□ + 1)');
  });
  it('a defined function by its name', () => {
    DEFS.set('I', { param: 't', body: parseEquation('y = t^2').rhs });
    expect(toText(fnTemplate('I') as never)).toBe('I(□)');
  });
  it('refuses text with no hole', () => {
    expect('error' in (fnTemplate('x + 1') as object)).toBe(true);
  });
});

describe('applyFn', () => {
  it('e^□ on both sides, one to one, so ⇔', () => {
    const r = run('ln(x) = 2', 'e^_');
    expect(T(r)).toBe('e^(ln(x)) = e^2');
    expect(direction(r as MoveOk)).toBe('⇔');
  });
  it('□² + 1 can add solutions: ⇒, and says so', () => {
    const r = run('x - 1 = 3', '_^2 + 1');
    expect(T(r)).toBe('(x − 1)^2 + 1 = 3^2 + 1');
    expect(direction(r as MoveOk)).toBe('⇒');
  });
  it('a function that needs positive input records it', () => {
    const r = run('x + 2 = 5', 'ln') as MoveOk;
    expect(T(r)).toBe('ln(x + 2) = ln(5)');
    expect(r.conditions).toContain('x + 2 > 0');
  });
  it('your own function', () => {
    DEFS.set('g', { param: 't', body: parseEquation('y = 2t + 1').rhs });
    expect(T(run('x = 3', 'g'))).toBe('g(x) = g(3)');
  });
  it('only on an equation', () => {
    expect(typeof run('x < 3', 'e^_')).toBe('string');
  });
});

describe('applyFn, more', () => {
  it('a side used twice: □ + 1/□', () => {
    expect(T(run('x = 2', '_ + 1/_'))).toBe('x + 1/x = 2 + 1/2');
  });
});
