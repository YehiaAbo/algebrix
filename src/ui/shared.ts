// Types, constants and small helpers shared by the app and its parts.
import { Eq } from '../engine/ast';
import { Domain } from '../engine/moves';
import { parseEquation } from '../engine/parse';
import { MoveName } from '../engine/moves';
import { Form } from '../engine/forms';

/** one step of work: what it is, the rule it used, and whether it is reversible (⇔) or one-way (⇒) */
export interface Step { eq: Eq; label: string; conditions: string[]; auto?: boolean; rule?: string; dir?: '⇔' | '⇒'; answer?: string }
/** origin: the equation a case came from, to check answers against. bad: why its answer fails */
export interface Slot { steps: Step[]; at: number; sel: string | null; origin?: Eq; bad?: string }
export type Mode = 'write' | 'solve' | 'labels' | 'op' | 'hub' | 'fnpal' | 'fnask';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

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
export interface Tech { key: string; label: string; ok: boolean; run: () => void; group?: string; lead?: boolean; ask?: { prompt: string; hint: string; run: (text: string) => void } }
/** calc: the calculus hub (C) rather than the algebra hub (Tab); there, tab is the section shown and
 *  asking the technique waiting for typed input */
export interface Hub { forms: Form[]; techs: Tech[]; i: number; sticky: boolean; moved: boolean; awaitVar: boolean; calc?: boolean; tab?: number; asking?: Tech }

/** words that are on their way while you type them: their first letters shouldn't show as a·b */
const WORDS = ['int', 'integral', 'lim', 'sum', 'sqrt', 'cbrt', 'arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan', 'sin', 'cos', 'tan', 'abs', 'exp', 'ln', 'log', 'pi', 'grad', 'div', 'curl', 'inf'];

/** What to show while typing. Unfinished input is completed with □ where something is still to
 *  come (x + □, d/dx(□), ∫ □ dx), brackets close themselves, and a word being typed is left out
 *  until it's whole. exact: the text parses as it is. whole: nothing was left out and there's no □,
 *  so Enter can take the preview (an unclosed bracket is fine). */
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
  else if (/(?:^|[^a-zA-Z])d$/.test(t) && /int|∫/.test(t)) t = t.slice(0, -1);
  if (t === src) {
    const exact = parse(src);
    if (exact) return { eq: exact, partial: false, exact: true, whole: true };
  }
  const ENDS = ['', '□', ' □', ' □ □', ' x->□ □', ' dx', ' □ dx', '_{n=□}^{□} □', ' □)'];
  for (let i = 0; i < 16; i++) {
    const base = t.trimEnd();
    if (!base) return null;
    for (const end of ENDS) {
      for (const cand of [close(base + end), close(base) + end]) {
        const eq = parse(cand);
        if (eq) return { eq, partial: true, exact: false, whole: i === 0 && t === src && !cand.includes('□') };
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

export function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
