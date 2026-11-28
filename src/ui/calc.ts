// The calculus hub (C): derivatives a rule at a time, limits, both sides, critical points.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { find, relOf, key, Eq, Node, Sum, symbols, walk, int, num, lim, cloneFresh, eq as mkEq, grad, fieldOp, findPath, replace } from '../engine/ast';
import { toText } from '../engine/print';
import { parseExpr } from '../engine/parse';
import { odeKind, separate, linearSteps, generalSolution } from '../engine/ode';
import { isErr, Checked, CheckedResult, checked } from '../engine/moves';
import { expandAll } from '../engine/rewrite';
import { simplify, newHints } from '../engine/simplify';
import { frac } from '../engine/ast';
import { formsFor } from '../engine/forms';
import { asPrime, hasDifferentials, integrateDifferentials, toDifferentials, letters, slopeVar } from '../engine/leibniz';
import { tidy } from '../engine/isolate';
import { derivStep, plugIn, lhopital, expLog, asQuotient, divideHighest, conjugateLim, finishCalc, hasCalc, calcVar, derivativeOf, criticalOf, bothSides, definitionForm, calcVars, partialOf, gradStep, dotStep, gradientZero, lagrange, components } from '../engine/calcmoves';
import { intStep, uSub, uCandidate, byParts, plugBounds, ratioTest, taylor } from '../engine/integrate';
import { bothVar, differentialsBoth, integrateBoth } from '../engine/general';
import { knownSum, sumForms } from '../engine/sums';
import { writeOutDots, moreTerms, fewerTerms, foldBack, crossOut, foldTerms } from '../engine/series';
import { ms } from './prefs';
import { sound } from './sound';
import * as sheet from './sheet';
import { here } from './tree';
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
  // lead: what C opens on (the piece in progress, or the first thing to do with this one).
  // A shortcut is a chain of the general moves (it plays each one into the tree); the rest are
  // single facts: one rule, definition or theorem, where you aimed.
  const add = (group: string, t: Omit<Tech, 'group'>) => out.push({ ...t, group });
  const isFn = rel === 'expr' || rel === 'def';
  const isEq = rel === '=' || rel === 'def';
  const vs = isFn ? calcVars(eq) : [];
  const multi = vs.length >= 2 && !hasCalc(eq);
  const field = rel === 'expr' && eq.lhs.k === 'vec' && !hasCalc(eq);
  const fresh = isFn && !hasCalc(eq) && !!v && !multi && !field;
  const diffs = hasDifferentials(eq);
  const slopes = !!letters(eq) && !diffs;
  // dy/dx and dy = … dx are read as y′ for choosing a method
  const ode = hasCalc(eq) ? null : odeKind(asPrime(eq), slopeVar(eq));
  const bv = bothVar(eq, this.sel);

  // Derivatives
  if (has(eq, 'deriv')) {
    const r = derivStep(eq, this.sel);
    add('Derivatives', { lead: true, key: 'd', label: isErr(r) ? 'next rule' : r.label, ok: !isErr(r), move: r, run: () => this.apply(derivStep(this.eq, this.sel), 1.1) });
    const def = definitionForm(eq, this.sel);
    add('Derivatives', { key: 'h', label: 'the definition (h → 0)', ok: !!def, run: () => { const d = definitionForm(this.eq, this.sel); if (d) this.apply(d, 1.15); } });
  } else if (multi) {
    const pv = aimed?.k === 'sym' && vs.includes(aimed.name) ? aimed.name : vs[0];
    add('Several variables', { lead: true, key: 'd', label: `∂/∂${pv}${aimed?.k === 'sym' ? '' : ' (aim at a letter for another)'}`, ok: true, makes: () => partialOf(eq, pv), run: () => this.addWork(partialOf(this.eq, pv), `partial derivative in ${pv}`) });
  } else if (fresh) {
    add('Derivatives', { lead: true, key: 'd', label: `derivative d/d${v}`, ok: true, makes: () => derivativeOf(eq, v!), run: () => this.addWork(derivativeOf(this.eq, v!), 'derivative') });
  } else if (isEq && !field && !diffs) {
    const r = bv ? bothSides(eq, bv) : { error: '' };
    add('Derivatives', { key: 'd', label: `d/d${bv ?? 'x'} both sides`, ok: !isErr(r), move: r, run: () => this.apply(bothSides(this.eq, bothVar(this.eq, this.sel)!), 1.1) });
  }
  // the differentials of both sides: u = x² gives du = 2x dx; y′ = f gives dy = f dx
  if (isEq && !diffs && !hasCalc(eq)) {
    const r = slopes ? toDifferentials(eq) : differentialsBoth(eq);
    add('Derivatives', { key: 'k', label: slopes ? 'as differentials: dy = … dx' : 'differentials of both sides', ok: !isErr(r), move: r, run: () => (slopes ? this.apply(toDifferentials(this.eq), 1.1) : this.differentialsKey()) });
  }
  if (fresh) add('Derivatives', { key: 'm', label: 'critical points (f′ = 0)', shortcut: true, ok: true, run: () => this.addWork(criticalOf(this.eq, v!), 'critical points') });

  // Limits
  if (has(eq, 'lim')) {
    const p = plugIn(eq, this.sel), l = lhopital(eq, this.sel);
    add('Limits', { lead: true, key: 'p', label: 'plug in', ok: !isErr(p), why: isErr(p) ? p.error : undefined, move: p, run: () => this.apply(plugIn(this.eq, this.sel), 1.1) });
    add('Limits', { key: 'l', label: "L'Hôpital", ok: !isErr(l), why: isErr(l) ? l.error : undefined, move: l, run: () => this.apply(lhopital(this.eq, this.sel), 1.1) });
    // the other forms made ready for L'Hôpital: 0·∞ as a fraction, 1^∞ (0⁰, ∞⁰) with the power brought down
    const q = asQuotient(eq, this.sel), x = expLog(eq, this.sel), hp = divideHighest(eq, this.sel), cj = conjugateLim(eq, this.sel);
    add('Limits', { key: 'h', label: isErr(hp) ? '÷ highest power' : hp.label, ok: !isErr(hp), why: isErr(hp) ? hp.error : undefined, move: hp, run: () => this.apply(divideHighest(this.eq, this.sel), 1.1) });
    add('Limits', { key: 'j', label: 'times the conjugate', ok: !isErr(cj), why: isErr(cj) ? cj.error : undefined, move: cj, run: () => this.apply(conjugateLim(this.eq, this.sel), 1.1) });
    add('Limits', { key: 'q', label: '0·∞ as a fraction', ok: !isErr(q), why: isErr(q) ? q.error : undefined, move: q, run: () => this.apply(asQuotient(this.eq, this.sel), 1.1) });
    add('Limits', { key: 'g', label: 'power down: e^(g ln f)', ok: !isErr(x), why: isErr(x) ? x.error : undefined, move: x, run: () => this.apply(expLog(this.eq, this.sel), 1.1) });
  } else if (fresh) {
    add('Limits', { key: 'l', label: `limit as ${v} →`, ok: true, run: () => {}, ask: { prompt: `${v} →`, hint: 'a number, or inf', run: text => this.addWork(limitOf(this.eq, v!, text), 'limit') } });
  }

  // Integrals
  if (has(eq, 'int')) {
    const r = intStep(eq, this.sel), u = uCandidate(eq, this.sel), b = byParts(eq, this.sel);
    add('Integrals', { lead: true, key: 'i', label: isErr(r) ? 'integrate' : r.label, ok: !isErr(r), why: isErr(r) ? r.error : undefined, move: r, run: () => this.apply(intStep(this.eq, this.sel), 1.1) });
    add('Integrals', { key: 'b', label: isErr(b) ? 'by parts' : b.label, ok: !isErr(b), why: isErr(b) ? b.error : undefined, move: b, run: () => this.apply(byParts(this.eq, this.sel), 1.1) });
    // by parts with each other factor as u: you choose, the card shows where each one leads (it was Tab's)
    const aimed = this.sel && this.sel !== 'eq' ? find(eq, this.sel) : null;
    let I: Node | null = aimed?.k === 'int' ? aimed : null;
    if (!I) walk(eq, n => { if (!I && n.k === 'int') I = n; });
    const T = I as Extract<Node, { k: 'int' }> | null;
    if (T && T.arg.k === 'mul') for (const f of T.arg.factors) {
      const o = byParts(eq, f.id);
      if (!isErr(o) && (isErr(b) || key(o.eq) !== key(b.eq))) { const id = f.id; add('Integrals', { key: '', label: o.label, ok: true, move: o, run: () => this.apply(byParts(this.eq, id), 1.1) }); }
    }
    add('Integrals', { key: 'u', label: u ? `u-substitution: u = ${toText(u)}` : 'u-substitution', shortcut: true, ok: !!u, why: u ? undefined : (() => { const m = uSub(eq, this.sel).move; return isErr(m) ? m.error : undefined; })(), run: () => this.uSubShortcut() });
  } else if (isEq && !diffs && bv) {
    const r = integrateBoth(eq, bv);
    add('Integrals', { key: 'i', label: `∫ both sides d${bv}`, ok: !isErr(r), why: isErr(r) ? r.error : undefined, move: r, run: () => this.integrateBothKey() });
  } else if (fresh || multi) {
    const iv = fresh ? v! : (aimed?.k === 'sym' && vs.includes(aimed.name) ? aimed.name : vs[0]);
    add('Integrals', { key: 'i', label: `antiderivative ∫ d${iv}`, ok: true, makes: () => eqOf(int(iv, cloneFresh(body(eq)))), run: () => this.addWork(eqOf(int(iv, cloneFresh(body(this.eq)))), 'antiderivative') });
    if (fresh) add('Integrals', { key: 'a', label: 'definite integral (area)', ok: true, run: () => {}, ask: { prompt: 'from, to', hint: 'two numbers, like 0, 1', run: text => this.addWork(definiteOf(this.eq, v!, text), 'definite integral') } });
  }
  if (has(eq, 'at')) {
    const p = plugBounds(eq, this.sel);
    add('Integrals', { lead: true, key: 'p', label: 'plug in the bounds', ok: !isErr(p), move: p, run: () => this.apply(plugBounds(this.eq, this.sel), 1.1) });
  }

  // Series: everything Tab has for a Σ or ∏, and the written-out form with ⋯
  const sel = this.sel;
  const wo = writeOutDots(eq, sel), cross = crossOut(eq, sel);
  const writtenHere = [moreTerms(eq, sel, 'start'), moreTerms(eq, sel, 'end')].some(r => !isErr(r)) || !isErr(fewerTerms(eq, sel, 'start'));
  if (has(eq, 'sum') || !isErr(cross) || !isErr(foldTerms(eq, sel))) {
    const k = knownSum(eq, sel);
    const S0 = sumAt(eq, sel);
    if (!isErr(wo) && S0 && !S0.dots) add('Series', { lead: true, key: 'x', label: S0.prod ? 'write the product out' : 'write the sum out', ok: true, move: wo, run: () => this.apply(writeOutDots(this.eq, this.sel), 1.1) });
    if (writtenHere) {
      for (const [key, end] of [['[', 'start'], [']', 'end']] as const) {
        const r = moreTerms(eq, sel, end);
        add('Series', { key, label: `one more term at the ${end}`, ok: !isErr(r), why: isErr(r) ? r.error : undefined, move: r, run: () => this.apply(moreTerms(this.eq, this.sel, end), 1.05) });
      }
      for (const [key, end] of [['{', 'start'], ['}', 'end']] as const) {
        const r = fewerTerms(eq, sel, end);
        if (!isErr(r)) add('Series', { key, label: `one fewer term at the ${end}`, ok: true, move: r, run: () => this.apply(fewerTerms(this.eq, this.sel, end), 0.95) });
      }
    }
    const fb = foldBack(eq, sel);
    if (!isErr(fb)) add('Series', { lead: writtenHere && isErr(cross), key: 'b', label: fb.label, ok: true, move: fb, run: () => this.apply(foldBack(this.eq, this.sel), 1.05) });
    add('Series', { lead: !isErr(cross), key: 'o', label: 'cross out what cancels', ok: !isErr(cross), why: isErr(cross) ? cross.error : undefined, move: cross, run: () => this.apply(crossOut(this.eq, this.sel), 1.1) });
    add('Series', { lead: isErr(wo) && isErr(cross), key: 'k', label: isErr(k) ? 'known sum' : k.label, ok: !isErr(k), why: isErr(k) ? k.error : undefined, move: k, run: () => this.apply(knownSum(this.eq, this.sel), 1.1) });
    // the general rewrites (Tab has them too): split, constants out, terms out, shift, as a limit, logs
    const SK: Record<string, string> = { 'split the sum': 's', 'split the product': 's', 'constant out': 'n', 'first term out': 'f', 'first factor out': 'f', 'last term out': 'l', 'last factor out': 'l', 'as a limit of partial sums': 'm', 'one log of a product': 'g', 'a sum of logs': 'g', 'one sum': 'j' };
    const host = S0 && !S0.dots ? S0 : null;
    if (host) for (const f of sumForms(host)) {
      const key = SK[f.name] ?? (f.name.includes('+') ? 'h' : f.name.startsWith('shift') ? 'H' : '');
      if (!key) continue;
      const mk = (e2: Eq, sel2: string | null): CheckedResult => { const S = sumAt(e2, sel2); const g = S && sumForms(S).find(x => x.name === f.name); return S && g ? checked(e2, { eq: replace(e2, S.id, g.node), label: g.name, hints: newHints(), factor: () => 1, select: g.node.id, rule: g.name, conditions: g.conditions }) : { error: 'No sum here.' }; };
      const r = mk(eq, sel);
      add('Series', { key, label: f.name, ok: !isErr(r), move: r, run: () => this.apply(mk(this.eq, this.sel), 1.05) });
    }
    if (has(eq, 'sum')) add('Series', { key: 'r', label: 'ratio test', ok: true, run: () => { this.say(ratioTest(this.eq, this.sel)); this.tour.check(); } });
  }
  if (fresh) add('Series', { key: 't', label: 'Taylor polynomial', shortcut: true, ok: true, run: () => { const t = taylor(this.eq, v!); if ('error' in t) return this.refuse(t.error); this.addWork(t.poly, `Taylor polynomial of degree 5 about ${v} = ${t.about}`); } });

  // Several variables
  if (multi) {
    add('Several variables', { key: 'n', label: 'gradient ∇', ok: true, makes: () => mkEq(grad(cloneFresh(body(eq)), vs), num(0), 'expr'), run: () => this.addWork(mkEq(grad(cloneFresh(body(this.eq)), vs), num(0), 'expr'), 'gradient') });
    add('Several variables', { key: 'm', label: 'critical points (∇ = 0)', shortcut: true, ok: true, run: () => this.addWork(gradientZero(this.eq), 'critical points: every partial is 0') });
    const j = this.slots.findIndex((_, i) => i !== this.cur && !('error' in lagrange(eq, this.eqOf(i))));
    add('Several variables', { key: 'k', label: j >= 0 ? `Lagrange condition, with (${j + 1})` : 'Lagrange (type a constraint first)', ok: j >= 0, run: () => this.addWork(lagrange(this.eq, this.eqOf(j)), `Lagrange condition with equation ${j + 1}`) });
  }
  if (has(eq, 'grad')) add('Several variables', { lead: true, key: 'n', label: 'work out ∇', ok: true, run: () => this.apply(gradStep(this.eq, this.sel), 1.1) });
  if (hasDot(eq)) add('Several variables', { lead: true, key: 'o', label: 'dot product', ok: true, run: () => this.apply(dotStep(this.eq, this.sel), 1.1) });
  if (!isErr(components(eq).first)) add('Several variables', { lead: true, key: 's', label: 'split into components', ok: true, run: () => this.splitComponents() });

  // Differential equations
  if (diffs && !hasCalc(eq)) {
    const r = integrateDifferentials(eq);
    add('Differential equations', { lead: true, key: 'i', label: 'integrate both sides', ok: !isErr(r), move: r, run: () => this.apply(integrateDifferentials(this.eq), 1.1) });
  }
  if (ode && ode !== 'second') {
    add('Differential equations', { lead: true, key: 's', label: 'separate the variables', shortcut: true, ok: ode === 'separable', run: () => this.separateShortcut() });
    add('Differential equations', { lead: true, key: 'f', label: 'integrating factor', shortcut: true, ok: Array.isArray(linearSteps(asPrime(eq), slopeVar(eq))), run: () => this.integratingFactor() });
  } else if (ode === 'second') {
    add('Differential equations', { lead: true, key: 'r', label: 'try y = e^(rx)', shortcut: true, ok: true, run: () => this.characteristicShortcut() });
    add('Differential equations', { key: 'g', label: 'general solution (a theorem)', ok: true, run: () => this.addWork(generalSolution(asPrime(this.eq), slopeVar(this.eq)), 'general solution, checked in the equation') });
  }

  // Vector fields
  if (field && eq.lhs.k === 'vec') {
    const F = eq.lhs;
    add('Vector fields', { lead: true, key: 'v', label: 'divergence ∇·', ok: F.items.length >= 2, makes: () => eqOf(fieldOp('div', cloneFresh(F))), run: () => this.addWork(eqOf(fieldOp('div', cloneFresh(F))), 'divergence') });
    add('Vector fields', { key: 'w', label: 'curl ∇×', ok: F.items.length === 2 || F.items.length === 3, makes: () => eqOf(fieldOp('curl', cloneFresh(F))), run: () => this.addWork(eqOf(fieldOp('curl', cloneFresh(F))), 'curl') });
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

/** a vector equation: one equation for each entry, side by side in the tree */
export function splitComponents(this: App) {
  const c = components(this.eq);
  if (isErr(c.first)) return this.refuse(c.first.error);
  this.split(undefined, { first: c.first, rest: c.rest, why: 'one equation for each entry' });
}

/** letters named from a piece (u = x²), to put back once the work in u is done */
export function substitutions(this: App): Record<string, Node> {
  return this.namedLetters();
}

/** a new equation to work on, next to this one */
export function addWork(this: App, e: Eq | { error: string }, why: string) {
  if ('error' in e) { this.refuse(e.error); return; }
  const problem = sheet.place(this, e, true, here(this.slot!));
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
  let tidied = false;
  const then = () => {
    if (stuck) return this.say(stuck, true);
    if (hasCalc(this.eq)) return;
    // 2(sin(x²)/2) left by a substitution reads sin(x²) before anything else
    const t0 = tidy(this.eq);
    if (!tidied && t0 && key(t0.eq) !== key(this.eq) && relOf(this.eq) === '=') { tidied = true; this.applyTidy({ ...t0, auto: true, label: 'simplify' }, 1.2); return this.later(ms(420), then); }
    if (!isErr(components(this.eq).first)) return this.splitComponents();
    const rel = relOf(this.eq);
    if (rel === 'expr' || rel === 'def') {
      // the tidiest of simplified and expanded: 1/(x + 1)², not 1/(x² + 2x + 1); never a longer expansion
      const len = (e: Eq) => toText(e).length;
      const cands: Checked[] = formsFor(this.eq, null).filter(x => x.name === 'simplified' || x.name === 'expanded');
      // a quotient rule's answer: multiply out the top only, so e^x/(1 + e^x)² keeps its bottom
      const side = rel === 'def' ? 'rhs' : 'lhs', L = this.eq[side];
      if (L.k === 'frac') {
        const h = newHints();
        let T = simplify(frac(expandAll(L.num, h), L.den, L.id), h);
        // −x² + 1 on top reads 1 − x²
        if (T.k === 'frac' && T.num.k === 'add' && T.num.terms[0].k === 'neg') {
          const ts = T.num.terms, i = ts.findIndex(t => t.k === 'num' && t.v > 0);
          if (i > 0) T = { ...T, num: { ...T.num, terms: [ts[i], ...ts.filter((_, j) => j !== i)] } };
        }
        const top = checked(this.eq, { eq: side === 'lhs' ? mkEq(T, this.eq.rhs, this.eq.rel) : mkEq(this.eq.lhs, T, this.eq.rel), label: 'simplified', hints: h, factor: () => 1, select: null });
        if (!isErr(top) && key(top.eq) !== key(this.eq)) cands.push(top);
      }
      const f = cands.sort((a, b) => len(a.eq) - len(b.eq))[0] as (Checked & { name?: string }) | undefined;
      if (f && !(f.name === 'expanded' && len(f.eq) > len(this.eq))) return this.apply(f, 1.15);
      const t = tidy(this.eq);
      if (t && key(t.eq) !== key(this.eq)) this.applyTidy({ ...t, auto: true, label: 'simplify' }, 1.2);
      return;
    }
    // already one function on its own (I′(t) = 1/(t + 1)): that is the answer
    const L = this.eq.lhs;
    if (L.k === 'call') { let again = false; walk(this.eq.rhs, n => { if (n.k === 'call' && n.name === L.name) again = true; }); if (!again) return; }
    // differentiated both sides: solve for the y′ that appeared
    const primed = symbols(this.eq).find(w => w.endsWith('′'));
    if (primed) return this.solveFor(primed);
    // a differential equation, integrated: solve for the function
    const fnOf = symbols(this.steps[0].eq).find(w => /[′″]$/.test(w))?.slice(0, -1) ?? letters(this.steps[0].eq)?.y;
    if (fnOf && symbols(this.eq).includes(fnOf)) return this.solveFor(fnOf);
    this.solveKey();
  };
  if (!steps.length) return then();
  // a u-substitution is played as the general moves it is made of (name u, its differentials,
  // sub them in), each in the tree, and then e carries on in u
  const iu = steps.findIndex(st => st.rule === 'u-substitution');
  if (iu >= 0 && this.slots.length < 8) {
    const go = () => { if (!this.uSubShortcut(() => this.finishCalculus())) this.play(steps.slice(iu) as Checked[], then); };
    if (iu === 0) return go();
    return this.play(steps.slice(0, iu) as Checked[], go);
  }
  this.play(steps as Checked[], then);
}


/** the Σ or ∏ the aim is on or in (else the first one) */
function sumAt(e: Eq, sel: string | null): Sum | null {
  const path = sel && sel !== 'eq' ? findPath(e, sel) : null;
  let S = path ? ([...path].reverse().find(n => n.k === 'sum') as Sum | undefined) : undefined;
  if (!S) walk(e, n => { if (!S && n.k === 'sum' && !n.dots) S = n; });
  return S ?? null;
}
