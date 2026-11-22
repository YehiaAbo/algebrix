// The work tree as data: every equation's steps, including the lines you tried and left, as one
// tree per equation, plus the arrows between equations (a substitution, a case, u = …). And where
// each piece goes on screen. No drawing here, so the rules are unit-tested on their own.
import { Eq } from '../engine/ast';
import { Link, Slot, Step } from './shared';

/* ---------------- ids and lines ---------------- */

let last = 0;
/** a fresh id that also says when it was made: later ids sort after earlier ones */
export function newId(): string {
  last = Math.max(last + 1, Date.now() * 64);
  return last.toString(36);
}
const bornOf = (id: string) => parseInt(id, 36);

/** give the equation and its steps ids (older saves have none) */
export function ensureIds(sl: Slot) {
  sl.uid ??= newId();
  for (const line of linesOf(sl)) for (const st of line) st.id ??= newId();
}

/** every line of the tree: the one you're on first, then the others */
export const linesOf = (sl: Slot): Step[][] => [sl.steps, ...(sl.alts ?? [])];

/** line is the start of one of the others (or the same), so it adds nothing */
const covered = (line: Step[], others: Step[][]) =>
  others.some(o => o !== line && o.length >= line.length && line.every((s, i) => o[i].id === s.id));

/** keep the line you're leaving, unless another line already holds it */
export function keepLine(sl: Slot, line: Step[]) {
  const alts = sl.alts ?? [];
  if (covered(line, [sl.steps, ...alts])) return;
  sl.alts = [...alts.filter(a => !covered(a, [line])), line];
}

/** make another line of the tree the one you're on; the one you leave is kept */
export function switchLine(sl: Slot, line: Step[]) {
  if (line === sl.steps) return;
  const old = sl.steps;
  sl.alts = (sl.alts ?? []).filter(a => a !== line);
  sl.steps = line;
  keepLine(sl, old);
}

/** go to a step anywhere in the tree. False if it isn't there */
export function goto(sl: Slot, id: string): boolean {
  for (const line of linesOf(sl)) {
    const i = line.findIndex(s => s.id === id);
    if (i < 0) continue;
    switchLine(sl, line);
    sl.at = i;
    return true;
  }
  return false;
}

/** the step a visible node stands for: the end of its run of automatic tidy steps */
export function visibleAt(sl: Slot): string {
  ensureIds(sl);
  let i = sl.at;
  while (i < sl.steps.length - 1 && sl.steps[i + 1].auto) i++;
  return sl.steps[i].id!;
}

/** a link to where this equation is now (for an arrow out of it) */
export const here = (sl: Slot): Link => ({ slot: (ensureIds(sl), sl.uid!), step: visibleAt(sl) });

/* ---------------- the tree ---------------- */

/** a node is a step you can stand on: a move together with the tidy steps that follow it */
export interface TNode {
  id: string; eq: Eq; label: string; dir: '⇔' | '⇒'; answer?: string;
  parent: string | null; kids: string[]; born: number; link?: Link;
  /** how many times a move came back to this step (a reorder undone) instead of growing a branch */
  back?: number;
}
export interface Tree {
  uid: string; nodes: Map<string, TNode>; root: string;
  /** the visible nodes along the line you're on, start to end */
  line: string[];
  /** the node you're on */
  at: string;
  /** any step id → the node that shows it */
  vis: Map<string, string>;
  from?: Link;
}

export function treeOf(sl: Slot): Tree {
  ensureIds(sl);
  const nodes = new Map<string, TNode>(), vis = new Map<string, string>();
  let line: string[] = [];
  linesOf(sl).forEach((steps, li) => {
    let prev: string | null = null, run: Step[] = [];
    const ids: string[] = [];
    steps.forEach((st, i) => {
      run.push(st);
      if (i < steps.length - 1 && steps[i + 1].auto) return;
      const id = st.id!;
      if (!nodes.has(id)) {
        const main = run[0];
        nodes.set(id, {
          id, eq: st.eq, label: i === 0 && run.length === 1 ? '' : main.label, dir: run.some(r => r.dir === '⇒') ? '⇒' : '⇔',
          answer: st.answer, parent: prev, kids: [], born: bornOf(main.id!), link: run.find(r => r.link)?.link,
        });
        if (prev) nodes.get(prev)!.kids.push(id);
      }
      if (st.back) nodes.get(id)!.back = st.back;
      for (const r of run) vis.set(r.id!, id);
      ids.push(id);
      prev = id;
      run = [];
    });
    if (li === 0) line = ids;
  });
  for (const n of nodes.values()) n.kids.sort((a, b) => nodes.get(a)!.born - nodes.get(b)!.born);
  return { uid: sl.uid!, nodes, root: line[0], line, at: vis.get(sl.steps[sl.at].id!)!, vis, from: sl.from };
}

/* ---------------- where everything goes ---------------- */

export interface Box { w: number; h: number }
export interface Item {
  key: string; col: number; lane: number; row: number;
  /** centre */
  x: number; y: number; w: number; h: number;
  /** a node, or a fold of several ("4 steps") */
  id: string | null; ids: string[];
  /** what the arrow into it says */
  label: string; dir: '⇔' | '⇒';
  /** the step you're on in this equation, on the line you're on, or off it (a line you left) */
  now: boolean; live: boolean;
  back?: number;
}
export interface Edge { from: string; to: string; label: string; dir: '⇔' | '⇒'; live: boolean; fold: boolean }
export interface Arrow { from: string; to: string }
export interface Head { col: number; x: number; y: number }
export interface Layout { items: Item[]; edges: Edge[]; arrows: Arrow[]; heads: Head[]; width: number; height: number; itemOf: Map<string, string> }
export interface LayoutOpts {
  /** fold the middle of long lines into "N steps" (the strip), or show everything (the big view) */
  fold: boolean;
  /** vertical distance between rows, on top of the tallest step */
  rowGap: number; colGap: number; laneGap: number;
  /** the strip, this tall: every equation's current step on one line, placed so the steps before
   *  it show (as many as fit under top) and the ones after it in the equation you're on stay in view
   *  (above bottom). Without it, the starts line up at the top */
  strip?: { height: number; top: number; bottom: number; focus: number };
}

/** every equation as a column that grows down; lines you left grow to the side */
export function layoutTree(trees: Tree[], measure: (col: number, n: TNode) => Box, o: LayoutOpts): Layout {
  const items: Item[] = [], edges: Edge[] = [], arrows: Arrow[] = [];
  const itemOf = new Map<string, string>(); // `${uid}:${node id}` → item key (a fold stands for the nodes in it)
  const cols = trees.map((t, c) => {
    const onLine = new Set(t.line), ai = t.line.indexOf(t.at);
    // the strip keeps the start, the end, where you are and its neighbours, and every fork
    const keep = (id: string) => {
      if (!o.fold) return true;
      const n = t.nodes.get(id)!;
      if (!n.parent || !n.kids.length || n.kids.length > 1 || id === t.at) return true;
      if (onLine.has(id)) { const i = t.line.indexOf(id); return Math.abs(i - ai) <= 1; }
      return false;
    };
    const mine: Item[] = [];
    let lanes = 0;
    const add = (it: Omit<Item, 'x' | 'y' | 'col' | 'key'> & { key: string }) => {
      const full = { ...it, col: c, x: 0, y: 0 };
      mine.push(full);
      for (const id of full.ids) itemOf.set(`${t.uid}:${id}`, full.key);
      return full;
    };
    // a chain: follow the first-born child; later children start lanes of their own
    const chain = (start: string, lane: number, row: number, parent: Item | null) => {
      const forks: { id: string; row: number; item: Item }[] = [];
      let id: string | undefined = start, prev = parent, hidden: string[] = [];
      const flush = () => {
        if (!hidden.length) return;
        // one step on its own isn't worth folding
        if (hidden.length === 1) { place(hidden[0]); hidden = []; return; }
        const first = t.nodes.get(hidden[0])!;
        const f = add({ key: `${t.uid}:f:${hidden[0]}`, lane, row: row++, w: 0, h: 0, id: null, ids: hidden, label: first.label, dir: first.dir, now: false, live: onLine.has(hidden[0]) });
        if (prev) edges.push({ from: prev.key, to: f.key, label: first.label, dir: first.dir, live: f.live, fold: true });
        prev = f;
        hidden = [];
      };
      const place = (nid: string) => {
        const n = t.nodes.get(nid)!, b = measure(c, n);
        const it = add({ key: `${t.uid}:${nid}`, lane, row: row++, w: b.w, h: b.h, id: nid, ids: [nid], label: n.label, dir: n.dir, now: nid === t.at, live: onLine.has(nid), back: n.back });
        if (prev) edges.push({ from: prev.key, to: it.key, label: n.label, dir: n.dir, live: it.live, fold: false });
        prev = it;
        for (const k of n.kids.slice(1)) forks.push({ id: k, row, item: it });
      };
      while (id) {
        if (keep(id)) { flush(); place(id); } else hidden.push(id);
        id = t.nodes.get(id)!.kids[0];
      }
      flush();
      for (const f of forks) chain(f.id, ++lanes, f.row, f.item);
    };
    chain(t.root, 0, 0, null);
    return { mine, lanes };
  });
  // rows are as tall as the tallest step anywhere, so equations stay level with each other
  const pitch = Math.max(16, ...cols.flatMap(c => c.mine).map(i => i.h)) + o.rowGap;
  // the now line
  let nowY: number | undefined;
  if (o.strip) {
    const S = o.strip, nowOf = (m: Item[]) => m.find(i => i.now)?.row ?? 0;
    const above = Math.max(0, ...cols.map(c => nowOf(c.mine) - Math.min(...c.mine.map(i => i.row))));
    const f = cols[S.focus]?.mine ?? [];
    const below = f.length ? Math.max(...f.map(i => i.row)) - nowOf(f) : 0;
    const lo = S.top + pitch / 2 - o.rowGap / 2;
    nowY = Math.max(lo, Math.min(lo + above * pitch, S.height - S.bottom - pitch / 2 + o.rowGap / 2 - below * pitch));
  }
  // lanes: the line you started on in the middle, the others beside it (to the left in the first
  // equation when there are several, so the equations sit close)
  let x0 = 0;
  const heads: Head[] = [];
  cols.forEach(({ mine, lanes }, c) => {
    const side = c === 0 && cols.length > 1 ? -1 : 1;
    const W = Array.from({ length: lanes + 1 }, (_, l) => Math.max(24, ...mine.filter(i => i.lane === l).map(i => i.w || 44)));
    const off = [0];
    for (let l = 1; l <= lanes; l++) off.push(side * (Math.abs(off[l - 1]) + (l === 1 ? W[0] / 2 : W[l - 1] / 2) + o.laneGap + W[l] / 2));
    const left = Math.max(W[0] / 2, ...off.map((v, l) => -v + W[l] / 2)), right = Math.max(W[0] / 2, ...off.map((v, l) => v + W[l] / 2));
    const cx = x0 + left;
    x0 = cx + right + o.colGap;
    const nowRow = mine.find(i => i.now)?.row ?? 0;
    for (const it of mine) {
      it.x = cx + off[it.lane];
      it.y = nowY !== undefined ? nowY + (it.row - nowRow) * pitch : pitch / 2 + it.row * pitch;
      if (!it.w) { it.w = 56; it.h = 18; }
    }
    // the number sits over where you are in the strip, and over the equation's start in the big view
    const lead = (o.strip ? mine.find(i => i.now) : null) ?? mine[0];
    heads.push({ col: c, x: lead ? lead.x : cx, y: Math.min(...mine.map(i => i.y - i.h / 2)) });
    items.push(...mine);
  });
  // arrows between equations: the step a substitution used → the step it made; a new equation's start ← the step it came out of
  const uidCol = new Map(trees.map((t, c) => [t.uid, c]));
  const source = (l: Link) => {
    const t = trees[uidCol.get(l.slot) ?? -1];
    if (!t) return null;
    return itemOf.get(`${t.uid}:${t.vis.get(l.step) ?? l.step}`) ?? null;
  };
  for (const t of trees) {
    if (t.from) { const s = source(t.from), d = itemOf.get(`${t.uid}:${t.root}`); if (s && d && s !== d) arrows.push({ from: s, to: d }); }
    for (const n of t.nodes.values()) {
      if (!n.link) continue;
      const s = source(n.link), d = itemOf.get(`${t.uid}:${n.id}`);
      if (s && d && s !== d && !arrows.some(a => a.from === s && a.to === d)) arrows.push({ from: s, to: d });
    }
  }
  const height = Math.max(0, ...items.map(i => i.y + i.h / 2)) + pitch / 2;
  return { items, edges, arrows, heads, width: Math.max(0, x0 - o.colGap), height, itemOf };
}
