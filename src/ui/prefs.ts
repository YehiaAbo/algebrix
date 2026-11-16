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
  /** math size multiplier */
  size: number;
  /** the key hints in the bottom bar */
  hints: boolean;
}

const KEY = 'algebrix.prefs';
const DEFAULTS: Prefs = { theme: 'system', look: 'studio', sounds: 'classic', volume: 0.8, muted: false, speed: 'standard', size: 1, hints: true };
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
const listeners: ((p: Prefs, changed: keyof Prefs) => void)[] = [];

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  if (prefs[k] === v) return;
  prefs[k] = v;
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* storage blocked */ }
  for (const f of listeners) f(prefs, k);
}

export const onPrefs = (f: (p: Prefs, changed: keyof Prefs) => void) => { listeners.push(f); };

/** scale an animation length by the chosen speed */
export const ms = (x: number) => Math.round(x * SPEED_FACTOR[prefs.speed]);
