// The algebra hub (Tab): techniques by key, and forms to browse and apply.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { find, symbols, relOf, DEFS } from '../engine/ast';
import { unfold } from '../engine/goals';
import { applyMove, isErr } from '../engine/moves';
import { formsFor } from '../engine/forms';
import { splitCases, eliminate, quadraticFormula } from '../engine/techniques';
import { layout } from '../render/layout';
import { Stage } from '../render/stage';
import { walk } from '../engine/ast';
import { sound } from './sound';
import { $, Tech, escapeHtml } from './shared';
import type { App } from './app';

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
  const qv = aimVar ?? vars.find(v => !isErr(quadraticFormula(eq, v) as never));
  const q = qv ? quadraticFormula(eq, qv) : null;
  if (q && !('error' in q)) out.push({ key: 'g', label: `quadratic formula for ${qv}`, ok: true, run: () => this.split(undefined, q) });
  const hasCall = (() => { let c = false; walk(eq, n => { if (n.k === 'call' && DEFS.has(n.name)) c = true; }); return c; })();
  if (hasCall) out.push({ key: 'u', label: 'unfold the function', ok: true, run: () => this.apply(unfold(this.eq, this.sel), 1.1) });
  if (relOf(eq) === 'def') out.push({ key: 'b', label: 'inverse function', ok: true, run: () => this.addInverse() });
  this.slots.forEach((_, j) => {
    if (j === this.cur) return;
    const shares = symbols(this.eqOf(j)).some(v => vars.includes(v));
    out.push({ key: String(j + 1), label: `substitute from (${j + 1})`, ok: shares, run: () => this.substituteFrom(j) });
  });
  const partner = this.slots.findIndex((_, j) => j !== this.cur && !isErr(eliminate(eq, this.eqOf(j), j + 1, aimVar ?? undefined)));
  if (this.slots.length > 1) out.push({
    key: 'k', label: partner >= 0 ? `eliminate${aimVar ? ' ' + aimVar : ''} with (${partner + 1})` : 'eliminate with another equation', ok: partner >= 0,
    run: () => {
      this.flyFrom(partner);
      this.apply(eliminate(this.eq, this.eqOf(partner), partner + 1, aimVar ?? undefined), 1.1);
    },
  });
  return out;
}

export function openHub(this: App, sticky: boolean) {
  this.flush();
  const forms = formsFor(this.eq, this.sel);
  this.hub = { forms, techs: this.techniques(), i: 0, sticky, moved: false, awaitVar: false };
  this.chordUsed = false;
  this.setMode('hub');
  if (this.slots.length > 1) this.renderLanes();
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
}

export function hubKey(this: App, e: KeyboardEvent) {
  const h = this.hub!;
  const k = e.key;
  if (k === 'Escape') return this.closeHub(true);
  if (e.repeat) return;
  if (h.awaitVar) {
    const v = symbols(this.eq).find(s => s === k);
    if (v) { this.closeHub(false); return this.solveFor(v); }
    if (k === 'Tab') return this.closeHub(true);
    return this.refuse(`Press one of ${symbols(this.eq).join(', ')}.`);
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
  // Tab again: apply the highlighted form, or close if nothing is highlighted
  if (k === 'Tab') return h.moved ? this.applyForm() : this.closeHub(true);
  const tech = h.techs.find(t => t.key === k);
  if (tech) {
    if (!tech.ok) return this.refuse(`${tech.label[0].toUpperCase()}${tech.label.slice(1)} doesn't apply here.`);
    if (tech.key === 'i' && tech.label.endsWith('…')) return tech.run();
    this.closeHub(false);
    return tech.run();
  }
  if (/^[1-9]$/.test(k)) return this.refuse(Number(k) - 1 === this.cur ? 'That’s this equation. Hold Tab and press another equation’s number.' : `There is no equation ${k}.`);
  const form = h.forms.find(f => f.chord === k);
  if (form) { h.i = h.forms.indexOf(form); return this.applyForm(); }
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

export function applyForm(this: App) {
  const h = this.hub;
  if (!h) return;
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
  if (animateBack && peeked) { sound.undo(); this.renderAll({ quick: true }, true); }
  else { this.renderHints(); if (this.slots.length > 1) this.renderLanes(); }
}

export function renderHub(this: App) {
  const h = this.hub!;
  const host = $('forms');
  host.replaceChildren();
  host.className = 'forms hub';
  if (h.awaitVar) {
    const row = document.createElement('div');
    row.className = 'hub-row';
    row.innerHTML = `<span class="hub-title">Solve for</span>` + symbols(this.eq).map(v => `<button class="chip var" data-k="${v}"><kbd>${v}</kbd></button>`).join('');
    host.append(row);
  } else {
    const row = document.createElement('div');
    row.className = 'hub-row';
    row.innerHTML = `<span class="hub-title">Techniques</span>` + h.techs.map(t => `<button class="chip${t.ok ? '' : ' off'}" data-k="${t.key}"><kbd>${t.key}</kbd>${escapeHtml(t.label)}</button>`).join('');
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
        name.innerHTML = `${form.chord ? `<kbd>${form.chord}</kbd>` : ''}${form.name}`;
        card.append(name, mini);
        forms.append(card);
        new Stage(mini).show(lay, 0, 0, null);
      });
      host.append(forms);
    }
  }
  const tip = document.createElement('div');
  tip.className = 'forms-tip';
  tip.innerHTML = h.awaitVar ? 'press the variable' : h.sticky ? 'press a key, or <kbd>←</kbd><kbd>→</kbd> browse + <kbd>Tab</kbd> applies. <kbd>Esc</kbd> closes' : 'keep holding <kbd>Tab</kbd>: press a key, or <kbd>←</kbd><kbd>→</kbd> and release';
  host.append(tip);
  host.hidden = false;
  this.place(host);
  host.querySelector('.form-card.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
