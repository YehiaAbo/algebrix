import { Eq, Node, find, findPath, children, symbols, relOf, key, isVector } from '../engine/ast';
import { isIdentity, isProved } from '../engine/goals';
import { Domain } from '../engine/moves';
import { parseEquation } from '../engine/parse';
import { toText } from '../engine/print';
import { applyMove, isErr, MoveOk, MoveResult, solvedFor } from '../engine/moves';
import { formsFor } from '../engine/forms';
import { moveAny, WrapItem, simplifySpot, Spot } from '../engine/techniques';
import { layout, Rect } from '../render/layout';
import { Stage, Transition } from '../render/stage';
import { Graph } from './graph';
import { Tour, toured } from './tour';
import { group, ungroup } from '../engine/select';
import { walk } from '../engine/ast';
import { sound } from './sound';
import { prefs, setPref, onPrefs, ms } from './prefs';
import { applyTheme, applyLook, applySpeed, isDark } from './appearance';
import { works } from './works';
import { initPanels, applyPanels } from './panels';
import { Library } from './library';
import { Settings } from './settings';
import { Step, Slot, Mode, $, MOVE_KEYS, LABEL_CHARS, DOMAIN_TEXT, Hub, livePreview, varHtml, escapeHtml } from './shared';
import * as nav from './nav';
import * as sheet from './sheet';
import { hasCalc } from '../engine/calcmoves';
import { odeKind } from '../engine/ode';
import { renderShelf, ShelfItem } from './shelf';
import type { NavView } from './nav';
import * as opsPart from './ops';
import * as hubPart from './hub';
import * as fnpalPart from './fnpal';
import * as solvingPart from './solving';
import * as keysPart from './keys';
import * as persistPart from './persist';
import * as calcPart from './calc';

export type { Slot };

export class App {
  slots: Slot[] = [];
  cur = 0;
  mode: Mode = 'write';
  memory = new Map<string, string>(); // parent id → child we came up from
  stage: Stage;
  graph: Graph;
  labels = new Map<string, string>();
  typed = '';
  message: { text: string; bad: boolean } | null = null;
  messageTimer = 0;
  preview: Eq | null = null;
  peek: Eq | null = null;
  hub: Hub | null = null;
  typingTimer = 0;
  writing: 'new' | 'edit' = 'edit';
  pending: { timer: number; run: () => void }[] = [];
  deleteArmed = 0;
  looseSel: string | null = null;
  /** while the tour runs, your own session isn't overwritten */
  noSave = false;
  /** what each variable may be (real by default); moves and answers respect it */
  domains: Record<string, Domain> = {};
  /** a partial selection: the current step with a run of terms wrapped in a group node */
  grouped: { base: Eq; eq: Eq; id: string; anchor: string; head: string } | null = null;
  drag: { x: number; y: number; on: boolean } | null = null;
  tour: Tour;
  library: Library;
  settings: Settings;
  /** the workspace (card) being worked on */
  workId = '';
  resetArmed = 0;
  /** a key was pressed while Tab or f was held: letting go then closes the menu instead of pinning it open */
  chordUsed = false;

  pal = { tab: 0, i: 0, moved: false, sticky: false, ask: null as WrapItem | null };
  constructor() {
    this.stage = new Stage($('stage'));
    this.graph = new Graph($<HTMLCanvasElement>('graph'), $('graph-note'));
    this.bind();
    let size = '';
    new ResizeObserver(() => {
      const st = $('stage'), next = `${st.clientWidth}x${st.clientHeight}`;
      if (next !== size) { size = next; this.renderMain(null); }
    }).observe($('stage'));
    this.tour = new Tour(this);
    const app = this;
    this.library = new Library({
      get workId() { return app.workId; },
      saveNow: () => this.save(),
      open: id => this.openWork(id),
      create: () => this.newWork(),
      afterRemove: () => { if (!this.restore()) this.newWork(); },
    });
    this.settings = new Settings({ tour: () => this.tour.menu() });
    onPrefs((_, k) => this.prefsChanged(k));
    initPanels();
    if (!this.restore()) {
      this.writing = 'new';
      this.commit('7y + 3x = 20', true);
    }
    this.themeLabel();
    this.flashLabel();
    $('sound').classList.toggle('off', prefs.muted);
    if (!toured()) window.setTimeout(() => this.tour.start('basics'), 600);
  }

  get slot(): Slot | undefined { return this.slots[this.cur]; }
  get steps(): Step[] { return this.slot?.steps ?? []; }
  set steps(v: Step[]) { this.slot!.steps = v; }
  get at(): number { return this.slot?.at ?? 0; }
  set at(v: number) { this.slot!.at = v; }
  get sel(): string | null { return this.slot ? this.slot.sel : this.looseSel; }
  set sel(v: string | null) { if (this.slot) this.slot.sel = v; else this.looseSel = v; }

  get eq(): Eq {
    if (this.preview) return this.preview;
    const base = this.steps[this.at]?.eq;
    return this.grouped && this.grouped.base === base ? this.grouped.eq : base;
  }
  /** the current step itself, without any temporary group */
  get base(): Eq { return this.steps[this.at]?.eq; }
  /** what the stage shows: the typed preview, a form being browsed, or the current step */
  get shown(): Eq { return this.peek ?? this.eq; }
  get step(): Step { return this.steps[this.at]; }
  eqOf(i: number): Eq { return sheet.eqOf(this, i); }

  /* ---------------- rendering ---------------- */

  renderMain(tr: Transition | null) {
    $('hover').classList.remove('on');
    if (!this.preview) $('stage').classList.remove('preview');
    const eq = this.shown;
    if (!eq) { this.stage.clear(); return; }
    const host = $('stage');
    const W = host.clientWidth, H = host.clientHeight;
    const pad = 32;
    let S = Math.min(68, Math.max(30, W / 15)) * prefs.size;
    let lay = layout(eq, S);
    if (lay.w > W - 2 * pad) { S = Math.max(22, S * (W - 2 * pad) / lay.w); lay = layout(eq, S); }
    const h = lay.asc + lay.desc;
    if (h > H - 40) { S = Math.max(22, S * (H - 40) / h); lay = layout(eq, S); }
    let ox = W / 2 - (lay.eqX ?? lay.w / 2);
    ox = Math.min(Math.max(ox, pad), Math.max(pad, W - pad - lay.w));
    if (lay.w > W - 2 * pad) ox = (W - lay.w) / 2;
    const oy = Math.round(Math.max(H * 0.56 - (lay.asc + lay.desc) / 2, Math.min(230, H * 0.4)));
    this.stage.show(lay, Math.round(ox), oy, tr);
    // a final answer that isn't an equation (an inequality's solution set) sits under it
    const ans = $('answer');
    const text = !this.preview && !this.peek ? this.step?.answer : undefined;
    const proved = !this.preview && !this.peek && relOf(eq) === '≟' && isProved(eq);
    ans.hidden = !text && !proved;
    if (text || proved) {
      ans.textContent = proved ? '∎ proved' : text!;
      ans.style.top = `${Math.round(oy + lay.asc + lay.desc + 22)}px`;
    }
    host.classList.toggle('preview', !!this.preview || (!!this.peek && this.mode === 'op'));
    this.renderSelection();
    this.renderSpot();
  }

  renderSelection() {
    const el = $('sel');
    const browsing = this.hub && this.hub.moved ? this.hub.forms[this.hub.i] : null;
    const id = browsing ? browsing.select ?? 'eq' : this.mode === 'op' && this.peek ? null : this.sel;
    const r = id ? this.stage.box(id) : null;
    if (!r || this.mode === 'write') { el.classList.remove('on'); return; }
    const S = this.stage.layout ? this.stage.layout.glyphs[0]?.s ?? 60 : 60;
    const p = Math.max(5, S * 0.1);
    Object.assign(el.style, { left: `${r.x - p}px`, top: `${r.y - p * 0.6}px`, width: `${r.w + 2 * p}px`, height: `${r.h + p * 1.2}px`, borderRadius: `${Math.max(6, S * 0.12)}px` });
    el.classList.add('on');
    // a run of several terms (Ctrl + arrows, or the mouse box) reads as one piece with a softer fill
    el.classList.toggle('run', !!this.grouped && id === this.grouped.id);
    // while Ctrl is held: arrows on the sides that can still grow
    const edges = id && id !== 'eq' && !browsing ? this.growable(id) : { l: false, r: false };
    el.dataset.l = edges.l ? '1' : '';
    el.dataset.r = edges.r ? '1' : '';
  }

  /** the status tag an equation carries: its answer, ✓, ∎, or a warning */
  slotTag(i: number, e: Eq): { text: string; cls: string } | null {
    const sl = this.slots[i], st = sl.steps[sl.at];
    if (relOf(e) === '≟') return isProved(e) ? { text: '∎', cls: 'solved' } : { text: 'prove', cls: 'goal' };
    if (relOf(e) === 'def') return { text: 'definition', cls: 'goal' };
    if (st.answer) return { text: st.answer, cls: 'solved ans' };
    if (solvedFor(e)) return sl.bad ? { text: 'not a solution', cls: 'solved no' } : { text: '✓', cls: 'solved' };
    return null;
  }

  /** The sheet: the equation you work on gets the room; the others sit open on the shelf
   *  across the top, each saying what it can give this one, one key (or click, or Alt + ← →) away. */
  renderLanes() {
    const board = $('board'), dock = $('dock');
    const adding = this.mode === 'write' && this.writing === 'new' && this.slots.length > 0;
    const active = adding ? this.slots.length : this.cur;
    const n = this.slots.length + (adding ? 1 : 0);
    board.classList.toggle('multi', n > 1);
    $('stage').dataset.n = String(active + 1);
    dock.hidden = n < 2;
    if (n < 2) return;
    const aimed = this.sel && this.sel !== 'eq' ? find(this.eq, this.sel) : null;
    const mine = this.shown ? symbols(this.shown) : [];
    const items: ShelfItem[] = [];
    for (let i = 0; i < this.slots.length; i++) {
      if (i === active) continue;
      const e = this.eqOf(i);
      const shared = adding ? [] : symbols(e).filter(v => mine.includes(v));
      const solved = solvedFor(e);
      const keys = `<span class="sep">·</span><kbd>Tab</kbd>+<kbd>${i + 1}</kbd>`;
      let offer = '';
      if (aimed?.k === 'sym' && shared.includes(aimed.name)) offer = `puts in <i>${varHtml(aimed.name)}</i>${keys}`;
      else if (solved && shared.includes(solved)) offer = `gives <i>${varHtml(solved)}</i>${keys}`;
      else if (shared.length) offer = `shares <span>${shared.map(v => `<i>${varHtml(v)}</i>`).join(", ")}</span>${keys}`;
      // links light up only while the algebra menu is open (Tab), when you'd use them
      items.push({ i, eq: e, tag: this.slotTag(i, e), offer, linked: shared.length > 0 && this.mode === 'hub' });
    }
    renderShelf($('dock-row'), items, i => this.switchTo(i));
  }

  /** a copy of another equation flies into this one (substitute, add an equation) */
  flyFrom(j: number) {
    const src = $('dock').querySelector<HTMLElement>(`.lane[data-lane="${j}"] .lane-math .mini`);
    const dst = this.stage.box('eq');
    if (!src || !dst) return;
    const a = src.getBoundingClientRect(), host = $('stage').getBoundingClientRect();
    const ghost = src.cloneNode(true) as HTMLElement;
    ghost.classList.add('fly');
    Object.assign(ghost.style, { position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, margin: '0', zIndex: '6' });
    document.body.append(ghost);
    const tx = host.left + dst.x + dst.w / 2 - (a.left + a.width / 2), ty = host.top + dst.y + dst.h / 2 - (a.top + a.height / 2);
    ghost.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${tx}px, ${ty}px) scale(1.25)`, opacity: 0 }], { duration: ms(420), easing: 'cubic-bezier(.3,.6,.2,1)', fill: 'forwards' }).onfinish = () => ghost.remove();
    src.closest('.lane')?.animate([{ boxShadow: '0 0 0 2px var(--copy)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: ms(700), easing: 'ease-out' });
  }

  renderAll(tr: Transition | null, graphAnim = false) {
    this.syncDefs();
    this.renderLanes();
    this.renderMain(tr);
    this.renderTrail();
    this.renderRail();
    this.renderHints();
    if (this.shown) this.graph.draw(this.shown, graphAnim, this.slots.filter((_, i) => i !== this.cur).map((_, j) => this.eqOf(j >= this.cur ? j + 1 : j)));
    document.body.dataset.mode = this.mode;
    this.tour?.check();
  }

  renderTrail() {
    const host = $('trail');
    host.querySelectorAll('.trail-row').forEach(r => r.remove());
    if (this.mode === 'write') return;
    const from = Math.max(0, this.at - 4);
    for (let i = from; i < this.at; i++) {
      const row = document.createElement('button');
      row.className = 'trail-row';
      row.style.setProperty('--age', String(this.at - i));
      row.title = 'Go back to this step';
      const mini = document.createElement('div');
      mini.className = 'mini';
      const label = document.createElement('span');
      label.className = 'trail-label';
      const st = this.steps[i + 1];
      label.textContent = st.label;
      const dir = document.createElement('span');
      dir.className = `trail-dir${st.dir === '⇒' ? ' one-way' : ''}`;
      dir.textContent = st.dir ?? '⇔';
      dir.title = st.dir === '⇒' ? 'One-way step: it can add solutions, so answers get checked' : 'Reversible step: same solutions before and after';
      label.prepend(dir);
      row.append(mini, label);
      host.append(row);
      const lay = layout(this.steps[i].eq, 21);
      mini.style.width = lay.w + 'px';
      mini.style.height = lay.asc + lay.desc + 'px';
      new Stage(mini).show(lay, 0, 0, null);
      row.addEventListener('click', () => this.jump(i));
    }
    const orig = $('original');
    orig.replaceChildren();
    if (this.steps[0]) {
      const lay = layout(this.steps[0].eq, 20);
      const mini = document.createElement('div');
      mini.className = 'mini';
      mini.style.width = lay.w + 'px';
      mini.style.height = lay.asc + lay.desc + 'px';
      orig.append(mini);
      new Stage(mini).show(lay, 0, 0, null);
    }
  }

  renderRail() {
    // the system: every equation, numbered like weapon slots
    $('work-name').textContent = works.get(this.workId)?.name ?? 'Untitled';
    const list = $('eqs');
    list.replaceChildren();
    this.slots.forEach((_, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'eq-slot' + (i === this.cur ? ' on' : '');
      btn.title = `Switch to equation ${i + 1} (${i + 1})`;
      const e = i === this.cur && this.mode === 'write' && this.preview ? this.preview : this.eqOf(i);
      const badge = document.createElement('kbd');
      badge.textContent = String(i + 1);
      const mini = document.createElement('div');
      mini.className = 'mini';
      let lay = layout(e, 15);
      if (lay.w > 140) lay = layout(e, Math.max(9, 15 * 140 / lay.w));
      mini.style.width = lay.w + 'px';
      mini.style.height = lay.asc + lay.desc + 'px';
      btn.append(badge, mini);
      const solved = solvedFor(e);
      const bad = this.slots[i].bad;
      if (bad) { btn.classList.add('bad'); btn.title = bad; }
      const st = this.slots[i].steps[this.slots[i].at];
      const done = (relOf(e) === '≟' && isProved(e)) ? '∎' : st.answer ? st.answer : solved ? (bad ? 'not a solution' : '✓') : '';
      if (done) { const tag = document.createElement('span'); tag.className = bad ? 'solved no' : st.answer ? 'solved ans' : 'solved'; tag.textContent = done; btn.append(tag); }
      if (relOf(e) === '≟' && !isProved(e)) { const tag = document.createElement('span'); tag.className = 'goal'; tag.textContent = 'prove'; btn.append(tag); }
      if (relOf(e) === 'def') btn.classList.add('def');
      li.append(btn);
      list.append(li);
      new Stage(mini).show(lay, 0, 0, null);
      btn.addEventListener('click', () => this.switchTo(i));
    });
    $('eqs-tip').innerHTML = this.slots.length > 1 ? `<kbd>1</kbd>–<kbd>${Math.min(9, this.slots.length)}</kbd> or <kbd>Alt</kbd>+<kbd>←</kbd><kbd>→</kbd> switch, hold <kbd>Tab</kbd> + number to substitute` : `<kbd>n</kbd> adds another equation`;

    const eq = this.eq;
    const vars = $('vars');
    vars.replaceChildren();
    if (!eq) return;
    const solved = this.mode === 'write' ? null : solvedFor(eq);
    for (const v of symbols(eq)) {
      const li = document.createElement('li');
      const conds = (this.step?.conditions ?? []).filter(c => new RegExp(`(^|[^a-zα-ω])${v}([^a-zα-ω]|$)`).test(c));
      const dom = this.domains[v] ?? 'real';
      li.innerHTML = `<span class="var">${varHtml(v)}</span><button class="dom" title="Click to change what ${escapeHtml(v)} can be">${DOMAIN_TEXT[dom]}</button>${solved === v ? '<span class="solved">solved</span>' : ''}`;
      li.querySelector('.dom')!.addEventListener('click', () => this.cycleDomain(v));
      if (conds.length) li.title = conds.join(', ');
      vars.append(li);
    }
    const conds = $('conds');
    conds.replaceChildren();
    for (const c of this.step?.conditions ?? []) {
      const li = document.createElement('li');
      li.textContent = c;
      conds.append(li);
    }
    $('conds-empty').hidden = (this.step?.conditions.length ?? 0) > 0;
    $('step-count').textContent = this.mode === 'write' ? 'Writing' : this.at === 0 ? 'Start' : `Step ${this.at}`;
    $('redo-count').textContent = this.at < this.steps.length - 1 ? `${this.steps.length - 1 - this.at} ahead, r to redo` : '';
  }

  renderHints() {
    const host = $('hints');
    host.classList.toggle('msg', !!this.message);
    host.classList.toggle('bad', !!this.message?.bad);
    if (this.message) { host.textContent = this.message.text; return; }
    if (!prefs.hints && this.mode === 'solve') { host.innerHTML = '<span class="spacer"></span><span class="hint dim"><kbd>?</kbd> manual</span>'; return; }
    if (this.mode === 'write') {
      host.innerHTML = `<span class="hint"><kbd>Enter</kbd> ${this.writing === 'new' && this.slots.length ? 'add to the system' : 'start solving'}</span><span class="hint"><kbd>Esc</kbd> cancel</span><span class="aside">Type like <i>3x/7 + 2 = y</i>, <i>x^2</i>, <i>sqrt(x)</i>, <i>ln(x)</i>, <i>|x − 1|</i>, <i>e^x</i>, or paste LaTeX.</span>`;
      return;
    }
    if (this.mode === 'labels') { host.innerHTML = `<span class="aside">Press a letter to aim. <kbd>Esc</kbd> to cancel.</span>`; return; }
    if (this.mode === 'hub') { host.innerHTML = `<span class="aside">Holding <kbd>${this.hub?.calc ? 'C' : 'Tab'}</kbd>: press a key to use it now, or <kbd>←</kbd><kbd>→</kbd> to browse forms and release to apply.</span>`; return; }
    if (this.mode === 'fnpal') { host.innerHTML = `<span class="aside">Functions on both sides. <kbd>i</kbd> undoes the outer one. Arrows browse with a live preview. <kbd>Esc</kbd> cancels.</span>`; return; }
    if (this.mode === 'fnask') { host.innerHTML = `<span class="aside">Type the number. The preview is live. <kbd>Enter</kbd> applies, <kbd>Esc</kbd> goes back.</span>`; return; }
    if (this.mode === 'op') { host.innerHTML = `<span class="aside">Type what to apply to both sides. The preview is live. <kbd>Enter</kbd> applies, <kbd>Esc</kbd> cancels.</span>`; return; }
    const parts: string[] = [];
    const node = this.sel && this.sel !== 'eq' ? find(this.eq, this.sel) : null;
    parts.push(`<span class="what">${node ? escapeHtml(toText(node)) : this.sel === 'eq' ? 'whole equation' : 'nothing aimed'}</span>`);
    if (!this.sel) {
      parts.push(`<span class="hint"><kbd class="wide">Space</kbd> aim</span><span class="hint"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> walk</span>`);
    } else {
      const m = moveAny(this.eq, this.sel);
      if (!isErr(m)) parts.push(`<span class="hint"><kbd>m</kbd> ${escapeHtml(m.label)}</span>`);
      for (const k of MOVE_KEYS.slice(1)) {
        if (k.name !== 'any' && !isErr(applyMove(k.name, this.eq, this.sel))) parts.push(`<span class="hint"><kbd>${k.key}</kbd> ${k.verb}</span>`);
      }
    }
    parts.push(`<span class="hint"><kbd>=</kbd><kbd>-</kbd><kbd>.</kbd><kbd>/</kbd> both sides</span><span class="hint"><kbd>Tab</kbd> algebra</span><span class="hint"><kbd>C</kbd> calculus</span><span class="hint"><kbd>e</kbd> solve</span><span class="hint"><kbd>f</kbd> functions</span>`);
    parts.push(`<span class="spacer"></span><span class="hint dim"><kbd>u</kbd> undo</span><span class="hint dim"><kbd>?</kbd> manual</span>`);
    host.innerHTML = parts.join('');
  }

  say(text: string, bad = false) {
    this.message = { text, bad };
    clearTimeout(this.messageTimer);
    this.renderHints();
    this.messageTimer = window.setTimeout(() => { this.message = null; this.renderHints(); }, bad ? 3200 : 2200);
  }

  /** a move that isn't allowed: the aimed piece resists (a springy nudge), a low sound, the reason at the bottom */
  refuse(text: string) {
    sound.refuse();
    this.say(text, true);
    const id = this.sel && this.sel !== 'eq' && this.stage.box(this.sel) ? this.sel : null;
    const resist: Keyframe[] = [{ transform: 'none' }, { transform: 'translateX(-5px) scaleX(.97)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }];
    for (const el of this.stage.elements(id)) el.animate(resist, { duration: 300, easing: 'cubic-bezier(.3,.7,.3,1)', composite: 'add' });
    if (id) $('sel').animate(resist, { duration: 300, easing: 'cubic-bezier(.3,.7,.3,1)' });
    this.tour?.check('refuse');
  }

  /* ---------------- state changes ---------------- */

  commit(src: string, quiet = false) {
    let eq: Eq;
    try { eq = this.preview && !quiet ? this.preview : parseEquation(src, true); }
    catch (e) { this.refuse((e as Error).message); return; }
    if (isIdentity(eq)) eq = { ...eq, rel: '≟' };
    this.preview = null;
    this.message = null;
    clearTimeout(this.typingTimer);
    $('input-error').textContent = '';
    const full = sheet.place(this, eq, this.writing === 'new');
    if (full) { this.refuse(full); return; }
    this.writing = 'edit';
    this.setMode('solve');
    if (!quiet) sound.commit();
    $<HTMLInputElement>('input').blur();
    this.stage.clear();
    this.renderAll(null);
    if (!quiet) this.entrance();
    this.save();
    const rel = relOf(eq);
    if (quiet) this.say('Space aims. m moves it across. = − . / do anything to both sides. Hold Tab for algebra, f for functions, e solves. ? shows every key.');
    else if (rel === '≟') this.say('Both sides agree for every value: an identity. Prove it by rewriting one side at a time until they match.');
    else if (rel === 'def' && eq.lhs.k === 'call') this.say(`Defined ${eq.lhs.name}. Use ${eq.lhs.name}(…) in other equations; hold Tab + u to unfold it, Tab + b for its inverse.`);
    else if (rel === 'expr') this.say('An expression: rewrite it with s, d, e and f. Add “= …” to make it an equation.');
    else if (this.slots.length > 1) this.say(`Equation ${this.cur + 1}. Press 1–${this.slots.length} to switch between them.`);
  }

  entrance() {
    const els = [...$('stage').querySelectorAll('.g')];
    els.forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: i * 14, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
  }

  apply(r: MoveResult, pitch = 1, opts: { quietLabel?: boolean } = {}) {
    if (isErr(r)) { this.refuse(r.error); return false; }
    r = { ...r, eq: ungroup(r.eq) };
    this.grouped = null;
    const before = this.eq;
    const wasSolved = solvedFor(before);
    const { answer } = sheet.addStep(this, r);
    this.sel = r.select !== undefined ? (r.select && find(r.eq, r.select) ? r.select : null) : this.sel && find(r.eq, this.sel) ? this.sel : null;
    sound.move(pitch);
    this.renderAll({ focus: r.focus, absorbs: r.hints.absorbs, flights: r.hints.flights }, true);
    if (!opts.quietLabel) this.bubble(r.label, false, r.focus ?? this.sel);
    const now = solvedFor(r.eq);
    const bad = now ? this.judge(this.cur) : null;
    if (relOf(r.eq) === '≟' && isProved(r.eq)) { setTimeout(() => sound.solved(), 140); this.say('Both sides match. Proved ∎'); $('stage').classList.add('solved'); setTimeout(() => $('stage').classList.remove('solved'), 900); this.save(); return true; }
    if (answer) this.say(answer);
    if (bad) { this.say(bad, true); this.renderRail(); }
    else if (now && now !== wasSolved) { setTimeout(() => sound.solved(), 140); this.say(`Solved for ${now}.`); $('stage').classList.add('solved'); setTimeout(() => $('stage').classList.remove('solved'), 900); }
    if (r.conditions?.length) this.say(`Noted on the left: ${r.conditions.join(', ')}.`);
    this.save();
    return true;
  }

  /** run something after a beat; any key press runs it immediately instead */
  later(ms: number, run: () => void) {
    const item = { timer: 0, run };
    item.timer = window.setTimeout(() => { this.pending = this.pending.filter(p => p !== item); run(); }, ms);
    this.pending.push(item);
  }

  flush() {
    while (this.pending.length) {
      const p = this.pending.shift()!;
      clearTimeout(p.timer);
      p.run();
    }
  }

  /** play several steps one after another, like a short animation */
  play(steps: MoveOk[], done?: () => void) {
    if (!steps.length) return;
    let i = 0;
    const next = () => {
      const s = steps[i++];
      // a tidy that changes nothing isn't a step
      if (!(s.auto && key(s.eq) === key(this.eq))) this.apply(s, 1.05 + 0.03 * i, { quietLabel: !!s.auto });
      if (i < steps.length) this.later(ms(s.auto ? 300 : 420), next);
      else if (done) this.later(ms(460), done);
    };
    next();
  }

  undo() {
    if (!sheet.undo(this)) { this.refuse('Nothing to undo. This is the original.'); return; }
    this.afterJump();
  }

  redo() {
    if (!sheet.redo(this)) { this.refuse('Nothing to redo.'); return; }
    this.afterJump();
  }

  jump(i: number) {
    if (i === this.at) return;
    this.at = i;
    this.afterJump();
  }

  afterJump() {
    if (this.sel && !find(this.eq, this.sel)) this.sel = null;
    sound.undo();
    this.renderAll({ quick: true }, true);
    this.save();
  }

  setMode(m: Mode) {
    this.mode = m;
    document.body.dataset.mode = m;
    if (m !== 'labels') this.clearLabels();
  }

  select(id: string | null, quiet = false) {
    if (id === this.sel) return;
    if (this.grouped && id !== this.grouped.id) { this.grouped = null; this.renderMain(null); }
    this.sel = id;
    if (!quiet) sound.tick(id ? (findPath(this.eq, id)?.length ?? 1) - 1 : 0);
    this.renderSelection();
    this.renderHints();
    this.tour.check();
  }

  /* ---------------- simplification on offer ---------------- */

  spot: Spot | null = null;

  /** mark what could simplify with dashed boxes and a small prompt; nothing changes until you press s */
  renderSpot() {
    const host = $('spots');
    host.replaceChildren();
    this.spot = this.mode === 'solve' && !this.peek && !this.preview && this.eq ? simplifySpot(this.eq) : null;
    if (!this.spot) return;
    const boxes = this.spot.marks.map(id => this.stage.box(id)).filter((r): r is Rect => !!r);
    if (!boxes.length) { this.spot = null; return; }
    const S = this.stage.layout?.glyphs[0]?.s ?? 60;
    const p = Math.max(3, S * 0.06);
    for (const r of boxes) {
      const b = document.createElement('div');
      b.className = 'spot';
      Object.assign(b.style, { left: `${r.x - p}px`, top: `${r.y - p}px`, width: `${r.w + 2 * p}px`, height: `${r.h + 2 * p}px` });
      host.append(b);
    }
    const first = boxes.reduce((a, b) => (b.y < a.y ? b : a));
    const chip = document.createElement('button');
    chip.className = 'spot-chip';
    chip.innerHTML = '<kbd>s</kbd> simplify';
    chip.title = 'Simplify the marked part';
    const x = Math.min(...boxes.map(b => b.x)), x2 = Math.max(...boxes.map(b => b.x + b.w));
    chip.style.left = `${(x + x2) / 2}px`;
    chip.style.top = `${first.y + first.h + p + 10}px`;
    chip.addEventListener('mousedown', e => { e.stopPropagation(); this.simplifyKey(true); });
    host.append(chip);
  }

  /** s: simplify what is aimed if it can, otherwise take the offered simplification */
  simplifyKey(offered = false) {
    if (!offered && this.sel) {
      const r = applyMove('simplify', this.eq, this.sel);
      if (!isErr(r)) return this.apply(r, 1.2);
    }
    if (this.spot) return this.apply(this.spot.move, 1.2);
    this.refuse('Already as simple as it gets.');
  }

  /* ---------------- the system of equations ---------------- */

  switchTo(i: number) {
    if (i < 0 || i >= this.slots.length) { this.refuse(`There is no equation ${i + 1}. Press n to add one.`); return; }
    if (i === this.cur) return;
    if (this.mode === 'write') this.cancelEdit();
    const host = $('stage').getBoundingClientRect();
    const from = $('dock').querySelector<HTMLElement>(`.lane[data-lane="${i}"] .mini`)?.getBoundingClientRect();
    const eqBox = this.stage.box('eq');
    const old = this.cur;
    this.cur = i;
    sound.tick(1);
    this.stage.clear();
    this.renderAll(null);
    const to = this.stage.box('eq');
    if (from && to && from.width) {
      // every glyph starts where it sat in the small card and grows into place
      const k = from.width / to.w;
      $('stage').querySelectorAll<HTMLElement>('.g').forEach(el => {
        const gx = el.offsetLeft, gy = el.offsetTop;
        const sx = from.left - host.left + (gx - to.x) * k, sy = from.top - host.top + (gy - to.y) * k;
        el.animate([{ transform: `translate(${sx - gx}px, ${sy - gy}px) scale(${k})`, opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: ms(340), easing: 'cubic-bezier(.2,.8,.16,1)' });
      });
    } else this.entrance();
    // and the equation you left shrinks into its card
    const card = $('dock').querySelector<HTMLElement>(`.lane[data-lane="${old}"] .mini`);
    if (card && eqBox) {
      const c = card.getBoundingClientRect(), k = eqBox.w / c.width;
      card.animate([{ transform: `translate(${host.left + eqBox.x - c.left}px, ${host.top + eqBox.y - c.top}px) scale(${k})`, transformOrigin: '0 0', opacity: 0.3 }, { transform: 'none', transformOrigin: '0 0', opacity: 1 }], { duration: ms(340), easing: 'cubic-bezier(.2,.8,.16,1)' });
    }
    this.save();
  }

  removeCurrent() {
    if (this.slots.length < 2) { this.refuse('This is the only equation. Press i to type over it instead.'); return; }
    if (performance.now() - this.deleteArmed > 1600) {
      this.deleteArmed = performance.now();
      this.bubble(`Press Delete again to remove equation ${this.cur + 1}`, true, 'eq');
      sound.refuse();
      return;
    }
    this.deleteArmed = 0;
    sheet.removeCurrent(this);
    sound.undo();
    this.stage.clear();
    this.renderAll(null);
    this.entrance();
    this.save();
  }

  /* ---------------- aiming ---------------- */

  visibleKids(n: Node): Node[] {
    let ks = children(n);
    if (n.k === 'mul' && ks[0]?.k === 'num' && Math.abs(ks[0].v) === 1 && ks.length > 1) ks = ks.slice(1);
    return ks.filter(k => this.stage.box(k.id));
  }

  sameBox(a: string, b: string) {
    const r1 = this.stage.box(a), r2 = this.stage.box(b);
    return !!r1 && !!r2 && Math.abs(r1.x - r2.x) < 0.5 && Math.abs(r1.w - r2.w) < 0.5 && Math.abs(r1.y - r2.y) < 0.5 && Math.abs(r1.h - r2.h) < 0.5;
  }

  /** what the arrow keys see: the drawn tree */
  get nav(): NavView {
    return { root: this.eq, kids: n => this.visibleKids(n), same: (a, b) => this.sameBox(a, b), memory: this.memory };
  }

  grow() { this.select(nav.up(this.nav, this.sel)); }

  /** at an edge nothing happens: it isn't a mistake */
  shrink() { const id = nav.down(this.nav, this.sel); if (id) this.select(id); }

  /** pick the run of neighbours from anchor to head (one sum or product) */
  selectRange(anchor: string, head: string, quiet = false) {
    const base = this.base;
    const g = group(base, [anchor, head]);
    if ('error' in g) return this.refuse(g.error);
    if (g.eq === base) { this.grouped = null; return this.select(g.id, quiet); }
    this.grouped = { base, eq: g.eq, id: g.id, anchor, head };
    this.sel = null;
    this.renderMain(null);
    this.select(g.id, quiet);
  }

  /** Alt + ← →: the equation to the left / right on the sheet */
  stepEquation(d: -1 | 1) {
    if (this.slots.length < 2) return this.refuse('Only one equation. Press n to add another.');
    const j = this.cur + d;
    if (j < 0 || j >= this.slots.length) return; // already the first or last
    this.switchTo(j);
  }

  /** which sides a highlight could still grow toward (Ctrl + ← →) */
  growable(id: string): { l: boolean; r: boolean } {
    const g = this.grouped && id === this.grouped.id ? this.grouped : null;
    const first = g ? g.anchor : id;
    const path = findPath(this.base, first);
    const parent = path && path.length > 2 ? path[path.length - 2] : null;
    if (!parent || (parent.k !== 'add' && parent.k !== 'mul')) return { l: false, r: false };
    const sibs = this.visibleKids(parent);
    const ends = (g ? [g.anchor, g.head] : [id]).map(x => sibs.findIndex(k => k.id === x));
    if (ends.some(i => i < 0)) return { l: false, r: false };
    return { l: Math.min(...ends) > 0, r: Math.max(...ends) < sibs.length - 1 };
  }

  /** Ctrl + ← →: add the next neighbour on that side to the highlight */
  growEdge(dir: -1 | 1) {
    if (!this.sel || this.sel === 'eq') return this.sideways(dir);
    const g = this.grouped && this.sel === this.grouped.id ? this.grouped : null;
    const first = g ? g.anchor : this.sel;
    const path = findPath(this.base, first);
    const parent = path && path.length > 2 ? path[path.length - 2] : null;
    if (!parent || (parent.k !== 'add' && parent.k !== 'mul')) return this.refuse('Ctrl + arrows grow a highlight over neighbouring terms of a sum, or factors of a product.');
    const sibs = this.visibleKids(parent);
    const ends = (g ? [g.anchor, g.head] : [this.sel]).map(id => sibs.findIndex(k => k.id === id));
    let lo = Math.min(...ends), hi = Math.max(...ends);
    if (dir < 0) lo--; else hi++;
    if (lo < 0 || hi >= sibs.length) return; // the end of the sum: nothing to add, and not a mistake
    sound.tick(2 + (hi - lo));
    this.selectRange(sibs[lo].id, sibs[hi].id);
    $('sel').animate([{ boxShadow: `${dir < 0 ? '-6px' : '6px'} 0 0 -1px var(--sel), 0 0 0 1.5px var(--sel)` }, { boxShadow: '0 0 0 1.5px var(--sel)' }], { duration: ms(260), easing: 'ease-out' });
  }

  /** e: solve. Aimed at a variable (or only one variable): straight to the answer; otherwise pick one */
  solveKey() {
    // calculus to work out, or a u to put back
    if (hasCalc(this.eq) || Object.keys(this.substitutions()).some(u => symbols(this.eq).includes(u))) return this.finishCalculus();
    if (relOf(this.eq) === '=' && (isVector(this.eq.lhs) || isVector(this.eq.rhs))) return this.splitComponents();
    if (odeKind(this.eq)) return this.solveOde();
    if (relOf(this.eq) === 'expr') {
      // nothing to solve in a lone expression: e tidies it as far as it goes instead
      const f = formsFor(this.eq, null).find(x => x.name === 'simplified' || x.name === 'expanded');
      if (f) { this.flush(); return this.apply(f, 1.15); }
      return this.refuse('An expression has nothing to solve, and this one is already tidy. Tab shows its other forms.');
    }
    const vars = symbols(this.eq);
    const aimed = this.sel && this.sel !== 'eq' ? find(this.eq, this.sel) : null;
    const v = aimed?.k === 'sym' && vars.includes(aimed.name) ? aimed.name : vars.length === 1 ? vars[0] : null;
    if (v) return this.solveFor(v);
    if (!vars.length) return this.refuse('No variable to solve for.');
    this.openHub(true);
    this.askVar();
  }

  /** Mouse box: whatever the box touches is picked, as a run of neighbours when it can be */
  boxSelect(x0: number, y0: number, x1: number, y1: number, quiet: boolean) {
    const [l, r, t, b] = [Math.min(x0, x1), Math.max(x0, x1), Math.min(y0, y1), Math.max(y0, y1)];
    const base = this.base;
    const hit: string[] = [];
    walk(base, n => {
      // only the smallest pieces count; what they share decides the pick. Otherwise a box
      // over most of a side would cover the side's own box and take all of it.
      if (n.k === 'eq' || children(n).length) return;
      const q = this.stage.box(n.id);
      if (!q) return;
      // mostly inside the box counts
      const ov = Math.max(0, Math.min(r, q.x + q.w) - Math.max(l, q.x)) * Math.max(0, Math.min(b, q.y + q.h) - Math.max(t, q.y));
      if (ov >= 0.6 * q.w * q.h) hit.push(n.id);
    });
    if (!hit.length) return this.select(null, quiet);
    const paths = hit.map(id => findPath(base, id)!);
    let depth = 0;
    while (paths.every(p => p.length > depth + 1 && p[depth + 1] === paths[0][depth + 1])) depth++;
    const lca = paths[0][depth];
    if (lca.k === 'eq') return this.select('eq', quiet);
    if (lca.k !== 'add' && lca.k !== 'mul') return this.select(lca.id, quiet);
    const kids = this.visibleKids(lca);
    const touched = kids.filter(k => paths.some(p => p[depth + 1] === k));
    if (paths.some(p => p.length === depth + 1) || touched.length === kids.length) return this.select(lca.id, quiet);
    this.selectRange(touched[0].id, touched[touched.length - 1].id, quiet);
  }

  pointerDown(e: MouseEvent) {
    if (e.button !== 0) return;
    const host = $('stage').getBoundingClientRect();
    this.drag = { x: e.clientX - host.left, y: e.clientY - host.top, on: false };
    const box = $('marquee');
    const move = (m: MouseEvent) => {
      const d = this.drag;
      if (!d) return;
      const x = m.clientX - host.left, y = m.clientY - host.top;
      if (!d.on && Math.hypot(x - d.x, y - d.y) < 5) return;
      if (!d.on) { d.on = true; this.closeModes(); box.hidden = false; }
      Object.assign(box.style, { left: `${Math.min(x, d.x)}px`, top: `${Math.min(y, d.y)}px`, width: `${Math.abs(x - d.x)}px`, height: `${Math.abs(y - d.y)}px` });
      this.boxSelect(d.x, d.y, x, y, true);
    };
    const up = (u: MouseEvent) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const d = this.drag;
      this.drag = null;
      box.hidden = true;
      if (!d) return;
      if (!d.on) return this.click(e);
      sound.tick(2);
      this.renderHints();
      void u;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  closeModes() {
    if (this.mode === 'write') this.cancelEdit();
    if (this.mode === 'op') this.closeOp();
    if (this.mode === 'hub') this.closeHub(true);
    if (this.mode === 'fnpal' || this.mode === 'fnask') this.closePal(true);
    if (this.mode !== 'solve') this.setMode('solve');
  }

  sideways(dir: -1 | 1) { const id = nav.side(this.nav, this.sel, dir); if (id) this.select(id); }

  toggleSide() { this.select(nav.flip(this.nav, this.sel, n => this.dive(n))); }

  dive(n: Node): Node {
    let cur = n;
    while (!this.stage.box(cur.id)) { const k = children(cur)[0]; if (!k) break; cur = k; }
    return cur;
  }

  showLabels() {
    const eq = this.eq;
    const nodes: { id: string; r: Rect; outer: boolean }[] = [];
    const seen = new Set<string>();
    const visit = (n: Node, parent: Node | null) => {
      const r = this.stage.box(n.id);
      const kids = this.visibleKids(n);
      if (r && parent && !(parent.k === 'eq' && n.k === 'add')) {
        const sig = [r.x, r.y, r.w, r.h].map(Math.round).join(',');
        const outer = parent.k === 'eq' || parent.k === 'add';
        if (!seen.has(sig)) { seen.add(sig); nodes.push({ id: n.id, r, outer }); }
      }
      kids.forEach(k => visit(k, n));
    };
    visit(eq, null);
    nodes.sort((a, b) => (a.outer === b.outer ? a.r.x - b.r.x : a.outer ? -1 : 1));
    const codes = nodes.length <= LABEL_CHARS.length
      ? [...LABEL_CHARS].slice(0, nodes.length)
      : nodes.map((_, i) => LABEL_CHARS[Math.floor(i / 9) % 26] + 'asdfghjkl'[i % 9]);
    const host = $('labels');
    host.replaceChildren();
    this.labels.clear();
    nodes.forEach((n, i) => {
      const k = document.createElement('kbd');
      k.className = 'label ' + (n.outer ? 'above' : 'below');
      k.textContent = codes[i];
      k.style.left = `${n.r.x + n.r.w / 2}px`;
      k.style.top = `${n.outer ? n.r.y - 6 : n.r.y + n.r.h + 6}px`;
      k.style.animationDelay = `${i * 10}ms`;
      host.append(k);
      this.labels.set(codes[i], n.id);
    });
    this.typed = '';
    this.setMode('labels');
    sound.labels();
    this.renderHints();
  }

  clearLabels() { $('labels').replaceChildren(); this.labels.clear(); this.typed = ''; }

  labelKey(ch: string) {
    this.typed += ch;
    const hit = this.labels.get(this.typed);
    if (hit) { this.setMode('solve'); this.select(hit); this.renderHints(); return; }
    const partial = [...this.labels.keys()].filter(k => k.startsWith(this.typed));
    if (!partial.length) { this.setMode('solve'); this.refuse('No target with that letter.'); return; }
    $('labels').querySelectorAll('kbd').forEach(k => k.classList.toggle('dim', !k.textContent!.startsWith(this.typed)));
  }

  /* ---------------- writing ---------------- */

  edit(blank: boolean) {
    const input = $<HTMLInputElement>('input');
    this.writing = blank ? 'new' : 'edit';
    this.setMode('write');
    this.sel = null;
    input.value = blank ? '' : toText(this.eq, true);
    input.placeholder = blank && this.slots.length ? `Equation ${this.slots.length + 1}, like x - y = 1` : 'Type an equation, like x^2 + 5x + 6 = 0';
    input.focus();
    input.select();
    $('input-error').textContent = '';
    this.renderAll(null);
  }

  cancelEdit() {
    if (!this.slots.length) return;
    this.preview = null;
    this.writing = 'edit';
    $<HTMLInputElement>('input').blur();
    this.setMode('solve');
    this.renderAll(null);
  }

  onType() {
    const src = $<HTMLInputElement>('input').value;
    clearTimeout(this.typingTimer);
    const err = $('input-error');
    err.textContent = '';
    const got = livePreview(src);
    $('stage').classList.toggle('preview', !!got && got.partial);
    const kind = got ? ({ '=': 'equation', 'expr': 'expression', 'def': 'function', '≟': 'proof' } as Record<string, string>)[relOf(got.eq)] ?? 'inequality' : '';
    $('input-state').innerHTML = !got ? '' : got.partial ? '<span class="wip">keep going…</span>' : `<span class="ok">✓ ${kind}</span><kbd>Enter</kbd>`;
    if (!got) {
      // nothing readable yet: keep what was there, explain only if you stop typing
      if (src.trim()) this.typingTimer = window.setTimeout(() => { try { parseEquation(src, true); } catch (e) { err.textContent = (e as Error).message; } }, 900);
      return;
    }
    this.preview = got.eq;
    this.renderMain(null);
    this.graph.draw(this.preview, false);
    this.renderRail();
    if (got.partial) this.typingTimer = window.setTimeout(() => { try { parseEquation(src, true); } catch (e) { err.textContent = (e as Error).message; } }, 1400);
  }

  /* ---------------- pop-ups and theme ---------------- */

  /** sit a floating panel above the aimed piece (or the equation), inside the stage */
  place(host: HTMLElement) {
    const anchor = (this.sel && this.sel !== 'eq' ? this.stage.box(this.sel) : null) ?? this.stage.box('eq');
    const W = $('stage').clientWidth;
    const hw = host.offsetWidth, hh = host.offsetHeight;
    let x = anchor ? anchor.x + anchor.w / 2 - hw / 2 : (W - hw) / 2;
    x = Math.max(12, Math.min(W - hw - 12, x));
    let y = anchor ? anchor.y - hh - 26 : 40;
    if (y < 8) y = anchor ? anchor.y + anchor.h + 22 : 8;
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
  }

  bubble(text: string, bad: boolean, id: string | null = this.sel) {
    const r = (id ? this.stage.box(id) : null) ?? this.stage.box('eq');
    if (!r) return;
    const b = document.createElement('div');
    b.className = 'bubble' + (bad ? ' bad' : '');
    b.textContent = text;
    $('stage').append(b);
    const W = $('stage').clientWidth;
    const x = Math.max(12 + b.offsetWidth / 2, Math.min(W - 12 - b.offsetWidth / 2, r.x + r.w / 2));
    b.style.left = `${x}px`;
    b.style.top = `${r.y - 14}px`;
    const life = bad ? 2600 : 1100;
    b.animate([{ opacity: 0, transform: 'translate(-50%, -80%) scale(.92)' }, { opacity: 1, transform: 'translate(-50%, -100%)' }], { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
    setTimeout(() => {
      const a = b.animate([{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, -130%)' }], { duration: 260, fill: 'forwards' });
      a.onfinish = () => b.remove();
    }, life);
  }

  toggleTheme() {
    setPref('theme', isDark() ? 'light' : 'dark');
    sound.tick(2);
  }

  themeLabel() {
    $('theme').querySelector('span')!.textContent = isDark() ? 'Light mode' : 'Dark mode';
  }

  toggleFlash() {
    setPref('speed', prefs.speed === 'flash' ? 'standard' : 'flash');
    sound.tick(prefs.speed === 'flash' ? 4 : 0);
    this.say(prefs.speed === 'flash' ? '⚡ Flash mode: every animation runs about three times faster.' : 'Standard speed.');
  }

  flashLabel() {
    const on = prefs.speed === 'flash';
    $('flash').classList.toggle('on', on);
    $('flash').setAttribute('aria-pressed', String(on));
  }

  /** a setting changed (from the settings panel or a shortcut): show it everywhere */
  prefsChanged(k: string) {
    if (k === 'theme') { applyTheme(); this.themeLabel(); }
    if (k === 'look') applyLook();
    if (k === 'speed') { applySpeed(); this.flashLabel(); }
    if (k === 'graphAt') applyPanels();
    if (k === 'muted') { $('sound').classList.toggle('off', prefs.muted); $('sound').setAttribute('aria-pressed', String(!prefs.muted)); }
    if (['theme', 'look', 'size', 'hints'].includes(k) && this.shown) { this.stage.clear(); this.renderAll(null); }
  }

}

/** the methods that live in their own files */
type Part<M> = { [K in keyof M]: M[K] };
export interface App extends Part<typeof opsPart>, Part<typeof hubPart>, Part<typeof fnpalPart>, Part<typeof solvingPart>, Part<typeof keysPart>, Part<typeof persistPart>, Part<typeof calcPart> {}
for (const part of [opsPart, hubPart, fnpalPart, solvingPart, keysPart, persistPart, calcPart]) Object.assign(App.prototype, part);
