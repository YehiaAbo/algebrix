// Book problems that e couldn't finish (playtest round 2026-11-22, K22–K25): each guard names the
// general mechanic, with a problem from the bank and a sibling it never saw.
import { describe, it, expect } from 'vitest';
import { parseEquation, parseExpr } from '../src/engine/parse';
import { evaluate, Eq } from '../src/engine/ast';
import { toText } from '../src/engine/print';
import { partialFractions, slopeSplit } from '../src/engine/polytools';
import { finishCalc, plugIn, divideHighest, conjugateLim, asQuotient } from '../src/engine/calcmoves';
import { uSub } from '../src/engine/integrate';
import { isErr } from '../src/engine/moves';
import '../src/engine/calculus';

const T = (e: Eq) => toText(e);
const same = (a: string, b: string) => [0.7, 1.3, 2.9, -0.4].every(x => Math.abs(evaluate(parseExpr(a), { x }) - evaluate(parseExpr(b), { x })) < 1e-9);
const last = (s: string) => { const f = finishCalc(parseEquation(s, true)); if (f.stuck) throw new Error(f.stuck); return f.steps[f.steps.length - 1].eq; };
const value = (s: string) => evaluate(last(s).rhs, {});

describe('fractions over a quadratic with no rational roots (K22)', () => {
  it('partial fractions keep (Bx + C)/q pieces, for q, q², and two quadratics', () => {
    for (const s of ['1/(x^3 + x)', '(2x^2 + 3)/(x(x^2 + 1))', '1/((x^2+1)(x^2+4))', '(x^3 + 1)/(x(x^2+1)^2)', '1/((x-1)(x^2+x+1))']) {
      const r = partialFractions(parseExpr(s));
      expect(r, s).not.toBeNull();
      expect(same(s, toText(r!)), s).toBe(true);
    }
    expect(toText(partialFractions(parseExpr('1/(x^3 + x)'))!)).toBe('1/x − x/(x^2 + 1)');
  });
  it('(Bx + C)/quadratic splits into the slope over it plus a number over it, and e finishes', () => {
    expect(toText(slopeSplit(parseExpr('x/(x^2 + 2x + 5)'))!)).toBe('(1/2)((2x + 2)/(x^2 + 2x + 5)) − 1/(x^2 + 2x + 5)');
    expect(slopeSplit(parseExpr('(x + 1)/(x^2 + 2x + 5)'))).toBeNull();
    expect(T(last('y = int (3x + 1)/(x^2 + 4) dx'))).toContain('tan⁻¹');
  });
  it('u-sub sees through a constant multiple of the slope: (x + 1)/(x² + 2x + 5) is ½ du/u', () => {
    const r = uSub(parseEquation('y = int (x + 1)/(x^2 + 2x + 5) dx'), null).move;
    expect(isErr(r) ? r.error : T(r.eq)).toBe('y = ∫ 1/(2u) du');
  });
});

describe('limits toward ∞: forms are worked on, not plugged into (K23)', () => {
  it('plug in refuses ∞/∞, 0·∞, ∞ − ∞ and 1^∞ and names the form', () => {
    for (const [s, form] of [['y = lim x->inf (2x^2 + 1)/(x^2 - 3)', '∞/∞'], ['y = lim x->inf x e^(-x)', '0·∞'], ['y = lim x->inf (sqrt(x^2 + x) - x)', '∞ − ∞'], ['y = lim x->inf (1 + 1/x)^x', '1^∞']]) {
      const r = plugIn(parseEquation(s, true), null);
      expect(isErr(r) && r.error, s).toContain(form);
    }
  });
  it('what plugging in gives can be π/2, e or ∞', () => {
    const p = (s: string) => { const r = plugIn(parseEquation(s, true), null); return isErr(r) ? r.error : T(r.eq); };
    expect(p('y = lim x->inf atan(x)')).toBe('y = π/2');
    expect(p('y = lim x->inf x e^(1/x)')).toBe('y = ∞');
  });
  it('÷ the highest power, the conjugate, and 0·∞ with the simpler factor underneath', () => {
    const d = divideHighest(parseEquation('y = lim x->-inf (3x + 1)/sqrt(4x^2 + 1)', true), null);
    expect(isErr(d) ? d.error : T(d.eq)).toBe('y = lim_{x→−∞} (−3 − 1/x)/sqrt(4 + 1/(x^2))');
    const c = conjugateLim(parseEquation('y = lim x->inf (sqrt(x^2 + x) - x)', true), null);
    expect(isErr(c) ? c.error : T(c.eq)).toBe('y = lim_{x→∞} x/(sqrt(x^2 + x) + x)');
    const q = asQuotient(parseEquation('y = lim x->inf -x e^(-x)', true), null);
    expect(isErr(q) ? q.error : T(q.eq)).toBe('y = lim_{x→∞} (−x/(e^x))');
    expect(isErr(divideHighest(parseEquation('y = lim x->inf ln(x)/x', true), null))).toBe(true);
    expect(value('y = lim x->inf (sqrt(x^2 + 3x) - x)')).toBeCloseTo(1.5, 9);
    expect(value('y = lim x->inf x^2 e^(-x)')).toBe(0);
    expect(value('y = lim x->inf e^x/x^2')).toBe(Infinity);
  });
});

describe('|g| between bounds, and ends where it has no value (K24)', () => {
  it('splits where g turns, then each piece is ±g', () => {
    expect(value('y = int_0^2 abs(x - 1) dx')).toBeCloseTo(1, 12);
    expect(value('y = int_0^pi abs(cos(x)) dx')).toBeCloseTo(2, 12);
    expect(value('y = int_0^3 abs(x^2 - 2) dx')).toBeCloseTo(3 + 8 * Math.SQRT2 / 3, 10);
  });
  it('an end with no value goes in as a one-sided limit, and e finishes it', () => {
    expect(value('y = int_0^4 x ln(4x) dx')).toBeCloseTo(8 * Math.log(16) - 4, 9);
    expect(value('y = int_0^1 ln(x) dx')).toBeCloseTo(-1, 9);
  });
});

describe('played by hand (K25–K27)', () => {
  it('log₂ stays log₂: shown that way, its logs combine, 2^ undoes it, log₂ 8 is 3', async () => {
    const { combineLogs, inverseOf } = await import('../src/engine/techniques');
    const { simplify, newHints } = await import('../src/engine/simplify');
    const e = parseEquation('log_2(x) + log_2(x - 2) = 3');
    expect(T(e)).toBe('log_2(x) + log_2(x − 2) = 3');
    const c = combineLogs(e.lhs);
    expect(c && toText(simplify(c.n, newHints()))).toBe('log_2(x(x − 2))');
    expect(c?.label).toBe('log₂ a + log₂ b = log₂(ab)');
    expect(inverseOf(parseExpr('log_2(x)'))?.f).toBe('powb');
    expect(toText(simplify(parseExpr('2^(log_2(x + 1))'), newHints()))).toBe('x + 1');
    expect(toText(simplify(parseExpr('log_2(8)'), newHints()))).toBe('3');
    expect(toText(simplify(parseExpr('log_3(3^(x+1))'), newHints()))).toBe('x + 1');
  });
  it('one factor comes out of a power, so an odd trig power can take an identity', async () => {
    const { formsFor } = await import('../src/engine/forms');
    const e = parseEquation('int sin(x)^3 cos(x)^2 dx', true);
    let id = ''; (await import('../src/engine/ast')).walk(e, n => { if (!id && n.k === 'pow' && toText(n) === 'sin(x)^3') id = n.id; });
    const f = formsFor(e, id).find(x => x.name === 'one factor out');
    expect(f && T(f.eq)).toBe('∫ sin(x) sin(x)^2 cos(x)^2 dx');
  });
  it('u-sub aimed at the wrong piece says which one works', () => {
    const e = parseEquation('int sin(x)(1 - cos(x)^2) cos(x)^2 dx', true);
    let id = ''; e.lhs.k === 'int' && e.lhs.arg.k === 'mul' && (id = e.lhs.arg.factors[1].id);
    const r = uSub(e, id).move;
    expect(isErr(r) && r.error).toContain('u = cos(x) works');
  });
});

import { applyBothChecked } from '../src/engine/moves';
import { putValue } from '../src/engine/general';
import { odeKind, separate } from '../src/engine/ode';
import { asPrime, slopeVar } from '../src/engine/leibniz';

describe('related rates and slopes not written alone (K32, K33)', () => {
  it('÷ dt turns differentials into rates, and p puts values in for letters and rates', () => {
    const r = applyBothChecked(parseEquation('2x dx + 2y dy = 0'), '/dt');
    expect(!isErr(r) && T(r.eq)).toBe('2x dx/dt + 2y dy/dt = 0');
    const s = applyBothChecked(parseEquation('x dx = 3 dV'), '/dt');
    expect(!isErr(s) && T(s.eq)).toBe('x dx/dt = 3 dV/dt');
    const p = putValue((r as { eq: Eq }).eq, 'x', 'x = 3, y = 4, dx/dt = 2');
    expect('error' in p ? p.error : T(p)).toBe('2·3·2 + 2·4 dy/dt = 0');
  });
  it('a first-order equation whose slope splits is separable, y′ alone or not, and keeps its + C', () => {
    for (const src of ['dy/dx + 2 = 0', '3y\' - 6x = 0', 'x y\' = y']) {
      const e0 = parseEquation(src), e = asPrime(e0), v = slopeVar(e0);
      expect(odeKind(e, v), src).toBe('separable');
      expect(isErr(separate(e, v)), src).toBe(false);
    }
  });
});

describe('substitutions go back last in, first out (K34)', () => {
  it('∫ cos⁻¹(2x) dx and ∫ sin⁻¹(3x) dx end in x alone', () => {
    for (const s of ['int acos(2x) dx', 'int asin(3x) dx']) {
      const f = finishCalc(parseEquation(s, true));
      expect(f.stuck, s).toBeUndefined();
      const end = T(f.steps[f.steps.length - 1].eq);
      expect(end, s).not.toMatch(/\b[uw]\b/);
    }
  });
});

describe('an odd trig power on the bottom (K36) and the half angle under a root (K35)', () => {
  const slopeOk = (src: string, f: (x: number) => number) => {
    const end = last(src);
    const F = end.k === 'eq' && end.lhs.k === 'int' ? end.rhs : end.rhs;
    const h = 1e-5;
    for (const x of [0.3, 0.7, 1.1]) expect(Math.abs((evaluate(F, { x: x + h, C: 0 }) - evaluate(F, { x: x - h, C: 0 })) / (2 * h) - f(x)), src).toBeLessThan(1e-4);
  };
  it('∫ tan² sec, ∫ sec³, ∫ cos²/sin come out by × cos/cos (or sin/sin) and u = sin (or cos)', () => {
    slopeOk('y = int tan(x)^2 sec(x) dx', x => Math.tan(x) ** 2 / Math.cos(x));
    slopeOk('y = int sec(x)^3 dx', x => 1 / Math.cos(x) ** 3);
    slopeOk('y = int cos(x)^2/sin(x) dx', x => Math.cos(x) ** 2 / Math.sin(x));
  });
  it('√(1 ± cos A) under ∫ from 0 to its end', () => {
    expect(value('y = int_0^(pi/2) sqrt(1 - cos(2x)) dx')).toBeCloseTo(Math.SQRT2, 9);
    expect(value('y = int_0^(2 pi) sqrt(2 - 2cos(t)) dt')).toBeCloseTo(8, 9);
  });
});

describe('rational in eᵗ, e⁻ᵗ written too (K37)', () => {
  it('u = eᵗ reads e⁻ᵗ as 1/u, and the little fractions clear before partial fractions', () => {
    const slope = (src: string, f: (t: number) => number, v = 't') => {
      const F = last(src).rhs, h = 1e-5;
      for (const t of [0.4, 0.9, 1.5]) expect(Math.abs((evaluate(F, { [v]: t + h, C: 0 }) - evaluate(F, { [v]: t - h, C: 0 })) / (2 * h) - f(t)), src).toBeLessThan(1e-4);
    };
    slope('y = int 1/(e^t - e^(-t))^2 dt', t => 1 / (Math.exp(t) - Math.exp(-t)) ** 2);
    slope('y = int 1/(e^x + 4e^(-x)) dx', x => 1 / (Math.exp(x) + 4 * Math.exp(-x)), 'x');
  });
});

describe('an integral that comes back inside m·I + b, and by parts on f(ln x) (K38)', () => {
  it('∫ sin(ln 2x) (after u = 2x it is (∫ …)/2) and 3∫ eˣ cos x finish', () => {
    const slope = (src: string, f: (x: number) => number) => {
      const F = last(src).rhs, h = 1e-5;
      for (const x of [0.4, 0.9, 1.5]) expect(Math.abs((evaluate(F, { x: x + h, C: 0 }) - evaluate(F, { x: x - h, C: 0 })) / (2 * h) - f(x)), src).toBeLessThan(1e-4);
    };
    slope('y = int sin(ln(2x)) dx', x => Math.sin(Math.log(2 * x)));
    slope('y = 3 int e^x cos(x) dx', x => 3 * Math.exp(x) * Math.cos(x));
    slope('y = int cos(ln(3x)) dx', x => Math.cos(Math.log(3 * x)));
  });
});
