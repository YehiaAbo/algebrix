// Draws a menu of the model (ui/menu/model.ts): the section tabs, then the cards in lines that wrap and
// never shrink, and measures the cards as drawn so the arrows move over what you see. Each menu draws
// its own card faces; the frame, the focus and the measuring are the same for all. ARCHITECTURE.md 8.1.
import { MenuSpec, MenuState, Card, Section, Rect, cardsOf } from './model';

/** the row of section tabs, the shown one on; `focus` while no card is browsed (the arrows are on the tabs) */
export function tabsEl(spec: MenuSpec, st: MenuState, cls = ''): HTMLElement {
  const el = document.createElement('div');
  el.className = `pal-tabs${st.at === null ? ' focus' : ''}${cls ? ' ' + cls : ''}`;
  spec.sections.forEach((s, j) => {
    const b = document.createElement('button');
    b.className = `pal-tab${j === st.section ? ' on' : ''}${s.live ? ' live' : ''}`;
    b.dataset.tab = String(j);
    b.textContent = s.name;
    el.append(b);
  });
  return el;
}

/** the section's cards: one line per row of the section (each wraps on its own), the browsed card on,
 *  an off card dimmed. `face` draws a card's inside; the button it returns keeps data-i = its index */
export function cardsEl(sec: Section, st: MenuState, face: (c: Card, i: number) => HTMLElement, cls = ''): HTMLElement {
  const el = document.createElement('div');
  el.className = `menu-cards${cls ? ' ' + cls : ''}`;
  let i = 0;
  for (const row of sec.rows) {
    if (!row.length) continue;
    const line = document.createElement('div');
    line.className = 'menu-line';
    for (const c of row) {
      const b = face(c, i);
      b.dataset.i = String(i);
      b.classList.toggle('on', st.at === i);
      if (!c.ok) b.classList.add('off');
      line.append(b);
      i++;
    }
    el.append(line);
  }
  return el;
}

/** the cards' boxes as drawn, in the order of cardsOf(section): every [data-i] in `host`, wherever the menu put it */
export function rectsOf(host: Element | null): Rect[] {
  if (!host) return [];
  return [...host.querySelectorAll<HTMLElement>('[data-i]')]
    .sort((a, b) => Number(a.dataset.i) - Number(b.dataset.i))
    .map(b => { const r = b.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
}

/** the card a click landed on, by its place in the section shown */
export function cardAt(spec: MenuSpec, st: MenuState, el: Element | null): { at: number; card: Card } | null {
  const b = el?.closest<HTMLElement>('[data-i]');
  if (!b) return null;
  const at = Number(b.dataset.i);
  const card = cardsOf(spec.sections[st.section])[at];
  return card ? { at, card } : null;
}
