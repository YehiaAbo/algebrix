// The function palette (f): apply a function to both sides, with a live preview.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { Node, Eq, findPath, find, DEFS, eq, cloneFresh, evaluate, symbols, paramsOf, argsOf, call, vec, sym, children, withChildren, walk, CALC, relOf } from '../engine/ast';
import { checked, isErr, MoveResult } from '../engine/moves';
import { peel, wrapBoth, inverseOf, yourCall, FN_TABS, WRAPS, WrapItem, fnTemplate, applyFn, tidy } from '../engine/techniques';
import { ms } from './prefs';
import { parseExpr } from '../engine/parse';
import { simplify, newHints } from '../engine/simplify';
import { brief, putValue, holdsForEvery } from '../engine/general';
import { inverseFunction } from '../engine/goals';
import { toText } from '../engine/print';
import { here } from './tree';
import { sound } from './sound';
import { $, escapeHtml } from './shared';
import type { App } from './app';

/** tab and item being browsed; moved = the person browsed with the arrows */

/** = in the f menu: type any function of each side (a name, or an expression with _ for each side) */
const TYPED: WrapItem = { key: '=', f: 'square', label: 'any function', show: 'F(□)', ask: 'F(□)', tpl: '' };

/** the menu's tabs: the functions you defined first (I(t) = …, keys 1–9: put a value in, or
 *  Enter on nothing for that function of both sides), then the usual ones */
export function palTabs(this: App): { name: string; items: WrapItem[] }[] {
  const yours = [...DEFS.entries()].slice(0, 9).map(([F, d], j) => ({ key: String(j + 1), f: 'square' as const, label: `${F}(${d.param.replace(/,/g, ', ')}) = ${brief(d.body)}`, show: `${F}( )`, tpl: F, ask: `${F}(□)` }));
  return yours.length ? [{ name: 'Yours', items: yours }, ...FN_TABS] : FN_TABS;
}

export function openPal(this: App, sticky: boolean) {
  this.flush();
  const inv = inverseOf(this.peelSide());
  const tab = inv ? this.palTabs().findIndex(t => t.items.some(x => !x.tpl && x.f === inv.f)) : -1;
  this.pal = { tab: Math.max(0, tab), i: 0, moved: false, sticky, ask: null, started: '', primes: 0 };
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
  // the input box is always the first thing in the menu: type f(4), f(x² + 1), ln, e^_ …
  const mine = formHere(this.eq) ?? [...DEFS.keys()].find(n => !n.endsWith('⁻¹'));
  if (P.ask !== TYPED) {
    const idle = document.createElement('div');
    idle.className = 'pal-ask typed idle';
    idle.innerHTML = `<input id="pal-idle" spellcheck="false" autocomplete="off" aria-label="type a function or a value" placeholder="${mine ? `${mine}(4)   ${mine}(x² + 1)   ` : ''}ln   e^_   _^2 + 1"><span class="op-note">${mine ? `press <kbd>${mine[0]}</kbd> to type ${mine}(…), or <kbd>=</kbd>` : '<kbd>=</kbd> to type'}</span>`;
    host.append(idle);
  }
  const lead = document.createElement('div');
  lead.className = 'hub-row';
  const aimed = !!this.sel && this.sel !== 'eq';
  lead.innerHTML = `<button class="chip lead${isErr(pe) ? ' off' : ' rec'}" data-k="i"><kbd>i</kbd>${isErr(pe) ? 'inverse: nothing to undo here' : `inverse: ${escapeHtml(pe.label)}`}</button>`

    + `<button class="chip lead${aimed ? '' : ' off'}" data-k="b"><kbd>b</kbd>${aimed ? 'make the aimed piece a function' : 'aim at a piece to make it a function'}</button>`
    + (this.invTarget() ? `<button class="chip lead" data-k="-"><kbd>-</kbd>write out ${this.invTarget()}⁻¹</button>` : '');
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
    const first = P.ask === TYPED;
    ask.className = 'pal-ask';
    const typed = P.ask === TYPED, mine = isYours(P.ask);
    ask.className = 'pal-ask' + (typed ? ' typed' : mine ? ' yours' : '');
    ask.innerHTML = typed
      ? `<span>type</span><input id="pal-input" spellcheck="false" autocomplete="off" aria-label="a function of each side" placeholder="f(4)   f(x² + 1)   ln   e^_   f⁻¹"><span id="pal-note" class="op-note">a name, _ for each side, or f(3) for a value</span>`
      : mine
      ? `<span>${P.ask.tpl}(</span><input id="pal-input" spellcheck="false" autocomplete="off" aria-label="a value for ${P.ask.tpl}"><span>)</span><span id="pal-note" class="op-note">${YOURS_NOTE(P.ask.tpl!)}</span>`
      : `<span>${P.ask.label}: ${P.ask.ask} =</span><input id="pal-input" spellcheck="false" autocomplete="off" aria-label="${P.ask.ask}"><span id="pal-note" class="op-note">a number or anything algebraic (a, k + 1, 1/x), Enter applies</span>`;
    if (first) host.prepend(ask); else host.append(ask);
  }
  const tip = document.createElement('div');
  tip.className = 'forms-tip';
  tip.innerHTML = P.ask ? '<kbd>Enter</kbd> apply <kbd>Esc</kbd> back'
    : P.moved ? '<kbd>←</kbd><kbd>→</kbd> functions <kbd>↑</kbd> back to categories ' + (P.sticky ? '<kbd>Enter</kbd> apply <kbd>f</kbd> closes' : 'release <kbd>f</kbd> to apply')
    : '<kbd>←</kbd><kbd>→</kbd> categories <kbd>↓</kbd> open one. Or press a function\'s key directly';
  host.append(tip);
  host.hidden = false;
  this.place(host);
  const idleBox = document.getElementById('pal-idle');
  idleBox?.addEventListener('focus', () => this.choose(TYPED));
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
  if (k === '(') return this.typeInPal('(');
  if (k === 'b') { this.closePal(false); return this.openName(true); }
  if (k === '-') { const F = this.invTarget(); if (!F) return this.refuse('No functions of yours yet. Type one (f(x) = …), then - writes out its inverse.'); this.closePal(false); return this.addInverse(F); }
  if (/^[1-9]$/.test(k)) { const yours = TABS[0].name === 'Yours' ? TABS[0].items[Number(k) - 1] : undefined; if (yours) return this.choose(yours); return this.refuse(DEFS.size ? `You have ${DEFS.size} function${DEFS.size > 1 ? 's' : ''}: 1–${DEFS.size}.` : 'No functions of yours yet. Type one (F(x) = …), or aim at a piece and press b.'); }
  // a letter naming a function here (or one you defined) starts typing it: I in I′(t) = … gives I′(
  if (k.length === 1 && /[A-Za-zα-ω]/.test(k)) { const here = formHere(this.eq, k); if (here || DEFS.has(k)) return this.typeInPal(`${here ?? k}(`); }
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
      // the Yours items are built fresh each time: find the item by what it is, not by identity
      const same = (x: WrapItem) => x.key === w.key && x.tpl === w.tpl && x.f === w.f;
      this.pal.tab = Math.max(0, this.palTabs().findIndex(t => t.items.some(same)));
      this.pal.i = Math.max(0, this.palTabs()[this.pal.tab].items.findIndex(same));
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
  // yours with nothing typed: that function of both sides
  if (isYours(this.pal.ask) && !v) return fnTemplate(this.pal.ask!.tpl!);
  if (!v) return { error: 'Type a number or an expression.' };
  try { return parseExpr(v); } catch (e) { return { error: (e as Error).message }; }
}

export function askPreview(this: App) {
  const value = this.valueAsked();
  if (value) {
    const r = valueInto(value.F, value.text, this.eq);
    $('pal-note').textContent = 'error' in r ? r.error : `${toText(r.eq)}${worth(r.eq)}: Enter adds it`;
    $('pal-note').classList.toggle('bad', 'error' in r);
    if (this.peek) { this.peek = null; this.renderMain({ quick: true }); }
    return;
  }
  if (isYours(this.pal.ask)) $('pal-note').textContent = YOURS_NOTE(this.pal.ask!.tpl!);
  const a = this.askArg();
  const r = 'error' in a ? a : this.palResult(this.pal.ask!, a);
  $('pal-note').textContent = isErr(r) ? (this.pal.ask === TYPED && !$<HTMLInputElement>('pal-input').value.trim() ? 'a name, or _ for each side' : r.error) : r.label + ': Enter applies';
  $('pal-note').classList.toggle('bad', isErr(r) && !!$<HTMLInputElement>('pal-input').value.trim());
  this.peek = !isErr(r) ? r.eq : null;
  this.renderMain({ quick: true });
}

export function askKey(this: App, e: KeyboardEvent) {
  e.stopPropagation();
  // the box started as V( for you: typing V( or V′( yourself goes on from there instead of doubling it
  const inp = e.target as HTMLInputElement;
  const st = this.pal.started;
  if (st && inp.value === st && inp.selectionStart === st.length) {
    if (e.key === '(') { e.preventDefault(); return; }
    if (e.key === "'" || e.key === '′') {
      // you are spelling the name: V then '' is V″, whichever V-form the box offered first
      e.preventDefault();
      this.pal.primes++;
      inp.value = this.pal.started = `${st.replace(/[′″‴]*\($/, '')}${'′'.repeat(this.pal.primes)}(`;
      inp.setSelectionRange(inp.value.length, inp.value.length);
      return this.askPreview();
    }
  }
  if (e.key === 'Escape') { e.preventDefault(); this.pal.ask = null; this.setMode('fnpal'); this.peek = null; this.renderMain({ quick: true }); this.renderPal(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    const value = this.valueAsked();
    if (value) { const r = valueInto(value.F, value.text, this.eq); if ('error' in r) return this.refuse(r.error); this.closePal(false); return this.addValueOf(value.F, r.eq, value.text, r.here); }
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

/** after adding or subtracting equations: like terms collected as a step of its own, so what was
 *  eliminated is gone from the page, as on paper */
export function thenCollect(this: App) {
  const at = this.eq;
  this.later(ms(420), () => {
    if (this.eq !== at) return;
    const t = tidy(this.eq);
    if (t) this.apply({ ...t, label: 'collect like terms' }, 1.2);
  });
}

const isYours = (w: WrapItem | null) => !!w && w !== TYPED && !!w.tpl;
const YOURS_NOTE = (F: string) => `a value puts it in (${F}(3) = …); Enter on nothing: ${F} of both sides`;

/** the function the f menu's - writes out the inverse of: the one this equation defines, the aimed
 *  one, else your first */
export function invTarget(this: App): string | null {
  const e = this.eq;
  if (e.rel === 'def' && e.lhs.k === 'call' && !e.lhs.name.endsWith('⁻¹')) return e.lhs.name;
  const aimed = this.sel && this.sel !== 'eq' ? find(e, this.sel) : null;
  const F = aimed ? yourCall(aimed) : null;
  if (F) return F;
  return [...DEFS.keys()].find(n => !n.endsWith('⁻¹')) ?? null;
}

/** what was typed to put into one of yours: a value in its own box, or f(3) in the = box */
export function valueAsked(this: App): { F: string; text: string } | null {
  const w = this.pal.ask, v = $<HTMLInputElement>('pal-input').value.trim();
  if (isYours(w) && v) return { F: w!.tpl!, text: v };
  if (w !== TYPED) return null;
  // the closing bracket can wait: f(4 is f(4)
  const m = /^([A-Za-zα-ω](?:_\w+)?(?:⁻¹|\^\(?-1\)?|[′″‴']+)?)\s*\((.+?)\)?$/.exec(v);
  return m && !m[2].includes('_') ? { F: m[1], text: m[2] } : null;
}

/** F(a): the values put into the equation you are on, where it has F of letters (I′(t) = 1/(t + 1)
 *  takes I′(0)), else into F's definition (f(x) = x² + 1 takes f(4)). `here` says which */
function valueInto(F: string, text: string, cur: Eq): { eq: Eq; here: boolean } | { error: string } {
  const name = F.replace(/''/g, '″').replace(/'/g, '′').replace(/\^\(?-1\)?$/, '⁻¹');
  // the form in front of you first: a call of F whose inputs are letters, a whole side if there is
  // one, and only where it holds for every value of them (f(x) = 7 picks x: then f's definition)
  let form: Extract<Node, { k: 'call' }> | null = null;
  walk(cur, n => { if (n.k === 'call' && n.name === name && argsOf(n).every(a => a.k === 'sym') && (!form || n === cur.lhs || n === cur.rhs)) form = n; });
  const at = form as Extract<Node, { k: 'call' }> | null;
  const found = at && ['=', 'def', '≟'].includes(relOf(cur)) && argsOf(at).every(a => holdsForEvery(cur, (a as { name: string }).name)) ? at : null;
  // f′ and f″ worked out from f, tidied so f′(3) reads 2·3, not 2·3^(2 − 1)·1 + 0
  const pd = DEFS.has(name) ? undefined : CALC.primeDef(name);
  let d = DEFS.get(name) ?? (pd && { ...pd, body: simplify(cloneFresh(pd.body), newHints()) });
  // f⁻¹ before its formula is written: worked out from f
  if (!d && name.endsWith('⁻¹') && DEFS.has(name.slice(0, -2))) {
    const base = DEFS.get(name.slice(0, -2))!;
    const inv = inverseFunction(eq(call(name.slice(0, -2), sym(base.param)), cloneFresh(base.body), 'def'));
    if ('error' in inv) return inv;
    d = { param: base.param, body: inv.rhs };
  }
  if (!found && !d) {
    const letter = symbols(cur).includes(name);
    return { error: letter ? `${name} is a letter here, not a function of something, so nothing goes into it. ${name === 'y' || name === 'y′' ? 'A starting value is an equation of its own: n, then y(0) = 1.' : `Write it as ${name}(x) = … to make it a function.`}` : `There is no ${name}(…) here, and ${name} isn't defined. Type ${name}(x) = … first (n), or work on an equation with ${name}(t) in it.` };
  }
  const ps = found ? argsOf(found).map(a => (a as { name: string }).name) : paramsOf(d!);
  const start: Eq = found ? cur : eq(d!.param.includes(',') ? call(name, vec(ps.map(p => sym(p)))) : call(name, sym(ps[0])), cloneFresh(d!.body), 'def');
  // values in order (1, 2), or named (y = 2, x = 1)
  const parts = text.split(',').map(t => t.trim()).filter(Boolean);
  const named = parts.some(t => /^[A-Za-zα-ω]\s*=/.test(t));
  if (!named && parts.length !== ps.length) return { error: `${name} takes ${ps.length} input${ps.length > 1 ? 's' : ''}: type ${ps.length > 1 ? `${ps.length} values with commas, like ${ps.map((_, i) => i + 1).join(', ')}` : 'one value'}.` };
  if (ps.length === 1 && !named && text.trim() === ps[0]) return { error: `${name}(${ps[0]}) is what is already here: put in a number or an expression, like ${name}(2) or ${name}(${ps[0]} + 1).` };
  if (ps.length === 1 && !named) { const r = putValue(start, ps[0], text); return 'error' in r ? r : outside(r) ?? { eq: r, here: !!found }; }
  const vals = new Map<string, Node>();
  try {
    parts.forEach((t, i) => { const m = /^([A-Za-zα-ω])\s*=\s*(.+)$/.exec(t); vals.set(m ? m[1] : ps[i], parseExpr(m ? m[2] : t)); });
  } catch (err) { return { error: (err as Error).message }; }
  for (const v of vals.keys()) if (!symbols(start).includes(v)) return { error: `There is no ${v} here to put a value in for.` };
  if (found && [...vals.keys()].some(v => !holdsForEvery(cur, v))) return { error: `This says which ${[...vals.keys()].join(', ')} work${vals.size > 1 ? '' : 's'}, not something true for every value, so a value can't just be put in. p tries a value instead.` };
  // all at once (f(y, x) swaps them, rather than putting one into the other)
  const put = (m: Node): Node => (m.k === 'sym' && vals.has(m.name) ? cloneFresh(vals.get(m.name)!) : withChildren(m, children(m).map(put)));
  const r = eq(put(cloneFresh(start.lhs)), put(cloneFresh(start.rhs)));
  return outside(r) ?? { eq: r, here: !!found };
}

/** a number in that has no value out (√ of −4, ln 0): outside the function's domain, said so */
function outside(r: Eq): { error: string } | null {
  const inf = r.lhs.k === 'call' && argsOf(r.lhs).some(a => !symbols(a).length && Math.abs(evaluate(a, {})) === Infinity);
  if (inf) return { error: `∞ isn't a value to put in. For where it heads, take a limit: C, then l, then inf.` };
  if (symbols(r).length || Number.isFinite(evaluate(r.rhs, {}))) return null;
  const args = r.lhs.k === 'call' ? argsOf(r.lhs) : [];
  if (!args.length || !args.every(a => Number.isFinite(evaluate(a, {})))) return null;
  return { error: `${toText(r.rhs)} has no real value: ${args.map(a => toText(a)).join(', ')} is outside where ${r.lhs.k === 'call' ? r.lhs.name : 'it'} is defined.` };
}

/** " = 10" when the value works out to a number */
function worth(r: Eq): string {
  const x = evaluate(r.rhs, {});
  if (!Number.isFinite(x) || symbols(r.rhs).length) return '';
  const shown = Math.round(x * 1e6) / 1e6;
  const txt = String(shown).replace('-', '−');
  return toText(r.rhs) === txt ? '' : ` = ${txt}`;
}

/** the value as an equation of its own, coming off the definition in the tree */
export function addValueOf(this: App, F: string, r: Eq, text: string, fromHere = false) {
  if (this.slots.length >= 9) return this.refuse('Nine equations is the limit for now.');
  const home = fromHere ? this.slot! : this.slots.find(sl => sl.steps.some(st => st.eq.rel === 'def' && st.eq.lhs.k === 'call' && st.eq.lhs.name === F)) ?? this.slot!;
  this.slots.push({ steps: [{ eq: r, label: `${F} at ${text}`, conditions: [], rule: 'put in a value', dir: '⇒' }], at: 0, sel: null, from: here(home) });
  this.cur = this.slots.length - 1;
  sound.commit();
  this.sel = null;
  this.stage.clear();
  this.renderAll(null);
  this.entrance();
  this.save();
  this.say(`Equation ${this.cur + 1}: ${toText(r)}${worth(r)}. s works it out.`);
}

/** into the menu's box, with this already typed (f( when you press the letter of your f) */
export function typeInPal(this: App, start: string) {
  this.choose(TYPED);
  const input = $<HTMLInputElement>('pal-input');
  input.value = this.pal.started = start;
  this.pal.primes = 0;
  input.setSelectionRange(start.length, start.length);
  this.askPreview();
}

/** the function form in the equation you are on (I′ in I′(t) = 1/(t + 1)), by its first letter if given */
function formHere(e: Eq, letter?: string): string | null {
  let out: string | null = null;
  walk(e, n => { if (!out && n.k === 'call' && (!letter || n.name[0] === letter) && argsOf(n).every(a => a.k === 'sym')) out = n.name; });
  return out;
}
