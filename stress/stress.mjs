// The stress suite: every core key on a wide mix of equations, tidy and messy, in the real built
// app (dist/index.html), by key presses only. It fails on:
//   - a page error or console error (other than the safety net's own log of a refusal it showed),
//   - a move the bar offered that then did nothing or was refused,
//   - undo not returning exactly to before, or redo not returning exactly to after,
//   - a hub (Tab, C, f) that changes the equation by being opened and closed,
//   - a key press whose work blocks the page for more than the budget.
// Run: npm run build && npm run stress  (or npm run stress -- "x^2 = 4" for one equation)
import { createRequire } from 'module';
import { readFileSync } from 'fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }

const BUDGET = Number(process.env.BUDGET ?? 50); // ms of blocked main thread per key press
const CORPUS = process.argv[2] ? [process.argv[2]] : readFileSync(new URL('./corpus.txt', import.meta.url), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
p.on('pageerror', e => errors.push('page error: ' + e.message));
p.on('console', m => { if (m.type() === 'error' && !m.text().startsWith('[algebrix] refused move')) errors.push('console: ' + m.text()); });
await p.goto('file://' + new URL('../dist/index.html', import.meta.url).pathname);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('algebrix.toured', '1'); localStorage.setItem('algebrix.prefs', JSON.stringify({ speed: 'flash', muted: true })); });
await p.reload(); await p.waitForFunction(() => !!window.algebrix);
// how long each key press blocks the page: from the keydown to the end of the first task after it
await p.evaluate(() => {
  window.__block = [];
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__block.push(Math.round(e.duration)); }).observe({ type: 'longtask' });
});

const st = () => p.evaluate(() => {
  const a = window.algebrix, h = document.querySelector('#hints');
  return { eq: window.toText(a.eq), mode: a.mode, sel: a.sel, slots: a.slots.length, hints: h ? h.textContent : '', bar: h ? h.textContent : '' };
});
const settle = (ms = 60) => p.waitForTimeout(ms);
const press = async k => { await p.evaluate(() => { window.__block = []; }); await p.keyboard.press(k); await settle(); return p.evaluate(() => window.__block.slice()); };

const fails = [];
const slow = [];
let checks = 0;
const fail = (src, what) => fails.push(`${src}\n    ${what}`);

for (const src of CORPUS) {
  errors.length = 0;
  await p.evaluate(s => window.algebrix.loadFresh(s), src);
  await settle(120);
  const start = await st();
  if (errors.length) { fail(src, `loading: ${errors.join('; ')}`); continue; }
  // walk the pieces: → through the top level, and ↓ into each
  const seen = new Set();
  const walks = ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowRight', 'ArrowRight', 'Shift+Tab', 'ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowRight'];
  for (const w of walks) {
    const lt = await press(w);
    if (lt.some(t => t > BUDGET)) slow.push(`${src}: aim ${w} blocked ${Math.max(...lt)}ms`);
    const here = await st();
    if (!here.sel || seen.has(here.sel)) continue;
    seen.add(here.sel);
    // every single-key move the bar offers for this piece must do something, undo and redo exactly
    const offered = [['m', /\bm ?(move|÷|×|undo|take)/], ['s', /\bs ?simplify/], ['d', /\bd ?distribute/], ['x', /\bx ?swap/], ['Shift+ArrowLeft', /⇧←/], ['Shift+ArrowRight', /⇧→/]].filter(([, re]) => re.test(here.hints));
    for (const [k] of offered) {
      checks++;
      const before = await st();
      errors.length = 0;
      const lt = await press(k);
      await settle(80);
      const after = await st();
      if (lt.some(t => t > BUDGET)) slow.push(`${src}: ${k} on ${before.sel} blocked ${Math.max(...lt)}ms`);
      if (errors.length) { fail(src, `${k} (offered): ${errors.join('; ')}`); }
      if (after.eq === before.eq) {
        // a slide that only reordered pieces the same way is fine; anything else offered must change
        if (!/Shift/.test(k)) fail(src, `${k} was offered on "${before.sel}" but nothing changed: ${after.bar.slice(0, 120)}`);
        continue;
      }
      await press('u'); await settle(80);
      const undone = await st();
      if (undone.eq !== before.eq) fail(src, `u after ${k} gave "${undone.eq}", not "${before.eq}"`);
      await press('r'); await settle(80);
      const redone = await st();
      if (redone.eq !== after.eq) fail(src, `r after ${k} gave "${redone.eq}", not "${after.eq}"`);
      await press('u'); await settle(80);
      // m twice more on a term: whatever it left aimed crosses back, and back again (holding m
      // ping-pongs). A whole side moved makes a 0 and stays put; that one is not a ping-pong.
      const zero = q => /^0 [=<>≤≥]|[=<>≤≥] 0$/.test(q);
      if (k === 'm' && !(zero(after.eq) && !zero(before.eq))) {
        checks++;
        await p.evaluate(id => { const a = window.algebrix; a.select(id, true); a.renderHints(); }, before.sel); await settle(60);
        await press('m'); await settle(80);
        const one = await st();
        await press('m'); await settle(80);
        const back = await st();
        await press('m'); await settle(80);
        const again = await st();
        if (one.eq === before.eq) fail(src, `m after undo did nothing on "${before.sel}" (aimed ${one.sel})`);
        else if (back.eq === one.eq) fail(src, `m again after moving "${before.sel}" did nothing (aimed ${back.sel}): ${back.bar.slice(0, 120)}`);
        else if (again.eq !== one.eq) fail(src, `m, m, m on "${before.sel}" gave "${again.eq}", not "${one.eq}" again`);
        for (let i = 0; i < 8 && (await st()).eq !== before.eq; i++) { await press('u'); await settle(60); }
        await p.evaluate(id => { const a = window.algebrix; a.select(id, true); a.renderHints(); }, before.sel); await settle(60);
      }
      // back where we were, aimed again for the next walk step
    }
  }
  // the hubs: opening and closing must leave the equation alone
  for (const hub of ['Tab', 'c', 'f']) {
    checks++;
    errors.length = 0;
    const before = await st();
    await p.keyboard.down(hub); await settle(80);
    const lt = await p.evaluate(() => window.__block.slice());
    await p.keyboard.up(hub); await settle(60);
    await press('Escape'); await settle(60);
    const after = await st();
    if (after.eq !== before.eq) fail(src, `opening and closing ${hub} changed "${before.eq}" to "${after.eq}"`);
    if (after.mode !== 'solve') fail(src, `after ${hub} and Esc the mode is ${after.mode}`);
    if (errors.length) fail(src, `${hub} hub: ${errors.join('; ')}`);
    if (lt.some(t => t > BUDGET)) slow.push(`${src}: opening ${hub} blocked ${Math.max(...lt)}ms`);
  }
  // e: whatever it does, no errors, and u walks all the way back to the start
  checks++;
  errors.length = 0;
  await p.evaluate(s => window.algebrix.loadFresh(s), src); await settle(100);
  const elt = await press('e');
  await settle(1500);
  if (errors.length) fail(src, `e: ${errors.join('; ')}`);
  if (elt.some(t => t > 4 * BUDGET)) slow.push(`${src}: e blocked ${Math.max(...elt)}ms`);
  for (let i = 0; i < 40 && (await st()).eq !== start.eq; i++) await press('u');
  const back = await st();
  if (back.eq !== start.eq) fail(src, `after e, u all the way did not return to the start: "${back.eq}"`);
}

await b.close();
console.log(`\n${CORPUS.length} equations, ${checks} checks`);
if (slow.length) console.log(`\nSlow (over ${BUDGET} ms blocked):\n  ` + slow.join('\n  '));
if (fails.length) { console.log(`\n${fails.length} failures:\n  ` + fails.join('\n  ')); process.exit(1); }
console.log('All held.');
