// Property tests for typing integrals: thousands of random single, double and triple integrals,
// typed in every spelling people use, must read back as exactly the integral that was meant, and
// every keystroke on the way there must show a sensible preview. fast-check shrinks any failure
// to the smallest input that breaks.
import { describe, expect, it as it_ } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import '../src/engine/calculus';
import { parseEquation, parseExpr } from '../src/engine/parse';
import { key, int, Node, evaluate } from '../src/engine/ast';
import { toText } from '../src/engine/print';
import { livePreview } from '../src/ui/shared';
import { finishCalc, hasCalc } from '../src/engine/calcmoves';
import { eq, num } from '../src/engine/ast';

// a fixed seed keeps runs repeatable; SEED=… npm test tries another batch
const ENV: Record<string, string | undefined> = (globalThis as { process?: { env: Record<string, string> } }).process?.env ?? {};
fc.configureGlobal({ seed: Number(ENV.SEED ?? 20261117), numRuns: 400 });

const VARS = ['x', 'y', 'z', 't', 'u', 'r', 'θ'];

/** one integral: its variable, its bounds (or none), and how each part is spelled */
type Layer = { v: string; bounds: [string, string] | null; sign: string; boundStyle: number; dsep: string; mathrm: boolean };

const integrand = (vars: string[]) => {
  const v = fc.constantFrom(...vars);
  const atom = fc.oneof(
    v, fc.constantFrom('2', '3', '1/2'),
    v.map(a => `${a}^2`), v.map(a => `3${a}`), v.map(a => `sin(${a})`), v.map(a => `cos ${a}`),
    v.map(a => `e^${a}`), v.map(a => `e^(2${a})`), v.map(a => `sqrt(${a})`), v.map(a => `(${a} + 1)`),
  );
  // a product of one to three factors, then a sum of one to three products
  const prod = fc.array(atom, { minLength: 1, maxLength: 3 }).chain(fs => fc.constantFrom(' ', '*').map(j => fs.join(j)));
  return fc.array(prod, { minLength: 1, maxLength: 3 }).chain(ts => fc.constantFrom(' + ', ' - ', '+').map(j => ts.join(j)))
    .chain(s => fc.boolean().map(wrap => (wrap ? `(${s})` : s)));
};

const bound = (outer: string[]) => fc.constantFrom('0', '1', '2', '-1', 'pi', '2pi', '1/2', ...outer);

const layers = fc.integer({ min: 1, max: 3 })
  .chain(n => fc.shuffledSubarray(VARS, { minLength: n, maxLength: n }))
  .chain(vs => fc.tuple(...vs.map((v, k) => fc.record({
    v: fc.constant(v),
    // an inner bound may use an outer variable: ∫_0^1 ∫_0^x … dy dx
    bounds: fc.option(fc.tuple(bound([]), bound(vs.slice(k + 1))), { nil: null }),
    sign: fc.constantFrom('int', '∫', '\\int', 'integral'),
    boundStyle: fc.integer({ min: 0, max: 2 }),
    dsep: fc.constantFrom(' ', '', '\\,', ' \\, '),
    mathrm: fc.boolean(),
  })))) as fc.Arbitrary<Layer[]>;

/** layers[0] is the innermost; the text reads outermost first */
function typed(ls: Layer[], body: string, gap: string): string {
  const signs = [...ls].reverse().map(l => {
    if (!l.bounds) return l.sign;
    const [a, b] = l.bounds;
    const plain = (s: string) => (/^-?\w$|^\d+$|^pi$/.test(s) ? s : `{${s}}`);
    return l.sign + (l.boundStyle === 0 ? `_{${a}}^{${b}}` : l.boundStyle === 1 ? `_${plain(a)}^${plain(b)}` : `_(${a})^(${b})`);
  });
  const ds = ls.map(l => l.dsep + (l.mathrm ? '\\mathrm{d}' : 'd') + l.v).join('');
  return signs.join(gap) + ' ' + body + ds;
}

function meant(ls: Layer[], body: string): Node {
  let r = parseExpr(body);
  for (const l of ls) r = int(l.v, r, l.bounds ? parseExpr(l.bounds[0]) : undefined, l.bounds ? parseExpr(l.bounds[1]) : undefined);
  return r;
}

const integrals = layers.chain(ls => fc.tuple(fc.constant(ls), integrand(ls.map(l => l.v)), fc.constantFrom(' ', '')));

describe('typing integrals', () => {
  test.prop([integrals])('any single, double or triple integral reads back as the one meant', ([ls, body, gap]) => {
    const src = typed(ls, body, gap);
    const got = parseEquation(src, true).lhs;
    expect(key(got), src).toBe(key(meant(ls, body)));
  });

  test.prop([integrals])('printing an integral and reading it back changes nothing', ([ls, body]) => {
    const e = meant(ls, body);
    for (const ascii of [false, true]) expect(toText(parseExpr(toText(e, ascii)), ascii)).toBe(toText(e, ascii));
  });

  test.prop([integrals.filter(([ls]) => ls.every(l => l.sign === 'int' && l.dsep === ' ' && !l.mathrm))], { numRuns: 150 })(
    'every keystroke shows a preview, never fewer ∫ than typed, and the last one is the integral', ([ls, body, gap]) => {
      const src = typed(ls, body, gap);
      for (let i = 3; i <= src.length; i++) {
        const p = src.slice(0, i);
        const r = livePreview(p);
        expect(r, `nothing shown for “${p}”`).not.toBeNull();
        const words = (p.match(/int(?![a-z])/g) ?? []).length;
        const shown = (toText(r!.eq).match(/∫/g) ?? []).length;
        const text = toText(r!.eq);
        expect(shown, `“${p}” shows ${text}`).toBeGreaterThanOrEqual(words);
        // a hole stays a hole: no integrand is made up before it is typed
        if (!/1/.test(p.replace(/_\S+?\^\S+/g, ''))) expect(text, `“${p}” made up a 1`).not.toMatch(/(?:∫|\})\s1 d/);
        // bounds and d's already typed stay in view
        const bounds = (p.match(/_\S+\^\S+ /g) ?? []).length;
        expect((text.match(/∫_/g) ?? []).length, `“${p}” lost a bound: ${text}`).toBeGreaterThanOrEqual(bounds);
        for (const d of p.match(/ d[a-zθ](?= )/g) ?? []) expect(text, `“${p}” lost${d}`).toContain(d);
      }
      const last = livePreview(src)!;
      expect(last.whole).toBe(true);
      expect(key(last.eq.lhs)).toBe(key(meant(ls, body)));
    });

  test.prop([integrals.filter(([ls]) => ls.length < 3 && ls.every(l => l.bounds && !/[a-zθ]/.test(l.bounds.join('').replace(/pi/g, ''))))], { numRuns: 60 })(
    'a definite integral typed any way is worth the same number', ([ls, body, gap]) => {
      const src = typed(ls, body, gap);
      const a = evaluate(parseEquation(src, true).lhs, {}), b = evaluate(meant(ls, body), {});
      if (Number.isFinite(b)) expect(Math.abs(a - b)).toBeLessThan(1e-6 * (1 + Math.abs(b)));
    });

  // each term takes at most one piece per variable, so every integral has an elementary answer
  const workable = layers.chain(ls => {
    const piece = (v: string) => fc.constantFrom('', v, `${v}^2`, `sin(${v})`, `cos(${v})`, `e^${v}`, `(${v} + 1)`, `${v} e^${v}`, `${v} sin(${v})`);
    const term = fc.tuple(fc.constantFrom('', '2', '3', '(1/2)'), ...ls.map(l => piece(l.v)))
      .map(([c, ...ps]) => [c, ...ps].filter(Boolean).join(' ') || '1');
    const bounds = fc.tuple(...ls.map((l, k) => fc.tuple(fc.constantFrom('0', '1', '-1', '2'), fc.constantFrom('1', '2', '3'))));
    return fc.tuple(fc.constant(ls.map(l => ({ ...l, sign: 'int' }))), fc.array(term, { minLength: 1, maxLength: 3 }).map(ts => ts.join(' + ')), bounds, fc.boolean());
  });

  test.prop([workable], { numRuns: 40, timeout: 120000 } as never)('stacked integrals work out to the right value, or to an answer, without getting stuck', ([ls, body, bs, definite]) => {
    const withB = ls.map((l, k) => ({ ...l, bounds: definite ? bs[k] as [string, string] : null }));
    const e = eq(meant(withB, body), num(0), 'expr');
    const t0 = performance.now();
    const { steps, stuck } = finishCalc(e);
    const src = typed(withB, body, ' ');
    if (ENV.SLOW && performance.now() - t0 > 300) console.warn('SLOW', Math.round(performance.now() - t0), src);
    expect(stuck, src).toBeUndefined();
    const last = steps.length ? steps[steps.length - 1].eq : e;
    expect(hasCalc(last), `${src} ended at ${toText(last)}`).toBe(false);
    if (definite) {
      const want = evaluate(e.lhs, {}), got = evaluate(last.lhs, {});
      expect(Math.abs(got - want), `${src}: ${toText(last)}`).toBeLessThan(1e-6 * (1 + Math.abs(want)));
    }
  });
});

describe('integral spellings people type', () => {
  const cases: [string, string][] = [
    ['intint x y dx dy', '∫ ∫ xy dx dy'], ['iint x y dx dy', '∫ ∫ xy dx dy'], ['∬ x dx dy', '∫ ∫ x dx dy'],
    ['iiint xyz dx dy dz', '∫ ∫ ∫ xyz dx dy dz'], ['∭ 1 dx dy dz', '∫ ∫ ∫ 1 dx dy dz'],
    ['\\int\\int x\\,dx\\,dy', '∫ ∫ x dx dy'], ['\\iint_0^1 x \\, \\mathrm{d}x \\, \\mathrm{d}y', '∫ ∫_{0}^{1} x dx dy'],
    ['int_0^1int_0^1int_0^1 1 dzdydx', '∫_{0}^{1} ∫_{0}^{1} ∫_{0}^{1} 1 dz dy dx'], ['int 2xdx', '∫ 2x dx'],
    ['int x dy dx', '∫ ∫ x dy dx'], ['int dx', '∫ 1 dx'], ['int_0^1 dx', '∫_{0}^{1} 1 dx'], ['int dx/x', '∫ 1/x dx'],
    ['\\int\\limits_0^1 x^2 dx', '∫_{0}^{1} x^2 dx'], ['integral_0^piint_0^1 r dr dθ', '∫_{0}^{π} ∫_{0}^{1} r dr dθ'],
  ];
  for (const [src, want] of cases) it_(src, () => expect(toText(parseEquation(src, true).lhs)).toBe(want));
  it_('a bound that uses its own variable is caught', () => expect(() => parseEquation('int int_0^x x y dx dy', true)).toThrow(/another letter/));
  it_('dA asks for the order', () => expect(() => parseEquation('iint x dA', true)).toThrow(/dx dy/));
});
