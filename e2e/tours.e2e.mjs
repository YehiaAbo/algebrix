// Every tour, played end to end with the keys it asks for. Each step's action runs, then
// the tour must move on to the next step (or finish).
const browse = name => async ({ key, p, wait }) => {
  await key('Tab'); await wait(150);
  const names = await p.evaluate(() => window.algebrix.hub.forms.map(f => f.name));
  const i = names.indexOf(name);
  if (i < 0) throw new Error(`no form "${name}" in ${JSON.stringify(names)}`);
  for (let j = 0; j <= i; j++) await key('ArrowRight');
  await key('Tab');
};
const tab = k => h => h.hold('Tab', k);
const fn = k => h => h.hold('f', k);
const keys = (...ks) => h => h.key(...ks);
const aimThen = (target, ...ks) => async h => { await h.key('Escape'); await h.aim(target); await h.key(...ks); };
const aimTab = (target, k) => async h => { await h.key('Escape'); await h.aim(target); await h.hold('Tab', k); };
const both = (...acts) => async h => { for (const a of acts) { await a(h); await h.wait(250); } };
/** run one action, then wait for a while before the next (for steps that need two equations solved) */
const later = (a, ms = 900) => async h => { await a(h); await h.wait(ms); };

const PLAYS = {
  basics: [keys('ArrowRight'), aimThen('7'), keys('m'), keys('Escape', 's'), aimThen('3x', 'ArrowDown', 'm'), keys('Escape', 's'), keys('u'), keys('r'),
    async h => { await h.key('/'); await h.type('0'); await h.key('Enter'); }, keys('e')],
  pick: [aimThen('3'), async h => { await h.p.keyboard.down('Control'); await h.key('ArrowRight'); await h.p.keyboard.up('Control'); }, keys('s'), aimThen('2x', 'Shift+ArrowRight'),
    async ({ p }) => {
      const host = await (await p.$('#stage')).boundingBox();
      const [a, b] = await p.evaluate(() => { const app = window.algebrix; return app.base.lhs.terms.slice(0, 2).map(t => app.stage.box(t.id)); });
      await p.mouse.move(host.x + a.x - 8, host.y + a.y - 10); await p.mouse.down();
      await p.mouse.move(host.x + b.x + b.w + 6, host.y + b.y + b.h + 10, { steps: 5 }); await p.mouse.up();
    }, keys('m')],
  algebra: [keys('Tab'), async h => { const b = browse('factored'); await h.key('Escape'); await b(h); }, tab('a'), keys('e'), both(keys('Alt+ArrowRight'), keys('e')), fn('i'), keys('Escape', 's')],
  systems: [async h => { await h.key('n'); await h.type('x - y = 2'); await h.key('Enter'); }, async h => { await h.key('='); await h.type('#1'); await h.key('Enter'); },
    async h => { for (let i = 0; i < 4; i++) { await h.key('s'); await h.wait(250); } }, keys('e'), both(keys('1'), tab('2')), keys('e')],
  beyond: [keys('e'), keys('e'), browse('expanded'), tab('b'), async h => { await h.key('n'); await h.type('f(4) = y'); await h.key('Enter'); }, tab('u')],
  // the tests run in flash mode already, so z twice: off, then on again
  work: [keys('w'), keys('Escape'), keys(','), keys('Escape'), keys('z', 'z'), keys('e')],
  linear: [aimThen('5(x − 2)', 'd'), aimThen('3x', 'm'), keys('Escape', 's'), keys('e')],
  fractions: [tab('d'), keys('e'), keys('e'), tab('c')],
  factoring: [tab('f'), aimTab('12', 'f'), tab('f'), tab('f'), tab('f'), tab('f')],
  square: [tab('h'), aimThen('−4', 'm'), async h => { await h.key('Escape'); await h.hold('f', 'i'); }, keys('s'), tab('a'), both(later(keys('e')), keys('Alt+ArrowRight'), keys('e'))],
  formula: [tab('g'), tab('s'), both(keys('Alt+ArrowRight'), tab('s')), tab('g'), tab('s')],
  identities: [tab('x'), tab('x'), tab('f'), tab('f')],
  trig: [browse('trig: Pythagorean'), browse('trig: double angle'), tab('z'), tab('f'), browse('trig: angle difference'), browse('trig: even/odd')],
  inequalities: [aimThen('3', 'm'), keys('Escape', 's'), aimThen('−2x', 'ArrowDown', 'm'), keys('Escape', 's'), keys('e')],
  abs: [tab('a'), both(later(keys('e')), keys('Alt+ArrowRight'), keys('e')), tab('a')],
  powers: [fn('i'), keys('e'), async h => { for (let i = 0; i < 4; i++) { await h.key('s'); await h.wait(300); } }, aimTab('x^(−1)', 'r')],
  logs: [fn('i'), keys('e'), fn('l'), tab('l'), keys('e')],
  expressions: [keys('s'), aimThen('−3(x − 1)', 'd'), keys('Escape', 'e'), tab('f')],
};

export const tests = {};
for (const [id, plays] of Object.entries(PLAYS)) {
  tests[id] = async h => {
    await h.key('g'); await h.wait(150);
    // start with the key the menu shows for it
    const k = await h.p.evaluate(id => document.querySelector(`.tour-pick[data-id="${id}"] kbd`)?.textContent, id);
    if (!k) throw new Error(`no tour "${id}" in the menu`);
    await h.key(k);
    await h.until(s => s.tour === id, `tour ${id} to start`);
    for (let i = 0; i < plays.length; i++) {
      await h.until(s => s.tour === id && s.step === i + 1, `step ${i + 1}`);
      await h.wait(200);
      await plays[i](h);
      await h.until(s => s.tour !== id || s.step > i + 1, `step ${i + 1} of ${id} to be done`, 10000);
    }
    const done = await h.p.evaluate(() => localStorage.getItem('algebrix.tours') ?? '');
    h.assert(done.includes(`"${id}"`), `${id} should be marked finished`);
  };
}
