// Competition sums and products, done with the general tools (user 2026-11-27): each step is a
// form or move the app offers, checked by value; the last step is the known (telescoping) sum.
import { describe, it, expect } from 'vitest';
import '../src/engine/calculus';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { walk, Eq, Node, evaluate } from '../src/engine/ast';
import { isErr } from '../src/engine/moves';
import { formsFor } from '../src/engine/forms';
import { knownSum } from '../src/engine/sums';
import { rewriteAs } from '../src/engine/general';
import { applyMove } from '../src/engine/moves';
import { intStep, plugBounds } from '../src/engine/integrate';

const at = (e: Eq, text: string): string => { let id = ''; walk(e, n => { if (!id && n.k !== 'eq' && toText(n) === text) id = n.id; }); if (!id) throw new Error(`no ${text} in ${toText(e)}`); return id; };
const form = (e: Eq, piece: string, name: string): Eq => {
  const fs = formsFor(e, at(e, piece));
  const f = fs.find(x => x.name === name);
  if (!f) throw new Error(`no form "${name}" on ${piece}: ${fs.map(x => x.name).join(', ')}`);
  return f.eq;
};
const value = (e: Eq) => evaluate(e.rhs, {});

describe('competition sums by the general tools', () => {
  it('denesting: √(3 + 2√2) = √2 + 1', () => {
    const e = parseEquation('y = sqrt(3 + 2 sqrt(2))');
    const d = form(e, toText(e.rhs), 'denested');
    expect(Math.abs(value(d) - (Math.SQRT2 + 1))).toBeLessThan(1e-12);
    expect(toText(d)).not.toMatch(/sqrt\(3/);
  });
  it('Σ 1/√(n + √(n² − 1)), n = 1 … 2026: denest, then a telescope in steps of 2', () => {
    let e = parseEquation('S = sum_{n=1}^{2026} 1/sqrt(n + sqrt(n^2 - 1))');
    const want = value(e);
    e = form(e, 'sqrt(n + sqrt(n^2 − 1))', 'denested');
    e = form(e, '1/(sqrt((n + 1)/2) + sqrt((n − 1)/2))', 'rationalized');
    const r = knownSum(e, null);
    if (isErr(r)) throw new Error(r.error + ' in ' + toText(e));
    expect(r.label).toMatch(/steps of 2/);
    expect(Math.abs(value(r.eq) - want)).toBeLessThan(1e-9);
  });
  it('Σ sin³(3ⁿ)/3ⁿ: power reduction, split, telescope', () => {
    let e = parseEquation('S = sum_{n=1}^{∞} sin(3^n)^3/3^n');
    e = form(e, 'sin(3^n)^3', 'trig: power reduction');
    const r = knownSum(e, null);
    if (isErr(r)) throw new Error(r.error + ' in ' + toText(e));
    expect(Math.abs(evaluate(r.eq.rhs, {}) - Math.sin(3) / 4)).toBeLessThan(1e-9);
  });
  const ok = (r: ReturnType<typeof knownSum>, e: Eq) => { if (isErr(r)) throw new Error(r.error + ' in ' + toText(e)); return r.eq; };
  const first = (e: Eq, k: Node['k']) => { let id = ''; walk(e, n => { if (!id && n.k === k) id = n.id; }); return id; };
  it('Σ 1/(k(k + 1)(k + 2)): partial fractions spread over three terms still telescope', () => {
    let e = parseEquation('S = sum_{k=1}^{n} 1/(k(k+1)(k+2))');
    e = form(e, '1/(k(k + 1)(k + 2))', 'partial fractions');
    const r = ok(knownSum(e, null), e);
    for (const n of [1, 4, 9]) expect(Math.abs(evaluate(r.rhs, { n }) - (0.25 - 1 / (2 * (n + 1) * (n + 2))))).toBeLessThan(1e-12);
    const inf = parseEquation('S = sum_{k=1}^{∞} (1/(2k) - 1/(k+1) + 1/(2(k+2)))');
    expect(Math.abs(evaluate(ok(knownSum(inf, null), inf).rhs, {}) - 0.25)).toBeLessThan(1e-12);
  });
  it('∏ (1 − 1/k²), k = 2 … n: one fraction, factor, telescope to (n + 1)/(2n)', () => {
    let e = parseEquation('P = prod_{k=2}^{n} (1 - 1/k^2)');
    e = form(e, '1 − 1/(k^2)', 'one fraction');
    e = form(e, 'k^2 − 1', 'factored');
    const r = ok(knownSum(e, null), e);
    expect(toText(r.rhs)).toBe('(n + 1)/(2n)');
  });
  it('Σ k·k!: rewrite k·k! as (k + 1)! − k!, then telescope', () => {
    const e = parseEquation('S = sum_{k=1}^{n} k k!');
    const w = rewriteAs(e, (e.rhs as { arg: Node }).arg.id, '(k+1)! - k!');
    if (isErr(w)) throw new Error(w.error);
    const r = ok(knownSum(w.eq, null), w.eq);
    for (const n of [1, 3, 6]) expect(evaluate(r.rhs, { n })).toBeCloseTo([1, 1, 2, 6, 24, 120, 720, 5040][n + 1] - 1, 6);
  });
  it('Σ tan⁻¹(1/(k² + k + 1)): rewrite as a difference of tan⁻¹, then telescope', () => {
    const e = parseEquation('S = sum_{k=1}^{∞} arctan(1/(k^2+k+1))');
    const w = rewriteAs(e, (e.rhs as { arg: Node }).arg.id, 'arctan(k+1) - arctan(k)');
    if (isErr(w)) throw new Error(w.error);
    const r = ok(knownSum(w.eq, null), w.eq);
    expect(Math.abs(evaluate(r.rhs, {}) - Math.PI / 4)).toBeLessThan(1e-9);
  });
  it('Σ (−1)^(n+1)/(n·C(2n, n)): the Beta integral, Σ and ∫ change places, geometric, a log', () => {
    const e = parseEquation('S = sum_{n=1}^{∞} (-1)^(n+1)/(n C(2n, n))');
    const want = 2 / Math.sqrt(5) * Math.log((1 + Math.sqrt(5)) / 2);
    expect(Math.abs(evaluate(e.rhs, {}) - want)).toBeLessThan(1e-9);
    // 1/(n·C(2n, n)) = B(n, n)/2 = ½∫₀¹ (t(1 − t))^(n − 1) dt
    const w = rewriteAs(e, (e.rhs as { arg: Node }).arg.id, 'int_0^1 (-1)^(n+1) (1/2) (t(1-t))^(n-1) dt');
    if (isErr(w)) throw new Error(w.error);
    const sw = applyMove('slideL', w.eq, first(w.eq, 'int'));
    if (isErr(sw)) throw new Error(sw.error);
    expect(sw.label).toBe('Σ and ∫ change places');
    const g = ok(knownSum(sw.eq, first(sw.eq, 'sum')), sw.eq);
    const i = intStep(g, first(g, 'int'));
    if (isErr(i)) throw new Error(i.error);
    const b = plugBounds(i.eq, first(i.eq, 'at'));
    if (isErr(b)) throw new Error(b.error);
    expect(Math.abs(evaluate(b.eq.rhs, {}) - want)).toBeLessThan(1e-9);
  });
  it('Σ and ∫ refuse to change places when the inner ends hold the outer letter', () => {
    const e = parseEquation('S = sum_{n=1}^{5} int_0^n t dt');
    const r = applyMove('slideL', e, first(e, 'int'));
    expect(isErr(r) && r.error).toMatch(/ends/);
  });
});
