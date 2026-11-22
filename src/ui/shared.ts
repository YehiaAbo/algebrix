// Types, constants and small helpers shared by the app and its parts.
import { Eq } from '../engine/ast';
import { Domain } from '../engine/moves';
import { parseEquation } from '../engine/parse';
import { MoveName } from '../engine/moves';
import { Form } from '../engine/forms';

/** a step in another equation's tree: the equation (by its uid) and the step (by its id) */
export interface Link { slot: string; step: string }
/** one step of work: what it is, the rule it used, and whether it is reversible (⇔) or one-way (⇒).
 *  id: stable, for the work tree. link: the step in another equation this one used (a substitution) */
export interface Step { eq: Eq; label: string; conditions: string[]; auto?: boolean; rule?: string; dir?: '⇔' | '⇒'; answer?: string; id?: string; link?: Link; fx?: StepFx; back?: number }
/** how the move's pieces travelled (what merged into what, what was copied where), so undo can play it backwards */
export interface StepFx { absorbs: [string, string][]; flights: { from: string; to: string }[] }
/** origin: the equation a case came from, to check answers against. bad: why its answer fails.
 *  steps is the line you are on (start to its last step); alts are the other lines you tried, each
 *  from the start, together the work tree. uid names the equation for links; from: the step it came out of */
/** named: this equation is a name made with b (u = x², t = 2, I(t) = …, x = sin θ) */
export interface Slot { steps: Step[]; at: number; sel: string | null; origin?: Eq; bad?: string; uid?: string; alts?: Step[][]; from?: Link; named?: 'letter' | 'param' | 'fn' | 'expr' }
export type Mode = 'write' | 'solve' | 'labels' | 'op' | 'hub' | 'fnpal' | 'fnask';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** run fn after el changes size, once per frame: a callback that changes layout inside the
 *  observer itself makes the browser loop ("ResizeObserver loop completed…") */
export const onResize = (el: Element, fn: (r: DOMRectReadOnly) => void) => {
  let raf = 0, last: DOMRectReadOnly | null = null;
  new ResizeObserver(es => { last = es[es.length - 1].contentRect; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => fn(last!)); }).observe(el);
};
/** write markup only when it changed: rebuilding the same bar every key costs style and layout for nothing */
const written = new WeakMap<Element, string>();
export const setHtml = (el: Element, html: string) => { if (written.get(el) !== html || el.innerHTML === '') { written.set(el, html); el.innerHTML = html; } };

/** single keys that act straight away (aim + key = move) */
export const MOVE_KEYS: { key: string; name: MoveName | 'any'; verb: string; pitch: number }[] = [
  { key: 'm', name: 'any', verb: 'move across', pitch: 1 },
  { key: 's', name: 'simplify', verb: 'simplify', pitch: 1.2 },
  { key: 'd', name: 'distribute', verb: 'distribute', pitch: 1.1 },
  { key: 'x', name: 'swap', verb: 'swap sides', pitch: 0.8 },
];

/** typing an operator starts a both-sides operation; no Shift needed (= is +, . is ×) */
export const OP_KEYS: Record<string, string> = { '=': '+', '+': '+', '-': '-', '.': '*', '*': '*', '/': '/' };
export const OP_SHOW: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

export const LABEL_CHARS = 'asdfghjklqwertyuiopzxcvbnm';
export const DOMAIN_TEXT: Record<Domain, string> = { real: 'real number', positive: 'positive', nonneg: 'zero or more', integer: 'whole number' };

/** group: its section in the C hub. ask: it needs something typed first (a limit's target, bounds) */
export interface Tech { key: string; label: string; ok: boolean; run: () => void; group?: string; lead?: boolean; shortcut?: boolean; ask?: { prompt: string; hint: string; run: (text: string) => void } }
/** calc: the calculus hub (C) rather than the algebra hub (Tab); there, tab is the section shown and
 *  asking the technique waiting for typed input */
export interface Hub { forms: Form[]; techs: Tech[]; i: number; sticky: boolean; moved: boolean; awaitVar: boolean; calc?: boolean; tab?: number; asking?: Tech }

/** words that are on their way while you type them: their first letters shouldn't show as a·b */
const WORDS = ['int', 'integral', 'iint', 'iiint', 'lim', 'sum', 'prod', 'sqrt', 'cbrt', 'arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'abs', 'exp', 'ln', 'log', 'pi', 'grad', 'div', 'curl', 'inf',
  'alpha', 'beta', 'gamma', 'delta', 'theta', 'lambda', 'sigma', 'omega', 'epsilon', 'phi', 'rho', 'tau'];

/** What to show while typing. Unfinished input is completed with □ where something is still to
 *  come (x + □, d/dx(□), ∫ □ dx), brackets close themselves, and a word being typed is left out
 *  until it's whole. exact: the text parses as it is. whole: nothing was left out and there's no □,
 *  so Enter can take the preview (an unclosed bracket is fine). */
const EMPTY_INT = /(?:∫|int)(?:_\s*(?:\{[^}]*\}|\([^)]*\)|[^\s{(^]+)\s*\^\s*(?:\{[^}]*\}|\([^)]*\)|[^\s{(]+))?\s*d[a-zA-Zα-ω□](?![a-zA-Z])/;

export function livePreview(src: string): { eq: Eq; partial: boolean; exact: boolean; whole: boolean } | null {
  if (!src.trim()) return null;
  const close = (t: string) => {
    let depth = 0;
    for (const c of t) { if (c === '(') depth++; else if (c === ')') depth = Math.max(0, depth - 1); }
    const bars = (t.match(/\|/g) ?? []).length % 2;
    return t + ')'.repeat(depth) + (bars ? '|' : '');
  };
  const parse = (t: string) => { try { return parseEquation(t, true); } catch { return null; } };
  // a word on its way (2+ letters of int, lim, sin…, or the d of a dx): leave it out for now
  let t = src;
  const tail = /(?:^|[^a-zA-Z])([a-zA-Z]{2,}|d\/d?|∂\/∂?)$/.exec(t);
  if (tail && (/[/]/.test(tail[1]) || (!WORDS.includes(tail[1]) && WORDS.some(w => w.startsWith(tail[1]))))) t = t.slice(0, t.length - tail[1].length);
  // in an integral, a lone d is a dx on its way, and a lone i another ∫
  else if (/(?:^|[^a-zA-Z])[di]$/.test(t) && /int|∫/.test(t)) t = t.slice(0, -1);
  // d²y/dx² on its way (d^2y, d^2y/d, d^2y/dx): shown whole, the second derivative it will be
  const d2 = /(?:^|[^a-zA-Z])d(?:\^2|²) ?([a-zA-Z])(?: ?\/ ?(?:d(?:([a-zA-Z])\^?)?)?)?$/.exec(t);
  if (t === src && d2) {
    const g = parse(t.slice(0, t.length - d2[0].length + (d2[0].startsWith('d') ? 0 : 1)) + `d^2${d2[1]}/d${d2[2] ?? 'x'}^2`);
    if (g) return { eq: g, partial: true, exact: false, whole: false };
  }
  if (t === src) {
    const exact = parse(src);
    if (exact) return { eq: exact, partial: false, exact: true, whole: true };
  }
  // the first integral closes with dx; once a d-letter is typed, the next one waits as d□
  const dv = /(?:^|[^a-zA-Z])d[a-zA-Z](?![a-zA-Z(])/.test(t) ? ' d□' : ' dx';
  const ENDS = ['', '□', ' □', ' □ □', ' x->□ □', dv, ' □' + dv, ' □ □' + dv, '^□ □' + dv, '□^□ □' + dv, '_{n=□}^{□} □', ' □)'];
  for (let i = 0; i < 16; i++) {
    const base = t.trimEnd();
    if (!base) return null;
    // stacked integrals each wait for their own d□
    const outer = /int|∫/.test(base) ? ['', ' d□', ' d□ d□'] : [''];
    for (const more of outer) {
      for (const end of ENDS) {
        for (const cand of [close(base + end) + more, close(base) + end + more]) {
          // a closing d□ must not turn a missing integrand into 1 (∫_0^1 dx): that hole stays □
          if (EMPTY_INT.test(cand)) continue;
          const eq = parse(cand);
          if (eq) return { eq, partial: true, exact: false, whole: i === 0 && t === src && !cand.includes('□') };
        }
      }
    }
    t = base.slice(0, -1);
  }
  return null;
}

/** a variable name for HTML: x_1 shows as x with a subscript 1 */
export function varHtml(v: string) {
  const u = v.indexOf('_');
  return u < 0 ? escapeHtml(v) : `${escapeHtml(v.slice(0, u))}<sub>${escapeHtml(v.slice(u + 1))}</sub>`;
}

/** a text form as HTML that reads like math: √( for sqrt(, powers raised */
export const mathHtml = (t: string) => supHtml(escapeHtml(t.replace(/sqrt\(/g, '√(')));

/** powers raised in escaped text: x^2e^x → x<sup>2</sup>e<sup>x</sup>, e^(x^2/2) nested too */
export function supHtml(t: string): string {
  return t.replace(/\^(?:\(((?:[^()]|\([^()]*\))*)\)|(−?\d+(?:\.\d+)?|[a-zA-Zα-ωπ]))/g, (_, g, a) => `<sup>${g ? supHtml(g) : a}</sup>`);
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

/** step names and bar messages read as math, not as typed code: sqrt(x + 2) is √(x + 2), y^2 is y² */
const SUP: Record<string, string> = Object.fromEntries([...'0123456789+−-=()nixtkab'].map((c, i) => [c, '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿⁱˣᵗᵏᵃᵇ'[i]]));
const SUB: Record<string, string> = Object.fromEntries([...'0123456789+−-=()nixtkaeo'].map((c, i) => [c, '₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎ₙᵢₓₜₖₐₑₒ'[i]]));
const small = (t: string, m: Record<string, string>) => ([...t].every(c => m[c]) ? [...t].map(c => m[c]).join('') : null);
export const pretty = (s: string) => s
  .replace(/\bsqrt\(/g, '√(').replace(/\bcbrt\(/g, '∛(')
  // ∫_{0}^{1} and Σ_{n=1}^{10}: bounds as small numbers, as they are drawn
  .replace(/_\{([^{}]+)\}/g, (m, t) => small(t, SUB) ?? m)
  .replace(/\^\{([^{}]+)\}/g, (m, t) => small(t, SUP) ?? m)
  .replace(/\^([0-9]+|[a-z])(?![\w.(])/g, (m, t) => small(t, SUP) ?? m);

/** The aim box at x, y, w × h with corner radius R and a ring t thick (outside the box), as nine
 *  pieces placed only by transform: a fill scaled to size, four corners that move, four edges that
 *  move and stretch along their length, and the two Ctrl arrows. Built on first use. */
export function aimBox(el: HTMLElement, x: number, y: number, w: number, h: number, R: number, t: number) {
  if (!el.firstChild) el.innerHTML = '<i class="sf"></i><i class="sc tl"></i><i class="sc tr"></i><i class="sc bl"></i><i class="sc br"></i><i class="se et"></i><i class="se eb"></i><i class="se el"></i><i class="se er"></i><span class="nub nl"><i></i></span><span class="nub nr"><i></i></span>';
  const [f, tl, tr, bl, br, et, eb, el_, er, nl, nr] = [...el.children] as HTMLElement[];
  // the box's edges on whole device pixels, so the ring is crisp when it lands
  const d = window.devicePixelRatio || 1, px = (v: number) => Math.round(v * d) / d;
  [x, y, w, h] = [px(x), px(y), px(w), px(h)];
  R = Math.min(R, w / 2, h / 2);
  const X = x - t, Y = y - t, W = w + 2 * t, H = h + 2 * t, Rr = R + t;
  const at = (n: HTMLElement, a: number, b: number, sx = 1, sy = 1) => { n.style.transform = `translate(${a}px, ${b}px)${sx !== 1 || sy !== 1 ? ` scale(${sx}, ${sy})` : ''}`; };
  at(f, x, y, w / 100, h / 100);
  f.style.borderRadius = `${(R / w) * 100}% / ${(R / h) * 100}%`;
  for (const [n, rad] of [[tl, 'borderTopLeftRadius'], [tr, 'borderTopRightRadius'], [bl, 'borderBottomLeftRadius'], [br, 'borderBottomRightRadius']] as const) {
    n.style.width = n.style.height = `${Rr}px`;
    n.style[rad] = `${Rr}px`;
  }
  at(tl, X, Y); at(tr, X + W - Rr, Y); at(bl, X, Y + H - Rr); at(br, X + W - Rr, Y + H - Rr);
  // the edges reach half a pixel into the corners, so no seam shows where they meet
  const lx = Math.max(0, W - 2 * Rr + 1) / 100, ly = Math.max(0, H - 2 * Rr + 1) / 100;
  at(et, X + Rr - 0.5, Y, lx); at(eb, X + Rr - 0.5, Y + H - 10, lx);
  at(el_, X, Y + Rr - 0.5, 1, ly); at(er, X + W - 10, Y + Rr - 0.5, 1, ly);
  at(nl, X - 11, y + h / 2 - 6); at(nr, X + W + 4, y + h / 2 - 6);
}
