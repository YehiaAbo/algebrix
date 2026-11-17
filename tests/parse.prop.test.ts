// Property tests for reading what people type, beyond integrals: random expressions built from
// every piece the parser knows, in the spellings people use (x², sin^2 x, √x, |x|, \frac, …).
// Each must parse, print to a form that reads back as itself, keep its value through that
// round trip, and give the live preview something to show (or nothing) at every keystroke,
// never an error. fast-check shrinks a failure to the smallest expression that breaks.
import { describe, expect, it as it_ } from 'vitest';
import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import '../src/engine/calculus';
import { parseEquation, ParseError } from '../src/engine/parse';
import { evaluate, Node } from '../src/engine/ast';
import { toText } from '../src/engine/print';
import { livePreview } from '../src/ui/shared';

const ENV: Record<string, string | undefined> = (globalThis as { process?: { env: Record<string, string> } }).process?.env ?? {};
fc.configureGlobal({ seed: Number(ENV.SEED ?? 20261118), numRuns: 500 });

const VARS = ['x', 'y', 'a', 'θ', 'x_1'];
const leaf = fc.oneof(
  fc.integer({ min: 0, max: 12 }).map(String),
  fc.constantFrom('0.5', '2.25', '1/2', '3/4', 'π', 'pi', 'e', '½'),
  fc.constantFrom(...VARS),
);

/** a typed expression, as text; `tight` keeps it to one piece (safe before ^ or after a function) */
const expr = fc.letrec<{ expr: string; piece: string }>(tie => ({
  piece: fc.oneof({ depthSize: 'small', withCrossShrink: true },
    leaf,
    tie('expr').map(e => `(${e})`),
    fc.tuple(fc.constantFrom('sqrt', '√', 'abs', 'sin', 'cos', 'tan', 'ln', 'log', 'sec', 'exp'), tie('expr')).map(([f, e]) => (f === '√' ? `√(${e})` : `${f}(${e})`)),
    tie('expr').map(e => `|${e}|`),
    fc.tuple(fc.constantFrom('sin', 'cos', 'ln'), fc.constantFrom('^2', '²', '^3'), fc.constantFrom(...VARS)).map(([f, p, v]) => `${f}${p} ${v}`),
    fc.tuple(fc.constantFrom(...VARS), fc.constantFrom('²', '³', '^2', '^-1', '^(1/2)', '^{3}')).map(([v, p]) => v + p),
    fc.constantFrom('\\frac{1}{2}', '\\frac12', '\\sqrt{x}', '\\sqrt[3]{y}', '\\pi', '\\alpha', 'theta', '3!', '2^3^2', 'e^-x', 'sin 2x', 'log_2 8'),
  ),
  expr: fc.oneof({ depthSize: 'small', withCrossShrink: true },
    tie('piece'),
    fc.tuple(tie('expr'), fc.constantFrom(' + ', '+', ' - ', '-', ' * ', '*', ' ', '·', ' / ', '/', '×'), tie('piece')).map(([a, op, b]) => a + op + b),
    fc.tuple(tie('piece'), fc.constantFrom('^2', '^3', '^-1', '^(x+1)')).map(([a, p]) => (/^[\w.π]+$/.test(a) ? a : `(${a})`) + p),
    tie('piece').map(e => `-${e}`),
    tie('piece').map(e => `2${e}`),
  ),
})).expr;

const parse = (s: string) => parseEquation(s, true).lhs;
const values = (n: Node, envs: Record<string, number>[]) => envs.map(env => evaluate(n, env));
const ENVS = [0.37, 1.3, 2.71].map((k, i) => Object.fromEntries(VARS.map((v, j) => [v, k + 0.11 * j + 0.05 * i])));
const close = (a: number, b: number) => !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) <= 1e-7 * (1 + Math.abs(a) + Math.abs(b));

describe('reading what people type', () => {
  test.prop([expr])('anything built from the known pieces parses', src => {
    expect(() => parse(src), src).not.toThrow();
  });

  test.prop([expr])('what is shown reads back as itself, with the same value', src => {
    const e = parse(src);
    for (const ascii of [false, true]) {
      const shown = toText(e, ascii);
      const again = parse(shown);
      expect(toText(again, ascii), `${src} → ${shown}`).toBe(shown);
      const [a, b] = [values(e, ENVS), values(again, ENVS)];
      a.forEach((x, k) => expect(close(x, b[k]), `${src} → ${shown}: ${x} vs ${b[k]}`).toBe(true));
    }
  });

  test.prop([expr], { numRuns: 150 })('every keystroke gives the preview something to show, or nothing, but never an error', src => {
    for (let i = 1; i <= src.length; i++) expect(() => livePreview(src.slice(0, i)), src.slice(0, i)).not.toThrow();
    expect(livePreview(src)?.whole, src).toBe(true);
  });
});

describe('spellings people type', () => {
  const cases: [string, string][] = [
    ['x²+2x+1=0', 'x^2 + 2x + 1 = 0'], ['πr²', 'πr^2'], ['x**2', 'x^2'], ['½x = 3', '(1/2)x = 3'], ['∛x', 'x^(1/3)'],
    ['e^x^2', 'e^(x^2)'], ['sin2x', 'sin(2x)'], ['sin 2x cos x', 'sin(2x) cos(x)'], ['sin^2 x + cos²x', 'sin(x)^2 + cos(x)^2'],
    ['\\sin^2 x', 'sin(x)^2'], ['log_2 8', 'ln(8)/ln(2)'], ['\\log_2 x', 'ln(x)/ln(2)'], ['log_10 x', 'log(x)'],
    ['sec x', '1/cos(x)'], ['cot x', '1/tan(x)'], ['sinh x', '(e^x − e^(−x))/2'], ['theta + alpha', 'θ + α'],
    ['x1 + x2', 'x_1 + x_2'], ['\\frac12', '1/2'], ['50%', '50/100'], ['x =< 2', 'x ≤ 2'], ['1 000', '1·0'],
    ['x - (y + 1)', 'x − (y + 1)'], ['-(x+1)', '−(x + 1)'], ['|2|x||', '|2·|x||'], ['−x·y', '−xy'], ['3 – 1', '3 − 1'],
  ];
  for (const [src, want] of cases) it_(src, () => expect(toText(parseEquation(src, true))).toBe(want));
  for (const [src, why] of [['x != 2', /≠/], ['x ≠ 2', /≠/], ['floor(x)', /floor/], ['5 mod 3', /mod/], ['2 < x < 5', /two/]] as const)
    it_(`${src} says why`, () => expect(() => parseEquation(src, true)).toThrow(why));
  // these show while you type: nothing typed after them could fix them; an unfinished one waits
  const sure = (src: string) => { try { parseEquation(src, true); return null; } catch (e) { return (e as ParseError).sure; } };
  it_('a mistake no more typing can fix shows at once; an unfinished one waits', () => {
    for (const src of ['x != 2', 'x ≠', 'floor(x', '2 < x < 5', 'x = 1 = 2']) expect(sure(src), src).toBe(true);
    for (const src of ['x +', '(x + 1', 'sin(', 'x = ']) expect(sure(src), src).toBe(false);
  });
});
