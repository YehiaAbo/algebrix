// Round 15: the notation cards, stacked integrals (typed any way), wrong roots that must never look solved,
// the other case on the shelf, and the graph's calculus pictures.
export const tests = {
  async 'typing int brings up notation cards: ↓ picks, Tab takes, and the caret lands inside'({ p, key, type, until, assert, wait }) {
    await key('i'); await type('2 + in'); await wait(150);
    const cards = await p.evaluate(() => [...document.querySelectorAll('#notation .nota span')].map(s => s.textContent));
    assert(cards.includes('integral') && cards.includes('definite integral'), `the integral cards: ${cards}`);
    await key('ArrowDown', 'Tab');
    const v = await p.evaluate(() => document.getElementById('input').value);
    assert(v === '2 + int_0^1  dx', `the definite integral went in: ${v}`);
    assert(await p.evaluate(() => document.getElementById('notation').hidden), 'the cards went away');
    await type('x^2'); await key('Enter');
    await until(s => s.eq === '2 + ∫_{0}^{1} x^2 dx', 'typed through the card');
  },

  async 'stacked integrals type and work out, with one + C'({ key, type, until, p, assert }) {
    await key('i');
    await type('int int x y dx');
    const shown = await p.evaluate(() => window.toText(window.algebrix.preview));
    assert(shown === '∫ ∫ xy dx d□', `the outer one waits for its d□: ${shown}`);
    await type(' dy'); await key('Enter');
    await until(s => s.eq === '∫ ∫ xy dx dy', 'typed');
    await key('e'); await until(s => s.eq === 'x^2y^2/4 + C', 'worked out', 12000);
  },

  async 'double and triple integrals type however you write them, and work out'({ key, type, until }) {
    await key('i'); await type('int_0^1int_0^2 x y dxdy'); await key('Enter');
    await until(s => s.eq === '∫_{0}^{1} ∫_{0}^{2} xy dx dy', 'typed run together');
    await key('e'); await until(s => s.eq === '1', 'worked out', 15000);
    await key('i'); await type('iiint x y z dxdydz'); await key('Enter');
    await until(s => s.eq === '∫ ∫ ∫ xyz dx dy dz', 'iiint typed');
    await key('e'); await until(s => s.eq === 'x^2y^2z^2/8 + C', 'worked out', 15000);
  },

  async 'a product and a finite sum are written out and worked out'({ key, type, until }) {
    await key('i'); await type('sum_{i=1}^{2} prod_{j=0}^{3} (i + j)'); await key('Enter');
    await until(s => s.eq.startsWith('Σ'), 'typed');
    await key('e'); await until(s => s.eq === '144', 'worked out', 12000);
  },

  async 'a root that fails the original is marked, never shown as solved'({ load, key, until, p, assert }) {
    await load('sqrt(x + 3) = x - 3');
    await key('e'); await until(s => s.eq === 'x = 1' || s.eq === 'x = 6', 'solved, in cases', 12000);
    await until(s => s.eq === 'x = 1', 'x = 1 is the current case');
    const look = await p.evaluate(() => ({ stage: document.getElementById('stage').classList.contains('extraneous'), ans: document.getElementById('answer').textContent, vars: document.getElementById('vars').textContent }));
    assert(look.stage && look.ans.includes('not a solution') && look.vars.includes('not a solution'), `marked: ${JSON.stringify(look)}`);
  },

  async 'splitting into cases puts the other one on the shelf straight away'({ load, hold, until, p, assert }) {
    await load('(x - 1)(x + 4) = 0');
    await hold('Tab', 'a');
    await until(s => s.slots === 2, 'two cases');
    const shelf = await p.evaluate(() => document.querySelectorAll('#dock-row .lane').length);
    assert(shelf === 1, 'x + 4 = 0 is on the shelf');
  },

  async 'the graph pictures calculus: an area, and a slope field'({ load, p, assert, wait }) {
    await load('int_0^2 x^2 dx'); await wait(500);
    let note = await p.evaluate(() => document.getElementById('graph-note').textContent);
    assert(note.includes('shaded area') && note.includes('2.667'), `the area: ${note}`);
    await load("y' = x y"); await wait(500);
    note = await p.evaluate(() => document.getElementById('graph-note').textContent);
    assert(note.includes('slope field'), `a slope field: ${note}`);
  },
  async "a function's power sits on its name, and brackets stay when more follows"({ load, p, assert, wait }) {
    await load('y = sin(x)^2 + sin(x) x^2'); await wait(400);
    const read = await p.evaluate(() => [...document.querySelectorAll('#stage .g.text')]
      .map(g => ({ t: g.textContent, x: g.getBoundingClientRect().left })).sort((a, b) => a.x - b.x).map(g => g.t).join(''));
    assert(read === 'ysin2xsin(x)x2', `sin² x, then sin(x) x², read left to right: ${read}`);
  },
  async 'a quadratic solved in cases shows both answers together, and a cubic factors'({ load, key, until, p, assert }) {
    await load('x^2 - 5x + 6 = 0');
    await key('e'); await until(s => s.eq === 'x = 2' || s.eq === 'x = 3', 'solved in cases', 12000);
    await p.waitForFunction(() => document.getElementById('answer').textContent.includes('both answers'), null, { timeout: 4000 }).catch(() => {});
    const ans = await p.evaluate(() => document.getElementById('answer').textContent);
    assert(/both answers: x = 2 or x = 3/.test(ans.replace(/\u2009/g, ' ')), `both answers: ${ans}`);
    await load('x^3 = 4x');
    await key('e'); await until(s => /^x = (0|2|−2)$/.test(s.eq), 'a cubic factors and splits', 12000);
  },
};
