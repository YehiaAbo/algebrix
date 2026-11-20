// Solving: isolate a variable, split into cases, check answers, domains, inverses.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { symbols, relOf, isIneq, DEFS, add, key, holds, Eq } from '../engine/ast';
import { solveInequality } from '../engine/inequality';
import { inverseFunction } from '../engine/goals';
import { polyOf } from '../engine/rewrite';
import { setDomains, Domain } from '../engine/moves';
import { toText } from '../engine/print';
import { isErr, solvedFor, checked, MoveOk, MoveResult } from '../engine/moves';
import { newHints } from '../engine/simplify';
import { absorbConstant, shareExponential, renameConstant } from '../engine/ode';
import { negate } from '../engine/terms';
import { isolate, splitCases, tidy, Cases, impossible, leadPositive, everyTrigSolution } from '../engine/techniques';
import { evaluate } from '../engine/ast';
import { sound } from './sound';
import { ms } from './prefs';
import { Slot, DOMAIN_TEXT } from './shared';
import { here } from './tree';
import type { App } from './app';

export function solveFor(this: App, v: string) {
  const rel = relOf(this.eq);
  if (rel === 'expr') { this.refuse('An expression has nothing to solve. Add “= …” to make it an equation.'); return; }
  if (rel === '≟') { this.refuse('This holds for every value, so there is nothing to solve: prove it instead, one side at a time.'); return; }
  if (rel === 'def') { this.refuse('This defines a function. Use it in another equation, or hold Tab + b for its inverse.'); return; }
  if (isIneq(this.eq)) {
    const Q = polyOf(add([this.eq.lhs, negate(this.eq.rhs)]));
    const linear = symbols(this.eq).length === 1 && !!Q && Q.c.length <= 2;
    if (!linear) {
      const s = solveInequality(this.eq, v);
      if ('error' in s) { this.refuse(s.error); return; }
      this.apply({ eq: this.eq, label: 'sign chart', hints: { absorbs: new Map(), flights: [] }, factor: () => 1, answer: s.text, rule: 'sign chart' }, 1.1);
      return;
    }
  }
  const r = isolate(this.eq, v);
  if (!Array.isArray(r)) { this.refuse(r.error); return; }
  // nothing to isolate yet, like |2x − 1| = 5: straight to the cases
  if (!r.length) { if (solvedFor(this.eq) === v) this.refuse(`Already solved for ${v}.`); else this.afterSolve(v); return; }
  r.forEach(s => { s.select = null; s.focus = undefined; });
  const why = (r as { stuck?: string }).stuck;
  this.play(r, () => this.afterSolve(v, why));
}

/** a C the person typed is theirs, not a constant of integration to rename */
const ownC = (app: App) => symbols(app.slot?.origin ?? app.steps[0].eq).includes('C');

/** after isolating: split into cases and solve each one, or say where it got stuck */
export function afterSolve(this: App, v: string, why?: string) {
  // solving means a finished answer: take what simplifies at the end
  if (solvedFor(this.eq) === v) {
    // 2C is just C; an exponential bottom over a sum reads better shared out: e^x/3 + Ce^(−2x)
    // and a sum reads from its plus term: C − x², not −x² + C
    const steps: MoveOk[] = [];
    let cur = this.eq;
    const take = (r: MoveResult | null, label?: string) => { if (r && !isErr(r) && key(r.eq) !== key(cur)) { steps.push({ ...r, auto: true, ...(label ? { label } : {}) }); cur = r.eq; } };
    if (!ownC(this)) take(renameConstant(cur));
    take(shareExponential(cur));
    take(tidy(cur), 'simplify');
    take(checked(cur, { eq: leadPositive(cur), label: 'simplify', hints: newHints(), factor: () => 1, select: null }));
    // sin x = 1/2: π/6 is one solution; say all of them
    const peeled = this.steps.find(st => /^(sin|cos|tan)⁻¹ both sides$/.test(st.label));
    const every = peeled ? everyTrigSolution(peeled.eq, cur, v) : null;
    if (every) { if (steps.length) steps[steps.length - 1].answer = every; else steps.push({ eq: cur, label: 'every solution', hints: newHints(), factor: () => 1, select: null, answer: every }); }
    if (steps.length) this.play(steps);
    return;
  }
  // |y| = e^(g + C) from a differential equation: one family y = C e^g, not two cases
  const ab = absorbConstant(this.eq, v);
  if (!isErr(ab)) { this.apply(ab, 1.15); return; }
  // rename 2C to C before splitting, so both cases carry the same plain C
  if (symbols(this.eq).includes('C') && !ownC(this)) { const rc = renameConstant(this.eq); if (!isErr(rc)) { this.play([{ ...rc, auto: true }], () => this.afterSolve(v)); return; } }
  if (splitCases(this.eq, v)) { this.split(v); return; }
  // the letter cancelled: what's left is a plain fact, true or false
  const always = !symbols(this.eq).length && relOf(this.eq) !== 'expr' ? holds(this.eq, {}) : null;
  if (always !== null) {
    // one case of several: this case is empty, the others may not be
    const aCase = !!this.slot?.origin && this.slots.length > 1;
    this.say(always ? `${v} cancelled out, and ${toText(this.eq)} is always true: every ${v} works.` : aCase ? `${v} cancelled out, and ${toText(this.eq)} is never true, so this case has no solution. The other case is the next equation in the tree (Alt + →).` : `${v} cancelled out, and ${toText(this.eq)} is never true: no ${v} works, so there is no solution.`, !always);
    return;
  }
  const no = impossible(this.eq, v);
  this.say(no ?? why ?? `Got as far as I could isolating ${v}. Try a form (hold Tab) or a function (hold f).`, true);
}

/** split this equation into cases; the others become new equations. With v, solve every case too. */
export function split(this: App, v?: string, cases?: Cases) {
  const c = cases ?? splitCases(this.eq, v);
  if (!c) { this.refuse('Splitting needs |something| = b, or a product = 0.'); return; }
  if (this.slots.length + c.rest.length > 9) { this.refuse('Nine equations is the limit for now.'); return; }
  const origin = this.slot!.origin ?? this.steps[0].eq;
  const at = this.cur;
  // the cases come out of the step you split
  const from = here(this.slot!);
  // each case reads from its plus term: y = √(C − x²)
  c.first.eq = leadPositive(c.first.eq);
  c.rest = c.rest.map(e => leadPositive(e));
  // land on a case that works: an extraneous root (from squaring, or outside a log) waits in the tree
  if (v) {
    const works = (e: Eq) => {
      const r = isolate(e, v), end = Array.isArray(r) && r.length ? r[r.length - 1].eq : e;
      const w = solvedFor(end);
      if (w !== v || relOf(origin) !== '=' || symbols(origin).some(s => s !== v)) return true;
      const val = evaluate(end.lhs.k === 'sym' && end.lhs.name === v ? end.rhs : end.lhs, {});
      const L = evaluate(origin.lhs, { [v]: val }), R = evaluate(origin.rhs, { [v]: val });
      return Number.isFinite(L) && Number.isFinite(R) && Math.abs(L - R) <= 1e-7 * (1 + Math.abs(L) + Math.abs(R));
    };
    const good = c.rest.findIndex(works);
    if (good >= 0 && !works(c.first.eq)) { const e0 = c.first.eq; c.first.eq = c.rest[good]; c.rest[good] = e0; }
  }
  this.apply(c.first, 1.1);
  c.rest.forEach((e, j) => {
    const slot: Slot = { steps: [{ eq: e, label: `case ${j + 2}`, conditions: [...this.step.conditions] }], at: 0, sel: null, origin, from };
    if (v) {
      const r = isolate(e, v);
      if (Array.isArray(r)) for (const st of r) { slot.steps.push({ eq: st.eq, label: st.label, conditions: [...new Set([...slot.steps[slot.at].conditions, ...(st.conditions ?? [])])], auto: st.auto }); slot.at++; }
    }
    this.slots.splice(at + 1 + j, 0, slot);
    this.judge(at + 1 + j);
  });
  if (!this.slot!.origin) this.slot!.origin = origin;
  // the other cases go straight into the tree, in view
  this.renderTree();
  this.renderRail();
  this.save();
  const nums = c.rest.map((_, j) => at + 2 + j).join(' and ');
  if (!c.rest.length) this.say('One repeated root, so there is only one case.');
  else this.say(`${c.why[0].toUpperCase()}${c.why.slice(1)}: the ${c.rest.length > 1 ? 'others are' : 'other is'} equation ${nums}.`);
  if (v && solvedFor(this.eq) !== v) this.later(ms(450), () => this.solveFor(v));
}

/** a solved slot: does its answer work in the equation it came from? */
export function judge(this: App, i: number): string | null {
  const slot = this.slots[i];
  const e = slot.steps[slot.at].eq;
  const v = solvedFor(e);
  slot.bad = undefined;
  if (!v) return null;
  const rhs = e.lhs.k === 'sym' && e.lhs.name === v ? e.rhs : e.lhs;
  const origin = slot.origin ?? slot.steps[0].eq;
  if (relOf(origin) !== '=' || relOf(e) !== '=') return null;
  if (symbols(rhs).length || symbols(origin).some(s => s !== v)) return null;
  const x = evaluate(rhs, {});
  const dom = this.domains[v];
  const outside = dom === 'positive' ? !(x > 0) : dom === 'nonneg' ? !(x >= 0) : dom === 'integer' ? Math.abs(x - Math.round(x)) > 1e-9 : false;
  if (outside) { slot.bad = `${v} = ${toText(rhs)} isn't ${DOMAIN_TEXT[dom!]}, so it is left out.`; return slot.bad; }
  const L = evaluate(origin.lhs, { [v]: x }), R = evaluate(origin.rhs, { [v]: x });
  if (Number.isFinite(L) && Number.isFinite(R) && Math.abs(L - R) <= 1e-7 * (1 + Math.abs(L) + Math.abs(R))) return null;
  slot.bad = `${v} = ${toText(rhs)} doesn't work in the original ${toText(origin).replace(/sqrt\(/g, '√(')}${Number.isFinite(L) && Number.isFinite(R) ? '' : ' (it is undefined there)'}, so it is not a solution.`;
  return slot.bad;
}

export function cycleDomain(this: App, v: string) {
  const order: Domain[] = ['real', 'positive', 'nonneg', 'integer'];
  const next = order[(order.indexOf(this.domains[v] ?? 'real') + 1) % order.length];
  if (next === 'real') delete this.domains[v]; else this.domains[v] = next;
  setDomains(this.domains);
  sound.tick(2);
  this.slots.forEach((_, i) => this.judge(i));
  this.renderRail();
  this.save();
  this.say(`${v} is now ${DOMAIN_TEXT[next].replace('number', 'a number').replace('real a number', 'any real number')}. Sign questions and answers follow it.`);
}

/** e + b on a definition: a new equation with the inverse function */
export function addInverse(this: App) {
  const inv = inverseFunction(this.eq);
  if ('error' in inv) { this.refuse(inv.error); return; }
  if (this.slots.length >= 9) { this.refuse('Nine equations is the limit for now.'); return; }
  this.slots.push({ steps: [{ eq: inv, label: 'inverse', conditions: [] }], at: 0, sel: null, from: here(this.slot!) });
  this.cur = this.slots.length - 1;
  sound.commit();
  this.stage.clear();
  this.renderAll(null);
  this.save();
  const name = inv.lhs.k === 'call' ? inv.lhs.name : 'f⁻¹';
  this.say(`Equation ${this.cur + 1} is ${name}: it undoes ${name.replace('⁻¹', '')}.`);
}

/** the function definitions in your equations, for evaluating f(…) everywhere */
export function syncDefs(this: App) {
  DEFS.clear();
  for (let i = 0; i < this.slots.length; i++) {
    // a definition stays in force while you work on it (I(t) = … then d/dt both sides): the last
    // one on the way to the current step
    const slot = this.slots[i];
    const e = [...slot.steps.slice(0, slot.at + 1).map(st => st.eq)].reverse().find(q => q.rel === 'def');
    if (e && e.lhs.k === 'call' && e.lhs.arg.k === 'sym') DEFS.set(e.lhs.name, { param: e.lhs.arg.name, body: e.rhs });
  }
}
