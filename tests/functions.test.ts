// Functions you define are ordinary math: a definition is an equation like any other, a name
// that already means something is used (not redefined), and every box takes values as typed.
import { describe, it, expect, beforeEach } from 'vitest';
import { parseEquation, setRedefining } from '../src/engine/parse';
import { Eq, walk, LETS, DEFS, relOf } from '../src/engine/ast';
import { isErr } from '../src/engine/moves';
import { toText } from '../src/engine/print';
import { nameIt, putValue, tryValue } from '../src/engine/general';
import { simplifySpot, moveAny } from '../src/engine/techniques';
import { bothSides, finishCalc } from '../src/engine/calcmoves';

const T = (e: Eq) => toText(e);
const idOf = (e: Eq, text: string): string => {
  let id: string | null = null;
  walk(e, n => { if (!id && n.k !== 'eq' && toText(n) === text) id = n.id; });
  if (!id) throw new Error(`no ${text} in ${T(e)}`);
  return id;
};
const define = (src: string) => {
  const d = parseEquation(src);
  if (d.lhs.k !== 'call' || d.lhs.arg.k !== 'sym') throw new Error('not a definition');
  DEFS.set(d.lhs.name, { param: d.lhs.arg.name, body: d.rhs });
  return d;
};

beforeEach(() => { LETS.clear(); DEFS.clear(); setRedefining(null); });

describe('a definition is an equation like any other', () => {
  it('f(…) = … defines f only while f is new; after that it is an equation about f', () => {
    expect(relOf(define('f(x) = x^2 + 1'))).toBe('def');
    expect(relOf(parseEquation('f(a) = 10'))).toBe('=');
    expect(relOf(parseEquation('f(x) = 7'))).toBe('=');
    expect(relOf(parseEquation('f(x) = x^3'))).toBe('=');
    // read back from a save: the same definition is still one
    expect(relOf(parseEquation('f(x) = x^2 + 1'))).toBe('def');
    // typed over (i on the definition): it may change
    setRedefining('f');
    expect(relOf(parseEquation('f(x) = x^3'))).toBe('def');
  });

  it('moving a piece across a definition gives an ordinary equation instead of refusing', () => {
    const d = define('I(t) = int_0^1 (x^t - 1)/ln x dx');
    const r = moveAny(d, idOf(d, '∫_{0}^{1} (x^t − 1)/ln(x) dx'));
    if (isErr(r)) throw new Error(r.error);
    expect(relOf(r.eq)).toBe('=');
  });
});

describe('functions at numbers work out', () => {
  it('s works out f(3) with f(x) = x² + 1', () => {
    define('f(x) = x^2 + 1');
    const s = simplifySpot(parseEquation('y = f(3)'));
    expect(s && T(s.move.eq)).toBe('y = 10');
    const g = simplifySpot(parseEquation('y = f(f(1))'));
    expect(g && T(g.move.eq)).toBe('y = 5');
  });

  it('leaves a function of a letter, and one that comes out an integral, for Tab u', () => {
    define('f(x) = x^2 + 1');
    expect(simplifySpot(parseEquation('y = f(a)'))).toBe(null);
    define('I(t) = int_0^1 (x^t - 1)/ln x dx');
    expect(simplifySpot(parseEquation('I(0) = y'))).toBe(null);
  });
});

describe('p takes a value however it is typed', () => {
  it('0, t = 0, t := 0', () => {
    const d = define('I(t) = int_0^1 (x^t - 1)/ln x dx');
    for (const text of ['0', 't = 0', 't=0', 't := 0']) {
      const r = putValue(d, 't', text);
      if ('error' in r) throw new Error(`${text}: ${r.error}`);
      expect(T(r)).toBe('I(0) = ∫_{0}^{1} (x^0 − 1)/ln(x) dx');
    }
  });

  it('several at once', () => {
    const r = putValue(parseEquation('y = a x + b'), 'a', 'a = 2, b = 3');
    if ('error' in r) throw new Error(r.error);
    expect(T(r)).toBe('y = 2x + 3');
  });

  it('on an equation that says which x works, a value is tried', () => {
    const e = parseEquation('x^2 = 4');
    const yes = tryValue(e, 'x', '2'), no = tryValue(e, 'x', 'x = 3');
    if ('error' in yes || 'error' in no) throw new Error('refused');
    expect(yes.holds).toBe(true);
    expect(no.holds).toBe(false);
    expect(no.text).toBe('x = 3: 9 = 4, false, it doesn’t');
  });
});

describe('b defines a function from the piece you aimed at', () => {
  const start = () => parseEquation('y = int_0^1 (x^5 - 1)/ln x dx');
  const P = '∫_{0}^{1} (x^5 − 1)/ln(x) dx';

  it('I(5): the 5 becomes t, I(t) is defined, and the piece is I(5)', () => {
    const e = start();
    const r = nameIt(e, idOf(e, P), 'I(5)');
    if ('error' in r) throw new Error(r.error);
    expect(T(r.def)).toBe('I(t) = ∫_{0}^{1} (x^t − 1)/ln(x) dx');
    expect(T(r.step.eq)).toBe('y = I(5)');
  });

  it('I(s = 5) names the letter', () => {
    const e = start();
    const r = nameIt(e, idOf(e, P), 'I(s = 5)');
    if ('error' in r) throw new Error(r.error);
    expect(T(r.def)).toBe('I(s) = ∫_{0}^{1} (x^s − 1)/ln(x) dx');
  });

  it('leaves the bounds when the value is also inside', () => {
    const e = parseEquation('y = int_0^1 x^1 dx');
    const r = nameIt(e, idOf(e, '∫_{0}^{1} x^1 dx'), 'F(1)');
    if ('error' in r) throw new Error(r.error);
    expect(T(r.def)).toBe('F(t) = ∫_{0}^{1} x^t dx');
  });

  it('I = ∫ … with I(5) typed turns the equation itself into I(t) = …', () => {
    const e = parseEquation('I = int_0^1 (x^5 - 1)/ln x dx');
    const r = nameIt(e, idOf(e, P), 'I(5)');
    if ('error' in r) throw new Error(r.error);
    expect(r.inPlace).toBe(true);
    expect(T(r.step.eq)).toBe('I(t) = ∫_{0}^{1} (x^t − 1)/ln(x) dx');
  });

  it('I(t) on a piece with no t says how to make a number into t', () => {
    const e = start();
    const r = nameIt(e, idOf(e, P), 'I(t)');
    expect('error' in r && r.error).toContain('type I(5)');
  });

  it('a function you already have: the piece is that function at a value', () => {
    define('I(t) = int_0^1 (x^t - 1)/ln x dx');
    const e = start();
    const r = nameIt(e, idOf(e, P), 'I(5)');
    if ('error' in r) throw new Error(r.error);
    expect(r.folded).toBe(true);
    expect(T(r.step.eq)).toBe('y = I(5)');
  });
});

describe('the safety net gives the same verdict whatever it checked before', () => {
  it('d/dt of I(t) = ∫₀¹ (x^t − 1)/ln x dx works out to 1/(t + 1), even after many other checks', () => {
    const d = define('I(t) = int_0^1 (x^t - 1)/ln x dx');
    const run = () => {
      const b = bothSides(d, 't');
      if (isErr(b)) throw new Error(b.error);
      const f = finishCalc(b.eq);
      return [f.stuck, f.steps.length ? T(f.steps[f.steps.length - 1].eq) : ''];
    };
    const first = run();
    expect(first).toEqual([undefined, 'I′(t) = 1/(t + 1)']);
    // other checks in between used to move the sample points, so a borderline sample could land
    for (let i = 0; i < 37; i++) simplifySpot(parseEquation(`y = (x + ${i})^2 - x^2`));
    expect(run()).toEqual(first);
  });
});

describe('d/dt both sides of a function defined by an ∫ with no bounds', () => {
  it('I(t) = ∫ (x^t − 1)/ln x dx: d/dt, Leibniz, and the easy integral', () => {
    const d = define('I(t) = int (x^t - 1)/ln x dx');
    const b = bothSides(d, 't');
    if (isErr(b)) throw new Error(b.error);
    const f = finishCalc(b.eq);
    expect(f.stuck).toBe(undefined);
    expect(f.steps.map(s => s.label)).toContain('Leibniz rule: d/dt under the ∫');
    expect(T(f.steps[f.steps.length - 1].eq)).toBe('I′(t) = x^(t + 1)/(t + 1) + C');
  });
});
