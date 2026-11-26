// LaTeX in and out (src/engine/latex.ts), the format the typing boxes and the export speak.
// Laws: every equation in the problem bank, and thousands of random expressions, printed as LaTeX
// read back as exactly the same tree; and what the live editor writes reads as what was meant.
import { describe, expect, it } from 'vitest';
import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import { readFileSync, readdirSync } from 'node:fs';
import '../src/engine/calculus';
import { parseEquation } from '../src/engine/parse';
import { key, Node, evaluate } from '../src/engine/ast';
import { toLatex, latexToText, fromLatex } from '../src/engine/latex';

const ENV: Record<string, string | undefined> = (globalThis as { process?: { env: Record<string, string> } }).process?.env ?? {};
fc.configureGlobal({ seed: Number(ENV.SEED ?? 20261126), numRuns: 500 });

/** a tree with each group inside a sum spread into it: x + (y + 1) is shown x + y + 1, in LaTeX as in text */
const flat = (n: unknown): unknown => {
  if (!n || typeof n !== 'object') return n;
  const m = (Array.isArray(n) ? n.map(flat) : Object.fromEntries(Object.entries(n).map(([k, v]) => [k, flat(v)]))) as { k?: string; terms?: Node[] };
  if (m.k === 'add') m.terms = m.terms!.flatMap(t => (t.k === 'add' ? t.terms : [t]));
  return m;
};
const textTrip = (e: Node) => key(flat(e) as Node);
const back = (tex: string) => key(flat(fromLatex(tex)) as Node);

/** every problem the bank holds, as an equation */
const BANK: string[] = readdirSync('playtest/problems').filter(f => f.endsWith('.txt')).flatMap(f =>
  readFileSync(`playtest/problems/${f}`, 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split('|')[2]?.trim()).filter(Boolean));

describe('LaTeX out and back', () => {
  it('every problem in the bank reads back from its LaTeX as the same tree', () => {
    let n = 0;
    for (const src of BANK) {
      let e;
      try { e = parseEquation(src, true); } catch { continue; }
      n++;
      const tex = toLatex(e);
      expect(back(tex), `${src}\n  → ${tex}\n  → ${latexToText(tex)}`).toBe(textTrip(e));
    }
    expect(n).toBeGreaterThan(300);
  });

  const VARS = ['x', 'y', 'a', 'θ', 'x_1', 't'];
  const leaf = fc.oneof(fc.integer({ min: 0, max: 12 }).map(String), fc.constantFrom('0.5', '1/2', 'π', 'e', '∞'), fc.constantFrom(...VARS));
  const expr = fc.letrec<{ expr: string; piece: string }>(tie => ({
    piece: fc.oneof({ depthSize: 'small', withCrossShrink: true },
      leaf,
      tie('expr').map(e => `(${e})`),
      fc.tuple(fc.constantFrom('sqrt', 'abs', 'sin', 'cos', 'tan', 'ln', 'log', 'asin', 'atan'), tie('expr')).map(([f, e]) => `${f === 'asin' ? 'sin^-1' : f === 'atan' ? 'tan^-1' : f}(${e})`),
      fc.tuple(fc.constantFrom('sin', 'cos', 'ln'), fc.constantFrom('^2', '^3'), fc.constantFrom(...VARS)).map(([f, p, v]) => `${f}${p} ${v}`),
      fc.tuple(fc.constantFrom(...VARS), fc.constantFrom('^2', '^-1', '^(1/2)', '^(x+1)')).map(([v, p]) => v + p),
      fc.constantFrom('3!', 'log_2 8', "y'", "f'(x)", 'f(x+1)', 'g(2, 3)', '⟨1, x, 2⟩', 'd/dx(x^2)', '∂/∂y(x y)', 'dy/dx', 'd^2y/dx^2', '∇(x y)'),
      fc.tuple(fc.constantFrom('int', 'int_0^1', 'int_{-1}^{π}', 'sum_{n=1}^∞', 'prod_{k=1}^{5}', 'lim x->0', 'lim x->∞', 'lim x->0+', 'lim x->2-'), tie('piece')).map(([op, e]) => {
        const v = op.startsWith('sum') ? 'n' : op.startsWith('prod') ? 'k' : 'x';
        return op.startsWith('int') ? `${op} (${e}) d${v}` : `${op} (${e} + ${v})`;
      }),
    ),
    expr: fc.oneof({ depthSize: 'small', withCrossShrink: true },
      tie('piece'),
      fc.tuple(tie('expr'), fc.constantFrom(' + ', ' - ', ' * ', ' ', ' / '), tie('piece')).map(([a, op, b]) => a + op + b),
      tie('piece').map(e => `-${e}`),
      tie('piece').map(e => `2${e}`),
    ),
  })).expr;
  const rel = fc.constantFrom('', ' = 0', ' = y', ' <= 3', ' > x');

  const ENVS = [0.37, 1.3, 2.71].map(k => Object.fromEntries(VARS.map((v, j) => [v, k + 0.11 * j])));
  const close = (a: number, b: number) => (Number.isNaN(a) && Number.isNaN(b)) || a === b || Math.abs(a - b) <= 1e-7 * (1 + Math.abs(a) + Math.abs(b));
  test.prop([expr, rel])('any expression or equation printed as LaTeX reads back as itself, with the same value', (src, r) => {
    let e;
    try { e = parseEquation(src + r, true); } catch { return; }
    const tex = toLatex(e);
    const again = fromLatex(tex);
    // the LaTeX of what was read is the LaTeX that was written (1·x is shown x either way)
    expect(toLatex(again), `${src + r}\n  → ${tex}\n  → ${latexToText(tex)}`).toBe(tex);
    for (const env of ENVS) {
      const [a, b] = [evaluate(e.lhs, env) - evaluate(e.rhs, env), evaluate(again.lhs, env) - evaluate(again.rhs, env)];
      expect(close(a, b), `${src + r} → ${tex}: ${a} vs ${b}`).toBe(true);
    }
  });
});

describe('what the live editor writes', () => {
  // (LaTeX as MathQuill writes it, what it means typed as text)
  const cases: [string, string][] = [
    ['x^2+2x+1=0', 'x^2 + 2x + 1 = 0'],
    ['f\\left(x\\right)=x^2+2x', 'f(x) = x^2 + 2x'],
    ["f'\\left(x\\right)=2x", "f'(x) = 2x"],
    ['\\frac{1}{2}x', '(1/2)x'],
    ['\\frac{x+1}{x-1}', '(x+1)/(x-1)'],
    ['x^{2+2x}', 'x^(2+2x)'],
    ['e^{-x}', 'e^(-x)'],
    ['\\sqrt{x^2+1}', 'sqrt(x^2 + 1)'],
    ['\\sqrt[3]{x}', 'cbrt(x)'],
    ['\\left|x-1\\right|', '|x - 1|'],
    ['\\sin\\left(x\\right)', 'sin(x)'],
    ['\\sin x\\cos x', 'sin x cos x'],
    ['\\sin^{-1}\\left(x\\right)', 'sin^-1(x)'],
    ['\\sin^2x', 'sin^2 x'],
    ['\\ln\\left(x\\right)', 'ln(x)'],
    ['\\log_{2}\\left(8\\right)', 'log_2(8)'],
    ['\\pi r^2', 'πr^2'],
    ['\\theta+\\alpha', 'θ + α'],
    ['x_1+x_2', 'x_1 + x_2'],
    ['x\\le3', 'x <= 3'],
    ['x\\ge3', 'x >= 3'],
    ['3\\cdot4', '3*4'],
    ['\\int x\\ dx', 'int x dx'],
    ['\\int xdx', 'int x dx'],
    ['\\int_0^1x^2dx', 'int_0^1 x^2 dx'],
    ['\\int_{0}^{\\pi}\\sin x\\ dx', 'int_0^pi sin x dx'],
    ['\\int_0^1\\int_0^xy\\ dy\\ dx', 'int_0^1 int_0^x y dy dx'],
    ['\\sum_{n=1}^{\\infty}\\frac{1}{n^2}', 'sum_{n=1}^∞ 1/n^2'],
    ['\\prod_{k=1}^{5}k', 'prod_{k=1}^5 k'],
    ['\\lim_{x\\to0}\\frac{\\sin x}{x}', 'lim x->0 sin(x)/x'],
    ['\\lim_{x\\to0^+}\\frac{1}{x}', 'lim x->0+ 1/x'],
    ['\\lim_{x\\to\\infty}\\frac{1}{x}', 'lim x->inf 1/x'],
    ['\\frac{d}{dx}\\left(x^2\\right)', 'd/dx(x^2)'],
    ['\\frac{dy}{dx}=y', 'dy/dx = y'],
    ['\\frac{d^2y}{dx^2}+y=0', 'd^2y/dx^2 + y = 0'],
    ['\\frac{\\partial}{\\partial y}\\left(xy\\right)', '∂/∂y(x y)'],
    ['\\left\\langle 1,2\\right\\rangle ', '⟨1, 2⟩'],
    ['I\\left(t\\right)=\\int_0^1\\frac{x^t-1}{\\ln x}dx', 'I(t) = int_0^1 (x^t - 1)/ln(x) dx'],
    ['\\nabla \\cdot \\left\\langle x,y\\right\\rangle ', 'div(⟨x, y⟩)'],
    ['3!', '3!'],
    ['\\operatorname{sech}x', 'sechx'],
  ];
  for (const [tex, text] of cases) it(`${tex} reads as ${text}`, () => {
    let want: string;
    try { want = key(parseEquation(text, true)); } catch { want = 'error'; }
    let got: string;
    try { got = key(fromLatex(tex)); } catch (e) { got = 'error: ' + (e as Error).message; }
    expect(got, latexToText(tex)).toBe(want);
  });

  it('an empty slot is a hole still to fill', () => {
    expect(latexToText('\\frac{1}{ }')).toBe('((1)/(□))');
    expect(latexToText('x^{ }')).toBe('x^□');
    expect(latexToText('\\sqrt{}')).toBe('sqrt(□)');
  });
});
