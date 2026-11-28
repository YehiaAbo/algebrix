// The contract every menu (Tab, C, f) keeps, on any equation: its cards never overlap or get cut, the
// whole menu fits without scrolling (at the user's 1250 × 850 too),
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
  // the user's screen (2026-11-28): a tall Σ whose C cards wrap into two lines; the menu was capped and scrolled
  { id: 'tall sum', src: 'sum_{k=4}^{499} k^2 + 250014' },
];

/** ms from the key press to the menu drawn, first open, dev build. The target is 16 (one frame); this
 *  starts loose so the test is steady, and comes down as the menus stop working everything out up front.
 *  MENU_MS=1 prints every time. Measured 2026-11-27: 4 to 65 ms, and about 170 on the Feynman integral. */
const BUDGET = 100;

const KNOWN = new Set([
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
  const capped = host.scrollHeight > host.clientHeight + 1;
  const cards = [...host.querySelectorAll('button')].filter(b => !b.classList.contains('pal-tab') && !b.classList.contains('pal-eg') && b.offsetParent);
  return cards.map(b => {
    const r = b.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, cut: b.scrollWidth > b.clientWidth + 1, on: b.classList.contains('on'), capped, text: (b.textContent ?? '').trim().slice(0, 40) };
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
  // the whole menu fits: nothing to scroll to see
  if (cards.some(a => a.capped)) broken.push('capped');
  // arrows alone: step in, then → through the line(s); every card must light up on the way
  for (const k of menu.enter) await key(k);
  const seen = new Set();
  for (let i = 0; i <= cards.length + 1; i++) {
    const now = await read(p);
    if (!now) break;
    now.forEach((a, j) => { if (a.on) seen.add(j); });
    // browsing plays each card on the equation, which can grow it: the menu must still fit
    if (now.some(a => a.capped) && !broken.includes('capped')) broken.push('capped');
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
  // the user's window (2026-11-28 screenshot): narrower than the suite's, so cards wrap more
  await h.p.setViewportSize({ width: 1250, height: 850 });
  try { for (const c of CORPUS) found.push(...await check(h, menu, c)); } finally { await h.p.setViewportSize({ width: 1440, height: 860 }); }
  const fresh = found.filter(f => !KNOWN.has(f));
  const fixed = [...KNOWN].filter(k => k.startsWith(menu.id + '|') && !found.includes(k));
  const msg = [];
  if (fresh.length) msg.push(`new breaks of the menu contract: ${fresh.join(', ')}`);
  if (fixed.length) msg.push(`fixed, take these off KNOWN in e2e/menus.e2e.mjs: ${fixed.join(', ')}`);
  if (msg.length) throw new Error(msg.join('\n'));
}

export const tests = {
  async 'Tab is one even grid of same-size cards, only what applies, nothing twice'({ p, load, key, assert, wait, countRefusals, refusals }) {
    await load('2x^2 + 4x = 6');
    await key('Tab');
    await wait(200);
    const cards = await p.evaluate(() => [...document.querySelectorAll('#forms .pal-items [data-i]')].map(b => { const r = b.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), off: b.classList.contains('off'), name: b.textContent }; }));
    assert(cards.length >= 4, `cards: ${cards.length}`);
    assert(new Set(cards.map(c => `${c.w}x${c.h}`)).size === 1, `all the same size: ${JSON.stringify(cards.map(c => `${c.w}x${c.h}`))}`);
    assert(!cards.some(c => c.off), 'no greyed-out card');
    assert(new Set(cards.map(c => c.name)).size === cards.length, 'no card twice');
    // a technique that doesn't apply is not shown, and its key still says why
    await countRefusals();
    await key('a');
    assert(await refusals() === 1, 'Tab a (split into cases) refused with its reason');
    await key('Escape');
  },

  async 'Tab box: = then + 1 adds 1 − 1 to the aimed piece, previewed as you type; m starts it with ×'({ p, load, key, type, until, wait }) {
    await load('x^2 + 2x = 3');
    await p.evaluate(() => { const a = window.algebrix; a.sel = a.eq.lhs.id; a.renderSelection(); });
    await key('Tab');
    await wait(150);
    await key('=');
    await p.waitForSelector('#hub-input');
    await type('+1');
    await p.waitForFunction(() => window.algebrix.peek && window.toText(window.algebrix.peek) === 'x^2 + 2x + 1 − 1 = 3', null, { timeout: 3000 });
    await key('Enter');
    await until(s => s.eq === 'x^2 + 2x + 1 − 1 = 3' && s.mode !== 'hub', 'applied, menu closed');
    await load('y = 3x');
    await p.evaluate(() => { const a = window.algebrix; a.sel = a.eq.rhs.id; a.renderSelection(); });
    await key('Tab');
    await wait(150);
    await key('m');
    await p.waitForSelector('#hub-input');
    await type('2');
    await key('Enter');
    await until(s => s.eq === 'y = 3x·2/2', 'm typed × 2: times 2/2');
  },

  'Tab keeps the menu contract on every kind of equation': h => contract(h, MENUS[0]),
  'C keeps the menu contract on every kind of equation': h => contract(h, MENUS[1]),
  'f keeps the menu contract on every kind of equation': h => contract(h, MENUS[2]),
};
