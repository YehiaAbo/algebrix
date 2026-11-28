// The calculus rules for the aimed piece, as Tab forms (kept out of calc.ts, whose exports
// become App methods).
import { find, key, Node, symbols, walk, Eq } from '../engine/ast';
import { isErr } from '../engine/moves';
import type { Form } from '../engine/forms';
import { derivStep, plugIn, lhopital, hasCalc } from '../engine/calcmoves';
import { intStep, byParts, plugBounds, } from '../engine/integrate';
import { knownSum } from '../engine/sums';
import { writeOutDots } from '../engine/series';
/** The calculus rules that rewrite the piece you aimed (the next derivative rule, integrate, by
 *  parts, plug in, L'Hôpital, a known sum), as Tab forms: browse them with a live preview next to
 *  the algebra, since most of calculus is algebra on the pieces. C keeps the whole catalogue. */
export function calcForms(eq: Eq, sel: string | null): Form[] {
  if (!hasCalc(eq)) return [];
  const kinds = new Set<string>();
  walk(eq, n => kinds.add(n.k));
  const out: Form[] = [];
  let part = '';
  const push = (chord: string, r: ReturnType<typeof derivStep>) => { if (!isErr(r) && !out.some(f => key(f.eq) === key(r.eq))) out.push({ ...r, name: r.label, chord, part }); };
  part = 'd/dx';
  if (kinds.has('deriv')) push('d', derivStep(eq, sel));
  part = '∫';
  if (kinds.has('int')) {
    push('i', intStep(eq, sel));
    push('b', byParts(eq, sel));
    // by parts with each factor as u: you choose, the preview shows where each one leads
    const aimed = sel && sel !== 'eq' ? find(eq, sel) : null;
    let I: Node | null = aimed?.k === 'int' ? aimed : null;
    if (!I) walk(eq, n => { if (!I && n.k === 'int') I = n; });
    const T = I as Extract<Node, { k: 'int' }> | null;
    if (T && T.arg.k === 'mul') for (const f of T.arg.factors) if (symbols(f).includes(T.v)) push('', byParts(eq, f.id));
  }
  if (kinds.has('at')) push('p', plugBounds(eq, sel));
  part = 'lim';
  if (kinds.has('lim')) { push('p', plugIn(eq, sel)); push('l', lhopital(eq, sel)); }
  part = 'Σ';
  if (kinds.has('sum')) { push('k', knownSum(eq, sel)); push('x', writeOutDots(eq, sel)); }
  return out;
}
