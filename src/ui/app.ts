import { Eq, Node, find, findPath, children, bumpIds, symbols } from '../engine/ast';
import { parseEquation, ParseError } from '../engine/parse';
import { toText } from '../engine/print';
import { applyMove, applyBothChecked, checked, isErr, MoveName, MoveOk, MoveResult, solvedFor } from '../engine/moves';
import { absOf, coefOf } from '../engine/terms';
import { formsFor, Form } from '../engine/forms';
import { moveAny, peel, wrapBoth, inverseOf, FN_TABS, WRAPS, WrapItem, tidy, isolate, substitute, splitCases } from '../engine/techniques';
import { parseExpr } from '../engine/parse';
import { evaluate } from '../engine/ast';
import { layout, Rect } from '../render/layout';
import { Stage, Transition } from '../render/stage';
import { Graph } from './graph';
import { sound } from './sound';

interface Step { eq: Eq; label: string; conditions: string[]; auto?: boolean }
/** origin: the equation a case came from, to check answers against. bad: why its answer fails */
interface Slot { steps: Step[]; at: number; sel: string | null; origin?: Eq; bad?: string }
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

  constructor() {
    this.stage = new Stage($('stage'));
    this.graph = new Graph($<HTMLCanvasElement>('graph'), $('graph-note'));
    this.bind();
    let size = '';
    new ResizeObserver(() => {
      const st = $('stage'), next = `${st.clientWidth}x${st.clientHeight}`;
      if (next !== size) { size = next; this.renderMain(null); }
    }).observe($('stage'));
    if (!this.restore()) {
      this.writing = 'new';
      this.commit('7y + 3x = 20', true);
    }
    this.themeLabel();
  }

  get slot(): Slot | undefined { return this.slots[this.cur]; }
  get steps(): Step[] { return this.slot?.steps ?? []; }
  set steps(v: Step[]) { this.slot!.steps = v; }
  get at(): number { return this.slot?.at ?? 0; }
  set at(v: number) { this.slot!.at = v; }
  get sel(): string | null { return this.slot ? this.slot.sel : this.looseSel; }
  set sel(v: string | null) { if (this.slot) this.slot.sel = v; else this.looseSel = v; }

  get eq(): Eq { return this.preview ?? this.steps[this.at]?.eq; }
  /** what the stage shows: the typed preview, a form being browsed, or the current step */
  get shown(): Eq { return this.peek ?? this.eq; }
  get step(): Step { return this.steps[this.at]; }
  private eqOf(i: number): Eq { const s = this.slots[i]; return s.steps[s.at].eq; }

  /* ---------------- rendering ---------------- */

  renderMain(tr: Transition | null) {
    const eq = this.shown;
    if (!eq) { this.stage.clear(); return; }
    const host = $('stage');
    const W = host.clientWidth, H = host.clientHeight;
    const pad = 32;
    let S = Math.min(68, Math.max(30, W / 15));
    let lay = layout(eq, S);
    if (lay.w > W - 2 * pad) { S = Math.max(22, S * (W - 2 * pad) / lay.w); lay = layout(eq, S); }
    const h = lay.asc + lay.desc;
    if (h > H - 40) { S = Math.max(22, S * (H - 40) / h); lay = layout(eq, S); }
    let ox = W / 2 - (lay.eqX ?? lay.w / 2);
    ox = Math.min(Math.max(ox, pad), Math.max(pad, W - pad - lay.w));
    if (lay.w > W - 2 * pad) ox = (W - lay.w) / 2;
    const oy = Math.round(Math.max(H * 0.56 - (lay.asc + lay.desc) / 2, Math.min(230, H * 0.4)));
    this.stage.show(lay, Math.round(ox), oy, tr);
    host.classList.toggle('preview', !!this.preview || (!!this.peek && this.mode === 'op'));
    this.renderSelection();
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
  }

  renderAll(tr: Transition | null, graphAnim = false) {
    this.renderMain(tr);
    this.renderTrail();
    this.renderRail();
    this.renderHints();
    if (this.shown) this.graph.draw(this.shown, graphAnim, this.slots.filter((_, i) => i !== this.cur).map((_, j) => this.eqOf(j >= this.cur ? j + 1 : j)));
    document.body.dataset.mode = this.mode;
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
      label.textContent = this.steps[i + 1].label;
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
      if (solved) { const tag = document.createElement('span'); tag.className = bad ? 'solved no' : 'solved'; tag.textContent = bad ? 'not a solution' : '✓'; btn.append(tag); }
      li.append(btn);
      list.append(li);
      new Stage(mini).show(lay, 0, 0, null);
      btn.addEventListener('click', () => this.switchTo(i));
    });
    $('eqs-tip').innerHTML = this.slots.length > 1 ? `<kbd>1</kbd>–<kbd>${Math.min(9, this.slots.length)}</kbd> switch, hold <kbd>e</kbd> + number to substitute` : `<kbd>n</kbd> adds another equation`;

    const eq = this.eq;
    const vars = $('vars');
    vars.replaceChildren();
    if (!eq) return;
    const solved = this.mode === 'write' ? null : solvedFor(eq);
    for (const v of symbols(eq)) {
      const li = document.createElement('li');
      const conds = (this.step?.conditions ?? []).filter(c => new RegExp(`(^|[^a-zα-ω])${v}([^a-zα-ω]|$)`).test(c));
      li.innerHTML = `<span class="var">${v}</span><span class="dom">real number</span>${solved === v ? '<span class="solved">solved</span>' : ''}`;
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
    if (this.mode === 'write') {
      host.innerHTML = `<span class="hint"><kbd>Enter</kbd> ${this.writing === 'new' && this.slots.length ? 'add to the system' : 'start solving'}</span><span class="hint"><kbd>Esc</kbd> cancel</span><span class="aside">Type like <i>3x/7 + 2 = y</i>, <i>x^2</i>, <i>sqrt(x)</i>, <i>ln(x)</i>, <i>|x − 1|</i>, <i>e^x</i>, or paste LaTeX.</span>`;
      return;
    }
    if (this.mode === 'labels') { host.innerHTML = `<span class="aside">Press a letter to aim. <kbd>Esc</kbd> to cancel.</span>`; return; }
    if (this.mode === 'hub') { host.innerHTML = `<span class="aside">Holding <kbd>e</kbd>: press a key to use it now, or <kbd>←</kbd><kbd>→</kbd> to browse forms and release to apply.</span>`; return; }
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
    parts.push(`<span class="hint"><kbd>=</kbd><kbd>-</kbd><kbd>.</kbd><kbd>/</kbd> both sides</span><span class="hint"><kbd>e</kbd> algebra</span><span class="hint"><kbd>f</kbd> functions</span>`);
    parts.push(`<span class="spacer"></span><span class="hint dim"><kbd>u</kbd> undo</span><span class="hint dim"><kbd>?</kbd> keys</span>`);
    host.innerHTML = parts.join('');
  }

  say(text: string, bad = false) {
    this.message = { text, bad };
    clearTimeout(this.messageTimer);
    this.renderHints();
    this.messageTimer = window.setTimeout(() => { this.message = null; this.renderHints(); }, bad ? 3200 : 2200);
  }

  refuse(text: string) {
    sound.refuse();
    this.bubble(text, true);
    const target = this.sel && this.stage.box(this.sel) ? $('sel') : $('stage');
    target.animate([{ translate: '0' }, { translate: '-6px' }, { translate: '5px' }, { translate: '-3px' }, { translate: '0' }], { duration: 260, easing: 'ease-out' });
    $('sel').classList.add('refused');
    setTimeout(() => $('sel').classList.remove('refused'), 380);
  }

  /* ---------------- state changes ---------------- */

  commit(src: string, quiet = false) {
    let eq: Eq;
    try { eq = this.preview && !quiet ? this.preview : parseEquation(src); }
    catch (e) { this.refuse((e as Error).message); return; }
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
    if (quiet) this.say('Space aims. m moves it across. = − . / do anything to both sides. Hold e for algebra, f for functions. ? shows every key.');
    else if (this.slots.length > 1) this.say(`Equation ${this.cur + 1}. Press 1–${this.slots.length} to switch between them.`);
  }

  private entrance() {
    const els = [...$('stage').querySelectorAll('.g')];
    els.forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: i * 14, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
  }

  apply(r: MoveResult, pitch = 1, opts: { tidy?: boolean; quietLabel?: boolean } = {}) {
    if (isErr(r)) { this.refuse(r.error); return false; }
    const before = this.eq;
    const wasSolved = solvedFor(before);
    const conditions = [...new Set([...this.step.conditions, ...(r.conditions ?? [])])];
    this.steps = this.steps.slice(0, this.at + 1);
    this.steps.push({ eq: r.eq, label: r.label, conditions, auto: r.auto });
    this.at++;
    this.sel = r.select !== undefined ? (r.select && find(r.eq, r.select) ? r.select : null) : this.sel && find(r.eq, this.sel) ? this.sel : null;
    sound.move(pitch);
    this.renderAll({ focus: r.focus, absorbs: r.hints.absorbs, flights: r.hints.flights }, true);
    if (!opts.quietLabel) this.bubble(r.label, false, r.focus ?? this.sel);
    const now = solvedFor(r.eq);
    const bad = now ? this.judge(this.cur) : null;
    if (bad) { this.say(bad, true); this.renderRail(); }
    else if (now && now !== wasSolved) { setTimeout(() => sound.solved(), 140); this.say(`Solved for ${now}.`); $('stage').classList.add('solved'); setTimeout(() => $('stage').classList.remove('solved'), 900); }
    if (r.conditions?.length) this.say(`Noted on the left: ${r.conditions.join(', ')}.`);
    this.save();
    if (opts.tidy) this.later(430, () => { const td = tidy(this.eq); if (td) this.apply(td, 1.25, { quietLabel: true }); });
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
      this.apply(s, 1.05 + 0.03 * i, { quietLabel: !!s.auto });
      if (i < steps.length) this.later(s.auto ? 300 : 420, next);
      else if (done) this.later(460, done);
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
    this.sel = id;
    if (!quiet) sound.tick(id ? (findPath(this.eq, id)?.length ?? 1) - 1 : 0);
    this.renderSelection();
    this.renderHints();
  }

  /* ---------------- the system of equations ---------------- */

  switchTo(i: number) {
    if (i < 0 || i >= this.slots.length) { this.refuse(`There is no equation ${i + 1}. Press n to add one.`); return; }
    if (i === this.cur) return;
    if (this.mode === 'write') this.cancelEdit();
    this.cur = i;
    sound.tick(1);
    this.stage.clear();
    this.renderAll(null);
    this.entrance();
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
      if (j >= 0 && j < sibs.length) {
        let n = sibs[j];
        for (let d = 0; d < climbed; d++) {
          const ks = this.visibleKids(n);
          if (!ks.length) break;
          n = dir > 0 ? ks[0] : ks[ks.length - 1];
        }
        return this.select(n.id);
      }
      id = p.id; climbed++;
    }
  }

  toggleSide() {
    const onLeft = this.sel && this.sel !== 'eq' && findPath(this.eq, this.sel)?.[1] === this.eq.lhs;
    this.select(onLeft ? this.eq.rhs.id : this.eq.lhs.id);
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
    try {
      this.preview = parseEquation(src);
      err.textContent = '';
      this.renderMain(null);
      this.graph.draw(this.preview, false);
      this.renderRail();
    } catch (e) {
      if (!(e instanceof ParseError)) throw e;
      this.typingTimer = window.setTimeout(() => { err.textContent = src.trim() ? (e as Error).message : ''; }, 700);
      $('stage').classList.add('preview');
    }
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
    return applyBothChecked(this.eq, v);
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
    this.slots.forEach((_, j) => {
      if (j === this.cur) return;
      const shares = symbols(this.eqOf(j)).some(v => vars.includes(v));
      out.push({ key: String(j + 1), label: `substitute from (${j + 1})`, ok: shares, run: () => this.substituteFrom(j) });
    });
    return out;
  }

  openHub(sticky: boolean) {
    this.flush();
    const forms = formsFor(this.eq, this.sel);
    this.hub = { forms, techs: this.techniques(), i: 0, sticky, moved: false, awaitVar: false };
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
      if (k.toLowerCase() === 'e') return this.closeHub(true);
      return this.refuse(`Press one of ${symbols(this.eq).join(', ')}.`);
    }
    const step = ['ArrowRight', 'ArrowDown', 'Tab'].includes(k) ? 1 : ['ArrowLeft', 'ArrowUp'].includes(k) ? -1 : 0;
    if (step) {
      if (!h.forms.length) return this.refuse('No other forms here. Aim at something else.');
      h.i = h.moved ? (h.i + (e.shiftKey && k === 'Tab' ? -1 : step) + h.forms.length) % h.forms.length : step > 0 ? 0 : h.forms.length - 1;
      h.moved = true;
      sound.tick(1);
      return this.peekAt();
    }
    if (k === 'Enter') { if (h.moved) return this.applyForm(); return this.refuse('Browse with ← → first, or press a key shown.'); }
    if (k.toLowerCase() === 'e' && h.sticky) return this.closeHub(true);
    const tech = h.techs.find(t => t.key === k);
    if (tech) {
      if (!tech.ok) return this.refuse(`${tech.label[0].toUpperCase()}${tech.label.slice(1)} doesn't apply here.`);
      if (tech.key === 'i' && tech.label.endsWith('…')) return tech.run();
      this.closeHub(false);
      return tech.run();
    }
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
    tip.innerHTML = h.awaitVar ? 'press the variable' : h.sticky ? 'press a key, or <kbd>←</kbd><kbd>→</kbd> browse + <kbd>Enter</kbd>. <kbd>Esc</kbd> closes' : 'keep holding <kbd>e</kbd>: press a key, or <kbd>←</kbd><kbd>→</kbd> and release';
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
      : P.sticky ? '<kbd>←</kbd><kbd>→</kbd> tabs <kbd>↑</kbd><kbd>↓</kbd> browse <kbd>Enter</kbd> apply. Every key works from any tab. <kbd>f</kbd> closes'
      : 'keep holding <kbd>f</kbd>: press a key, or <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> and release';
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
    const td = r && !isErr(r) ? tidy(r.eq) : null;
    this.peek = r && !isErr(r) ? (td ? td.eq : r.eq) : null;
    this.renderMain({ quick: true });
  }

  palKey(e: KeyboardEvent) {
    const P = this.pal;
    const k = e.key;
    if (k === 'Escape') return this.closePal(true);
    if (e.repeat) return;
    const items = FN_TABS[P.tab].items;
    const dt = k === 'ArrowRight' ? 1 : k === 'ArrowLeft' ? -1 : 0;
    const di = k === 'ArrowDown' || k === 'Tab' ? 1 : k === 'ArrowUp' ? -1 : 0;
    if (dt) { P.tab = (P.tab + dt + FN_TABS.length) % FN_TABS.length; P.i = 0; P.moved = true; sound.tick(1); this.renderPal(); return this.palPeek(); }
    if (di) { P.i = P.moved ? (P.i + di + items.length) % items.length : 0; P.moved = true; sound.tick(2); this.renderPal(); return this.palPeek(); }
    if (k === 'Enter') return P.moved ? this.choose(items[P.i]) : this.palInverse();
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
    const td = !isErr(r) ? tidy(r.eq) : null;
    this.peek = !isErr(r) ? (td ? td.eq : r.eq) : null;
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

  /** apply, and after a beat tidy up what it made (3x − 3x, √(x²), ln(eˣ) …) */
  applyTidy(r: MoveResult, pitch = 1) { this.apply(isErr(r) ? r : checked(this.eq, r), pitch, { tidy: true }); }

  /* ---------------- techniques ---------------- */

  solveFor(v: string) {
    const r = isolate(this.eq, v);
    if (!Array.isArray(r)) { this.refuse(r.error); return; }
    if (!r.length) { this.refuse(`Already solved for ${v}.`); return; }
    r.forEach(s => { s.select = null; s.focus = undefined; });
    this.play(r, () => this.afterSolve(v));
  }

  /** after isolating: split into cases and solve each one, or say where it got stuck */
  private afterSolve(v: string) {
    if (solvedFor(this.eq) === v) return;
    if (splitCases(this.eq, v)) { this.split(v); return; }
    this.say(`Got as far as I could isolating ${v}. Try a form (hold e) or a function (hold f).`, true);
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
    if (v) this.later(450, () => this.solveFor(v));
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
    if (symbols(rhs).length || symbols(origin).some(s => s !== v)) return null;
    const x = evaluate(rhs, {});
    const L = evaluate(origin.lhs, { [v]: x }), R = evaluate(origin.rhs, { [v]: x });
    if (Number.isFinite(L) && Number.isFinite(R) && Math.abs(L - R) <= 1e-7 * (1 + Math.abs(L) + Math.abs(R))) return null;
    slot.bad = `${v} = ${toText(rhs)} doesn't work in the original ${toText(origin)}${Number.isFinite(L) && Number.isFinite(R) ? '' : ' (it is undefined there)'}, so it is not a solution.`;
    return slot.bad;
  }

  substituteFrom(j: number) {
    const aimed = this.sel && this.sel !== 'eq' ? find(this.eq, this.sel) : null;
    const r = substitute(this.eq, this.eqOf(j), aimed?.k === 'sym' ? aimed.name : null, `Equation ${j + 1}`);
    const rail = document.querySelectorAll('.eq-slot')[j];
    rail?.animate([{ boxShadow: '0 0 0 2px var(--copy)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 700, easing: 'ease-out' });
    this.applyTidy(r, 1.2);
  }

  /* ---------------- keys ---------------- */

  bind() {
    const input = $<HTMLInputElement>('input');
    input.addEventListener('input', () => this.onType());
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
        this.closeOp();
        this.apply(r, 1.05, { tidy: true });
      }
    });
    $('original').addEventListener('click', () => this.edit(false));
    $('trail').addEventListener('mousedown', e => e.stopPropagation());
    $('stage').addEventListener('mousedown', e => this.click(e));
    $('help-close').addEventListener('click', () => this.toggleHelp(false));
    $('sound').addEventListener('click', () => this.toggleSound());
    $('add-eq').addEventListener('click', () => this.edit(true));
    window.addEventListener('keydown', e => this.key(e));
    window.addEventListener('keyup', e => {
      if (e.key.toLowerCase() === 'f' && this.mode === 'fnpal') { this.palRelease(); return; }
      if (e.key.toLowerCase() !== 'e' || this.mode !== 'hub' || !this.hub || this.hub.sticky) return;
      if (this.hub.moved) this.applyForm();
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

  click(e: MouseEvent) {
    if (this.mode === 'write') this.cancelEdit();
    if (this.mode === 'op') this.closeOp();
    if (this.mode === 'hub') this.closeHub(true);
    if (this.mode === 'fnpal' || this.mode === 'fnask') this.closePal(true);
    if (this.mode !== 'solve') this.setMode('solve');
    const host = $('stage').getBoundingClientRect();
    const x = e.clientX - host.left, y = e.clientY - host.top;
    const lay = this.stage.layout;
    if (!lay) return;
    let best: string | null = null, area = Infinity;
    for (const id of lay.boxes.keys()) {
      if (id === 'eq') continue;
      const r = this.stage.box(id)!;
      if (x >= r.x - 4 && x <= r.x + r.w + 4 && y >= r.y - 4 && y <= r.y + r.h + 4 && r.w * r.h < area) { best = id; area = r.w * r.h; }
    }
    if (best && best === this.sel) return this.grow();
    this.select(best);
  }

  toggleHelp(show = $('help').hidden) { $('help').hidden = !show; }
  toggleSound() {
    const m = sound.toggle();
    $('sound').classList.toggle('off', m);
    $('sound').setAttribute('aria-pressed', String(!m));
    this.say(m ? 'Sound off.' : 'Sound on.');
  }

  key(e: KeyboardEvent) {
    if (this.mode === 'write' || this.mode === 'op' || this.mode === 'fnask') return;
    if (!$('help').hidden) { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); this.toggleHelp(false); } return; }
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (this.mode === 'hub') { e.preventDefault(); return this.hubKey(e); }
    if (this.mode === 'fnpal') { e.preventDefault(); return this.palKey(e); }
    if (this.mode === 'labels') {
      e.preventDefault();
      if (k === 'Escape' || k === ' ') { this.setMode('solve'); this.renderHints(); return; }
      if (/^[a-z]$/.test(k)) this.labelKey(k);
      else { this.setMode('solve'); this.renderHints(); }
      return;
    }
    this.flush();
    if (ctrl) {
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
      return this.apply(applyMove(move.name, this.eq, this.sel), move.pitch);
    }
    switch (k) {
      case ' ': handled(); return this.showLabels();
      case 'h': case 'ArrowLeft': handled(); return e.shiftKey ? this.apply(applyMove('slideL', this.eq, this.sel)) : this.sideways(-1);
      case 'l': case 'ArrowRight': handled(); return e.shiftKey ? this.apply(applyMove('slideR', this.eq, this.sel)) : this.sideways(1);
      case 'H': handled(); return this.apply(applyMove('slideL', this.eq, this.sel));
      case 'L': handled(); return this.apply(applyMove('slideR', this.eq, this.sel));
      case 'k': case 'ArrowUp': handled(); return this.grow();
      case 'j': case 'ArrowDown': handled(); return this.shrink();
      case 'Tab': handled(); return this.toggleSide();
      case 'a': handled(); return this.select('eq');
      case 'Escape': handled(); return this.select(null, true);
      case 'u': handled(); return this.undo();
      case 'r': case 'U': handled(); return this.redo();
      case 'o': handled(); return this.openOp('+');
      case 'e': case 'E': handled(); if (!e.repeat) this.openHub(false); return;
      case 'Enter': handled(); return this.openHub(true);
      case 'f': case 'F': handled(); if (!e.repeat) this.openPal(false); return;
      case 'i': handled(); return this.edit(false);
      case 'n': handled(); return this.edit(true);
      case 'Delete': case 'Backspace': handled(); return this.removeCurrent();
      case 't': handled(); return this.toggleTheme();
      case '?': handled(); return this.toggleHelp();
      case 'M': handled(); return this.toggleSound();
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
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('algebrix.theme', root.dataset.theme); } catch { /* storage blocked */ }
    this.themeLabel();
    sound.tick(2);
    if (this.shown) this.renderAll(null);
  }

  themeLabel() {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    $('theme').querySelector('span')!.textContent = dark ? 'Light mode' : 'Dark mode';
  }

  /* ---------------- persistence ---------------- */

  save() {
    try { localStorage.setItem('algebrix.session', JSON.stringify({ v: 3, slots: this.slots, cur: this.cur })); } catch { /* storage blocked */ }
  }

  restore(): boolean {
    try {
      const raw = localStorage.getItem('algebrix.session');
      if (!raw) return false;
      const s = JSON.parse(raw) as { slots?: Slot[]; cur?: number; steps?: Step[]; at?: number };
      const slots = s.slots ?? (s.steps?.length ? [{ steps: s.steps, at: s.at ?? 0, sel: null }] : []);
      if (!slots.length) return false;
      slots.forEach(sl => { sl.steps.forEach(st => bumpIds(st.eq)); sl.at = Math.min(sl.at, sl.steps.length - 1); sl.sel = null; });
      this.slots = slots;
      this.cur = Math.min(s.cur ?? 0, slots.length - 1);
      this.setMode('solve');
      this.renderAll(null);
      return true;
    } catch { return false; }
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
