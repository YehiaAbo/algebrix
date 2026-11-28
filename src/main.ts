import { field } from './ui/mathfield';
import './style.css';
import { App } from './ui/app';
import { toText } from './engine/print';
import { parseEquation } from './engine/parse';
import { formsFor } from './engine/forms';
import { calcForms } from './ui/calcforms';
import { clearMeasureCache } from './render/layout';
import { resetMetrics } from './render/stage';

import { applyAll } from './ui/appearance';
import { prefs } from './ui/prefs';
import { look } from './packs';

applyAll();

async function start() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('64px "STIX Two Text"'),
        document.fonts.load('italic 64px "STIX Two Text"'),
        document.fonts.load('14px "Instrument Sans"'),
        ...(look(prefs.look).fonts ? [document.fonts.load(`64px ${getComputedStyle(document.documentElement).getPropertyValue('--math-font')}`)] : []),
      ]),
      new Promise(r => setTimeout(r, 1500)),
    ]);
  } catch { /* fonts unavailable: fall back to system serif */ }
  clearMeasureCache();
  resetMetrics();
  const app = new App();
  Object.assign(window, { algebrix: app, toText, field });
  // the first numeric integral the app works out costs about 200 ms (the engine's code warming up):
  // one is done while nothing else is happening, so the first Tab or C on an integral opens at once
  const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 300));
  idle(() => { try { const e = parseEquation('I(t) = int_0^1 (x^t - 1)/ln(x) dx'); calcForms(e, null); formsFor(e, null); } catch { /* a warm-up only */ } });
  // a font arriving (a maths label in a new size) re-measures everything, but never cuts a move's
  // animation short: it waits for it to end
  document.fonts.addEventListener('loadingdone', () => {
    clearMeasureCache(); resetMetrics();
    const when = () => {
      const running = document.getElementById('stage')!.getAnimations({ subtree: true }).filter(a => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity);
      if (!running.length) return app.renderAll(null);
      Promise.all(running.map(a => a.finished.catch(() => undefined))).then(when);
    };
    when();
  });
}
start();
