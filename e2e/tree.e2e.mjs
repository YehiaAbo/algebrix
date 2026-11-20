// The work tree across the top: forks keep what you tried, the same move twice goes back to the
// step you had, a click on a step goes there, arrows show where one equation fed another, the big
// view pans and zooms, and the line under the tree sets how much room it takes.
const add = async (h, src) => { await h.key('n'); await h.type(src); await h.key('Enter'); await h.until(s => s.mode !== 'write', `${src} added`); };
const both = async (h, op, text) => { await h.key(op); await h.type(text); await h.key('Enter'); await h.wait(250); };
const tree = h => h.p.evaluate(() => ({
  items: document.querySelectorAll('#tree .titem').length,
  off: document.querySelectorAll('#tree .titem.off').length,
  here: document.querySelector('#tree .titem.here')?.dataset.id ?? null,
  arrows: document.querySelectorAll('#tree path.tarrow').length,
  alts: window.algebrix.slots[window.algebrix.cur].alts?.length ?? 0,
}));

export const tests = {
  async 'a new move after undo branches, and the old line stays'(h) {
    await h.load('2x + 3 = 7');
    await both(h, '-', '3');
    await h.until(s => s.eq !== '2x + 3 = 7', 'a step');
    await h.key('u'); await h.expectEq('2x + 3 = 7');
    await both(h, '-', '7');
    await h.wait(400);
    const t = await tree(h);
    h.assert(t.items === 3 && t.off === 1 && t.alts === 1, `three steps, the one you left dimmed: ${JSON.stringify(t)}`);
  },

  async 'the same move again goes back to the step you already had'(h) {
    await h.load('2x + 3 = 7');
    await both(h, '-', '3');
    const first = await h.text();
    await h.key('u');
    await both(h, '-', '7');
    await h.key('u');
    await both(h, '-', '3');
    await h.expectEq(first);
    await h.wait(300);
    const t = await tree(h);
    h.assert(t.items === 3, `no copy of the step: ${JSON.stringify(t)}`);
    const said = await h.p.evaluate(() => document.getElementById('hints').textContent);
    h.assert(/already took/.test(said), `says it went back: "${said}"`);
  },

  async 'a click on a step in the tree goes there, even on a line you left'(h) {
    await h.load('2x + 3 = 7');
    await both(h, '-', '3');
    const left = await h.text();
    await h.key('u');
    await both(h, '-', '7');
    await h.wait(400);
    await h.p.click('#tree .titem.off');
    await h.expectEq(left);
    await h.p.click('#tree .titem[data-col="0"]:not(.off):not(.here)');
    await h.expectEq('2x + 3 = 7');
  },

  async 'a substitution draws an arrow from the equation it used'(h) {
    await h.load('x + y = 10');
    await add(h, 'y = 3');
    await h.key('1'); await h.until(s => s.cur === 0, 'equation 1');
    await h.hold('Tab', '2');
    await h.until(s => !s.eq.includes('y'), 'y substituted');
    await h.wait(500);
    const t = await tree(h);
    h.assert(t.arrows === 1, `one arrow between the equations: ${JSON.stringify(t)}`);
  },

  async 'v opens the whole tree big: drag moves it, scroll zooms, a click on a step goes there'(h) {
    await h.load('2x + 3 = 7');
    await h.key('e'); await h.expectEq('x = 2', 10000);
    await h.key('v'); await h.wait(300);
    const open = await h.p.evaluate(() => !document.querySelector('.tree-big').hidden);
    h.assert(open, 'the big view is open');
    const world = () => h.p.evaluate(() => document.querySelector('.tree-big .tree-world').style.transform);
    const before = await world();
    const box = await (await h.p.$('.tree-big-canvas')).boundingBox();
    await h.p.mouse.move(box.x + 60, box.y + 60); await h.p.mouse.down(); await h.p.mouse.move(box.x + 160, box.y + 110, { steps: 5 }); await h.p.mouse.up();
    const dragged = await world();
    h.assert(dragged !== before, `dragging moves the canvas: ${before} → ${dragged}`);
    await h.p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await h.p.mouse.wheel(0, -300); await h.wait(100);
    const zoomed = await world();
    h.assert(/scale\((?!1\))/.test(zoomed) && zoomed !== dragged, `scrolling zooms: ${zoomed}`);
    await h.key('0'); await h.wait(100);
    await h.p.click('.tree-big .titem[data-col="0"]');
    await h.wait(300);
    const closed = await h.p.evaluate(() => document.querySelector('.tree-big').hidden);
    h.assert(closed, 'a click on a step closes the big view');
    await h.until(s => s.eq !== 'x = 2', 'and goes to that step');
    await h.key('v'); await h.wait(200); await h.key('Escape'); await h.wait(150);
    h.assert(await h.p.evaluate(() => document.querySelector('.tree-big').hidden), 'Esc closes it');
  },

  async 'the line under the tree sets its height, and double-click resets it'(h) {
    await h.load('x + 1 = 3');
    const height = () => h.p.evaluate(() => document.getElementById('tree').getBoundingClientRect().height);
    const h0 = await height();
    const bar = await (await h.p.$('#tree-split')).boundingBox();
    await h.p.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
    await h.p.mouse.down(); await h.p.mouse.move(bar.x + bar.width / 2, bar.y + 100, { steps: 6 }); await h.p.mouse.up();
    const h1 = await height();
    h.assert(Math.abs(h1 - h0 - 100) < 8, `taller by the drag: ${h0} → ${h1}`);
    const saved = await h.p.evaluate(() => JSON.parse(localStorage.getItem('algebrix.prefs')).treeH);
    h.assert(Math.abs(saved - h1) < 2, `remembered: ${saved}`);
    await h.p.dblclick('#tree-split');
    await h.wait(100);
    h.assert(Math.abs((await height()) - h0) < 2, 'double-click puts it back');
  },
};
