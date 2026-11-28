// The ⋯ of a written-out sum stays where it is (user 2026-11-27, again 2026-11-28): it shows how the
// pattern carries on, so no key moves it or reorders the terms around it, and simplify gives back the Σ.
import { describe, it, expect } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { walk, Eq, Node } from '../src/engine/ast';
import { isErr, applyMove, MoveResult } from '../src/engine/moves';
import { writeOutDots, moreTerms, fewerTerms, crossOut } from '../src/engine/series';
import { formsFor } from '../src/engine/forms';

const step = (e: Eq, f: (e: Eq, sel: string | null) => MoveResult, sel: string | null = null): Eq => { const r = f(e, sel); if (isErr(r)) throw new Error(r.error); return r.eq; };
const dotsOf = (e: Eq) => { let D: Node | null = null; walk(e, n => { if (!D && n.k === 'sum' && n.dots) D = n; }); return D! as Node; };
const termsOf = (e: Eq) => (e.lhs.k === 'add' ? e.lhs.terms : []);
const written = () => step(parseEquation('sum_{k=1}^{500} k^2 = S'), writeOutDots);

describe('the ⋯ stays put', () => {
  it('Shift ← / → on the ⋯ is refused with a reason', () => {
    const e = written(), D = dotsOf(e);
    for (const m of ['slideL', 'slideR'] as const) {
      const r = applyMove(m, e, D.id);
      expect(isErr(r) && r.error).toMatch(/⋯ stays where it is/);
    }
  });
  it('Shift on a term next to it cannot jump over it, and the written terms keep their order', () => {
    const e = written(), ts = termsOf(e);
    const r1 = applyMove('slideR', e, ts[2].id); // 9 → past the ⋯
    expect(isErr(r1) && r1.error).toMatch(/⋯ stays where it is/);
    const r2 = applyMove('slideR', e, ts[0].id); // 1 ↔ 4
    expect(isErr(r2) && r2.error).toMatch(/keeps its order/);
  });
  it('m on the ⋯ is refused', () => {
    const e = written();
    const r = applyMove('move', e, dotsOf(e).id);
    expect(isErr(r)).toBe(true);
  });
  it('no Tab form reorders it ("highest power first" was ⋯ + 1 + 4 + …)', () => {
    const e = written(), before = termsOf(e).map(t => t.id);
    for (const sel of [null, dotsOf(e).id, termsOf(e)[0].id]) for (const f of formsFor(e, sel)) {
      const now = termsOf(f.eq).map(t => t.id).filter(id => before.includes(id));
      expect(now, f.name).toEqual(before.filter(id => now.includes(id)));
    }
  });
  it('[ ] { } and crossing out still work', () => {
    let e = written();
    e = step(e, (q, s) => moreTerms(q, s, 'start'));
    e = step(e, (q, s) => moreTerms(q, s, 'end'));
    e = step(e, (q, s) => fewerTerms(q, s, 'start'));
    expect(termsOf(e).findIndex(t => t.k === 'sum' && t.dots)).toBe(3);
    const t = step(parseEquation('S = sum_{k=1}^{n} (1/k - 1/(k+1))'), writeOutDots);
    expect(isErr(crossOut(t, null))).toBe(false);
  });
});

describe('other moves leave a written-out sum as it is written', () => {
  it('m on S, and + 3 on both sides, do not add 1 + 4 + 9 + 250000 up', () => {
    const e = written();
    const r = applyMove('move', e, e.rhs.id);
    expect(isErr(r) ? r.error : toText(r.eq)).toMatch(/^1 \+ 4 \+ 9 \+ Σ_\{k=4\}\^\{499\} k\^2 \+ 250000 − S = 0$/);
  });
  it('no Tab form adds the written terms up (Tab showed S = 250014 + ⋯ as "simplified")', () => {
    const e = written();
    for (const sel of [null, e.lhs.id]) for (const f of formsFor(e, sel)) expect(toText(f.eq), f.name).not.toMatch(/250014/);
  });
});

describe('simplify gives back the Σ', () => {
  it('s with nothing aimed, on the side, and on the ⋯', () => {
    const e = written();
    for (const sel of [null, e.lhs.id, dotsOf(e).id]) {
      const r = applyMove('simplify', e, sel);
      expect(isErr(r) ? r.error : toText(r.eq)).toBe('Σ_{k=1}^{500} k^2 = S');
    }
  });
  it('after more terms, the Σ has its original bounds', () => {
    const e = step(written(), (q, s) => moreTerms(q, s, 'end'));
    const r = applyMove('simplify', e, null);
    expect(isErr(r) ? r.error : toText(r.eq)).toBe('Σ_{k=1}^{500} k^2 = S');
  });
  it('the rest of the equation is still simplified', () => {
    const e = step(parseEquation('sum_{k=1}^{500} k^2 = 2x + 3x'), writeOutDots);
    const r = applyMove('simplify', e, null);
    expect(isErr(r) ? r.error : toText(r.eq)).toBe('Σ_{k=1}^{500} k^2 = 5x');
  });
});
