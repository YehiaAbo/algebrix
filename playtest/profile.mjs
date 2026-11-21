// Where does the time go while typing a problem? Prints the top self-time functions.
//   node playtest/profile.mjs "int_0^x sin(t)/t dt = y"
import { createServer } from 'vite';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const server = await createServer({ root: new URL('..', import.meta.url).pathname, server: { port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 860 } });
await p.goto(server.resolvedUrls.local[0]);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('algebrix.toured', '1'); localStorage.setItem('algebrix.prefs', JSON.stringify({ muted: true })); });
await p.reload();
await p.waitForFunction(() => !!window.algebrix);
const cdp = await p.context().newCDPSession(p);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start');
await p.keyboard.press('i'); await p.keyboard.press('Control+a'); await p.keyboard.type(process.argv[2], { delay: 20 }); await p.keyboard.press('Enter');
for (const k of (process.argv[3] ?? '').split(' ').filter(Boolean)) { await p.keyboard.press(k); await p.waitForTimeout(300); }
await p.waitForTimeout(800);
const { profile } = await cdp.send('Profiler.stop');
const self = new Map(), byId = new Map(profile.nodes.map(n => [n.id, n]));
const dt = profile.timeDeltas; const cnt = new Map();
profile.samples.forEach((id, i) => cnt.set(id, (cnt.get(id) ?? 0) + (dt[i] ?? 0)));
for (const [id, us] of cnt) { const n = byId.get(id); const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) ?? 0) + us); }
// inclusive: walk parents
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const incl = new Map();
for (const [id, us] of cnt) { const seen = new Set(); let x = id; while (x) { const f = byId.get(x).callFrame; const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; if (!seen.has(k)) { incl.set(k, (incl.get(k) ?? 0) + us); seen.add(k); } x = parent.get(x); } }
const top = m => [...m].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${(v / 1000).toFixed(0).padStart(7)}ms ${k}`).join('\n');
console.log('SELF\n' + top(self) + '\nINCLUSIVE\n' + top(incl));
await browser.close(); await server.close();
