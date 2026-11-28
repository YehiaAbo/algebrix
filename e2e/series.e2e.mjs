// Sums and products by hand: written out with ⋯, more terms at either end, crossed out with strokes,
// folded back; Σ and ∫ changing places with Shift; the f box's maths examples; labels drawn as maths.
const dots = p => p.evaluate(() => { let n = 0; const walk = x => { if (!x || typeof x !== 'object') return; if (x.k === 'sum' && x.dots) n++; Object.values(x).forEach(v => Array.isArray(v) ? v.forEach(walk) : walk(v)); }; walk(window.algebrix.eq); return n; });
const poll = async (p, f, what, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await f()) return; await p.waitForTimeout(80); } throw new Error('timed out waiting for ' + what); };
const pieces = p => p.evaluate(() => window.algebrix.eq.rhs.k === 'add' ? window.algebrix.eq.rhs.terms.length : 1);

export const tests = {
  async 'C x writes a telescoping sum out, C o crosses out what cancels, and it tidies itself'({ p, load, aim, hold, until, assert, key, wait }) {
    await load('S = sum_{k=1}^{n} (1/k - 1/(k+1))');
    await aim('Σ_{k=1}^{n} (1/k − 1/(k + 1))');
    await hold('c', 'x');
    await poll(p, async () => (await dots(p)) === 1, 'written out with a ⋯');
    const before = await pieces(p);
    await hold('c', 'o');
    // the strokes are drawn, then the struck pieces leave in an automatic step
    await p.waitForFunction(() => window.algebrix.stage.root.querySelectorAll(':scope > .g.bar.strike').length > 0, null, { timeout: 4000 });
    await until(s => s.eq === 'S = 1 − 1/(n + 1)', 'only the ends stay');
    assert(before > 2, `several pieces were written: ${before}`);
    await key('u');
    await poll(p, async () => (await dots(p)) === 1, 'one undo goes back to the written-out sum');
    // (the tree keeps the crossing-out step, strokes and all, in its card)
    await poll(p, () => p.evaluate(() => !window.algebrix.stage.root.querySelectorAll(':scope > .g.bar.strike').length), 'no strokes left on the equation after undo', 2000);
  },

  async 'C [ and ] write one more term at the start and the end, C } folds one back'({ p, load, aim, hold, until, assert }) {
    await load('S = sum_{k=1}^{n} k^2');
    await aim('Σ_{k=1}^{n} k^2');
    await hold('c', 'x');
    await poll(p, async () => (await dots(p)) === 1, 'written out');
    const n0 = await pieces(p);
    await p.evaluate(() => { const a = window.algebrix; let id = ''; const walk = x => { if (!x || typeof x !== 'object') return; if (x.k === 'sum' && x.dots) id = x.id; Object.values(x).forEach(v => Array.isArray(v) ? v.forEach(walk) : walk(v)); }; walk(a.eq); a.sel = id; a.renderSelection(); });
    await hold('c', ']');
    await poll(p, async () => (await pieces(p)) === n0 + 1, 'one more at the end');
    await hold('c', '[');
    await poll(p, async () => (await pieces(p)) === n0 + 2, 'one more at the start');
    await hold('c', '}');
    await poll(p, async () => (await pieces(p)) === n0 + 1, 'one folded back into the ⋯');
    assert(await dots(p) === 1, 'the ⋯ is still there');
  },

  async 'the ⋯ stays put under Shift and m, and s gives back the Σ it was written from'({ p, load, aim, key, until, assert, wait, countRefusals, refusals }) {
    await load('S = 1 + 4 + 9 + ... + 250000');
    await poll(p, async () => (await dots(p)) === 1, 'written out with a ⋯');
    const was = (await p.evaluate(() => window.algebrix.eq.rhs.terms.map(t => t.id))).join();
    await aim('1 + 4 + 9 + Σ_{k=4}^{499} k^2 + 250000');
    await key('ArrowDown');
    await aim('Σ_{k=4}^{499} k^2');
    await countRefusals();
    for (const k of ['Shift+ArrowRight', 'Shift+ArrowLeft', 'm']) { await key(k); await wait(250); }
    assert(await refusals() === 3, `each key was refused: ${await refusals()}`);
    const now = (await p.evaluate(() => window.algebrix.eq.rhs.terms.map(t => t.id))).join();
    assert(now === was, 'the ⋯ and its terms did not move');
    await key('s');
    await until(s => s.eq === 'S = Σ_{k=1}^{500} k^2', 'simplify folds it back into the original Σ');
  },

  async 'typing 1 + 1/4 + 1/9 + … reads the pattern as a Σ to ∞'({ load, until }) {
    await load('S = 1 + 1/4 + 1/9 + ...');
    await until(s => /Σ/.test(s.eq) && /∞/.test(s.eq), 'a sum to ∞');
  },

  async 'Shift ← on an integral inside Σ makes the two change places'({ p, load, key, until }) {
    await load('S = sum_{n=1}^{oo} int_0^1 t^n/2^n dt');
    await p.evaluate(() => { const a = window.algebrix; a.sel = a.eq.rhs.arg.id; a.renderSelection(); });
    await until(s => s.aim === '∫_{0}^{1} t^n/(2^n) dt', 'the integral inside');
    await key('Shift+ArrowLeft');
    await until(s => s.eq.startsWith('S = ∫_{0}^{1} Σ'), 'the ∫ came out past the Σ');
  },

  async 'C k sums a telescope spread over three terms'({ load, aim, hold, until }) {
    await load('S = sum_{k=1}^{oo} (1/(2k) - 1/(k+1) + 1/(2(k+2)))');
    await aim('Σ_{k=1}^{∞} (1/(2k) − 1/(k + 1) + 1/(2(k + 2)))');
    await hold('c', 'k');
    await until(s => !s.eq.includes('Σ'), 'the known sum, only the ends left');
  },

  async 'the f box shows its examples as maths, and a click types one'({ p, load, key, until, assert, wait }) {
    await load('f(x) = x^2');
    await key('f'); await wait(200);
    const eg = await p.evaluate(() => [...document.querySelectorAll('#pal-eg button.pal-eg')].map(b => b.title));
    assert(eg.includes('type f(4)') && eg.includes('type f(x^2+1)'), `your function's examples first: ${eg}`);
    assert(await p.evaluate(() => [...document.querySelectorAll('#pal-eg button.pal-eg')].every(b => b.firstElementChild)), 'each example is drawn maths, not plain text');
    await p.click('#pal-eg button.pal-eg');
    await until(s => s.mode === 'fnask', 'the click opens the box');
    const typed = await p.evaluate(() => document.querySelector('#pal-input')?.textContent ?? '');
    assert(/f\(4\)|f\s*\(\s*4/.test(typed.replace(/\s/g, '')) || typed.includes('4'), `f(4) typed: ${typed}`);
    await key('Escape', 'Escape');
    await until(s => s.mode === 'solve', 'Esc closes it');
  },

  async 'C hub cards draw their maths'({ p, load, aim, until, assert, wait, key }) {
    await load('S = sum_{k=1}^{n} k');
    await aim('Σ_{k=1}^{n} k');
    await p.keyboard.down('c'); await wait(200);
    const n = await p.evaluate(() => document.querySelectorAll('#forms .mlabel').length);
    await p.keyboard.up('c');
    assert(n > 0, 'some labels in the hub are drawn as maths');
    await key('Escape');
    await until(s => s.mode === 'solve', 'closed');
  },

  async 'H15 by keyboard: Σ (−1)^(n+1)/(n·C(2n, n)) by the Beta integral'({ p, load, key, hold, until, wait }) {
    await load('S = sum_{n=1}^{oo} (-1)^(n+1)/(n C(2n, n))');
    await p.evaluate(() => { const a = window.algebrix; a.sel = a.eq.rhs.arg.id; a.renderSelection(); });
    await hold('Tab', '=');
    await p.waitForSelector('#hub-input');
    await p.keyboard.press('Control+a');
    await p.evaluate(() => window.field('hub-input').setLatex(String.raw`\int_0^1\left(-1\right)^{n+1}\frac{1}{2}\left(t\left(1-t\right)\right)^{n-1}dt`));
    await key('Enter');
    await until(s => s.eq.startsWith('S = Σ_{n=1}^{∞} ∫_{0}^{1}'), 'the term is its Beta integral');
    await p.evaluate(() => { const a = window.algebrix; a.sel = a.eq.rhs.arg.id; a.renderSelection(); });
    await key('Shift+ArrowLeft');
    await until(s => s.eq.startsWith('S = ∫_{0}^{1} Σ'), 'Σ and ∫ change places');
    await p.evaluate(() => { const a = window.algebrix; a.sel = a.eq.rhs.arg.id; a.renderSelection(); });
    await hold('c', 'k');
    await until(s => s.eq.startsWith('S = ∫') && !s.eq.includes('Σ'), 'the geometric series summed');
    await p.evaluate(() => { const a = window.algebrix; a.sel = a.eq.rhs.id; a.renderSelection(); });
    await key('e');
    await until(s => !s.eq.includes('∫') && s.eq.includes('ln'), 'the integral done: a log', 10000);
  },
};
