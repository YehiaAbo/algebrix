// Playthrough tutorials: a coach card that asks for one action at a time and moves on
// as soon as you've done it. Several short tours, picked from a menu (g). Your own
// equations are put aside and come back at the end.
import type { App, Slot } from './app';
import { find, relOf } from '../engine/ast';
import { isProved } from '../engine/goals';
import { solvedFor } from '../engine/moves';
import { prefs } from './prefs';
import { toText } from '../engine/print';
import { sound } from './sound';

interface TourStep {
  say: string;
  load?: string;
  setup?: (t: Tour) => void;
  done: (t: Tour) => boolean;
}

const lhs = (a: App) => toText(a.eq.lhs);
const rhs = (a: App) => toText(a.eq.rhs);
const aimed = (a: App) => { const n = a.sel && a.sel !== 'eq' ? find(a.eq, a.sel) : null; return n ? toText(n) : ''; };

interface TourDef { id: string; name: string; blurb: string; group?: string; steps: TourStep[] }

const text = (a: App) => toText(a.eq);
const solved = (a: App) => !!solvedFor(a.eq);
const allSolved = (a: App) => a.slots.every(s => !!solvedFor(s.steps[s.at].eq));
const kb = (...keys: string[]) => keys.map(k => `<kbd>${k}</kbd>`).join(' + ');
const tab = (key: string) => `hold ${kb('Tab')} and press ${kb(key)}`;
const Tab = (key: string) => `Hold ${kb('Tab')} and press ${kb(key)}`;
const C = (key: string) => `Hold ${kb('C')} and press ${kb(key)}`;
/** derivatives or limits still to work out */
const calcLeft = (a: App) => /d\/d|lim|∂|∇/.test(text(a));

export const TOURS: TourDef[] = [
  {
    id: 'basics', group: 'Getting started', name: 'The basics', blurb: 'Aim, move, simplify, undo. Start here.',
    steps: [
      { load: '3x + 7 = 22', say: 'Here’s an equation to solve. Press <kbd>→</kbd> to aim at a piece of it.', done: t => !!t.app.sel },
      { say: 'Walk with <kbd>←</kbd> <kbd>→</kbd> until the <b>7</b> is aimed. <kbd>↑</kbd> grows the aim, <kbd>↓</kbd> shrinks it.', done: t => aimed(t.app) === '7' },
      { say: 'Press <kbd>m</kbd> to move the 7 across the equals sign. It changes sign on its own.', done: t => lhs(t.app) === '3x' },
      { say: 'The dashed box is a simplification on offer. Nothing simplifies until you say so: press <kbd>s</kbd>.', done: t => rhs(t.app) === '15' },
      { say: 'Aim at the <b>3</b> (aim <b>3x</b>, then <kbd>↓</kbd> to get inside it) and press <kbd>m</kbd>. It leaves by dividing.', done: t => lhs(t.app) === 'x' },
      { say: 'One more <kbd>s</kbd> to finish.', done: t => text(t.app) === 'x = 5' },
      { say: 'Every step is kept. Press <kbd>u</kbd> to undo.', setup: t => { t.mark = t.app.at; }, done: t => t.app.at < t.mark },
      { say: 'And <kbd>r</kbd> to redo.', setup: t => { t.mark = t.app.at; }, done: t => t.app.at > t.mark },
      { say: 'You can’t break the algebra. Try it: press <kbd>/</kbd>, type <b>0</b>, then <kbd>Enter</kbd>.', setup: t => { t.refused = false; }, done: t => t.refused },
      { load: '4x - 8 = 12', say: 'It resisted, and the reason went to the bottom bar. Shortcut time: press <kbd>e</kbd> to solve in one go and watch every step play.', done: t => solved(t.app) },
    ],
  },
  {
    id: 'pick', name: 'Picking pieces', blurb: 'Grow a highlight, reorder terms, drag a box.',
    steps: [
      { load: '2x + 3 + 5 + y = 10', say: 'Aim at the <b>3</b> with the arrows.', done: t => aimed(t.app) === '3' },
      { say: 'Hold <kbd>Ctrl</kbd> and tap <kbd>→</kbd>: the highlight grows to the right. (<kbd>Ctrl</kbd> + <kbd>←</kbd> grows it left.)', done: t => aimed(t.app) === '3 + 5' },
      { say: '<b>3 + 5</b> acts like one piece now. Press <kbd>s</kbd>.', done: t => lhs(t.app) === '2x + 8 + y' },
      { say: 'Aim at <b>2x</b> and press <kbd>Shift</kbd> + <kbd>→</kbd> to slide it one place right.', done: t => lhs(t.app).startsWith('8') },
      { say: 'Now the mouse: drag a box around <b>8 + 2x</b> (not the y). Whatever the box covers is picked.', done: t => aimed(t.app) === '8 + 2x' },
      { say: 'Press <kbd>m</kbd> to move the whole run across at once.', done: t => lhs(t.app) === 'y' },
    ],
  },
  {
    id: 'algebra', name: 'The algebra menu', blurb: 'Tab for forms, cases and solving.',
    steps: [
      { load: 'x^2 - 5x + 6 = 0', say: 'Tap <kbd>Tab</kbd> to open the algebra menu. It shows the forms this equation can take.', done: t => t.app.mode === 'hub' },
      { say: 'Browse with <kbd>←</kbd> <kbd>→</kbd> (the equation previews each one). Highlight <b>factored</b> and tap <kbd>Tab</kbd> again to apply it.', done: t => text(t.app).includes(')(') },
      { say: 'A product is zero when one factor is. Hold <kbd>Tab</kbd> and press <kbd>a</kbd> to split into cases.', done: t => t.app.slots.length >= 2 },
      { say: 'The other case waits on the shelf at the top. Press <kbd>e</kbd> to solve this one.', done: t => solved(t.app) },
      { say: 'Press <kbd>Alt</kbd> + <kbd>→</kbd> (or <kbd>2</kbd>) to move to the other case, then <kbd>e</kbd>.', done: t => t.app.cur === 1 && solved(t.app) },
      { load: 'x^2 = 9', say: 'Functions work on both sides too. Hold <kbd>f</kbd> and press <kbd>i</kbd> to undo the square.', done: t => !lhs(t.app).includes('^') },
      { say: 'The square cancelled into <b>|x|</b>, so nothing was lost. Press <kbd>s</kbd> for the √9.', done: t => rhs(t.app) === '3' },
    ],
  },
  {
    id: 'systems', name: 'Systems', blurb: 'Several equations, elimination, substitution.',
    steps: [
      { load: 'x + y = 10', say: 'Press <kbd>n</kbd> for a second equation, type <b>x - y = 2</b>, then <kbd>Enter</kbd>.', done: t => t.app.slots.length >= 2 },
      { say: 'Add equation 1 to both sides: press <kbd>=</kbd>, type <b>#1</b>, then <kbd>Enter</kbd>.', done: t => t.app.cur === 1 && text(t.app).includes('10') },
      { say: 'The y’s are about to cancel. Press <kbd>s</kbd> a few times until they’re gone.', done: t => t.app.cur === 1 && !text(t.app).includes('y') && !text(t.app).includes('+') },
      { say: 'Press <kbd>e</kbd> to finish it.', done: t => t.app.cur === 1 && solved(t.app) },
      { say: 'Back to equation 1 with <kbd>1</kbd>. Then hold <kbd>Tab</kbd> and press <kbd>2</kbd> to substitute what equation 2 found.', done: t => t.app.cur === 0 && !text(t.app).includes('x') },
      { say: 'Press <kbd>e</kbd>. Both variables solved, and the graph shows the lines crossing there.', done: t => t.app.cur === 0 && solved(t.app) },
    ],
  },
  {
    id: 'beyond', name: 'Beyond equations', blurb: 'Inequalities, proofs and functions.',
    steps: [
      { load: '-2x + 3 < 7', say: 'An inequality. Moves flip the sign when they must. Press <kbd>e</kbd> to solve it.', done: t => !!t.app.step?.answer || solved(t.app) },
      { load: 'x^2 - 4 > 0', say: 'This one needs a sign chart. Press <kbd>e</kbd>; the answer appears under the equation and the graph shades it.', done: t => !!t.app.step?.answer },
      { load: '(a + b)^2 = a^2 + 2ab + b^2', say: 'This holds for every a and b, so it became a proof (≟). Tap <kbd>Tab</kbd>, browse to <b>expanded</b>, and tap <kbd>Tab</kbd> again.', done: t => relOf(t.app.eq) === '≟' && isProved(t.app.eq) },
      { load: 'f(x) = 2x + 3', say: 'Proved ∎. Now a function. Hold <kbd>Tab</kbd> and press <kbd>b</kbd> to build its inverse.', done: t => t.app.slots.length >= 2 },
      { say: 'Use it anywhere: press <kbd>n</kbd> and type <b>f(4) = y</b>, then <kbd>Enter</kbd>.', done: t => t.app.slots.length >= 3 },
      { say: 'Hold <kbd>Tab</kbd> and press <kbd>u</kbd> to unfold f(4) into its body.', done: t => !text(t.app).includes('f(') },
    ],
  },
  {
    id: 'work', name: 'Your work and settings', blurb: 'Cards, reset, settings, flash mode.',
    steps: [
      { load: '5x = 20', say: 'Press <kbd>w</kbd> to see your workspaces as cards.', done: t => t.app.library.isOpen },
      { say: 'Arrows move, <kbd>Enter</kbd> opens, <kbd>n</kbd> starts a new one. Press <kbd>Esc</kbd> to close.', done: t => !t.app.library.isOpen },
      { say: 'Press <kbd>,</kbd> for settings: theme, look, size, speed, sounds.', done: t => t.app.settings.isOpen },
      { say: 'Try the Pixel look or the Bricks sounds with <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd>, then <kbd>Esc</kbd>.', done: t => !t.app.settings.isOpen },
      { say: 'Press <kbd>z</kbd> for ⚡ flash mode (the bolt bottom right). Everything moves about 3× faster.', done: () => prefs.speed === 'flash' },
      { say: 'Press <kbd>e</kbd> to see it, then <kbd>z</kbd> again whenever you want normal speed.', done: t => solved(t.app) },
    ],
  },
  /* ---------------- the algebra pack ---------------- */
  {
    id: 'linear', group: 'Algebra pack', name: 'Linear equations', blurb: 'Distribute, gather the x’s, divide.',
    steps: [
      { load: '5(x - 2) = 3x + 4', say: 'Brackets first. Aim at <b>5(x − 2)</b> and press <kbd>d</kbd> to distribute.', done: t => lhs(t.app) === '5x − 10' },
      { say: 'Gather the x’s on the left: aim at <b>3x</b> and press <kbd>m</kbd>.', done: t => !rhs(t.app).includes('x') },
      { say: 'Press <kbd>s</kbd> to combine 5x − 3x.', done: t => lhs(t.app).startsWith('2x') },
      { say: 'Finish by hand (move the −10, then the 2), or press <kbd>e</kbd> to watch it done.', done: t => solved(t.app) },
    ],
  },
  {
    id: 'fractions', group: 'Algebra pack', name: 'Fractions', blurb: 'Clear denominators, one fraction.',
    steps: [
      { load: 'x/3 + 1/2 = 5/6', say: `Fractions everywhere. ${Tab('d')} to clear them: both sides get multiplied by 6, the smallest number that works.`, done: t => !text(t.app).includes('/') },
      { say: 'Press <kbd>e</kbd> to solve.', done: t => solved(t.app) },
      { load: 'x/(x - 1) = 3', say: 'An x in a denominator. Press <kbd>e</kbd>: it multiplies by x − 1, and keeps a note that x ≠ 1.', done: t => solved(t.app) },
      { load: '1/x + 1/(2x)', say: `No equals sign, so this is an expression: every move keeps its value. ${Tab('c')} to make it one fraction.`, done: t => (text(t.app).match(/\//g) ?? []).length === 1 },
    ],
  },
  {
    id: 'factoring', group: 'Algebra pack', name: 'Factoring', blurb: 'Common factors, trinomials, squares, cubes.',
    steps: [
      { load: '6x^2 + 9x', say: `${Tab('f')} to factor. With nothing aimed, it factors the whole thing.`, done: t => text(t.app) === '3x(2x + 3)' },
      { load: 'x^2 - 7x + 12', say: `Aim anywhere inside this one (say the <b>12</b>), then ${tab('f')}. It factors the sum around your aim.`, done: t => text(t.app).includes(')(') },
      { load: 'x^2 - 9', say: `Difference of squares: a² − b² = (a − b)(a + b). ${Tab('f')}.`, done: t => text(t.app).includes(')(') },
      { load: 'x^2 + 6x + 9', say: `A perfect square: a² + 2ab + b² = (a + b)². ${Tab('f')}.`, done: t => text(t.app) === '(x + 3)^2' },
      { load: 'x^3 - 8', say: `Difference of cubes: a³ − b³ = (a − b)(a² + ab + b²). ${Tab('f')}.`, done: t => text(t.app).includes(')(') },
      { load: 'x^4 - 16', say: `Factoring keeps going as far as whole numbers allow. ${Tab('f')}.`, done: t => text(t.app) === '(x − 2)(x + 2)(x^2 + 4)' },
    ],
  },
  {
    id: 'square', group: 'Algebra pack', name: 'Completing the square', blurb: 'Turn x² + bx into (x + b/2)².',
    steps: [
      { load: 'x^2 + 6x + 5 = 0', say: `${Tab('h')}: x² + 6x becomes (x + 3)², minus the 9 that adds.`, done: t => lhs(t.app).startsWith('(x + 3)^2') },
      { say: 'Aim at the <b>−4</b> and press <kbd>m</kbd>.', done: t => lhs(t.app) === '(x + 3)^2' },
      { say: 'Undo the square: hold <kbd>f</kbd> and press <kbd>i</kbd>. The root of a square is an absolute value, so no answer gets lost.', done: t => lhs(t.app).includes('|') },
      { say: 'Press <kbd>s</kbd> to tidy the √4.', done: t => rhs(t.app) === '2' },
      { say: `${Tab('a')} to split |x + 3| = 2 into two cases.`, done: t => t.app.slots.length >= 2 },
      { say: 'Press <kbd>e</kbd> here, then <kbd>Alt</kbd> + <kbd>→</kbd> and <kbd>e</kbd> for the other case.', done: t => allSolved(t.app) },
    ],
  },
  {
    id: 'formula', group: 'Algebra pack', name: 'The quadratic formula', blurb: 'x = (−b ± √(b² − 4ac)) / 2a, as two cases.',
    steps: [
      { load: 'x^2 + 4x + 1 = 0', say: `This one doesn’t factor. ${Tab('g')} for the quadratic formula, with a, b and c plugged in.`, done: t => t.app.slots.length >= 2 },
      { say: `± means two cases: + is here, − waits on the shelf at the top. ${Tab('s')} to work out the numbers (or tap <kbd>s</kbd> a few times to watch each step).`, done: t => text(t.app) === 'x = −2 + sqrt(3)' },
      { say: `<kbd>Alt</kbd> + <kbd>→</kbd> for the other root, then ${tab('s')}.`, done: t => t.app.cur === 1 && text(t.app) === 'x = −2 − sqrt(3)' },
      { load: '2x^2 = 3 - 5x', say: `Terms on both sides are fine: the formula gathers them first. ${Tab('g')}.`, done: t => t.app.slots.length >= 2 },
      { say: `${Tab('s')}. Whole-number answers mean factoring would have worked too.`, done: t => solved(t.app) && !text(t.app).includes('sqrt') },
    ],
  },
  {
    id: 'identities', group: 'Algebra pack', name: 'Algebraic identities', blurb: 'Prove them, then use them backwards.',
    steps: [
      { load: '(a + b)^2 = a^2 + 2ab + b^2', say: `True for every a and b, so this is a proof (≟), not an equation. ${Tab('x')} to expand.`, done: t => isProved(t.app.eq) },
      { load: '(a - b)(a^2 + a b + b^2) = a^3 - b^3', say: `Proved ∎. The difference of cubes, the same way: ${tab('x')}.`, done: t => isProved(t.app.eq) },
      { load: 'a^3 + b^3', say: `Identities work backwards too: that is factoring. ${Tab('f')} for the sum of cubes.`, done: t => text(t.app).includes(')(') },
      { load: '4x^2 - 12x y + 9y^2', say: `A perfect square in two letters. ${Tab('f')}.`, done: t => text(t.app) === '(2x − 3y)^2' },
    ],
  },
  {
    id: 'trig', group: 'Algebra pack', name: 'Trig identities', blurb: 'Pythagorean, double angle, differences.',
    steps: [
      { load: 'sin(x)^2 + cos(x)^2', say: 'Tap <kbd>Tab</kbd>: identities show up as forms. Press <kbd>→</kbd> to highlight <b>trig: Pythagorean</b> and tap <kbd>Tab</kbd> again.', done: t => text(t.app) === '1' },
      { load: 'sin(2x) = cos(x)', say: 'Tap <kbd>Tab</kbd>, browse to <b>trig: double angle</b>, tap <kbd>Tab</kbd>.', done: t => lhs(t.app) === '2 sin(x) cos(x)' },
      { say: `Now everything on one side: ${tab('z')}.`, done: t => rhs(t.app) === '0' },
      { say: `cos(x) is in both terms. ${Tab('f')} to pull it out.`, done: t => lhs(t.app).startsWith('cos(x)(') },
      { load: 'cos(x - y)', say: 'Angle difference: tap <kbd>Tab</kbd>, highlight it, tap <kbd>Tab</kbd>.', done: t => text(t.app) === 'cos(x) cos(y) + sin(x) sin(y)' },
      { load: 'cos(-x)', say: 'Cosine is even, cos(−x) = cos x. Apply <b>trig: even/odd</b> the same way.', done: t => text(t.app) === 'cos(x)' },
    ],
  },
  {
    id: 'inequalities', group: 'Algebra pack', name: 'Inequalities', blurb: 'The sign flips when it must.',
    steps: [
      { load: '3 - 2x >= 7', say: 'Aim at the <b>3</b> and press <kbd>m</kbd>.', done: t => lhs(t.app) === '−2x' },
      { say: 'Press <kbd>s</kbd>.', done: t => rhs(t.app) === '4' },
      { say: 'Aim at the <b>−2</b> inside −2x (aim −2x, then <kbd>↓</kbd>) and press <kbd>m</kbd>. Dividing by a negative flips ≥ to ≤.', done: t => relOf(t.app.eq) === '≤' },
      { say: 'Press <kbd>s</kbd> to finish.', done: t => text(t.app) === 'x ≤ −2' },
      { load: 'x^2 - x - 6 < 0', say: 'A quadratic inequality needs a sign chart. Press <kbd>e</kbd>: the answer shows under the equation and the graph shades it.', done: t => !!t.app.step?.answer },
    ],
  },
  {
    id: 'abs', group: 'Algebra pack', name: 'Absolute value', blurb: 'Two cases, and the impossible ones.',
    steps: [
      { load: '|2x - 1| = 5', say: `|A| = 5 means A = 5 or A = −5. ${Tab('a')} to split.`, done: t => t.app.slots.length >= 2 },
      { say: 'Press <kbd>e</kbd> here, then <kbd>Alt</kbd> + <kbd>→</kbd> and <kbd>e</kbd> again.', done: t => allSolved(t.app) },
      { load: '|x + 2| = -3', say: `Now try ${tab('a')} here.`, setup: t => { t.refused = false; }, done: t => t.refused },
    ],
  },
  {
    id: 'powers', group: 'Algebra pack', name: 'Roots and powers', blurb: 'Undo a root, rewrite powers.',
    steps: [
      { load: 'sqrt(x + 3) = 5', say: 'Hold <kbd>f</kbd> and press <kbd>i</kbd>: squaring undoes the root.', done: t => !text(t.app).includes('sqrt') },
      { say: 'Press <kbd>e</kbd>.', done: t => solved(t.app) },
      { load: 'sqrt(12) + sqrt(27)', say: 'Press <kbd>s</kbd>: √12 = 2√3 and √27 = 3√3, so it is one term.', done: t => text(t.app) === '5 sqrt(3)' },
      { load: 'x^(1/2) + x^(-1)', say: `Aim at <b>x^(−1)</b> and ${tab('r')} to write it as a root or fraction.`, done: t => text(t.app).includes('1/x') },
    ],
  },
  {
    id: 'logs', group: 'Algebra pack', name: 'Exponentials and logs', blurb: 'ln undoes e^, log rules bring powers down.',
    steps: [
      { load: 'e^(2x) = 7', say: 'Hold <kbd>f</kbd> and press <kbd>i</kbd>: ln undoes e^.', done: t => lhs(t.app) === '2x' },
      { say: 'Press <kbd>e</kbd>.', done: t => solved(t.app) },
      { load: '2^x = 32', say: 'A different base. Hold <kbd>f</kbd> and press <kbd>l</kbd> to take ln of both sides.', done: t => lhs(t.app).startsWith('ln') },
      { say: `${Tab('l')} for the log rules: the power comes down.`, done: t => lhs(t.app) === 'x ln(2)' },
      { say: 'Press <kbd>e</kbd>.', done: t => text(t.app) === 'x = 5' },
    ],
  },
  {
    id: 'expressions', group: 'Algebra pack', name: 'Expressions', blurb: 'No equals sign: simplify, expand, factor.',
    steps: [
      { load: '2x + 4x - 3(x - 1)', say: 'Type something with no = and you get an expression. Press <kbd>s</kbd> to combine 2x + 4x.', done: t => lhs(t.app).startsWith('6x') },
      { say: 'Aim at <b>−3(x − 1)</b> and press <kbd>d</kbd>.', done: t => !text(t.app).includes('(') },
      { say: 'With nothing to solve, <kbd>e</kbd> tidies an expression all the way. Press it.', done: t => text(t.app) === '3x + 3' },
      { say: `${Tab('f')} to factor it back.`, done: t => text(t.app) === '3(x + 1)' },
    ],
  },
  {
    id: 'derivatives', group: 'Calculus 1', name: 'Derivatives, rule by rule', blurb: 'Hold C: power, sum, product, chain.',
    steps: [
      { load: 'd/dx x^5', say: `Calculus lives on ${kb('C')}. ${C('d')} to take the derivative one rule at a time.`, done: t => text(t.app) === '5x^4' },
      { load: 'd/dx (x^3 + 2x - 7)', say: `A sum: each term on its own. ${C('d')}.`, done: t => text(t.app) === '3x^2 + 2' },
      { load: 'd/dx x^2 sin(x)', say: `A product of two things that change: the product rule. ${C('d')}.`, done: t => !calcLeft(t.app) },
      { load: 'd/dx sin(x^3)', say: `A function of a function: the chain rule. The inside’s derivative comes out front. ${C('d')}.`, done: t => !calcLeft(t.app) },
      { load: 'd/dx (x^2 + 1)^3 cos(x)', say: 'Several rules deep. Press <kbd>e</kbd>: every rule plays, each one checked, then it tidies.', done: t => !calcLeft(t.app) },
    ],
  },
  {
    id: 'limits', group: 'Calculus 1', name: 'Limits', blurb: 'Plug in, and L’Hôpital when it’s 0/0.',
    steps: [
      { load: 'lim x->3 (x^2 + 1)', say: `Where the function is smooth, the limit is its value. ${C('p')} to plug in.`, done: t => !calcLeft(t.app) },
      { say: 'Press <kbd>s</kbd> until it’s a number.', done: t => text(t.app) === '10' },
      { load: 'lim x->0 sin(x)/x', say: `Try ${C('p')} again here.`, setup: t => { t.refused = false; }, done: t => t.refused },
      { say: `It resisted: 0/0. ${C('l')} for L’Hôpital: the limit of the top’s derivative over the bottom’s.`, done: t => text(t.app).includes('cos') },
      { say: `Now ${C('p')} works.`, done: t => !calcLeft(t.app) },
      { load: 'lim x->0 (e^x - 1)/x', say: 'Press <kbd>e</kbd> and it picks the steps itself.', done: t => text(t.app) === '1' },
    ],
  },
  {
    id: 'implicit', group: 'Calculus 1', name: 'Implicit differentiation', blurb: 'd/dx both sides; y′ appears.',
    steps: [
      { load: 'x^2 + y^2 = 25', say: `A circle: y isn’t on its own. ${C('d')} takes d/dx of both sides, with y depending on x.`, done: t => calcLeft(t.app) },
      { say: 'The arrow ⇒ in the trail says this step follows from the circle but isn’t the same equation. Press <kbd>e</kbd>: the derivatives, then it solves for y′.', done: t => lhs(t.app) === 'y′' },
    ],
  },
  {
    id: 'maxmin', group: 'Calculus 1', name: 'Max and min', blurb: 'Where the slope is 0.',
    steps: [
      { load: 'f(x) = x^3 - 3x', say: `${C('m')}: a new equation, f’s slope = 0.`, done: t => t.app.slots.length === 2 },
      { say: 'Press <kbd>e</kbd>: the derivative, then it solves. Two answers, so two equations.', done: t => t.app.slots.length === 3 && solved(t.app) },
      { say: `${C('d')} on the function itself gives f′ as an equation of its own. Press <kbd>1</kbd> first to go back to f.`, done: t => t.app.slots.some(s => toText(s.steps[s.at].eq).startsWith('f′(x) = d/dx')) },
    ],
  },
  {
    id: 'definition', group: 'Calculus 1', name: 'The definition', blurb: 'The derivative as a limit, h → 0.',
    steps: [
      { load: 'd/dx x^2', say: `Every rule comes from one limit. Hold ${kb('C')} and press ${kb('h')} for the definition.`, done: t => text(t.app).startsWith('lim') },
      { say: 'Press <kbd>e</kbd>. It is 0/0 at h = 0, so L’Hôpital steps in.', done: t => text(t.app) === '2x' },
    ],
  },
  {
    id: 'integrals', group: 'Calculus 2', name: 'Antiderivatives', blurb: 'Hold C, press i: the rules backwards.',
    steps: [
      { load: 'int x^4 dx', say: `${C('i')} to integrate. The power goes up by one, and + C joins: every antiderivative differs by a constant.`, done: t => text(t.app) === 'x^5/5 + C' },
      { load: 'int (6x^2 - 4x + 3) dx', say: `Term by term. ${C('i')}.`, done: t => !calcLeft(t.app) },
      { load: 'int cos(3x) dx', say: `A linear inside: the chain rule backwards divides by its 3. ${C('i')}.`, done: t => !calcLeft(t.app) },
      { load: 'x^3 - 2x', say: `From a plain expression, ${C('i')} adds its antiderivative as a new equation.`, done: t => t.app.slots.length === 2 },
      { say: 'Press <kbd>e</kbd> to work it out.', done: t => !calcLeft(t.app) },
    ],
  },
  {
    id: 'definite', group: 'Calculus 2', name: 'Definite integrals', blurb: 'The area: F(b) − F(a).',
    steps: [
      { load: 'int_1^3 2x dx', say: `${C('i')}: the antiderivative, with the bounds on a bar beside it.`, done: t => text(t.app).startsWith('[') },
      { say: `${C('p')} plugs in the bounds: F(3) − F(1).`, done: t => !calcLeft(t.app) },
      { say: 'Press <kbd>s</kbd> until it’s a number.', done: t => text(t.app) === '8' },
      { load: 'int_1^∞ 1/x^2 dx', say: 'An improper one: the top is ∞, so that bound becomes a limit. Press <kbd>e</kbd>.', done: t => text(t.app) === '1' },
    ],
  },
  {
    id: 'usub', group: 'Calculus 2', name: 'u-substitution', blurb: 'Spot the inside and its derivative.',
    steps: [
      { load: 'int 2x e^(x^2) dx', say: `The inside x² has its derivative 2x right there. ${C('u')}: u = x² goes on the shelf, and the integral is in u.`, done: t => text(t.app).includes('du') },
      { say: `Now it is a plain one. ${C('i')}.`, done: t => !calcLeft(t.app) },
      { say: 'Press <kbd>e</kbd> to put x² back for u.', done: t => text(t.app) === 'e^(x^2) + C' },
      { load: 'int_0^1 2x e^(x^2) dx', say: 'With bounds, they change with u and nothing needs putting back. Press <kbd>e</kbd>.', done: t => !calcLeft(t.app) && !text(t.app).includes('u') },
    ],
  },
  {
    id: 'parts', group: 'Calculus 2', name: 'By parts', blurb: '∫ u dv = uv − ∫ v du.',
    steps: [
      { load: 'int x cos(x) dx', say: `A product where one part gets simpler when differentiated. ${C('b')}: u = x, picked by LIATE.`, done: t => text(t.app).includes('∫ sin') },
      { say: `What’s left is plain. ${C('i')}.`, done: t => !calcLeft(t.app) },
      { load: 'int ln(x) dx', say: 'ln x on its own: u = ln x, dv = dx. Press <kbd>e</kbd> and watch it choose.', done: t => !calcLeft(t.app) },
    ],
  },
  {
    id: 'series', group: 'Calculus 2', name: 'Series', blurb: 'Geometric sums, the ratio test, Taylor.',
    steps: [
      { load: 'sum_{n=0}^∞ 5(1/3)^n', say: `Each term is 1/3 of the last: geometric. ${C('g')}: first term over (1 − r).`, done: t => !calcLeft(t.app) },
      { say: 'Press <kbd>s</kbd> until it’s a number.', done: t => text(t.app) === '15/2' },
      { load: 'sum_{n=1}^∞ n/2^n', say: `Not geometric, but does it add up? ${C('r')} for the ratio test.`, done: t => !!t.app.message?.text.includes('converges') },
      { load: 'e^x', say: `${C('t')}: the Taylor polynomial, a polynomial that hugs eˣ near 0. Switch between the two with <kbd>1</kbd> and <kbd>2</kbd> and watch the graph.`, done: t => t.app.slots.length === 2 },
    ],
  },
  {
    id: 'partials', group: 'Calculus 3', name: 'Partial derivatives', blurb: 'One letter moves, the others hold still.',
    steps: [
      { load: 'x^2 y + y^3', say: `Two letters. ${C('d')}: ∂/∂x, the slope as x moves with y held still.`, done: t => text(t.app).startsWith('∂') },
      { say: `${C('d')} again: y is just a number here, so x²y goes like 2x times it, and y³ is a constant.`, done: t => !calcLeft(t.app) },
      { load: '∂/∂y (x^2 y + y^3)', say: 'Now in y, with x held still. Press <kbd>e</kbd>.', done: t => !calcLeft(t.app) },
    ],
  },
  {
    id: 'gradient', group: 'Calculus 3', name: 'The gradient', blurb: 'Every partial at once, and the slope in any direction.',
    steps: [
      { load: 'x^2 y', say: `${C('n')}: ∇, the gradient. It points the way the function climbs fastest.`, done: t => text(t.app).startsWith('∇') },
      { say: 'Press <kbd>e</kbd>: one partial for each letter, side by side in a vector.', done: t => text(t.app) === '⟨2xy, x^2⟩' },
      { load: '∇(x^2 y) ⟨3/5, 4/5⟩', say: 'The slope heading along ⟨3/5, 4/5⟩ is the gradient dotted with it. Press <kbd>e</kbd>.', done: t => !calcLeft(t.app) && !text(t.app).includes('⟨') },
    ],
  },
  {
    id: 'maxmin2', group: 'Calculus 3', name: 'Max and min in 3D', blurb: 'Every partial is 0, then solve them together.',
    steps: [
      { load: 'x^2 + y^2 - 2x + 4y', say: `A bowl. ${C('m')}: its bottom is where the gradient is the zero vector.`, done: t => text(t.app).startsWith('∇') },
      { say: 'Press <kbd>e</kbd>: the gradient, then one equation for each entry.', done: t => t.app.slots.length === 3 },
      { say: 'Press <kbd>e</kbd> to solve this one, then <kbd>3</kbd> and <kbd>e</kbd> for the other.', done: t => [1, 2].every(i => !!solvedFor(t.app.eqOf(i))) },
    ],
  },
  {
    id: 'lagrange', group: 'Calculus 3', name: 'Lagrange multipliers', blurb: 'Biggest on a constraint: ∇f = λ∇g.',
    steps: [
      { load: 'x y', say: 'Make xy as big as it can be with x + y = 4. Press <kbd>n</kbd>, type <b>x + y = 4</b>, then <kbd>Enter</kbd>.', done: t => t.app.slots.length >= 2 },
      { say: `Back to equation 1 with <kbd>1</kbd>. ${C('k')}: at the best point the two gradients line up, ∇f = λ∇g.`, done: t => text(t.app).includes('λ') },
      { say: 'Press <kbd>e</kbd>: both gradients, then an equation for each entry. y = λ and x = λ, so x = y, and x + y = 4 makes both 2.', done: t => t.app.slots.length >= 4 },
    ],
  },
  {
    id: 'double', group: 'Calculus 3', name: 'Double integrals', blurb: 'Inside out: one integral, then the next.',
    steps: [
      { load: 'int_0^1 int_0^2 x y dy dx', say: `The inner one first, in y, with x held still. ${C('i')}.`, done: t => text(t.app).startsWith('∫_{0}^{1} [') },
      { say: `${C('p')} plugs in y = 2 and y = 0.`, done: t => !text(t.app).includes('[') },
      { say: 'Press <kbd>e</kbd> for the outer one.', done: t => text(t.app) === '1' },
    ],
  },
  {
    id: 'separable', group: 'Calculus 4', name: 'Separable equations', blurb: 'y’s on one side, x’s on the other, integrate both.',
    steps: [
      { load: "y' = x y", say: `A differential equation: the slope depends on x and y. ${C('s')}: the y’s go left, the x’s go right, each under an integral.`, done: t => text(t.app).startsWith('∫') },
      { say: 'Press <kbd>e</kbd>: both integrals, one + C between them, then solved for y. The ± gives two equations.', done: t => solved(t.app) && !calcLeft(t.app) },
    ],
  },
  {
    id: 'linear1', group: 'Calculus 4', name: 'Integrating factor', blurb: 'y′ + P y = Q: turn the left side into one derivative.',
    steps: [
      { load: "y' + 2y = e^x", say: `Not separable, but linear. ${C('f')}: multiply by e^(∫2 dx) = e^(2x), and the left side becomes the product rule of (y e^(2x))′.`, done: t => text(t.app).includes('∫') },
      { say: 'Press <kbd>e</kbd>: integrate the right side, then solve for y.', done: t => solved(t.app) && !calcLeft(t.app) },
    ],
  },
  {
    id: 'second', group: 'Calculus 4', name: 'Second order', blurb: 'y″ + b y′ + c y = 0: try y = e^(rx).',
    steps: [
      { load: "y'' - 3y' + 2y = 0", say: `Guess y = e^(rx). ${C('r')}: every term has e^(rx), so what’s left is r² − 3r + 2 = 0.`, done: t => t.app.slots.length === 2 },
      { say: 'Press <kbd>e</kbd>: the roots are 1 and 2.', done: t => t.app.slots.length === 3 },
      { say: `Back to equation 1 with <kbd>1</kbd>. ${C('g')}: the general solution, checked by putting it back in.`, done: t => t.app.slots.length === 4 },
      { load: "y'' + 2y' + 5y = 0", say: 'Here the roots are complex, −1 ± 2i: waves that shrink. Press <kbd>e</kbd>.', done: t => t.app.slots.length === 2 && text(t.app).includes('cos') },
    ],
  },
  {
    id: 'fields', group: 'Calculus 4', name: 'Divergence and curl', blurb: 'How a field spreads out, and how it spins.',
    steps: [
      { load: '(-y, x, 0)', say: `A field that turns around the z axis. ${C('w')}: its curl, ∇×F.`, done: t => text(t.app).startsWith('∇×') },
      { say: 'Press <kbd>e</kbd>: it spins about z, twice as fast as it turns.', done: t => text(t.app) === '⟨0, 0, 2⟩' },
      { load: '(x, y, z)', say: `Every arrow points straight out. ${C('v')}: its divergence, ∇·F.`, done: t => text(t.app).startsWith('∇·') },
      { say: 'Press <kbd>e</kbd>: it spreads out by 3 everywhere.', done: t => text(t.app) === '3' },
    ],
  },
];


/** menu keys: digits, then letters that aren't already menu keys (g closes, j k move), then capitals */
const MENU_KEYS = [...'123456789abcdefhilmnopqrstuvwxyz', ...'ABCDEFHILMNOPQRSTUVWXYZ'];

export class Tour {
  i = -1;
  tour: TourDef = TOURS[0];
  private pick = 0;
  private scrollPick = false;
  mark = 0;
  refused = false;
  finished = false;
  private stash: { slots: Slot[]; cur: number } | null = null;
  private advancing = false;
  private poll = 0;
  private card: HTMLElement;

  constructor(public app: App) {
    this.card = document.getElementById('tour')!;
    this.card.querySelector('.tour-quit')!.addEventListener('click', () => this.end(false));
    document.getElementById('tours')!.addEventListener('mousedown', e => { if (e.target === document.getElementById('tours')) this.closeMenu(); });
    window.addEventListener('keydown', e => {
      if (this.i < 0) return;
      const typing = ['write', 'op', 'fnask'].includes(this.app.mode);
      if (e.key === 'q' && !typing && this.app.mode === 'solve') { e.preventDefault(); e.stopImmediatePropagation(); this.end(false); }
      if (e.key === 'Enter' && this.i === this.tour.steps.length - 1 && !typing) { e.preventDefault(); e.stopImmediatePropagation(); this.finished = true; this.check(); }
    }, true);
  }

  get active() { return this.i >= 0; }

  get menuOpen() { return !document.getElementById('tours')!.hidden; }

  /** the list of tours (g) */
  menu() {
    if (this.active) this.end(false);
    const host = document.getElementById('tours')!;
    host.hidden = false;
    this.renderMenu();
    sound.labels();
  }

  closeMenu() { document.getElementById('tours')!.hidden = true; }

  private renderMenu() {
    const done = doneTours();
    const list = document.getElementById('tours-list')!;
    list.replaceChildren();
    let group = '';
    TOURS.forEach((t, k) => {
      if (t.group && t.group !== group) {
        group = t.group;
        const h = document.createElement('div');
        h.className = 'tour-group';
        h.textContent = group;
        list.append(h);
      }
      const b = document.createElement('button');
      b.className = 'tour-pick' + (k === this.pick ? ' focus' : '') + (done.includes(t.id) ? ' done' : '');
      b.dataset.id = t.id;
      b.innerHTML = `<kbd>${MENU_KEYS[k]}</kbd><span class="tp-name">${t.name}</span><span class="tp-blurb">${t.blurb}</span><span class="tp-len">${t.steps.length} steps</span>`;
      b.addEventListener('click', () => this.start(t.id));
      b.addEventListener('mouseenter', () => { this.pick = k; this.renderMenu(); });
      list.append(b);
    });
    if (this.scrollPick) list.querySelector('.tour-pick.focus')?.scrollIntoView({ block: 'nearest' });
    this.scrollPick = false;
  }

  menuKey(e: KeyboardEvent) {
    e.preventDefault();
    const k = e.key;
    if (k === 'Escape' || k === 'g') return this.closeMenu();
    if (k === 'ArrowDown' || k === 'j') { this.pick = (this.pick + 1) % TOURS.length; this.scrollPick = true; sound.tick(0); return this.renderMenu(); }
    if (k === 'ArrowUp' || k === 'k') { this.pick = (this.pick + TOURS.length - 1) % TOURS.length; this.scrollPick = true; sound.tick(0); return this.renderMenu(); }
    if (k === 'Enter' || k === ' ') return this.start(TOURS[this.pick].id);
    const at = MENU_KEYS.indexOf(k);
    if (at >= 0 && TOURS[at]) return this.start(TOURS[at].id);
  }

  start(id = 'basics') {
    this.closeMenu();
    if (this.active) return;
    this.tour = TOURS.find(t => t.id === id) ?? TOURS[0];
    this.pick = TOURS.indexOf(this.tour);
    this.app.closeOverlays();
    this.stash = { slots: this.app.slots, cur: this.app.cur };
    this.app.noSave = true;
    this.finished = false;
    this.card.hidden = false;
    // some changes land on timers (cases, solving); a light poll catches those too
    window.clearInterval(this.poll);
    this.poll = window.setInterval(() => this.check(), 250);
    this.go(0);
  }

  private go(i: number) {
    this.i = i;
    const s = this.tour.steps[i];
    if (this.app.mode === 'op') this.app.closeOp();
    if (s.load) this.app.loadFresh(s.load);
    s.setup?.(this);
    this.card.classList.remove('done');
    this.card.querySelector('.tour-text')!.innerHTML = s.say;
    this.card.querySelector('.tour-count')!.textContent = `${this.tour.name} · ${i + 1} / ${this.tour.steps.length}`;
    (this.card.querySelector('.tour-bar i') as HTMLElement).style.width = `${(i / this.tour.steps.length) * 100}%`;
    this.card.animate([{ opacity: 0, transform: 'translate(-50%, 6px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }

  /** called by the app after anything changes */
  check(kind: 'change' | 'refuse' = 'change') {
    if (!this.active || this.advancing) return;
    if (kind === 'refuse') this.refused = true;
    if (!this.tour.steps[this.i].done(this)) return;
    this.advancing = true;
    this.card.classList.add('done');
    (this.card.querySelector('.tour-bar i') as HTMLElement).style.width = `${((this.i + 1) / this.tour.steps.length) * 100}%`;
    window.setTimeout(() => {
      this.advancing = false;
      if (!this.active) return;
      if (this.i + 1 >= this.tour.steps.length) return this.end(true);
      this.go(this.i + 1);
    }, kind === 'refuse' ? 1400 : 750);
  }

  end(complete: boolean) {
    if (!this.active) return;
    this.i = -1;
    window.clearInterval(this.poll);
    this.card.hidden = true;
    try {
      localStorage.setItem('algebrix.toured', '1');
      if (complete) localStorage.setItem('algebrix.tours', JSON.stringify([...new Set([...doneTours(), this.tour.id])]));
    } catch { /* storage blocked */ }
    this.app.closeOverlays();
    if (this.app.mode === 'op') this.app.closeOp();
    this.app.noSave = false;
    if (this.stash && this.stash.slots.length) this.app.restoreSlots(this.stash.slots, this.stash.cur);
    this.stash = null;
    if (complete) sound.solved();
    const next = TOURS[TOURS.indexOf(this.tour) + 1];
    this.app.say(complete ? `${this.tour.name}: done. Your equations are back.${next ? ` Press g for the next tour: ${next.name}.` : ' That was every tour.'}` : 'Tour closed. Your equations are back. g lists every tour.');
  }
}

export const toured = () => { try { return localStorage.getItem('algebrix.toured') === '1'; } catch { return true; } };

const doneTours = (): string[] => { try { return JSON.parse(localStorage.getItem('algebrix.tours') ?? '[]'); } catch { return []; } };
