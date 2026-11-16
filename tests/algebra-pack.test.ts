// Round 8: the algebra pack. Completing the square, the quadratic formula,
// more factoring identities (cubes, perfect squares), and more trig identities.
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { formsFor } from '../src/engine/forms';
import { applyMove, MoveOk, isErr } from '../src/engine/moves';
import { quadraticFormula } from '../src/engine/techniques';
import { evaluate } from '../src/engine/ast';

const form = (src: string, name: string, aim = false) => {
  const e = parseEquation(src, !src.includes('='));
  const f = formsFor(e, aim ? e.lhs.id : null).find(x => x.name === name);
  return f ? toText(f.eq) : null;
};

describe('completing the square', () => {
  it('works on an aimed quadratic', () => {
    expect(form('x^2 + 4x + 1', 'completed square', true)).toBe('(x + 2)^2 − 3');
  });
  it('keeps the leading number outside', () => {
    expect(form('2x^2 - 8x + 3', 'completed square', true)).toBe('2(x − 2)^2 − 5');
  });
  it('is offered for a side with nothing aimed', () => {
    expect(form('x^2 + 6x + 5 = 0', 'completed square')).toBe('(x + 3)^2 − 4 = 0');
  });
  it('uses fractions when b is odd', () => {
    const t = form('x^2 + 3x + 1', 'completed square', true)!;
    expect(t).toContain('(x + 3/2)^2');
  });
});

describe('quadratic formula', () => {
  it('splits into two cases with a, b, c plugged in', () => {
    const r = quadraticFormula(parseEquation('x^2 + 4x + 1 = 0'), 'x');
    expect(isErr(r as never)).toBe(false);
    const c = r as Exclude<typeof r, { error: string }>;
    expect(c.rest.length).toBe(1);
    const vals = [c.first.eq, c.rest[0]].map(q => evaluate(q.rhs, {})).sort((a, b) => a - b);
    expect(vals[0]).toBeCloseTo(-2 - Math.sqrt(3));
    expect(vals[1]).toBeCloseTo(-2 + Math.sqrt(3));
    expect(toText(c.first.eq.lhs)).toBe('x');
  });
  it('gathers terms first when they are on both sides', () => {
    const c = quadraticFormula(parseEquation('2x^2 = 3 - 5x'), 'x') as { first: MoveOk; rest: MoveOk['eq'][] };
    const vals = [c.first.eq, c.rest[0]].map(q => evaluate(q.rhs, {})).sort((a, b) => a - b);
    expect(vals[0]).toBeCloseTo(-3);
    expect(vals[1]).toBeCloseTo(0.5);
  });
  it('says so when there are no real solutions', () => {
    const r = quadraticFormula(parseEquation('x^2 + x + 1 = 0'), 'x');
    expect('error' in r && r.error).toMatch(/no real solutions/);
  });
  it('refuses a non-quadratic', () => {
    expect('error' in quadraticFormula(parseEquation('x^3 = 2'), 'x')).toBe(true);
  });
});

describe('more factoring identities', () => {
  it('difference of cubes', () => expect(form('x^3 - 8', 'factored')).toBe('(x − 2)(x^2 + 2x + 4)'));
  it('sum of cubes', () => expect(form('a^3 + b^3', 'factored')).toBe('(a + b)(a^2 − ab + b^2)'));
  it('perfect square in two letters', () => expect(form('x^2 + 2x y + y^2', 'factored')).toBe('(x + y)^2'));
  it('perfect square with a minus', () => expect(form('a^2 - 2a b + b^2', 'factored')).toBe('(a − b)^2'));
  it('factors as far as it goes', () => expect(form('x^4 - 16', 'factored')).toBe('(x − 2)(x + 2)(x^2 + 4)'));
  it('f with nothing aimed also factors fully', () => {
    const r = applyMove('factor', parseEquation('x^4 - 16', true), null) as MoveOk;
    expect(toText(r.eq)).toBe('(x − 2)(x + 2)(x^2 + 4)');
  });
});

describe('expressions keep their value', () => {
  it('no "clear fractions" for a lone expression', () => {
    expect(formsFor(parseEquation('sqrt(20)/2', true), null).some(f => f.name.startsWith('clear'))).toBe(false);
  });
});

describe('more trig identities', () => {
  it('angle difference', () => expect(form('sin(x - y)', 'trig: angle difference', true)).toBe('sin(x) cos(y) − cos(x) sin(y)'));
  it('cos difference', () => expect(form('cos(x - y)', 'trig: angle difference', true)).toBe('cos(x) cos(y) + sin(x) sin(y)'));
  it('cos is even', () => expect(form('cos(-x)', 'trig: even/odd', true)).toBe('cos(x)'));
  it('sin is odd', () => expect(form('sin(-x)', 'trig: even/odd', true)).toBe('−sin(x)'));
  it('power reduction', () => expect(form('sin(x)^2', 'trig: power reduction', true)).toBe('(1 − cos(2x))/2'));
  it('tan double angle', () => expect(form('tan(2x)', 'trig: double angle', true)).toBe('2 tan(x)/(1 − tan(x)^2)'));
  it('every trig form keeps the value', () => {
    for (const s of ['sin(x - y)', 'cos(-x)', 'sin(x)^2', 'cos(x)^2', 'tan(2x)', 'tan(-x)']) {
      const e = parseEquation(s, true);
      for (const f of formsFor(e, e.lhs.id)) {
        expect(evaluate(f.eq.lhs, { x: 0.37, y: 1.1 })).toBeCloseTo(evaluate(e.lhs, { x: 0.37, y: 1.1 }));
      }
    }
  });
});

describe('round 8 polish', () => {
  it('sum of cubes squares a number-times-letter cleanly', () => expect(form('27x^3 + 1', 'factored')).toBe('(3x + 1)(9x^2 − 3x + 1)'));
  it('a minus before a square root prints with one space', () => {
    expect(toText(parseEquation('x = -2 - sqrt(3)'))).toBe('x = −2 − sqrt(3)');
  });
});

describe('identities with nothing aimed', () => {
  it('sin²x + cos²x offers 1 straight away', () => expect(form('sin(x)^2 + cos(x)^2', 'trig: Pythagorean')).toBe('1'));
  it('an expression is never offered "sides swapped"', () => {
    expect(formsFor(parseEquation('x + 1', true), null).some(f => f.name === 'sides swapped')).toBe(false);
  });
});

describe('factored form from inside a sum', () => {
  it('aiming at a coefficient still offers the factored sum', () => {
    const e = parseEquation('x^2 - 5x + 6', true);
    let id = '';
    // the 5 inside −5x
    const walkFind = (n: any) => { if (n.k === 'num' && Math.abs(n.v) === 5) id = n.id; for (const c of n.terms ?? n.factors ?? []) walkFind(c); if (n.arg) walkFind(n.arg); };
    walkFind(e.lhs);
    const f = formsFor(e, id).find(x => x.name === 'factored');
    expect(f && toText(f.eq)).toBe('(x − 2)(x − 3)');
  });
});

describe('common factors that are not letters', () => {
  it('2 sin(x) cos(x) − cos(x) → cos(x)(2 sin(x) − 1)', () => expect(form('2 sin(x) cos(x) - cos(x) = 0', 'factored')).toBe('cos(x)(2 sin(x) − 1) = 0'));
});
describe('one fraction with nothing aimed', () => {
  it('1/x + 1/(2x) becomes one fraction', () => expect(form('1/x + 1/(2x)', 'one fraction')).not.toBeNull());
});

describe('inverse trig', () => {
  it('prints as sin⁻¹ and reads back', () => {
    const e = parseEquation('y = arcsin(x)');
    expect(toText(e)).toBe('y = sin⁻¹(x)');
    expect(toText(parseEquation(toText(e)))).toBe('y = sin⁻¹(x)');
    expect(toText(parseEquation('y = sin^-1(x) + cos^(-1)(x) + tan⁻¹(x)'))).toBe('y = sin⁻¹(x) + cos⁻¹(x) + tan⁻¹(x)');
    expect(toText(parseEquation(toText(e, true)))).toBe('y = sin⁻¹(x)');
  });
  it('sin⁻¹(sin x) → x, with the range it holds on as a condition', () => {
    const e = parseEquation('sin^-1(sin(x))', true);
    const f = formsFor(e, e.lhs.id).find(x => x.name === 'trig: inverse cancels');
    expect(f && toText(f.eq)).toBe('x');
    expect(f!.conditions).toEqual(['−π/2 ≤ x ≤ π/2']);
  });
  it('works with nothing aimed too, for cos and tan', () => {
    expect(form('cos^-1(cos(2x)) = 1', 'trig: inverse cancels')).toBe('2x = 1');
    expect(form('tan^-1(tan(x))', 'trig: inverse cancels')).toBe('x');
  });
});
