// Playthrough tutorials: a coach card that asks for one action at a time and moves on
// as soon as you've done it. Several short tours, picked from a menu (g). Your own
// equations are put aside and come back at the end.
import type { App, Slot } from './app';
import { find, relOf } from '../engine/ast';
import { isProved } from '../engine/goals';
import { solvedFor } from '../engine/moves';
import { prefs } from './prefs';
import { toText } from '../engine/print';
import { sound } from './sound';

interface TourStep {
  say: string;
  load?: string;
  setup?: (t: Tour) => void;
  done: (t: Tour) => boolean;
}

const lhs = (a: App) => toText(a.eq.lhs);
const rhs = (a: App) => toText(a.eq.rhs);
const aimed = (a: App) => { const n = a.sel && a.sel !== 'eq' ? find(a.eq, a.sel) : null; return n ? toText(n) : ''; };

interface TourDef { id: string; name: string; blurb: string; steps: TourStep[] }

const text = (a: App) => toText(a.eq);
const solved = (a: App) => !!solvedFor(a.eq);

export const TOURS: TourDef[] = [
  {
    id: 'basics', name: 'The basics', blurb: 'Aim, move, simplify, undo. Start here.',
    steps: [
      { load: '3x + 7 = 22', say: 'Here’s an equation to solve. Press <kbd>→</kbd> to aim at a piece of it.', done: t => !!t.app.sel },
      { say: 'Walk with <kbd>←</kbd> <kbd>→</kbd> until the <b>7</b> is aimed. <kbd>↑</kbd> grows the aim, <kbd>↓</kbd> shrinks it.', done: t => aimed(t.app) === '7' },
      { say: 'Press <kbd>m</kbd> to move the 7 across the equals sign. It changes sign on its own.', done: t => lhs(t.app) === '3x' },
      { say: 'The dashed box is a simplification on offer. Nothing simplifies until you say so: press <kbd>s</kbd>.', done: t => rhs(t.app) === '15' },
      { say: 'Aim at the <b>3</b> (aim <b>3x</b>, then <kbd>↓</kbd> to get inside it) and press <kbd>m</kbd>. It leaves by dividing.', done: t => lhs(t.app) === 'x' },
      { say: 'One more <kbd>s</kbd> to finish.', done: t => text(t.app) === 'x = 5' },
      { say: 'Every step is kept. Press <kbd>u</kbd> to undo.', setup: t => { t.mark = t.app.at; }, done: t => t.app.at < t.mark },
      { say: 'And <kbd>r</kbd> to redo.', setup: t => { t.mark = t.app.at; }, done: t => t.app.at > t.mark },
      { say: 'You can’t break the algebra. Try it: press <kbd>/</kbd>, type <b>0</b>, then <kbd>Enter</kbd>.', setup: t => { t.refused = false; }, done: t => t.refused },
      { load: '4x - 8 = 12', say: 'It resisted, and the reason went to the bottom bar. Shortcut time: press <kbd>e</kbd> to solve in one go and watch every step play.', done: t => solved(t.app) },
    ],
  },
  {
    id: 'pick', name: 'Picking pieces', blurb: 'Grow a highlight, reorder terms, drag a box.',
    steps: [
      { load: '2x + 3 + 5 + y = 10', say: 'Aim at the <b>3</b> with the arrows.', done: t => aimed(t.app) === '3' },
      { say: 'Hold <kbd>Ctrl</kbd> and tap <kbd>→</kbd>: the highlight grows to the right. (<kbd>Ctrl</kbd> + <kbd>←</kbd> grows it left.)', done: t => aimed(t.app) === '3 + 5' },
      { say: '<b>3 + 5</b> acts like one piece now. Press <kbd>s</kbd>.', done: t => lhs(t.app) === '2x + 8 + y' },
      { say: 'Aim at <b>2x</b> and press <kbd>Shift</kbd> + <kbd>→</kbd> to slide it one place right.', done: t => lhs(t.app).startsWith('8') },
      { say: 'Now the mouse: drag a box around <b>8 + 2x</b> (not the y). Whatever the box covers is picked.', done: t => aimed(t.app) === '8 + 2x' },
      { say: 'Press <kbd>m</kbd> to move the whole run across at once.', done: t => lhs(t.app) === 'y' },
    ],
  },
  {
    id: 'algebra', name: 'The algebra menu', blurb: 'Tab for forms, cases and solving.',
    steps: [
      { load: 'x^2 - 5x + 6 = 0', say: 'Tap <kbd>Tab</kbd> to open the algebra menu. It shows the forms this equation can take.', done: t => t.app.mode === 'hub' },
      { say: 'Browse with <kbd>←</kbd> <kbd>→</kbd> (the equation previews each one). Highlight <b>factored</b> and tap <kbd>Tab</kbd> again to apply it.', done: t => text(t.app).includes(')(') },
      { say: 'A product is zero when one factor is. Hold <kbd>Tab</kbd> and press <kbd>a</kbd> to split into cases.', done: t => t.app.slots.length >= 2 },
      { say: 'Each case gets its own lane on the sheet. Press <kbd>e</kbd> to solve this one.', done: t => solved(t.app) },
      { say: 'Press <kbd>Alt</kbd> + <kbd>→</kbd> (or <kbd>2</kbd>) to move to the other case, then <kbd>e</kbd>.', done: t => t.app.cur === 1 && solved(t.app) },
      { load: 'x^2 = 9', say: 'Functions work on both sides too. Hold <kbd>f</kbd> and press <kbd>i</kbd> to undo the square.', done: t => !lhs(t.app).includes('^') },
      { say: 'The square cancelled into <b>|x|</b>, so nothing was lost. Press <kbd>s</kbd> for the √9.', done: t => rhs(t.app) === '3' },
    ],
  },
  {
    id: 'systems', name: 'Systems', blurb: 'Several equations, elimination, substitution.',
    steps: [
      { load: 'x + y = 10', say: 'Press <kbd>n</kbd> for a second equation, type <b>x - y = 2</b>, then <kbd>Enter</kbd>.', done: t => t.app.slots.length >= 2 },
      { say: 'Add equation 1 to both sides: press <kbd>=</kbd>, type <b>#1</b>, then <kbd>Enter</kbd>.', done: t => t.app.cur === 1 && text(t.app).includes('10') },
      { say: 'The y’s are about to cancel. Press <kbd>s</kbd> a few times until they’re gone.', done: t => t.app.cur === 1 && !text(t.app).includes('y') && !text(t.app).includes('+') },
      { say: 'Press <kbd>e</kbd> to finish it.', done: t => t.app.cur === 1 && solved(t.app) },
      { say: 'Back to equation 1 with <kbd>1</kbd>. Then hold <kbd>Tab</kbd> and press <kbd>2</kbd> to substitute what equation 2 found.', done: t => t.app.cur === 0 && !text(t.app).includes('x') },
      { say: 'Press <kbd>e</kbd>. Both variables solved, and the graph shows the lines crossing there.', done: t => t.app.cur === 0 && solved(t.app) },
    ],
  },
  {
    id: 'beyond', name: 'Beyond equations', blurb: 'Inequalities, proofs and functions.',
    steps: [
      { load: '-2x + 3 < 7', say: 'An inequality. Moves flip the sign when they must. Press <kbd>e</kbd> to solve it.', done: t => !!t.app.step?.answer || solved(t.app) },
      { load: 'x^2 - 4 > 0', say: 'This one needs a sign chart. Press <kbd>e</kbd>; the answer appears under the equation and the graph shades it.', done: t => !!t.app.step?.answer },
      { load: '(a + b)^2 = a^2 + 2ab + b^2', say: 'This holds for every a and b, so it became a proof (≟). Tap <kbd>Tab</kbd>, browse to <b>expanded</b>, and tap <kbd>Tab</kbd> again.', done: t => relOf(t.app.eq) === '≟' && isProved(t.app.eq) },
      { load: 'f(x) = 2x + 3', say: 'Proved ∎. Now a function. Hold <kbd>Tab</kbd> and press <kbd>b</kbd> to build its inverse.', done: t => t.app.slots.length >= 2 },
      { say: 'Use it anywhere: press <kbd>n</kbd> and type <b>f(4) = y</b>, then <kbd>Enter</kbd>.', done: t => t.app.slots.length >= 3 },
      { say: 'Hold <kbd>Tab</kbd> and press <kbd>u</kbd> to unfold f(4) into its body.', done: t => !text(t.app).includes('f(') },
    ],
  },
  {
    id: 'work', name: 'Your work and settings', blurb: 'Cards, reset, settings, flash mode.',
    steps: [
      { load: '5x = 20', say: 'Press <kbd>w</kbd> to see your workspaces as cards.', done: t => t.app.library.isOpen },
      { say: 'Arrows move, <kbd>Enter</kbd> opens, <kbd>n</kbd> starts a new one. Press <kbd>Esc</kbd> to close.', done: t => !t.app.library.isOpen },
      { say: 'Press <kbd>,</kbd> for settings: theme, look, size, speed, sounds.', done: t => t.app.settings.isOpen },
      { say: 'Try the Pixel look or the Blocks sounds with <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd>, then <kbd>Esc</kbd>.', done: t => !t.app.settings.isOpen },
      { say: 'Press <kbd>z</kbd> for ⚡ flash mode (the bolt bottom right). Everything moves about 3× faster.', done: () => prefs.speed === 'flash' },
      { say: 'Press <kbd>e</kbd> to see it, then <kbd>z</kbd> again whenever you want normal speed.', done: t => solved(t.app) },
    ],
  },
];

export class Tour {
  i = -1;
  tour: TourDef = TOURS[0];
  private pick = 0;
  mark = 0;
  refused = false;
  finished = false;
  private stash: { slots: Slot[]; cur: number } | null = null;
  private advancing = false;
  private poll = 0;
  private card: HTMLElement;

  constructor(public app: App) {
    this.card = document.getElementById('tour')!;
    this.card.querySelector('.tour-quit')!.addEventListener('click', () => this.end(false));
    document.getElementById('tours')!.addEventListener('mousedown', e => { if (e.target === document.getElementById('tours')) this.closeMenu(); });
    window.addEventListener('keydown', e => {
      if (this.i < 0) return;
      const typing = ['write', 'op', 'fnask'].includes(this.app.mode);
      if (e.key === 'q' && !typing && this.app.mode === 'solve') { e.preventDefault(); e.stopImmediatePropagation(); this.end(false); }
      if (e.key === 'Enter' && this.i === this.tour.steps.length - 1 && !typing) { e.preventDefault(); e.stopImmediatePropagation(); this.finished = true; this.check(); }
    }, true);
  }

  get active() { return this.i >= 0; }

  get menuOpen() { return !document.getElementById('tours')!.hidden; }

  /** the list of tours (g) */
  menu() {
    if (this.active) this.end(false);
    const host = document.getElementById('tours')!;
    host.hidden = false;
    this.renderMenu();
    sound.labels();
  }

  closeMenu() { document.getElementById('tours')!.hidden = true; }

  private renderMenu() {
    const done = doneTours();
    const list = document.getElementById('tours-list')!;
    list.replaceChildren();
    TOURS.forEach((t, k) => {
      const b = document.createElement('button');
      b.className = 'tour-pick' + (k === this.pick ? ' focus' : '') + (done.includes(t.id) ? ' done' : '');
      b.innerHTML = `<kbd>${k + 1}</kbd><span class="tp-name">${t.name}</span><span class="tp-blurb">${t.blurb}</span><span class="tp-len">${t.steps.length} steps</span>`;
      b.addEventListener('click', () => this.start(t.id));
      b.addEventListener('mouseenter', () => { this.pick = k; this.renderMenu(); });
      list.append(b);
    });
  }

  menuKey(e: KeyboardEvent) {
    e.preventDefault();
    const k = e.key;
    if (k === 'Escape' || k === 'g') return this.closeMenu();
    if (k === 'ArrowDown' || k === 'j') { this.pick = (this.pick + 1) % TOURS.length; sound.tick(0); return this.renderMenu(); }
    if (k === 'ArrowUp' || k === 'k') { this.pick = (this.pick + TOURS.length - 1) % TOURS.length; sound.tick(0); return this.renderMenu(); }
    if (k === 'Enter' || k === ' ') return this.start(TOURS[this.pick].id);
    if (/^[1-9]$/.test(k) && TOURS[Number(k) - 1]) return this.start(TOURS[Number(k) - 1].id);
  }

  start(id = 'basics') {
    this.closeMenu();
    if (this.active) return;
    this.tour = TOURS.find(t => t.id === id) ?? TOURS[0];
    this.pick = TOURS.indexOf(this.tour);
    this.app.closeOverlays();
    this.stash = { slots: this.app.slots, cur: this.app.cur };
    this.app.noSave = true;
    this.finished = false;
    this.card.hidden = false;
    // some changes land on timers (cases, solving); a light poll catches those too
    window.clearInterval(this.poll);
    this.poll = window.setInterval(() => this.check(), 250);
    this.go(0);
  }

  private go(i: number) {
    this.i = i;
    const s = this.tour.steps[i];
    if (this.app.mode === 'op') this.app.closeOp();
    if (s.load) this.app.loadFresh(s.load);
    s.setup?.(this);
    this.card.classList.remove('done');
    this.card.querySelector('.tour-text')!.innerHTML = s.say;
    this.card.querySelector('.tour-count')!.textContent = `${this.tour.name} · ${i + 1} / ${this.tour.steps.length}`;
    (this.card.querySelector('.tour-bar i') as HTMLElement).style.width = `${(i / this.tour.steps.length) * 100}%`;
    this.card.animate([{ opacity: 0, transform: 'translate(-50%, 6px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  /** called by the app after anything changes */
  check(kind: 'change' | 'refuse' = 'change') {
    if (!this.active || this.advancing) return;
    if (kind === 'refuse') this.refused = true;
    if (!this.tour.steps[this.i].done(this)) return;
    this.advancing = true;
    this.card.classList.add('done');
    (this.card.querySelector('.tour-bar i') as HTMLElement).style.width = `${((this.i + 1) / this.tour.steps.length) * 100}%`;
    window.setTimeout(() => {
      this.advancing = false;
      if (!this.active) return;
      if (this.i + 1 >= this.tour.steps.length) return this.end(true);
      this.go(this.i + 1);
    }, kind === 'refuse' ? 1400 : 750);
  }

  end(complete: boolean) {
    if (!this.active) return;
    this.i = -1;
    window.clearInterval(this.poll);
    this.card.hidden = true;
    try {
      localStorage.setItem('algebrix.toured', '1');
      if (complete) localStorage.setItem('algebrix.tours', JSON.stringify([...new Set([...doneTours(), this.tour.id])]));
    } catch { /* storage blocked */ }
    this.app.closeOverlays();
    if (this.app.mode === 'op') this.app.closeOp();
    this.app.noSave = false;
    if (this.stash && this.stash.slots.length) this.app.restoreSlots(this.stash.slots, this.stash.cur);
    this.stash = null;
    if (complete) sound.solved();
    const next = TOURS[TOURS.indexOf(this.tour) + 1];
    this.app.say(complete ? `${this.tour.name}: done. Your equations are back.${next ? ` Press g for the next tour: ${next.name}.` : ' That was every tour.'}` : 'Tour closed. Your equations are back. g lists every tour.');
  }
}

export const toured = () => { try { return localStorage.getItem('algebrix.toured') === '1'; } catch { return true; } };

const doneTours = (): string[] => { try { return JSON.parse(localStorage.getItem('algebrix.tours') ?? '[]'); } catch { return []; } };
