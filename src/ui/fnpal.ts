// The function palette (f): apply a function to both sides, with a live preview.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { Node, Eq, findPath, find, DEFS, eq, cloneFresh, evaluate, symbols, paramsOf, argsOf, call, vec, sym, children, withChildren, walk, CALC, relOf } from '../engine/ast';
import { checked, isErr, MoveResult } from '../engine/moves';
import { peel, wrapBoth, inverseOf, yourCall, fnTemplate, applyFn } from '../engine/wrap';
import { FN_TABS, WrapItem } from './fntabs';
import { Card, MenuSpec, MenuState, Effect, cardsOf, cardFor, menuKey, menuRelease, pickCard } from './menu/model';
import { tabsEl, cardsEl, rectsOf, cardAt } from './menu/view';
import { tidy } from '../engine/isolate';
import { ms } from './prefs';
import { parseExpr } from '../engine/parse';
import { simplify, newHints } from '../engine/simplify';
import { brief, putValue, holdsForEvery } from '../engine/general';
import { inverseFunction } from '../engine/goals';
import { toText } from '../engine/print';
import { here } from './tree';
import { sound } from './sound';
import { $, escapeHtml } from './shared';
import { cardMath } from './hub';
import type { App } from './app';
import { mathField, field } from './mathfield';

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
  // a move's name from before goes: the menu opens over clear space
  document.querySelectorAll('#stage .bubble').forEach(b => b.remove());
  const inv = inverseOf(this.peelSide());
  const tab = inv ? this.palTabs().findIndex(t => t.items.some(x => !x.tpl && x.f === inv.f)) : -1;
  this.pal = { menu: { section: Math.max(0, tab), at: null, sticky, chordUsed: false }, ask: null, started: '', startedTex: '', primes: 0 };
  this.chordUsed = false;
  this.setMode('fnpal');
  sound.labels();
  this.renderPal();
  this.renderHints();
}

/** the function each card puts on both sides (the cards are built fresh with the menu) */
const ITEM = new WeakMap<Card, WrapItem>();

/** the f menu as cards of the menu model: each section's functions, then i, b and - (drawn beside the tabs) */
export function palSpec(this: App): MenuSpec {
  const pe = peel(this.eq, this.sel);
  const aimed = !!this.sel && this.sel !== 'eq';
  const F = this.invTarget();
  const leads: Card[] = [
    { key: 'i', label: isErr(pe) ? 'inverse' : `inverse: ${pe.label}`, ok: !isErr(pe), why: isErr(pe) ? pe.error : undefined, run: () => this.palInverse() },
    { key: 'b', label: 'make a function', ok: aimed, why: 'Aim at the piece to name first (arrows, or Space), then press b.', run: () => { this.closePal(false); this.openName(true); } },
    ...(F ? [{ key: '-', label: `write out ${F}⁻¹`, ok: true, run: () => { this.closePal(false); this.addInverse(F); } }] : []),
  ];
  const card = (w: WrapItem): Card => {
    const c: Card = { key: w.key || undefined, label: w.label, ok: true, run: () => this.choose(w), shows: w.ask ? undefined : () => { const r = made(this, w); return isErr(r) ? null : { math: r.eq }; } };
    ITEM.set(c, w);
    return c;
  };
  return { id: 'fn', openKey: 'f', sections: this.palTabs().map(t => ({ name: t.name, rows: [t.items.map(card), leads] })) };
}

export function renderPal(this: App) {
  const P = this.pal, st = P.menu;
  const spec = this.palSpec();
  const host = $('forms');
  host.replaceChildren();
  host.className = 'forms hub pal';
  const inv = inverseOf(this.peelSide());
  // the input box is always the first thing in the menu: type f(4), f(x² + 1), ln, e^_ …
  const mine = formHere(this.eq) ?? [...DEFS.keys()].find(n => !n.endsWith('⁻¹'));
  // one box, the same before and after you click it: examples as math on the right while it's
  // empty, what it would make (as math) once you type
  const box = document.createElement('div');
  const typing = P.ask === TYPED;
  box.className = 'pal-type' + (typing ? '' : ' idle');
  box.innerHTML = `<span class="pal-glyph">ƒ</span>${typing ? '<span id="pal-input" aria-label="a function or a value"></span>' : `<span id="pal-idle" class="pal-ph" tabindex="0" role="textbox" aria-label="type a function or a value">type a function or a value<kbd>=</kbd>${mine ? `<span class="or">or</span><kbd>${mine[0]}</kbd>` : ''}</span>`}<span id="${typing ? 'pal-note' : 'pal-eg'}" class="pal-note"></span>`;
  host.append(box);
  this.palExamples(box.querySelector('.pal-note')!, mine ?? null);
  const tabs = tabsEl(spec, st);
  host.append(tabs);
  const sec = spec.sections[st.section];
  const face = (c: Card) => {
    const b = document.createElement('button');
    const w = ITEM.get(c);
    b.dataset.k = c.key ?? '';
    if (!w) {
      b.className = 'chip lead' + (c.key === 'i' && c.ok ? ' rec' : '');
      b.title = c.ok ? (c.key === 'b' ? 'the aimed piece becomes a function' : '') : c.why ?? '';
      b.innerHTML = `<kbd>${c.key}</kbd>${escapeHtml(c.label)}`;
      return b;
    }
    b.className = 'chip' + (!w.tpl && inv?.f === w.f ? ' rec' : '');
    b.innerHTML = `${w.key ? `<kbd>${w.key}</kbd>` : ''}<span class="fx">${w.show}</span><span class="pal-name">${w.label}</span>`;
    return b;
  };
  const row = cardsEl(sec, st, face, 'pal-items');
  // i, b and - share the tabs' line (one line less, so the menu fits beside the equation); the arrows
  // go by where cards are drawn, so they reach them there too
  const leads = row.querySelector('.menu-line:last-child:not(:first-child)');
  if (leads) { leads.className = 'pal-lead'; tabs.append(leads); }
  host.append(row);
  this.fillPal(row, cardsOf(sec));
  if (P.ask && P.ask !== TYPED) {
    const ask = document.createElement('div');
    const yours = isYours(P.ask);
    ask.className = 'pal-ask' + (yours ? ' yours' : '');
    ask.innerHTML = yours
      ? `<span>${P.ask.tpl}(</span><span id="pal-input" aria-label="a value for ${P.ask.tpl}"></span><span>)</span><span id="pal-note" class="op-note">${YOURS_NOTE(P.ask.tpl!)}</span>`
      : `<span>${P.ask.label}: ${P.ask.ask} =</span><span id="pal-input" aria-label="${P.ask.ask}"></span><span id="pal-note" class="op-note">a number or anything algebraic (a, k + 1, 1/x), Enter applies</span>`;
    host.append(ask);
  }
  const tip = document.createElement('div');
  tip.className = 'forms-tip';
  tip.innerHTML = P.ask ? '<kbd>Enter</kbd> apply <kbd>Esc</kbd> back'
    : st.at !== null ? '<kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> cards <kbd>Esc</kbd> back to categories ' + (st.sticky ? '<kbd>Enter</kbd> apply' : 'release <kbd>f</kbd> to apply')
    : '<kbd>←</kbd><kbd>→</kbd> categories <kbd>↓</kbd> open one. Or press a function\'s key directly';
  host.append(tip);
  host.hidden = false;
  this.place(host);
  const idleBox = document.getElementById('pal-idle');
  idleBox?.addEventListener('focus', () => this.choose(TYPED));
  idleBox?.addEventListener('mousedown', e => { e.preventDefault(); this.choose(TYPED); });
  if (P.ask) {
    const box = $('pal-input');
    const input = mathField(box, { onKey: e => this.askKey(e), placeholder: P.ask === TYPED ? 'type a function or a value' : box.dataset.placeholder });
    input.el.addEventListener('input', () => this.askPreview());
    input.focus();
  }
}

/** what the box takes, as math you can click: your function at a number and at an expression,
 *  its inverse, then functions of each side (ln, e^□, □² + 1) */
export function palExamples(this: App, host: HTMLElement, mine: string | null) {
  const egs: [string, string][] = [
    ...(mine ? [[`${mine}(4)`, `${mine}(4)`], [`${mine}(x^2 + 1)`, `${mine}(x^2+1)`]] as [string, string][] : []),
    ['ln(□)', 'ln'], ['e^□', 'e^_'], ['□^2 + 1', '_^2+1'],
  ];
  host.replaceChildren(...egs.map(([show, type]) => {
    const b = document.createElement('button');
    b.className = 'pal-eg';
    b.title = `type ${type}`;
    try { b.append(cardMath(parseExpr(show), 14, 120)); } catch { b.textContent = show; }
    b.addEventListener('mousedown', e => {
      e.preventDefault();
      if (this.pal.ask !== TYPED) this.choose(TYPED);
      const F = field('pal-input');
      F.setLatex(''); F.typeText(type); F.focus();
      this.askPreview();
    });
    return b;
  }));
}

/** the note beside a box: what Enter would make, drawn as math, or why not in words */
function noteMath(app: App, made: Eq | null, text: string, bad = false) {
  const note = $('pal-note');
  note.classList.toggle('bad', bad);
  note.removeAttribute('aria-label');
  if (!made) { note.textContent = text; return; }
  note.setAttribute('aria-label', `${toText(made)} ${text}`);
  note.replaceChildren(cardMath(made, 14, 260), Object.assign(document.createElement('span'), { className: 'pal-then', textContent: text }));
}

/** what each function would make, as math on its card (Tab's previews): ones already worked out
 *  show at once, the rest fill in one per frame so a slow check never holds up the menu */
const MADE = new WeakMap<Eq, Map<string, MoveResult>>();
let filling = 0;
function made(app: App, w: WrapItem): MoveResult {
  let m = MADE.get(app.eq);
  if (!m) MADE.set(app.eq, m = new Map());
  const k = `${app.sel}|${w.tpl ?? ''}|${w.f}`;
  if (!m.has(k)) m.set(k, app.palResult(w));
  return m.get(k)!;
}
function known(app: App, w: WrapItem) { return MADE.get(app.eq)?.has(`${app.sel}|${w.tpl ?? ''}|${w.f}`); }

export function fillPal(this: App, row: HTMLElement, cards: Card[]) {
  const token = ++filling, eqNow = this.eq;
  const itemOf = (b: HTMLElement) => ITEM.get(cards[+b.dataset.i!]);
  const show = (b: HTMLElement) => {
    const r = made(this, itemOf(b)!);
    if (isErr(r)) { b.classList.add('off'); b.title = r.error; return; }
    b.querySelector('.fx')?.replaceWith(cardMath(r.eq, 14, 190));
  };
  const faces = [...row.querySelectorAll<HTMLElement>('button[data-i]')].filter(b => itemOf(b) && !itemOf(b)!.ask);
  const later = faces.filter(b => !known(this, itemOf(b)!));
  faces.filter(b => !later.includes(b)).forEach(show);
  if (!later.length) return;
  const step = () => {
    if (token !== filling || this.eq !== eqNow || !row.isConnected) return;
    show(later.shift()!);
    if (later.length) requestAnimationFrame(step);
    else this.place($('forms'));
  };
  requestAnimationFrame(step);
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

/** the browsed card's result on the stage (nothing browsed: the equation as it is) */
export function palPeek(this: App, card: Card | null) {
  this.peek = (card?.shows?.()?.math as Eq | undefined) ?? null;
  this.renderMain({ quick: true });
  this.place($('forms'));
}

export function palKey(this: App, e: KeyboardEvent) {
  const P = this.pal;
  const k = e.key === 'Tab' ? 'ArrowRight' : e.key;
  if (e.repeat && k !== 'Escape') return;
  const spec = this.palSpec();
  // the box's keys and your functions' come before the cards
  if (k === '=') return this.choose(TYPED);
  if (k === '(') return this.typeInPal('(');
  if (k === '-' && !this.invTarget()) return this.refuse('No functions of yours yet. Type one (f(x) = …), then - writes out its inverse.');
  if (/^[1-9]$/.test(k) && !cardFor(spec, P.menu.section, k)) return this.refuse(DEFS.size ? `You have ${DEFS.size} function${DEFS.size > 1 ? 's' : ''}: 1–${DEFS.size}.` : 'No functions of yours yet. Type one (F(x) = …), or aim at a piece and press b.');
  // a letter naming a function here (or one you defined) starts typing it: I in I′(t) = … gives I′(
  if (k.length === 1 && k !== 'i' && k !== 'b' && /[A-Za-zα-ω]/.test(k)) { const here = formHere(this.eq, k); if (here || DEFS.has(k)) return this.typeInPal(`${here ?? k}(`); }
  const r = menuKey(spec, { ...P.menu, chordUsed: this.chordUsed }, k, rectsOf($('forms')));
  return this.palEffect(r, e);
}

/** what a key or the release did to the menu, carried out */
export function palEffect(this: App, r: { state: MenuState; effect: Effect }, e?: KeyboardEvent) {
  const was = this.pal.menu;
  this.pal.menu = r.state;
  const f = r.effect;
  switch (f.k) {
    case 'none':
      if (was.section !== r.state.section) sound.tick(1);
      if (was.section !== r.state.section || was.at !== r.state.at || was.sticky !== r.state.sticky) this.renderPal();
      return;
    case 'peek': sound.tick(f.card ? 2 : 1); this.renderPal(); return this.palPeek(f.card);
    case 'run': case 'ask': return f.card.run();
    case 'refuse': return this.refuse(f.why);
    case 'close': return this.closePal(true);
    case 'pass': this.closePal(true); if (e) this.key(e); return;
  }
}

/** on releasing f: apply what was browsed, close after a chord, else keep the menu open */
export function palRelease(this: App) {
  if (this.pal.ask) return;
  this.palEffect(menuRelease(this.palSpec(), { ...this.pal.menu, chordUsed: this.chordUsed }));
}

/** a click on one of the menu's cards */
export function palClick(this: App, el: Element) {
  const hit = cardAt(this.palSpec(), this.pal.menu, el);
  if (hit) this.palEffect({ state: { ...this.pal.menu, at: hit.at }, effect: pickCard(hit.card) });
}

export function palInverse(this: App) {
  this.closePal(false);
  this.applyTidy(peel(this.eq, this.sel), 0.9);
}

export function choose(this: App, w: WrapItem) {
  if (w.ask) {
    this.pal.ask = w;
    this.pal.menu = { ...this.pal.menu, sticky: true };
    if (w !== TYPED) {
      // the Yours items are built fresh each time: find the item by what it is, not by identity
      const same = (x: WrapItem) => x.key === w.key && x.tpl === w.tpl && x.f === w.f;
      const section = Math.max(0, this.palTabs().findIndex(t => t.items.some(same)));
      this.pal.menu = { ...this.pal.menu, section, at: Math.max(0, this.palTabs()[section].items.findIndex(same)) };
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
  const v = field('pal-input').value.trim();
  if (this.pal.ask === TYPED) return fnTemplate(v);
  // yours with nothing typed: that function of both sides
  if (isYours(this.pal.ask) && !v) return fnTemplate(this.pal.ask!.tpl!);
  if (!v) return { error: 'Type a number or an expression.' };
  try { return parseExpr(v); } catch (e) { return { error: (e as Error).message }; }
}

export function askPreview(this: App) {
  const value = this.valueAsked();
  const typed = field('pal-input').value.trim();
  if (value) {
    const r = valueInto(value.F, value.text, this.eq);
    if ('error' in r) noteMath(this, null, r.error, true);
    else { const w = worth(r.eq).trim(); noteMath(this, r.eq, `${w ? w + ' · ' : ''}Enter adds it`); }
    if (this.peek) { this.peek = null; this.renderMain({ quick: true }); }
    return;
  }
  const a = this.askArg();
  const r = 'error' in a ? a : this.palResult(this.pal.ask!, a);
  if (this.pal.ask === TYPED && !typed) this.palExamples($('pal-note'), formHere(this.eq) ?? [...DEFS.keys()].find(n => !n.endsWith('⁻¹')) ?? null);
  else if (isYours(this.pal.ask) && !typed) noteMath(this, null, YOURS_NOTE(this.pal.ask!.tpl!));
  else if (isErr(r)) noteMath(this, null, r.error, !!typed);
  else noteMath(this, null, r.label + ': Enter applies');
  this.peek = !isErr(r) ? r.eq : null;
  this.renderMain({ quick: true });
}

/** a key in the menu's box: true when it is taken here (the editor never sees it) */
export function askKey(this: App, e: KeyboardEvent): boolean {
  // the box started as V( for you: typing V( or V′( yourself goes on from there instead of doubling it
  const F = field('pal-input');
  const st = this.pal.started;
  if (st && F.latex() === this.pal.startedTex) {
    if (e.key === '(') return true;
    if (e.key === "'" || e.key === '′') {
      // you are spelling the name: V then '' is V″, whichever V-form the box offered first
      this.pal.primes++;
      F.value = this.pal.started = `${st.replace(/[′″‴]*\($/, '')}${'′'.repeat(this.pal.primes)}(`;
      this.pal.startedTex = F.latex();
      this.askPreview();
      return true;
    }
  }
  if (e.key === 'Escape') { this.pal.ask = null; this.setMode('fnpal'); this.peek = null; this.renderMain({ quick: true }); this.renderPal(); return true; }
  if (e.key !== 'Enter') return false;
  {
    const value = this.valueAsked();
    if (value) { const r = valueInto(value.F, value.text, this.eq); if ('error' in r) this.refuse(r.error); else { this.closePal(false); this.addValueOf(value.F, r.eq, value.text, r.here); } return true; }
    const a = this.askArg();
    const r = 'error' in a ? a : this.palResult(this.pal.ask!, a);
    if (isErr(r)) { this.refuse(r.error); return true; }
    this.closePal(false);
    this.applyTidy(r, 0.9);
  }
  return true;
}

export function closePal(this: App, animateBack = false) {
  $('forms').hidden = true;
  const peeked = !!this.peek;
  this.giveBackRoom();
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
  const w = this.pal.ask, v = field('pal-input').value.trim();
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
  const input = field('pal-input');
  input.value = this.pal.started = start;
  this.pal.startedTex = input.latex();
  this.pal.primes = 0;
  this.askPreview();
}

/** the function form in the equation you are on (I′ in I′(t) = 1/(t + 1)), by its first letter if given */
function formHere(e: Eq, letter?: string): string | null {
  let out: string | null = null;
  walk(e, n => { if (!out && n.k === 'call' && (!letter || n.name[0] === letter) && argsOf(n).every(a => a.k === 'sym')) out = n.name; });
  return out;
}
