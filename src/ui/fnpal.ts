// The function palette (f): apply a function to both sides, with a live preview.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { Node, findPath, DEFS } from '../engine/ast';
import { checked, isErr, MoveResult } from '../engine/moves';
import { peel, wrapBoth, inverseOf, FN_TABS, WRAPS, WrapItem, fnTemplate, applyFn } from '../engine/techniques';
import { parseExpr } from '../engine/parse';
import { brief } from '../engine/general';
import { sound } from './sound';
import { $, escapeHtml } from './shared';
import type { App } from './app';

/** tab and item being browsed; moved = the person browsed with the arrows */

/** = in the f menu: type any function of each side (a name, or an expression with _ for each side) */
const TYPED: WrapItem = { key: '=', f: 'square', label: 'any function', show: 'F(□)', ask: 'F(□)', tpl: '' };

/** the menu's tabs: the functions you defined first (I(t) = …, keys 1–9), then the usual ones */
export function palTabs(this: App): { name: string; items: WrapItem[] }[] {
  const yours = [...DEFS.entries()].slice(0, 9).map(([F, d], j) => ({ key: String(j + 1), f: 'square' as const, label: `${F}(${d.param}) = ${brief(d.body)}`, show: `${F}( )`, tpl: F }));
  return yours.length ? [{ name: 'Yours', items: yours }, ...FN_TABS] : FN_TABS;
}

export function openPal(this: App, sticky: boolean) {
  this.flush();
  const inv = inverseOf(this.peelSide());
  const tab = inv ? this.palTabs().findIndex(t => t.items.some(x => !x.tpl && x.f === inv.f)) : -1;
  this.pal = { tab: Math.max(0, tab), i: 0, moved: false, sticky, ask: null };
  this.chordUsed = false;
  this.setMode('fnpal');
  sound.labels();
  this.renderPal();
  this.renderHints();
}

export function renderPal(this: App) {
  const P = this.pal;
  const host = $('forms');
  host.replaceChildren();
  host.className = 'forms hub pal';
  const inv = inverseOf(this.peelSide());
  const pe = peel(this.eq, this.sel);
  const lead = document.createElement('div');
  lead.className = 'hub-row';
  const aimed = !!this.sel && this.sel !== 'eq';
  lead.innerHTML = `<button class="chip lead${isErr(pe) ? ' off' : ' rec'}" data-k="i"><kbd>i</kbd>${isErr(pe) ? 'inverse: nothing to undo here' : `inverse: ${escapeHtml(pe.label)}`}</button>`
    + `<button class="chip lead" data-k="="><kbd>=</kbd>type any function</button>`
    + `<button class="chip lead${aimed ? '' : ' off'}" data-k="b"><kbd>b</kbd>${aimed ? 'make the aimed piece a function' : 'aim at a piece to make it a function'}</button>`;
  host.append(lead);
  const tabs = document.createElement('div');
  tabs.className = 'pal-tabs';
  tabs.className = 'pal-tabs' + (P.moved ? '' : ' focus');
  const TABS = this.palTabs();
  tabs.innerHTML = TABS.map((t, j) => `<button class="pal-tab${j === P.tab ? ' on' : ''}" data-tab="${j}">${t.name}</button>`).join('');
  host.append(tabs);
  const row = document.createElement('div');
  row.className = 'hub-row pal-items';
  row.innerHTML = TABS[P.tab].items.map((w, j) => `<button class="chip${!w.tpl && inv?.f === w.f ? ' rec' : ''}${P.moved && j === P.i ? ' on' : ''}" data-k="${w.key}" data-i="${j}">${w.key ? `<kbd>${w.key}</kbd>` : ''}<span class="fx">${w.show}</span><span class="pal-name">${w.label}</span></button>`).join('');
  host.append(row);
  if (P.ask) {
    const ask = document.createElement('div');
    ask.className = 'pal-ask';
    const typed = P.ask === TYPED;
    ask.className = 'pal-ask' + (typed ? ' typed' : '');
    ask.innerHTML = typed
      ? `<span>each side →</span><input id="pal-input" spellcheck="false" autocomplete="off" aria-label="a function of each side" placeholder="e^_   _^2 + 1   ln   I"><span id="pal-note" class="op-note">a name, or _ for each side</span>`
      : `<span>${P.ask.label}: ${P.ask.ask} =</span><input id="pal-input" spellcheck="false" autocomplete="off" aria-label="${P.ask.ask}"><span id="pal-note" class="op-note">type a number, Enter applies</span>`;
    host.append(ask);
  }
  const tip = document.createElement('div');
  tip.className = 'forms-tip';
  tip.innerHTML = P.ask ? '<kbd>Enter</kbd> apply <kbd>Esc</kbd> back'
    : P.moved ? '<kbd>←</kbd><kbd>→</kbd> functions <kbd>↑</kbd> back to categories ' + (P.sticky ? '<kbd>Enter</kbd> apply <kbd>f</kbd> closes' : 'release <kbd>f</kbd> to apply')
    : '<kbd>←</kbd><kbd>→</kbd> categories <kbd>↓</kbd> open one. Or press a function\'s key directly';
  host.append(tip);
  host.hidden = false;
  this.place(host);
  if (P.ask) {
    const input = $<HTMLInputElement>('pal-input');
    input.addEventListener('keydown', e => this.askKey(e));
    input.addEventListener('input', () => this.askPreview());
    input.focus();
  }
}

export function peelSide(this: App): Node {
  const p = this.sel && this.sel !== 'eq' ? findPath(this.eq, this.sel) : null;
  if (p) return p[1];
  return inverseOf(this.eq.lhs) || !inverseOf(this.eq.rhs) ? this.eq.lhs : this.eq.rhs;
}

/** what an item would do, tidied, for the live preview */
export function palResult(this: App, w: WrapItem, arg?: Node): MoveResult {
  if (w.tpl !== undefined) {
    const F = arg ?? fnTemplate(w.tpl);
    return 'error' in F ? F : checked(this.eq, applyFn(this.eq, F));
  }
  return checked(this.eq, wrapBoth(this.eq, w.f, arg));
}

export function palPeek(this: App) {
  const P = this.pal;
  const w = this.palTabs()[P.tab].items[P.i];
  const r = w.ask ? null : this.palResult(w);
  this.peek = r && !isErr(r) ? r.eq : null;
  this.renderMain({ quick: true });
}

export function palKey(this: App, e: KeyboardEvent) {
  const P = this.pal;
  const k = e.key;
  if (k === 'Escape') return this.closePal(true);
  if (e.repeat) return;
  const TABS = this.palTabs();
  const items = TABS[P.tab].items;
  // arrows only: ← → pick a category, ↓ steps into it, ← → pick a function (live preview), ↑ steps back out
  const dx = k === 'ArrowRight' || k === 'Tab' ? 1 : k === 'ArrowLeft' ? -1 : 0;
  if (dx && !P.moved) { P.tab = (P.tab + dx + TABS.length) % TABS.length; sound.tick(1); return this.renderPal(); }
  if (dx && P.moved) { P.i = (P.i + dx + items.length) % items.length; sound.tick(2); this.renderPal(); return this.palPeek(); }
  if (k === 'ArrowDown' && !P.moved) { P.moved = true; P.i = 0; sound.tick(2); this.renderPal(); return this.palPeek(); }
  if (k === 'ArrowUp' && P.moved) { P.moved = false; sound.tick(1); this.peek = null; this.renderMain({ quick: true }); return this.renderPal(); }
  if (k === 'Enter') { if (P.moved) return this.choose(items[P.i]); P.moved = true; P.i = 0; this.renderPal(); return this.palPeek(); }
  if (k === 'i') return this.palInverse();
  if (k === '=') return this.choose(TYPED);
  if (k === 'b') { this.closePal(false); return this.openName(true); }
  if (/^[1-9]$/.test(k)) { const yours = TABS[0].name === 'Yours' ? TABS[0].items[Number(k) - 1] : undefined; if (yours) return this.choose(yours); return this.refuse(DEFS.size ? `You have ${DEFS.size} function${DEFS.size > 1 ? 's' : ''}: 1–${DEFS.size}.` : 'No functions of yours yet. Type one (F(x) = …), or aim at a piece and press b.'); }
  if (k === 'f' || k === 'F') { if (P.sticky) this.closePal(true); return; }
  const w = WRAPS.find(x => x.key === k);
  if (w) return this.choose(w);
}

/** on releasing f: apply what was browsed, else keep the menu open */
export function palRelease(this: App) {
  const P = this.pal;
  if (P.sticky || P.ask) return;
  if (P.moved) return this.choose(this.palTabs()[P.tab].items[P.i]);
  P.sticky = true;
  this.renderPal();
}

export function palInverse(this: App) {
  this.closePal(false);
  this.applyTidy(peel(this.eq, this.sel), 0.9);
}

export function choose(this: App, w: WrapItem) {
  if (w.ask) {
    this.pal.ask = w;
    this.pal.sticky = true;
    if (w !== TYPED) {
      this.pal.tab = this.palTabs().findIndex(t => t.items.includes(w));
      this.pal.i = this.palTabs()[this.pal.tab].items.indexOf(w);
      this.pal.moved = true;
    }
    this.setMode('fnask');
    sound.tick(2);
    this.renderPal();
    return;
  }
  this.closePal(false);
  this.applyTidy(this.palResult(w), 0.9);
}

export function askArg(this: App): Node | { error: string } {
  const v = $<HTMLInputElement>('pal-input').value.trim();
  if (this.pal.ask === TYPED) return fnTemplate(v);
  if (!v) return { error: 'Type a number.' };
  try { return parseExpr(v); } catch (e) { return { error: (e as Error).message }; }
}

export function askPreview(this: App) {
  const a = this.askArg();
  const r = 'error' in a ? a : this.palResult(this.pal.ask!, a);
  $('pal-note').textContent = isErr(r) ? (this.pal.ask === TYPED && !$<HTMLInputElement>('pal-input').value.trim() ? 'a name, or _ for each side' : r.error) : r.label + ': Enter applies';
  $('pal-note').classList.toggle('bad', isErr(r) && !!$<HTMLInputElement>('pal-input').value.trim());
  this.peek = !isErr(r) ? r.eq : null;
  this.renderMain({ quick: true });
}

export function askKey(this: App, e: KeyboardEvent) {
  e.stopPropagation();
  if (e.key === 'Escape') { e.preventDefault(); this.pal.ask = null; this.setMode('fnpal'); this.peek = null; this.renderMain({ quick: true }); this.renderPal(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    const a = this.askArg();
    const r = 'error' in a ? a : this.palResult(this.pal.ask!, a);
    if (isErr(r)) { this.refuse(r.error); return; }
    this.closePal(false);
    this.applyTidy(r, 0.9);
  }
}

export function closePal(this: App, animateBack = false) {
  $('forms').hidden = true;
  const peeked = !!this.peek;
  this.peek = null;
  this.setMode('solve');
  if (animateBack && peeked) this.renderAll({ quick: true }, true);
  this.renderHints();
}

/** apply a move built outside applyMove (so not yet checked); leftovers are offered as a simplification */
export function applyTidy(this: App, r: MoveResult, pitch = 1) { this.apply(isErr(r) ? r : checked(this.eq, r), pitch); }
