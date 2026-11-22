// Settings that belong to the person, not to a piece of work: theme, look, sounds,
// speed, size. Saved in the browser; anything can listen for changes.
export type Speed = 'calm' | 'standard' | 'flash';
export interface Prefs {
  theme: 'system' | 'dark' | 'light';
  look: string;
  sounds: string;
  volume: number;
  muted: boolean;
  speed: Speed;
  /** how fast animations run when not in flash mode: 1 is standard, 2 twice as fast (the slider) */
  tempo: number;
  /** math size multiplier */
  size: number;
  /** the key hints in the bottom bar */
  hints: boolean;
  /** panel layout: widths of the rail and graph, the graph's height when below, and where the graph sits */
  railW: number;
  sideW: number;
  sideH: number;
  graphAt: 'right' | 'below' | 'float' | 'hidden';
  /** the floating graph's window: left, top, width, height in px (x < 0 until first placed) */
  floatX: number; floatY: number; floatW: number; floatH: number;
  /** your accent colour ('' keeps the theme's own) */
  accent: string;
  /** how tall the work tree across the top is */
  treeH: number;
}

const KEY = 'algebrix.prefs';
const DEFAULTS: Prefs = { theme: 'system', look: 'studio', sounds: 'classic', volume: 0.8, muted: false, speed: 'standard', tempo: 1, size: 1, hints: true, railW: 216, sideW: 400, sideH: 300, graphAt: 'right', treeH: 176, floatX: -1, floatY: 0, floatW: 460, floatH: 380, accent: '' };
/** how long animations take relative to standard; flash is fast but still visible */
export const SPEED_FACTOR: Record<Speed, number> = { calm: 1.45, standard: 1, flash: 0.38 };

function load(): Prefs {
  const p = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(p, JSON.parse(raw));
    else {
      // older versions kept these on their own
      const t = localStorage.getItem('algebrix.theme');
      if (t === 'dark' || t === 'light') p.theme = t;
      p.muted = localStorage.getItem('algebrix.muted') === '1';
    }
  } catch { /* storage blocked */ }
  return p;
}

export const prefs: Prefs = load();
export const PANEL_DEFAULTS = { railW: DEFAULTS.railW, sideW: DEFAULTS.sideW, sideH: DEFAULTS.sideH, treeH: DEFAULTS.treeH };
const listeners: ((p: Prefs, changed: keyof Prefs) => void)[] = [];

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  if (prefs[k] === v) return;
  prefs[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage blocked */ }
  for (const f of listeners) f(prefs, k);
}

export const onPrefs = (f: (p: Prefs, changed: keyof Prefs) => void) => { listeners.push(f); };

/** scale an animation length by the chosen speed */
export const paceFactor = () => (prefs.speed === 'flash' ? SPEED_FACTOR.flash : prefs.speed === 'calm' ? SPEED_FACTOR.calm : 1 / (prefs.tempo || 1));
export const ms = (x: number) => Math.round(x * paceFactor());
