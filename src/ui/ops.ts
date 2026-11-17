// Both sides: type an operator, watch it live, Enter applies it.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { Node, find, findPath } from '../engine/ast';
import { toText } from '../engine/print';
import { applyBothChecked, isErr, MoveResult } from '../engine/moves';
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
  return applyBothChecked(this.eq, v, this.slots.map((_, j) => this.eqOf(j)));
}

export function onOpType(this: App) {
  const r = this.opResult();
  const v = $<HTMLInputElement>('op-input').value.trim();
  const op = ({ '−': '-', '×': '*', '·': '*', '÷': '/' } as Record<string, string>)[v[0]] ?? v[0];
  $('op-sym').textContent = OP_SHOW[op] ? `${OP_SHOW[op]} both sides` : 'both sides';
  $('op').classList.toggle('bad', isErr(r) && v.length > 1);
  $('op-note').textContent = isErr(r) ? (v.length > 1 ? r.error : 'start with + − × ÷') : r.conditions?.length ? `needs ${r.conditions.join(', ')}` : 'Enter to apply';
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
