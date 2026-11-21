// What every browser test gets: a fresh app (flash speed, no first-run tour) and small
// helpers to press keys, aim, read the state, and wait for something to become true.
export async function helpers(p, url) {
  await p.goto(url);
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem('algebrix.toured', '1'); localStorage.setItem('algebrix.prefs', JSON.stringify({ speed: 'flash', muted: true })); });
  await p.reload();
  await p.waitForFunction(() => !!window.algebrix);

  const wait = ms => p.waitForTimeout(ms);
  const key = async (...keys) => { for (const k of keys) { await p.keyboard.press(k); await wait(60); } };
  /** hold a key (Tab, f) and press another while it is down */
  const hold = async (mod, k) => { await p.keyboard.down(mod); await key(k); await p.keyboard.up(mod); await wait(150); };
  const type = s => p.keyboard.type(s);
  const state = () => p.evaluate(() => {
    const a = window.algebrix, t = a.tour;
    return {
      eq: window.toText(a.eq), mode: a.mode, cur: a.cur, slots: a.slots.length,
      // the readout shows √ and ²; tests name pieces as typed text, kept beside it
      aim: (e => e ? (e.dataset.text || e.textContent) : null)(document.querySelector('#hints .what')),
      tour: t.active ? t.tour.id : null, step: t.i + 1,
    };
  });
  const text = async () => (await state()).eq;
  /** poll until check(state) is true, or fail with what the state was */
  const until = async (check, what, ms = 8000) => {
    const t0 = Date.now();
    let s;
    while (Date.now() - t0 < ms) { s = await state(); if (check(s)) return s; await wait(80); }
    throw new Error(`timed out waiting for ${what}; state: ${JSON.stringify(s)}`);
  };
  const expectEq = (want, ms) => until(s => s.eq === want, `"${want}"`, ms);
  const load = async src => { await p.evaluate(s => window.algebrix.loadFresh(s), src); await wait(150); };
  /** walk right until the bar says this piece is aimed */
  const aim = async target => {
    for (let i = 0; i < 30; i++) { if ((await state()).aim === target) return; await key('ArrowRight'); }
    throw new Error(`could not aim at ${target}; aim is ${(await state()).aim}`);
  };
  /** count refusals (the shake) from now on */
  const countRefusals = () => p.evaluate(() => { const a = window.algebrix; a.__refused = 0; const was = Object.getPrototypeOf(a).refuse; a.refuse = function (t) { a.__refused++; return was.call(this, t); }; });
  const refusals = () => p.evaluate(() => window.algebrix.__refused);
  const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
  return { p, wait, key, hold, type, state, text, until, expectEq, load, aim, countRefusals, refusals, assert };
}
