import { Eq, Node, find, findPath, children, bumpIds, symbols, relOf, isIneq, DEFS, add, key } from '../engine/ast';
import { solveInequality } from '../engine/inequality';
import { isIdentity, isProved, unfold, inverseFunction } from '../engine/goals';
import { polyOf } from '../engine/rewrite';
import { setDomains, Domain } from '../engine/moves';
import { parseEquation } from '../engine/parse';
import { toText } from '../engine/print';
import { applyMove, applyBothChecked, checked, direction, isErr, MoveName, MoveOk, MoveResult, solvedFor } from '../engine/moves';
import { absOf, coefOf, negate } from '../engine/terms';
import { formsFor, Form } from '../engine/forms';
import { moveAny, peel, wrapBoth, inverseOf, FN_TABS, WRAPS, WrapItem, isolate, substitute, splitCases, simplifySpot, Spot, eliminate, tidy } from '../engine/techniques';
import { parseExpr } from '../engine/parse';
import { evaluate } from '../engine/ast';
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
import { initPanels, applyPanels, cycleGraph } from './panels';
import { Library } from './library';
import { Settings } from './settings';

/** one step of work: what it is, the rule it used, and whether it is reversible (⇔) or one-way (⇒) */
interface Step { eq: Eq; label: string; conditions: string[]; auto?: boolean; rule?: string; dir?: '⇔' | '⇒'; answer?: string }
/** origin: the equation a case came from, to check answers against. bad: why its answer fails */
export interface Slot { steps: Step[]; at: number; sel: string | null; origin?: Eq; bad?: string }
type Mode = 'write' | 'solve' | 'labels' | 'op' | 'hub' | 'fnpal' | 'fnask';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** single keys that act straight away (aim + key = move) */
const MOVE_KEYS: { key: string; name: MoveName | 'any'; verb: string; pitch: number }[] = [
  { key: 'm', name: 'any', verb: 'move across', pitch: 1 },
  { key: 's', name: 'simplify', verb: 'simplify', pitch: 1.2 },
  { key: 'd', name: 'distribute', verb: 'distribute', pitch: 1.1 },
  { key: 'x', name: 'swap', verb: 'swap sides', pitch: 0.8 },
];

/** typing an operator starts a both-sides operation; no Shift needed (= is +, . is ×) */
const OP_KEYS: Record<string, string> = { '=': '+', '+': '+', '-': '-', '.': '*', '*': '*', '/': '/' };
const OP_SHOW: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

const LABEL_CHARS = 'asdfghjklqwertyuiopzxcvbnm';
const DOMAIN_TEXT: Record<Domain, string> = { real: 'real number', positive: 'positive', nonneg: 'zero or more', integer: 'whole number' };

interface Tech { key: string; label: string; ok: boolean; run: () => void }
interface Hub { forms: Form[]; techs: Tech[]; i: number; sticky: boolean; moved: boolean; awaitVar: boolean }

export class App {
  slots: Slot[] = [];
  cur = 0;
  mode: Mode = 'write';
  private memory = new Map<string, string>(); // parent id → child we came up from
  private stage: Stage;
  private graph: Graph;
  private labels = new Map<string, string>();
  private typed = '';
  private message: { text: string; bad: boolean } | null = null;
  private messageTimer = 0;
  private preview: Eq | null = null;
  private peek: Eq | null = null;
  private hub: Hub | null = null;
  private typingTimer = 0;
  private writing: 'new' | 'edit' = 'edit';
  private pending: { timer: number; run: () => void }[] = [];
  private deleteArmed = 0;
  private looseSel: string | null = null;
  /** while the tour runs, your own session isn't overwritten */
  noSave = false;
  /** what each variable may be (real by default); moves and answers respect it */
  domains: Record<string, Domain> = {};
  /** a partial selection: the current step with a run of terms wrapped in a group node */
  private grouped: { base: Eq; eq: Eq; id: string; anchor: string; head: string } | null = null;
  private drag: { x: number; y: number; on: boolean } | null = null;
  tour: Tour;
  library: Library;
  settings: Settings;
  /** the workspace (card) being worked on */
  workId = '';
  private resetArmed = 0;
  /** a key was pressed while Tab or f was held: letting go then closes the menu instead of pinning it open */
  private chordUsed = false;

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
  private eqOf(i: number): Eq { const s = this.slots[i]; return s.steps[s.at].eq; }

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
  private slotTag(i: number, e: Eq): { text: string; cls: string } | null {
    const sl = this.slots[i], st = sl.steps[sl.at];
    if (relOf(e) === '≟') return isProved(e) ? { text: '∎', cls: 'solved' } : { text: 'prove', cls: 'goal' };
    if (relOf(e) === 'def') return { text: 'definition', cls: 'goal' };
    if (st.answer) return { text: st.answer, cls: 'solved ans' };
    if (solvedFor(e)) return sl.bad ? { text: 'not a solution', cls: 'solved no' } : { text: '✓', cls: 'solved' };
    return null;
  }

  /** The sheet: the equation you work on gets the room; every other one sits small in a
   *  dock at the top right, in order, one key (or click, or Alt + ← →) away. */
  renderLanes() {
    const board = $('board'), dock = $('dock');
    const before = new Map<string, DOMRect>();
    dock.querySelectorAll<HTMLElement>('[data-lane]').forEach(el => before.set(el.dataset.lane!, el.getBoundingClientRect()));
    const row = $('dock-row');
    row.replaceChildren();
    const adding = this.mode === 'write' && this.writing === 'new' && this.slots.length > 0;
    const active = adding ? this.slots.length : this.cur;
    const n = this.slots.length + (adding ? 1 : 0);
    board.classList.toggle('multi', n > 1);
    $('stage').dataset.n = String(active + 1);
    dock.hidden = n < 2;
    if (n < 2) return;
    // variables the aimed piece (or the whole equation) uses: equations that share them are linked
    const aimed = this.sel && this.sel !== 'eq' ? find(this.eq, this.sel) : null;
    const mine = this.shown ? symbols(aimed ?? this.shown) : [];
    let linkedHint = '';
    for (let i = 0; i < this.slots.length; i++) {
      if (i === active) continue;
      const e = this.eqOf(i);
      const card = document.createElement('button');
      card.className = 'lane';
      card.dataset.lane = String(i);
      card.title = `Equation ${i + 1} (Alt + ← →, or ${i + 1})`;
      const head = document.createElement('span');
      head.className = 'lane-head';
      head.innerHTML = `<kbd>${i + 1}</kbd>`;
      const tag = this.slotTag(i, e);
      if (tag) { const t = document.createElement('span'); t.className = 'lane-tag ' + tag.cls; t.textContent = tag.text; head.append(t); }
      const math = document.createElement('span');
      math.className = 'lane-math';
      const shared = symbols(e).filter(v => mine.includes(v));
      if (shared.length && !adding) {
        card.classList.add(aimed ? 'linked' : 'shares');
        if (aimed?.k === 'sym' && !linkedHint) linkedHint = `<kbd>Tab</kbd>+<kbd>${i + 1}</kbd> puts in <i>${varHtml(aimed.name)}</i> from (${i + 1})`;
      }
      card.append(head, math);
      card.addEventListener('mousedown', ev => { ev.stopPropagation(); ev.preventDefault(); this.switchTo(i); });
      row.append(card);
      let lay = layout(e, 19);
      const f = Math.min(1, 190 / lay.w, 40 / (lay.asc + lay.desc));
      if (f < 1) lay = layout(e, Math.max(8, 19 * f));
      const box = document.createElement('span');
      box.className = 'mini';
      box.style.width = lay.w + 'px';
      box.style.height = lay.asc + lay.desc + 'px';
      math.append(box);
      new Stage(box).show(lay, 0, 0, null);
    }
    $('dock-hint').innerHTML = linkedHint;
    board.style.setProperty('--dock-w', `${dock.offsetWidth}px`);
    // cards slide to their new places (FLIP)
    dock.querySelectorAll<HTMLElement>('[data-lane]').forEach(el => {
      const was = before.get(el.dataset.lane!);
      if (!was) return;
      const now = el.getBoundingClientRect();
      const dx = was.left - now.left, dy = was.top - now.top;
      if (Math.abs(dx) + Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: ms(260), easing: 'cubic-bezier(.2,.8,.16,1)' });
    });
  }

  /** a copy of another equation flies into this one (substitute, add an equation) */
  private flyFrom(j: number) {
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
    if (this.mode === 'hub') { host.innerHTML = `<span class="aside">Holding <kbd>Tab</kbd>: press a key to use it now, or <kbd>←</kbd><kbd>→</kbd> to browse forms and release to apply.</span>`; return; }
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
    parts.push(`<span class="hint"><kbd>=</kbd><kbd>-</kbd><kbd>.</kbd><kbd>/</kbd> both sides</span><span class="hint"><kbd>Tab</kbd> algebra</span><span class="hint"><kbd>e</kbd> solve</span><span class="hint"><kbd>f</kbd> functions</span>`);
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
    const fresh: Slot = { steps: [{ eq, label: 'start', conditions: [] }], at: 0, sel: null };
    if (this.writing === 'new' || !this.slots.length) {
      if (this.slots.length >= 9) { this.refuse('Nine equations is the limit for now.'); return; }
      this.slots.push(fresh);
      this.cur = this.slots.length - 1;
    } else this.slots[this.cur] = fresh;
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

  private entrance() {
    const els = [...$('stage').querySelectorAll('.g')];
    els.forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: i * 14, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
  }

  apply(r: MoveResult, pitch = 1, opts: { quietLabel?: boolean } = {}) {
    if (isErr(r)) { this.refuse(r.error); return false; }
    r = { ...r, eq: ungroup(r.eq) };
    this.grouped = null;
    const before = this.eq;
    const wasSolved = solvedFor(before);
    const conditions = [...new Set([...this.step.conditions, ...(r.conditions ?? [])])];
    this.steps = this.steps.slice(0, this.at + 1);
    let answer = r.answer;
    const sv = solvedFor(r.eq);
    if (!answer && isIneq(r.eq) && sv && symbols(r.eq).length === 1) { const s = solveInequality(r.eq, sv); if (!('error' in s)) answer = s.text; }
    this.steps.push({ eq: r.eq, label: r.label, conditions, auto: r.auto, rule: r.rule ?? r.label, dir: direction(r), answer });
    this.at++;
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
  private later(ms: number, run: () => void) {
    const item = { timer: 0, run };
    item.timer = window.setTimeout(() => { this.pending = this.pending.filter(p => p !== item); run(); }, ms);
    this.pending.push(item);
  }

  private flush() {
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
    if (this.at === 0) { this.refuse('Nothing to undo. This is the original.'); return; }
    while (this.at > 1 && this.steps[this.at].auto) this.at--;
    this.at--;
    this.afterJump();
  }

  redo() {
    if (this.at >= this.steps.length - 1) { this.refuse('Nothing to redo.'); return; }
    this.at++;
    while (this.at < this.steps.length - 1 && this.steps[this.at + 1].auto) this.at++;
    this.afterJump();
  }

  jump(i: number) {
    if (i === this.at) return;
    this.at = i;
    this.afterJump();
  }

  private afterJump() {
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
    if (this.slots.length > 1) this.renderLanes();
    this.renderHints();
    this.tour.check();
  }

  /* ---------------- simplification on offer ---------------- */

  private spot: Spot | null = null;

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
    this.slots.splice(this.cur, 1);
    this.cur = Math.min(this.cur, this.slots.length - 1);
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

  parentOf(id: string): Node | null {
    const p = findPath(this.eq, id);
    return p && p.length > 1 ? p[p.length - 2] : null;
  }

  sameBox(a: string, b: string) {
    const r1 = this.stage.box(a), r2 = this.stage.box(b);
    return !!r1 && !!r2 && Math.abs(r1.x - r2.x) < 0.5 && Math.abs(r1.w - r2.w) < 0.5 && Math.abs(r1.y - r2.y) < 0.5 && Math.abs(r1.h - r2.h) < 0.5;
  }

  grow() {
    if (!this.sel) return this.select('eq');
    let id = this.sel;
    let p = this.parentOf(id);
    while (p && this.sameBox(p.id, id)) { this.memory.set(p.id, id); id = p.id; p = this.parentOf(id); }
    if (!p) return this.select('eq');
    this.memory.set(p.id, id);
    this.select(p.id);
  }

  shrink() {
    if (!this.sel) return this.select(this.eq.lhs.id);
    let n = find(this.eq, this.sel)!;
    for (;;) {
      const kids = this.visibleKids(n);
      if (!kids.length) return this.refuse('Already at the smallest piece.');
      const remembered = this.memory.get(n.id);
      const next = kids.find(k => k.id === remembered) ?? kids[0];
      if (this.sameBox(next.id, n.id)) { n = next; continue; }
      return this.select(next.id);
    }
  }

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
    if (j < 0 || j >= this.slots.length) return this.refuse(d < 0 ? 'This is the first equation.' : 'This is the last equation. Press n to add one.');
    this.switchTo(j);
  }

  /** which sides a highlight could still grow toward (Ctrl + ← →) */
  private growable(id: string): { l: boolean; r: boolean } {
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
    if (lo < 0 || hi >= sibs.length) return this.refuse(dir > 0 ? 'Nothing further right in this sum.' : 'Nothing further left in this sum.');
    sound.tick(2 + (hi - lo));
    this.selectRange(sibs[lo].id, sibs[hi].id);
    $('sel').animate([{ boxShadow: `${dir < 0 ? '-6px' : '6px'} 0 0 -1px var(--sel), 0 0 0 1.5px var(--sel)` }, { boxShadow: '0 0 0 1.5px var(--sel)' }], { duration: ms(260), easing: 'ease-out' });
  }

  /** e: solve. Aimed at a variable (or only one variable): straight to the answer; otherwise pick one */
  solveKey() {
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

  private pointerDown(e: MouseEvent) {
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

  private closeModes() {
    if (this.mode === 'write') this.cancelEdit();
    if (this.mode === 'op') this.closeOp();
    if (this.mode === 'hub') this.closeHub(true);
    if (this.mode === 'fnpal' || this.mode === 'fnask') this.closePal(true);
    if (this.mode !== 'solve') this.setMode('solve');
  }

  sideways(dir: -1 | 1) {
    if (!this.sel || this.sel === 'eq') {
      const firstOrLast = (n: Node): Node => { const k = this.visibleKids(n); return n.k === 'add' && k.length ? (dir > 0 ? k[0] : k[k.length - 1]) : n; };
      return this.select(firstOrLast(dir > 0 ? this.eq.lhs : this.eq.rhs).id);
    }
    let id = this.sel;
    let climbed = 0;
    for (;;) {
      const p = this.parentOf(id);
      if (!p) return this.refuse(dir > 0 ? 'Nothing further right.' : 'Nothing further left.');
      const sibs = this.visibleKids(p);
      const i = sibs.findIndex(s => s.id === id);
      const j = i + dir;
      // top and bottom of a fraction aren't left/right of each other: step out instead (Tab flips between them)
      if (p.k !== 'frac' && j >= 0 && j < sibs.length) {
        let n = sibs[j];
        for (let d = 0; d < climbed; d++) {
          const ks = this.visibleKids(n);
          if (!ks.length || ['frac', 'pow', 'sqrt', 'fn'].includes(n.k)) break;
          n = dir > 0 ? ks[0] : ks[ks.length - 1];
        }
        return this.select(n.id);
      }
      id = p.id;
      // leaving a fraction, power, root or function lands on the next piece itself, not deep inside it
      climbed = ['frac', 'pow', 'sqrt', 'fn'].includes(p.k) ? 0 : climbed + 1;
    }
  }

  toggleSide() {
    // inside a fraction, Tab flips between its top and bottom; otherwise between the two sides
    const path = this.sel && this.sel !== 'eq' ? findPath(this.eq, this.sel) : null;
    if (path) {
      for (let i = path.length - 2; i >= 1; i--) {
        const f = path[i];
        if (f.k !== 'frac') continue;
        const inTop = path[i + 1] === f.num;
        const target = inTop ? f.den : f.num;
        this.memory.set(f.id, target.id);
        return this.select(this.dive(target).id);
      }
    }
    const onLeft = this.sel && this.sel !== 'eq' && findPath(this.eq, this.sel)?.[1] === this.eq.lhs;
    this.select(onLeft ? this.eq.rhs.id : this.eq.lhs.id);
  }

  /** the outermost piece with its own box (a number in a product with a hidden 1 etc.) */
  private dive(n: Node): Node {
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

  /* ---------------- both sides: type an operator, see it live, Enter ---------------- */

  /** What you most likely want to apply, given what is aimed: the thing that cancels it. */
  private prefill(op: string): string {
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

  openOp(op: string) {
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

  private opResult(): MoveResult {
    const v = $<HTMLInputElement>('op-input').value.trim();
    if (v.length <= 1) return { error: 'Type what to apply, like 7 or 3x.' };
    return applyBothChecked(this.eq, v, this.slots.map((_, j) => this.eqOf(j)));
  }

  onOpType() {
    const r = this.opResult();
    const v = $<HTMLInputElement>('op-input').value.trim();
    const op = ({ '−': '-', '×': '*', '·': '*', '÷': '/' } as Record<string, string>)[v[0]] ?? v[0];
    $('op-sym').textContent = OP_SHOW[op] ? `${OP_SHOW[op]} both sides` : 'both sides';
    $('op').classList.toggle('bad', isErr(r) && v.length > 1);
    $('op-note').textContent = isErr(r) ? (v.length > 1 ? r.error : 'start with + − × ÷') : r.conditions?.length ? `needs ${r.conditions.join(', ')}` : 'Enter to apply';
    this.peek = isErr(r) ? null : r.eq;
    this.renderMain({ quick: true });
  }

  closeOp() {
    $('op').hidden = true;
    $<HTMLInputElement>('op-input').blur();
    const had = !!this.peek;
    this.peek = null;
    this.setMode('solve');
    if (had) this.renderMain({ quick: true });
    this.renderHints();
  }

  /* ---------------- E: techniques and forms ---------------- */

  private techniques(): Tech[] {
    const eq = this.eq;
    const aimed = this.sel && this.sel !== 'eq' ? find(eq, this.sel) : null;
    const vars = symbols(eq);
    const aimVar = aimed?.k === 'sym' && vars.includes(aimed.name) ? aimed.name : vars.length === 1 ? vars[0] : null;
    const out: Tech[] = [{
      key: 'i', label: aimVar ? `solve for ${aimVar}` : 'solve for…', ok: vars.length > 0,
      run: () => (aimVar ? this.solveFor(aimVar) : this.askVar()),
    }];
    out.push({ key: 'a', label: 'split into cases', ok: !!splitCases(eq), run: () => this.split() });
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

  openHub(sticky: boolean) {
    this.flush();
    const forms = formsFor(this.eq, this.sel);
    this.hub = { forms, techs: this.techniques(), i: 0, sticky, moved: false, awaitVar: false };
    this.chordUsed = false;
    this.setMode('hub');
    sound.labels();
    this.renderHub();
    this.renderHints();
  }

  private askVar() {
    if (!this.hub) return;
    this.hub.awaitVar = true;
    this.hub.sticky = true;
    sound.tick(2);
    this.renderHub();
  }

  hubKey(e: KeyboardEvent) {
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
    const known = 'zdxswctolpr';
    if (known.includes(k)) return this.refuse('That form doesn\'t apply to what is aimed.');
  }

  peekAt() {
    const h = this.hub!;
    const form = h.forms[h.i];
    this.peek = form.eq;
    this.renderMain({ quick: true, absorbs: form.hints.absorbs, flights: form.hints.flights });
    this.graph.draw(this.peek, true);
    this.renderHub();
  }

  applyForm() {
    const h = this.hub;
    if (!h) return;
    const form = h.forms[h.i];
    this.closeHub(false);
    this.apply(form, 1.15);
  }

  closeHub(animateBack: boolean) {
    if (!this.hub) return;
    const peeked = !!this.peek;
    this.hub = null;
    this.peek = null;
    $('forms').hidden = true;
    this.setMode('solve');
    if (animateBack && peeked) { sound.undo(); this.renderAll({ quick: true }, true); }
    else this.renderHints();
  }

  renderHub() {
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

  /* ---------------- F: functions on both sides ---------------- */

  /** tab and item being browsed; moved = the person browsed with the arrows */
  private pal = { tab: 0, i: 0, moved: false, sticky: false, ask: null as WrapItem | null };

  openPal(sticky: boolean) {
    this.flush();
    const inv = inverseOf(this.peelSide());
    const tab = inv ? FN_TABS.findIndex(t => t.items.some(x => x.f === inv.f)) : -1;
    this.pal = { tab: Math.max(0, tab), i: 0, moved: false, sticky, ask: null };
    this.chordUsed = false;
    this.setMode('fnpal');
    sound.labels();
    this.renderPal();
    this.renderHints();
  }

  private renderPal() {
    const P = this.pal;
    const host = $('forms');
    host.replaceChildren();
    host.className = 'forms hub pal';
    const inv = inverseOf(this.peelSide());
    const pe = peel(this.eq, this.sel);
    const lead = document.createElement('div');
    lead.className = 'hub-row';
    lead.innerHTML = `<button class="chip lead${isErr(pe) ? ' off' : ''}" data-k="i"><kbd>i</kbd>${isErr(pe) ? 'inverse: nothing to undo here' : `inverse: ${escapeHtml(pe.label)}`}</button>`;
    host.append(lead);
    const tabs = document.createElement('div');
    tabs.className = 'pal-tabs';
    tabs.className = 'pal-tabs' + (P.moved ? '' : ' focus');
    tabs.innerHTML = FN_TABS.map((t, j) => `<button class="pal-tab${j === P.tab ? ' on' : ''}" data-tab="${j}">${t.name}</button>`).join('');
    host.append(tabs);
    const row = document.createElement('div');
    row.className = 'hub-row pal-items';
    row.innerHTML = FN_TABS[P.tab].items.map((w, j) => `<button class="chip${inv?.f === w.f ? ' rec' : ''}${P.moved && j === P.i ? ' on' : ''}" data-k="${w.key}"><kbd>${w.key}</kbd><span class="fx">${w.show}</span><span class="pal-name">${w.label}</span></button>`).join('');
    host.append(row);
    if (P.ask) {
      const ask = document.createElement('div');
      ask.className = 'pal-ask';
      ask.innerHTML = `<span>${P.ask.label}: ${P.ask.ask} =</span><input id="pal-input" spellcheck="false" autocomplete="off" aria-label="${P.ask.ask}"><span id="pal-note" class="op-note">type a number, Enter applies</span>`;
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

  private peelSide(): Node {
    const p = this.sel && this.sel !== 'eq' ? findPath(this.eq, this.sel) : null;
    if (p) return p[1];
    return inverseOf(this.eq.lhs) || !inverseOf(this.eq.rhs) ? this.eq.lhs : this.eq.rhs;
  }

  /** what an item would do, tidied, for the live preview */
  private palResult(w: WrapItem, arg?: Node): MoveResult {
    const r = checked(this.eq, wrapBoth(this.eq, w.f, arg));
    return r;
  }

  private palPeek() {
    const P = this.pal;
    const w = FN_TABS[P.tab].items[P.i];
    const r = w.ask ? null : this.palResult(w);
    this.peek = r && !isErr(r) ? r.eq : null;
    this.renderMain({ quick: true });
  }

  palKey(e: KeyboardEvent) {
    const P = this.pal;
    const k = e.key;
    if (k === 'Escape') return this.closePal(true);
    if (e.repeat) return;
    const items = FN_TABS[P.tab].items;
    // arrows only: ← → pick a category, ↓ steps into it, ← → pick a function (live preview), ↑ steps back out
    const dx = k === 'ArrowRight' || k === 'Tab' ? 1 : k === 'ArrowLeft' ? -1 : 0;
    if (dx && !P.moved) { P.tab = (P.tab + dx + FN_TABS.length) % FN_TABS.length; sound.tick(1); return this.renderPal(); }
    if (dx && P.moved) { P.i = (P.i + dx + items.length) % items.length; sound.tick(2); this.renderPal(); return this.palPeek(); }
    if (k === 'ArrowDown' && !P.moved) { P.moved = true; P.i = 0; sound.tick(2); this.renderPal(); return this.palPeek(); }
    if (k === 'ArrowUp' && P.moved) { P.moved = false; sound.tick(1); this.peek = null; this.renderMain({ quick: true }); return this.renderPal(); }
    if (k === 'Enter') { if (P.moved) return this.choose(items[P.i]); P.moved = true; P.i = 0; this.renderPal(); return this.palPeek(); }
    if (k === 'i') return this.palInverse();
    if (k === 'f' || k === 'F') { if (P.sticky) this.closePal(true); return; }
    const w = WRAPS.find(x => x.key === k);
    if (w) return this.choose(w);
  }

  /** on releasing f: apply what was browsed, else keep the menu open */
  palRelease() {
    const P = this.pal;
    if (P.sticky || P.ask) return;
    if (P.moved) return this.choose(FN_TABS[P.tab].items[P.i]);
    P.sticky = true;
    this.renderPal();
  }

  private palInverse() {
    this.closePal(false);
    this.applyTidy(peel(this.eq, this.sel), 0.9);
  }

  private choose(w: WrapItem) {
    if (w.ask) {
      this.pal.ask = w;
      this.pal.sticky = true;
      this.pal.tab = FN_TABS.findIndex(t => t.items.includes(w));
      this.pal.i = FN_TABS[this.pal.tab].items.indexOf(w);
      this.pal.moved = true;
      this.setMode('fnask');
      sound.tick(2);
      this.renderPal();
      return;
    }
    this.closePal(false);
    this.applyTidy(this.palResult(w), 0.9);
  }

  private askArg(): Node | { error: string } {
    const v = $<HTMLInputElement>('pal-input').value.trim();
    if (!v) return { error: 'Type a number.' };
    try { return parseExpr(v); } catch (e) { return { error: (e as Error).message }; }
  }

  private askPreview() {
    const a = this.askArg();
    const r = 'error' in a ? a : this.palResult(this.pal.ask!, a);
    $('pal-note').textContent = isErr(r) ? r.error : 'Enter applies';
    $('pal-note').classList.toggle('bad', isErr(r) && !!$<HTMLInputElement>('pal-input').value.trim());
    this.peek = !isErr(r) ? r.eq : null;
    this.renderMain({ quick: true });
  }

  private askKey(e: KeyboardEvent) {
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

  closePal(animateBack = false) {
    $('forms').hidden = true;
    const peeked = !!this.peek;
    this.peek = null;
    this.setMode('solve');
    if (animateBack && peeked) this.renderAll({ quick: true }, true);
    this.renderHints();
  }

  /** apply a move built outside applyMove (so not yet checked); leftovers are offered as a simplification */
  applyTidy(r: MoveResult, pitch = 1) { this.apply(isErr(r) ? r : checked(this.eq, r), pitch); }

  /* ---------------- techniques ---------------- */

  solveFor(v: string) {
    const rel = relOf(this.eq);
    if (rel === 'expr') { this.refuse('An expression has nothing to solve. Add “= …” to make it an equation.'); return; }
    if (rel === '≟') { this.refuse('This holds for every value, so there is nothing to solve: prove it instead, one side at a time.'); return; }
    if (rel === 'def') { this.refuse('This defines a function. Use it in another equation, or hold Tab + b for its inverse.'); return; }
    if (isIneq(this.eq)) {
      const Q = polyOf(add([this.eq.lhs, negate(this.eq.rhs)]));
      const linear = symbols(this.eq).length === 1 && !!Q && Q.c.length <= 2;
      if (!linear) {
        const s = solveInequality(this.eq, v);
        if ('error' in s) { this.refuse(s.error); return; }
        this.apply({ eq: this.eq, label: 'sign chart', hints: { absorbs: new Map(), flights: [] }, factor: () => 1, answer: s.text, rule: 'sign chart' }, 1.1);
        return;
      }
    }
    const r = isolate(this.eq, v);
    if (!Array.isArray(r)) { this.refuse(r.error); return; }
    if (!r.length) { this.refuse(`Already solved for ${v}.`); return; }
    r.forEach(s => { s.select = null; s.focus = undefined; });
    this.play(r, () => this.afterSolve(v));
  }

  /** after isolating: split into cases and solve each one, or say where it got stuck */
  private afterSolve(v: string) {
    // solving means a finished answer: take what simplifies at the end
    if (solvedFor(this.eq) === v) { const t = tidy(this.eq); if (t && key(t.eq) !== key(this.eq)) this.applyTidy({ ...t, auto: true, label: 'simplify' }, 1.2); return; }
    if (splitCases(this.eq, v)) { this.split(v); return; }
    this.say(`Got as far as I could isolating ${v}. Try a form (hold Tab) or a function (hold f).`, true);
  }

  /** split this equation into cases; the others become new equations. With v, solve every case too. */
  split(v?: string) {
    const c = splitCases(this.eq, v);
    if (!c) { this.refuse('Splitting needs |something| = b, or a product = 0.'); return; }
    if (this.slots.length + c.rest.length > 9) { this.refuse('Nine equations is the limit for now.'); return; }
    const origin = this.slot!.origin ?? this.steps[0].eq;
    const at = this.cur;
    this.apply(c.first, 1.1);
    c.rest.forEach((e, j) => {
      const slot: Slot = { steps: [{ eq: e, label: `case ${j + 2}`, conditions: [...this.step.conditions] }], at: 0, sel: null, origin };
      if (v) {
        const r = isolate(e, v);
        if (Array.isArray(r)) for (const st of r) { slot.steps.push({ eq: st.eq, label: st.label, conditions: [...new Set([...slot.steps[slot.at].conditions, ...(st.conditions ?? [])])], auto: st.auto }); slot.at++; }
      }
      this.slots.splice(at + 1 + j, 0, slot);
      this.judge(at + 1 + j);
    });
    if (!this.slot!.origin) this.slot!.origin = origin;
    this.renderRail();
    this.save();
    const nums = c.rest.map((_, j) => at + 2 + j).join(' and ');
    this.say(`${c.why[0].toUpperCase()}${c.why.slice(1)}: the ${c.rest.length > 1 ? 'others are' : 'other is'} equation ${nums}.`);
    if (v) this.later(ms(450), () => this.solveFor(v));
  }

  /** a solved slot: does its answer work in the equation it came from? */
  private judge(i: number): string | null {
    const slot = this.slots[i];
    const e = slot.steps[slot.at].eq;
    const v = solvedFor(e);
    slot.bad = undefined;
    if (!v) return null;
    const rhs = e.lhs.k === 'sym' && e.lhs.name === v ? e.rhs : e.lhs;
    const origin = slot.origin ?? slot.steps[0].eq;
    if (relOf(origin) !== '=' || relOf(e) !== '=') return null;
    if (symbols(rhs).length || symbols(origin).some(s => s !== v)) return null;
    const x = evaluate(rhs, {});
    const dom = this.domains[v];
    const outside = dom === 'positive' ? !(x > 0) : dom === 'nonneg' ? !(x >= 0) : dom === 'integer' ? Math.abs(x - Math.round(x)) > 1e-9 : false;
    if (outside) { slot.bad = `${v} = ${toText(rhs)} isn't ${DOMAIN_TEXT[dom!]}, so it is left out.`; return slot.bad; }
    const L = evaluate(origin.lhs, { [v]: x }), R = evaluate(origin.rhs, { [v]: x });
    if (Number.isFinite(L) && Number.isFinite(R) && Math.abs(L - R) <= 1e-7 * (1 + Math.abs(L) + Math.abs(R))) return null;
    slot.bad = `${v} = ${toText(rhs)} doesn't work in the original ${toText(origin)}${Number.isFinite(L) && Number.isFinite(R) ? '' : ' (it is undefined there)'}, so it is not a solution.`;
    return slot.bad;
  }

  cycleDomain(v: string) {
    const order: Domain[] = ['real', 'positive', 'nonneg', 'integer'];
    const next = order[(order.indexOf(this.domains[v] ?? 'real') + 1) % order.length];
    if (next === 'real') delete this.domains[v]; else this.domains[v] = next;
    setDomains(this.domains);
    sound.tick(2);
    this.slots.forEach((_, i) => this.judge(i));
    this.renderRail();
    this.save();
    this.say(`${v} is now ${DOMAIN_TEXT[next].replace('number', 'a number').replace('real a number', 'any real number')}. Sign questions and answers follow it.`);
  }

  /** e + b on a definition: a new equation with the inverse function */
  addInverse() {
    const inv = inverseFunction(this.eq);
    if ('error' in inv) { this.refuse(inv.error); return; }
    if (this.slots.length >= 9) { this.refuse('Nine equations is the limit for now.'); return; }
    this.slots.push({ steps: [{ eq: inv, label: 'inverse', conditions: [] }], at: 0, sel: null });
    this.cur = this.slots.length - 1;
    sound.commit();
    this.stage.clear();
    this.renderAll(null);
    this.save();
    const name = inv.lhs.k === 'call' ? inv.lhs.name : 'f⁻¹';
    this.say(`Equation ${this.cur + 1} is ${name}: it undoes ${name.replace('⁻¹', '')}.`);
  }

  /** the function definitions in your equations, for evaluating f(…) everywhere */
  syncDefs() {
    DEFS.clear();
    for (let i = 0; i < this.slots.length; i++) {
      const e = this.eqOf(i);
      if (e.rel === 'def' && e.lhs.k === 'call' && e.lhs.arg.k === 'sym') DEFS.set(e.lhs.name, { param: e.lhs.arg.name, body: e.rhs });
    }
  }

  substituteFrom(j: number) {
    const aimed = this.sel && this.sel !== 'eq' ? find(this.eq, this.sel) : null;
    const r = substitute(this.eq, this.eqOf(j), aimed?.k === 'sym' ? aimed.name : null, `Equation ${j + 1}`);
    if (!isErr(r)) this.flyFrom(j);
    this.applyTidy(r, 1.2);
  }

  /* ---------------- keys ---------------- */

  bind() {
    const input = $<HTMLInputElement>('input');
    input.addEventListener('input', () => this.onType());
    // quick inserts under the box, for what's awkward to type
    const KEYS: [string, string, string][] = [['x²', '^2', 'power'], ['xₙ', '_', 'subscript'], ['√', 'sqrt(', ''], ['a/b', '/', ''], ['|x|', '|', ''], ['≤', '<=', ''], ['≥', '>=', ''], ['π', 'pi', ''], ['f(x) =', 'f(x) = ', '']];
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
      if (e.key !== 'Tab' || this.mode !== 'hub' || !this.hub || this.hub.sticky) return;
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
    });
  }

  /** the smallest piece under a point on the stage */
  private hit(e: MouseEvent): string | null {
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
  private hover(e: MouseEvent) {
    const el = $('hover');
    const id = this.drag || this.mode !== 'solve' ? null : this.hit(e);
    const r = id && id !== this.sel ? this.stage.box(id) : null;
    el.classList.toggle('on', !!r);
    if (r) Object.assign(el.style, { left: `${r.x - 4}px`, top: `${r.y - 3}px`, width: `${r.w + 8}px`, height: `${r.h + 6}px` });
  }

  click(e: MouseEvent) {
    this.closeModes();
    const best = this.hit(e);
    if (best && best === this.sel) return this.grow();
    this.select(best);
  }

  toggleHelp(show = $('help').hidden) { $('help').hidden = !show; }

  /** close the manual, library and settings (a tour starting or ending) */
  closeOverlays() {
    this.toggleHelp(false);
    this.library.close();
    this.settings.close();
    this.closeModes();
  }

  helpTab(tab: string) {
    document.querySelectorAll<HTMLElement>('.help-tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    document.querySelectorAll<HTMLElement>('.help-pane').forEach(p => { p.hidden = p.dataset.pane !== tab; });
    sound.tick(1);
  }
  toggleSound() {
    const m = sound.toggle();
    $('sound').classList.toggle('off', m);
    $('sound').setAttribute('aria-pressed', String(!m));
    this.say(m ? 'Sound off.' : 'Sound on.');
  }

  key(e: KeyboardEvent) {
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
    if (this.mode === 'hub') { e.preventDefault(); if (k !== 'Tab') this.chordUsed = true; return this.hubKey(e); }
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

  /* ---------------- pop-ups and theme ---------------- */

  /** sit a floating panel above the aimed piece (or the equation), inside the stage */
  private place(host: HTMLElement) {
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
  private prefsChanged(k: string) {
    if (k === 'theme') { applyTheme(); this.themeLabel(); }
    if (k === 'look') applyLook();
    if (k === 'speed') { applySpeed(); this.flashLabel(); }
    if (k === 'graphAt') applyPanels();
    if (k === 'muted') { $('sound').classList.toggle('off', prefs.muted); $('sound').setAttribute('aria-pressed', String(!prefs.muted)); }
    if (['theme', 'look', 'size', 'hints'].includes(k) && this.shown) { this.stage.clear(); this.renderAll(null); }
  }

  /* ---------------- persistence ---------------- */

  /** start over with one equation (the tour uses this) */
  loadFresh(src: string) {
    this.slots = []; this.cur = 0; this.writing = 'new';
    this.commit(src, true);
    this.message = null; this.renderHints();
  }

  restoreSlots(slots: Slot[], cur: number) {
    this.slots = slots; this.cur = cur;
    this.setMode('solve');
    this.stage.clear();
    this.renderAll(null);
    this.save();
  }

  save() {
    if (this.noSave) return;
    if (!this.workId || !works.get(this.workId)) this.workId = works.create<Slot>().id;
    works.save<Slot>(this.workId, { slots: this.slots, cur: this.cur, domains: this.domains });
  }

  /** open the workspace you were last in */
  restore(): boolean {
    const id = works.currentId;
    return !!id && this.load(id);
  }

  private load(id: string): boolean {
    try {
      const w = works.get<Slot>(id);
      if (!w || !w.slots.length) return false;
      const slots = JSON.parse(JSON.stringify(w.slots)) as Slot[];
      slots.forEach(sl => { sl.steps.forEach(st => bumpIds(st.eq)); sl.at = Math.min(sl.at, sl.steps.length - 1); sl.sel = null; });
      this.workId = id;
      works.setCurrent(id);
      this.domains = { ...w.domains };
      setDomains(this.domains);
      this.slots = slots;
      this.cur = Math.min(w.cur ?? 0, slots.length - 1);
      this.grouped = null; this.preview = null; this.peek = null;
      this.setMode('solve');
      this.stage.clear();
      this.renderAll(null);
      return true;
    } catch { return false; }
  }

  /** switch to another workspace from the library */
  openWork(id: string) {
    this.save();
    if (!this.load(id)) return;
    sound.commit();
    $('stage').animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: ms(260), easing: 'cubic-bezier(.2,.8,.2,1)' });
    this.say(`Opened ${works.get(id)?.name ?? 'workspace'}.`);
  }

  /** a fresh, empty workspace: type its first equation */
  newWork() {
    this.save();
    const w = works.create<Slot>();
    this.workId = w.id;
    this.slots = []; this.cur = 0; this.domains = {}; setDomains(this.domains);
    this.grouped = null; this.peek = null;
    this.stage.clear();
    this.edit(true);
    this.say(`${w.name}: type the first equation.`);
  }

  /** every equation back to where it started; your steps stay on redo (r) */
  resetWork() {
    if (!this.slots.length) return;
    if (performance.now() - this.resetArmed > 1600) {
      this.resetArmed = performance.now();
      sound.refuse();
      this.say('Press R again to put every equation back at its start. Your steps stay on redo.', true);
      return;
    }
    this.resetArmed = 0;
    this.closeModes();
    this.grouped = null;
    this.slots.forEach(sl => { sl.at = 0; sl.sel = null; });
    sound.undo();
    this.renderAll({ quick: true }, true);
    this.say('Back to the start. Press r to replay your steps.');
    this.save();
  }
}

/** what you've typed so far, drawn even when unfinished: unclosed brackets are closed and a
 *  dangling operator at the end is left off, so "3(x + 2" or "2x + 5 =" still shows */
function livePreview(src: string): { eq: Eq; partial: boolean } | null {
  if (!src.trim()) return null;
  const close = (t: string) => {
    let depth = 0;
    for (const c of t) { if (c === '(') depth++; else if (c === ')') depth = Math.max(0, depth - 1); }
    const bars = (t.match(/\|/g) ?? []).length % 2;
    return t + ')'.repeat(depth) + (bars ? '|' : '');
  };
  let t = src;
  for (let i = 0; i < 16 && t.trim(); i++) {
    for (const cand of i === 0 ? [t, close(t)] : [close(t)]) {
      try { return { eq: parseEquation(cand, true), partial: cand !== src }; } catch { /* keep trimming */ }
    }
    t = t.trimEnd().slice(0, -1);
  }
  return null;
}

/** a variable name for HTML: x_1 shows as x with a subscript 1 */
function varHtml(v: string) {
  const u = v.indexOf('_');
  return u < 0 ? escapeHtml(v) : `${escapeHtml(v.slice(0, u))}<sub>${escapeHtml(v.slice(u + 1))}</sub>`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
