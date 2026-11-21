// Play a problem in the real app the way a person does: keys, typing, mouse clicks on what is
// drawn. Nothing here calls the app's own functions to make a move; it only reads what the
// screen shows (the equation, the aim, the bar, the open panel) after each line.
//
//   node playtest/play.mjs session.txt        (one command per line; # starts a comment)
//
// Commands:
//   type <text>          types into whatever has focus
//   key <K> [K …]        presses keys in order (Enter, Tab, ArrowLeft, Control+a, x, …)
//   hold <K> <K2>        holds K (Tab, c, f) while pressing K2
//   click <piece>        clicks the drawn piece whose text is <piece>, then ↑ until it is aimed;
//                        <piece> @2 takes the second one drawn with that text
//   drag <a> | <b>       box-selects with the mouse from piece a to piece b
//   menu                 prints the open hub or palette (what the keys offer right now)
//   shot <name>          screenshot to playtest/shots/<name>.png
//   wait <ms>
// After every command: equation number, the equation, what is aimed, and any bar message.
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lines = (await readFile(process.argv[2], 'utf8')).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

const server = await createServer({ root, server: { port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const p = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
p.on('pageerror', e => errors.push(String(e)));
await p.goto(server.resolvedUrls.local[0]);
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('algebrix.toured', '1'); localStorage.setItem('algebrix.prefs', JSON.stringify({ speed: 'flash', muted: true })); });
await p.reload();
await p.waitForFunction(() => !!window.algebrix);

// reading the screen: the same things a person sees
const look = () => p.evaluate(() => {
  const a = window.algebrix, q = s => document.querySelector(s);
  const vis = s => { const e = q(s); return e && !e.hidden && e.offsetParent ? e.innerText.replace(/\s+/g, ' ').trim() : ''; };
  return {
    n: a.slots.length ? `(${a.cur + 1}/${a.slots.length})` : '(none)',
    eq: a.slots.length ? window.toText(a.eq) : '',
    aim: (() => { if (!a.sel || !a.slots.length) return ''; if (a.sel === 'eq') return 'everything'; let hit = null;
      const visit = n => { if (hit || !n || typeof n !== 'object') return; if (n.id === a.sel) { hit = n; return; } for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object' && v.k) visit(v); };
      visit(a.eq); return hit ? window.toText(hit) : ''; })(),
    bar: a.message?.text ?? '',
    op: vis('#op') , input: vis('#input-error'),
  };
});
const where = spec => p.evaluate(([t, nth]) => {
  const a = window.algebrix, hits = [];
  const visit = n => { if (!n || typeof n !== 'object') return; if (n.k && n.k !== 'eq' && window.toText(n) === t) hits.push(n.id); for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object' && v.k) visit(v); };
  visit(a.eq);
  const r = hits.length > nth ? a.stage.box(hits[nth]) : null;
  if (!r) return null;
  const s = document.getElementById('stage').getBoundingClientRect();
  return { x: s.x + r.x + r.w / 2, y: s.y + r.y + r.h / 2, l: s.x + r.x + 2, rt: s.x + r.x + r.w - 2 };
}, [spec.replace(/ @\d+$/, ''), Number(spec.match(/ @(\d+)$/)?.[1] ?? 1) - 1]);

let last = '';
for (const line of lines) {
  const [cmd, ...rest] = line.split(' ');
  const arg = rest.join(' ');
  try {
    if (cmd === 'type') await p.keyboard.type(arg, { delay: 15 });
    else if (cmd === 'key') for (const k of rest) { await p.keyboard.press(k); await p.waitForTimeout(80); }
    else if (cmd === 'hold') { await p.keyboard.down(rest[0]); await p.waitForTimeout(80); await p.keyboard.press(rest[1]); await p.waitForTimeout(80); await p.keyboard.up(rest[0]); }
    else if (cmd === 'click' || cmd === 'drag') {
      const [a, b] = cmd === 'drag' ? arg.split(' | ') : [arg];
      const pa = await where(a);
      if (!pa) { console.log(`  !! nothing drawn reads "${a}"`); continue; }
      if (cmd === 'click') {
        // click, then grow the aim with ↑ until it is the piece meant (what a person does)
        await p.mouse.click(pa.x, pa.y); await p.waitForTimeout(120);
        for (let i = 0; i < 6 && (await look()).aim !== a.replace(/ @\d+$/, ''); i++) { await p.keyboard.press('ArrowUp'); await p.waitForTimeout(80); }
      }
      else {
        const pb = await where(b);
        if (!pb) { console.log(`  !! nothing drawn reads "${b}"`); continue; }
        await p.mouse.move(pa.l, pa.y - 30); await p.mouse.down(); await p.mouse.move(pb.rt, pb.y + 30, { steps: 8 }); await p.mouse.up();
      }
    } else if (cmd === 'menu') {
      console.log('  menu: ' + await p.evaluate(() => [...document.querySelectorAll('#forms, .pal, .hub, #op')].filter(e => !e.hidden && e.offsetParent).map(e => e.innerText.replace(/\s+/g, ' ').trim()).join(' || ')));
      continue;
    } else if (cmd === 'shot') { await mkdir(join(root, 'playtest/shots'), { recursive: true }); await p.screenshot({ path: join(root, `playtest/shots/${arg}.png`) }); continue; }
    else if (cmd === 'wait') await p.waitForTimeout(Number(arg));
    else { console.log(`  !! unknown command ${cmd}`); continue; }
  } catch (e) { console.log(`  !! ${e.message}`); }
  await p.waitForTimeout(350);
  const s = await look();
  const out = `${s.n} ${s.eq}${s.aim ? `   [aim ${s.aim}]` : ''}${s.bar ? `   «${s.bar}»` : ''}${s.op ? `   op: ${s.op}` : ''}${s.input ? `   input: ${s.input}` : ''}`;
  console.log(`> ${line}\n  ${out === last ? '(no change)' : out}`);
  last = out;
}
if (errors.length) console.log('PAGE ERRORS: ' + errors.join('; '));
await browser.close();
await server.close();
