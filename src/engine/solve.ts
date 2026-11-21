// Solve an equation completely, the way e + i does in the app: isolate the variable,
// split into cases where it branches, and keep only answers that work in the original.
// Used by the "done enough" problem set to measure the algebra engine.
import { Eq, evaluate, symbols, relOf, isIneq } from './ast';
import { solvedFor } from './moves';
import { isolate, splitCases, tidy } from './techniques';
import { solveInequality } from './inequality';

export interface Solved { values: number[]; text?: string; steps: number }

export function solveAll(e: Eq, v: string): Solved | { error: string } {
  if (isIneq(e)) {
    const s = solveInequality(e, v);
    return 'error' in s ? s : { values: [], text: s.text, steps: 1 };
  }
  if (relOf(e) !== '=') return { error: 'Not an equation.' };
  const values: number[] = [];
  let steps = 0;
  const visit = (cur: Eq, depth: number): string | null => {
    if (depth > 4) return 'too many cases';
    const r = solvedFor(cur) === v ? [] : isolate(cur, v);
    // a case with no real answers (x² + 3 = 0) adds none; the other cases still count
    if (!Array.isArray(r)) return depth && /no real/.test(r.error) ? null : r.error;
    steps += r.length;
    if ((r as { stuck?: string }).stuck && depth && /no real/.test((r as { stuck?: string }).stuck!)) return null;
    let end = r.length ? r[r.length - 1].eq : cur;
    const t = tidy(end);
    if (t) end = t.eq;
    if (solvedFor(end) === v) {
      const other = end.lhs.k === 'sym' && end.lhs.name === v ? end.rhs : end.lhs;
      if (symbols(other).length) return `ended with ${v} in terms of ${symbols(other).join(', ')}`;
      values.push(evaluate(other, {}));
      return null;
    }
    const c = splitCases(end, v);
    if (!c) return 'stuck';
    for (const part of [c.first.eq, ...c.rest]) { const err = visit(part, depth + 1); if (err) return err; }
    return null;
  };
  const err = visit(e, 0);
  if (err) return { error: err };
  const good = values.filter(x => {
    const L = evaluate(e.lhs, { [v]: x }), R = evaluate(e.rhs, { [v]: x });
    return Number.isFinite(L) && Number.isFinite(R) && Math.abs(L - R) <= 1e-7 * (1 + Math.abs(L) + Math.abs(R));
  });
  const uniq = [...new Set(good.map(x => Math.round(x * 1e9) / 1e9))].sort((a, b) => a - b);
  return { values: uniq, steps };
}
