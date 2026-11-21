// Techniques by hand that playtests found missing: Tab + p splits a power so a quadratic form shows,
// b names the inside, f + i undoes a fractional power, cases stay alternatives, and Tab + q takes out a factor.
const dig = async ({ p, until }, target, nth = 0) => {
  await p.evaluate(([t, nth]) => {
    const a = window.algebrix, hits = [];
    const visit = n => { if (!n || typeof n !== 'object') return; if (n.k && n.k !== 'eq' && window.toText(n) === t) hits.push(n.id); for (const v of Object.values(n)) if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object' && v.k) visit(v); };
    visit(a.eq);
    a.select(hits[nth] ?? null);
  }, [target, nth]);
  await until(s => s.aim === target, `aimed at ${target}`);
};

export const tests = {
  async 'Tab + p shows the quadratic form, b names the inside, and it factors'(h) {
    const { load, key, hold, until } = h;
    await load('x^(2/3) - 5x^(1/3) + 6 = 0');
    await dig(h, 'x^(2/3)');
    await hold('Tab', 'p');
    await until(s => s.eq === '(x^(1/3))^2 − 5x^(1/3) + 6 = 0', 'x^(2/3) as (x^(1/3))²');
    await dig(h, 'x^(1/3)');
    await key('b', 'Enter');
    await until(s => s.slots === 2 && s.eq === 'u^2 − 5u + 6 = 0', 'both x^(1/3) are u');
    await hold('Tab', 'f');
    await until(s => s.eq === '(u − 2)(u − 3) = 0', 'factored in u');
  },

  async 'f + i undoes a fractional power, and s finishes it'(h) {
    const { load, key, hold, until } = h;
    await load('(x - 1)^(3/4) = 8');
    await dig(h, '(x − 1)^(3/4)');
    await hold('f', 'i');
    await until(s => s.eq === 'x − 1 = 8^(4/3)', 'raised to the 4/3');
    await key('s');
    await until(s => s.eq === 'x − 1 = 16', '8^(4/3) is 16');
  },

  async 'two cases of one split are alternatives: one can not be subbed into the other'(h) {
    const { load, hold, until, countRefusals, refusals, assert } = h;
    await load('u^2 + 5u - 12 = 0');
    await hold('Tab', 'g');
    await until(s => s.slots === 2, 'the quadratic formula gives two cases');
    await dig(h, 'u');
    await countRefusals();
    const before = (await h.state()).eq;
    await hold('Tab', '2');
    await h.wait(300);
    assert((await refusals()) === 1, 'subbing the other case in resists');
    assert((await h.state()).eq === before, 'and the equation stays as it was');
  },

  async 'Tab + q takes out a factor you type: the rational root theorem by hand'(h) {
    const { load, key, hold, type, until, p, assert } = h;
    await load('4x^4 + 4x^3 - 25x^2 - x + 6 = 0');
    await hold('Tab', 'q');
    await p.keyboard.press('Control+a');
    await type('x - 1');
    await until(() => true, '');
    const note = await p.evaluate(() => document.querySelector('#op-note').textContent);
    assert(note.includes('left over'), `x − 1 is not a factor, and the box says so: ${note}`);
    await p.keyboard.press('Control+a');
    await type('x - 2');
    await key('Enter');
    await until(s => s.eq === '(x − 2)(4x^3 + 12x^2 − x − 3) = 0', 'x − 2 taken out, nothing left over');
  },

  async 'Tab + g works with letters in a, b, c, and says when b² − 4ac is never above 0'(h) {
    const { load, hold, until, p, assert } = h;
    await load('x^2 + x y - 2y^2 = 0');
    await hold('Tab', 'g');
    await until(s => s.slots === 2 && s.eq.startsWith('x = '), 'two cases for x, in y');
    await load('-5x^2 - x y - 8y^2 = 0');
    await hold('Tab', 'g');
    await until(() => true, '');
    const bar = await p.evaluate(() => window.algebrix.message?.text ?? '');
    assert(bar.includes('never above 0'), `the bar says why there is nothing to split: ${bar}`);
  },

  async 'partial fractions with a repeated factor: Tab + v, and p will not put in a value that zeroes a bottom'(h) {
    const { load, key, hold, until, p, assert } = h;
    await load('(5x^2 + 20x + 8)/(2x(x + 1)^2)');
    await hold('Tab', 'v');
    await until(s => s.eq === '4/x − 3/(2(x + 1)) + 7/(2(x + 1)^2)', 'one term for each power of x + 1');
    await load('5x^2 + 20x + 8 = 2x(x + 1)^2(A/x + B/(x + 1))');
    await dig(h, 'x', 0);
    await key('p');
    await until(() => true, '');
    const note = await p.evaluate(() => document.querySelector('#op-note').textContent);
    assert(note.includes('makes x 0'), `the box says x = 0 zeroes a bottom: ${note}`);
  },
};
