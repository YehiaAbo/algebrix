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

  async "a differential equation: C offers the method that fits, and e solves it"({ load, p, key, until, assert, wait }) {
    await load("y' = x y");
    await p.keyboard.down('c'); await wait(150);
    const chips = await p.evaluate(() => [...document.querySelectorAll('#forms .chip')].map(c => c.textContent + (c.classList.contains('off') || c.hasAttribute('disabled') ? ' (off)' : '')));
    await p.keyboard.up('c'); await key('Escape');
    assert(chips.some(c => c.startsWith('sseparate')), `separate is offered: ${chips}`);
    await key('e'); await until(s => s.eq.startsWith('y = ') && !s.eq.includes('∫'), 'separated, integrated and solved', 12000);
  },

  async "y'' typed in the box is an equation, not a proof"({ key, type, until }) {
    await key('i'); await type("y'' + 9y = 0"); await key('Enter');
    await until(s => s.eq === 'y″ + 9y = 0', 'an equation, not ≟');
    await key('e'); await until(s => s.slots === 2 && s.eq === 'y = C_1 cos(3x) + C_2 sin(3x)', 'the general solution beside it', 8000);
  },

  async 'typing int x dx and d/dx: □ marks what is still to come, never stray letters'({ p, key, type, until, assert, countRefusals, refusals }) {
    await key('i');
    const seen = [];
    for (const ch of 'int x dx') { await type(ch); await p.waitForTimeout(40); seen.push(await p.evaluate(() => window.algebrix.preview ? window.toText(window.algebrix.preview) : '-')); }
    assert(!seen.some(t => /^i·?n|^in/.test(t)), `no i·n on the way: ${seen.join(' | ')}`);
    assert(seen[2] === '∫ □ dx', `int waits for its integrand: ${seen[2]}`);
    await key('Enter'); await until(s => s.eq === '∫ x dx', 'the integral typed');
    await key('i'); await type('d/dx');
    await countRefusals(); await key('Enter');
    assert(await refusals() === 1, 'Enter with a □ left is refused');
    await type(' x^2'); await key('Enter');
    await until(s => s.eq === 'd/dx(x^2)', 'd/dx typed as an expression');
    await key('e'); await until(s => s.eq === '2x', 'and worked out', 10000);
  },

  async 'C has sections: ← → between them, ↓ into one, and the limit and the area ask for what they need'({ load, p, key, until, assert, wait }) {
    await load('sin(x)/x');
    await key('c'); await wait(150);
    const tabs = () => p.evaluate(() => [...document.querySelectorAll('#forms .pal-tab')].map(t => t.textContent + (t.classList.contains('on') ? '*' : '')));
    const t0 = await tabs();
    assert(t0.includes('Derivatives*') && t0.includes('Integrals') && t0.includes('Limits'), `sections, Derivatives open: ${t0}`);
    await key('ArrowRight');
    assert((await tabs()).includes('Limits*'), `→ moves to Limits: ${await tabs()}`);
    await key('ArrowDown', 'Enter');
    const input = await p.evaluate(() => !!document.getElementById('calc-input'));
    assert(input, 'the limit asks where x goes');
    await p.keyboard.type('0'); await key('Enter');
    await until(s => s.eq === 'lim_{x→0} sin(x)/x', 'the limit wrapped');
    await key('e'); await until(s => s.eq === '1', 'worked out', 10000);
    await load('sin(x)');
    await key('c'); await wait(150);
    await key('a'); await wait(100);
    await p.keyboard.type('0, pi'); await key('Enter');
    await until(s => s.eq === '∫_{0}^{π} sin(x) dx', 'the area between the bounds');
    await key('e'); await until(s => s.eq === '2', 'worked out', 10000);
  },
  async "aimed at y′, Tab opens it up as dy/dx and into differentials, and it integrates to y = C e^(x²/2)"({ load, key, aim, until, p }) {
    await load("y' = x y");
    await aim('y′');
    await p.keyboard.down('Tab'); await p.waitForTimeout(200); await key('y'); await p.keyboard.up('Tab');
    await until(s => s.eq === 'dy/dx = xy', 'as dy/dx');
    await p.keyboard.down('Tab'); await p.waitForTimeout(200); await key('k'); await p.keyboard.up('Tab');
    await until(s => s.eq === 'dy = xy dx', 'as differentials');
    await key('Slash'); await p.keyboard.type('y'); await key('Enter');
    await until(s => s.eq.startsWith('dy/y = '), 'divided by y');
    await p.keyboard.down('c'); await p.waitForTimeout(200); await key('i'); await p.keyboard.up('c');
    await until(s => s.eq === '∫ 1/y dy = ∫ x dx', 'integrated both sides');
    await key('e');
    await until(s => s.eq === 'y = Ce^(x^2/2)', 'solved as one family', 12000);
  },
};
