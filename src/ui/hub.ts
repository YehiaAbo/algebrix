// The algebra hub (Tab): techniques by key, and forms to browse and apply.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { Card, MenuSpec, MenuState, Effect, cardsOf, cardFor, menuKey, menuRelease, pickCard } from './menu/model';
import { tabsEl, cardsEl, rectsOf, cardAt } from './menu/view';
import { find, symbols, relOf, DEFS, Eq, Node } from '../engine/ast';
import { unfold, fold } from '../engine/goals';
import { applyMove, isErr } from '../engine/moves';
import { formsFor } from '../engine/forms';
import { polyTarget } from '../engine/polytools';
import { splitCases, quadraticFormula } from '../engine/isolate';
import { eliminate, compareCoefficients } from '../engine/systems';
import { layout } from '../render/layout';
import { Stage } from '../render/stage';
import { walk } from '../engine/ast';
import { sound } from './sound';
import { $, Tech, Hub, escapeHtml } from './shared';
import type { Form } from '../engine/forms';
import { areCases } from './sheet';
import { appearsIn } from '../engine/general';
import { CALC_GROUPS } from './calc';
import { calcForms } from './calcforms';
import type { App } from './app';
import { mathLabel } from './mathlabel';
import { crossOut } from '../engine/series';
import { mathField } from './mathfield';

export function techniques(this: App): Tech[] {
  const eq = this.eq;
  const aimed = this.sel && this.sel !== 'eq' ? find(eq, this.sel) : null;
  const vars = symbols(eq);
  const aimVar = aimed?.k === 'sym' && vars.includes(aimed.name) ? aimed.name : vars.length === 1 ? vars[0] : null;
  const out: Tech[] = relOf(eq) === 'expr' ? [] : [{
    key: 'i', label: aimVar ? `solve for ${aimVar}` : 'solve for…', ok: vars.length > 0,
    run: () => (aimVar ? this.solveFor(aimVar) : this.askVar()),
  }];
  out.push({ key: 'a', label: 'split into cases', ok: !!splitCases(eq), run: () => this.split() });
  const qerr = (v: string) => { const r = quadraticFormula(eq, v); return 'error' in r ? r.error : ''; };
  const qv = aimVar ?? vars.find(v => !qerr(v)) ?? vars.find(v => qerr(v).startsWith('b² − 4ac'));
  const q = qv ? quadraticFormula(eq, qv) : null;
  if (q && !('error' in q)) out.push({ key: 'g', label: `quadratic formula for ${qv}`, ok: true, run: () => this.split(undefined, q) });
  // b² − 4ac below 0 is worth hearing, not a silent "doesn't apply"
  else if (q && q.error.startsWith('b² − 4ac')) out.push({ key: 'g', label: `quadratic formula for ${qv}`, ok: true, run: () => this.refuse(q.error) });
  const hasCall = (() => { let c = false; walk(eq, n => { if (n.k === 'call' && DEFS.has(n.name)) c = true; }); return c; })();
  // u both ways: a call unfolds into its body; a piece written like a function you defined folds into it
  // (aimed at a call, or nothing aimed with a call here: unfold comes first)
  const folded = !DEFS.size || aimed?.k === 'call' || (!aimed && hasCall) ? null : fold(eq, this.sel);
  if (folded && !isErr(folded)) out.push({ key: 'u', label: `${folded.label}`, ok: true, run: () => this.apply(fold(this.eq, this.sel), 1.1) });
  else if (hasCall) out.push({ key: 'u', label: 'unfold the function', ok: true, run: () => this.apply(unfold(this.eq, this.sel), 1.1) });
  if (relOf(eq) === 'def') out.push({ key: 'b', label: 'inverse function', ok: true, run: () => this.addInverse() });
  // q on a fraction is long division (a form); on a polynomial it takes out a factor you type
  if (aimed?.k !== 'frac' && polyTarget(eq, this.sel)) out.push({ key: 'q', label: 'take out a factor…', ok: true, run: () => this.openDivide() });
  // an identity in x with unknown coefficients (1 = A(x + 2) + B(x + 1)): one equation per power
  const cv = relOf(eq) === '=' ? (aimVar && !isErr(compareCoefficients(eq, aimVar).first) ? aimVar : ['x', 't', ...vars].find(w => vars.includes(w) && !isErr(compareCoefficients(eq, w).first))) : undefined;
  if (cv) out.push({ key: 'e', label: `compare coefficients of ${cv}`, ok: true, run: () => this.compareKey(cv) });
  // pieces that add to 0 (a factor over itself), and a telescoping ⋯: crossed out, then gone
  if (!isErr(crossOut(eq, this.sel))) out.push({ key: 'o', label: 'cross out what cancels', ok: true, run: () => this.apply(crossOut(this.eq, this.sel), 1.1) });
  // the form you want, typed: it goes in only if it is equal
  if (aimed || relOf(eq) === 'expr') out.push({ key: '=', label: 'rewrite as…', ok: true, run: () => this.openRewrite() });
  // any piece times A/A: e⁻ˣ on top and below, a conjugate, a missing factor
  if (aimed) out.push({ key: 'm', label: 'multiply by 1…', ok: true, run: () => this.openOne() });
  this.slots.forEach((_, j) => {
    if (j === this.cur) return;
    // a shared letter, a letter an integral here runs over, or a side of it written here (I(0) = 0)
    const shares = appearsIn(eq, this.eqOf(j));
    // another case of the same split is an alternative, not something that also holds
    const alt = areCases(this, this.cur, j);
    out.push({ key: String(j + 1), label: alt ? `(${j + 1}) is another case` : `substitute from (${j + 1})`, ok: shares && !alt, run: () => this.substituteFrom(j) });
  });
  const partner = this.slots.findIndex((_, j) => j !== this.cur && !areCases(this, this.cur, j) && !isErr(eliminate(eq, this.eqOf(j), j + 1, aimVar ?? undefined)));
  if (this.slots.length > 1) out.push({
    key: 'k', label: partner >= 0 ? `eliminate${aimVar ? ' ' + aimVar : ''} with (${partner + 1})` : 'eliminate with another equation', ok: partner >= 0,
    run: () => {
      this.flyFrom(partner);
      const r = eliminate(this.eq, this.eqOf(partner), partner + 1, aimVar ?? undefined);
      this.apply(r, 1.1);
      if (!isErr(r)) this.thenCollect();
    },
  });
  return out;
}

export function openHub(this: App, sticky: boolean, calc = false) {
  this.flush();
  // a move's name from before goes: the menu opens over clear space
  document.querySelectorAll('#stage .bubble').forEach(b => b.remove());
  const techs = calc ? this.calcTechniques() : this.techniques();
  // the calculus rules for the aimed piece come first; a key another form or technique needs stays theirs
  const algebra = calc ? [] : formsFor(this.eq, this.sel);
  const taken = new Set([...algebra.map(f => f.chord), ...techs.map(t => t.key)]);
  const forms = calc ? [] : [...calcForms(this.eq, this.sel).map(f => (taken.has(f.chord) ? { ...f, chord: '' } : f)), ...algebra];
  // C opens on the section with something to do (the first one, if nothing applies)
  const first = techs.find(t => t.lead && t.ok) ?? techs.find(t => t.ok) ?? techs[0];
  const tab = calc ? Math.max(0, CALC_GROUPS.findIndex(g => g.name === first?.group)) : 0;
  this.hub = { forms, techs, sticky, awaitVar: false, calc, menu: { section: tab, at: null, sticky, chordUsed: false } };
  this.chordUsed = false;
  this.setMode('hub');
  if (this.slots.length > 1) this.renderTree();
  sound.labels();
  this.renderHub();
  this.renderHints();
}

export function askVar(this: App) {
  if (!this.hub) return;
  this.hub.awaitVar = true;
  this.hub.sticky = true;
  this.hub.menu = { ...this.hub.menu, sticky: true };
  sound.tick(2);
  this.renderHub();
  this.renderHints();
}

export function hubKey(this: App, e: KeyboardEvent): unknown {
  const h = this.hub!;
  const k = e.key;
  if (h.calc) return this.calcKey(e);
  if (k === 'Escape') return this.closeHub(true);
  if (e.repeat) return;
  if (h.awaitVar) {
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(k)) return;
    const vars = symbols(this.eq);
    // y′ is y then ′ (or '): a letter with primed ones beside it waits for the primes
    const N = (s: string) => s.replace(/″/g, '′′').replace(/‴/g, '′′′');
    const exact = (p: string) => vars.find(s => N(s) === p);
    const longer = (p: string) => vars.some(s => N(s).startsWith(p) && N(s) !== p);
    const pick = (p: string) => { h.pending = undefined; this.closeHub(false); return this.solveFor(exact(p)!); };
    const wait = (p: string) => { h.pending = p; sound.tick(1); this.renderHub(); };
    if (h.pending && (k === "'" || k === '′')) {
      const p = h.pending + '′';
      if (longer(p)) return wait(p);
      if (exact(p)) return pick(p);
    }
    // any other key: the letter as it stands
    if (h.pending && exact(h.pending)) return pick(h.pending);
    if (/^[A-Za-zα-ω]$/.test(k) && (exact(k) || longer(k))) return longer(k) ? wait(k) : pick(k);
    if (k === 'Tab') return this.closeHub(true);
    // a question never holds the keys hostage: any other key closes it and does its usual job
    this.closeHub(true);
    return this.key(e);
  }
  const spec = hubSpec(this, h);
  // another equation's number subs it in (a technique card); any other number says why not
  if (/^[1-9]$/.test(k) && !cardFor(spec, 0, k)) return this.refuse(Number(k) - 1 === this.cur ? 'That’s this equation. Hold Tab and press another equation’s number.' : `There is no equation ${k}.`);
  const nav = /^Arrow/.test(k) || k === 'Enter' || k === 'Tab';
  if (nav && !cardsOf(spec.sections[0]).length) return this.refuse('No other forms here. Aim at something else.');
  if (!nav && !cardFor(spec, 0, k)) {
    // a tapped hub shows only the forms that apply: any other key is not on it, so it acts as it would with the hub shut (K28)
    if (h.sticky && h.menu.at === null && k.length === 1 && k !== 'f') { this.closeHub(true); return this.key(e); }
    if (k === 'f') { this.closeHub(false); return this.apply(applyMove('factor', this.eq, this.sel), 0.85); }
    if ('zdxswctolprhqvn'.includes(k)) return this.refuse('That form doesn\'t apply to what is aimed.');
    return;
  }
  return this.hubEffect(menuKey(spec, { ...h.menu, chordUsed: this.chordUsed }, k, rectsOf($('forms'))), e);
}

export function peekAt(this: App, form: Form) {
  this.peek = form.eq;
  this.renderMain({ quick: true, absorbs: form.hints.absorbs, flights: form.hints.flights });
  this.graph.draw(form.eq, true);
  this.renderHub();
}

/** math drawn small for a card, shrunk to fit its width */
export function cardMath(n: Node, size = 15, maxW = 240): HTMLElement {
  let lay = layout(n, size);
  if (lay.w > maxW) lay = layout(n, Math.max(8, size * maxW / lay.w));
  const mini = document.createElement('div');
  mini.className = 'mini';
  mini.style.width = lay.w + 'px';
  mini.style.height = lay.asc + lay.desc + 'px';
  new Stage(mini).show(lay, 0, 0, null);
  return mini;
}

/** C, browsing: the stage plays what the technique would do, as Tab does for forms */
export function peekTech(this: App, card: Card | null) {
  const t = card ? TECH.get(card) : null;
  const m = t?.ok && t.move && !isErr(t.move) ? t.move : null;
  if (m) {
    this.peek = m.eq;
    this.renderMain({ quick: true, absorbs: m.hints.absorbs, flights: m.hints.flights });
    this.graph.draw(this.peek, true);
  } else if (this.peek) {
    this.peek = null;
    this.renderMain({ quick: true });
  }
  this.renderHub();
}

export function closeHub(this: App, animateBack: boolean) {
  if (!this.hub) return;
  const peeked = !!this.peek;
  this.hub = null;
  this.peek = null;
  $('forms').hidden = true;
  this.setMode('solve');
  this.giveBackRoom();
  if (animateBack && peeked) { sound.undo(); this.renderAll({ quick: true }, true); }
  else { this.renderHints(); if (this.slots.length > 1) this.renderTree(); }
}

/* ---------- the calculus hub: sections like the f palette ---------- */

export function calcKey(this: App, e: KeyboardEvent) {
  const h = this.hub!;
  if (h.asking) return;
  if (e.repeat && e.key !== 'Escape') return;
  const spec = hubSpec(this, h);
  const st = h.menu, sec = spec.sections[st.section];
  // a section with nothing in it says what to type to get some
  if ((e.key === 'ArrowDown' || e.key === 'Enter') && st.at === null && !sec.rows.flat().length) return this.refuse(`Nothing in ${sec.name} applies here. Try ${CALC_GROUPS[st.section].example}.`);
  this.hubEffect(menuKey(spec, { ...st, chordUsed: this.chordUsed }, e.key, rectsOf($('forms'))), e);
}

/** what a key, a click or the release did to Tab or C, carried out */
export function hubEffect(this: App, r: { state: MenuState; effect: Effect }, e?: KeyboardEvent) {
  const h = this.hub!;
  const was = h.menu;
  h.menu = r.state;
  h.sticky = r.state.sticky;
  const f = r.effect;
  switch (f.k) {
    case 'none':
      if (was.section !== r.state.section) sound.tick(1);
      if (was.section !== r.state.section || was.at !== r.state.at || was.sticky !== r.state.sticky) this.renderHub();
      return;
    case 'peek': {
      sound.tick(f.card && !h.calc ? 1 : f.card ? 2 : 1);
      const form = f.card && FORM.get(f.card);
      return form ? this.peekAt(form) : this.peekTech(f.card);
    }
    case 'run': {
      // Tab's i with more to ask (solve for which letter?) keeps the menu for the question
      const t = TECH.get(f.card);
      if (!(t && !h.calc && t.key === 'i' && t.label.endsWith('…'))) this.closeHub(false);
      return f.card.run();
    }
    case 'ask': {
      h.asking = TECH.get(f.card); h.sticky = true; h.menu = { ...r.state, sticky: true };
      sound.tick(2);
      return this.renderHub();
    }
    case 'refuse': return this.refuse(f.why);
    case 'close': return this.closeHub(true);
    case 'pass': this.closeHub(true); if (e) this.key(e); return;
  }
}

/** Tab or C let go: what was browsed applies, a chord closes it, a tap keeps it open */
export function hubRelease(this: App) {
  const h = this.hub!;
  if (h.asking || h.awaitVar) return;
  this.hubEffect(menuRelease(hubSpec(this, h), { ...h.menu, chordUsed: this.chordUsed }));
}

/** a click on one of the cards */
export function hubClick(this: App, el: Element) {
  const h = this.hub!;
  const hit = cardAt(hubSpec(this, h), h.menu, el);
  if (hit) this.hubEffect({ state: { ...h.menu, at: hit.at }, effect: pickCard(hit.card) });
}

/** what each card stands for (the cards are built fresh with the menu) */
const TECH = new WeakMap<Card, Tech>();
const FORM = new WeakMap<Card, Form>();
const SPEC = new WeakMap<Hub, MenuSpec>();

const techCard = (t: Tech): Card => {
  const c: Card = { key: t.key, label: t.label, ok: t.ok, why: t.why, run: t.run, tag: t.shortcut ? 'chain' : undefined, ask: t.ask && { prompt: t.ask.prompt, hint: t.ask.hint, commit: t.ask.run } };
  TECH.set(c, t);
  return c;
};

/** the menu as cards of the menu model. C: one section per group. Tab: one section, the forms
 *  (in the order the arrows take them), then the techniques (drawn on the line above them) */
function hubSpec(app: App, h: Hub): MenuSpec {
  const had = SPEC.get(h);
  if (had) return had;
  const spec: MenuSpec = h.calc
    ? { id: 'calc', openKey: 'c', sections: CALC_GROUPS.map(g => {
      const ts = h.techs.filter(t => t.group === g.name);
      return { name: g.name, live: ts.some(t => t.ok), rows: [ts.map(techCard)] };
    }) }
    : { id: 'tab', openKey: 'Tab', sections: [{ name: 'Algebra', rows: [h.forms.map(form => {
      const c: Card = { key: form.chord || undefined, label: form.name, ok: true, run: () => app.apply(form, 1.15) };
      FORM.set(c, form);
      return c;
    }), h.techs.map(techCard)] }] };
  SPEC.set(h, spec);
  return spec;
}

/** what a C card draws: the equation the step gives, or the new one it adds (worked out once) */
const SHOWN = new WeakMap<Tech, { n: Node; note: string } | null>();
function techShows(t: Tech): { n: Node; note: string } | null {
  if (SHOWN.has(t)) return SHOWN.get(t)!;
  let out: { n: Node; note: string } | null = null;
  if (t.move && !isErr(t.move)) out = { n: t.move.eq, note: '' };
  else if (t.makes) {
    try { const e = t.makes(); if (e && !('error' in e)) out = { n: (e as Eq).rel === 'expr' ? (e as Eq).lhs : e as Eq, note: 'as a new one' }; } catch { out = null; }
  }
  SHOWN.set(t, out);
  return out;
}

function renderCalcHub(this: App, host: HTMLElement) {
  const h = this.hub!;
  const spec = hubSpec(this, h), st = h.menu;
  host.classList.add('pal', 'calc');
  host.append(tabsEl(spec, st));
  const sec = spec.sections[st.section];
  // each one a card: its name, and what it gives drawn as math (the new equation, or the step)
  const face = (c: Card) => {
    const t = TECH.get(c)!;
    const card = document.createElement('button');
    card.className = 'form-card';
    card.dataset.k = t.key;
    const name = document.createElement('span');
    name.className = 'form-name';
    name.innerHTML = `<kbd>${t.key}</kbd>`;
    name.append(mathLabel(t.label + (t.ask ? ' …' : ''), 12));
    if (t.shortcut) name.insertAdjacentHTML('beforeend', '<span class="short" title="a chain of general moves, each one in the tree">chain</span>');
    card.append(name);
    const shows = t.ok ? techShows(t) : null;
    if (shows) { const sub = document.createElement('span'); sub.className = 'form-sub'; sub.append(mathLabel(shows.note, 11)); card.append(cardMath(shows.n, 15, 230), sub); }
    return card;
  };
  const row = cardsEl(sec, st, face, 'calc-items');
  if (!sec.rows.flat().length) row.innerHTML = `<span class="calc-empty">Nothing here for this one. Type ${escapeHtml(CALC_GROUPS[st.section].example)}.</span>`;
  host.append(row);
  if (h.asking) {
    const ask = document.createElement('div');
    ask.className = 'pal-ask';
    ask.innerHTML = `<span>${escapeHtml(h.asking.label)}: ${escapeHtml(h.asking.ask!.prompt)}</span><span id="calc-input"></span><span class="op-note">${escapeHtml(h.asking.ask!.hint)}, Enter applies</span>`;
    host.append(ask);
  }
  const tip = document.createElement('div');
  tip.className = 'forms-tip';
  tip.innerHTML = h.asking ? '<kbd>Enter</kbd> apply <kbd>Esc</kbd> back'
    : st.at !== null ? `<kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> pick <kbd>Esc</kbd> sections ${st.sticky ? '<kbd>Enter</kbd> applies' : 'release <kbd>C</kbd> to apply'}`
    : `<kbd>←</kbd><kbd>→</kbd> sections <kbd>↓</kbd> open one, or press a key. ${st.sticky ? '<kbd>Esc</kbd> closes' : ''}`;
  host.append(tip);
  if (h.asking) {
    const input = mathField($('calc-input'), {
      onKey: ev => {
        if (ev.key === 'Escape') { h.asking = undefined; this.renderHub(); return true; }
        if (ev.key !== 'Enter') return false;
        if (!input.value.trim()) { this.refuse(h.asking!.ask!.hint[0].toUpperCase() + h.asking!.ask!.hint.slice(1) + ', then Enter.'); return true; }
        const t = h.asking!;
        this.closeHub(false);
        t.ask!.run(input.value);
        return true;
      },
    });
    setTimeout(() => input.focus(), 0);
  }
}

export function renderHub(this: App) {
  const h = this.hub!;
  const host = $('forms');
  host.replaceChildren();
  host.className = 'forms hub';
  if (h.calc) {
    renderCalcHub.call(this, host);
    host.hidden = false;
    this.place(host);
    return;
  }
  if (h.awaitVar) {
    const row = document.createElement('div');
    row.className = 'hub-row';
    row.innerHTML = `<span class="hub-title">Solve for</span>` + [...symbols(this.eq)].sort((a, b) => Number(/^C(_\d+)?$/.test(a)) - Number(/^C(_\d+)?$/.test(b))).map(v => `<button class="chip var" data-k="${v}"><kbd>${v}</kbd></button>`).join('');
    host.append(row);
  } else {
    const spec = hubSpec(this, h);
    const face = (c: Card) => {
      const card = document.createElement('button');
      card.dataset.k = c.key ?? '';
      const form = FORM.get(c);
      if (!form) {
        card.className = 'chip';
        card.innerHTML = `<kbd>${c.key}</kbd>`;
        card.append(mathLabel(c.label, 12));
        return card;
      }
      card.className = 'form-card';
      const piece = form.select ? find(form.eq, form.select) : null;
      const lay = layout(piece ?? form.eq, 17);
      const mini = document.createElement('div');
      mini.className = 'mini';
      mini.style.width = lay.w + 'px';
      mini.style.height = lay.asc + lay.desc + 'px';
      const name = document.createElement('span');
      name.className = 'form-name';
      name.innerHTML = form.chord ? `<kbd>${form.chord}</kbd>` : '';
      name.append(mathLabel(form.name, 12));
      card.append(name, mini);
      new Stage(mini).show(lay, 0, 0, null);
      return card;
    };
    const cards = cardsEl(spec.sections[0], h.menu, face, 'tab-forms');
    // the techniques' line goes on top, under its title, as it always has; the arrows go by where it is drawn
    const lines = cards.querySelectorAll('.menu-line');
    const techLine = h.techs.length ? lines[lines.length - 1] : null;
    if (techLine) {
      techLine.classList.add('hub-row');
      techLine.insertAdjacentHTML('afterbegin', '<span class="hub-title">Techniques</span>');
      host.append(techLine);
    }
    if (h.forms.length) host.append(cards);
  }
  const tip = document.createElement('div');
  tip.className = 'forms-tip';
  const hk = h.calc ? 'C' : 'Tab';
  tip.innerHTML = h.awaitVar ? (h.pending ? `<kbd>'</kbd> for ${h.pending}′${symbols(this.eq).some(v => v.replace(/″/g, '′′') === h.pending) ? `, or Enter for ${h.pending}` : ''}` : 'press the variable (y′ is <kbd>y</kbd> then <kbd>\'</kbd>)') : h.sticky ? `press a key, or <kbd>←</kbd><kbd>→</kbd> browse + <kbd>${hk}</kbd> applies. <kbd>Esc</kbd> closes` : `keep holding <kbd>${hk}</kbd>: press a key, or <kbd>←</kbd><kbd>→</kbd> and release`;
  host.append(tip);
  host.hidden = false;
  this.place(host);
  host.querySelector('.form-card.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
