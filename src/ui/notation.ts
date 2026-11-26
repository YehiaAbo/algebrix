// The notation picker: while you type, part of a word (int, lim, alpha, or a LaTeX \sum) brings up
// a few cards with the notation it could mean. ↓ ↑ pick one, Tab takes it. Pure, so it is unit
// tested; the keys and the cards themselves live in keys.ts.

/** one card: what it looks like, what it is, the words that find it, and what it types
 *  ($ is where the caret lands) */
import { toLatex } from '../engine/latex';
import { parseEquation } from '../engine/parse';

export interface Notation { look: string; name: string; words: string; insert: string }

export const NOTATION: Notation[] = [
  // calculus
  { look: '∫ f dx', name: 'integral', words: 'int integral antiderivative', insert: 'int $ dx' },
  { look: '∫ₐᵇ f dx', name: 'definite integral', words: 'int integral definite area', insert: 'int_0^1 $ dx' },
  { look: '∬ f dA', name: 'double integral', words: 'int iint double integral', insert: 'int_0^1 int_0^1 $ dy dx' },
  { look: '∭ f dV', name: 'triple integral', words: 'int iiint triple integral', insert: 'int_0^1 int_0^1 int_0^1 $ dz dy dx' },
  { look: 'Σ', name: 'sum to ∞', words: 'sum sigma series', insert: 'sum_{n=1}^∞ $' },
  { look: 'Σₖ₌₁⁵', name: 'finite sum', words: 'sum sigma finite', insert: 'sum_{k=1}^{5} $' },
  { look: '∏', name: 'product', words: 'prod product', insert: 'prod_{k=1}^{5} $' },
  { look: 'lim', name: 'limit', words: 'lim limit', insert: 'lim x->0 $' },
  { look: 'lim x→∞', name: 'limit at ∞', words: 'lim limit infinity', insert: 'lim x->inf $' },
  { look: 'lim x→0⁺', name: 'from the right', words: 'lim limit right side', insert: 'lim x->0+ $' },
  { look: 'lim x→0⁻', name: 'from the left', words: 'lim limit left side', insert: 'lim x->0- $' },
  { look: 'd/dx', name: 'derivative', words: 'deriv derivative ddx diff', insert: 'd/dx($)' },
  { look: 'd²/dx²', name: 'second derivative', words: 'deriv derivative second diff', insert: 'd^2/dx^2($)' },
  { look: '∂/∂x', name: 'partial derivative', words: 'partial del deriv', insert: '∂/∂x($)' },
  { look: '∇f', name: 'gradient', words: 'grad gradient nabla del', insert: '∇($)' },
  { look: '∇·F', name: 'divergence', words: 'div divergence nabla', insert: 'div($)' },
  { look: '∇×F', name: 'curl', words: 'curl rot nabla', insert: 'curl($)' },
  { look: 'y′', name: 'y prime', words: 'prime ode diff yprime', insert: "y'$" },
  { look: 'y″', name: 'y double prime', words: 'prime ode second ypp', insert: "y''$" },
  { look: '⟨a, b⟩', name: 'vector', words: 'vec vector', insert: '⟨$⟩' },
  // algebra
  { look: '√x', name: 'square root', words: 'sqrt root', insert: 'sqrt($)' },
  { look: '∛x', name: 'cube root', words: 'cbrt cube root', insert: 'cbrt($)' },
  { look: '|x|', name: 'absolute value', words: 'abs absolute modulus', insert: '|$|' },
  { look: 'xⁿ', name: 'power', words: 'pow power exponent', insert: '^($)' },
  { look: 'xₙ', name: 'subscript', words: 'sub subscript index', insert: '_$' },
  { look: 'n!', name: 'factorial', words: 'fact factorial', insert: '!$' },
  { look: 'eˣ', name: 'exponential', words: 'exp exponential', insert: 'e^($)' },
  { look: 'ln', name: 'natural log', words: 'ln log logarithm', insert: 'ln($)' },
  { look: 'sin⁻¹', name: 'inverse sine', words: 'asin arcsin inverse sine', insert: 'sin^-1($)' },
  { look: 'cos⁻¹', name: 'inverse cosine', words: 'acos arccos inverse cosine', insert: 'cos^-1($)' },
  { look: 'tan⁻¹', name: 'inverse tangent', words: 'atan arctan inverse tangent', insert: 'tan^-1($)' },
  { look: '∞', name: 'infinity', words: 'inf infinity infty', insert: '∞$' },
  { look: '≤', name: 'at most', words: 'le leq less', insert: '<= $' },
  { look: '≥', name: 'at least', words: 'ge geq greater', insert: '>= $' },
  // Greek
  ...([['α', 'alpha'], ['β', 'beta'], ['γ', 'gamma'], ['δ', 'delta'], ['ε', 'epsilon'], ['θ', 'theta'], ['λ', 'lambda'], ['μ', 'mu'], ['π', 'pi'], ['ρ', 'rho'], ['σ', 'sigma'], ['τ', 'tau'], ['φ', 'phi'], ['ω', 'omega']] as const)
    .map(([g, w]) => ({ look: g, name: w, words: `${w} greek`, insert: `${g}$` })),
];

/** the cards for the word just before the caret: a LaTeX \word, or 2+ letters */
export function notationFor(src: string, caret: number): { from: number; to: number; items: Notation[] } | null {
  const m = /(\\?)([a-zA-Z]+)$/.exec(src.slice(0, caret));
  if (!m || (!m[1] && m[2].length < 2)) return null;
  const w = m[2].toLowerCase();
  const score = (n: Notation) => { const ws = n.words.split(' '); return ws[0] === w || n.name === w ? 0 : ws.includes(w) ? 1 : ws.some(x => x.startsWith(w)) ? 2 : 3; };
  const items = NOTATION.map((n, i) => ({ n, i, s: score(n) })).filter(x => x.s < 3).sort((a, b) => a.s - b.s || a.i - b.i).slice(0, 6).map(x => x.n);
  return items.length ? { from: caret - m[0].length, to: caret, items } : null;
}

/** the text with the word swapped for the card's notation, and where the caret goes */
export function insertNotation(src: string, at: { from: number; to: number }, n: Notation): { text: string; caret: number } {
  const ins = n.insert.replace('$', '');
  const c = n.insert.indexOf('$');
  return { text: src.slice(0, at.from) + ins + src.slice(at.to), caret: at.from + (c < 0 ? ins.length : c) };
}

/* ---------- in the live math editor, where the text is LaTeX ---------- */

/** what a card types in the editor, as LaTeX with $ for the cursor */
export function noteTex(n: Notation): string {
  const FRAGMENTS: Record<string, string> = { '^($)': '^{$}', '_$': '_{$}', '!$': '!$', '<= $': '\\le $', '>= $': '\\ge $' };
  if (FRAGMENTS[n.insert]) return FRAGMENTS[n.insert];
  try { return toLatex(parseEquation(n.insert.replace('$', '□'), true)).replace('□', '$'); } catch { return n.insert; }
}

/** the cards for where the cursor is in the editor: after 2+ plain letters (deriv, abs, gre…), or
 *  in a ∫, Σ, ∏, lim or √ just made from its word and still empty, which the cards can replace.
 *  from and to are what a card replaces, in the LaTeX */
export function notationAt(before: string, latex: string): { from: number; to: number; items: Notation[] } | null {
  const after = latex.slice(before.length);
  const made = /\\(int|sum|prod|lim|sqrt)(?:_\{\s*(?:n=)?|\{\s*)$/.exec(before);
  const close = made && /^\s*\}(?:\^\{\s*\})?/.exec(after);
  if (made && close) {
    const got = notationFor(made[1], made[1].length);
    return got && { from: before.length - made[0].length, to: before.length + close[0].length, items: got.items };
  }
  const m = /(?:^|[^\\a-zA-Z])([a-zA-Z]{2,})$/.exec(before);
  if (!m) return null;
  const got = notationFor(m[1], m[1].length);
  return got && { from: before.length - m[1].length, to: before.length, items: got.items };
}
