import './style.css';
import { App } from './ui/app';
import { toText } from './engine/print';
import { clearMeasureCache } from './render/layout';
import { resetMetrics } from './render/stage';

try {
  const t = localStorage.getItem('algebrix.theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch { /* storage blocked */ }

async function start() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('64px "STIX Two Text"'),
        document.fonts.load('italic 64px "STIX Two Text"'),
        document.fonts.load('14px "Instrument Sans"'),
      ]),
      new Promise(r => setTimeout(r, 1500)),
    ]);
  } catch { /* fonts unavailable: fall back to system serif */ }
  clearMeasureCache();
  resetMetrics();
  const app = new App();
  Object.assign(window, { algebrix: app, toText });
  document.fonts.addEventListener('loadingdone', () => { clearMeasureCache(); resetMetrics(); app.renderAll(null); });
}
start();
