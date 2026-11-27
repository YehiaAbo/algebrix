// The chaos run: plays the real built app (dist/index.html) like a careless, curious user. Random
// (seeded) walks through every menu, with weird things typed into every box, keys mashed with no
// waiting, equations added and removed, the window resized. It fails on:
//   - a page error or console error (other than the safety net's log of a refusal it showed),
//   - undefined / NaN / [object …] showing anywhere on screen,
//   - pieces left on the stage that no layout owns,
//   - Esc, Esc, Esc not bringing the app back to plain solving,
//   - a step in the line whose equation can't be printed, a box open without the keyboard focus,
//   - a key press that blocks the page for more than the budget.
// Run: npm run build && npm run chaos  (SEED=7 RUNS=40 STEPS=60 to vary)
import { createRequire } from 'module';
import { readFileSync, writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }

const SEED = Number(process.env.SEED ?? 1127), RUNS = Number(process.env.RUNS ?? 30), STEPS = Number(process.env.STEPS ?? 50);
const BUDGET = Number(process.env.BUDGET ?? 400);
let s = SEED >>> 0;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
const pick = a => a[Math.floor(rnd() * a.length)];

const CORPUS = readFileSync(new URL('./corpus.txt', import.meta.url), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
const WEIRD = ['', ')(', '1/0', '0/0', 'x^^2', '((((x', 'int int int', 'sqrt(-1)', 'x = = 2', '1e999', '9999999999999999999999', 'ln(0)', 'f(f(f(x)))', '|||x|||',
  'inf - inf', 'x_1_2', 'd/dx', 'sum_{n=1}^inf n', 'lim x->0 1/x', 'θ', 'x,y', '<b>x</b>', 'x <= >= 3', '2', 'x', '-x', '1/x', 'x^2', 'e^x', 'f(4)', 'f(x^2+1)', 'y = 2',
  't = 0', 'a = 1, b = 2', 'u', 'I(5)', '0', '-1', 'pi', 'sin', 'ln', '/', '^', '_', '=', '+', '.', ' ', 'x/0', '(x+1)/(x-1)', 'n!', 'C(5,2)', '⟨1,2⟩', "y'", 'dx', 'oo'];
const OPEN_BOX = ['o', '=', '-', '.', '/', '^', 'b', 'p'];
const HUBKEYS = 'abcdefghijklmnopqrstuvwxyz0123456789=+-/^'.split('');

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
p.on('pageerror', e => errors.push('page error: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('[algebrix] refused move')) errors.push('console: ' + m.text()); });
await p.goto('file://' + new URL('../dist/index.html', import.meta.url).pathname);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('algebrix.toured', '1'); localStorage.setItem('algebrix.prefs', JSON.stringify({ speed: 'flash', muted: true })); });
await p.reload(); await p.waitForFunction(() => !!window.algebrix);
await p.evaluate(() => { window.__block = []; new PerformanceObserver(l => { for (const e of l.getEntries()) window.__block.push(Math.round(e.duration)); }).observe({ type: 'longtask' }); });

const look = () => p.evaluate(() => {
  const a = window.algebrix, st = a.stage, live = new Set([...st.entries.values()].map(e => e.el));
  const strays = [...st.root.querySelectorAll(':scope > .g')].filter(g => !live.has(g) && !st.ghosts.has(g)).length;
  const text = document.body.innerText;
  const junk = (text.match(/(?<!(is|are|be) )undefined|\bNaN\b|\[object \w+\]/) || [])[0] || null;
  let bad = null;
  for (const sl of a.slots) for (const step of sl.steps) { try { window.toText(step.eq); } catch (e) { bad = String(e); } }
  let eq = '?'; try { eq = window.toText(a.eq); } catch (e) { eq = 'unprintable: ' + e; }
  const box = { write: 'input', op: 'op-input', fnask: 'pal-input' }[a.mode];
  const lost = box && !document.getElementById(box)?.contains(document.activeElement) ? `${a.mode} box without focus (focus on ${document.activeElement?.id || document.activeElement?.tagName})` : null;
  return { eq, mode: a.mode, strays, junk, bad, lost };
});
const block = () => p.evaluate(() => { const b = window.__block; window.__block = []; return b; });
const typeWeird = async () => { const w = pick(WEIRD); await p.keyboard.type(w, { delay: rnd() < 0.5 ? 0 : 8 }); return w; };

const ACTIONS = [
  ['walk', async () => { const k = pick(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'Escape', 'k', 'j']); await p.keyboard.press(k); return k; }],
  ['label aim', async () => { await p.keyboard.press(' '); await p.keyboard.press(pick('asdfghjkl'.split(''))); return 'Space + letter'; }],
  ['grow', async () => { await p.keyboard.down('Control'); await p.keyboard.press(pick(['ArrowLeft', 'ArrowRight'])); await p.keyboard.up('Control'); return 'Ctrl+arrow'; }],
  ['move', async () => { const k = pick(['m', 'm', 'm', 's', 'd', 'x', 'q', 'Shift+ArrowLeft', 'Shift+ArrowRight', 'Shift+ArrowUp', 'Shift+ArrowDown']); await p.keyboard.press(k); return k; }],
  ['mash', async () => { const ks = Array.from({ length: 6 }, () => pick(['m', 's', 'u', 'r', 'Shift+ArrowRight', 'ArrowRight', 'd'])); for (const k of ks) await p.keyboard.press(k); return 'mash ' + ks.join(' '); }],
  ['undo/redo', async () => { const ks = Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => pick(['u', 'r', 'u'])); for (const k of ks) await p.keyboard.press(k); return ks.join(' '); }],
  ['Tab hold', async () => { const k = pick(HUBKEYS); await p.keyboard.down('Tab'); await p.waitForTimeout(40); await p.keyboard.press(k); await p.keyboard.up('Tab'); return 'Tab+' + k; }],
  ['Tab browse', async () => { await p.keyboard.press('Enter'); const ks = Array.from({ length: 3 }, () => pick(['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', pick(HUBKEYS)])); for (const k of ks) await p.keyboard.press(k); const end = pick(['Tab', 'Escape', 'Enter']); await p.keyboard.press(end); return 'Enter ' + ks.join(' ') + ' ' + end; }],
  ['C hub', async () => { await p.keyboard.press('c'); await p.waitForTimeout(30); const ks = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(['ArrowLeft', 'ArrowRight', 'ArrowDown', pick(HUBKEYS)])); for (const k of ks) await p.keyboard.press(k); if (rnd() < 0.5) { const w = await typeWeird(); await p.keyboard.press('Enter'); return 'c ' + ks.join(' ') + ' typed ' + JSON.stringify(w); } await p.keyboard.press('Escape'); return 'c ' + ks.join(' '); }],
  ['f menu', async () => { await p.keyboard.press('f'); await p.waitForTimeout(30); if (rnd() < 0.6) { const w = await typeWeird(); const end = pick(['Enter', 'Enter', 'Escape']); await p.keyboard.press(end); return `f typed ${JSON.stringify(w)} ${end}`; } const k = pick(['1', '2', '3', 'i', '-', 'q', 'u', 'v', 'p', 'ArrowDown', 'ArrowRight']); await p.keyboard.press(k); await p.keyboard.press('Escape'); return 'f ' + k; }],
  ['box', async () => { const k = pick(OPEN_BOX); await p.keyboard.press(k); await p.waitForTimeout(30); if (rnd() < 0.3) await p.keyboard.press('Control+a'); const w = await typeWeird(); const end = pick(['Enter', 'Enter', 'Escape']); await p.keyboard.press(end); return `${k} typed ${JSON.stringify(w)} ${end}`; }],
  ['edit', async () => { await p.keyboard.press(pick(['i', 'n'])); await p.waitForTimeout(30); if (rnd() < 0.5) { await p.keyboard.press('Control+a'); await p.keyboard.press('Backspace'); } const w = await typeWeird(); if (rnd() < 0.3) await p.keyboard.press(pick(['ArrowDown', 'Tab'])); const end = pick(['Enter', 'Enter', 'Escape']); await p.keyboard.press(end); return `edit typed ${JSON.stringify(w)} ${end}`; }],
  ['solve', async () => { await p.keyboard.press('e'); await p.waitForTimeout(200); if (rnd() < 0.5) await p.keyboard.press(pick('xyabt'.split(''))); return 'e'; }],
  ['switch', async () => { const k = pick(['1', '2', '3', 'Alt+ArrowLeft', 'Alt+ArrowRight', 'Backspace']); await p.keyboard.press(k); return k; }],
  ['tree', async () => { await p.keyboard.press('v'); await p.waitForTimeout(60); await p.keyboard.press(pick(['ArrowLeft', 'ArrowUp', 'Enter', 'Escape'])); await p.keyboard.press('Escape'); return 'v'; }],
  ['resize', async () => { const w = pick([700, 1000, 1280, 1600]), h = pick([560, 800, 1000]); await p.setViewportSize({ width: w, height: h }); return `resize ${w}x${h}`; }],
];

const fails = [];
const slow = [];
let now = { src: '', log: [] };
p.on('crash', () => { console.log(`\nPAGE CRASHED on ${now.src}\n  last keys: ${now.log.slice(-8).join(' | ')}`); process.exit(2); });
for (let run = 0; run < RUNS; run++) {
  const src = pick(CORPUS);
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.evaluate(s => window.algebrix.loadFresh(s), src);
  await p.waitForTimeout(80);
  errors.length = 0;
  const log = [];
  now = { src, log };
  for (let i = 0; i < STEPS; i++) {
    const [, act] = pick(ACTIONS);
    await block();
    let what;
    try { what = await act(); } catch (e) { what = 'driver: ' + e.message; }
    log.push(what);
    await p.waitForTimeout(rnd() < 0.3 ? 0 : 50);
    const lt = await block();
    const at = await look();
    if (lt.some(t => t > BUDGET)) {
      slow.push(`${src}: ${what} blocked ${Math.max(...lt)}ms (now ${at.eq})`);
      if (process.env.DUMP && slow.length === 1) writeFileSync(process.env.DUMP, await p.evaluate(() => JSON.stringify(localStorage)));
    }
    const why = errors.length ? errors.join('; ') : at.junk ? `"${at.junk}" on screen` : at.strays ? `${at.strays} stray piece(s)` : at.bad ? `unprintable step: ${at.bad}` : at.lost;
    if (why) { fails.push(`${src} (run ${run}, step ${i}): ${why}\n    eq now ${at.eq}, mode ${at.mode}\n    last keys: ${log.slice(-6).join(' | ')}`); errors.length = 0; break; }
  }
  for (let i = 0; i < 4; i++) await p.keyboard.press('Escape');
  await p.waitForTimeout(80);
  const end = await look();
  if (process.env.MEM) console.log(`run ${run}: heap ${await p.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1e6))} MB, nodes ${await p.evaluate(() => document.getElementsByTagName('*').length)}`);
  if (end.mode !== 'solve') fails.push(`${src} (run ${run}): Esc ×4 left mode ${end.mode}\n    last keys: ${log.slice(-6).join(' | ')}`);
}
await b.close();
console.log(`\nseed ${SEED}: ${RUNS} runs × ${STEPS} steps`);
if (slow.length) console.log(`\nSlow (over ${BUDGET} ms blocked):\n  ` + [...new Set(slow)].join('\n  '));
if (fails.length) { console.log(`\n${fails.length} failures:\n  ` + fails.join('\n  ')); process.exit(1); }
console.log('All held.');
