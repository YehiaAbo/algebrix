// The calculus hub (C): derivatives a rule at a time, limits, both sides, critical points.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { find, relOf, key, Eq, Node, symbols, walk, int, num, cloneFresh, eq as mkEq } from '../engine/ast';
import { isErr, MoveOk } from '../engine/moves';
import { formsFor } from '../engine/forms';
import { tidy } from '../engine/techniques';
import { derivStep, plugIn, lhopital, finishCalc, hasCalc, calcVar, derivativeOf, criticalOf, bothSides, definitionForm } from '../engine/calcmoves';
import { intStep, uSub, byParts, plugBounds, geometric, ratioTest, taylor } from '../engine/integrate';
import { Form } from '../engine/forms';
import { sound } from './sound';
import * as sheet from './sheet';
import { Tech } from './shared';
import type { App } from './app';

export function calcTechniques(this: App): Tech[] {
  const eq = this.eq;
  const aimed = this.sel && this.sel !== 'eq' ? find(eq, this.sel) : null;
  const v = calcVar(eq, aimed?.k === 'sym' ? aimed.name : null);
  const rel = relOf(eq);
  const out: Tech[] = [];
  if (has(eq, 'deriv')) {
    const r = derivStep(eq, this.sel);
    out.push({ key: 'd', label: isErr(r) ? 'next rule' : r.label, ok: !isErr(r), run: () => this.apply(derivStep(this.eq, this.sel), 1.1) });
  } else if (rel === 'expr' || rel === 'def') {
    out.push({ key: 'd', label: v ? `derivative (d/d${v})` : 'derivative', ok: !!v, run: () => this.addWork(derivativeOf(this.eq, v!), 'derivative') });
  } else {
    const r = v ? bothSides(eq, v) : { error: '' };
    out.push({ key: 'd', label: v ? `d/d${v} both sides` : 'd/dx both sides', ok: !isErr(r), run: () => this.apply(bothSides(this.eq, v!), 1.1) });
  }
  const fresh = (rel === 'expr' || rel === 'def') && !hasCalc(eq) && !!v;
  if (has(eq, 'int')) {
    const r = intStep(eq, this.sel), u = uSub(eq, this.sel), b = byParts(eq, this.sel);
    out.push({ key: 'i', label: isErr(r) ? 'integrate' : r.label, ok: !isErr(r), run: () => this.apply(intStep(this.eq, this.sel), 1.1) });
    out.push({ key: 'u', label: 'u-substitution', ok: !isErr(u.move), run: () => this.substituteU() });
    out.push({ key: 'b', label: isErr(b) ? 'by parts' : b.label, ok: !isErr(b), run: () => this.apply(byParts(this.eq, this.sel), 1.1) });
  } else if (fresh) out.push({ key: 'i', label: `antiderivative (∫ d${v})`, ok: true, run: () => this.addWork(eqOf(int(v!, cloneFresh(body(eq)))), 'antiderivative') });
  if (has(eq, 'lim') || has(eq, 'at')) {
    const bounds = has(eq, 'at');
    const p = bounds ? plugBounds(eq, this.sel) : plugIn(eq, this.sel);
    out.push({ key: 'p', label: bounds ? 'plug in the bounds' : 'plug in', ok: !isErr(p), run: () => this.apply(has(this.eq, 'at') ? plugBounds(this.eq, this.sel) : plugIn(this.eq, this.sel), 1.1) });
  }
  if (has(eq, 'lim')) {
    const l = lhopital(eq, this.sel);
    out.push({ key: 'l', label: "L'Hôpital", ok: !isErr(l), run: () => this.apply(lhopital(this.eq, this.sel), 1.1) });
  }
  if (has(eq, 'sum')) {
    const g = geometric(eq, this.sel);
    out.push({ key: 'g', label: 'geometric series', ok: !isErr(g), run: () => this.apply(geometric(this.eq, this.sel), 1.1) });
    out.push({ key: 'r', label: 'ratio test', ok: true, run: () => { this.say(ratioTest(this.eq, this.sel)); this.tour.check(); } });
  }
  if (fresh) {
    out.push({ key: 'm', label: 'max and min (slope 0)', ok: true, run: () => this.addWork(criticalOf(this.eq, v!), 'critical points') });
    out.push({ key: 't', label: 'Taylor polynomial', ok: true, run: () => { const t = taylor(this.eq, v!); if ('error' in t) return this.refuse(t.error); this.addWork(t.poly, `Taylor polynomial of degree 5 about ${v} = ${t.about}`); } });
  }
  return out;
}

const has = (n: Node, k: string) => { let f = false; walk(n, m => { if (m.k === k) f = true; }); return f; };
const body = (e: Eq) => (e.rel === 'def' ? e.rhs : e.lhs);
const eqOf = (n: Node): Eq => mkEq(n, num(0), 'expr');

/** C + u: the integral in u, and u = … on the shelf beside it */
export function substituteU(this: App) {
  const r = uSub(this.eq, this.sel);
  if (isErr(r.move)) return this.refuse(r.move.error);
  if (r.side) {
    if (this.slots.length >= 9) return this.refuse('Nine equations is the limit for now.');
    this.slots.push({ steps: [{ eq: r.side, label: 'substitution', conditions: [] }], at: 0, sel: null });
  }
  this.apply(r.move, 1.1);
}

/** u-substitutions on the shelf: u → what it stands for */
export function substitutions(this: App): Record<string, Node> {
  const out: Record<string, Node> = {};
  for (const s of this.slots) {
    const e = s.steps[0].eq;
    if (s.steps[0].label === 'substitution' && e.lhs.k === 'sym') out[e.lhs.name] = e.rhs;
  }
  return out;
}

/** the forms C offers: the derivative as a limit */
export function calcForms(this: App): Form[] {
  const d = definitionForm(this.eq, this.sel);
  return d ? [{ ...d, name: 'the definition (h → 0)', chord: 'h' }] : [];
}

/** a new equation to work on, next to this one */
export function addWork(this: App, e: Eq | { error: string }, why: string) {
  if ('error' in e) { this.refuse(e.error); return; }
  const problem = sheet.place(this, e, true);
  if (problem) { this.refuse(problem); return; }
  sound.commit();
  this.sel = null;
  this.stage.clear();
  this.renderAll(null);
  this.entrance();
  this.save();
  this.say(`Equation ${this.cur + 1}: the ${why}. Hold C for the next rule, or press e to work it all out.`);
}

/** e with calculus in it: every derivative and limit, one step after another, then the usual */
export function finishCalculus(this: App) {
  const { steps, stuck } = finishCalc(this.eq, this.substitutions());
  const then = () => {
    if (stuck) return this.say(stuck, true);
    if (hasCalc(this.eq)) return;
    const rel = relOf(this.eq);
    if (rel === 'expr' || rel === 'def') {
      const f = formsFor(this.eq, null).find(x => x.name === 'simplified' || x.name === 'expanded');
      if (f) return this.apply(f, 1.15);
      const t = tidy(this.eq);
      if (t && key(t.eq) !== key(this.eq)) this.applyTidy({ ...t, auto: true, label: 'simplify' }, 1.2);
      return;
    }
    // differentiated both sides: solve for the y′ that appeared
    const primed = symbols(this.eq).find(w => w.endsWith('′'));
    if (primed) return this.solveFor(primed);
    this.solveKey();
  };
  if (!steps.length) return then();
  this.play(steps as MoveOk[], then);
}
