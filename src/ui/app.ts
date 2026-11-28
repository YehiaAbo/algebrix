import { Eq, Node, find, findPath, children, symbols, relOf, key, isVector, evaluate, isDiff, defsSig, DEFS } from '../engine/ast';
import { isIdentity, isProved } from '../engine/goals';
import { Domain } from '../engine/moves';
import { parseEquation, ParseError, setRedefining } from '../engine/parse';
import { toText } from '../engine/print';
import { applyMove, previewMove, isErr, CheckedResult, Checked, solvedFor } from '../engine/moves';
import { formsFor } from '../engine/forms';
import { substitute } from '../engine/calculus';
import { simplify, newHints } from '../engine/simplify';
import { moveAny } from '../engine/wrap';
import { WrapItem } from './fntabs';
import type { MenuState } from './menu/model';
import { simplifySpot, Spot } from '../engine/spot';
import { layout, Rect } from '../render/layout';
import { Stage, Transition, SMOOTH } from '../render/stage';
import { Graph } from './graph';
import { Tour, toured } from './tour';
import { group, ungroup } from '../engine/select';
import { walk } from '../engine/ast';
import { sound } from './sound';
import { prefs, setPref, onPrefs, ms } from './prefs';
import { applyTheme, applyLook, applySpeed, applyAccent, isDark } from './appearance';
import { works } from './works';
import { initPanels, applyPanels } from './panels';
import { Library } from './library';
import { Settings } from './settings';
import { initMeter } from './fps';
import { Step, Slot, Mode, $, MOVE_KEYS, LABEL_CHARS, DOMAIN_TEXT, Hub, livePreview, varHtml, escapeHtml, mathHtml, pretty, setHtml, onResize, aimBox } from './shared';
import * as nav from './nav';
import { notationAt } from './notation';
import { field } from './mathfield';
import { toLatex } from '../engine/latex';
import * as sheet from './sheet';
import { hasCalc } from '../engine/calcmoves';
import { odeKind } from '../engine/ode';
import { letterCard, fnCard, mathEl } from './railinfo';
import { asPrime, hasDifferentials, slopeVar } from '../engine/leibniz';
import { TreeView, TreeBig, HeadInfo } from './treeview';
import { treeOf, goto, here, visibleAt } from './tree';
import type { Link } from './shared';
import type { NavView } from './nav';
import * as opsPart from './ops';
import * as hubPart from './hub';
import * as fnpalPart from './fnpal';
import * as solvingPart from './solving';
import * as keysPart from './keys';
import * as persistPart from './persist';
import * as calcPart from './calc';
import * as generalPart from './general';
import * as replayPart from './replay';
import { mathLabel } from './mathlabel';
import { dropStruck } from '../engine/series';

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
  /** the notation cards under the typing box, and the one picked */
  nota: (NonNullable<ReturnType<typeof notationAt>> & { i: number }) | null = null;
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
  /** the work tree across the top, and its big view (v) */
  tree: TreeView;
  treeBig: TreeBig;
  private treeSlots: Slot[] | null = null;
  /** the step of another equation the next move uses (set as a piece of it flies in) */
  linkNext: Link | null = null;
  /** what the small box is for: both sides (o), naming a piece (b), or putting in a value (p) */
  opKind: 'both' | 'name' | 'value' | 'divide' | 'one' | 'as' = 'both';
  valueOf: string | null = null;
  /** p on an equation that says which value works: a typed value is tried, not put in */
  valueCheck = false;
  /** the polynomial Tab q takes a factor out of */
  divideAt: string | null = null;
  oneAt: string | null = null;
  asAt: string | null = null;
  graphTimer = 0;
  /** Shift+P playing the steps back: where it stops, and the next beat */
  replaying: { to: number; timer: number } | null = null;

  pal = { menu: { section: 0, at: null, sticky: false, chordUsed: false } as MenuState, ask: null as WrapItem | null, started: '', startedTex: '', primes: 0 };
  constructor() {
    this.stage = new Stage($('stage'));
    this.tree = new TreeView($('tree'), { size: 16, strip: true, pick: (c, id) => this.goStep(c, id), open: (c, id) => this.openTree(c, id) });
    this.treeBig = new TreeBig((c, id) => this.goStep(c, id));
    onResize($('tree'), () => { if (!$('tree').hidden) this.renderTree(false); });
    this.graph = new Graph($<HTMLCanvasElement>('graph'), $('graph-note'));
    this.bind();
    let size = '';
    onResize($('stage'), () => {
      const st = $('stage'), next = `${st.clientWidth}x${st.clientHeight}`;
      if (next === size) return;
      size = next;
      // a move's animation is never cut short: the bottom bar growing a line after a move resizes
      // the stage, and redrawing then snapped every piece to its end. Wait for it, then glide.
      const running = st.getAnimations({ subtree: true }).filter(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity);
      if (!running.length) return this.renderMain(null);
      const n = this.renders;
      Promise.all(running.map(a => a.finished.catch(() => undefined))).then(() => { if (this.renders === n) this.renderMain({ quick: true }); });
    });
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
    initMeter();
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

  /** px the equation glides down (or up) to make room for an open menu; 0 when none is open */
  room = 0;
  renders = 0;

  renderMain(tr: Transition | null) {
    this.renders++;
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
    // the = sits at the centre so it stays put between steps, unless that pushes a lopsided
    // equation (I = a long integral) well off centre: then the whole line is held near the middle
    let ox = W / 2 - (lay.eqX ?? lay.w / 2);
    const drift = W * 0.04;
    ox = Math.min(Math.max(ox, W / 2 - lay.w / 2 - drift), W / 2 - lay.w / 2 + drift);
    ox = Math.min(Math.max(ox, pad), Math.max(pad, W - pad - lay.w));
    if (lay.w > W - 2 * pad) ox = (W - lay.w) / 2;
    if (this.room && $('forms').hidden && $('op').hidden) this.room = 0;
    const oy = Math.round(Math.max(H * 0.56 - (lay.asc + lay.desc) / 2, Math.min(230, H * 0.4))) + this.room;
    this.stage.show(lay, Math.round(ox), oy, tr);
    // a final answer that isn't an equation (an inequality's solution set) sits under it
    const ans = $('answer');
    // an answer that came from a one-way step (squaring) and fails the original: never shown as solved
    const wrong = !this.preview && !this.peek && !!this.slot?.bad && !!solvedFor(eq);
    host.classList.toggle('extraneous', wrong);
    const all = !this.preview && !this.peek ? this.allAnswers() : null;
    const text = wrong ? `✗ not a solution: it fails the original equation${all ? ` (the answer is ${all.replace(/<sup>([^<]*)<\/sup>/g, '^$1').replace(/<[^>]+>/g, '')})` : ''}` : !this.preview && !this.peek ? this.step?.answer : undefined;
    const proved = !this.preview && !this.peek && relOf(eq) === '≟' && isProved(eq);
    ans.hidden = !text && !proved && !all;
    ans.classList.toggle('bad', wrong);
    ans.classList.toggle('all', !text && !proved && !!all);
    if (!text && !proved && all) {
      ans.innerHTML = all.startsWith('the only') ? all : `${(all.match(/<b>/g) ?? []).length > 2 ? 'all the answers' : 'both answers'}: ${all}`;
      ans.style.top = `${Math.round(oy + lay.asc + lay.desc + 22)}px`;
    } else if (text || proved) {
      ans.textContent = proved ? '∎ proved' : text!;
      ans.style.top = `${Math.round(oy + lay.asc + lay.desc + 22)}px`;
    }
    host.classList.toggle('preview', !!this.preview || (!!this.peek && this.mode === 'op'));
    this.renderSelection();
    this.renderSpot();
  }

  renderSelection() {
    const el = $('sel');
    const at = this.hub && !this.hub.calc ? this.hub.menu.at : null;
    const browsing = at !== null ? this.browsedForm() : null;
    const id = browsing ? browsing.select ?? 'eq' : this.mode === 'op' && this.peek ? null : this.sel;
    const r = id ? this.stage.box(id) : null;
    if (!r || this.mode === 'write') { el.classList.remove('on'); return; }
    const S = this.stage.layout ? this.stage.layout.glyphs[0]?.s ?? 60 : 60;
    const p = Math.max(5, S * 0.1);
    aimBox(el, r.x - p, r.y - p * 0.6, r.w + 2 * p, r.h + p * 1.2, Math.max(6, S * 0.12), el.classList.contains('refused') ? 2 : 1.5);
    el.classList.add('on');
    // a run of several terms (Ctrl + arrows, or the mouse box) reads as one piece with a softer fill
    el.classList.toggle('run', !!this.grouped && id === this.grouped.id);
    // while Ctrl is held: arrows on the sides that can still grow
    const edges = id && id !== 'eq' && !browsing ? this.growable(id) : { l: false, r: false };
    el.dataset.l = edges.l ? '1' : '';
    el.dataset.r = edges.r ? '1' : '';
  }

  /** when an equation was split into cases and every case is solved: the answers together
   *  ("x = 2 or x = 3"), each in <b>, leaving out the ones that fail the original. Null otherwise */
  allAnswers(): string | null {
    const me = this.slot, v = solvedFor(this.eq);
    if (!me?.origin || !v) return null;
    const at = key(me.origin);
    const kin = this.slots.map((s, i) => ({ s, e: this.eqOf(i) })).filter(({ s }) => s.origin && key(s.origin) === at);
    if (kin.length < 2 || kin.some(({ e }) => solvedFor(e) !== v)) return null;
    // in order along the number line when they are numbers: x = −2, 0 or 2
    const sides = kin.filter(({ s }) => !s.bad).map(({ e }) => (e.lhs.k === 'sym' ? e.rhs : e.lhs));
    const at0 = sides.map(n => evaluate(n, {}));
    const order = at0.every(Number.isFinite) ? sides.map((n, i) => i).sort((a, b) => at0[a] - at0[b]) : sides.map((n, i) => i);
    const uniq = [...new Set(order.map(i => toText(sides[i])))];
    if (!uniq.length) return null;
    // the one that works, here: say what the others were
    const out = kin.filter(({ s }) => s.bad).map(({ e }) => toText(e.lhs.k === 'sym' ? e.rhs : e.lhs));
    if (uniq.length === 1 && !me.bad && out.length) return `the only answer: <b>${v} = ${mathHtml(uniq[0])}</b> (${out.map(o => `${v} = ${mathHtml(o)}`).join(', ')} fails the original)`;
    if (uniq.length === 1) return me.bad ? `<b>${v} = ${mathHtml(uniq[0])}</b>` : null;
    // a system: another equation gives y from x (y = x + 1), so each answer is a point
    const partner = this.slots.map((_, i) => this.eqOf(i)).find(e => {
      const w = solvedFor(e);
      return !!w && w !== v && !kin.some(k => k.e === e) && symbols(e.lhs.k === 'sym' ? e.rhs : e.lhs).every(n => n === v);
    });
    if (partner && uniq.every(a => !symbols(sides[order.find(i => toText(sides[i]) === a)!]).length)) {
      const w = solvedFor(partner)!, g = partner.lhs.k === 'sym' ? partner.rhs : partner.lhs;
      const pts = uniq.map(a => {
        const x = sides[order.find(i => toText(sides[i]) === a)!], y = toText(simplify(substitute(g, v, x), newHints()));
        return v < w ? [a, y] : [y, a];
      });
      const names = v < w ? `(${v}, ${w})` : `(${w}, ${v})`;
      const items = pts.map(([p, q], i) => `<b>${i ? '' : `${names} = `}(${mathHtml(p)}, ${mathHtml(q)})</b>`);
      return items.length === 2 ? items.join(' or ') : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
    }
    return uniq.map(a => `<b>${v} = ${mathHtml(a)}</b>`).join(uniq.length > 2 ? ', ' : ' or ').replace(/, (?=[^,]*$)/, ' or ');
  }

  /** the status tag an equation carries: its answer, ✓, ∎, or a warning */
  slotTag(i: number, e: Eq): { text: string; cls: string } | null {
    const sl = this.slots[i], st = sl.steps[sl.at];
    if (relOf(e) === '≟') return isProved(e) ? { text: '∎', cls: 'solved' } : { text: 'prove', cls: 'goal' };
    if (relOf(e) === 'def') return { text: 'definition', cls: 'goal' };
    if (st.answer) return { text: st.answer, cls: 'solved ans' };
    if (solvedFor(e)) return sl.bad ? { text: 'not a solution', cls: 'solved no' } : noValue(e) ? { text: 'no value', cls: 'solved no' } : { text: '✓', cls: 'solved' };
    return null;
  }

  /** what each equation's column says at its top: its number, its status, and what it can give
   *  the equation you're on (lit while the algebra menu is open, when you'd use it) */
  treeHeads(): HeadInfo[] {
    const aimed = this.sel && this.sel !== 'eq' ? find(this.eq, this.sel) : null;
    // a letter this equation is already solved for has nothing more to take in
    const done = this.shown ? solvedFor(this.shown) : null;
    const mine = this.shown ? symbols(this.shown).filter(v => v !== done) : [];
    return this.slots.map((_, i) => {
      const e = this.eqOf(i);
      if (i === this.cur) return { tag: this.slotTag(i, e), offer: '', linked: false, focus: true };
      // a case of the same split, or an answer that fails, has nothing to give this equation
      // a piece taken aside is worked on by itself: it shares nothing with the equations
      const shared = sheet.areCases(this, this.cur, i) || this.slots[i].bad || this.slots[i].focus || this.slot?.focus ? [] : symbols(e).filter(v => mine.includes(v));
      const solved = solvedFor(e);
      const keys = `<span class="sep">·</span><kbd>Tab</kbd>+<kbd>${i + 1}</kbd>`;
      let offer = '';
      if (aimed?.k === 'sym' && shared.includes(aimed.name)) offer = `puts in <i>${varHtml(aimed.name)}</i>${keys}`;
      else if (solved && shared.includes(solved)) offer = `gives <i>${varHtml(solved)}</i>${keys}`;
      else if (shared.length) offer = `shares <span>${shared.map(v => `<i>${varHtml(v)}</i>`).join(', ')}</span>${keys}`;
      return { tag: this.slotTag(i, e), offer, linked: shared.length > 0 && this.mode === 'hub', focus: false };
    });
  }

  /** The work tree across the top: every equation's steps, the lines you left, and where one
   *  equation fed another. The equation you're on gets the room below. */
  renderTree(animate = true) {
    const board = $('board'), host = $('tree');
    const adding = this.mode === 'write' && this.writing === 'new' && this.slots.length > 0;
    const n = this.slots.length + (adding ? 1 : 0);
    board.classList.toggle('multi', n > 1);
    $('stage').dataset.n = String((adding ? this.slots.length : this.cur) + 1);
    host.hidden = $('tree-split').hidden = !this.slots.length;
    if (!this.slots.length) return;
    // another workspace (or a fresh start): nothing glides in from the old one
    if (this.treeSlots !== this.slots) { this.tree.reset(); this.treeSlots = this.slots; animate = false; }
    this.tree.render(this.slots.map(treeOf), this.treeHeads(), this.cur, animate);
  }

  /** a click on a step in the tree: that equation, at that step */
  goStep(col: number, id: string | null) {
    if (this.mode === 'write') this.cancelEdit();
    this.closeModes();
    if (col !== this.cur) this.switchTo(col);
    if (!id) return;
    const sl = this.slots[col];
    if (!sl || visibleAt(sl) === id) return;
    if (!goto(sl, id)) return;
    this.afterJump();
  }

  /** v, or a click on the tree: all of it, big */
  openTree(col?: number, id?: string) {
    if (!this.slots.length) return;
    this.closeModes();
    sound.tick(2);
    this.treeBig.open(this.slots.map(treeOf), this.treeHeads(), this.cur, col !== undefined && id ? { col, id } : undefined);
  }

  /** a copy of another equation flies into this one (substitute, add an equation) */
  flyFrom(j: number) {
    // the move that follows used this equation: the tree draws an arrow from it
    if (this.slots[j]) this.linkNext = here(this.slots[j]);
    const src = this.slots[j] ? this.tree.elOf(j, visibleAt(this.slots[j]))?.querySelector<HTMLElement>('.mini') : null;
    const dst = this.stage.box('eq');
    if (!src || !dst) return;
    const a = src.getBoundingClientRect(), host = $('stage').getBoundingClientRect();
    const ghost = src.cloneNode(true) as HTMLElement;
    ghost.classList.add('fly');
    Object.assign(ghost.style, { position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, margin: '0', zIndex: '6' });
    document.body.append(ghost);
    const tx = host.left + dst.x + dst.w / 2 - (a.left + a.width / 2), ty = host.top + dst.y + dst.h / 2 - (a.top + a.height / 2);
    ghost.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${tx}px, ${ty}px) scale(1.25)`, opacity: 0 }], { duration: ms(420), easing: 'cubic-bezier(.3,.6,.2,1)', fill: 'forwards' }).onfinish = () => ghost.remove();
    src.closest('.titem')?.animate([{ boxShadow: '0 0 0 2px var(--copy)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: ms(700), easing: 'ease-out' });
  }

  renderAll(tr: Transition | null, graphAnim = false, sameSet = false) {
    this.syncDefs();
    this.syncLets();
    this.renderTree();
    this.renderMain(tr);
    this.renderOriginal();
    this.renderRail();
    this.renderHints();
    this.graph.extra = this.slot?.bad && this.shown && solvedFor(this.shown) && !this.preview ? 'But this answer came from a one-way step (like squaring) and fails the original, so it is not a solution.' : '';
    if (this.shown) this.drawGraphSoon(this.shown, graphAnim, this.slots.map((_, i) => i).filter(i => i !== this.cur && !this.slots[i].focus && !this.slot?.focus).map(i => this.eqOf(i)), sameSet && this.shown === this.eq);
    document.body.dataset.mode = this.mode;
    this.tour?.check();
  }

  /** the graph is drawn once the move has played, not in the key press: its sampling would
   *  take the frames the move animates in (held m redraws it once, when you let go) */
  private graphSoon = 0;
  drawGraphSoon(eq: Eq, animate: boolean, others: Eq[], sameSet: boolean) {
    clearTimeout(this.graphSoon);
    if (animate || !this.graph.eq) { this.graph.draw(eq, animate, others, sameSet); return; }
    this.graphSoon = window.setTimeout(() => this.graph.draw(eq, false, others, sameSet), ms(440));
  }

  /** the start of this equation, in the typing box (i types over it) */
  /** the original equation, drawn again only when it is a different one (not on every key) */
  private origKey = '';
  renderOriginal() {
    const orig = $('original');
    const k = this.steps[0] ? key(this.steps[0].eq) + '|' + document.documentElement.dataset.look : '';
    if (k === this.origKey && orig.childElementCount) return;
    this.origKey = k;
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
    $('work-name').textContent = works.get(this.workId)?.name ?? 'Untitled';
    setHtml($('eqs-tip'), this.slots.length > 1 ? `<kbd>1</kbd>–<kbd>${Math.min(9, this.slots.length)}</kbd> or <kbd>Alt</kbd>+<kbd>←</kbd><kbd>→</kbd> switch, hold <kbd>Tab</kbd> + number to substitute` : `<kbd>n</kbd> adds another equation`);

    const eq = this.eq;
    const vars = $('vars');
    const solved = eq && this.mode === 'write' ? null : eq && solvedFor(eq);
    // the rail only changes when what it shows changes: skip the rebuild otherwise
    const sig = eq ? `${key(eq)}|${defsSig.v}|${solved}|${this.slot?.bad}|${JSON.stringify(this.domains)}|${(this.step?.conditions ?? []).join(';')}|${this.railOpen}|${this.cur}|${this.slots.map((_, j) => key(this.eqOf(j))).join(';')}|${document.documentElement.dataset.accent ?? ''}|${this.sideNames().map(key).join(';')}` : '';
    const same = sig === this.railSig;
    this.railSig = sig;
    this.renderRailCounts();
    if (same) return;
    vars.replaceChildren();
    if (!eq) { $('conds').replaceChildren(); return; }
    // a hole, a constant of integration and y′ are not variables you choose
    for (const v of symbols(eq).filter(v => v !== '□' && !/^C(_\d+)?$/.test(v) && !/[′″]$/.test(v) && !isDiff(v) && !v.startsWith('d²'))) {
      const li = document.createElement('li');
      const conds = (this.step?.conditions ?? []).filter(c => new RegExp(`(^|[^a-zα-ω])${v}([^a-zα-ω]|$)`).test(c));
      const dom = this.domains[v] ?? 'real';
      const side = this.sideNames().find(d => d.lhs.k === 'sym' && d.lhs.name === v);
      li.innerHTML = `<span class="var">${varHtml(v)}</span><span class="dom">${side ? '' : DOMAIN_TEXT[dom]}</span>${solved === v ? (this.slot?.bad ? '<span class="solved no">not a solution</span>' : noValue(eq) ? '<span class="solved no" title="What it equals has no finite value: an integral that diverges, or a limit that does not exist">no value</span>' : '<span class="solved">solved</span>') : ''}`;
      // a name kept on the side shows what it stands for, and how to put it back
      if (side) { const d = li.querySelector('.dom')!; d.classList.add('side'); d.append(mathEl(side, 14)); li.title = 'kept on the side: Tab + u puts it back'; }
      if (conds.length) li.title = conds.join(', ');
      vars.append(li, ...this.railItem(li, `v:${v}`, () => letterCard(this, v)));
    }
    // the functions you defined: click one for its definition and a small graph
    const fns = $('fns');
    fns.replaceChildren();
    for (const [name, d] of DEFS) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="var">${escapeHtml(name)}(${escapeHtml(d.param)})</span><span class="fn-body"></span>`;
      li.querySelector('.fn-body')!.append(mathEl(d.body, 14));
      fns.append(li, ...this.railItem(li, `f:${name}`, () => fnCard(this, name)));
    }
    $('fns-sec').hidden = !DEFS.size;
    const conds = $('conds');
    conds.replaceChildren();
    for (const c of this.step?.conditions ?? []) {
      const li = document.createElement('li');
      li.innerHTML = mathHtml(c);
      li.classList.toggle('prose', /[a-z]{3,} [a-z]{2,}/.test(c));
      conds.append(li);
    }
    $('conds-empty').hidden = (this.step?.conditions.length ?? 0) > 0;
  }

  private railSig = '';
  /** the rail item opened for its details ('v:x' a letter, 'f:I' a function) */
  railOpen: string | null = null;
  /** a rail row that opens in place: click it for its card, again to close */
  private railItem(li: HTMLLIElement, id: string, card: () => HTMLElement): HTMLElement[] {
    li.classList.add('ri');
    li.addEventListener('click', () => { this.railOpen = this.railOpen === id ? null : id; sound.tick(this.railOpen ? 2 : 0); this.renderRail(); });
    if (this.railOpen !== id) return [];
    li.classList.add('open');
    const host = document.createElement('li');
    host.className = 'ri-host';
    host.append(card());
    return [host];
  }
  private renderRailCounts() {
    $('step-count').textContent = this.mode === 'write' ? 'Writing…' : this.at === 0 ? 'At the start' : `${this.at} step${this.at > 1 ? 's' : ''} in`;
    $('redo-count').textContent = this.at < this.steps.length - 1 ? `${this.steps.length - 1 - this.at} ahead, r to redo` : '';
  }

  renderHints() {
    const host = $('hints');
    host.classList.toggle('msg', !!this.message);
    host.classList.toggle('bad', !!this.message?.bad);
    setHtml(host, this.message ? escapeHtml(this.message.text) : this.hintsHtml());
    host.querySelectorAll<HTMLElement>('.ml:not([data-done])').forEach(el => { el.dataset.done = '1'; el.replaceChildren(mathLabel(el.textContent ?? '', 12)); });
  }

  /** the hint bar for the mode we are in */
  private hintsHtml(): string {
    if (!prefs.hints && this.mode === 'solve') return '<span class="spacer"></span><span class="hint dim"><kbd>?</kbd> manual</span>';
    if (this.mode === 'write') {
      return `<span class="hint"><kbd>Enter</kbd> ${this.writing === 'new' && this.slots.length ? 'add to the system' : 'start solving'}</span><span class="hint"><kbd>Esc</kbd> cancel</span><span class="aside">Type like <i>3x/7 + 2 = y</i>, <i>x^2</i>, <i>sqrt(x)</i>, <i>ln(x)</i>, <i>|x − 1|</i>, <i>e^x</i>, or paste LaTeX.</span>`;
    }
    if (this.mode === 'labels') return `<span class="aside">Press a letter to aim. <kbd>Esc</kbd> to cancel.</span>`;
    if (this.mode === 'hub') {
      const h = this.hub;
      return h?.awaitVar ? '<span class="aside">Solve for which letter? Press it, or <kbd>Esc</kbd>.</span>'
        : h?.calc ? `<span class="aside">Calculus: press a key to use it now, <kbd>←</kbd><kbd>→</kbd> for the sections and <kbd>↓</kbd> into one, then ${h.sticky ? '<kbd>C</kbd> to apply. <kbd>Esc</kbd> closes.' : 'release to apply.'}</span>`
        : h?.sticky ? '<span class="aside">Algebra: press a key to use it now, or <kbd>←</kbd><kbd>→</kbd> to browse forms and <kbd>Tab</kbd> to apply. <kbd>Esc</kbd> closes.</span>'
        : '<span class="aside">Holding <kbd>Tab</kbd>: press a key to use it now, or <kbd>←</kbd><kbd>→</kbd> to browse forms and release to apply.</span>';
    }
    if (this.mode === 'fnpal') return `<span class="aside">Type in the box: <i>f(4)</i> or <i>f(x² + 1)</i> puts it into your function; a function (<i>ln</i>, <i>e^_</i>) goes on both sides. <kbd>i</kbd> undoes the outer one. <kbd>Esc</kbd> cancels.</span>`;
    if (this.mode === 'fnask') return `<span class="aside">Type the number. The preview is live. <kbd>Enter</kbd> applies, <kbd>Esc</kbd> goes back.</span>`;
    if (this.mode === 'op') return `<span class="aside">${({ both: 'Type what to apply to both sides.', name: 'Type a name: a letter (u), a function (I(t), or I(5) to make the 5 its letter), or what it equals.', value: 'Type a value: 0, t = 0, or a = 1, b = 2.', divide: 'Type the factor to take out.', one: 'Type what to multiply by over itself.', as: 'Edit it into the form you want; it goes in only if it is equal.' })[this.opKind]} The preview is live. <kbd>Enter</kbd> applies, <kbd>Esc</kbd> cancels.</span>`;
    const parts: string[] = [];
    const node = this.sel && this.sel !== 'eq' ? find(this.eq, this.sel) : null;
    parts.push(`<span class="what" data-text="${node ? escapeHtml(toText(node)) : ''}">${node ? escapeHtml(pretty(toText(node))) : this.sel === 'eq' ? 'whole equation' : 'nothing aimed'}</span>`);
    if (!this.sel) {
      parts.push(`<span class="hint"><kbd class="wide">Space</kbd> aim</span><span class="hint"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> walk</span>`);
    } else {
      const m = moveAny(this.eq, this.sel);
      if (!isErr(m)) parts.push(`<span class="hint"><kbd>m</kbd> <span class="ml">${escapeHtml(pretty(m.label))}</span></span>`);
      for (const k of MOVE_KEYS.slice(1)) {
        if (k.name !== 'any' && !isErr(applyMove(k.name, this.eq, this.sel))) parts.push(`<span class="hint"><kbd>${k.key}</kbd> ${k.verb}</span>`);
      }
      // Shift slides through ∫ Σ d/dx lim: say where, since it is more than a reorder there; ↑ ↓ move up and down through the notation
      // (↑ ↓ label from the move itself: checking it here would integrate numerically on every aim)
      for (const [name, arrow] of [['slideL', '←'], ['slideR', '→'], ['lift', '↑'], ['drop', '↓']] as const) {
        const r = name === 'lift' || name === 'drop' ? previewMove(name, this.eq, this.sel) : applyMove(name, this.eq, this.sel);
        if (!isErr(r) && r.label !== 'reorder') parts.push(`<span class="hint"><kbd class="wide">⇧${arrow}</kbd> <span class="ml">${escapeHtml(pretty(r.label))}</span></span>`);
      }
    }
    parts.push(`<span class="hint"><kbd>=</kbd><kbd>-</kbd><kbd>.</kbd><kbd>/</kbd> both sides</span><span class="hint"><kbd>Tab</kbd> algebra</span><span class="hint"><kbd>C</kbd> calculus</span><span class="hint"><kbd>e</kbd> solve</span><span class="hint"><kbd>f</kbd> functions</span>`);
    parts.push(`<span class="spacer"></span><span class="hint dim"><kbd>u</kbd> undo</span><span class="hint dim"><kbd>?</kbd> manual</span>`);
    return parts.join('');
  }

  say(text: string, bad = false) {
    this.message = { text: pretty(text), bad };
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
    if (id) $('sel').animate(resist, { duration: 300, easing: 'cubic-bezier(.3,.7,.3,1)', composite: 'add' });
    this.tour?.check('refuse');
  }

  /* ---------------- state changes ---------------- */

  commit(src: string, quiet = false) {
    let eq: Eq;
    // the preview, when it is what you typed (brackets closed); otherwise the text itself, so nothing typed is lost
    try { eq = this.preview && !quiet && livePreview(src)?.whole ? this.preview : parseEquation(src, true); }
    catch (e) { this.refuse(this.preview && symbols(this.preview).includes('□') ? 'Fill in the □ first: it marks what is still missing.' : (e as Error).message); return; }
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
    field('input').blur();
    this.stage.clear();
    this.renderAll(null);
    if (!quiet) this.entrance();
    this.save();
    const rel = relOf(eq);
    if (quiet) this.say('Space aims. m moves it across. = − . / do anything to both sides. Hold Tab for algebra, f for functions, e solves. ? shows every key.');
    else if (rel === '≟') this.say('Both sides agree for every value: an identity. Prove it by rewriting one side at a time until they match.');
    else if (rel === 'def' && eq.lhs.k === 'call') this.say(`Defined ${eq.lhs.name}. Use ${eq.lhs.name}(…) in other equations; hold Tab + u to unfold it, Tab + b for its inverse.`);
    else if (rel === 'expr' && hasCalc(eq)) this.say('Hold C for the next rule (its name shows on the key), or press e to work it all out.');
    else if (rel === 'expr') this.say('An expression: rewrite it with s, d, e and f, or hold C for calculus. Add “= …” to make it an equation.');
    else if (this.slots.length > 1) this.say(`Equation ${this.cur + 1}. Press 1–${this.slots.length} to switch between them.`);
  }

  entrance() {
    const els = [...$('stage').querySelectorAll('.g')];
    els.forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: i * 14, easing: SMOOTH, fill: 'backwards' }));
  }

  apply(r: CheckedResult, pitch = 1, opts: { quietLabel?: boolean } = {}) {
    if (isErr(r)) { this.refuse(r.error); return false; }
    // a group that lands inside a sum (or product) of its own kind melts into it; remember its ends,
    // so the aim stays on exactly what moved instead of growing to the whole side
    const run = runOf(r.eq, r.select ?? null);
    r = { ...r, eq: ungroup(r.eq) };
    this.grouped = null;
    const before = this.eq;
    const wasSolved = solvedFor(before);
    const link = this.linkNext, out: { again: boolean; back?: number } = { again: false };
    this.linkNext = null;
    const { answer } = sheet.addStep(this, r, { link, out });
    // the aim follows the work, so the arrows keep going without a fresh Space
    this.sel = nav.aimAfter(before, this.eq, this.sel, out.back ? (r.select ? nav.carryAim(r.eq, this.eq, r.select) : undefined) : r.select);
    if (run && find(this.base, run[0]) && find(this.base, run[1])) {
      const g = group(this.base, run);
      if (!('error' in g) && g.eq !== this.base) { this.grouped = { base: this.base, eq: g.eq, id: g.id, anchor: run[0], head: run[1] }; this.sel = g.id; }
    }
    sound.move(pitch);
    // judged first, so a wrong answer is drawn as one
    const now = solvedFor(r.eq);
    const bad = now ? this.judge(this.cur) : null;
    this.renderAll({ focus: r.focus, absorbs: r.hints.absorbs, flights: r.hints.flights }, true, !r.implies);
    if (!opts.quietLabel) this.bubble(r.label, false, r.focus ?? this.sel);
    // a round trip shows as ↺n on the step in the tree; no words needed
    if (!out.back && out.again && !r.auto) this.say('Same as a step you already took, so you are back on it (the tree keeps one of each).');
    if (relOf(r.eq) === '≟' && isProved(r.eq)) { setTimeout(() => sound.solved(), 140); this.say('Both sides match. Proved ∎'); $('stage').classList.add('solved'); setTimeout(() => $('stage').classList.remove('solved'), 900); this.save(); return true; }
    if (answer) this.say(answer);
    // crossed out: a beat to see the strokes, then what was crossed out goes (a step of its own)
    if (r.rule === 'cross out what cancels') { const at = this.eq; this.later(ms(560), () => { if (this.eq !== at) return; const d = dropStruck(this.eq); if (d && !isErr(d)) this.apply(d, 1.2); }); }
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
  play(steps: Checked[], done?: () => void) {
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
    const from = this.at;
    if (!sheet.undo(this)) { this.refuse('Nothing to undo. This is the original.'); return; }
    this.afterJump(this.played(this.at + 1, from, true));
  }

  redo() {
    const from = this.at;
    if (!sheet.redo(this)) { this.refuse('Nothing to redo.'); return; }
    this.afterJump(this.played(from + 1, this.at, false));
  }

  /** the moves of steps a..b played again (redo), or backwards (undo): what merged comes back
   *  out of what swallowed it, and what was copied in goes back where it came from */
  played(a: number, b: number, back: boolean): Transition {
    const tr: Transition = { quick: true, absorbs: new Map(), flights: [], emerge: new Map() };
    for (let i = a; i <= b; i++) {
      const fx = this.steps[i]?.fx;
      if (!fx) continue;
      for (const [x, y] of fx.absorbs) { if (back) tr.emerge!.set(x, y); else tr.absorbs!.set(x, y); }
      for (const f of fx.flights) { if (back) tr.absorbs!.set(f.to, f.from); else tr.flights!.push(f); }
    }
    return tr;
  }

  afterJump(tr: Transition = { quick: true }) {
    if (this.sel && !find(this.eq, this.sel)) this.sel = null;
    sound.undo();
    this.renderAll(tr, true);
    this.save();
  }

  setMode(m: Mode) {
    this.mode = m;
    // typing over a definition may change it; anywhere else f(…) = … with f taken is an equation about f
    const own = m === 'write' && this.writing === 'edit' ? this.slot?.steps.find(st => relOf(st.eq) === 'def')?.eq.lhs : null;
    setRedefining(own?.k === 'call' ? own.name : null);
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
  /** forms you said to keep (q): their marks stay off, here and in later steps, until q brings them back */
  kept = new Set<string>();

  /** mark what could simplify with dashed boxes and a small prompt; nothing changes until you press s */
  renderSpot() {
    const host = $('spots');
    host.replaceChildren();
    this.spot = this.mode === 'solve' && !this.peek && !this.preview && this.eq ? simplifySpot(this.eq, this.kept) : null;
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
    chip.innerHTML = '<kbd>s</kbd> simplify <span class="spot-keep"><kbd>q</kbd> keep</span>';
    chip.title = 'Simplify the marked part (s), or keep it as written (q)';
    const x = Math.min(...boxes.map(b => b.x)), x2 = Math.max(...boxes.map(b => b.x + b.w));
    chip.style.left = `${(x + x2) / 2}px`;
    chip.style.top = `${first.y + first.h + p + 10}px`;
    chip.addEventListener('mousedown', e => { e.stopPropagation(); if ((e.target as HTMLElement).closest('.spot-keep')) this.keepForm(); else this.simplifyKey(true); });
    host.append(chip);
  }

  /** q: leave the marked piece as written; its marks stay off (q with none marked brings them all back) */
  keepForm() {
    if (this.spot) {
      const n = find(this.eq, this.spot.node);
      if (n) this.kept.add(key(n));
      sound.tick(0);
      this.renderSpot();
      return this.say(this.spot ? 'Kept as written. Another piece could simplify: q keeps that one too.' : 'Kept as written. s on it still simplifies it; q again brings the marks back.');
    }
    if (this.kept.size) { this.kept.clear(); this.renderSpot(); return this.say('Simplify marks are back.'); }
    this.refuse('Nothing is marked to simplify.');
  }

  /** s: simplify what is aimed if it can, otherwise take the offered simplification */
  simplifyKey(offered = false) {
    if (!offered && this.sel) {
      const r = applyMove('simplify', this.eq, this.sel);
      if (!isErr(r)) return this.apply(r, 1.2);
    }
    if (this.spot) return this.apply(this.spot.move, 1.2);
    const other = formsFor(this.eq, this.sel).length;
    this.refuse(other ? 'Nothing left to simplify. Other forms (factored, divided out…) are under Tab.' : 'Already as simple as it gets.');
  }

  /* ---------------- the system of equations ---------------- */

  switchTo(i: number) {
    if (i < 0 || i >= this.slots.length) { this.refuse(`There is no equation ${i + 1}. Press n to add one.`); return; }
    if (i === this.cur) return;
    if (this.mode === 'write') this.cancelEdit();
    const host = $('stage').getBoundingClientRect();
    const from = this.tree.elOf(i, visibleAt(this.slots[i]))?.querySelector<HTMLElement>('.mini')?.getBoundingClientRect();
    const eqBox = this.stage.box('eq');
    const old = this.cur;
    this.cur = i;
    // a message about the equation you left ("Equation 2. …") doesn't hold for this one
    this.message = null;
    sound.tick(1);
    this.stage.clear();
    this.renderAll(null);
    const to = this.stage.box('eq');
    if (from && to && from.width) {
      // every glyph starts where it sat in the small card and grows into place
      const k = from.width / to.w;
      $('stage').querySelectorAll<HTMLElement>('.g').forEach(el => {
        // (an svg glyph, like ∫ or a bracket, has no offsetLeft)
        const r = el.getBoundingClientRect(), gx = r.left - host.left, gy = r.top - host.top;
        const sx = from.left - host.left + (gx - to.x) * k, sy = from.top - host.top + (gy - to.y) * k;
        el.animate([{ transform: `translate(${sx - gx}px, ${sy - gy}px) scale(${k})`, opacity: 0.6 }, { transform: 'none', opacity: 1 }], { duration: ms(340), easing: SMOOTH });
      });
    } else this.entrance();
    // and the equation you left shrinks into its step in the tree
    const card = this.slots[old] ? this.tree.elOf(old, visibleAt(this.slots[old]))?.querySelector<HTMLElement>('.mini') : null;
    if (card && eqBox) {
      const c = card.getBoundingClientRect(), k = eqBox.w / c.width;
      card.animate([{ transform: `translate(${host.left + eqBox.x - c.left}px, ${host.top + eqBox.y - c.top}px) scale(${k})`, transformOrigin: '0 0', opacity: 0.3 }, { transform: 'none', transformOrigin: '0 0', opacity: 1 }], { duration: ms(340), easing: SMOOTH });
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
    $('sel').querySelector('.sf')?.animate([{ boxShadow: `${dir < 0 ? '-6px' : '6px'} 0 0 -1px var(--sel)` }, { boxShadow: '0 0 0 0 transparent' }], { duration: ms(260), easing: 'ease-out' });
  }

  /** e: solve. Aimed at a variable (or only one variable): straight to the answer; otherwise pick one */
  /** the one rate (dy/dt) left in an equation of values at an instant, the only unknown in it */
  instantRate(): string | null {
    if (this.slot?.steps[0].rule !== 'put in a value' || relOf(this.eq) !== '=') return null;
    const rates = new Set<string>();
    walk(this.eq, n => { if (n.k === 'frac' && n.num.k === 'sym' && n.den.k === 'sym' && isDiff(n.num.name) && isDiff(n.den.name)) rates.add(`${n.num.name}/${n.den.name}`); });
    const loose = symbols(this.eq).filter(w => !isDiff(w));
    return rates.size === 1 && !loose.length ? [...rates][0] : null;
  }

  solveKey() {
    // calculus to work out, or a u to put back
    if (hasCalc(this.eq) || Object.keys(this.substitutions()).some(u => symbols(this.eq).includes(u))) return this.finishCalculus();
    if (relOf(this.eq) === '=' && (isVector(this.eq.lhs) || isVector(this.eq.rhs))) return this.splitComponents();
    // at one instant (values put in with p), a rate is a number to find, not a function to solve for
    const inst = this.instantRate();
    if (inst) return this.solveFor(inst);
    if (odeKind(asPrime(this.eq), slopeVar(this.eq)) || hasDifferentials(this.eq)) return this.solveOde();
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
    if (!vars.length) {
      // 2 = 3 has nothing to solve, but it can still be judged
      const a = evaluate(this.eq.lhs, {}), b = evaluate(this.eq.rhs, {}), r = relOf(this.eq), d = a - b, tol = 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
      const holds = r === '=' ? Math.abs(d) < tol : r === '<' ? d < -tol : r === '>' ? d > tol : r === '≤' ? d < tol : r === '≥' ? d > -tol : null;
      return this.refuse(holds === null || !isFinite(d) ? 'No letter to solve for.' : `No letter to solve for, and ${toText(this.eq)} is ${holds ? 'true' : 'false'}.`);
    }
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
    const input = field('input');
    this.writing = blank ? 'new' : 'edit';
    this.setMode('write');
    this.sel = null;
    input.setLatex(blank ? '' : toLatex(this.eq));
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
    field('input').blur();
    this.setMode('solve');
    this.renderAll(null);
  }

  onType() {
    const src = field('input').value;
    clearTimeout(this.typingTimer);
    const err = $('input-error');
    err.textContent = '';
    const got = livePreview(src);
    $('stage').classList.toggle('preview', !!got && got.partial);
    const kind = got ? ({ '=': 'equation', 'expr': 'expression', 'def': 'function', '≟': 'proof' } as Record<string, string>)[relOf(got.eq)] ?? 'inequality' : '';
    // ≠, floor, a second inequality: more typing won't fix these, so say so now, not after a pause
    let sure = '';
    if (!got || got.partial) try { parseEquation(src, true); } catch (e) { if (e instanceof ParseError && e.sure) sure = e.message; }
    err.textContent = sure;
    $('input-state').innerHTML = !got || sure ? '' : got.partial ? '<span class="wip">keep going…</span>' : `<span class="ok">✓ ${kind}</span><kbd>Enter</kbd>`;
    if (!got) {
      // nothing readable yet: keep what was there, explain only if you stop typing
      if (src.trim()) this.typingTimer = window.setTimeout(() => { try { parseEquation(src, true); } catch (e) { err.textContent = (e as Error).message; } }, 900);
      return;
    }
    this.preview = got.eq;
    this.renderMain(null);
    // a □ still to fill isn't a variable: keep the last graph until it is
    // and graph it once you pause: a ∫ or Σ half typed can cost a lot to draw, every key
    clearTimeout(this.graphTimer);
    if (!symbols(got.eq).includes('□')) { const g = got.eq; this.graphTimer = window.setTimeout(() => { if (this.preview === g) this.graph.draw(g, false); }, 260); }
    this.renderRail();
    if (got.partial) this.typingTimer = window.setTimeout(() => { try { parseEquation(src, true); } catch (e) { err.textContent = (e as Error).message; } }, 1400);
  }

  /* ---------------- pop-ups and theme ---------------- */

  /** sit a floating panel above the aimed piece (or the equation), inside the stage */
  /** a menu or box beside the equation, never on it: above if it fits, else below, else on the
   *  roomier side with its height capped there (it scrolls), so the math always stays in view */
  place(host: HTMLElement): void {
    host.style.maxHeight = '';
    host.style.overflowY = '';
    const piece = this.sel && this.sel !== 'eq' ? this.stage.box(this.sel) : null;
    const whole = this.stage.box('eq') ?? piece;
    const W = $('stage').clientWidth, H = $('stage').clientHeight;
    const hw = host.offsetWidth, hh = host.offsetHeight;
    const cx = (piece ?? whole) ? (piece ?? whole)!.x + (piece ?? whole)!.w / 2 : W / 2;
    const x = Math.max(12, Math.min(W - hw - 12, cx - hw / 2));
    let y = 40;
    if (whole) {
      const gap = 18, edge = 8;
      const top = whole.y - gap - edge, bottom = H - (whole.y + whole.h) - gap - edge;
      if (hh <= top) y = whole.y - gap - hh;
      else if (hh <= bottom) y = whole.y + whole.h + gap;
      else if (!this.room && Math.min(top, bottom) > 0) {
        // no room either side: the equation glides toward the far edge to make some, then try again
        this.room = top >= bottom ? bottom : -top;
        this.renderMain({ quick: true });
        return this.place(host);
      } else if (!host.classList.contains('tight')) {
        // still no room: the menu draws itself tighter and tries again
        host.classList.add('tight');
        return this.place(host);
      } else {
        const room = Math.max(top, bottom, 120);
        host.style.maxHeight = `${room}px`;
        host.style.overflowY = 'auto';
        y = top >= bottom ? Math.max(edge, whole.y - gap - room) : whole.y + whole.h + gap;
      }
    }
    host.style.left = `${x}px`;
    host.style.top = `${y}px`;
  }

  /** a menu closed: the equation glides back, unless something else has drawn it since */
  giveBackRoom() {
    if (!this.room) return;
    this.room = 0;
    const n = this.renders;
    requestAnimationFrame(() => { if (this.renders === n) this.renderMain({ quick: true }); });
  }

  bubble(text: string, bad: boolean, id: string | null = this.sel) {
    const r = (id ? this.stage.box(id) : null) ?? this.stage.box('eq');
    if (!r) return;
    // one move name at a time: a quick run of moves replaces the last name instead of piling up
    $('stage').querySelectorAll('.bubble').forEach(x => x.remove());
    const b = document.createElement('div');
    b.className = 'bubble' + (bad ? ' bad' : '');
    b.append(mathLabel(pretty(text), 13));
    b.style.left = `${r.x + r.w / 2}px`;
    b.style.top = `${r.y - 14}px`;
    $('stage').append(b);
    const life = bad ? 2600 : 1100;
    b.animate([{ opacity: 0, transform: 'translate(-50%, -80%) scale(.92)' }, { opacity: 1, transform: 'translate(-50%, -100%)' }], { duration: 160, easing: SMOOTH, fill: 'both' });
    // kept inside the stage, measured next frame: reading its width now would lay out the whole
    // page in the middle of the key press, before the rest of the press has changed it
    requestAnimationFrame(() => {
      const W = $('stage').clientWidth, w = b.offsetWidth;
      b.style.left = `${Math.max(12 + w / 2, Math.min(W - 12 - w / 2, r.x + r.w / 2))}px`;
    });
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
    if (k === 'accent') applyAccent();
    if (k === 'look') applyLook();
    if (k === 'speed' || k === 'tempo') { applySpeed(); this.flashLabel(); }
    if (k === 'graphAt') applyPanels();
    if (k === 'muted') { $('sound').classList.toggle('off', prefs.muted); $('sound').setAttribute('aria-pressed', String(!prefs.muted)); }
    if (['theme', 'look', 'size', 'hints', 'accent'].includes(k) && this.shown) { this.stage.clear(); this.renderAll(null); }
  }

}

/** the methods that live in their own files */
type Part<M> = { [K in keyof M]: M[K] };
/** the first and last pieces of a group that ungroup() will melt into the sum or product around it */
function runOf(e: Eq, id: string | null): [string, string] | null {
  const path = id ? findPath(e, id) : null;
  if (!path || path.length < 3) return null;
  const n = path[path.length - 1], parent = path[path.length - 2];
  if (!((n.k === 'add' && parent.k === 'add') || (n.k === 'mul' && parent.k === 'mul'))) return null;
  const ks = children(n);
  return ks.length > 1 ? [ks[0].id, ks[ks.length - 1].id] : null;
}

export interface App extends Part<typeof opsPart>, Part<typeof hubPart>, Part<typeof fnpalPart>, Part<typeof solvingPart>, Part<typeof keysPart>, Part<typeof persistPart>, Part<typeof calcPart>, Part<typeof generalPart>, Part<typeof replayPart> {}
for (const part of [opsPart, hubPart, fnpalPart, solvingPart, keysPart, persistPart, calcPart, generalPart, replayPart]) Object.assign(App.prototype, part);

/** solved for a letter, but what it equals has no finite value (∫₀¹ dx/x, a limit that doesn't exist) */
const valueless = new Map<string, boolean>();
function noValue(e: Eq): boolean {
  const v = solvedFor(e);
  if (!v) return false;
  const r = e.lhs.k === 'sym' && e.lhs.name === v ? e.rhs : e.lhs;
  if (symbols(r).length) return false;
  const k = key(r) + '|' + defsSig.v;
  if (!valueless.has(k)) valueless.set(k, !Number.isFinite(evaluate(r, {})));
  return valueless.get(k)!;
}
