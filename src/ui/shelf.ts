// The shelf: the other equations, open across the top of the board. Not boxed cards and not
// a full second sheet: each one is readable at a glance, says what it can give the equation
// you're working on, and is one key away. Pure rendering: the app decides what goes on it.
import { Eq } from '../engine/ast';
import { layout } from '../render/layout';
import { Stage } from '../render/stage';
import { ms } from './prefs';

export interface ShelfItem {
  /** the equation's index (shown as i + 1) */
  i: number;
  eq: Eq;
  /** its status: answer, ✓, ∎ … */
  tag: { text: string; cls: string } | null;
  /** what it offers the current equation, as HTML ("gives y", "shares x, y"), or '' */
  offer: string;
  /** light up as linked (while Tab is held and it shares a variable) */
  linked: boolean;
}

const MATH = 24, MAX_W = 280, MAX_H = 46;

export function renderShelf(host: HTMLElement, items: ShelfItem[], pick: (i: number) => void) {
  const before = new Map<string, DOMRect>();
  host.querySelectorAll<HTMLElement>('[data-lane]').forEach(el => before.set(el.dataset.lane!, el.getBoundingClientRect()));
  host.replaceChildren();
  for (const it of items) {
    const el = document.createElement('button');
    el.className = 'lane' + (it.linked ? ' linked' : '');
    el.dataset.lane = String(it.i);
    el.title = `Equation ${it.i + 1}: press ${it.i + 1} or Alt + ← → to work on it`;
    const head = document.createElement('span');
    head.className = 'lane-head';
    head.innerHTML = `<kbd>${it.i + 1}</kbd>`;
    if (it.tag) { const t = document.createElement('span'); t.className = 'lane-tag ' + it.tag.cls; t.textContent = it.tag.text; head.append(t); }
    const math = document.createElement('span');
    math.className = 'lane-math';
    const foot = document.createElement('span');
    foot.className = 'lane-offer';
    foot.innerHTML = it.offer;
    el.append(head, math, foot);
    el.addEventListener('mousedown', ev => { ev.stopPropagation(); ev.preventDefault(); pick(it.i); });
    host.append(el);
    let lay = layout(it.eq, MATH);
    const f = Math.min(1, MAX_W / lay.w, MAX_H / (lay.asc + lay.desc));
    if (f < 1) lay = layout(it.eq, Math.max(9, MATH * f));
    const box = document.createElement('span');
    box.className = 'mini';
    box.style.width = lay.w + 'px';
    box.style.height = lay.asc + lay.desc + 'px';
    math.append(box);
    new Stage(box).show(lay, 0, 0, null);
  }
  // equations slide to their new places (FLIP)
  host.querySelectorAll<HTMLElement>('[data-lane]').forEach(el => {
    const was = before.get(el.dataset.lane!);
    if (!was) return;
    const now = el.getBoundingClientRect();
    const dx = was.left - now.left, dy = was.top - now.top;
    if (Math.abs(dx) + Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: ms(260), easing: 'cubic-bezier(.2,.8,.16,1)' });
  });
}
