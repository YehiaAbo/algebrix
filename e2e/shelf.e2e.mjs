// Several equations: the shelf across the top, switching, substituting, eliminating.
const add = async (h, src) => { await h.key('n'); await h.type(src); await h.key('Enter'); await h.until(s => s.mode !== 'write', `${src} added`); };

export const tests = {
  async 'the shelf shows the other equations and what they share'(h) {
    await h.load('2x + 3y = 12');
    await add(h, 'x - y = 1');
    await add(h, 'z = 5');
    await h.key('1'); await h.until(s => s.cur === 0, 'equation 1');
    const lanes = await h.p.evaluate(() => [...document.querySelectorAll('#dock-row .lane')].map(l => ({ n: l.dataset.lane, offer: l.querySelector('.lane-offer').textContent })));
    h.assert(lanes.length === 2, `two equations on the shelf, got ${lanes.length}`);
    h.assert(lanes[0].offer.startsWith('shares x, y'), `equation 2 shares x and y: "${lanes[0].offer}"`);
    h.assert(lanes[1].offer === '', `equation 3 shares nothing: "${lanes[1].offer}"`);
    await h.p.keyboard.down('Tab'); await h.wait(150);
    const linked = await h.p.evaluate(() => [...document.querySelectorAll('#dock-row .lane.linked')].map(l => l.dataset.lane));
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
    await (await h.p.$('#dock-row .lane[data-lane="0"]')).dispatchEvent('mousedown');
    await h.until(s => s.cur === 0, 'a click on the shelf switches');
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
};
