// Input: mouse and keyboard bindings, and the key dispatcher.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { applyMove, isErr } from '../engine/moves';
import { moveAny } from '../engine/techniques';
import { sound } from './sound';
import { cycleGraph } from './panels';
import { $, MOVE_KEYS, OP_KEYS, escapeHtml } from './shared';
import type { App } from './app';

export function bind(this: App) {
  const input = $<HTMLInputElement>('input');
  input.addEventListener('input', () => this.onType());
  // quick inserts under the box, for what's awkward to type
  const KEYS: [string, string, string][] = [['x²', '^2', 'power'], ['xₙ', '_', 'subscript'], ['√', 'sqrt(', ''], ['a/b', '/', ''], ['|x|', '|', ''], ['≤', '<=', ''], ['≥', '>=', ''], ['π', 'pi', ''], ['f(x) =', 'f(x) = ', ''], ['d/dx', 'd/dx(', ''], ['lim', 'lim x->0 ', ''], ['∫', 'int ', ''], ['Σ', 'sum_{n=1}^∞ ', ''], ['∂', '∂/∂x(', ''], ['∇', '∇(', ''], ['⟨ ⟩', '⟨', 'vector']];
  for (const [label, ins, hint] of KEYS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = escapeHtml(label) + (hint ? `<small>${hint}</small>` : '');
    b.addEventListener('mousedown', ev => {
      ev.preventDefault();
      const a = input.selectionStart ?? input.value.length, z = input.selectionEnd ?? a;
      input.value = input.value.slice(0, a) + ins + input.value.slice(z);
      input.setSelectionRange(a + ins.length, a + ins.length);
      this.onType();
    });
    $('input-keys').append(b);
  }
  input.addEventListener('focus', () => { if (this.mode !== 'write') { this.writing = 'edit'; this.setMode('write'); this.sel = null; this.renderAll(null); } });
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); this.commit(input.value); }
    if (e.key === 'Escape') { e.preventDefault(); this.cancelEdit(); }
  });
  const op = $<HTMLInputElement>('op-input');
  op.addEventListener('input', () => this.onOpType());
  op.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); this.closeOp(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const r = this.opResult();
      if (isErr(r)) { this.refuse(r.error); return; }
      const ref = /#(\d)/.exec($<HTMLInputElement>('op-input').value);
      this.closeOp();
      if (ref) this.flyFrom(Number(ref[1]) - 1);
      this.apply(r, 1.05);
    }
  });
  $('original').addEventListener('click', () => this.edit(false));
  $('trail').addEventListener('mousedown', e => e.stopPropagation());
  $('stage').addEventListener('mousedown', e => this.pointerDown(e));
  $('stage').addEventListener('mousemove', e => this.hover(e));
  $('stage').addEventListener('mouseleave', () => $('hover').classList.remove('on'));
  $('help-close').addEventListener('click', () => this.toggleHelp(false));
  $('help-tour').addEventListener('click', () => { this.toggleHelp(false); this.tour.menu(); });
  $('manual-btn').addEventListener('click', () => this.toggleHelp(true));
  $('tour-btn').addEventListener('click', () => this.tour.menu());
  document.querySelectorAll<HTMLElement>('.help-tabs button').forEach(b => b.addEventListener('click', () => this.helpTab(b.dataset.tab!)));
  $('sound').addEventListener('click', () => this.toggleSound());
  $('add-eq').addEventListener('click', () => this.edit(true));
  $('reset-eq').addEventListener('click', () => { this.resetArmed = performance.now(); this.resetWork(); });
  $('lib-btn').addEventListener('click', () => this.library.open());
  $('settings-btn').addEventListener('click', () => this.settings.open());
  $('flash').addEventListener('click', () => this.toggleFlash());
  window.addEventListener('keydown', e => { if (e.key === 'Control' || e.key === 'Meta') document.body.classList.add('ctrl'); this.key(e); });
  window.addEventListener('keyup', e => { if (e.key === 'Control' || e.key === 'Meta') document.body.classList.remove('ctrl'); });
  window.addEventListener('blur', () => document.body.classList.remove('ctrl'));
  window.addEventListener('keyup', e => {
    if (e.key.toLowerCase() === 'f' && this.mode === 'fnpal') {
      if (this.chordUsed && !this.pal.moved && !this.pal.sticky && !this.pal.ask) { this.closePal(true); return; }
      this.palRelease(); return;
    }
    if (this.mode !== 'hub' || !this.hub || this.hub.sticky || (this.hub.calc ? e.key.toLowerCase() !== 'c' : e.key !== 'Tab')) return;
    if (this.hub.moved) this.applyForm();
    else if (this.chordUsed && !this.hub.awaitVar) this.closeHub(true);
    else { this.hub.sticky = true; this.renderHub(); }
  });
  $('theme').addEventListener('click', () => this.toggleTheme());
  $('forms').addEventListener('mousedown', e => {
    e.stopPropagation();
    const t = e.target as HTMLElement;
    const card = t.closest<HTMLElement>('.form-card');
    if (card && this.hub) { this.hub.i = Number(card.dataset.i); return this.applyForm(); }
    const chip = t.closest<HTMLElement>('.chip');
    if (chip) {
      const ev = new KeyboardEvent('keydown', { key: chip.dataset.k! });
      if (this.mode === 'hub') this.hubKey(ev);
      else if (this.mode === 'fnpal') this.palKey(ev);
    }
    const tab = t.closest<HTMLElement>('.pal-tab');
    if (tab && this.mode === 'fnpal') { this.pal.tab = Number(tab.dataset.tab); this.pal.i = 0; this.pal.sticky = true; this.renderPal(); }
    if (tab && this.mode === 'hub' && this.hub?.calc) { this.hub.tab = Number(tab.dataset.tab); this.hub.moved = false; this.hub.sticky = true; this.renderHub(); }
  });
}

/** the smallest piece under a point on the stage */
export function hit(this: App, e: MouseEvent): string | null {
  const host = $('stage').getBoundingClientRect();
  const x = e.clientX - host.left, y = e.clientY - host.top;
  const lay = this.stage.layout;
  if (!lay) return null;
  let best: string | null = null, area = Infinity;
  for (const id of lay.boxes.keys()) {
    if (id === 'eq') continue;
    const r = this.stage.box(id)!;
    if (x >= r.x - 4 && x <= r.x + r.w + 4 && y >= r.y - 4 && y <= r.y + r.h + 4 && r.w * r.h < area) { best = id; area = r.w * r.h; }
  }
  return best;
}

/** a faint outline on what a click would aim at */
export function hover(this: App, e: MouseEvent) {
  const el = $('hover');
  const id = this.drag || this.mode !== 'solve' ? null : this.hit(e);
  const r = id && id !== this.sel ? this.stage.box(id) : null;
  el.classList.toggle('on', !!r);
  if (r) Object.assign(el.style, { left: `${r.x - 4}px`, top: `${r.y - 3}px`, width: `${r.w + 8}px`, height: `${r.h + 6}px` });
}

export function click(this: App, e: MouseEvent) {
  this.closeModes();
  const best = this.hit(e);
  if (best && best === this.sel) return this.grow();
  this.select(best);
}

export function toggleHelp(this: App, show = $('help').hidden) { $('help').hidden = !show; }

/** close the manual, library and settings (a tour starting or ending) */
export function closeOverlays(this: App) {
  this.toggleHelp(false);
  this.library.close();
  this.settings.close();
  this.closeModes();
}

export function helpTab(this: App, tab: string) {
  document.querySelectorAll<HTMLElement>('.help-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll<HTMLElement>('.help-pane').forEach(p => { p.hidden = p.dataset.pane !== tab; });
  sound.tick(1);
}
export function toggleSound(this: App) {
  const m = sound.toggle();
  $('sound').classList.toggle('off', m);
  $('sound').setAttribute('aria-pressed', String(!m));
  this.say(m ? 'Sound off.' : 'Sound on.');
}

export function key(this: App, e: KeyboardEvent) {
  if (this.mode === 'write' || this.mode === 'op' || this.mode === 'fnask') return;
  if (this.tour.menuOpen) return this.tour.menuKey(e);
  if (this.library.isOpen) return this.library.key(e);
  if (this.settings.isOpen) return this.settings.key(e);
  if (!$('help').hidden) {
    if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); this.toggleHelp(false); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); this.helpTab(e.key === 'ArrowLeft' ? 'how' : 'keys'); }
    if (e.key === 'g') { e.preventDefault(); this.toggleHelp(false); this.tour.menu(); }
    return;
  }
  if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
  const k = e.key;
  const ctrl = e.ctrlKey || e.metaKey;
  if (this.mode === 'hub') { e.preventDefault(); if (this.hub?.calc ? k.toLowerCase() !== 'c' : k !== 'Tab') this.chordUsed = true; return this.hubKey(e); }
  if (this.mode === 'fnpal') { e.preventDefault(); if (k.toLowerCase() !== 'f') this.chordUsed = true; return this.palKey(e); }
  if (this.mode === 'labels') {
    e.preventDefault();
    if (k === 'Escape' || k === ' ') { this.setMode('solve'); this.renderHints(); return; }
    if (/^[a-z]$/.test(k)) this.labelKey(k);
    else { this.setMode('solve'); this.renderHints(); }
    return;
  }
  this.flush();
  if (ctrl) {
    // hold Ctrl: ← grows the highlight to the left, → to the right; let go and it stays
    if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); return this.growEdge(k === 'ArrowLeft' ? -1 : 1); }
    // Ctrl + ↑ ↓: previous / next equation
    if (k === 'ArrowUp' || k === 'ArrowDown') { e.preventDefault(); return this.stepEquation(k === 'ArrowUp' ? -1 : 1); }
    if (k.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
    else if ((k.toLowerCase() === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); this.redo(); }
    return;
  }
  const handled = () => e.preventDefault();
  if (OP_KEYS[k]) { handled(); return this.openOp(OP_KEYS[k]); }
  if (/^[1-9]$/.test(k)) { handled(); return this.switchTo(Number(k) - 1); }
  const move = MOVE_KEYS.find(m => m.key === k);
  if (move) {
    handled();
    if (move.name === 'any') { const r = moveAny(this.eq, this.sel); return isErr(r) || !r.check ? this.apply(r, move.pitch) : this.applyTidy(r, move.pitch); }
    if (move.name === 'simplify') return this.simplifyKey();
    return this.apply(applyMove(move.name, this.eq, this.sel), move.pitch);
  }
  switch (k) {
    case ' ': handled(); return this.showLabels();
    case 'h': case 'ArrowLeft': handled(); return e.altKey ? this.stepEquation(-1) : e.shiftKey ? this.apply(applyMove('slideL', this.eq, this.sel)) : this.sideways(-1);
    case 'l': case 'ArrowRight': handled(); return e.altKey ? this.stepEquation(1) : e.shiftKey ? this.apply(applyMove('slideR', this.eq, this.sel)) : this.sideways(1);
    case 'H': handled(); return this.apply(applyMove('slideL', this.eq, this.sel));
    case 'L': handled(); return this.apply(applyMove('slideR', this.eq, this.sel));
    case 'k': case 'ArrowUp': handled(); return this.grow();
    case 'j': case 'ArrowDown': handled(); return this.shrink();
    case 'Tab': handled(); if (e.shiftKey) return this.toggleSide(); if (!e.repeat) this.openHub(false); return;
    case 'a': handled(); return this.select('eq');
    case 'Escape': handled(); return this.select(null, true);
    case 'u': handled(); return this.undo();
    case 'r': case 'U': handled(); return this.redo();
    case 'o': handled(); return this.openOp('+');
    case 'e': case 'E': handled(); return this.solveKey();
    case 'Enter': handled(); return this.openHub(true);
    case 'f': case 'F': handled(); if (!e.repeat) this.openPal(false); return;
    case 'c': case 'C': handled(); if (!e.repeat) this.openHub(false, true); return;
    case 'i': handled(); return this.edit(false);
    case 'n': handled(); return this.edit(true);
    case 'Delete': case 'Backspace': handled(); return this.removeCurrent();
    case 't': handled(); return this.toggleTheme();
    case '?': handled(); return this.toggleHelp();
    case 'M': handled(); return this.toggleSound();
    case 'g': handled(); return this.tour.menu();
    case 'w': handled(); this.closeModes(); return this.library.open();
    case ',': handled(); this.closeModes(); return this.settings.open();
    case 'z': handled(); return this.toggleFlash();
    case 'G': handled(); { const at = cycleGraph(); sound.tick(2); return this.say(at === 'right' ? 'Graph on the right.' : at === 'below' ? 'Graph under the work.' : 'Graph hidden. Shift+G brings it back.'); }
    case 'R': handled(); return this.resetWork();
    case '[': handled(); return this.graph.zoom(1.25);
    case ']': handled(); return this.graph.zoom(0.8);
  }
}
