// The calculus hub (C): derivatives a rule at a time, limits, both sides, critical points.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { find, relOf, key, Eq, symbols } from '../engine/ast';
import { isErr, MoveOk } from '../engine/moves';
import { formsFor } from '../engine/forms';
import { tidy } from '../engine/techniques';
import { derivStep, plugIn, lhopital, finishCalc, hasDeriv, hasLim, calcVar, derivativeOf, criticalOf, bothSides, definitionForm } from '../engine/calcmoves';
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
  if (hasDeriv(eq)) {
    const r = derivStep(eq, this.sel);
    out.push({ key: 'd', label: isErr(r) ? 'next rule' : r.label, ok: !isErr(r), run: () => this.apply(derivStep(this.eq, this.sel), 1.1) });
  } else if (rel === 'expr' || rel === 'def') {
    out.push({ key: 'd', label: v ? `derivative (d/d${v})` : 'derivative', ok: !!v, run: () => this.addWork(derivativeOf(this.eq, v!), 'derivative') });
  } else {
    const r = v ? bothSides(eq, v) : { error: '' };
    out.push({ key: 'd', label: v ? `d/d${v} both sides` : 'd/dx both sides', ok: !isErr(r), run: () => this.apply(bothSides(this.eq, v!), 1.1) });
  }
  if (hasLim(eq)) {
    const p = plugIn(eq, this.sel), l = lhopital(eq, this.sel);
    out.push({ key: 'p', label: 'plug in', ok: !isErr(p), run: () => this.apply(plugIn(this.eq, this.sel), 1.1) });
    out.push({ key: 'l', label: "L'Hôpital", ok: !isErr(l), run: () => this.apply(lhopital(this.eq, this.sel), 1.1) });
  }
  if ((rel === 'expr' || rel === 'def') && !hasDeriv(eq) && v) out.push({ key: 'm', label: 'max and min (slope 0)', ok: true, run: () => this.addWork(criticalOf(this.eq, v), 'critical points') });
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
  this.say(`Equation ${this.cur + 1}: the ${why}. C + d takes it a rule at a time, e works it all out.`);
}

/** e with calculus in it: every derivative and limit, one step after another, then the usual */
export function finishCalculus(this: App) {
  const { steps, stuck } = finishCalc(this.eq);
  const then = () => {
    if (stuck) return this.say(stuck, true);
    if (hasDeriv(this.eq) || hasLim(this.eq)) return;
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
