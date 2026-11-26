// The general moves by keyboard: b names a piece, p puts in a value, hold Tab + n subs in, and
// C does calculus to both sides. Techniques done by hand with them, no shortcut.
/** aim at a piece deep inside (the arrows have tests of their own; this picks it the way a click does) */
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
  async 'u-substitution by hand: b names x², C k takes differentials, Tab + 2 subs in'(h) {
    const { load, key, hold, until, p, assert } = h;
    await load('int 2x cos(x^2) dx');
    await dig(h, 'x^2');
    await key('b');
    const offered = await p.evaluate(() => document.querySelector('#op-input').value);
    assert(offered === 'u', `b offers u for a piece: ${offered}`);
    await key('Enter');
    await until(s => s.slots === 2 && s.eq === '∫ 2x cos(u) dx', 'x² named u here, u = x² as equation 2');
    await key('2');
    await until(s => s.cur === 1 && s.eq === 'u = x^2', 'on u = x²');
    await hold('c', 'k');
    await until(s => s.eq === 'du = 2x dx', 'the differentials of both sides');
    await key('1');
    await until(s => s.cur === 0, 'back on the integral');
    await hold('Tab', '2');
    await until(s => s.eq === '∫ cos(u) du', 'du subbed in for 2x dx');
    await key('e');
    await until(s => s.eq === 'sin(x^2) + C', 'integrated in u, and x² put back', 10000);
  },

  async 'b on a number makes a parameter, and on a whole side a function I(t)'(h) {
    const { load, key, type, until, p, assert } = h;
    await load('int_0^1 (x^2 - 1)/ln(x) dx');
    await dig(h, '2');
    await key('b');
    const offered = await p.evaluate(() => document.querySelector('#op-input').value);
    assert(offered === 't', `b offers t for a number: ${offered}`);
    await key('Enter');
    await until(s => s.slots === 2 && s.eq === '∫_{0}^{1} (x^t − 1)/ln(x) dx', 'the 2 is t now, t = 2 beside it');
    // climb out to the whole integral
    await dig(h, '∫_{0}^{1} (x^t − 1)/ln(x) dx');
    await key('b');
    await p.keyboard.press('Control+a');
    await type('I(t)');
    await key('Enter');
    await until(s => s.slots === 3 && s.eq === 'I(t)', 'the integral is I(t), defined in equation 3');
  },

  async 'the Feynman technique by keyboard: d/dt under the integral, ∫ back, t = 0 finds C'(h) {
    const { load, key, type, hold, until, p } = h;
    await load('int_0^1 (x^2 - 1)/ln(x) dx');
    await dig(h, '2');
    await key('b', 'Enter');
    await until(s => s.slots === 2, 't = 2 named');
    await dig(h, '∫_{0}^{1} (x^t − 1)/ln(x) dx');
    await key('b');
    await p.keyboard.press('Control+a');
    await type('I(t)');
    await key('Enter');
    await until(s => s.slots === 3, 'I(t) named');
    await key('3');
    await until(s => s.cur === 2 && s.eq.startsWith('I(t) ='), 'on the definition of I(t)');
    await hold('c', 'd');
    await until(s => s.eq.startsWith('d/dt'), 'd/dt both sides');
    await key('e');
    await until(s => s.eq === 'I′(t) = 1/(t + 1)', 'Leibniz, then the easy integral', 12000);
    await hold('c', 'i');
    await until(s => s.eq.startsWith('∫ I′(t) dt'), '∫ both sides dt');
    await key('e');
    await until(s => s.eq.includes('ln|t + 1| + C'), 'I(t) = ln|t + 1| + C', 12000);
    // put in t = 0: a new equation
    await dig(h, 't');
    await key('p');
    await key('Enter');
    await until(s => s.eq.startsWith('I(0)'), 'at t = 0, as an equation of its own');
    // the constant: unfold I(0) by its definition, and e works the integral out and solves for C
    await dig(h, 'I(0)');
    await hold('Tab', 'u');
    await until(s => s.eq.startsWith('∫_{0}^{1}'), 'I(0) unfolded into its integral');
    await key('e');
    await until(s => s.eq === 'C = 0', 'C = 0', 12000);
  },

  async 'Feynman from the definition: type I(t) = ∫ …, or b on I = ∫ …, then d/dt, ∫ back, I(0) finds C'(h) {
    const { load, key, type, hold, until, p } = h;
    await load('I = int_0^1 (x^t - 1)/ln x dx');
    await dig(h, '∫_{0}^{1} (x^t − 1)/ln(x) dx');
    await key('b');
    await p.keyboard.press('Control+a');
    await type('I(t)');
    await key('Enter');
    await until(s => s.eq === 'I(t) = ∫_{0}^{1} (x^t − 1)/ln(x) dx' && s.slots === 1, 'I = … became the definition of I(t), in place');
    await load('y = 1');
    await key('i'); await p.keyboard.press('Control+a'); await key('Backspace');
    await type('I(t) = int_0^1 (x^t - 1)/ln x dx'); await key('Enter');
    await until(s => s.eq === 'I(t) = ∫_{0}^{1} (x^t − 1)/ln(x) dx', 'typed as a definition, not I·t');
    await hold('c', 'd');
    await until(s => s.eq.startsWith('d/dt'), 'd/dt both sides');
    await key('e');
    await until(s => s.eq === 'I′(t) = 1/(t + 1)', 'Leibniz, then the easy integral', 12000);
    await hold('c', 'i');
    await key('e');
    await until(s => s.eq.includes('ln|t + 1| + C'), 'I(t) = ln|t + 1| + C', 12000);
    await dig(h, 't');
    await key('p', 'Enter');
    await until(s => s.eq.startsWith('I(0)'), 'at t = 0');
    await dig(h, 'I(0)');
    await hold('Tab', 'u');
    await key('e');
    await until(s => s.eq === 'C = 0', 'C = 0', 12000);
  },

  async 'a value you found, I(0) = 0, subs in; u folds back from inside the integral'(h) {
    const { load, key, type, hold, until, p } = h;
    await load('I(t) = int_0^1 (x^t - 1)/ln x dx');
    for (const line of ['I(0) = ln|0 + 1| + C', 'I(0) = 0']) {
      await key('n'); await type(line); await key('Enter');
    }
    await until(s => s.slots === 3, 'three equations');
    await key('2');
    await dig(h, 'I(0)');
    await hold('Tab', '3');
    await until(s => s.eq === '0 = ln|0 + 1| + C', 'I(0) = 0 subbed in');
    await key('u');
    await until(s => s.eq === 'I(0) = ln|0 + 1| + C', 'undone');
    await dig(h, 'I(0)');
    await hold('Tab', 'u');
    await until(s => s.eq.startsWith('∫_{0}^{1}'), 'unfolded');
    await dig(h, 'x^0');
    await hold('Tab', 'u');
    await until(s => s.eq === 'I(0) = ln|0 + 1| + C', 'folded back from an aim inside it');
  },

  async 'typing I(a) = ∫ … with a inside ax defines I at once (not I·a)'(h) {
    const { load, key, type, until, p } = h;
    await load('y = 1');
    await key('i'); await p.keyboard.press('Control+a'); await key('Backspace');
    await type('I(a) = int_{0}^{∞} (tan^-1(ax) - tan^-1(x))/x dx');
    const shown = await p.evaluate(() => window.toText(window.algebrix.preview));
    if (!shown.startsWith('I(a) =')) throw new Error(`the live preview reads a call: ${shown}`);
    await key('Enter');
    await until(s => s.eq.startsWith('I(a) = ∫_{0}^{∞}'), 'defined as I(a)');
    const said = await p.evaluate(() => document.getElementById('hints').textContent);
    if (!said.includes('Defined I')) throw new Error(`says it defined I: ${said}`);
  },

  async 'Frullani by Feynman: I(a) = ∫ (tan⁻¹(ax) − tan⁻¹ x)/x dx; the sign of a is asked for, then I′(a) = π/(2a)'(h) {
    const { load, key, type, hold, until, p, wait } = h;
    await load('y = 1');
    await key('i'); await p.keyboard.press('Control+a'); await key('Backspace');
    await type('I(a) = int_0^oo (tan^-1(ax) - tan^-1(x))/x dx'); await key('Enter');
    await until(s => s.eq.startsWith('I(a) ='), 'defined');
    await hold('c', 'd');
    await key('e');
    await p.waitForFunction(() => document.getElementById('hints').textContent.includes('depending on the sign of a'), null, { timeout: 12000 });
    await p.click('#vars li.ri .var'); await wait(150);
    await p.click('#vars .ri-dom[data-d="positive"]'); await wait(150);
    await key('e');
    await until(s => s.eq === 'I′(a) = π/(2a)', 'I′(a) = π/(2a)', 15000);
    await hold('c', 'i');
    await key('e');
    await until(s => s.eq === 'I(a) = π ln(a)/2 + C', 'integrated back in a', 12000);
  },

  async 'p on an equation to solve tries the value and says whether it works'(h) {
    const { load, key, type, p, assert, wait } = h;
    await load('x^2 = 4');
    await dig(h, 'x');
    await key('p');
    await type('3');
    await key('Enter');
    await wait(200);
    const said = await p.evaluate(() => document.getElementById('hints').textContent);
    assert(said.includes('9 = 4, false'), `x = 3 is tried, not put in: ${said}`);
    assert((await h.text()) === 'x^2 = 4', 'the equation is left as it was');
  },

  async 'C hub marks the shortcuts as chains'({ load, p, key, assert, wait }) {
    await load('int 2x cos(x^2) dx');
    await p.keyboard.down('c'); await wait(150);
    const chips = await p.evaluate(() => [...document.querySelectorAll('#forms .calc-items .form-name')].map(c => ({ t: c.textContent, chain: !!c.querySelector('.short') })));
    await p.keyboard.up('c'); await key('Escape');
    const u = chips.find(c => c.t.includes('u-substitution'));
    assert(u && u.chain, `u-substitution is tagged as a chain: ${JSON.stringify(chips)}`);
    assert(chips.filter(c => c.chain).length < chips.length, 'the single rules are not tagged');
  },

  async 'Tab on a sum shows the general moves'({ load, p, key, assert, wait }) {
    await load('sum_{k=1}^{n} (k^2 + 3k)');
    await p.keyboard.down('Tab'); await wait(150);
    const forms = await p.evaluate(() => [...document.querySelectorAll('#forms .form-name')].map(c => c.textContent));
    await p.keyboard.up('Tab'); await key('Escape');
    assert(forms.some(f => f.includes('split the sum')), `split the sum is offered: ${forms}`);
  },
};
