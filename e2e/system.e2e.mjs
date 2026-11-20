// Several equations: the work tree across the top, switching, substituting, eliminating.
const add = async (h, src) => { await h.key('n'); await h.type(src); await h.key('Enter'); await h.until(s => s.mode !== 'write', `${src} added`); };

export const tests = {
  async 'the tree shows every equation and what the others share'(h) {
    await h.load('2x + 3y = 12');
    await add(h, 'x - y = 1');
    await add(h, 'z = 5');
    await h.key('1'); await h.until(s => s.cur === 0, 'equation 1');
    const heads = await h.p.evaluate(() => [...document.querySelectorAll('#tree .thead')].map(l => ({ n: l.dataset.col, offer: l.querySelector('.toffer')?.textContent ?? '' })));
    h.assert(heads.length === 3, `three equations in the tree, got ${heads.length}`);
    h.assert(heads[1].offer.startsWith('shares x, y'), `equation 2 shares x and y: "${heads[1].offer}"`);
    h.assert(heads[2].offer === '', `equation 3 shares nothing: "${heads[2].offer}"`);
    await h.p.keyboard.down('Tab'); await h.wait(150);
    const linked = await h.p.evaluate(() => [...document.querySelectorAll('#tree .thead.linked')].map(l => l.dataset.col));
    await h.p.keyboard.up('Tab'); await h.key('Escape');
    h.assert(linked.join() === '1', `only equation 2 lights up while Tab is held: ${linked}`);
  },

  async 'click or Alt + → switches equations'(h) {
    await h.load('x + y = 10');
    await add(h, 'x - y = 2');
    await h.key('1'); await h.until(s => s.cur === 0, 'equation 1');
    await h.key('Alt+ArrowRight'); await h.until(s => s.cur === 1, 'Alt + → to equation 2');
    await h.key('Alt+ArrowRight'); await h.wait(200);
    h.assert((await h.state()).cur === 1, 'Alt + → at the last equation stays put');
    await h.p.click('#tree .thead[data-col="0"]');
    await h.until(s => s.cur === 0, 'a click on its number in the tree switches');
  },

  async 'substitute and eliminate between equations'(h) {
    await h.load('2x + 3y = 12');
    await add(h, 'x - y = 1');
    await h.key('1'); await h.until(s => s.cur === 0, 'equation 1');
    await h.hold('Tab', '2');
    await h.until(s => s.cur === 0 && (!s.eq.includes('x') || !s.eq.includes('y')), 'one variable substituted away');
    await h.key('u'); await h.until(s => s.eq === '2x + 3y = 12', 'undo');
    await h.hold('Tab', 'k');
    await h.until(s => s.eq !== '2x + 3y = 12', 'eliminate to change the equation');
    for (let i = 0; i < 4 && (await h.text()).includes('x'); i++) { await h.key('s'); await h.wait(250); }
    await h.key('e'); await h.until(s => /^y = /.test(s.eq), 'solved for y after eliminating', 10000);
    await h.key('2'); await h.until(s => s.cur === 1, 'equation 2');
    await h.key('Tab'); await h.key('1'); await h.until(s => s.cur === 1 && !(s.eq.includes('x') && s.eq.includes('y')), 'the answer substituted into 2');
  },

  async 'adding an equation with #1'(h) {
    await h.load('x + y = 10');
    await add(h, 'x - y = 2');
    await h.key('='); await h.type('#1'); await h.key('Enter');
    await h.until(s => s.eq.includes('10'), '#1 added to both sides');
    for (let i = 0; i < 4; i++) { await h.key('s'); await h.wait(200); }
    await h.key('e'); await h.expectEq('x = 6', 10000);
  },

  async 'the graph names where a system crosses, and switching clears the old message'(h) {
    await h.load('x^2 + y^2 = 25');
    await add(h, 'y = x + 1');
    await h.key('1'); await h.until(s => s.cur === 0, 'equation 1');
    await h.wait(400);
    const note = await h.p.evaluate(() => document.getElementById('graph-note').textContent);
    h.assert(note.includes('(−4, −3)') && note.includes('(3, 4)'), `the crossings: ${note}`);
    const bar = await h.p.evaluate(() => document.getElementById('hints').textContent);
    h.assert(!bar.includes('Equation 2'), `no stale message: ${bar}`);
  },

  async 'a system solved by substituting answers with points'(h) {
    await h.load('x^2 + y^2 = 25');
    await add(h, 'y = x + 1');
    await h.key('1'); await h.until(s => s.cur === 0, 'equation 1');
    await h.hold('Tab', '2'); await h.until(s => !s.eq.includes('y'), 'y substituted away');
    await h.key('e'); await h.until(s => /^x = /.test(s.eq), 'solved', 12000);
    await h.p.waitForFunction(() => document.getElementById('answer').textContent.includes('(x, y)'), null, { timeout: 5000 }).catch(() => {});
    const ans = await h.p.evaluate(() => document.getElementById('answer').textContent);
    h.assert(ans.includes('(−4, −3)') && ans.includes('(3, 4)'), `points: ${ans}`);
  },
};
