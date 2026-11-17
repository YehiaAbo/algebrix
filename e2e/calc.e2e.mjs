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

  async 'typing d/dx and lim in the box'({ key, type, until }) {
    await key('i'); await type('lim x->0 sin(x)/x'); await key('Enter');
    await until(s => s.eq === 'lim_{x→0} sin(x)/x', 'the limit typed');
    await key('e'); await until(s => s.eq === '1', 'and worked out', 10000);
  },
};
