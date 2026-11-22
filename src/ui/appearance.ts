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

/** your accent colour: aim, tree and the first curve take it (style.css lifts it a little in dark).
 *  A blue-ish accent moves the second colour (copies, the second curve) from blue to amber */
export function applyAccent() {
  const root = document.documentElement, c = prefs.accent;
  if (!/^#[0-9a-f]{6}$/i.test(c)) { delete root.dataset.accent; root.style.removeProperty('--accent'); return; }
  const n = parseInt(c.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  const hue = !d ? 0 : ((mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
  root.style.setProperty('--accent', c);
  root.dataset.accent = hue > 170 && hue < 265 && d > 0.15 ? 'cool' : 'warm';
}

export function applyAll() { applyTheme(); applyLook(); applySpeed(); applyAccent(); }
