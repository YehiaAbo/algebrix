// Turns preferences into what you see: theme, look pack, animation speed.
import { prefs, paceFactor } from './prefs';
import { LOOKS, look } from '../packs';
import { setEase, setPace, SMOOTH } from '../render/stage';
import { clearMeasureCache } from '../render/layout';
import { resetMetrics } from '../render/stage';

const loaded = new Set<string>();

/** every look's CSS is scoped to its data-look, so all of it can sit in one style tag */
function injectLooks() {
  if (document.getElementById('look-css')) return;
  const st = document.createElement('style');
  st.id = 'look-css';
  st.textContent = LOOKS.map(l => l.css).join('\n');
  document.head.append(st);
}

function loadFonts(families: string) {
  if (loaded.has(families)) return;
  loaded.add(families);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
  document.head.append(link);
}

export function applyTheme() {
  const root = document.documentElement;
  if (prefs.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = prefs.theme;
}

export const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};

export function applyLook() {
  injectLooks();
  const l = look(prefs.look);
  if (l.fonts) loadFonts(l.fonts);
  document.documentElement.dataset.look = l.id;
  setEase(l.easing ?? SMOOTH);
  clearMeasureCache();
  resetMetrics();
  return l;
}

export function applySpeed() {
  const f = paceFactor();
  setPace(f);
  document.documentElement.style.setProperty('--pace', String(f));
  document.documentElement.dataset.speed = prefs.speed;
}

export function applyAll() { applyTheme(); applyLook(); applySpeed(); }
