// Both sides: type an operator, watch it live, Enter applies it.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { Node, find, findPath } from '../engine/ast';
import { toText } from '../engine/print';
import { applyBothChecked, isErr, MoveResult, checked } from '../engine/moves';
import { wrapBoth, Wrap } from '../engine/techniques';
import { parseExpr } from '../engine/parse';
import { absOf, coefOf } from '../engine/terms';
import { $, OP_SHOW } from './shared';
import type { App } from './app';

/** What you most likely want to apply, given what is aimed: the thing that cancels it. */
export function prefill(this: App, op: string): string {
  const n = this.sel && this.sel !== 'eq' ? find(this.eq, this.sel) : null;
  if (!n) return '';
  const path = findPath(this.eq, n.id)!;
  const side = path[1];
  const txt = (m: Node) => toText(m, true);
  if (op === '+' || op === '-') return txt(absOf(n));
  if (op === '/') {
    if (n === side && n.k === 'mul') { const c = coefOf(n); return c ? txt(absOf(c)) : txt(n.factors[0]); }
    return txt(n);
  }
  if (op === '*') {
    if (side.k === 'frac' && (n === side || n === side.den)) return txt(side.den);
    return txt(n);
  }
  return '';
}

export function openOp(this: App, op: string) {
  this.closeHub(false);
  this.setMode('op');
  const box = $('op');
  const input = $<HTMLInputElement>('op-input');
  const fill = this.prefill(op);
  input.value = op === '*' ? '*' + fill : op + fill;
  box.hidden = false;
  this.place(box);
  input.focus();
  input.setSelectionRange(1, input.value.length);
  this.onOpType();
  this.renderHints();
}

export function opResult(this: App): MoveResult {
  const v = $<HTMLInputElement>('op-input').value.trim();
  if (v.length <= 1) return { error: 'Type what to apply, like 7 or 3x.' };
  const w = wrapOf(v);
  if (w) return 'error' in w ? w : checked(this.eq, wrapBoth(this.eq, w.f, w.arg));
  return applyBothChecked(this.eq, v, this.slots.map((_, j) => this.eqOf(j)));
}

const WORDS: Record<string, Wrap> = { sqrt: 'sqrt', '√': 'sqrt', cbrt: 'cbrt', '∛': 'cbrt', ln: 'ln', log: 'log', exp: 'exp', 'e^': 'exp', sin: 'sin', cos: 'cos', tan: 'tan', asin: 'asin', acos: 'acos', atan: 'atan', arcsin: 'asin', arccos: 'acos', arctan: 'atan', '1/': 'recip', flip: 'recip' };

/** = ^2, = sqrt, = ln: a power or a function on both sides, typed the way the + − × ÷ ones are */
function wrapOf(v: string): { f: Wrap; arg?: ReturnType<typeof parseExpr> } | { error: string } | null {
  const t = v.replace(/^[+]\s*(?=[\^a-z√∛]|1\/$)/, '').replace(/\s+/g, '');
  const pw = /^(?:\^|\*\*)(.+)$/.exec(t);
  if (pw) {
    let arg;
    try { arg = parseExpr(pw[1]); } catch (e) { return { error: (e as Error).message }; }
    const k = arg.k === 'num' ? arg.v : arg.k === 'frac' && arg.num.k === 'num' && arg.num.v === 1 && arg.den.k === 'num' ? 1 / arg.den.v : NaN;
    return k === 2 ? { f: 'square' } : k === 3 ? { f: 'cube' } : k === 1 / 2 ? { f: 'sqrt' } : k === 1 / 3 ? { f: 'cbrt' } : { f: 'power', arg };
  }
  return WORDS[t] ? { f: WORDS[t] } : null;
}

export function onOpType(this: App) {
  const r = this.opResult();
  const v = $<HTMLInputElement>('op-input').value.trim();
  const op = ({ '−': '-', '×': '*', '·': '*', '÷': '/' } as Record<string, string>)[v[0]] ?? v[0];
  $('op-sym').textContent = !isErr(r) && wrapOf(v) ? r.label : OP_SHOW[op] ? `${OP_SHOW[op]} both sides` : 'both sides';
  $('op').classList.toggle('bad', isErr(r) && v.length > 1);
  $('op-note').textContent = isErr(r) ? (v.length > 1 ? r.error : 'start with + − × ÷, or ^2, sqrt, ln') : r.conditions?.length ? `needs ${r.conditions.join(', ')}` : 'Enter to apply';
  this.peek = isErr(r) ? null : r.eq;
  this.renderMain({ quick: true });
}

export function closeOp(this: App) {
  $('op').hidden = true;
  $<HTMLInputElement>('op-input').blur();
  const had = !!this.peek;
  this.peek = null;
  this.setMode('solve');
  if (had) this.renderMain({ quick: true });
  this.renderHints();
}
