// The calculus hub (C): a rule at a time, limits that resist, and C released closes it.
export const tests = {
  async 'C shows the rule that fits, and d takes it'({ load, p, key, hold, until, assert, wait }) {
    await load('d/dx x^2 sin(x)');
    await p.keyboard.down('c'); await wait(150);
    const chips = await p.evaluate(() => [...document.querySelectorAll('#forms .chip')].map(c => c.textContent));
    assert(chips.includes('dproduct rule'), `the chip names the rule: ${chips}`);
    await key('d'); await p.keyboard.up('c');
    await until(s => s.eq === '2x sin(x) + x^2 cos(x)' && s.mode === 'solve', 'the product rule applied');
    await key('u'); await until(s => s.eq.startsWith('d/dx'), 'undo');
    await hold('c', 'Escape');
    await until(s => s.mode === 'solve', 'Escape closes the hub');
  },

  async 'a limit that is 0/0 resists plugging in'({ load, hold, countRefusals, refusals, until, assert, text }) {
    await load('lim x->2 (x^2 - 4)/(x - 2)');
    await countRefusals();
    await hold('c', 'p');
    assert(await refusals() === 1, 'plugging in 0/0 is refused');
    const bar = await text();
    assert(bar.startsWith('lim'), `nothing changed: ${bar}`);
    await hold('c', 'l');
    await until(s => !s.eq.includes('x − 2') , "L'Hôpital takes the derivatives");
  },

  async 'e works out a derivative and tidies'({ load, key, expectEq }) {
    await load('d/dx (3x^2 - 4x + 1)');
    await key('e'); await expectEq('6x − 4', 10000);
  },

  async 'u-substitution puts u = … on the shelf, and e puts it back'({ load, hold, key, until, p, assert }) {
    await load('int 2x cos(x^2) dx');
    await hold('c', 'u');
    await until(s => s.eq === '∫ cos(u) du' && s.slots === 2, 'the integral in u, u = x² beside it');
    const shelf = await p.evaluate(() => [...document.querySelectorAll('#dock-row .lane')].length);
    assert(shelf === 1, 'u = x² is on the shelf');
    await key('e'); await until(s => s.eq === 'sin(x^2) + C', 'integrated and put back', 10000);
  },

  async 'a definite integral typed in the box works out to a number'({ key, type, until }) {
    await key('i'); await type('int_0^3 x^2 dx'); await key('Enter');
    await until(s => s.eq === '∫_{0}^{3} x^2 dx', 'the integral typed');
    await key('e'); await until(s => s.eq === '9', 'and worked out', 10000);
  },

  async 'typing d/dx and lim in the box'({ key, type, until }) {
    await key('i'); await type('lim x->0 sin(x)/x'); await key('Enter');
    await until(s => s.eq === 'lim_{x→0} sin(x)/x', 'the limit typed');
    await key('e'); await until(s => s.eq === '1', 'and worked out', 10000);
  },

  async 'two letters: C shows ∂, ∇ and Lagrange, and aiming picks the letter'({ load, p, key, hold, until, assert, wait, aim }) {
    await load('x^2 y + y^3');
    await p.keyboard.down('c'); await wait(150);
    const chips = await p.evaluate(() => [...document.querySelectorAll('#forms .chip')].map(c => c.textContent));
    await p.keyboard.up('c'); await key('Escape');
    assert(chips.some(c => c.startsWith('d∂/∂x')) && chips.some(c => c.startsWith('ngradient')), `partials and the gradient: ${chips}`);
    assert(chips.some(c => c.includes('type a constraint first')), `Lagrange waits for a constraint: ${chips}`);
    await aim('y^3');
    await key('ArrowDown'); await until(s => s.aim === 'y', 'aimed at the y of y³');
    await hold('c', 'd');
    await until(s => s.eq.startsWith('∂/∂y') && s.slots === 2, 'aimed at y: ∂/∂y as a new equation');
    await key('e'); await until(s => s.eq === 'x^2 + 3y^2', 'worked out', 10000);
  },

  async 'a vector equation splits into one equation per entry'({ key, type, until }) {
    await key('i'); await type('∇(x^2 + y^2 - 2x) = (0, 0)'); await key('Enter');
    await until(s => s.eq.startsWith('∇'), 'typed, with ( , ) as a vector');
    await key('e'); await until(s => s.slots === 2 && s.eq === '2x − 2 = 0', 'gradient worked out, then split', 10000);
  },
};
