// Functions you define are ordinary math: a definition is an equation like any other, a name
// that already means something is used (not redefined), and every box takes values as typed.
import { describe, it, expect, beforeEach } from 'vitest';
import { parseEquation, parseExpr, setRedefining } from '../src/engine/parse';
import { Eq, Node, walk, LETS, DEFS, relOf } from '../src/engine/ast';
import { isErr, checked, setDomains } from '../src/engine/moves';
import { unfold, inverseFunction } from '../src/engine/goals';
import { toText } from '../src/engine/print';
import { nameIt, putValue, tryValue, integrateBoth, holdsForEvery, sameEverywhere } from '../src/engine/general';
import { intStep } from '../src/engine/integrate';
import { simplifySpot, moveAny, applyFn, fnTemplate, tidy, peel, wrapBoth } from '../src/engine/techniques';
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

describe('a definition is an equation: every both-sides move takes it (K15)', () => {
  it('I′(t) = … typed is about the slope of I, not a new definition', () => {
    define('I(t) = int (x^t - 1)/ln x dx');
    expect(parseEquation("I'(t) = x^(t+1)/(t+1) + C").rel).toBe(undefined);
  });
  it('∫ both sides dt after d/dt on I(t) = ∫ (x^t − 1)/ln x dx (no bounds), then the famous integral is named', () => {
    const d = define('I(t) = int (x^t - 1)/ln x dx');
    const b = bothSides(d, 't');
    if (isErr(b)) throw new Error(b.error);
    const f = finishCalc(b.eq);
    const r = integrateBoth(f.steps[f.steps.length - 1].eq, 't');
    if (isErr(r)) throw new Error(r.error);
    expect(T(r.eq)).toBe('∫ I′(t) dt = ∫ (x^(t + 1)/(t + 1) + C) dt');
    const stuck = intStep(parseEquation('y = int x^u/u du'), null);
    expect(isErr(stuck) && stuck.error).toContain('exponential integral');
  });
  it('∫ both sides and a function of both sides on a definition itself', () => {
    const d = define('f(x) = x^2 + 1');
    expect(isErr(integrateBoth(d, 'x'))).toBe(false);
    expect(isErr(applyFn(d, fnTemplate('ln') as Node))).toBe(false);
  });
  it('the definite Feynman path: I′(t) = 1/(t + 1) integrates to I(t) = ln|t + 1| + C', () => {
    define('I(t) = int_0^1 (x^t - 1)/ln x dx');
    const r = integrateBoth(parseEquation("I'(t) = 1/(t+1)"), 't');
    if (isErr(r)) throw new Error(r.error);
    let e = r.eq;
    for (let i = 0; i < 2; i++) { const s = intStep(e, null); if (isErr(s)) throw new Error(s.error); e = s.eq; }
    expect(T(e)).toBe('I(t) = ln|t + 1| + C');
  });
});

describe('inverses of your functions (K16)', () => {
  it('f⁻¹ parses, has a value before its formula, cancels f, and i undoes f', () => {
    define('f(x) = 2x + 3');
    define('g(x) = x^2');
    expect(T(parseEquation('y = f^-1(x)'))).toBe('y = f⁻¹(x)');
    expect(T(parseEquation('y = x^-1(x + 1)'))).toBe('y = x^(−1)(x + 1)');
    const t = tidy(parseEquation('y = f^-1(f(x)) + f(f⁻¹(2)) + f^-1(4)'));
    expect(t && T(t.eq)).toBe('y = x + 5/2');
    const r = peel(parseEquation('f(x + 1) = 7'), null);
    if (isErr(r)) throw new Error(r.error);
    const c = checked(parseEquation('f(x + 1) = 7'), r);
    expect(isErr(c) ? c.error : T(c.eq)).toBe('x + 1 = f⁻¹(7)');
    const g = peel(parseEquation('g(x) = 9'), null);
    expect(isErr(g) && g.error).toContain('one-to-one');
  });
});

describe('the f menu takes anything algebraic, not only numbers (K17)', () => {
  it('power, root, base and log base with letters', () => {
    const P = (s: string) => parseEquation(s);
    const pw = wrapBoth(P('x^2 = 4'), 'power', parseExpr('k + 1'));
    if (isErr(pw)) throw new Error(pw.error);
    const c = checked(P('x^2 = 4'), pw);
    expect(isErr(c) ? c.error : T(c.eq)).toBe('(x^2)^(k + 1) = 4^(k + 1)');
    expect(pw.conditions).toContain('k + 1 ≠ 0');
    for (const [f, a] of [['root', 'n'], ['powb', 'a'], ['logb', 'a']] as const) {
      const r = wrapBoth(P('x = 3'), f, parseExpr(a));
      if (isErr(r)) throw new Error(r.error);
      const k = checked(P('x = 3'), r);
      expect(isErr(k) ? k.error : '').toBe('');
    }
  });
});

describe('functions of several letters, and inverses on a limited domain (K18)', () => {
  it('f(x, y): defines, evaluates, s works out f(1, 2), unfold swaps letters cleanly, slopes go through it', () => {
    const d = parseEquation('f(x, y) = x^2 + 3y');
    expect(d.rel).toBe('def');
    DEFS.set('f', { param: 'x,y', body: d.rhs });
    const t = tidy(parseEquation('z = f(1, 2)'));
    expect(t && T(t.eq)).toBe('z = 7');
    const u = unfold(parseEquation('z = f(y, x)'), null);
    expect(isErr(u) ? u.error : T(u.eq)).toBe('z = y^2 + 3x');
    const w = unfold(parseEquation('z = f(3)'), null);
    expect(isErr(w) && w.error).toContain('takes 2 inputs');
    expect(T(parseEquation('v = (1, 2)'))).toBe('v = ⟨1, 2⟩');
  });
  it('x² has an inverse once x ≥ 0, and still none when it turns around inside the domain', () => {
    setDomains({ x: 'nonneg' });
    try {
      const a = inverseFunction(parseEquation('f(x) = x^2 + 1'));
      expect('error' in a ? a.error : T(a)).toBe('f⁻¹(x) = sqrt(x − 1)');
      const b = inverseFunction(parseEquation('f(x) = (x - 1)^2 + 3'));
      expect('error' in b && b.error).toContain('turns around');
    } finally { setDomains({}); }
    const c = inverseFunction(parseEquation('f(x) = x^2'));
    expect('error' in c && c.error).toContain('Limit its domain');
  });
});

describe('what goes into a function is read from the form in front of you (K21)', () => {
  it('f(x) = 7 with f defined picks x; I(t) = … with I unknown holds for every t', () => {
    const d = parseEquation('f(x) = 2x + 3');
    DEFS.set('f', { param: 'x', body: d.rhs });
    const e = parseEquation('f(x) = 7');
    expect(e.rel).not.toBe('def');
    expect(holdsForEvery(e, 'x')).toBe(false);
    expect(holdsForEvery(parseEquation('f(x) = 2x + 3'), 'x')).toBe(true);
    expect(holdsForEvery(parseEquation('J(t) = 1/(t + 1)'), 't')).toBe(true);
    expect(sameEverywhere(parseEquation('f(x) = 2x + 3'), 'x')).toBe(true);
  });
  it('an identity, and a form with + C, hold for every value; y = x + C does not', () => {
    const f = parseEquation('I(t) = int_0^1 (x^t - 1)/ln x dx');
    DEFS.set('I', { param: 't', body: f.rhs });
    expect(holdsForEvery(parseEquation('I(t) = ln|t + 1| + C'), 't')).toBe(true);
    expect(holdsForEvery(parseEquation('I(t) = ln|t + 2| + C'), 't')).toBe(false);
    expect(holdsForEvery({ ...parseEquation("I'(t) = 1/(t + 1)"), rel: '≟' }, 't')).toBe(true);
    expect(sameEverywhere(parseEquation('y = x + C'), 'x')).toBe(false);
    expect(sameEverywhere(parseEquation('x + y = y + x'), 'x')).toBe(true);
  });
  it('subscripted names define, primed ones never do, and (−1/2)² comes out exact', () => {
    expect(parseEquation('v_0(t) = 3t').rel).toBe('def');
    expect(parseEquation("I'(t) = 1/(t + 1)").rel).not.toBe('def');
    const t = tidy(parseEquation('y = (-1/2)^2 + 1'));
    expect(t && T(t.eq)).toBe('y = 5/4');
  });
});
