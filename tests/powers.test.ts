// Exponent laws both ways (playtest cause C1): a power splits into a power of a power, so a
// quadratic form shows (x^(2/3) is (x^(1/3))², e^(2x) is (e^x)²), and powers of powers combine
// back. f i undoes any fractional power. Also (−a)² = a² (C2).
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { formsFor } from '../src/engine/forms';
import { peel } from '../src/engine/techniques';
import { simplify, newHints } from '../src/engine/simplify';
import { walk } from '../src/engine/ast';
import { isErr } from '../src/engine/moves';

/** the forms of the piece that reads `piece` in `src` */
const formOf = (src: string, piece: string, name: string) => {
  const e = parseEquation(src, !src.includes('='));
  let id: string | null = null;
  walk(e, n => { if (!id && n.k !== 'eq' && toText(n) === piece) id = n.id; });
  if (!id) throw new Error(`no ${piece} in ${src}`);
  const f = formsFor(e, id).find(x => x.name === name);
  return f ? toText(f.eq) : null;
};
const simp = (src: string) => { const e = parseEquation(src, true); return toText(simplify(e.lhs, newHints())); };

describe('a power as a power of a power', () => {
  it('splits a fractional exponent into a root, then a power', () => {
    expect(formOf('x^(2/3) - 5x^(1/3) + 6 = 0', 'x^(2/3)', 'as a power of a power')).toBe('(x^(1/3))^2 − 5x^(1/3) + 6 = 0');
  });
  it('splits a number out of a letter exponent', () => {
    expect(formOf('e^(2x) - e^x - 132 = 0', 'e^(2x)', 'as a power of a power')).toBe('(e^x)^2 − e^x − 132 = 0');
  });
  it('splits an even whole exponent as a square', () => {
    expect(formOf('x^4 + 5x^2 = 12', 'x^4', 'as a power of a power')).toBe('(x^2)^2 + 5x^2 = 12');
    expect(formOf('x^6 = 8', 'x^6', 'as a power of a power')).toBe('(x^3)^2 = 8');
  });
  it('splits a negative power, so 1/x can be named', () => {
    expect(formOf('x^(-2) - x^(-1) - 12 = 0', 'x^(−2)', 'as a power of a power')).toBe('(x^(−1))^2 − x^(−1) − 12 = 0');
  });
  it('leaves what has nothing to split', () => {
    expect(formOf('x^2 = 9', 'x^2', 'as a power of a power')).toBeNull();
    expect(formOf('x^(1/3) = 2', 'x^(1/3)', 'as a power of a power')).toBeNull();
    expect(formOf('x^3 = 8', 'x^3', 'as a power of a power')).toBeNull();
  });
});

describe('powers of powers combine', () => {
  it('back into one power', () => {
    expect(formOf('(x^(1/3))^2 = 4', '(x^(1/3))^2', 'powers combined')).toBe('x^(2/3) = 4');
    expect(formOf('(x^2)^2 = 4', '(x^2)^2', 'powers combined')).toBe('x^4 = 4');
  });
  it('s leaves a power of a power you split on purpose', () => {
    expect(simp('(x^(1/3))^2')).toBe('(x^(1/3))^2');
    expect(simp('(x^2)^2')).toBe('(x^2)^2');
    expect(formOf('(e^x)^2 = 4', '(e^x)^2', 'powers combined')).toBe('e^(2x) = 4');
  });
  it('s cancels a fractional power and its reciprocal', () => {
    expect(simp('((x - 1)^(3/4))^(4/3)')).toBe('x − 1');
    expect(simp('(x^(2/3))^(3/2)')).toBe('|x|');
  });
  it('s keeps the sign an even power forgets', () => {
    expect(simp('(x^2)^(3/2)')).toBe('|x|^3');
  });
});

describe('f i on a fractional power', () => {
  const undo = (src: string) => { const r = peel(parseEquation(src), null); if (isErr(r)) throw new Error(r.error); return toText(r.eq); };
  it('raises both sides to the reciprocal', () => {
    expect(undo('(x - 1)^(3/4) = 8')).toBe('x − 1 = 8^(4/3)');
    expect(undo('(x + 1)^(2/3) = 4')).toBe('|x + 1| = 4^(3/2)');
  });
});

describe('(−a)² = a²', () => {
  it('drops the minus under an even power', () => {
    expect(simp('(-sqrt(x + 2))^2')).toBe('x + 2');
    expect(simp('(-y)^4')).toBe('y^4');
    expect(simp('(-y)^3')).toBe('(−y)^3');
  });
});
