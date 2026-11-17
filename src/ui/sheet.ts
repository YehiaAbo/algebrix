// The work as data: the equations on the sheet, each with its steps and where you are in
// them. No drawing and no sound here, so the rules (undo skips automatic tidy steps,
// conditions add up, nine equations at most) are unit-tested on their own.
import { Eq, symbols, isIneq } from '../engine/ast';
import { solveInequality } from '../engine/inequality';
import { direction, MoveOk, solvedFor } from '../engine/moves';
import { Slot, Step } from './shared';

export interface Sheet { slots: Slot[]; cur: number }

export const MAX_EQUATIONS = 9;

export const eqOf = (s: Sheet, i: number): Eq => { const sl = s.slots[i]; return sl.steps[sl.at].eq; };

/** a typed equation: added as a new one, or replacing the current one. Null, or why not. */
export function place(s: Sheet, eq: Eq, asNew: boolean): string | null {
  const fresh: Slot = { steps: [{ eq, label: 'start', conditions: [] }], at: 0, sel: null };
  if (asNew || !s.slots.length) {
    if (s.slots.length >= MAX_EQUATIONS) return 'Nine equations is the limit for now.';
    s.slots.push(fresh);
    s.cur = s.slots.length - 1;
  } else s.slots[s.cur] = fresh;
  return null;
}

/** take a move: steps after the current one are dropped, conditions carry forward, and a
 *  one-variable inequality that is solved gets its answer written out */
export function addStep(s: Sheet, r: MoveOk): Step {
  const slot = s.slots[s.cur];
  const renamed = slot.steps[slot.at].conditions.map(c => (r.rename ?? []).reduce((t, [a, b]) => t.split(a).join(b), c));
  const conditions = [...new Set([...renamed, ...(r.conditions ?? [])])];
  let answer = r.answer;
  const sv = solvedFor(r.eq);
  if (!answer && isIneq(r.eq) && sv && symbols(r.eq).length === 1) { const a = solveInequality(r.eq, sv); if (!('error' in a)) answer = a.text; }
  const step: Step = { eq: r.eq, label: r.label, conditions, auto: r.auto, rule: r.rule ?? r.label, dir: direction(r), answer };
  slot.steps = slot.steps.slice(0, slot.at + 1);
  slot.steps.push(step);
  slot.at++;
  return step;
}

/** back one step, past any automatic tidy steps. False at the original. */
export function undo(s: Sheet): boolean {
  const slot = s.slots[s.cur];
  if (slot.at === 0) return false;
  while (slot.at > 1 && slot.steps[slot.at].auto) slot.at--;
  slot.at--;
  return true;
}

/** forward one step, through any automatic tidy steps that follow it. False at the end. */
export function redo(s: Sheet): boolean {
  const slot = s.slots[s.cur];
  if (slot.at >= slot.steps.length - 1) return false;
  slot.at++;
  while (slot.at < slot.steps.length - 1 && slot.steps[slot.at + 1].auto) slot.at++;
  return true;
}

/** remove the current equation; the one after it (or before, at the end) becomes current */
export function removeCurrent(s: Sheet): boolean {
  if (s.slots.length < 2) return false;
  s.slots.splice(s.cur, 1);
  s.cur = Math.min(s.cur, s.slots.length - 1);
  return true;
}
