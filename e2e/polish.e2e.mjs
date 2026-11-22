// Round 15: the notation cards, stacked integrals (typed any way), wrong roots that must never look solved,
// the other case in the tree, and the graph's calculus pictures.
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
    await key('e'); await until(s => s.eq === 'x = 6', 'it lands on the case that works', 12000);
    const only = await p.evaluate(() => document.getElementById('answer').textContent);
    assert(only.includes('the only answer') && only.includes('x = 1 fails'), `says which one fails: ${only}`);
    await p.keyboard.press('Alt+ArrowRight');
    await until(s => s.eq === 'x = 1', 'x = 1 is the other case');
    const look = await p.evaluate(() => ({ stage: document.getElementById('stage').classList.contains('extraneous'), ans: document.getElementById('answer').textContent, vars: document.getElementById('vars').textContent }));
    assert(look.stage && look.ans.includes('not a solution') && look.vars.includes('not a solution'), `marked: ${JSON.stringify(look)}`);
  },

  async 'a trig equation gives every solution, not only the first'({ load, key, until, p, assert }) {
    await load('sin(x) = 1/2');
    await key('e'); await until(s => s.eq === 'x = π/6', 'solved', 12000);
    await p.waitForFunction(() => document.getElementById('answer').textContent.includes('every solution'), null, { timeout: 5000 }).catch(() => {});
    const ans = await p.evaluate(() => document.getElementById('answer').textContent);
    assert(ans.includes('5π/6 + 2kπ'), `every solution: ${ans}`);
  },

  async 'splitting into cases puts the other one in the tree straight away'({ load, hold, until, p, assert }) {
    await load('(x - 1)(x + 4) = 0');
    await hold('Tab', 'a');
    await until(s => s.slots === 2, 'two cases');
    const cols = await p.evaluate(() => document.querySelectorAll('#tree .thead').length);
    assert(cols === 2, 'x + 4 = 0 is a column of the tree');
  },

  async 'the graph pictures calculus: an area, and a slope field'({ load, p, assert, wait }) {
    await load('int_0^2 x^2 dx'); await wait(500);
    let note = await p.evaluate(() => document.getElementById('graph-note').textContent);
    assert(note.includes('shaded area') && note.includes('2.667'), `the area: ${note}`);
    await load("y' = x y"); await wait(500);
    note = await p.evaluate(() => document.getElementById('graph-note').textContent);
    assert(note.includes('slope field'), `a slope field: ${note}`);
  },
  async 'a pole is not a crossing: the graph frames where the sides really meet'({ load, p, assert, wait }) {
    await load('(2x + 3)/(x - 1) = 5'); await wait(900);
    const note = await p.evaluate(() => document.getElementById('graph-note').textContent);
    assert(/x ≈ 2\.667\./.test(note), `only x ≈ 2.667, not the pole at 1: ${note}`);
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
  async 'Tab on a lone fraction factors it, cancels, and keeps what was cancelled'({ load, hold, until, p, assert, key, wait }) {
    await load('(x^2 - 1)/(x - 1)');
    await hold('Tab', 'f'); await until(s => s.eq === '((x − 1)(x + 1))/(x − 1)', 'factored top and bottom');
    await hold('Tab', 's'); await until(s => s.eq === 'x + 1', 'cancelled');
    const conds = await p.evaluate(() => document.getElementById('conds').textContent);
    assert(conds.includes('≠'), `x − 1 ≠ 0 kept: ${conds}`);
    await load('2 = 3'); await key('e'); await wait(300);
    const bar = await p.evaluate(() => document.getElementById('hints').textContent);
    assert(bar.includes('is false'), `2 = 3 is judged: ${bar}`);
  },
  async 'a quotient rule answer multiplies out the top only'({ load, key, until }) {
    await load('d/dx (e^x/(1+e^x))');
    await key('e'); await until(s => s.eq === 'e^x/((1 + e^x)^2)', 'the bottom stays squared', 12000);
  },
  async 'a trig inequality answers once, with + 2kπ'({ load, key, p, assert, wait }) {
    await load('sin(x) > 0');
    await key('e'); await wait(1500);
    const ans = await p.evaluate(() => document.getElementById('answer').textContent);
    assert(ans.includes('2kπ') && !ans.includes('∪'), `one period: ${ans}`);
  },
  async 'the both-sides box squares, roots and logs too'({ load, key, type, until }) {
    await load('sqrt(x) = 3');
    await key('='); await type('^2'); await key('Enter');
    await until(s => s.eq === '(sqrt(x))^2 = 3^2', 'squared both sides');
    await load('e^x = 3');
    await key('='); await type('ln'); await key('Enter');
    await until(s => s.eq === 'ln(e^x) = ln(3)', 'ln both sides');
  },

  async 'the graph pops out by its grip, moves, stretches, docks back, and an accent colours it'({ load, p, assert, wait }) {
    await load('x^2 + x = 6');
    const side = () => p.evaluate(() => { const r = document.querySelector('.side').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, at: document.querySelector('.app').dataset.graph }; });
    await p.hover('.side'); await wait(250);
    const g = await p.locator('.gh-grip').boundingBox();
    await p.mouse.move(g.x + 20, g.y + 10); await p.mouse.down(); await p.mouse.move(g.x - 300, g.y + 150, { steps: 8 }); await p.mouse.up();
    const a = await side();
    assert(a.at === 'float', `popped out: ${a.at}`);
    const c = await p.locator('.gh-rs.se').boundingBox();
    await p.mouse.move(c.x + 8, c.y + 8); await p.mouse.down(); await p.mouse.move(c.x + 108, c.y + 58, { steps: 6 }); await p.mouse.up();
    const b = await side();
    assert(Math.abs(b.w - a.w - 100) < 3 && Math.abs(b.h - a.h - 50) < 3 && Math.abs(b.x - a.x) < 1, `stretched from the corner: ${JSON.stringify([a, b])}`);
    // the canvas buffer matches the screen pixel for pixel (no soft lines)
    await wait(100);
    const crisp = await p.evaluate(() => { const c = document.getElementById('graph'); return Math.abs(c.width - c.getBoundingClientRect().width * devicePixelRatio) <= 1; });
    assert(crisp, 'graph buffer matches its size');
    await p.click('.graph-head button[data-at="right"]');
    assert((await side()).at === 'right', 'docked back');
    await p.keyboard.press(','); await wait(150);
    await p.click('.set-swatch[title="Violet"]');
    const sel = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sel').trim());
    assert(sel.includes('124') || sel.toLowerCase().includes('7c5cff') || sel.includes('color-mix'), `the accent took: ${sel}`);
    await p.click('.set-opt:text("Theme")');
    await p.keyboard.press('Escape');
  },

  async 'a letter in the rail opens its details; a function opens its definition and a mini graph'({ load, key, type, p, assert, wait, until }) {
    await load('f(x) = x^3 - 3x');
    await key('n'); await type('x = 3'); await key('Enter');
    await until(s => s.slots === 2, 'two equations');
    await p.click('#vars li.ri .var'); await wait(150);
    const card = await p.evaluate(() => document.querySelector('#vars .ri-card')?.textContent ?? '');
    assert(card.includes('Equals') && card.includes('3') && card.includes('In equations'), `the letter's card: ${card}`);
    await p.click('#vars .ri-dom[data-d="positive"]'); await wait(100);
    const dom = await p.evaluate(() => document.querySelector('#vars li.ri .dom').textContent);
    assert(dom === 'positive', `the card set what x can be: ${dom}`);
    await p.click('#vars .ri-dom[data-d="real"]');
    await p.click('#vars .ri-eq[data-j="0"]');
    await until(s => s.cur === 0, 'a chip goes to that equation');
    await p.click('#fns li.ri'); await wait(200);
    const drawn = await p.evaluate(() => { const c = document.querySelector('#fns .ri-graph'); return !!c && c.width > 0 && !!document.querySelector('#fns .ri-def .mini'); });
    assert(drawn, 'the function opens with its definition and a graph');
    await p.click('#fns li.ri'); await wait(100);
    assert(!(await p.evaluate(() => document.querySelector('#fns .ri-card'))), 'a second click closes it');
  },
};
