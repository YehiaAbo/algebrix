// Laws every move must keep, over random equations (fast-check shrinks a failure to the
// smallest equation that breaks one). Run with SEED=… for another batch.
// m: a term moved across can be moved back by pressing m again on what it left aimed, or on the
// piece inside its new minus sign (the aim may land on either), and a third m gives the second
// equation again: holding m ping-pongs.
import { expect } from 'vitest';
import { test } from '@fast-check/vitest';
import fc from 'fast-check';
import '../src/engine/calculus';
import { parseEquation } from '../src/engine/parse';
import { walk, find, key, DEFS, Eq } from '../src/engine/ast';
import { toText } from '../src/engine/print';
import { moveAny } from '../src/engine/wrap';
import { isErr } from '../src/engine/moves';

const ENV: Record<string, string | undefined> = (globalThis as { process?: { env: Record<string, string> } }).process?.env ?? {};
fc.configureGlobal({ seed: Number(ENV.SEED ?? 20261122), numRuns: Number(ENV.RUNS ?? 300) });

const atom = fc.constantFrom('x', 'y', 'a', '3', '7', '1/2', 'π', '2x', '3a b', 'x^2', 'sin(x)', 'ln(y)', 'f(x)', 'g(a)', '√x', '(x + 1)^2', '1/x', 'e^x', '|x|', 'x/3');
const term = fc.tuple(fc.boolean(), atom).map(([minus, a]) => (minus ? '-' : '') + a);
const side = fc.array(term, { minLength: 1, maxLength: 4 }).map(ts => ts.join(' + ').replace(/\+ -/g, '- '));

const ids = (e: Eq) => { const out: string[] = []; walk(e, n => { if (n.k !== 'eq') out.push(n.id); }); return out; };

test.prop([side, side])('m, m, m ping-pongs whatever term you aim at', (l, r) => {
  DEFS.clear();
  const e = parseEquation(`${l} = ${r}`);
  for (const id of ids(e)) {
    const one = moveAny(e, id);
    if (isErr(one) || !one.label.startsWith('move ') || one.label === 'move side') continue;
    const aimed = one.select ? find(one.eq, one.select) : null;
    expect(aimed, `${toText(e)}: m on ${toText(find(e, id)!)} left nothing aimed`).toBeTruthy();
    // what the move aimed, and the piece inside its minus sign: m works from either
    for (const at of [aimed!.id, ...(aimed!.k === 'neg' ? [aimed!.arg.id] : [])]) {
      const two = moveAny(one.eq, at);
      if (isErr(two)) throw new Error(`${toText(e)} → ${toText(one.eq)}: m again on ${toText(find(one.eq, at)!)} refused: ${two.error}`);
      const three = moveAny(two.eq, two.select ?? null);
      if (isErr(three)) throw new Error(`${toText(two.eq)}: third m refused: ${three.error}`);
      expect(key(three.eq), `${toText(e)}: m, m, m`).toBe(key(one.eq));
    }
  }
});
