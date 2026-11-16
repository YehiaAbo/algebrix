// Your work, kept as separate workspaces (shown as cards in the library, w).
// Each one holds its equations with their full step history.
import type { Domain } from '../engine/moves';

export interface Work<S = unknown> {
  id: string;
  name: string;
  created: number;
  updated: number;
  slots: S[];
  cur: number;
  domains: Record<string, Domain>;
}

interface Store<S> { v: 1; current: string; list: Work<S>[] }
const KEY = 'algebrix.works';
const uid = () => Math.random().toString(36).slice(2, 10);

let store: Store<unknown> | null = null;

function read(): Store<unknown> {
  if (store) return store;
  let s: Store<unknown> | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = JSON.parse(raw);
    else {
      // the single-session format from earlier versions becomes the first card
      const old = localStorage.getItem('algebrix.session');
      if (old) {
        const o = JSON.parse(old) as { slots?: unknown[]; cur?: number; steps?: unknown[]; at?: number; domains?: Record<string, Domain> };
        const slots = o.slots ?? (o.steps?.length ? [{ steps: o.steps, at: o.at ?? 0, sel: null }] : []);
        if (slots.length) {
          const w: Work = { id: uid(), name: 'My work', created: Date.now(), updated: Date.now(), slots, cur: o.cur ?? 0, domains: o.domains ?? {} };
          s = { v: 1, current: w.id, list: [w] };
        }
      }
    }
  } catch { /* storage blocked or corrupt: start empty */ }
  store = s ?? { v: 1, current: '', list: [] };
  return store;
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage blocked or full */ }
}

export const works = {
  /** most recently touched first */
  list<S>(): Work<S>[] { return [...(read().list as Work<S>[])].sort((a, b) => b.updated - a.updated); },
  get<S>(id: string): Work<S> | undefined { return (read().list as Work<S>[]).find(w => w.id === id); },
  get currentId() { return read().current; },
  setCurrent(id: string) { read().current = id; write(); },
  create<S>(slots: S[] = [], name = ''): Work<S> {
    const s = read();
    const w: Work<S> = { id: uid(), name: name || nextName(), created: Date.now(), updated: Date.now(), slots, cur: 0, domains: {} };
    s.list.push(w as Work<unknown>);
    s.current = w.id;
    write();
    return w;
  },
  save<S>(id: string, data: Pick<Work<S>, 'slots' | 'cur' | 'domains'>) {
    const w = read().list.find(x => x.id === id);
    if (!w) return;
    const next = JSON.stringify(data.slots);
    if (JSON.stringify(w.slots) !== next || w.cur !== data.cur || JSON.stringify(w.domains) !== JSON.stringify(data.domains)) w.updated = Date.now();
    Object.assign(w, { slots: JSON.parse(next), cur: data.cur, domains: { ...data.domains } });
    write();
  },
  rename(id: string, name: string) { const w = read().list.find(x => x.id === id); if (w && name.trim()) { w.name = name.trim(); write(); } },
  duplicate<S>(id: string): Work<S> | undefined {
    const s = read();
    const w = s.list.find(x => x.id === id);
    if (!w) return;
    const copy: Work = { ...JSON.parse(JSON.stringify(w)), id: uid(), name: `${w.name} copy`, created: Date.now(), updated: Date.now() };
    s.list.push(copy);
    write();
    return copy as Work<S>;
  },
  remove(id: string) {
    const s = read();
    s.list = s.list.filter(w => w.id !== id);
    if (s.current === id) s.current = s.list.sort((a, b) => b.updated - a.updated)[0]?.id ?? '';
    write();
  },
};

function nextName() {
  const names = new Set(read().list.map(w => w.name));
  let i = 1;
  while (names.has(`Work ${i}`)) i++;
  return `Work ${i}`;
}
