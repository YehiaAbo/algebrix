// Exponent laws both ways, by keyboard: Tab + p splits a power so a quadratic form shows, b
// names the inside, and f + i undoes a fractional power.
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
};
