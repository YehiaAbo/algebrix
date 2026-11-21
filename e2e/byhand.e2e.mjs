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

  async 'move names read as math (√, ²) and a quick run of moves shows one name, not a pile'(h) {
    const { load, key, until, p, assert } = h;
    await load('sqrt(x + 2) + 3 = x^2');
    await dig(h, 'sqrt(x + 2)');
    await key('m');
    await until(() => true, '');
    const one = await p.evaluate(() => [...document.querySelectorAll('.bubble')].map(b => b.textContent));
    assert(one.length === 1 && one[0].includes('√(x + 2)'), `the name shows √: ${one}`);
    await key('m', 'm', 'm');
    const n = await p.evaluate(() => document.querySelectorAll('.bubble').length);
    assert(n <= 1, `one name at a time, not ${n}`);
  },

  async 'a reorder and back returns to the step with a ↺ count, and the aim stays on the piece'(h) {
    const { load, key, until, p, assert } = h;
    await load('2x + 3 = 7');
    await dig(h, '3');
    await key('Shift+ArrowLeft');
    await until(s => s.eq === '3 + 2x = 7', 'reordered');
    await key('Shift+ArrowRight');
    await until(s => s.eq === '2x + 3 = 7' && s.aim === '3', 'back, still aimed at 3');
    const badge = await p.evaluate(() => document.querySelector('.titem .tback')?.textContent);
    assert(badge === '↺1', `the start step counts the round trip: ${badge}`);
    const steps = await p.evaluate(() => window.algebrix.slot.steps.length);
    assert(steps === 2, `no third step: ${steps}`);
  },

  async 'Shift slides a constant out of ∫ and back in, and d/dt into ∫ (Leibniz)'(h) {
    const { load, key, until } = h;
    await load('int_0^2 3x^2 dx = 8');
    await dig(h, '3');
    await key('Shift+ArrowLeft');
    await until(s => s.eq === '3 ∫_{0}^{2} x^2 dx = 8', '3 slid out');
    await key('Shift+ArrowRight');
    await until(s => s.eq === '∫_{0}^{2} 3x^2 dx = 8', 'and back in');
    await load('d/dt int_0^1 x^t dx = y');
    await dig(h, 'd/dt(∫_{0}^{1} x^t dx)');
    await key('Shift+ArrowRight');
    await until(s => s.eq === '∫_{0}^{1} ∂/∂t(x^t) dx = y', 'd/dt inside');
  },

  async 'Tab on an integral offers by parts with each choice of u, previewed, next to the algebra'(h) {
    const { load, key, until, p, assert } = h;
    await load('int x e^x dx');
    await dig(h, '∫ xe^x dx');
    await key('Tab');
    const names = await p.evaluate(() => [...document.querySelectorAll('#forms .form-name, #forms .chip')].map(e => e.textContent).join(' | '));
    assert(names.includes('u = x') && names.includes('u = e^x'), `both choices of u: ${names}`);
    await key('ArrowRight', 'Tab');
    await until(s => s.eq === 'xe^x − ∫ e^x dx', 'by parts with u = x');
  },

  async 'Shift+P replays the steps from the start, ← → change the speed, and it ends where you were'(h) {
    const { load, key, until, p, assert } = h;
    await load('2x + 3 = 7');
    await dig(h, '3');
    await key('m', 's');
    await until(s => s.eq === '2x = 4', 'two steps in');
    await key('P');
    await until(s => s.eq === '2x + 3 = 7', 'back at the start');
    const bar = await p.evaluate(() => !document.getElementById('replay').hidden);
    assert(bar, 'the replay strip shows');
    await key('ArrowRight');
    const t = await p.evaluate(() => JSON.parse(localStorage.getItem('algebrix.prefs')).tempo);
    assert(t > 1, `faster: ${t}`);
    await until(s => s.eq === '2x = 4', 'played to the end');
    let gone = false;
    for (let i = 0; i < 40 && !gone; i++) { gone = await p.evaluate(() => document.getElementById('replay').hidden); if (!gone) await h.wait(100); }
    assert(gone, 'the strip goes away');
  },

  async 'Shift takes a factor out one level per press: out of the fraction, then out of ∫, and out of √ and |…|'(h) {
    const { load, key, until } = h;
    await load('int (3x)/2 dx = y');
    await dig(h, '3');
    await key('Shift+ArrowLeft');
    await until(s => s.eq === '∫ 3(x/2) dx = y', 'out of the fraction');
    await key('Shift+ArrowLeft');
    await until(s => s.eq === '3 ∫ x/2 dx = y', 'then out of the integral');
    await load('sqrt(4x) = |3x|');
    await dig(h, '4');
    await key('Shift+ArrowLeft');
    await until(s => s.eq === 'sqrt(4) sqrt(x) = |3x|', 'out of the root');
    await dig(h, '3');
    await key('Shift+ArrowLeft');
    await until(s => s.eq === 'sqrt(4) sqrt(x) = 3·|x|', 'out of |…|');
  },

  async 'Tab + m multiplies a fraction by 1: e^(−x) on top and below, then u-substitution fits'(h) {
    const { load, key, hold, type, until } = h;
    await load('int 1/(1 + e^x) dx');
    await dig(h, '1/(1 + e^x)');
    await hold('Tab', 'm');
    await type('e^(-x)');
    await key('Enter');
    await until(s => s.eq === '∫ e^(−x)/(e^(−x) + 1) dx', 'top and bottom times e^(−x), multiplied out');
    await key('e');
    await until(s => /ln\|e\^\(−x\) \+ 1\|/.test(s.eq), 'e finishes it with u = e^(−x) + 1');
  },

  async 'e plays a u-substitution as its three general moves: name u, differentials, sub in'(h) {
    const { load, key, until, p, assert } = h;
    await load('int 2x cos(x^2) dx');
    await key('e');
    await until(s => s.eq === 'sin(x^2) + C', 'worked out, with x² back for u');
    const st = await p.evaluate(() => ({ slots: window.algebrix.slots.length, named: window.algebrix.slots[1]?.steps.map(s => s.label) }));
    assert(st.slots === 2 && st.named.length === 2, `u = x² is its own equation, with its differentials: ${JSON.stringify(st)}`);
  },
};
