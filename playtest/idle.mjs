// After a few moves, is anything still animating while you sit still? Counts the app's own
// animation-frame callbacks and running Web Animations during 2 s of idle.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 860 } });
await p.addInitScript(() => { const raf = window.requestAnimationFrame.bind(window); window.__raf = 0; window.requestAnimationFrame = cb => { window.__raf++; return raf(cb); }; });
await p.goto(server.resolvedUrls.local[0]);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('algebrix.toured', '1'); localStorage.setItem('algebrix.prefs', JSON.stringify({ muted: true })); });
await p.reload();
await p.waitForFunction(() => !!window.algebrix);
await p.keyboard.press('i'); await p.keyboard.press('Control+a'); await p.keyboard.type(process.argv[2] ?? '3x + 2 = 8', { delay: 20 }); await p.keyboard.press('Enter');
for (const k of (process.argv[3] ?? 'Space ArrowRight m s u r').split(' ')) { await p.keyboard.press(k); await p.waitForTimeout(250); }
await p.waitForTimeout(2000);
const r = await p.evaluate(async () => { window.__raf = 0; await new Promise(r => setTimeout(r, 2000)); return { raf: window.__raf, all: document.getAnimations().length, anims: document.getAnimations().filter(a => a.playState === 'running').map(a => (a.effect?.target?.className?.baseVal ?? a.effect?.target?.className ?? '') + ' ' + (a.effect?.getTiming().iterations)).slice(0, 10), nodes: document.querySelectorAll('*').length }; });
console.log(JSON.stringify(r));
await browser.close(); await server.close();
