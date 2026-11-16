// The playthrough tutorial: a coach card that asks for one action at a time and moves on
// as soon as you've done it. Your own equations are put aside and come back at the end.
import type { App, Slot } from './app';
import { find } from '../engine/ast';
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

const STEPS: TourStep[] = [
  { load: '3x + 7 = 22', say: 'Here’s an equation to solve. Press <kbd>→</kbd> to aim at a piece of it.', done: t => !!t.app.sel },
  { say: 'Walk with <kbd>←</kbd> <kbd>→</kbd> until the <b>7</b> is aimed. <kbd>↑</kbd> grows the aim, <kbd>↓</kbd> shrinks it.', done: t => aimed(t.app) === '7' },
  { say: 'Press <kbd>m</kbd> to move the 7 across the equals sign. It changes sign on its own.', done: t => lhs(t.app) === '3x' },
  { say: 'The dashed box is a simplification on offer. Nothing simplifies until you say so: press <kbd>s</kbd>.', done: t => rhs(t.app) === '15' },
  { say: 'Aim at the <b>3</b> (aim <b>3x</b>, then <kbd>↓</kbd> to get inside it) and press <kbd>m</kbd>. It leaves by dividing.', done: t => lhs(t.app) === 'x' },
  { say: 'One more <kbd>s</kbd> to finish.', done: t => toText(t.app.eq) === 'x = 5' },
  { say: 'Every step is kept. Press <kbd>u</kbd> to undo.', setup: t => { t.mark = t.app.at; }, done: t => t.app.at < t.mark },
  { say: 'And <kbd>r</kbd> to redo.', setup: t => { t.mark = t.app.at; }, done: t => t.app.at > t.mark },
  {
    say: 'You can’t break the algebra. Try it: press <kbd>/</kbd>, type <b>0</b>, then <kbd>Enter</kbd>.',
    setup: t => { t.refused = false; },
    done: t => t.refused,
  },
  {
    load: 'x^2 = 9',
    say: 'It resisted, and the reason went to the bottom bar. New equation: hold <kbd>f</kbd> and press <kbd>i</kbd> to undo the square on both sides.',
    done: t => !lhs(t.app).includes('^'),
  },
  { say: 'The square cancelled into <b>|x|</b>. The √9 is waiting for you: <kbd>s</kbd>.', done: t => rhs(t.app) === '3' },
  { say: 'There are two answers in there. Hold <kbd>e</kbd> and press <kbd>a</kbd> to split into cases.', done: t => t.app.slots.length >= 2 },
  {
    say: 'Both cases sit in the rail on the left, each checked against the original. The graph agrees: drag it, scroll it, hover the dots. Press <kbd>Enter</kbd> to finish. <kbd>?</kbd> opens the manual any time.',
    done: t => t.finished,
  },
];

export class Tour {
  i = -1;
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
    window.addEventListener('keydown', e => {
      if (this.i < 0) return;
      const typing = ['write', 'op', 'fnask'].includes(this.app.mode);
      if (e.key === 'q' && !typing && this.app.mode === 'solve') { e.preventDefault(); e.stopImmediatePropagation(); this.end(false); }
      if (e.key === 'Enter' && this.i === STEPS.length - 1 && !typing) { e.preventDefault(); e.stopImmediatePropagation(); this.finished = true; this.check(); }
    }, true);
  }

  get active() { return this.i >= 0; }

  start() {
    if (this.active) return;
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
    const s = STEPS[i];
    if (this.app.mode === 'op') this.app.closeOp();
    if (s.load) this.app.loadFresh(s.load);
    s.setup?.(this);
    this.card.classList.remove('done');
    this.card.querySelector('.tour-text')!.innerHTML = s.say;
    this.card.querySelector('.tour-count')!.textContent = `${i + 1} / ${STEPS.length}`;
    (this.card.querySelector('.tour-bar i') as HTMLElement).style.width = `${(i / STEPS.length) * 100}%`;
    this.card.animate([{ opacity: 0, transform: 'translate(-50%, 6px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  /** called by the app after anything changes */
  check(kind: 'change' | 'refuse' = 'change') {
    if (!this.active || this.advancing) return;
    if (kind === 'refuse') this.refused = true;
    if (!STEPS[this.i].done(this)) return;
    this.advancing = true;
    this.card.classList.add('done');
    (this.card.querySelector('.tour-bar i') as HTMLElement).style.width = `${((this.i + 1) / STEPS.length) * 100}%`;
    window.setTimeout(() => {
      this.advancing = false;
      if (!this.active) return;
      if (this.i + 1 >= STEPS.length) return this.end(true);
      this.go(this.i + 1);
    }, kind === 'refuse' ? 1400 : 750);
  }

  end(complete: boolean) {
    if (!this.active) return;
    this.i = -1;
    window.clearInterval(this.poll);
    this.card.hidden = true;
    try { localStorage.setItem('algebrix.toured', '1'); } catch { /* storage blocked */ }
    if (this.app.mode === 'op') this.app.closeOp();
    this.app.noSave = false;
    if (this.stash && this.stash.slots.length) this.app.restoreSlots(this.stash.slots, this.stash.cur);
    this.stash = null;
    if (complete) sound.solved();
    this.app.say(complete ? 'Tour done. Your equations are back. Press ? for the manual.' : 'Tour closed. Your equations are back.');
  }
}

export const toured = () => { try { return localStorage.getItem('algebrix.toured') === '1'; } catch { return true; } };
