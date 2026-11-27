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

  async 'Tab + q takes out a number too, and starts with the common factor typed in'(h) {
    const { load, key, hold, type, until, p, assert } = h;
    await load('6x + 9 = 3');
    await hold('Tab', 'q');
    await until(() => true, '');
    const guess = await p.evaluate(() => window.field('op-input').value);
    assert(guess === '3', `the guess is the common factor: ${guess}`);
    await key('Enter');
    await until(s => s.eq === '3(2x + 3) = 3', '3 taken out');
    await load('2x^2 + 4x = 0');
    await hold('Tab', 'q');
    await p.keyboard.press('Control+a');
    await type('2');
    await key('Enter');
    await until(s => s.eq === '2(x^2 + 2x) = 0', 'a 2 out of a polynomial');
  },

  async 'Tab + e compares coefficients: an identity in x becomes one equation per power'(h) {
    const { load, hold, until, p, assert } = h;
    await load('1 = A(x + 2) + B(x + 1)');
    await hold('Tab', 'e');
    await until(s => s.eq === '0 = A + B' && s.slots === 2, 'x terms: 0 = A + B here');
    const other = await p.evaluate(() => window.toText(window.algebrix.slots[1].steps[0].eq));
    assert(other === '1 = 2A + B', `the numbers beside it: ${other}`);
  },

  async 'an integral with no value: typed in, m moves it, the rail says no value, x = e^u subs in'(h) {
    const { load, key, hold, type, aim, until, p, assert } = h;
    await load('y = 1');
    await key('i'); await p.keyboard.press('Control+a'); await key('Backspace');
    await type('I = int_1^0 (x^2 + 1)/ln x dx'); await key('Enter');
    await until(s => s.eq === 'I = ∫_{1}^{0} (x^2 + 1)/ln(x) dx', 'typed in');
    const rail = await p.evaluate(() => document.querySelector('#vars .solved')?.textContent);
    assert(rail === 'no value', `the rail says it has no value, not solved: ${rail}`);
    await aim('I');
    await key('m');
    await until(s => s.eq === '0 = ∫_{1}^{0} (x^2 + 1)/ln(x) dx − I', 'm moves I across');
    await key('u');
    await key('n'); await type('x = e^u'); await key('Enter');
    await until(s => s.slots === 2, 'the name is equation 2');
    await key('1');
    await hold('Tab', '2');
    await until(s => s.eq === 'I = ∫_{0}^{−∞} (e^u((e^u)^2 + 1))/u du', 'dx, the integrand and the bounds change');
  },

  async 'f then = types any function of each side, and your own functions sit in a Yours tab'(h) {
    const { load, key, type, until, p, assert } = h;
    await load('ln(x - 1) = 2');
    await key('f'); await key('=');
    await type('e^_');
    await until(() => true, '');
    const note = await p.evaluate(() => (n => n.getAttribute('aria-label') || n.textContent)(document.querySelector('#pal-note')));
    assert(note.includes('Enter applies'), `the preview is live: ${note}`);
    await key('Enter');
    await until(s => s.eq === 'e^(ln(x − 1)) = e^2', 'e^_ on both sides');
    await key('u');
    await key('f'); await key('=');
    await type('_^2 + 1'); await key('Enter');
    await until(s => s.eq === 'ln(x − 1)^2 + 1 = 2^2 + 1', '_^2 + 1 on both sides');
    await load('g(t) = 2t + 1');
    await key('n'); await type('x + 1 = 5'); await key('Enter');
    await until(s => s.slots === 2, 'a second equation');
    await key('f', '1'); await key('Enter');
    await until(s => s.eq === 'g(x + 1) = g(5)', 'your g, first in the menu, on key 1: Enter on nothing puts it on both sides');
  },

  async 'your functions in the f menu: put a value in, i undoes one, - writes out its inverse, f⁻¹ cancels f'(h) {
    const { load, key, type, until, p, assert } = h;
    await load('f(x) = 2x + 3');
    await key('f'); await key('1'); await type('4');
    await until(() => true, '');
    const note = await p.evaluate(() => (n => n.getAttribute('aria-label') || n.textContent)(document.querySelector('#pal-note')));
    assert(note.includes('= 11'), `the value shows while typing: ${note}`);
    await key('Enter');
    await until(s => s.slots === 2 && s.eq.startsWith('f(4) = '), 'f(4) is an equation of its own');
    await key('s');
    await until(s => s.eq === 'f(4) = 11', 's works it out and keeps f(4)');
    // the box is the first thing in the menu; the letter of your function types into it
    await key('f');
    const box = await p.evaluate(() => !!document.getElementById('pal-idle'));
    assert(box, 'the f menu shows its input box straight away');
    await key('f');
    await until(s => s.mode === 'fnask', 'f in the menu starts typing f(…)');
    await type('x^2 + 1'); await key('Enter');
    await until(s => s.eq === 'f(x^2 + 1) = 2(x^2 + 1) + 3', 'f(x² + 1), closing bracket optional');
    await key('n'); await type('f(x - 1) = 9'); await key('Enter');
    await key('f'); await key('i');
    await until(s => s.eq === 'x − 1 = f⁻¹(9)', 'i undoes f: f⁻¹ both sides');
    await key('s');
    await until(s => s.eq === 'x − 1 = 3', 's works out f⁻¹(9) before its formula is written');
    await key('f'); await key('-');
    await until(s => s.eq === 'f⁻¹(x) = (x − 3)/2', '- writes out the inverse');
    await key('n'); await type('y = f^-1(f(x)) + f(f^-1(2))'); await key('Enter');
    await key('s'); await until(s => s.eq === 'y = x + f(f⁻¹(2))', 'one press, one spot: f⁻¹(f(x)) is x');
    await key('s');
    await until(s => s.eq === 'y = x + 2', 'f⁻¹ and f cancel');
    await load('x^(1/2) = 3');
    await key('f'); await key('q');
    await until(s => s.eq.startsWith('(x^(1/2))^2'), 'q squares (1–9 are for your functions)');
    await load('f(x, y) = x^2 + 3y');
    await key('f'); await key('1'); await type('1, 2');
    await until(() => true, '');
    const two = await p.evaluate(() => (n => n.getAttribute('aria-label') || n.textContent)(document.querySelector('#pal-note')));
    assert(two.includes('= 7'), `f(x, y) takes two values in order: ${two}`);
    await key('Enter');
    await until(s => s.eq.startsWith('f(1, 2) = '), 'f(1, 2) as its own equation');
    await load('g(x) = 2x + 3');
    await until(() => true, '');
    for (let i = 0; i < 20 && !(await p.evaluate(() => document.getElementById('graph-note').textContent)).includes('mirror'); i++) await p.waitForTimeout(100);
    const cap = await p.evaluate(() => document.getElementById('graph-note').textContent);
    assert(cap.includes('g⁻¹') && cap.includes('mirror'), `the graph draws g⁻¹ as the mirror image: ${cap}`);
    await load('x^2 = 4');
    await key('f'); await key('n'); await type('k + 1'); await key('Enter');
    await until(s => s.eq === '(x^2)^(k + 1) = 4^(k + 1)', 'power n takes anything algebraic, not only numbers');
    // brackets around a call (ln(I(t)), (g(x))²) used to stay on screen for good
    await load('y = (g(x))^2');
    for (const k of ['l', 'e', 'l']) { await key('f'); await key(k); await p.waitForTimeout(500); await key('u'); }
    await key('f'); await key('l');
    await p.waitForTimeout(900);
    const strays = await p.evaluate(() => { const st = window.algebrix.stage, live = new Set([...st.entries.values()].map(e => e.el)); return [...st.root.querySelectorAll(':scope > .g')].filter(g => !live.has(g) && !st.ghosts.has(g)).length; });
    assert(strays === 0, `nothing left on screen that belongs to nothing (${strays})`);
  },

  async 'the f menu box reads the function in front of you: I′(0), f″(3), f(1) on f(x) = 7, √ of −4 refused'(h) {
    const { load, key, type, until, p, assert } = h;
    const note = () => p.evaluate(() => (n => n.getAttribute('aria-label') || n.textContent)(document.querySelector('#pal-note')));
    await load('I(t) = int_0^1 (x^t - 1)/ln x dx');
    await key('n'); await type("I'(t) = 1/(t + 1)"); await key('Enter');
    await key('f'); await key('='); await type("I'(0)");
    await until(() => true, '');
    assert((await note()).includes('1/(0 + 1)'), `I′(0) comes from the form here, not the integral: ${await note()}`);
    await key('Enter');
    await until(s => s.eq === 'I′(0) = 1/(0 + 1)', 'I′(0) from I′(t) = 1/(t + 1)');
    await load('f(x) = x^2 + 1');
    await key('f'); await key('='); await type("f''(3)"); await key('Enter');
    await until(s => s.eq === 'f″(3) = 2', 'f″ is worked out from f');
    // a fresh workspace forgets the old one's f, so this f(x) = … defines
    await load('f(x) = 2x + 3');
    assert(await p.evaluate(() => window.algebrix.eq.rel === 'def'), 'f(x) = 2x + 3 defines f in a fresh workspace');
    await key('n'); await type('f(x) = 7'); await key('Enter');
    await key('f'); await key('='); await type('f(1)'); await key('Enter');
    await until(s => s.eq === 'f(1) = 2·1 + 3', 'f(x) = 7 picks x, so f(1) comes from the definition');
    await load('f(x) = sqrt(x)');
    await key('f'); await key('='); await type('f(-4)');
    await until(() => true, '');
    assert((await note()).includes('no real value'), `√(−4) is refused: ${await note()}`);
  },

  async 'log₂ by hand: shown as log₂, Tab l makes one log, f i takes 2 to both sides'(h) {
    const { load, key, hold, until, aim } = h;
    await load('log_2(x) + log_2(x - 2) = 3');
    await until(s => s.eq === 'log_2(x) + log_2(x − 2) = 3', 'typed log₂ stays log₂');
    await dig(h, 'log_2(x) + log_2(x − 2)');
    await hold('Tab', 'l');
    await until(s => s.eq === 'log_2(x(x − 2)) = 3', 'one log');
    await hold('f', 'i');
    await until(s => s.eq === 'x(x − 2) = 2^3', '2 to both sides undoes log₂');
    await key('s');
    await until(s => s.eq === 'x(x − 2) = 8', '2³ is 8');
  },

  async 'solve for y′: y then a prime picks it in the chooser'(h) {
    const { load, key, hold, until, p } = h;
    await load('x^2 + x y + y^2 = 7');
    for (let i = 0; i < 5; i++) await hold('c', 'd');
    await until(s => s.eq === '2x + y + xy′ + 2yy′ = 0', 'differentiated both sides, a rule at a time');
    await p.keyboard.down('Tab'); await p.waitForTimeout(120); await p.keyboard.press('i'); await p.keyboard.up('Tab');
    await key('y'); await key("'");
    await until(s => s.eq.startsWith('y′'), 'solving for y′, not y');
  },

  async 'a defined function is used, not redefined: f(a) = 10 solves, s works out f(3), the definition moves freely'(h) {
    const { load, key, type, until, aim } = h;
    await load('f(x) = x^2 + 1');
    await key('n'); await type('f(a) = 10'); await key('Enter');
    await until(s => s.slots === 2, 'an equation about f');
    await key('e');
    await until(s => s.eq === 'a = 3' || s.eq === 'a = −3', 'solved through f', 12000);
    await key('n'); await type('y = f(3)'); await key('Enter');
    await until(s => s.eq === 'y = f(3)', 'typed');
    await key('s');
    await until(s => s.eq === 'y = 10', 's works out f(3)');
    await key('1');
    await aim('x^2 + 1');
    await key('m');
    await until(s => s.eq === 'f(x) − (x^2 + 1) = 0' || s.eq === 'f(x) − x^2 − 1 = 0', 'the definition moves like any equation');
  },

  async 'b with I(5) turns the 5 into t and defines I(t); f then b offers it; p takes t = 0 and tries values'(h) {
    const { load, key, type, until, aim, p, assert } = h;
    await load('y = int_0^1 (x^5 - 1)/ln x dx');
    await aim('∫_{0}^{1} (x^5 − 1)/ln(x) dx');
    await key('f', 'b');
    const offered = await p.evaluate(() => window.field('op-input').value);
    assert(offered === 'I(5)', `f then b offers I(5): ${offered}`);
    await key('Enter');
    await until(s => s.eq === 'y = I(5)' && s.slots === 2, 'the piece is I(5), and I(t) = … is equation 2');
    const rail = await p.evaluate(() => document.getElementById('vars').textContent);
    assert(!rail.includes('no value'), `I(5) has a value (ln 6) once I is defined: ${rail}`);
    await key('2');
    await until(s => s.eq === 'I(t) = ∫_{0}^{1} (x^t − 1)/ln(x) dx', 'the definition, with t where the 5 was');
    await key('p', 'Control+a'); await type('t = 0'); await key('Enter');
    await until(s => s.eq === 'I(0) = ∫_{0}^{1} (x^0 − 1)/ln(x) dx', 'put in t = 0');
    await key('s', 's', 's', 's');
    await until(s => s.eq === 'I(0) = 0', 'works out to I(0) = 0');
    await load('x^2 = 4');
    await key('p', 'Control+a'); await type('3'); await key('Enter');
    await until(s => s.mode === 'solve', 'the box closed');
    const said = await p.evaluate(() => document.getElementById('hints').textContent);
    assert(/x = 3: 9 = 4, false/.test(said), `trying x = 3 says it fails: ${said}`);
  },

  async 'Tab u folds a piece written like your function into it, and unfolds it back'(h) {
    const { load, key, hold, type, until } = h;
    await load('I(t) = int_0^1 (x^t - 1)/ln x dx');
    await key('n'); await type('y = int_0^1 (x^5 - 1)/ln x dx'); await key('Enter');
    await until(s => s.slots === 2, 'a second equation');
    await key('ArrowRight', 'ArrowRight');
    await hold('Tab', 'u');
    await until(s => s.eq === 'y = I(5)', 'folded into I(5)');
    await hold('Tab', 'u');
    await until(s => s.eq === 'y = ∫_{0}^{1} (x^5 − 1)/ln(x) dx', 'and unfolded back');
  },
  async 'a tapped C or Tab hub hands the next key on: e solves and n starts a new equation'(h) {
    const { p, load, key, type, until } = h;
    await load('x - 1 = 2');
    await p.keyboard.down('c'); await new Promise(r => setTimeout(r, 120)); await p.keyboard.up('c');
    await key('e');
    await until(s => s.eq === 'x = 3', 'e solved after the tapped C');
    await p.keyboard.down('Tab'); await new Promise(r => setTimeout(r, 120)); await p.keyboard.up('Tab');
    await key('n'); await type('y = 2'); await key('Enter');
    await until(s => s.slots === 2 && s.eq === 'y = 2', 'n and typing worked after the tapped Tab');
  },
  async '^ raises both sides to a power (2 to undo a root); the root that fails is not a solution; heads never overlap'(h) {
    const { p, load, key, until, assert, wait } = h;
    await load('sqrt(x+7) = x - 5');
    await key('^');
    await until(s => s.mode === 'op', 'the both-sides box is open');
    await key('Enter');
    await until(s => s.eq === '(sqrt(x + 7))^2 = (x − 5)^2', 'both sides squared');
    await key('e');
    await until(s => s.slots === 2, 'two cases');
    await wait(1500);
    const r = await p.evaluate(() => {
      const hs = [...document.querySelectorAll('#tree .thead')].map(b => b.getBoundingClientRect());
      return { bad: document.querySelectorAll('#tree .ttag.no').length, overlap: hs.some((a, i) => hs.slice(i + 1).some(b => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)) };
    });
    assert(r.bad === 1, `one case is marked not a solution (got ${r.bad})`);
    assert(!r.overlap, 'the heads do not overlap');
  },
  async 'adding an equation (= #1) or Tab k collects like terms, so what was eliminated is gone'(h) {
    const { load, key, type, hold, until } = h;
    await load('x + y + z = 6');
    await key('n'); await type('x + 2y - z = 2'); await key('Enter');
    await until(s => s.slots === 2, 'two equations');
    await key('='); await type('#1'); await key('Enter');
    await until(s => s.eq === '2x + 3y = 8', 'z gone after + equation 1');
    await key('n'); await type('2x - y + z = 3'); await key('Enter');
    await until(s => s.slots === 3, 'three equations');
    await dig(h, 'z');
    await hold('Tab', 'k');
    await until(s => !/z/.test(s.eq) && /x/.test(s.eq), 'Tab k leaves no z');
  },
  async 'f menu: typing V(2) or V\'\'(2) yourself after V starts the box neither doubles the bracket nor the primes'(h) {
    const { load, key, type, until, wait } = h;
    await load('V(x) = x(12 - 2x)^2');
    await key('f'); await wait(150);
    await type('V(2)'); await key('Enter');
    await until(s => s.slots === 2 && s.eq === 'V(2) = 2(12 − 2·2)^2', 'V(2) put in');
    await key('1');
    await key('f'); await wait(150);
    await type("V''(2)"); await key('Enter');
    await until(s => s.slots === 3 && /^V(′′|″)\(2\) = /.test(s.eq), 'V″(2) asked for');
  },

  async 'Shift ↑ ↓ move a piece through the notation: over the bar, off a log, round the bounds'(h) {
    const { load, key, until, p, assert } = h;
    await load('y = 3/x^2');
    await dig(h, 'x^2');
    await key('Shift+ArrowUp');
    await until(s => s.eq === 'y = 3x^(−2)' && s.aim === 'x^(−2)', 'x² up over the bar, its power negative, still aimed');
    await key('Shift+ArrowDown');
    await until(s => s.eq === 'y = 3/(x^2)', 'and back down');
    const badge = await p.evaluate(() => document.querySelector('.titem .tback')?.textContent);
    assert(badge === '↺1', `up and back down is a round trip: ${badge}`);
    await load('y = ln(x^3)');
    await dig(h, '3');
    await key('Shift+ArrowDown');
    await until(s => s.eq === 'y = 3 ln(x)', 'the power comes down off the log');
    await key('Shift+ArrowUp');
    await until(s => s.eq === 'y = ln(x^3)', 'and goes back up');
    await load('y = int_0^1 x dx');
    await dig(h, '0');
    await key('Shift+ArrowUp');
    await until(s => s.eq === 'y = −∫_{1}^{0} x dx', 'the bottom bound to the top, with a minus');
    await load('y = x + 2');
    await dig(h, 'x');
    await key('Shift+ArrowUp');
    await until(s => s.eq === 'y = x + 2', 'nothing to lift: refused');
    const said = await p.evaluate(() => document.querySelector('#hints')?.textContent ?? '');
    assert(/Shift \+ ↑ lifts/.test(said), `says what ↑ does: ${said.slice(0, 120)}`);
  },

  async 'a number: Tab f gives its primes, Tab q takes out any factor'(h) {
    const { load, key, hold, type, until, p, assert } = h;
    await load('y = 360x');
    await dig(h, '360');
    await hold('Tab', 'f');
    await until(s => s.eq === 'y = 2^3·3^2·5x', '360 as its primes');
    await load('y = 12x');
    await dig(h, '12');
    await hold('Tab', 'q');
    await until(() => true, '');
    const guess = await p.evaluate(() => window.field('op-input').value);
    assert(guess === '2', `the guess is the smallest prime: ${guess}`);
    await p.keyboard.press('Control+a');
    await type('3');
    await key('Enter');
    await until(s => s.eq === 'y = 3·4x', '3 taken out of 12');
  },

  async 'Tab = rewrites the aimed piece as the form you type, only if it is equal'(h) {
    const { load, key, hold, type, until, p, assert } = h;
    await load('y = x^2 - 1');
    await dig(h, 'x^2 − 1');
    await hold('Tab', '=');
    await until(() => true, '');
    const start = await p.evaluate(() => window.field('op-input').value);
    assert(start.replace(/\s/g, '') === 'x^2-1', `starts from how it is written: ${start}`);
    await p.keyboard.press('Control+a');
    await type('(x-1)^2');
    const bad = await p.evaluate(() => document.querySelector('#op').classList.contains('bad'));
    assert(bad, 'an unequal form shows as wrong while typing');
    await key('Enter');
    await until(s => s.eq === 'y = x^2 − 1', 'and is refused');
    await p.keyboard.press('Control+a');
    await type('(x-1)(x+1)');
    await key('Enter');
    await until(s => s.eq === 'y = (x − 1)(x + 1)', 'the equal form goes in');
  },

  async 'q keeps a form as written: its simplify marks go and stay gone, q again brings them back'(h) {
    const { load, key, until, p, assert, wait } = h;
    await load('y = 2·3x + x/1');
    const marks = () => p.evaluate(() => [...document.querySelectorAll('#spots .spot')].length);
    const chip = () => p.evaluate(() => document.querySelector('#spots .spot-chip')?.textContent ?? '');
    await wait(500);
    assert(await marks() > 0, 'something is marked to simplify');
    assert(/q\s*keep/.test(await chip()), `the chip offers q: ${await chip()}`);
    for (let i = 0; i < 4 && await marks(); i++) { await key('q'); await wait(150); }
    assert(await marks() === 0, 'every marked form kept: no marks left');
    await until(s => s.eq === 'y = 2·3x + x/1', 'nothing changed in the equation');
    await key('q'); await wait(200);
    assert(await marks() > 0, 'q with nothing marked brings the marks back');
  },

  async 'Shift pushes any factor out of a root, from either end, and back in'(h) {
    const { load, key, until } = h;
    await load('sum_(n=1)^99 sqrt(n + sqrt(n^2-1))/(n + sqrt((n+1)(n-1)))');
    await dig(h, 'n + 1');
    await key('Shift+ArrowLeft');
    await until(s => s.eq === 'Σ_{n=1}^{99} sqrt(n + sqrt(n^2 − 1))/(n + sqrt(n + 1) sqrt(n − 1))', '(n + 1) pushed out of the root');
    await dig(h, 'sqrt(n + 1)');
    await key('Shift+ArrowRight');
    await until(s => s.eq.includes('sqrt((n + 1)(n − 1))'), 'and pushed back in, joining the other root');
    await load('y = sqrt((x+1)(x-1))');
    await dig(h, 'x − 1');
    await key('Shift+ArrowRight');
    await until(s => s.eq === 'y = sqrt(x + 1) sqrt(x − 1)', 'the last factor out to the right');
  },
};
