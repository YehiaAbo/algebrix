// The general moves in the app: b names the aimed piece, p puts a value into a statement that
// holds for every value, hold Tab + n subs a piece in from equation n, and C does calculus to both
// sides. Each is one step in the tree; the shortcuts in C are chains of these.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { find, symbols, LETS, isDiff, Node, key, replace } from '../engine/ast';
import { parseExpr } from '../engine/parse';
import { divideOut, polyTarget, factorGuess } from '../engine/polytools';
import { newHints } from '../engine/simplify';
import { toText } from '../engine/print';
import { isErr, MoveOk, MoveResult, checked } from '../engine/moves';
import { nameIt, subIn, putValue, valueVar, holdsForEvery, integrateBoth, differentialsBoth, bothVar, Named, separateChain, characteristicChain, brief, timesOne } from '../engine/general';
import { uCandidate, uSub } from '../engine/integrate';
import { letters, asPrime } from '../engine/leibniz';
import { compareCoefficients } from '../engine/techniques';
import { ms } from './prefs';
import * as sheet from './sheet';
import { sound } from './sound';
import { here } from './tree';
import { $ } from './shared';
import type { App } from './app';


/** the letter b offers first: u for a piece, t for a number (a parameter), the next free one after */
function freshLetter(taken: Set<string>, constant: boolean): string {
  for (const c of constant ? ['t', 's', 'a', 'k'] : ['u', 'w', 'v', 's', 'z']) if (!taken.has(c)) return c;
  return 'q';
}

/** every letter used in any equation, so a new name never collides */
export function lettersInUse(this: App): string[] {
  return [...new Set(this.slots.flatMap((_, j) => symbols(this.eqOf(j))))];
}

/** b: open the box to name the aimed piece */
export function openName(this: App) {
  const P = this.sel && this.sel !== 'eq' ? find(this.eq, this.sel) : null;
  if (!P || P.k === 'eq') return this.refuse('Aim at the piece to name first (arrows, or Space), then press b.');
  if (this.slots.length >= 9) return this.refuse('Nine equations is the limit for now.');
  this.opKind = 'name';
  this.closeHub(false);
  this.setMode('op');
  const input = $<HTMLInputElement>('op-input');
  input.value = freshLetter(new Set(this.lettersInUse()), symbols(P).length === 0);
  $('op').hidden = false;
  $('op').classList.add('naming');
  this.place($('op'));
  input.focus();
  input.select();
  this.onOpType();
  this.renderHints();
}

export function nameResult(this: App): Named | { error: string } {
  const text = $<HTMLInputElement>('op-input').value;
  const others = this.slots.flatMap((_, j) => (j === this.cur ? [] : symbols(this.eqOf(j))));
  return nameIt(this.eq, this.sel, text, others);
}

/** Enter in the b box: the step here, and the name as an equation of its own, linked to it */
export function commitName(this: App) {
  const r = this.nameResult();
  if ('error' in r) return this.refuse(r.error);
  this.closeOp();
  this.addName(r);
}

/** a name taken: the step in this equation, then the name as an equation of its own beside it */
export function addName(this: App, r: Named) {
  // the equation itself becomes the definition (I = ∫ … turned into I(t) = ∫ …)
  if (r.inPlace) {
    if (!this.apply(r.step, 1.05)) return;
    this.syncDefs();
    this.say(`${r.step.label}: ${brief(r.def.lhs)} = ${brief(r.def.rhs)}. C d differentiates both sides; p puts in a value; ${toText(r.def.lhs).replace(/\(.*/, '')}(…) works in any equation.`);
    return;
  }
  // a bound letter (x in ∫₀¹ … dx) stays as it is here: only the name is new
  if (key(r.step.eq) !== key(this.eq) && !this.apply(r.step, 1.05)) return;
  const kind = r.def.rel === 'def' ? 'fn' : r.letter ? 'letter' : r.def.lhs.k === 'sym' && symbols(r.def.rhs).length === 0 ? 'param' : 'expr';
  this.slots.push({ steps: [{ eq: r.def, label: 'name', conditions: [] }], at: 0, sel: null, from: here(this.slot!), named: kind });
  sound.commit();
  this.renderAll(null);
  this.save();
  const n = this.slots.length;
  const what = `${brief(r.def.lhs)} = ${brief(r.def.rhs)}`;
  this.say(kind === 'param'
    ? `Equation ${n}: ${what}, the value you want in the end. This one now holds for every ${toText(r.def.lhs)}.`
    : kind === 'fn' ? `Equation ${n}: ${what}. C d differentiates both sides; p puts in a value.`
    : `Equation ${n}: ${what}. In it, C k takes the differentials (for d${kind === 'letter' ? r.letter : toText(r.def.lhs)}); hold Tab + ${n} subs it in here.`);
}

/** p: put a value into a statement that holds for every value, as an equation of its own */
export function openValue(this: App) {
  const v = valueVar(this.eq, this.sel);
  if (!v) return this.refuse('Aim at the letter to put a value in for, then press p.');
  if (!holdsForEvery(this.eq, v)) return this.refuse(`This says which ${v} works, not something true for every ${v}, so a value can't just be put in. To check a value, press e.`);
  this.opKind = 'value';
  this.valueOf = v;
  this.closeHub(false);
  this.setMode('op');
  const input = $<HTMLInputElement>('op-input');
  input.value = '0';
  $('op').hidden = false;
  this.place($('op'));
  input.focus();
  input.select();
  this.onOpType();
  this.renderHints();
}

export function commitValue(this: App) {
  const text = $<HTMLInputElement>('op-input').value;
  const r = putValue(this.eq, this.valueOf!, text);
  if ('error' in r) return this.refuse(r.error);
  this.closeOp();
  if (this.slots.length >= 9) return this.refuse('Nine equations is the limit for now.');
  this.slots.push({ steps: [{ eq: r, label: `at ${this.valueOf} = ${text.trim()}`, conditions: [], rule: 'put in a value', dir: '⇒' }], at: 0, sel: null, from: here(this.slot!) });
  this.cur = this.slots.length - 1;
  sound.commit();
  this.sel = null;
  this.stage.clear();
  this.renderAll(null);
  this.entrance();
  this.save();
  this.say(`Equation ${this.cur + 1}: at ${this.valueOf} = ${text.trim()}. s tidies it; Tab u unfolds a function.`);
}

/** Tab + q on a polynomial: take out a factor you type, P = (x − 2)·Q + R */
export function openDivide(this: App) {
  const id = polyTarget(this.eq, this.sel);
  if (!id) return this.refuse('Aim at a sum, like 6x + 9 or x³ − 2x − 4, then Tab + q takes out a factor you type.');
  this.opKind = 'divide';
  this.divideAt = id;
  this.closeHub(false);
  this.setMode('op');
  const input = $<HTMLInputElement>('op-input');
  input.value = factorGuess(find(this.eq, id)!);
  $('op').hidden = false;
  this.place($('op'));
  input.focus();
  input.select();
  this.onOpType();
  this.renderHints();
}

export function divideResult(this: App): MoveResult {
  const text = $<HTMLInputElement>('op-input').value.trim();
  const target = this.divideAt ? find(this.eq, this.divideAt) : null;
  if (!target) return { error: 'Aim at a polynomial first.' };
  let d: Node;
  try { d = parseExpr(text); } catch (e) { return { error: (e as Error).message }; }
  const r = divideOut(target, d);
  if ('error' in r) return r;
  // what is left over says whether the factor was one: 0 left means its root is a root
  const left = r.k === 'add' ? toText(r.terms[r.terms.length - 1]) : null;
  return checked(this.eq, { eq: replace(this.eq, target.id, r), label: `take out ${toText(d)}${left ? `, ${left} left over` : ''}`, rule: 'take out a factor', hints: newHints(), factor: () => 1, select: r.id });
}

export function commitDivide(this: App) {
  const r = this.divideResult();
  if (isErr(r)) return this.refuse(r.error);
  this.closeOp();
  this.apply(r, 1.05);
}

/** Tab + m: multiply the aimed piece by A/A, A typed (e⁻ˣ, √x − 1, the conjugate…) */
export function openOne(this: App) {
  if (!this.sel || this.sel === 'eq') return this.refuse('Aim at the piece to multiply by 1 (a fraction, usually), then Tab + m.');
  this.opKind = 'one';
  this.oneAt = this.sel;
  this.closeHub(false);
  this.setMode('op');
  const input = $<HTMLInputElement>('op-input');
  input.value = '';
  $('op').hidden = false;
  this.place($('op'));
  input.focus();
  this.onOpType();
  this.renderHints();
}

export function oneResult(this: App): MoveResult {
  const text = $<HTMLInputElement>('op-input').value.trim();
  if (!text) return { error: 'Type what goes on top and below: e^(-x), sqrt(x) - 1, …' };
  return timesOne(this.eq, this.oneAt, text);
}

export function commitOne(this: App) {
  const r = this.oneResult();
  if (isErr(r)) return this.refuse(r.error);
  this.closeOp();
  this.apply(r, 1.05);
}

/** what the box shows while you type, for b, p, Tab q and Tab m */
export function onNameType(this: App) {
  const note = $('op-note'), symEl = $('op-sym');
  if (this.opKind === 'one') {
    const r = this.oneResult();
    symEl.textContent = '× 1 as';
    $('op').classList.toggle('bad', isErr(r));
    note.textContent = isErr(r) ? r.error : `${r.label} · Enter`;
    this.peek = isErr(r) ? null : r.eq;
  } else if (this.opKind === 'divide') {
    const r = this.divideResult();
    symEl.textContent = 'take out';
    $('op').classList.toggle('bad', isErr(r));
    note.textContent = isErr(r) ? r.error : r.label.includes('left over') ? `${r.label.split(', ')[1]}: not a factor · Enter` : 'a factor, nothing left over · Enter';
    this.peek = isErr(r) ? null : r.eq;
  } else if (this.opKind === 'name') {
    const r = this.nameResult();
    symEl.textContent = 'name it';
    $('op').classList.toggle('bad', 'error' in r);
    note.textContent = 'error' in r ? r.error : `new equation: ${brief(r.def.lhs)} = ${brief(r.def.rhs)} · Enter`;
    this.peek = 'error' in r ? null : r.step.eq;
  } else {
    const text = $<HTMLInputElement>('op-input').value;
    const r = text.trim() ? putValue(this.eq, this.valueOf!, text) : { error: 'Type a value.' };
    symEl.textContent = `${this.valueOf} =`;
    $('op').classList.toggle('bad', 'error' in r);
    note.textContent = 'error' in r ? r.error : `new equation: ${toText(r)} · Enter`;
    this.peek = null;
  }
  this.renderMain({ quick: true });
}

/* ---------- sub in ---------- */

/** hold Tab + n: a piece of this equation replaced using equation n */
export function substituteFrom(this: App, j: number) {
  if (sheet.areCases(this, this.cur, j)) return this.refuse(`Equation ${j + 1} is another case of the same split: one or the other holds, not both, so it can't go into this one.`);
  const r = subIn(this.eq, this.eqOf(j), this.sel, `Equation ${j + 1}`);
  if (!isErr(r)) this.flyFrom(j);
  this.applyTidy(r, 1.2);
}

/* ---------- calculus to both sides ---------- */

/** C + i on an equation with no integral to work out: ∫ … dv of both sides */
export function integrateBothKey(this: App) {
  const v = bothVar(this.eq, this.sel);
  if (!v) return this.refuse('Aim at the letter to integrate by.');
  this.apply(integrateBoth(this.eq, v), 1.1);
}

/** C + k: take the differential of both sides (u = x² gives du = 2x dx) */
export function differentialsKey(this: App) {
  this.apply(differentialsBoth(this.eq), 1.1);
}

/** named letters in force, for the safety net and for putting them back at the end:
 *  u → x² (a letter named from a piece); x → sin θ (a letter set to an expression) */
export function syncLets(this: App) {
  LETS.clear();
  this.slots.forEach(s => {
    if (s.named !== 'letter' && s.named !== 'expr') return;
    const e = s.steps[0].eq;
    if (e.lhs.k === 'sym' && !isDiff(e.lhs.name)) LETS.set(e.lhs.name, e.rhs);
  });
}

/** the letters named from a piece (u = x²), to put back once the work in u is done */
export function namedLetters(this: App): Record<string, Node> {
  const out: Record<string, Node> = {};
  this.slots.forEach(s => { if (s.named === 'letter' && s.steps[0].eq.lhs.k === 'sym') out[s.steps[0].eq.lhs.name] = s.steps[0].eq.rhs; });
  return out;
}


/** a step in another equation, without going there (a shortcut working on two equations) */
export function stepIn(this: App, j: number, r: MoveOk) {
  const keep = this.cur;
  this.cur = j;
  sheet.addStep(this, r, {});
  this.cur = keep;
  sound.move(1.1);
  this.renderTree();
  this.save();
}

/** C + u, the shortcut: name the inside u, take the differentials of u = g, and sub them in.
 *  Three general steps, each in the tree; e then integrates in u and puts x back. */
export function uSubShortcut(this: App, then?: () => void): boolean {
  const g = uCandidate(this.eq, then ? null : this.sel);
  if (!g) { if (then) return false; const r = uSub(this.eq, this.sel).move; this.refuse(isErr(r) ? r.error : 'No inside function whose derivative is also there.'); return false; }
  if (this.slots.length >= 9) { if (!then) this.refuse('Nine equations is the limit for now.'); return false; }
  const taken = new Set(this.lettersInUse());
  const letter = ['u', 'w', 's', 'v', 'z'].find(c => !taken.has(c)) ?? 'q';
  const n = nameIt(this.eq, g.id, letter, [...taken]);
  if ('error' in n) { if (!then) this.refuse(n.error); return false; }
  this.addName(n);
  const j = this.slots.length - 1;
  this.later(ms(560), () => {
    this.syncLets();
    const d = differentialsBoth(this.eqOf(j));
    if (isErr(d)) return this.refuse(d.error);
    this.stepIn(j, d);
    this.later(ms(560), () => {
      this.sel = null;
      this.substituteFrom(j);
      if (then) { this.say(`u-substitution, as three moves: name ${letter} = ${toText(n.def.rhs)}, its differentials, sub them in.`); this.later(ms(560), then); return; }
      this.say(`u-substitution, as three moves: name ${letter} = ${toText(n.def.rhs)}, its differentials, sub them in. Now C i integrates in ${letter}, and e puts ${symbols(n.def.rhs).join(', ')} back.`);
    });
  });
  return true;
}

/** C + s, the shortcut: in differentials, then everything in y on the left */
export function separateShortcut(this: App) {
  const L = letters(asPrime(this.eq));
  if (!L) return this.refuse('Separating needs a first-order equation with y′ in it.');
  const steps = separateChain(this.eq, L.y, L.x);
  if (!Array.isArray(steps)) return this.refuse(steps.error);
  this.play(steps, () => this.say('Separated. C i integrates both sides.'));
}

/** C + r, the shortcut: try y = e^(rx), work out the slopes, take e^(rx) out and divide it away */
export function characteristicShortcut(this: App) {
  const L = letters(asPrime(this.eq));
  if (!L) return this.refuse('Needs y″, y′ and y.');
  const steps = characteristicChain(this.eq, L.y);
  if (!Array.isArray(steps)) return this.refuse(steps.error);
  // the trial is a question of its own (when does e^(rx) solve it?), so it goes in a new equation
  // and the differential equation stays as it is
  const [trial, ...rest] = steps;
  const problem = sheet.place(this, trial.eq, true, here(this.slot!));
  if (problem) return this.refuse(problem);
  this.slot!.steps[0].label = trial.label;
  sound.commit();
  this.sel = null;
  this.stage.clear();
  this.renderAll(null);
  this.entrance();
  this.save();
  this.later(ms(420), () => this.play(rest, () => this.say(`Equation ${this.cur + 1}: when e^(rx) solves it. e solves for r; each root gives e^(rx), and C g on equation 1 writes the general solution.`)));
}


/** Tab + e: compare coefficients of v. The first equation is the step here; the others go
 *  beside it as equations of their own, ready for Tab + k (eliminate) or sub in */
export function compareKey(this: App, v: string) {
  const r = compareCoefficients(this.eq, v);
  if (isErr(r.first)) return this.refuse(r.first.error);
  if (this.slots.length + r.rest.length > 9) return this.refuse('Nine equations is the limit for now.');
  const from = here(this.slot!);
  if (!this.apply(r.first, 1.1)) return;
  r.rest.forEach(q => this.slots.push({ steps: [{ eq: q, label: `coefficients of ${v}`, conditions: [], rule: 'compare coefficients', dir: '⇒' }], at: 0, sel: null, from }));
  sound.commit();
  this.renderAll(null);
  this.save();
  const n = r.rest.length + 1;
  this.say(n === 1 ? `One power of ${v} to match: this equation.` : `${n} equations, one for each power of ${v}: this one and ${r.rest.map((_, i) => this.slots.length - r.rest.length + i + 1).join(', ')}. Tab + k eliminates with another.`);
}
