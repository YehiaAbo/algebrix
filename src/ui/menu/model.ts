// One menu model for Tab, C and f: cards in sections, and what every key does to them. Pure (no DOM),
// so every rule is unit-tested (tests/menu.test.ts); ui/menu/view.ts draws it and measures the cards,
// and the arrows move over the cards as they are drawn, wrapped lines and all. docs/ARCHITECTURE.md 8.1.

/** a card's box as drawn, in any coordinates shared by all the cards of the menu */
export interface Rect { x: number; y: number; w: number; h: number }

/** what applying a card shows: the result as math, and a few words under it */
export interface Shown { math: unknown; note?: string }

/** something typed first: a limit's target, a factor to take out, a value */
export interface Ask { prompt: string; hint: string; commit(text: string): void }

export interface Card {
  /** one key that applies it from anywhere in the menu */
  key?: string;
  /** words with math in them, drawn by mathLabel */
  label: string;
  /** an off card stays in sight, dimmed, and says why when you pick it */
  ok: boolean;
  why?: string;
  /** what it would give, worked out only when the card is drawn or browsed */
  shows?: () => Shown | null;
  ask?: Ask;
  run(): void;
  /** chain: a shortcut that plays general moves into the tree. suggested: what fits best here */
  tag?: 'chain' | 'suggested';
}

/** a section: C's Derivatives, Limits …; f's families. Tab has one. rows: forced line breaks in the drawing */
export interface Section { name: string; rows: Card[][]; live?: boolean }

export interface MenuSpec { id: 'tab' | 'calc' | 'fn'; openKey: string; sections: Section[] }

/** at: the card browsed (an index into the section's cards), or null when on the section tabs / nothing */
export interface MenuState { section: number; at: number | null; sticky: boolean; chordUsed: boolean; asking?: Card }

export const cardsOf = (s: Section): Card[] => s.rows.flat();

export type Effect =
  | { k: 'none' }
  | { k: 'peek'; card: Card | null }
  | { k: 'run'; card: Card }
  | { k: 'ask'; card: Card }
  | { k: 'refuse'; why: string }
  | { k: 'close' }
  /** closed, and the key does what it does with no menu open */
  | { k: 'pass' };

export type Dir = 'left' | 'right' | 'up' | 'down';

/** the drawn lines of cards, top to bottom, each left to right: two cards share a line when their
 *  vertical middles are within half a card of each other */
export function linesOf(rects: Rect[]): number[][] {
  const order = rects.map((_, i) => i).sort((a, b) => rects[a].y - rects[b].y || rects[a].x - rects[b].x);
  const lines: number[][] = [];
  for (const i of order) {
    const mid = rects[i].y + rects[i].h / 2;
    const line = lines.find(l => Math.abs(rects[l[0]].y + rects[l[0]].h / 2 - mid) < Math.min(rects[l[0]].h, rects[i].h) / 2);
    if (line) line.push(i); else lines.push([i]);
  }
  for (const l of lines) l.sort((a, b) => rects[a].x - rects[b].x);
  return lines.sort((a, b) => rects[a[0]].y - rects[b[0]].y);
}

/** where an arrow goes from card `at`: ← → step through the cards in reading order (and wrap),
 *  ↑ ↓ go to the nearest card (by its middle) in the line above or below. 'out': ↑ from the top line.
 *  null: ↓ from the bottom line (an edge: nothing happens) */
export function nextCard(rects: Rect[], at: number, dir: Dir): number | 'out' | null {
  const lines = linesOf(rects);
  const reading = lines.flat();
  if (dir === 'left' || dir === 'right') {
    const i = reading.indexOf(at), n = reading.length;
    return reading[(i + (dir === 'right' ? 1 : -1) + n) % n];
  }
  const li = lines.findIndex(l => l.includes(at));
  const to = lines[li + (dir === 'down' ? 1 : -1)];
  if (!to) return dir === 'up' ? 'out' : null;
  const cx = rects[at].x + rects[at].w / 2;
  return to.reduce((best, j) => (Math.abs(rects[j].x + rects[j].w / 2 - cx) < Math.abs(rects[best].x + rects[best].w / 2 - cx) ? j : best), to[0]);
}

/** the card a key names: in the section shown first, then in any section, one that applies first */
export function cardFor(spec: MenuSpec, section: number, key: string): { section: number; at: number; card: Card } | null {
  const order = [section, ...spec.sections.map((_, i) => i).filter(i => i !== section)];
  let found: { section: number; at: number; card: Card } | null = null;
  for (const s of order) {
    const cards = cardsOf(spec.sections[s]);
    const at = cards.findIndex(c => c.key === key && c.ok);
    if (at >= 0) return { section: s, at, card: cards[at] };
    const off = cards.findIndex(c => c.key === key);
    if (off >= 0 && !found) found = { section: s, at: off, card: cards[off] };
  }
  return found;
}

/** what picking a card does: an off card refuses with its reason, one that asks asks, else it runs */
export const pickCard = (card: Card): Effect => (!card.ok ? { k: 'refuse', why: card.why ?? `${card.label[0].toUpperCase()}${card.label.slice(1)} doesn't apply here.` } : card.ask ? { k: 'ask', card } : { k: 'run', card });

/** One key pressed with the menu open. rects: the cards of the section shown, as drawn. */
export function menuKey(spec: MenuSpec, st: MenuState, key: string, rects: Rect[]): { state: MenuState; effect: Effect } {
  const sec = spec.sections[st.section];
  const cards = cardsOf(sec);
  const many = spec.sections.length > 1;
  const at = st.at;
  const keep = (state: MenuState, effect: Effect = { k: 'none' }) => ({ state, effect });
  const browse = (i: number) => keep({ ...st, at: i }, { k: 'peek', card: cards[i] });
  if (st.asking) return key === 'Escape' ? keep({ ...st, asking: undefined }) : keep(st);
  if (key === 'Escape') return at !== null && many ? keep({ ...st, at: null }, { k: 'peek', card: null }) : keep(st, { k: 'close' });
  const dir: Dir | null = key === 'ArrowLeft' ? 'left' : key === 'ArrowRight' ? 'right' : key === 'ArrowUp' ? 'up' : key === 'ArrowDown' ? 'down' : null;
  if (dir) {
    if (at === null) {
      if (many && (dir === 'left' || dir === 'right')) return keep({ ...st, section: (st.section + (dir === 'right' ? 1 : -1) + spec.sections.length) % spec.sections.length });
      if (dir === 'up') return keep(st);
      if (!cards.length) return keep(st, { k: 'refuse', why: `Nothing in ${sec.name} applies here.` });
      // in from the tabs: the first card that applies; in from nothing (Tab): the first, or ← the last
      const first = Math.max(0, cards.findIndex(c => c.ok));
      return browse(dir === 'left' ? cards.length - 1 : first);
    }
    const to = nextCard(rects, at, dir);
    if (to === 'out') return many ? keep({ ...st, at: null }, { k: 'peek', card: null }) : keep(st);
    if (to === null) return keep(st);
    return browse(to);
  }
  if (key === 'Enter') {
    if (at !== null) return keep(st, pickCard(cards[at]));
    if (!cards.length) return keep(st, { k: 'refuse', why: `Nothing in ${sec.name} applies here.` });
    return browse(Math.max(0, cards.findIndex(c => c.ok)));
  }
  // the open key again: apply what is browsed, or close
  if (key === spec.openKey || key.toLowerCase() === spec.openKey) return keep(st, at !== null ? pickCard(cards[at]) : { k: 'close' });
  const hit = cardFor(spec, st.section, key);
  if (hit) return keep({ ...st, section: hit.section, at: hit.at }, pickCard(hit.card));
  // opened with a tap and not browsed: a key it doesn't offer closes it and does its usual job
  if (st.sticky && at === null) return keep(st, { k: 'pass' });
  const keys = [...new Set(spec.sections.flatMap(s => cardsOf(s).map(c => c.key).filter(Boolean)))];
  return keep(st, { k: 'refuse', why: keys.length ? `Press one of ${keys.join(', ')}${many ? ', or ← → for the sections' : ''}.` : 'Nothing here yet.' });
}

/** The open key let go: what was browsed applies; a key pressed while holding closes it; else it stays open. */
export function menuRelease(spec: MenuSpec, st: MenuState): { state: MenuState; effect: Effect } {
  if (st.sticky || st.asking) return { state: st, effect: { k: 'none' } };
  if (st.at !== null) return { state: st, effect: pickCard(cardsOf(spec.sections[st.section])[st.at]) };
  if (st.chordUsed) return { state: st, effect: { k: 'close' } };
  return { state: { ...st, sticky: true }, effect: { k: 'none' } };
}
