// What a key press costs the browser: script, style, layout and paint time per move.
//   node playtest/frames.mjs "3x + 2 = 8" "Space ArrowRight m s u"
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 2 });
await p.goto(server.resolvedUrls.local[0]);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('algebrix.toured', '1'); localStorage.setItem('algebrix.prefs', JSON.stringify({ muted: true })); });
await p.reload();
await p.waitForFunction(() => !!window.algebrix);
await p.keyboard.press('i'); await p.keyboard.press('Control+a'); await p.keyboard.type(process.argv[2] ?? '3x^2 + 2x - 5 = 4x + 1', { delay: 10 }); await p.keyboard.press('Enter');
await p.waitForTimeout(800);
const cdp = await p.context().newCDPSession(p);
await cdp.send('Performance.enable');
const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
for (const k of (process.argv[3] ?? 'Space ArrowRight m m s u u Tab Escape').split(' ')) {
  const a = await get(); await p.keyboard.press(k); await p.waitForTimeout(700); const b = await get();
  const d = n => ((b[n] - a[n]) * 1000).toFixed(1);
  console.log(k.padEnd(10), 'script', d('ScriptDuration'), 'style', d('RecalcStyleDuration'), 'layout', d('LayoutDuration'), 'layouts', b.LayoutCount - a.LayoutCount, 'styles', b.RecalcStyleCount - a.RecalcStyleCount, 'task', d('TaskDuration'));
}
await browser.close(); await server.close();
