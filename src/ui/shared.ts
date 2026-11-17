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

export interface Tech { key: string; label: string; ok: boolean; run: () => void }
/** calc: the calculus hub (C) rather than the algebra hub (Tab) */
export interface Hub { forms: Form[]; techs: Tech[]; i: number; sticky: boolean; moved: boolean; awaitVar: boolean; calc?: boolean }

export function livePreview(src: string): { eq: Eq; partial: boolean } | null {
  if (!src.trim()) return null;
  const close = (t: string) => {
    let depth = 0;
    for (const c of t) { if (c === '(') depth++; else if (c === ')') depth = Math.max(0, depth - 1); }
    const bars = (t.match(/\|/g) ?? []).length % 2;
    return t + ')'.repeat(depth) + (bars ? '|' : '');
  };
  let t = src;
  for (let i = 0; i < 16 && t.trim(); i++) {
    for (const cand of i === 0 ? [t, close(t)] : [close(t)]) {
      try { return { eq: parseEquation(cand, true), partial: cand !== src }; } catch { /* keep trimming */ }
    }
    t = t.trimEnd().slice(0, -1);
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
