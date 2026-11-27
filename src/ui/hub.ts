// The algebra hub (Tab): techniques by key, and forms to browse and apply.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { find, symbols, relOf, DEFS, Eq, Node } from '../engine/ast';
import { unfold, fold } from '../engine/goals';
import { applyMove, isErr } from '../engine/moves';
import { formsFor } from '../engine/forms';
import { polyTarget } from '../engine/polytools';
import { splitCases, eliminate, quadraticFormula, compareCoefficients } from '../engine/techniques';
import { layout } from '../render/layout';
import { Stage } from '../render/stage';
import { walk } from '../engine/ast';
import { sound } from './sound';
import { $, Tech, Hub, escapeHtml } from './shared';
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
  this.hub = { forms, techs, i: 0, sticky, moved: false, awaitVar: false, calc, tab };
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
  const step = ['ArrowRight', 'ArrowDown'].includes(k) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(k) ? -1 : 0;
  if (step) {
    if (!h.forms.length) return this.refuse('No other forms here. Aim at something else.');
    h.i = h.moved ? (h.i + step + h.forms.length) % h.forms.length : step > 0 ? 0 : h.forms.length - 1;
    h.moved = true;
    sound.tick(1);
    return this.peekAt();
  }
  if (k === 'Enter') { if (h.moved) return this.applyForm(); return this.refuse('Browse with ← → first, or press a key shown.'); }
  // Tab (or C) again: apply the highlighted form, or close if nothing is highlighted
  if (k === (h.calc ? 'c' : 'Tab') || (h.calc && k === 'C')) return h.moved ? this.applyForm() : this.closeHub(true);
  const tech = h.techs.find(t => t.key === k);
  if (tech) {
    if (!tech.ok) return this.refuse(tech.why ?? `${tech.label[0].toUpperCase()}${tech.label.slice(1)} doesn't apply here.`);
    if (tech.key === 'i' && tech.label.endsWith('…')) return tech.run();
    this.closeHub(false);
    return tech.run();
  }
  if (/^[1-9]$/.test(k)) return this.refuse(Number(k) - 1 === this.cur ? 'That’s this equation. Hold Tab and press another equation’s number.' : `There is no equation ${k}.`);
  const form = h.forms.find(f => f.chord === k);
  if (form) { h.i = h.forms.indexOf(form); return this.applyForm(); }
  // a tapped hub shows only the forms that apply: any other key is not on it, so it acts as it would with the hub shut (K28)
  if (h.sticky && !h.moved && k.length === 1 && k !== 'f') { this.closeHub(true); return this.key(e); }
  if (h.calc) return this.refuse(`Press one of ${h.techs.map(t => t.key).join(', ')}.`);
  if (k === 'f') { this.closeHub(false); return this.apply(applyMove('factor', this.eq, this.sel), 0.85); }
  const known = 'zdxswctolprhqvn';
  if (known.includes(k)) return this.refuse('That form doesn\'t apply to what is aimed.');
}

export function peekAt(this: App) {
  const h = this.hub!;
  const form = h.forms[h.i];
  this.peek = form.eq;
  this.renderMain({ quick: true, absorbs: form.hints.absorbs, flights: form.hints.flights });
  this.graph.draw(this.peek, true);
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
export function peekTech(this: App) {
  const h = this.hub!;
  const t = h.moved ? groupTechs(h)[h.i] : null;
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

export function applyForm(this: App) {
  const h = this.hub;
  if (!h) return;
  if (h.calc) { const t = groupTechs(h)[h.i]; return t ? this.runTech(t) : this.closeHub(true); }
  const form = h.forms[h.i];
  this.closeHub(false);
  this.apply(form, 1.15);
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

const groupTechs = (h: Hub) => h.techs.filter(t => t.group === CALC_GROUPS[h.tab ?? 0].name);

/** C's keys: ← → sections, ↓ into one, ← → its items, Enter or release applies; a key applies at once */
export function calcKey(this: App, e: KeyboardEvent) {
  const h = this.hub!;
  const k = e.key;
  if (h.asking) return;
  if (k === 'Escape') { if (h.moved) { h.moved = false; sound.tick(1); return this.peekTech(); } return this.closeHub(true); }
  if (e.repeat) return;
  const items = groupTechs(h);
  const dx = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0;
  if (dx && !h.moved) { h.tab = ((h.tab ?? 0) + dx + CALC_GROUPS.length) % CALC_GROUPS.length; sound.tick(1); return this.renderHub(); }
  if (dx && h.moved) { if (items.length) h.i = (h.i + dx + items.length) % items.length; sound.tick(2); return this.peekTech(); }
  if (k === 'ArrowDown' && !h.moved) {
    if (!items.length) return this.refuse(`Nothing in ${CALC_GROUPS[h.tab ?? 0].name} applies here. Try ${CALC_GROUPS[h.tab ?? 0].example}.`);
    h.moved = true; h.i = Math.max(0, items.findIndex(t => t.ok)); sound.tick(2); return this.peekTech();
  }
  if (k === 'ArrowUp' && h.moved) { h.moved = false; sound.tick(1); return this.peekTech(); }
  if (k === 'Enter' || ((k === 'c' || k === 'C') && h.moved)) {
    if (!h.moved) { if (!items.length) return this.refuse(`Nothing in ${CALC_GROUPS[h.tab ?? 0].name} applies here.`); h.moved = true; h.i = 0; return this.peekTech(); }
    return this.runTech(items[h.i]);
  }
  if (k === 'c' || k === 'C') return this.closeHub(true);
  // a key straight away: the one that applies, if two sections share it
  const all = h.techs.filter(t => t.key === k);
  const tech = all.find(t => t.ok) ?? all[0];
  if (tech) return this.runTech(tech);
  // opened with a tap and left open: a key it doesn't offer closes it and does its usual job (K2)
  if (h.sticky && !h.moved) { this.closeHub(true); return this.key(e); }
  return this.refuse(h.techs.length ? `Press one of ${[...new Set(h.techs.map(t => t.key))].join(', ')}, or ← → for the sections.` : 'No calculus here yet. ← → shows what each section takes.');
}

/** run a technique from C, asking for input first when it needs some */
export function runTech(this: App, t: Tech) {
  const h = this.hub!;
  if (!t.ok) return this.refuse(t.why ?? `${t.label[0].toUpperCase()}${t.label.slice(1)} doesn't apply here.`);
  if (t.ask) {
    h.asking = t; h.sticky = true; h.moved = true;
    h.tab = CALC_GROUPS.findIndex(g => g.name === t.group);
    h.i = groupTechs(h).indexOf(t);
    sound.tick(2);
    return this.renderHub();
  }
  this.closeHub(false);
  t.run();
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
  host.classList.add('pal', 'calc');
  const tabs = document.createElement('div');
  tabs.className = 'pal-tabs' + (h.moved ? '' : ' focus');
  tabs.innerHTML = CALC_GROUPS.map((g, j) => {
    const live = h.techs.some(t => t.group === g.name && t.ok);
    return `<button class="pal-tab${j === h.tab ? ' on' : ''}${live ? ' live' : ''}" data-tab="${j}">${g.name}</button>`;
  }).join('');
  host.append(tabs);
  const items = groupTechs(h);
  const row = document.createElement('div');
  row.className = 'hub-forms calc-items';
  if (!items.length) row.innerHTML = `<span class="calc-empty">Nothing here for this one. Type ${escapeHtml(CALC_GROUPS[h.tab ?? 0].example)}.</span>`;
  // each one a card: its name, and what it gives drawn as math (the new equation, or the step)
  items.forEach((t, j) => {
    const card = document.createElement('button');
    card.className = 'form-card' + (t.ok ? '' : ' off') + (h.moved && j === h.i ? ' on' : '');
    card.dataset.k = t.key;
    card.dataset.i = String(j);
    const name = document.createElement('span');
    name.className = 'form-name';
    name.innerHTML = `<kbd>${t.key}</kbd>`;
    name.append(mathLabel(t.label + (t.ask ? ' …' : ''), 12));
    if (t.shortcut) name.insertAdjacentHTML('beforeend', '<span class="short" title="a chain of general moves, each one in the tree">chain</span>');
    card.append(name);
    const shows = t.ok ? techShows(t) : null;
    if (shows) { const sub = document.createElement('span'); sub.className = 'form-sub'; sub.append(mathLabel(shows.note, 11)); card.append(cardMath(shows.n, 15, 230), sub); }
    row.append(card);
  });
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
    : h.moved ? `<kbd>←</kbd><kbd>→</kbd> pick <kbd>↑</kbd> sections ${h.sticky ? '<kbd>Enter</kbd> applies <kbd>Esc</kbd> closes' : 'release <kbd>C</kbd> to apply'}`
    : `<kbd>←</kbd><kbd>→</kbd> sections <kbd>↓</kbd> open one, or press a key. ${h.sticky ? '<kbd>Esc</kbd> closes' : ''}`;
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
    const row = document.createElement('div');
    row.className = 'hub-row';
    row.innerHTML = `<span class="hub-title">${h.calc ? 'Calculus' : 'Techniques'}</span>` + h.techs.map(t => `<button class="chip${t.ok ? '' : ' off'}" data-k="${t.key}"><kbd>${t.key}</kbd></button>`).join('');
    row.querySelectorAll<HTMLElement>('button[data-k]').forEach((b, j) => b.append(mathLabel(h.techs[j].label, 12)));
    host.append(row);
    if (h.forms.length) {
      const forms = document.createElement('div');
      forms.className = 'hub-forms';
      h.forms.forEach((form, i) => {
        const card = document.createElement('button');
        card.className = 'form-card' + (h.moved && i === h.i ? ' on' : '');
        card.dataset.i = String(i);
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
        forms.append(card);
        new Stage(mini).show(lay, 0, 0, null);
      });
      host.append(forms);
    }
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
