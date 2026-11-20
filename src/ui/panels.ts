// Panel layout: drag the gaps between the rail, the work and the graph to resize them
// (double-click a gap to reset it), and put the graph on the right, below, or away.
import { prefs, setPref, PANEL_DEFAULTS } from './prefs';

type Key = 'railW' | 'sideW' | 'sideH';
const LIMITS: Record<Key, [number, number]> = { railW: [150, 360], sideW: [220, 760], sideH: [160, 600] };
const VAR: Record<Key, string> = { railW: '--rail-w', sideW: '--side-w', sideH: '--side-h' };

export function applyPanels() {
  const app = document.querySelector<HTMLElement>('.app')!;
  for (const k of Object.keys(VAR) as Key[]) app.style.setProperty(VAR[k], `${prefs[k]}px`);
  app.style.setProperty('--tree-h', `${prefs.treeH}px`);
  app.dataset.graph = prefs.graphAt;
}

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
  make('split-rail', 'railW', 'v', 1);
  make('split-side', 'sideW', 'v', -1);
  make('split-below', 'sideH', 'h', -1);
  applyPanels();
}

/** right → below → hidden → right */
export function cycleGraph() {
  const order: typeof prefs.graphAt[] = ['right', 'below', 'hidden'];
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
