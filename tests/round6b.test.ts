import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { formsFor } from '../src/engine/forms';
import { toText } from '../src/engine/print';

describe('forms with nothing aimed', () => {
  it('offers factoring a side, so Tab works before aiming', () => {
    const f = formsFor(parseEquation('x^2 - 5x + 6 = 0'), null).find(x => x.name === 'factored');
    expect(f && toText(f.eq)).toBe('(x − 2)(x − 3) = 0');
  });
});
