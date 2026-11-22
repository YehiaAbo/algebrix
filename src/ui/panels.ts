// Panel layout: drag the gaps between the rail, the work and the graph to resize them
// (double-click a gap to reset it), and put the graph on the right, below, floating, or away.
import { prefs, setPref, PANEL_DEFAULTS } from './prefs';

type Key = 'railW' | 'sideW' | 'sideH';
const LIMITS: Record<Key, [number, number]> = { railW: [150, 360], sideW: [220, 760], sideH: [160, 600] };
const VAR: Record<Key, string> = { railW: '--rail-w', sideW: '--side-w', sideH: '--side-h' };

export function applyPanels() {
  const app = document.querySelector<HTMLElement>('.app')!;
  for (const k of Object.keys(VAR) as Key[]) app.style.setProperty(VAR[k], `${prefs[k]}px`);
  app.style.setProperty('--tree-h', `${prefs.treeH}px`);
  app.dataset.graph = prefs.graphAt;
  if (prefs.graphAt === 'float') placeFloat();
}

/** the floating graph's window, kept on screen (a smaller window or another screen) */
function placeFloat() {
  const app = document.querySelector<HTMLElement>('.app')!;
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.round(Math.max(MIN_W, Math.min(prefs.floatW, vw - 16))), h = Math.round(Math.max(MIN_H, Math.min(prefs.floatH, vh - 16)));
  // first time: where the docked graph sat, top right
  const x0 = prefs.floatX < 0 ? vw - w - 24 : prefs.floatX;
  const x = Math.round(Math.max(8, Math.min(vw - w - 8, x0))), y = Math.round(Math.max(8, Math.min(vh - h - 8, prefs.floatY < 0 ? 72 : prefs.floatY || 72)));
  app.style.setProperty('--fx', `${x}px`); app.style.setProperty('--fy', `${y}px`);
  app.style.setProperty('--fw', `${w}px`); app.style.setProperty('--fh', `${h}px`);
  return { x, y, w, h };
}
const MIN_W = 220, MIN_H = 170;

export function initPanels() {
  const app = document.querySelector<HTMLElement>('.app')!;
  const make = (cls: string, key: Key, dir: 'v' | 'h', sign: 1 | -1) => {
    const el = document.createElement('div');
    el.className = `split ${dir} ${cls}`;
    el.title = 'Drag to resize. Double-click to reset.';
    app.append(el);
    el.addEventListener('dblclick', () => { setPref(key, PANEL_DEFAULTS[key]); applyPanels(); });
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      el.classList.add('drag');
      document.body.classList.add('resizing');
      document.body.style.cursor = dir === 'v' ? 'col-resize' : 'row-resize';
      const start = dir === 'v' ? e.clientX : e.clientY, from = prefs[key];
      let now = from;
      const move = (m: PointerEvent) => {
        const d = (dir === 'v' ? m.clientX : m.clientY) - start;
        const [lo, hi] = LIMITS[key];
        now = Math.round(Math.max(lo, Math.min(hi, from + sign * d)));
        app.style.setProperty(VAR[key], `${now}px`);
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.classList.remove('drag');
        document.body.classList.remove('resizing');
        document.body.style.cursor = '';
        setPref(key, now);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
  };
  initTreeSplit();
  initGraphHead();
  make('split-rail', 'railW', 'v', 1);
  make('split-side', 'sideW', 'v', -1);
  make('split-below', 'sideH', 'h', -1);
  applyPanels();
}

/** right → below → floating → hidden → right */
export function cycleGraph() {
  const order: typeof prefs.graphAt[] = ['right', 'below', 'float', 'hidden'];
  setPref('graphAt', order[(order.indexOf(prefs.graphAt) + 1) % order.length]);
  applyPanels();
  return prefs.graphAt;
}

/** the line under the work tree: drag it to give the tree more or less of the board */
function initTreeSplit() {
  const app = document.querySelector<HTMLElement>('.app')!, el = document.getElementById('tree-split')!, board = document.getElementById('board')!;
  el.addEventListener('dblclick', () => { setPref('treeH', PANEL_DEFAULTS.treeH); applyPanels(); });
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('drag');
    document.body.classList.add('resizing');
    document.body.style.cursor = 'row-resize';
    const start = e.clientY, from = prefs.treeH;
    let now = from;
    const move = (m: PointerEvent) => {
      // the equation keeps at least 180px
      now = Math.round(Math.max(72, Math.min(board.clientHeight - 180, from + m.clientY - start)));
      app.style.setProperty('--tree-h', `${now}px`);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.classList.remove('drag');
      document.body.classList.remove('resizing');
      document.body.style.cursor = '';
      setPref('treeH', now);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  });
}

/** the graph's bar: its buttons dock, float or hide it; its grip moves it (from a dock it pops out
 *  under the pointer); floating, its edges and corners stretch it */
function initGraphHead() {
  const app = document.querySelector<HTMLElement>('.app')!, side = document.querySelector<HTMLElement>('.side')!;
  const head = document.getElementById('graph-head')!, grip = head.querySelector<HTMLElement>('.gh-grip')!;
  head.querySelectorAll<HTMLButtonElement>('button[data-at]').forEach(b => b.addEventListener('click', () => {
    setPref('graphAt', b.dataset.at as typeof prefs.graphAt);
    applyPanels();
  }));
  const save = (r: { x: number; y: number; w: number; h: number }) => { setPref('floatX', r.x); setPref('floatY', r.y); setPref('floatW', r.w); setPref('floatH', r.h); };
  const set = (r: { x: number; y: number; w: number; h: number }) => {
    app.style.setProperty('--fx', `${Math.round(r.x)}px`); app.style.setProperty('--fy', `${Math.round(r.y)}px`);
    app.style.setProperty('--fw', `${Math.round(r.w)}px`); app.style.setProperty('--fh', `${Math.round(r.h)}px`);
  };
  /** follow the pointer until it lets go; f gives the window for the distance moved */
  const follow = (e: PointerEvent, el: HTMLElement, cursor: string, f: (dx: number, dy: number) => { x: number; y: number; w: number; h: number }) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    document.body.classList.add('resizing', 'graph-moving');
    document.body.style.cursor = cursor;
    let last = f(0, 0);
    const move = (m: PointerEvent) => { last = f(m.clientX - e.clientX, m.clientY - e.clientY); set(last); };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing', 'graph-moving');
      document.body.style.cursor = '';
      save({ x: Math.round(last.x), y: Math.round(last.y), w: Math.round(last.w), h: Math.round(last.h) });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  grip.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    if (prefs.graphAt !== 'float') {
      // pop out: the window keeps the docked graph's size (within reason) and sits under the pointer
      const r = side.getBoundingClientRect();
      const w = Math.max(MIN_W, Math.min(r.width, 560)), h = Math.max(MIN_H, Math.min(r.height, 460));
      setPref('floatW', Math.round(w)); setPref('floatH', Math.round(h));
      setPref('floatX', Math.round(e.clientX - 60)); setPref('floatY', Math.round(e.clientY - 16));
      setPref('graphAt', 'float');
      applyPanels();
    }
    const start = placeFloat();
    const vw = window.innerWidth, vh = window.innerHeight;
    follow(e, grip, 'grabbing', (dx, dy) => ({ ...start, x: Math.max(8, Math.min(vw - start.w - 8, start.x + dx)), y: Math.max(8, Math.min(vh - start.h - 8, start.y + dy)) }));
  });
  for (const d of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
    const h = document.createElement('div');
    h.className = `gh-rs ${d}`;
    side.append(h);
    h.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const s = placeFloat(), vw = window.innerWidth, vh = window.innerHeight;
      follow(e, h, getComputedStyle(h).cursor, (dx, dy) => {
        let { x, y, w, h: ht } = s;
        if (d.includes('e')) w = Math.min(vw - x - 4, s.w + dx);
        if (d.includes('s')) ht = Math.min(vh - y - 4, s.h + dy);
        if (d.includes('w')) { const nw = Math.max(MIN_W, Math.min(s.x + s.w - 4, s.w - dx)); x = s.x + s.w - nw; w = nw; }
        if (d.includes('n')) { const nh = Math.max(MIN_H, Math.min(s.y + s.h, s.h - dy)); y = s.y + s.h - nh; ht = nh; }
        return { x, y, w: Math.max(MIN_W, w), h: Math.max(MIN_H, ht) };
      });
    });
  }
  window.addEventListener('resize', () => { if (prefs.graphAt === 'float') placeFloat(); });
}
