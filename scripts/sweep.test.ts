// Not part of the suite: an exploration sweep. Run with npx vitest run scripts/sweep.test.ts
import { it } from 'vitest';
import { parseEquation } from '../src/engine/parse';
import { toText } from '../src/engine/print';
import { applyMove, applyBothChecked, isErr, MoveName } from '../src/engine/moves';
import { walk, Eq, symbols } from '../src/engine/ast';
import { formsFor } from '../src/engine/forms';
import { moveAny, tidy, isolate, peel } from '../src/engine/techniques';

const EQS = [
  '7y + 3x = 20', '2(x + 3) = 10', 'x/2 + x/3 = 5', '3x - 7 = 2x + 4', '-x = 4', '-(x - 2) = 3', '5 - x = 2',
  'x^2 + 5x + 6 = 0', 'x^2 = 9', '(x - 1)^2 = 16', '2x^2 - 8 = 0', 'x(x + 2) = 0', '(x+1)(x-1) = 3',
  '1/x + 1/2 = 1', '3/(x + 1) = 2', '(2x + 1)/3 = (x - 1)/2', 'x/(x - 1) = 2', 'y = mx + b', 'a x + b = c',
  'sqrt(x) = 4', 'sqrt(x + 1) = x - 1', 'e^x = 5', 'ln(x) = 2', '2^x = 8', 'ln(2x) = ln(x) + 1', '|x - 3| = 5',
  '0.5x + 1.25 = 3', '4 = 2y', 'x = 3', '3 = x', '2x = 0', 'x - x + 1 = y', '6x/3 = 4', '(x^2 - 4)/(x - 2) = 5',
  '1/(2x) = 3', '-3x/7 + 20/7 = y', 'x·x = 4', '2·3x = 12', 'x^3 = 8', 'sin(x) = 1/2', 'x^(-1) = 2', '10^x = 1000',
  '-2(x - 1) + 3 = -x', 'x/-2 = 3', '-x/2 = 3',
];
const MOVES: MoveName[] = ['move', 'divide', 'multiply', 'distribute', 'simplify', 'factor', 'slideL', 'slideR', 'swap', 'lift', 'drop'];
const UGLY = [/·1(?![0-9])/, /\b1·/, /\+ −/, /− −/, /−−/, /\^1(?![0-9])/, /\/1(?![0-9])/, /^0 \+|\+ 0(?![0-9.])/, /\(\)/, /·−/, /NaN|Infinity|undefined/, /\(x\)/];

it('sweep', () => {
  const out: string[] = [];
  const note = (s: string) => out.push(s);
  for (const src of EQS) {
    let e: Eq;
    try { e = parseEquation(src); } catch (err) { note(`PARSE ${src}: ${(err as Error).message}`); continue; }
    const ids: string[] = [];
    walk(e, n => { if (n.k !== 'eq') ids.push(n.id); });
    const check = (what: string, r: { eq: Eq } | { error: string } | null) => {
      if (!r || 'error' in r) { if (r && /engine refused/.test(r.error)) note(`REFUSED ${src} :: ${what}`); return; }
      const s = toText(r.eq);
      for (const u of UGLY) if (u.test(s)) note(`UGLY ${src} :: ${what} -> ${s}`);
      const td = tidy(r.eq);
      if (td) { const t = toText(td.eq); for (const u of UGLY) if (u.test(t)) note(`UGLY-TIDY ${src} :: ${what} -> ${t}`); }
    };
    for (const id of [null, 'eq', ...ids]) {
      const tag = id ? (id === 'eq' ? 'eq' : toText(walkFind(e, id))) : 'none';
      for (const m of MOVES) {
        try { check(`${m}@${tag}`, applyMove(m, e, id)); } catch (err) { note(`CRASH ${src} :: ${m}@${tag}: ${(err as Error).message}`); }
      }
      try { check(`any@${tag}`, moveAny(e, id)); } catch (err) { note(`CRASH ${src} :: any@${tag}: ${(err as Error).message}`); }
      try { for (const f of formsFor(e, id)) check(`form ${f.name}@${tag}`, f); } catch (err) { note(`CRASH ${src} :: forms@${tag}: ${(err as Error).message}`); }
      try { check(`peel@${tag}`, peel(e, id)); } catch (err) { note(`CRASH ${src} :: peel@${tag}: ${(err as Error).message}`); }
    }
    for (const op of ['+2', '-x', '*3', '/2', '*x', '/(x+1)', '-3x', '*(-1)']) {
      try { check(`op ${op}`, applyBothChecked(e, op)); } catch (err) { note(`CRASH ${src} :: op ${op}: ${(err as Error).message}`); }
    }
    for (const v of symbols(e)) {
      try {
        const r = isolate(e, v);
        if (!Array.isArray(r)) note(`NOSOLVE ${src} for ${v}: ${r.error}`);
        else if (r.length) {
          const last = toText(r[r.length - 1].eq);
          const ok = last.startsWith(`${v} = `) && !symbols(r[r.length - 1].eq.rhs).includes(v);
          note(`${ok ? 'SOLVE' : 'PARTIAL'} ${src} for ${v} -> ${last}  [${r.filter(s => !s.auto).length} steps]`);
          for (const u of UGLY) if (u.test(last)) note(`UGLY-SOLVE ${src} -> ${last}`);
        }
      } catch (err) { note(`CRASH ${src} :: isolate ${v}: ${(err as Error).message}`); }
    }
  }
  console.log(out.join('\n'));
});

function walkFind(e: Eq, id: string) { let hit: any = null; walk(e, n => { if (n.id === id) hit = n; }); return hit; }
