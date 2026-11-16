import { Eq, Node, find, findPath, children, bumpIds, symbols } from '../engine/ast';
import { parseEquation, ParseError } from '../engine/parse';
import { toText } from '../engine/print';
import { applyMove, applyBothChecked, isErr, MoveName, MoveOk, solvedFor } from '../engine/moves';
import { layout, Rect } from '../render/layout';
import { Stage, Transition } from '../render/stage';
import { Graph } from './graph';
import { sound } from './sound';

interface Step { eq: Eq; label: string; conditions: string[] }
type Mode = 'write' | 'solve' | 'labels' | 'op';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const MOVE_KEYS: { key: string; name: MoveName; verb: string; pitch: number }[] = [
  { key: 'm', name: 'move', verb: 'move across', pitch: 1 },
  { key: '/', name: 'divide', verb: 'divide both', pitch: 0.9 },
  { key: '*', name: 'multiply', verb: 'multiply both', pitch: 0.95 },
  { key: 'd', name: 'distribute', verb: 'distribute', pitch: 1.1 },
  { key: 's', name: 'simplify', verb: 'simplify', pitch: 1.2 },
  { key: 'F', name: 'factor', verb: 'factor out', pitch: 0.85 },
  { key: 'H', name: 'slideL', verb: 'slide left', pitch: 1.3 },
  { key: 'L', name: 'slideR', verb: 'slide right', pitch: 1.3 },
  { key: 'x', name: 'swap', verb: 'swap sides', pitch: 0.8 },
];

const LABEL_CHARS = 'asdfghjklqwertyuiopzxcvbnm';

export class App {
  steps: Step[] = [];
  at = 0;
  sel: string | null = null;
  mode: Mode = 'write';
  private memory = new Map<string, string>(); // parent id → child we came up from
  private stage: Stage;
  private graph: Graph;
  private labels = new Map<string, string>();
  private typed = '';
  private message: { text: string; bad: boolean } | null = null;
  private messageTimer = 0;
  private preview: Eq | null = null;
  private typingTimer = 0;

  constructor() {
    this.stage = new Stage($('stage'));
    this.graph = new Graph($<HTMLCanvasElement>('graph'), $('graph-note'));
    this.bind();
    let size = '';
    new ResizeObserver(() => {
      const st = $('stage'), next = `${st.clientWidth}x${st.clientHeight}`;
      if (next !== size) { size = next; this.renderMain(null); }
    }).observe($('stage'));
    if (!this.restore()) this.commit('7y + 3x = 20', true);
  }

  get eq(): Eq { return this.preview ?? this.steps[this.at]?.eq; }
  get step(): Step { return this.steps[this.at]; }

  /* ---------------- rendering ---------------- */

  renderMain(tr: Transition | null) {
    const eq = this.eq;
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
    host.classList.toggle('preview', !!this.preview);
    this.renderSelection();
  }

  renderSelection() {
    const el = $('sel');
    const r = this.sel ? this.stage.box(this.sel) : null;
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
    if (this.eq) this.graph.draw(this.eq, graphAnim);
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
    $('redo-count').textContent = this.at < this.steps.length - 1 ? `${this.steps.length - 1 - this.at} ahead, U to redo` : '';
  }

  renderHints() {
    const host = $('hints');
    host.classList.toggle('msg', !!this.message);
    host.classList.toggle('bad', !!this.message?.bad);
    if (this.message) { host.textContent = this.message.text; return; }
    if (this.mode === 'write') {
      host.innerHTML = `<span class="hint"><kbd>Enter</kbd> start solving</span><span class="hint"><kbd>Esc</kbd> cancel</span><span class="aside">Type like <i>3x/7 + 2 = y</i>, <i>x^2</i>, <i>sqrt(x)</i>, or paste LaTeX.</span>`;
      return;
    }
    if (this.mode === 'labels') { host.innerHTML = `<span class="aside">Press a letter to aim. <kbd>Esc</kbd> to cancel.</span>`; return; }
    if (this.mode === 'op') { host.innerHTML = `<span class="aside">Start with + − * or /. <kbd>Enter</kbd> applies to both sides.</span>`; return; }
    const parts: string[] = [];
    const node = this.sel && this.sel !== 'eq' ? find(this.eq, this.sel) : null;
    parts.push(`<span class="what">${node ? escapeHtml(toText(node)) : this.sel === 'eq' ? 'whole equation' : 'nothing aimed'}</span>`);
    if (!this.sel) {
      parts.push(`<span class="hint"><kbd>f</kbd> aim</span><span class="hint"><kbd>h</kbd><kbd>j</kbd><kbd>k</kbd><kbd>l</kbd> walk</span><span class="hint"><kbd>s</kbd> simplify all</span><span class="hint"><kbd>o</kbd> both sides</span>`);
    } else {
      for (const m of MOVE_KEYS) {
        const ok = !isErr(applyMove(m.name, this.eq, this.sel));
        if (ok) parts.push(`<span class="hint"><kbd>${m.key}</kbd> ${m.verb}</span>`);
      }
      parts.push(`<span class="hint dim"><kbd>o</kbd> both sides</span>`);
    }
    parts.push(`<span class="spacer"></span><span class="hint dim"><kbd>u</kbd> undo</span><span class="hint dim"><kbd>?</kbd> keys</span>`);
    host.innerHTML = parts.join('');
  }

  say(text: string, bad = false) {
    this.message = { text, bad };
    clearTimeout(this.messageTimer);
    this.renderHints();
    this.messageTimer = window.setTimeout(() => { this.message = null; this.renderHints(); }, bad ? 3200 : 1800);
  }

  refuse(text: string) {
    sound.refuse();
    this.say(text, true);
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
    clearTimeout(this.typingTimer);
    $('input-error').textContent = '';
    this.steps = [{ eq, label: 'start', conditions: [] }];
    this.at = 0;
    this.sel = null;
    this.setMode('solve');
    if (!quiet) sound.commit();
    $<HTMLInputElement>('input').blur();
    this.renderAll(null);
    if (!quiet) this.entrance();
    this.save();
    if (quiet) this.say('Press f to aim at a term, then a move key. ? shows every key.');
  }

  private entrance() {
    const els = [...$('stage').querySelectorAll('.g')];
    els.forEach((el, i) => el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: i * 14, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }));
  }

  apply(r: MoveOk | { error: string }, pitch = 1) {
    if (isErr(r)) { this.refuse(r.error); return; }
    const before = this.eq;
    const wasSolved = solvedFor(before);
    const conditions = [...new Set([...this.step.conditions, ...(r.conditions ?? [])])];
    this.steps = this.steps.slice(0, this.at + 1);
    this.steps.push({ eq: r.eq, label: r.label, conditions });
    this.at++;
    this.sel = r.select !== undefined ? (r.select && find(r.eq, r.select) ? r.select : null) : this.sel && find(r.eq, this.sel) ? this.sel : null;
    sound.move(pitch);
    this.renderAll({ focus: r.focus, absorbs: r.hints.absorbs, flights: r.hints.flights }, true);
    const now = solvedFor(r.eq);
    if (now && now !== wasSolved) { setTimeout(() => sound.solved(), 140); this.say(`Solved for ${now}.`); $('stage').classList.add('solved'); setTimeout(() => $('stage').classList.remove('solved'), 900); }
    if (r.conditions?.length) this.say(`Assuming ${r.conditions.join(', ')}. Noted on the left.`);
    this.save();
  }

  undo() {
    if (this.at === 0) { this.refuse('Nothing to undo. This is the original.'); return; }
    this.at--;
    if (this.sel && !find(this.eq, this.sel)) this.sel = null;
    sound.undo();
    this.renderAll({ quick: true }, true);
    this.save();
  }

  redo() {
    if (this.at >= this.steps.length - 1) { this.refuse('Nothing to redo.'); return; }
    this.at++;
    if (this.sel && !find(this.eq, this.sel)) this.sel = null;
    sound.undo();
    this.renderAll({ quick: true }, true);
    this.save();
  }

  jump(i: number) {
    if (i === this.at) return;
    this.at = i;
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

  /* ---------------- input ---------------- */

  edit(blank: boolean) {
    const input = $<HTMLInputElement>('input');
    this.setMode('write');
    this.sel = null;
    input.value = blank ? '' : toText(this.eq, true);
    input.focus();
    input.select();
    $('input-error').textContent = '';
    this.renderAll(null);
  }

  cancelEdit() {
    if (!this.steps.length) return;
    this.preview = null;
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

  openOp() {
    this.setMode('op');
    const box = $('op');
    const input = $<HTMLInputElement>('op-input');
    input.value = '';
    box.hidden = false;
    input.focus();
    this.renderHints();
  }

  closeOp() {
    $('op').hidden = true;
    $<HTMLInputElement>('op-input').blur();
    this.setMode('solve');
    this.renderHints();
  }

  /* ---------------- keys ---------------- */

  bind() {
    const input = $<HTMLInputElement>('input');
    input.addEventListener('input', () => this.onType());
    input.addEventListener('focus', () => { if (this.mode !== 'write') { this.setMode('write'); this.sel = null; this.renderAll(null); } });
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); this.commit(input.value); }
      if (e.key === 'Escape') { e.preventDefault(); this.cancelEdit(); }
    });
    const op = $<HTMLInputElement>('op-input');
    op.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.closeOp(); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const r = applyBothChecked(this.eq, op.value);
        if (isErr(r)) { this.refuse(r.error); return; }
        this.closeOp();
        this.apply(r, 1.05);
      }
    });
    $('original').addEventListener('click', () => this.edit(false));
    $('trail').addEventListener('mousedown', e => e.stopPropagation());
    $('stage').addEventListener('mousedown', e => this.click(e));
    $('help-close').addEventListener('click', () => this.toggleHelp(false));
    $('sound').addEventListener('click', () => this.toggleSound());
    window.addEventListener('keydown', e => this.key(e));
  }

  click(e: MouseEvent) {
    if (this.mode === 'write') this.cancelEdit();
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
    if (this.mode === 'write' || this.mode === 'op') return;
    if (!$('help').hidden) { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); this.toggleHelp(false); } return; }
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    if (this.mode === 'labels') {
      e.preventDefault();
      if (k === 'Escape') { this.setMode('solve'); this.renderHints(); return; }
      if (/^[a-z]$/.test(k)) this.labelKey(k);
      else { this.setMode('solve'); this.renderHints(); }
      return;
    }
    if (ctrl) {
      if (k.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); this.undo(); }
      else if ((k.toLowerCase() === 'z' && e.shiftKey) || k === 'y' || k === 'r') { e.preventDefault(); this.redo(); }
      return;
    }
    const move = MOVE_KEYS.find(m => m.key === k);
    const handled = () => e.preventDefault();
    if (move) { handled(); return this.apply(applyMove(move.name, this.eq, this.sel), move.pitch); }
    switch (k) {
      case 'f': handled(); return this.showLabels();
      case 'h': case 'ArrowLeft': handled(); return e.shiftKey ? this.apply(applyMove('slideL', this.eq, this.sel)) : this.sideways(-1);
      case 'l': case 'ArrowRight': handled(); return e.shiftKey ? this.apply(applyMove('slideR', this.eq, this.sel)) : this.sideways(1);
      case 'k': case 'ArrowUp': handled(); return this.grow();
      case 'j': case 'ArrowDown': handled(); return this.shrink();
      case 'Tab': handled(); return this.toggleSide();
      case 'a': handled(); return this.select('eq');
      case 'Escape': handled(); return this.select(null, true);
      case 'u': handled(); return this.undo();
      case 'U': handled(); return this.redo();
      case 'o': handled(); return this.openOp();
      case 'e': case 'Enter': handled(); return this.edit(false);
      case 'n': handled(); return this.edit(true);
      case '?': handled(); return this.toggleHelp();
      case 'M': handled(); return this.toggleSound();
      case '[': handled(); return this.graph.zoom(1.25);
      case ']': handled(); return this.graph.zoom(0.8);
    }
  }

  /* ---------------- persistence ---------------- */

  save() {
    try { localStorage.setItem('algebrix.session', JSON.stringify({ steps: this.steps, at: this.at })); } catch { /* storage blocked */ }
  }

  restore(): boolean {
    try {
      const raw = localStorage.getItem('algebrix.session');
      if (!raw) return false;
      const s = JSON.parse(raw) as { steps: Step[]; at: number };
      if (!s.steps?.length) return false;
      s.steps.forEach(st => bumpIds(st.eq));
      this.steps = s.steps;
      this.at = Math.min(s.at, s.steps.length - 1);
      this.setMode('solve');
      this.renderAll(null);
      return true;
    } catch { return false; }
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
