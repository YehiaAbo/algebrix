// The library (w): every workspace as a card with its equations drawn small.
// Arrows move, Enter opens, n new, r rename, d duplicate, Delete twice removes.
import { Eq, bumpIds } from '../engine/ast';
import { layout } from '../render/layout';
import { Stage } from '../render/stage';
import { works, Work } from './works';
import { sound } from './sound';

interface SlotLike { steps: { eq: Eq; answer?: string }[]; at: number; bad?: string }

export interface LibraryHost {
  /** the open workspace, saved before the library shows */
  readonly workId: string;
  saveNow(): void;
  open(id: string): void;
  create(): void;
  /** the open one was removed: open another (or a fresh one) */
  afterRemove(): void;
}

const $ = (id: string) => document.getElementById(id)!;

function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'yesterday' : d < 30 ? `${d} days ago` : new Date(t).toLocaleDateString();
}

export class Library {
  private i = 0;
  private items: Work<SlotLike>[] = [];
  private armed = { id: '', at: 0 };
  private renaming: string | null = null;

  constructor(private host: LibraryHost) {
    $('library').addEventListener('mousedown', e => { if (e.target === $('library')) this.close(); });
    $('lib-close').addEventListener('click', () => this.close());
  }

  get isOpen() { return !$('library').hidden; }

  open() {
    this.host.saveNow();
    $('library').hidden = false;
    this.render();
    const at = this.items.findIndex(w => w.id === this.host.workId);
    this.focus(at < 0 ? 0 : at + 1);
    sound.labels();
  }

  close() { $('library').hidden = true; this.renaming = null; }
  toggle() { if (this.isOpen) this.close(); else this.open(); }

  /** cards in reading order: index 0 is "new", then workspaces, newest first */
  private render() {
    this.items = works.list<SlotLike>();
    const grid = $('lib-grid');
    grid.replaceChildren();
    const add = document.createElement('button');
    add.className = 'lib-card lib-new';
    add.innerHTML = `<span class="lib-plus">+</span><span>New workspace</span><kbd>n</kbd>`;
    add.addEventListener('click', () => this.create());
    grid.append(add);
    this.items.forEach((w, k) => grid.append(this.card(w, k + 1)));
    $('lib-count').textContent = `${this.items.length} workspace${this.items.length === 1 ? '' : 's'}`;
  }

  private card(w: Work<SlotLike>, idx: number) {
    const el = document.createElement('div');
    el.className = 'lib-card' + (w.id === this.host.workId ? ' current' : '');
    el.tabIndex = -1;
    el.dataset.i = String(idx);
    const math = document.createElement('div');
    math.className = 'lib-math';
    const name = document.createElement('div');
    name.className = 'lib-name';
    name.textContent = w.name;
    const steps = w.slots.reduce((n, s) => n + s.at, 0);
    const meta = document.createElement('div');
    meta.className = 'lib-meta';
    meta.textContent = `${w.slots.length} equation${w.slots.length === 1 ? '' : 's'} · ${steps} step${steps === 1 ? '' : 's'} · ${ago(w.updated)}`;
    const acts = document.createElement('div');
    acts.className = 'lib-acts';
    for (const [k, label, run] of [['r', 'Rename', () => this.rename(w.id)], ['d', 'Copy', () => this.duplicate(w.id)], ['⌫', 'Delete', () => this.remove(w.id)]] as const) {
      const b = document.createElement('button');
      b.innerHTML = `<kbd>${k}</kbd>${label}`;
      b.addEventListener('click', e => { e.stopPropagation(); this.i = idx; run(); });
      acts.append(b);
    }
    if (w.id === this.host.workId) { const tag = document.createElement('span'); tag.className = 'lib-open'; tag.textContent = 'open'; el.append(tag); }
    el.append(math, name, meta, acts);
    el.addEventListener('click', () => { if (this.renaming !== w.id) this.choose(idx); });
    el.addEventListener('mouseenter', () => this.focus(idx, false));
    requestAnimationFrame(() => this.draw(math, w));
    return el;
  }

  /** up to three equations, drawn with the real layout at a small size */
  private draw(host: HTMLElement, w: Work<SlotLike>) {
    const W = host.clientWidth - 8;
    const eqs = w.slots.slice(0, 3).map(s => s.steps[Math.min(s.at, s.steps.length - 1)]?.eq).filter(Boolean) as Eq[];
    if (!eqs.length) { host.innerHTML = '<span class="lib-empty">Empty</span>'; return; }
    const size = eqs.length === 1 ? 24 : eqs.length === 2 ? 18 : 15;
    for (const e of eqs) {
      const copy = JSON.parse(JSON.stringify(e)) as Eq;
      bumpIds(copy);
      let lay = layout(copy, size);
      if (lay.w > W) lay = layout(copy, Math.max(8, size * W / lay.w));
      const row = document.createElement('div');
      row.className = 'mini lib-eq';
      row.style.width = lay.w + 'px';
      row.style.height = lay.asc + lay.desc + 'px';
      host.append(row);
      new Stage(row).show(lay, 0, 0, null);
    }
    if (w.slots.length > 3) { const more = document.createElement('span'); more.className = 'lib-more'; more.textContent = `+${w.slots.length - 3} more`; host.append(more); }
  }

  private cards() { return [...$('lib-grid').children] as HTMLElement[]; }

  private focus(i: number, scroll = true) {
    const cards = this.cards();
    this.i = Math.max(0, Math.min(cards.length - 1, i));
    cards.forEach((c, k) => c.classList.toggle('focus', k === this.i));
    if (scroll) cards[this.i]?.scrollIntoView({ block: 'nearest' });
  }

  private get focused(): Work<SlotLike> | undefined { return this.items[this.i - 1]; }

  private choose(i: number) {
    if (i === 0) return this.create();
    const w = this.items[i - 1];
    if (!w) return;
    this.close();
    if (w.id !== this.host.workId) this.host.open(w.id);
  }

  private create() { this.close(); this.host.create(); }

  private duplicate(id: string) {
    const c = works.duplicate(id);
    if (!c) return;
    sound.commit();
    this.render();
    this.focus(this.items.findIndex(w => w.id === c.id) + 1);
  }

  private remove(id: string) {
    const card = this.cards()[this.i];
    if (this.armed.id !== id || performance.now() - this.armed.at > 1800) {
      this.armed = { id, at: performance.now() };
      card?.classList.add('armed');
      $('lib-hint').textContent = 'Press Delete again to remove this workspace. This can’t be undone.';
      sound.refuse();
      setTimeout(() => card?.classList.remove('armed'), 1800);
      return;
    }
    this.armed = { id: '', at: 0 };
    const wasOpen = id === this.host.workId;
    works.remove(id);
    sound.undo();
    $('lib-hint').textContent = '';
    if (wasOpen) this.host.afterRemove();
    this.render();
    this.focus(this.i);
  }

  private rename(id: string) {
    const card = this.cards()[this.i];
    const name = card?.querySelector<HTMLElement>('.lib-name');
    if (!name) return;
    this.renaming = id;
    const input = document.createElement('input');
    input.className = 'lib-rename';
    input.value = name.textContent ?? '';
    input.spellcheck = false;
    name.replaceWith(input);
    input.focus(); input.select();
    const done = (keep: boolean) => {
      if (this.renaming !== id) return;
      this.renaming = null;
      if (keep) works.rename(id, input.value);
      this.render();
      this.focus(this.items.findIndex(w => w.id === id) + 1);
    };
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); done(true); }
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
    });
    input.addEventListener('blur', () => done(true));
  }

  /** columns in the grid right now, for up/down */
  private cols() {
    const cards = this.cards();
    if (cards.length < 2) return 1;
    const top = cards[0].offsetTop;
    const n = cards.findIndex(c => c.offsetTop !== top);
    return n < 0 ? cards.length : n;
  }

  key(e: KeyboardEvent) {
    if (this.renaming) return;
    const k = e.key;
    e.preventDefault();
    const w = this.focused;
    switch (k) {
      case 'Escape': case 'w': return this.close();
      case 'ArrowRight': case 'l': sound.tick(0); return this.focus(this.i + 1);
      case 'ArrowLeft': case 'h': sound.tick(0); return this.focus(this.i - 1);
      case 'ArrowDown': case 'j': sound.tick(0); return this.focus(this.i + this.cols());
      case 'ArrowUp': case 'k': sound.tick(0); return this.focus(this.i - this.cols());
      case 'Enter': case ' ': return this.choose(this.i);
      case 'n': return this.create();
      case 'r': if (w) this.rename(w.id); return;
      case 'd': if (w) this.duplicate(w.id); return;
      case 'Delete': case 'Backspace': if (w) this.remove(w.id); return;
    }
  }
}
