// The calculus hub (C): derivatives a rule at a time, limits, both sides, critical points.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { find, relOf, key, Eq, Node, symbols, walk, int, num, lim, cloneFresh, eq as mkEq, grad, fieldOp } from '../engine/ast';
import { toText } from '../engine/print';
import { parseExpr } from '../engine/parse';
import { odeKind, separate, linearSteps, characteristic, generalSolution } from '../engine/ode';
import { isErr, MoveOk } from '../engine/moves';
import { formsFor } from '../engine/forms';
import { asPrime, hasDifferentials, integrateDifferentials, toDifferentials, letters, slopeVar } from '../engine/leibniz';
import { tidy } from '../engine/techniques';
import { derivStep, plugIn, lhopital, finishCalc, hasCalc, calcVar, derivativeOf, criticalOf, bothSides, definitionForm, calcVars, partialOf, gradStep, dotStep, gradientZero, lagrange, components } from '../engine/calcmoves';
import { intStep, uSub, byParts, plugBounds, geometric, ratioTest, taylor, writeOut } from '../engine/integrate';
import { sound } from './sound';
import * as sheet from './sheet';
import { Tech } from './shared';
import type { App } from './app';

/** the sections of the C hub, in order, with an example of what to type for each */
export const CALC_GROUPS: { name: string; example: string }[] = [
  { name: 'Derivatives', example: 'an expression like x^2 sin(x), or d/dx (…)' },
  { name: 'Limits', example: 'lim x->0 sin(x)/x' },
  { name: 'Integrals', example: 'int x^2 dx, or int_0^1 x^2 dx' },
  { name: 'Series', example: 'sum_{n=1}^∞ 1/n^2 or prod_{k=1}^5 k' },
  { name: 'Several variables', example: 'an expression in x and y, like x^2 y + y^3' },
  { name: 'Differential equations', example: "y' = x y, or y'' + 4y = cos(x)" },
  { name: 'Vector fields', example: '(-y, x, 0)' },
];

export function calcTechniques(this: App): Tech[] {
  const eq = this.eq;
  const aimed = this.sel && this.sel !== 'eq' ? find(eq, this.sel) : null;
  const v = calcVar(eq, aimed?.k === 'sym' ? aimed.name : null);
  const rel = relOf(eq);
  const out: Tech[] = [];
  // lead: what C opens on (the piece in progress, or the first thing to do with this one)
  const add = (group: string, t: Omit<Tech, 'group'>) => out.push({ ...t, group });
  const isFn = rel === 'expr' || rel === 'def';
  const vs = isFn ? calcVars(eq) : [];
  const multi = vs.length >= 2 && !hasCalc(eq);
  const field = rel === 'expr' && eq.lhs.k === 'vec' && !hasCalc(eq);
  const fresh = isFn && !hasCalc(eq) && !!v && !multi && !field;
  // dy/dx and dy = … dx are read as y′ for choosing a method
  const ode = hasCalc(eq) ? null : odeKind(asPrime(eq), slopeVar(eq));

  // Derivatives
  if (has(eq, 'deriv')) {
    const r = derivStep(eq, this.sel);
    add('Derivatives', { lead: true, key: 'd', label: isErr(r) ? 'next rule' : r.label, ok: !isErr(r), run: () => this.apply(derivStep(this.eq, this.sel), 1.1) });
    const def = definitionForm(eq, this.sel);
    add('Derivatives', { key: 'h', label: 'the definition (h → 0)', ok: !!def, run: () => { const d = definitionForm(this.eq, this.sel); if (d) this.apply(d, 1.15); } });
  } else if (multi) {
    const pv = aimed?.k === 'sym' && vs.includes(aimed.name) ? aimed.name : vs[0];
    add('Several variables', { lead: true, key: 'd', label: `∂/∂${pv}${aimed?.k === 'sym' ? '' : ' (aim at a letter for another)'}`, ok: true, run: () => this.addWork(partialOf(this.eq, pv), `partial derivative in ${pv}`) });
  } else if (fresh) {
    add('Derivatives', { lead: true, key: 'd', label: `derivative d/d${v}`, ok: true, run: () => this.addWork(derivativeOf(this.eq, v!), 'derivative') });
  } else if (rel === '=' && !field) {
    const r = v ? bothSides(eq, v) : { error: '' };
    add('Derivatives', { key: 'd', label: v ? `d/d${v} both sides` : 'd/dx both sides', ok: !isErr(r), run: () => this.apply(bothSides(this.eq, v!), 1.1) });
  }
  if (fresh) add('Derivatives', { key: 'm', label: 'max and min (slope 0)', ok: true, run: () => this.addWork(criticalOf(this.eq, v!), 'critical points') });

  // Limits
  if (has(eq, 'lim')) {
    const p = plugIn(eq, this.sel), l = lhopital(eq, this.sel);
    add('Limits', { lead: true, key: 'p', label: 'plug in', ok: !isErr(p), run: () => this.apply(plugIn(this.eq, this.sel), 1.1) });
    add('Limits', { key: 'l', label: "L'Hôpital", ok: !isErr(l), run: () => this.apply(lhopital(this.eq, this.sel), 1.1) });
  } else if (fresh) {
    add('Limits', { key: 'l', label: `limit as ${v} →`, ok: true, run: () => {}, ask: { prompt: `${v} →`, hint: 'a number, or inf', run: text => this.addWork(limitOf(this.eq, v!, text), 'limit') } });
  }

  // Integrals
  if (has(eq, 'int')) {
    const r = intStep(eq, this.sel), u = uSub(eq, this.sel), b = byParts(eq, this.sel);
    add('Integrals', { lead: true, key: 'i', label: isErr(r) ? 'integrate' : r.label, ok: !isErr(r), run: () => this.apply(intStep(this.eq, this.sel), 1.1) });
    add('Integrals', { key: 'u', label: 'u-substitution', ok: !isErr(u.move), run: () => this.substituteU() });
    add('Integrals', { key: 'b', label: isErr(b) ? 'by parts' : b.label, ok: !isErr(b), run: () => this.apply(byParts(this.eq, this.sel), 1.1) });
  } else if (fresh || multi) {
    const iv = fresh ? v! : (aimed?.k === 'sym' && vs.includes(aimed.name) ? aimed.name : vs[0]);
    add('Integrals', { key: 'i', label: `antiderivative ∫ d${iv}`, ok: true, run: () => this.addWork(eqOf(int(iv, cloneFresh(body(this.eq)))), 'antiderivative') });
    if (fresh) add('Integrals', { key: 'a', label: 'definite integral (area)', ok: true, run: () => {}, ask: { prompt: 'from, to', hint: 'two numbers, like 0, 1', run: text => this.addWork(definiteOf(this.eq, v!, text), 'definite integral') } });
  }
  if (has(eq, 'at')) {
    const p = plugBounds(eq, this.sel);
    add('Integrals', { lead: true, key: 'p', label: 'plug in the bounds', ok: !isErr(p), run: () => this.apply(plugBounds(this.eq, this.sel), 1.1) });
  }

  // Series
  if (has(eq, 'sum')) {
    const g = geometric(eq, this.sel), w = writeOut(eq, this.sel);
    if (!isErr(w)) add('Series', { lead: true, key: 'x', label: 'write out the terms', ok: true, run: () => this.apply(writeOut(this.eq, this.sel), 1.1) });
    add('Series', { lead: isErr(w), key: 'g', label: 'geometric series', ok: !isErr(g), run: () => this.apply(geometric(this.eq, this.sel), 1.1) });
    add('Series', { key: 'r', label: 'ratio test', ok: true, run: () => { this.say(ratioTest(this.eq, this.sel)); this.tour.check(); } });
  }
  if (fresh) add('Series', { key: 't', label: 'Taylor polynomial', ok: true, run: () => { const t = taylor(this.eq, v!); if ('error' in t) return this.refuse(t.error); this.addWork(t.poly, `Taylor polynomial of degree 5 about ${v} = ${t.about}`); } });

  // Several variables
  if (multi) {
    add('Several variables', { key: 'n', label: 'gradient ∇', ok: true, run: () => this.addWork(mkEq(grad(cloneFresh(body(this.eq)), vs), num(0), 'expr'), 'gradient') });
    add('Several variables', { key: 'm', label: 'max and min (∇ = 0)', ok: true, run: () => this.addWork(gradientZero(this.eq), 'critical points: every partial is 0') });
    const j = this.slots.findIndex((_, i) => i !== this.cur && !('error' in lagrange(eq, this.eqOf(i))));
    add('Several variables', { key: 'k', label: j >= 0 ? `Lagrange, on (${j + 1})` : 'Lagrange (type a constraint first)', ok: j >= 0, run: () => this.addWork(lagrange(this.eq, this.eqOf(j)), `Lagrange condition with equation ${j + 1}`) });
  }
  if (has(eq, 'grad')) add('Several variables', { lead: true, key: 'n', label: 'work out ∇', ok: true, run: () => this.apply(gradStep(this.eq, this.sel), 1.1) });
  if (hasDot(eq)) add('Several variables', { lead: true, key: 'o', label: 'dot product', ok: true, run: () => this.apply(dotStep(this.eq, this.sel), 1.1) });
  if (!isErr(components(eq).first)) add('Several variables', { lead: true, key: 's', label: 'split into components', ok: true, run: () => this.splitComponents() });

  // Differential equations
  if (hasDifferentials(eq) && !hasCalc(eq)) {
    const r = integrateDifferentials(eq);
    add('Differential equations', { lead: true, key: 'i', label: 'integrate both sides', ok: !isErr(r), run: () => this.apply(integrateDifferentials(this.eq), 1.1) });
  }
  if (ode && ode !== 'second') {
    add('Differential equations', { lead: true, key: 's', label: 'separate the variables', ok: ode === 'separable', run: () => this.apply(separate(asPrime(this.eq), slopeVar(this.eq)), 1.1) });
    add('Differential equations', { lead: true, key: 'f', label: 'integrating factor', ok: Array.isArray(linearSteps(asPrime(eq), slopeVar(eq))), run: () => this.integratingFactor() });
    if (!hasDifferentials(eq)) add('Differential equations', { key: 'k', label: 'as differentials: dy = … dx', ok: !isErr(toDifferentials(eq)), run: () => this.apply(toDifferentials(this.eq), 1.1) });
  } else if (ode === 'second') {
    add('Differential equations', { lead: true, key: 'r', label: 'characteristic equation', ok: true, run: () => this.addWork(characteristic(asPrime(this.eq), slopeVar(this.eq)), 'characteristic equation: try y = e^(rx)') });
    add('Differential equations', { key: 'g', label: 'general solution', ok: true, run: () => this.addWork(generalSolution(asPrime(this.eq), slopeVar(this.eq)), 'general solution, checked in the equation') });
  }

  // Vector fields
  if (field && eq.lhs.k === 'vec') {
    const F = eq.lhs;
    add('Vector fields', { lead: true, key: 'v', label: 'divergence ∇·', ok: F.items.length >= 2, run: () => this.addWork(eqOf(fieldOp('div', cloneFresh(F))), 'divergence') });
    add('Vector fields', { key: 'w', label: 'curl ∇×', ok: F.items.length === 2 || F.items.length === 3, run: () => this.addWork(eqOf(fieldOp('curl', cloneFresh(F))), 'curl') });
  }
  return out;
}

/** lim_{v → text} of the expression, as a new one */
function limitOf(e: Eq, v: string, text: string): Eq | { error: string } {
  let to: Node;
  try { to = parseExpr(text.replace(/^\s*inf(inity)?\s*$/i, '∞')); } catch (err) { return { error: (err as Error).message }; }
  return eqOf(lim(v, to, cloneFresh(body(e))));
}

/** ∫ from a to b of the expression, as a new one */
function definiteOf(e: Eq, v: string, text: string): Eq | { error: string } {
  const parts = text.split(/,|\bto\b/).map(t => t.trim()).filter(Boolean);
  if (parts.length !== 2) return { error: 'Type the two bounds with a comma between them, like 0, 1.' };
  let lo: Node, hi: Node;
  try { [lo, hi] = parts.map(t => parseExpr(t.replace(/^(-?)inf(inity)?$/i, '$1∞'))); } catch (err) { return { error: (err as Error).message }; }
  return eqOf(int(v, cloneFresh(body(e)), lo, hi));
}

const hasDot = (n: Node) => { let f = false; walk(n, m => { if (m.k === 'mul' && m.factors.filter(x => x.k === 'vec').length === 2) f = true; }); return f; };
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

/** C + f: the integrating factor method, every step played */
export function integratingFactor(this: App) {
  const s = linearSteps(asPrime(this.eq), slopeVar(this.eq));
  if (!Array.isArray(s)) return this.refuse(s.error);
  this.play(s, () => this.say('Now integrate the right side: C + i, or e to finish and solve for the function.'));
}

/** e on a differential equation: the method that fits, then solve */
export function solveOde(this: App) {
  // already in differentials and separated: integrate both sides, then finish
  if (hasDifferentials(this.eq)) { const r = integrateDifferentials(this.eq); if (!isErr(r)) return this.play([r], () => this.finishCalculus()); }
  const k = odeKind(asPrime(this.eq), slopeVar(this.eq));
  if (k === 'second') return this.addWork(generalSolution(asPrime(this.eq), slopeVar(this.eq)), 'general solution (with a particular solution when the right side isn’t 0), checked in the equation');
  if (k === 'separable') { const r = separate(asPrime(this.eq), slopeVar(this.eq)); if (isErr(r)) return this.refuse(r.error); return this.play([r], () => this.finishCalculus()); }
  const s = linearSteps(asPrime(this.eq), slopeVar(this.eq));
  if (!Array.isArray(s)) return this.refuse(s.error);
  this.play(s, () => this.finishCalculus());
}

/** a vector equation: one equation for each entry, side by side on the shelf */
export function splitComponents(this: App) {
  const c = components(this.eq);
  if (isErr(c.first)) return this.refuse(c.first.error);
  this.split(undefined, { first: c.first, rest: c.rest, why: 'one equation for each entry' });
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
    if (!isErr(components(this.eq).first)) return this.splitComponents();
    const rel = relOf(this.eq);
    if (rel === 'expr' || rel === 'def') {
      // the tidiest of simplified and expanded: 1/(x + 1)², not 1/(x² + 2x + 1); never a longer expansion
      const len = (e: Eq) => toText(e).length;
      const f = formsFor(this.eq, null).filter(x => x.name === 'simplified' || x.name === 'expanded').sort((a, b) => len(a.eq) - len(b.eq))[0];
      if (f && !(f.name === 'expanded' && len(f.eq) > len(this.eq))) return this.apply(f, 1.15);
      const t = tidy(this.eq);
      if (t && key(t.eq) !== key(this.eq)) this.applyTidy({ ...t, auto: true, label: 'simplify' }, 1.2);
      return;
    }
    // differentiated both sides: solve for the y′ that appeared
    const primed = symbols(this.eq).find(w => w.endsWith('′'));
    if (primed) return this.solveFor(primed);
    // a differential equation, integrated: solve for the function
    const fnOf = symbols(this.steps[0].eq).find(w => /[′″]$/.test(w))?.slice(0, -1) ?? letters(this.steps[0].eq)?.y;
    if (fnOf && symbols(this.eq).includes(fnOf)) return this.solveFor(fnOf);
    this.solveKey();
  };
  if (!steps.length) return then();
  this.play(steps as MoveOk[], then);
}
