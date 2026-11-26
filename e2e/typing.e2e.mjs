// Live math typing (ui/mathfield.ts over MathQuill): what you type turns into math as you type it,
// and reads back as what you meant. Each case is typed key by key in the real editor and must
// read as the same equation the text spelling reads as.
const SPELLINGS = [
  'x^2+5x+6=0', 'x/3+x/4=7', '1/x=2', 'sqrt(2x)=4', 'e^(-x^2)', '2^(x+1)=8', 'log_2 8', 'ln x + ln y',
  'sin^2 x', 'tan^-1(x)', '|2x-1|=5', 'x>=3', 'theta+alpha', 'pi r^2', 'x_1+x_2', '3!', 'f(x)=x^2+2x',
  "y''+y=0", 'dy/dx=x y', 'd/dx(sin x)', 'd^2y/dx^2+y=0', 'int x dx', 'int_0^pi sin x dx', 'int_1^inf 1/x^2 dx',
  'int_0^1 int_0^x xy dy dx', 'iint xy dx dy', 'sum_{n=1}^inf 1/n^2', 'prod_{k=1}^{5} k', 'lim x->0 sin(x)/x',
  'lim x->0+ ln x', 'lim x->inf x/(x+1)', '(x^2-1)/(x-1)', 'e^(-x^2) + a_n', 'sqrt(x^2+1)=2', '1/(x^2+1)', 'e^(2(x+1))', 'x(12-2x)^2', '1/2 x + 1', 'I(t)=int_0^1 (x^t-1)/ln x dx',
];

export const tests = {
  async 'every spelling typed into the live editor reads as the text spelling does'({ p, key, assert, wait }) {
    for (const s of SPELLINGS) {
      await key('i'); await key('Control+a', 'Backspace');
      await p.keyboard.type(s, { delay: 8 }); await wait(60);
      const r = await p.evaluate(async s => {
        const m = await import('/src/engine/parse.ts'), A = await import('/src/engine/ast.ts');
        const k = t => { try { return A.key(m.parseEquation(t, true)); } catch (e) { return 'error: ' + e.message; } };
        return { want: k(s), got: k(window.field('input').value), tex: window.field('input').latex() };
      }, s);
      assert(r.got === r.want, `${s} typed as ${r.tex}: ${r.got} (meant ${r.want})`);
      await key('Escape');
    }
  },

  async 'int turns into ∫ at once, and the cursor walks its bounds: _ low, ^ high, space on'({ p, key, assert }) {
    await key('i'); await key('Control+a', 'Backspace');
    await p.keyboard.type('int');
    assert(await p.evaluate(() => /^\\int/.test(window.field('input').latex())), 'int is ∫ straight away, no letters left');
    assert(await p.evaluate(() => !!document.querySelector('#input .mq-int')), 'drawn as an integral sign');
    await p.keyboard.type('_0^1 x dx'); await key('Enter');
    const eq = await p.evaluate(() => window.toText(window.algebrix.eq));
    assert(eq === '∫_{0}^{1} x dx', `committed: ${eq}`);
  },

  async 'the both-sides box types math too: ÷ then a fraction, and the f box takes e^_'({ p, key, load, until, assert }) {
    await load('2x = 6');
    await key('/'); await p.keyboard.type('2'); await key('Enter');
    await until(s => s.eq === '2x/2 = 6/2', '÷ 2 both sides');
    await load('ln(x) = 2');
    await key('f', '='); await p.keyboard.type('e^_');
    assert(await p.evaluate(() => window.field('pal-input').value === 'e^□'), '_ is the slot for each side');
    await key('Enter');
    await until(s => s.eq === 'e^(ln(x)) = e^2', 'e to both sides');
  },

  async 'keys typed in a box never reach the app (m, e, s, Tab stay in the box)'({ p, key, load, assert }) {
    await load('x + 1 = 2');
    await key('i', 'Control+a'); await p.keyboard.type('me = s');
    const s = await p.evaluate(() => ({ mode: window.algebrix.mode, tex: window.field('input').latex() }));
    assert(s.mode === 'write' && s.tex === 'me=s', `still writing, with what was typed: ${JSON.stringify(s)}`);
    await key('Escape');
    assert(await p.evaluate(() => window.toText(window.algebrix.eq)) === 'x + 1 = 2', 'Esc leaves the equation as it was');
  },

  async 'i on an equation puts it in the editor as math, and Enter keeps it as it was'({ p, key, load, assert }) {
    for (const s of ['I(t) = int_0^1 (x^t - 1)/ln x dx', 'lim x->0+ x^x', 'sum_{n=1}^∞ 1/n^2', 'd/dx(x^3 sin x)', 'y\'\' + 4y = 0']) {
      await load(s);
      const was = await p.evaluate(() => window.toText(window.algebrix.eq));
      await key('i', 'Enter');
      const now = await p.evaluate(() => window.toText(window.algebrix.eq));
      assert(now === was, `${s}: ${was} came back as ${now}`);
    }
  },
};
