// Aiming by keyboard and mouse.
export const tests = {
  async 'a fraction: top, bottom and back with ↓ ↑'({ load, key, aim, until }) {
    await load('y = (x + 1)/(x - 1)');
    await aim('(x + 1)/(x − 1)');
    await key('ArrowDown'); await until(s => s.aim === 'x + 1', 'the top');
    await key('ArrowDown'); await until(s => s.aim === 'x − 1', 'the bottom');
    await key('ArrowUp'); await until(s => s.aim === 'x + 1', 'the top again');
    await key('ArrowDown', 'ArrowDown'); await until(s => s.aim === 'x', 'inside the bottom');
    await key('ArrowUp', 'ArrowUp'); await until(s => s.aim === 'x + 1', 'back to the top');
    await key('ArrowRight'); await until(s => s.aim === 'x', 'walked into the top');
  },

  async 'walking past an edge does nothing, and nothing shakes'({ load, key, aim, until, countRefusals, refusals, assert, state }) {
    await load('2x + 3 = 7');
    await aim('7');
    await countRefusals();
    await key('ArrowRight', 'ArrowRight', 'ArrowRight');
    await until(s => s.aim === '7', 'still 7');
    await key('ArrowDown', 'ArrowDown');
    assert((await state()).aim === '7', 'the smallest piece stays aimed');
    assert(await refusals() === 0, 'an edge should not shake the equation');
  },

  async 'a box drawn with the mouse picks part of a side'({ p, load, until, key, expectEq }) {
    await load('x + 2 + 3 = 10');
    const host = await (await p.$('#stage')).boundingBox();
    const [a, b] = await p.evaluate(() => { const app = window.algebrix; return app.base.lhs.terms.slice(1).map(t => app.stage.box(t.id)); });
    await p.mouse.move(host.x + a.x - 6, host.y + a.y - 10); await p.mouse.down();
    await p.mouse.move(host.x + b.x + b.w + 6, host.y + b.y + b.h + 10, { steps: 6 }); await p.mouse.up();
    await until(s => s.aim === '2 + 3', 'the box to pick 2 + 3');
    await key('s'); await expectEq('x + 5 = 10');
  },

  async 'Ctrl grows the highlight, Shift slides a term'({ load, aim, p, key, until, expectEq }) {
    await load('2x + 3 + 5 + y = 10');
    await aim('3');
    await p.keyboard.down('Control'); await key('ArrowRight'); await p.keyboard.up('Control');
    await until(s => s.aim === '3 + 5', '3 + 5 highlighted');
    await key('s'); await expectEq('2x + 8 + y = 10');
    await key('Escape'); await aim('2x'); await key('Shift+ArrowRight');
    await until(s => s.eq.startsWith('8 + 2x'), '2x slid right');
  },

  async 'm pressed again and again keeps holding what moved: a group, a whole side (user 2026-11-27)'({ load, aim, p, key, until, assert }) {
    const held = () => p.evaluate(() => { const a = window.algebrix; let got = a.sel; const f = n => { if (!n || typeof n !== 'object') return; if (n.id === a.sel) got = window.toText(n); for (const v of Object.values(n)) Array.isArray(v) ? v.forEach(f) : f(v); }; f(a.eq); return got; });
    await load('-96x + f(x) + 7 = 0');
    await aim('−96x');
    await p.keyboard.down('Control'); await key('ArrowRight'); await p.keyboard.up('Control');
    await until(s => s.aim === '−96x + f(x)', 'the group');
    for (let i = 0; i < 5; i++) {
      await key('m'); await p.waitForTimeout(120);
      const h = await held();
      assert(h === (i % 2 ? '−96x + f(x)' : '96x − f(x)'), `press ${i + 1}: holding ${h}`);
    }
    await load('f(x) - 96x = 0');
    await p.evaluate(() => window.algebrix.select(window.algebrix.eq.lhs.id));
    for (let i = 0; i < 4; i++) {
      await key('m'); await p.waitForTimeout(120);
      const h = await held();
      assert(h === (i % 2 ? 'f(x) − 96x' : '−f(x) + 96x'), `whole side, press ${i + 1}: holding ${h}`);
    }
  },

  async 'Shift slides the very 2 you aimed among equal 2s (user 2026-11-27)'({ load, p, key, assert }) {
    await load('2*2*2*2*3x = y');
    const pick = i => p.evaluate(i => window.algebrix.select(window.algebrix.eq.lhs.factors[i].id), i);
    const x = () => p.evaluate(() => window.algebrix.stage.box(window.algebrix.sel).x);
    await pick(2);
    for (const [k, more] of [['Shift+ArrowLeft', false], ['Shift+ArrowLeft', false], ['Shift+ArrowRight', true], ['Shift+ArrowRight', true], ['Shift+ArrowRight', true]]) {
      const a = await x(); await key(k); await p.waitForTimeout(150); const b = await x();
      assert(more ? b > a + 5 : b < a - 5, `${k}: the aimed 2 went from ${a} to ${b}`);
    }
  },
};
