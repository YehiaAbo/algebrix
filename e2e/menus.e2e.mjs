// The contract every menu (Tab, C, f) keeps, on any equation: its cards never overlap or get cut,
// every card can be reached by the arrow keys alone, ↓ moves down a line of cards when there is
// one, and the menu opens within a frame budget. See docs/ARCHITECTURE.md (8.1).
//
// KNOWN lists what breaks the contract today, so the suite stays green while the menus are rebuilt.
// A known break that is fixed fails the test too, with a note to take it off the list: the list
// only ever shrinks.

const CORPUS = [
  // the user's repro (2026-11-27): a written-out sum, the whole equation aimed
  { id: 'written-out sum', src: '1 + 4 + 9 + ... + 250000', aim: ['ArrowRight', 'ArrowUp'] },
  { id: 'linear', src: '2x + 3 = 7' },
  { id: 'quadratic', src: 'x^2 - 5x + 6 = 0' },
  { id: 'feynman', src: 'I(t) = int_0^1 (x^t - 1)/ln(x) dx' },
  { id: 'series', src: 'S = sum_{n=1}^inf 1/(n(n+1))' },
  { id: 'derivative', src: 'y = d/dx (x^2 sin(x))' },
  { id: 'log', src: 'y = ln(x)' },
];

/** ms from the key press to the menu drawn, first open, dev build. The target is 16 (one frame); this
 *  starts loose so the test is steady, and comes down as the menus stop working everything out up front.
 *  MENU_MS=1 prints every time. Measured 2026-11-27: 4 to 65 ms, and about 170 on the Feynman integral. */
const BUDGET = 100;

const KNOWN = new Set([
  // issue 2: Tab's form row doesn't wrap and its cards shrink below their content
  'tab|written-out sum|cut',
  // Tab's technique chips can't be reached by arrows (only ← → over the forms)
  ...['written-out sum', 'linear', 'quadratic', 'feynman', 'series', 'derivative', 'log'].map(id => `tab|${id}|unreachable`),
  // Tab and C work out and check every form and technique before they draw (about 170 ms here)
  'tab|feynman|slow', 'calc|feynman|slow',
]);

const MENUS = [
  { id: 'tab', open: 'Tab', enter: [] },
  { id: 'calc', open: 'c', enter: ['ArrowDown'] },
  { id: 'fn', open: 'f', enter: ['ArrowDown'] },
];

/** the menu's cards in drawing order (section tabs and the box's examples aside), their boxes, and which is on */
const read = p => p.evaluate(() => {
  const host = document.getElementById('forms');
  if (!host || host.hidden) return null;
  const cards = [...host.querySelectorAll('button')].filter(b => !b.classList.contains('pal-tab') && !b.classList.contains('pal-eg') && b.offsetParent);
  return cards.map(b => {
    const r = b.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, cut: b.scrollWidth > b.clientWidth + 1, on: b.classList.contains('on'), text: (b.textContent ?? '').trim().slice(0, 40) };
  });
});

const overlap = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

async function check(h, menu, c) {
  const { p, load, key, wait } = h;
  const broken = [];
  await load(c.src);
  for (const k of c.aim ?? []) await key(k);
  // opened by a tap, so it stays open; timed from the key to the end of its drawing
  // (the first open counts: that is the one the person waits for, before any cache is warm)
  const open = () => p.evaluate(k => {
    const t = performance.now();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
    return performance.now() - t;
  }, menu.open);
  const ms = await open();
  await wait(250);
  const cards = await read(p);
  if (!cards) throw new Error(`${menu.id} on ${c.id}: the menu did not open`);
  if (process.env.MENU_MS) console.log(`      ${menu.id} ${c.id} ${ms.toFixed(0)} ms`);
  if (ms > BUDGET) broken.push("slow");
  if (cards.some((a, i) => cards.some((b, j) => j > i && overlap(a, b)))) broken.push('overlap');
  if (cards.some(a => a.cut)) broken.push('cut');
  // arrows alone: step in, then → through the line(s); every card must light up on the way
  for (const k of menu.enter) await key(k);
  const seen = new Set();
  for (let i = 0; i <= cards.length + 1; i++) {
    const now = await read(p);
    if (!now) break;
    now.forEach((a, j) => { if (a.on) seen.add(j); });
    await key('ArrowRight');
  }
  if (cards.length && seen.size < cards.length) broken.push('unreachable');
  // ↓ from the first card the arrows reach goes down a line, when there is a line of cards below it
  if (new Set(cards.map(a => Math.round(a.y / 8))).size > 1) {
    await key('Escape', 'Escape', 'Escape');
    await load(c.src);
    for (const k of c.aim ?? []) await key(k);
    await p.evaluate(k => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); }, menu.open);
    await wait(200);
    for (const k of menu.enter) await key(k);
    if (!(await read(p))?.some(a => a.on)) await key('ArrowRight');
    const now = await read(p), before = now?.find(a => a.on);
    if (before && now.some(a => a.y > before.y + before.h - 1)) {
      await key('ArrowDown');
      const after = (await read(p))?.find(a => a.on);
      if (!after || after.y <= before.y + 1) broken.push('down');
    }
  }
  await key('Escape', 'Escape', 'Escape');
  return broken.map(b => `${menu.id}|${c.id}|${b}`);
}

async function contract(h, menu) {
  const found = [];
  for (const c of CORPUS) found.push(...await check(h, menu, c));
  const fresh = found.filter(f => !KNOWN.has(f));
  const fixed = [...KNOWN].filter(k => k.startsWith(menu.id + '|') && !found.includes(k));
  const msg = [];
  if (fresh.length) msg.push(`new breaks of the menu contract: ${fresh.join(', ')}`);
  if (fixed.length) msg.push(`fixed, take these off KNOWN in e2e/menus.e2e.mjs: ${fixed.join(', ')}`);
  if (msg.length) throw new Error(msg.join('\n'));
}

export const tests = {
  'Tab keeps the menu contract on every kind of equation': h => contract(h, MENUS[0]),
  'C keeps the menu contract on every kind of equation': h => contract(h, MENUS[1]),
  'f keeps the menu contract on every kind of equation': h => contract(h, MENUS[2]),
};
