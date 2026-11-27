// The work as data: the equations on the sheet, each with its steps and where you are in
// them. No drawing and no sound here, so the rules (undo skips automatic tidy steps,
// conditions add up, nine equations at most, nothing you tried is lost) are unit-tested on their own.
import { Eq, symbols, isIneq, key } from '../engine/ast';
import { solveInequality } from '../engine/inequality';
import { direction, Checked, solvedFor } from '../engine/moves';
import { Link, Slot, Step } from './shared';
import { ensureIds, keepLine, linesOf, newId, switchLine } from './tree';

export interface Sheet { slots: Slot[]; cur: number }

export const MAX_EQUATIONS = 9;

export const eqOf = (s: Sheet, i: number): Eq => { const sl = s.slots[i]; return sl.steps[sl.at].eq; };

/** a typed equation: added as a new one, or replacing the current one. Null, or why not.
 *  from: the step it came out of, when a move made it (a derivative, a limit…) */
export function place(s: Sheet, eq: Eq, asNew: boolean, from?: Link): string | null {
  const fresh: Slot = { steps: [{ eq, label: 'start', conditions: [], id: newId() }], at: 0, sel: null, uid: newId(), ...(from ? { from } : {}) };
  if (asNew || !s.slots.length) {
    if (s.slots.length >= MAX_EQUATIONS) return 'Nine equations is the limit for now.';
    s.slots.push(fresh);
    s.cur = s.slots.length - 1;
  } else s.slots[s.cur] = fresh;
  return null;
}

/** take a move: conditions carry forward, and a one-variable inequality that is solved gets its
 *  answer written out. The steps after the current one leave the line you're on but stay in the
 *  tree; a move that gives the same as a step already taken from here goes back to that step
 *  (out.again) instead of copying it. link: the step in another equation the move used */
export function addStep(s: Sheet, r: Checked, opts: { link?: Link | null; out?: { again: boolean; back?: number } } = {}): Step {
  const slot = s.slots[s.cur];
  ensureIds(slot);
  const path = slot.steps.slice(0, slot.at + 1), k = key(r.eq);
  // back where you were a few steps ago (a reorder undone, x then ÷ x): go back to that step and
  // count it, so the tree doesn't grow a new branch for a round trip
  const back = slot.at > 0 && !opts.link ? path.findIndex(st => key(st.eq) === k) : -1;
  if (back >= 0 && back < slot.at) {
    const st = slot.steps[back];
    // the same equation, but its pieces as this move left them: 2·2 with the two 2s swapped looks
    // the same as before, yet the stage must slide the 2 you pushed, not the ones it had then
    st.eq = r.eq;
    st.back = (st.back ?? 0) + 1;
    slot.at = back;
    if (opts.out) opts.out.back = st.back;
    return st;
  }
  for (const line of linesOf(slot)) {
    const next = line[slot.at + 1];
    if (next && key(next.eq) === k && path.every((st, i) => line[i].id === st.id)) {
      next.eq = r.eq;
      switchLine(slot, line);
      slot.at++;
      if (opts.out) opts.out.again = true;
      return next;
    }
  }
  const renamed = slot.steps[slot.at].conditions.map(c => (r.rename ?? []).reduce((t, [a, b]) => t.split(a).join(b), c));
  const conditions = [...new Set([...renamed, ...(r.conditions ?? [])])];
  let answer = r.answer;
  const sv = solvedFor(r.eq);
  if (!answer && isIneq(r.eq) && sv && symbols(r.eq).length === 1) { const a = solveInequality(r.eq, sv); if (!('error' in a)) answer = a.text; }
  const step: Step = { eq: r.eq, label: r.label, conditions, auto: r.auto, rule: r.rule ?? r.label, dir: direction(r), answer, id: newId(), ...(opts.link ? { link: opts.link } : {}) };
  if (r.hints.absorbs.size || r.hints.flights.length) step.fx = { absorbs: [...r.hints.absorbs], flights: r.hints.flights.map(f => ({ ...f })) };
  if (slot.steps.length > slot.at + 1) keepLine(slot, slot.steps);
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

/** are equations i and j cases of one split (u = A or u = B)? Cases are alternatives, not a
 *  system, so one can't be put into the other. A case starts with the label "case n" and
 *  comes from a step of the equation that was split (which goes on as the first case). */
export function areCases(s: Sheet, i: number, j: number): boolean {
  const a = s.slots[i], b = s.slots[j];
  if (!a || !b || i === j) return false;
  const isCase = (sl: Slot) => !!sl.from && sl.steps[0].label.startsWith('case ');
  if (isCase(b) && b.from!.slot === a.uid) return true;
  if (isCase(a) && a.from!.slot === b.uid) return true;
  return isCase(a) && isCase(b) && a.from!.slot === b.from!.slot && a.from!.step === b.from!.step;
}
