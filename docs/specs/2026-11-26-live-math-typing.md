# Live math typing (Desmos-style) and LaTeX as the interchange format

Status: plan, for its own thread. Written 2026-11-26 after the user asked for typing that
turns into math as you type (int shows ∫ at once, ^ raises, / makes a fraction), everywhere
there is a box, built as a clear foundation because the work tree will later export to LaTeX.

## What the user asked for

- Every math box (the equation bar `#input`, the both-sides box `#op-input`, the f menu box,
  the C menu's asks, Tab = "rewrite as", the library/settings boxes that take math) types
  live math, the way Desmos does: `int` becomes ∫ with slots for the bounds and the body,
  `sqrt` a root, `^` a raised slot, `/` a fraction around what came before, `pi` π, `->` →.
- It must be a foundation: written clearly, scalable, with LaTeX as the format the app can
  read and write, so that a whole work tree exports to LaTeX later.
- Tested extensively, with screenshots of each construct as it is typed.

## Three layers, kept apart

1. **LaTeX ⇄ AST (engine, no DOM).** `src/engine/latex.ts`:
   - `toLatex(n: Node): string`, total over every node kind in `ast.ts` (num, sym, add, mul,
     neg, frac, pow, sqrt, fn, call, deriv incl. partial and Leibniz, lim with side, int with
     and without bounds, at, sum/prod, vec, grad/div/curl, eq with every rel incl. def and ≟).
   - `fromLatex(src: string): Node | Eq`, the inverse, accepting what the editor emits plus
     common hand-written LaTeX (`\frac`, `\dfrac`, `\sqrt[n]`, `\left( \right)`, `\cdot`,
     `\operatorname{…}`, `\int_a^b … \,dx`, `\sum_{n=1}^{\infty}`, `\lim_{x\to 0^+}`).
   - Law tests (fast-check, like tests/parse.prop.test.ts): `fromLatex(toLatex(n))` is
     the same tree (up to ids) for random trees, and numerically equal under `verify()`.
     This layer is what the export uses, so it is built and tested first, before any UI.
2. **The editor adapter (UI).** `src/ui/mathfield.ts`, one small interface every box uses:
   ```ts
   interface MathField {
     latex(): string; setLatex(s: string): void;
     focus(): void; select(): void;
     onEdit(cb: () => void): void;        // every keystroke: the live preview reads latex()
     onKey(cb: (e: KeyboardEvent) => boolean): void; // Enter, Esc, Tab stay ours
     el: HTMLElement;
   }
   function mathField(host: HTMLElement, opts: { placeholder?: string; mode: 'eq' | 'expr' | 'fn' }): MathField;
   ```
   No box talks to MathQuill directly, so the editor can be swapped without touching them.
3. **The boxes.** Each box keeps its current logic, but reads `fromLatex(field.latex())`
   instead of `parseEquation(input.value)`. The text parser (`parse.ts`) stays: it is the
   fallback, the test oracle for typing (`tests/typing.prop.test.ts`), and what `i` edit and
   paste of plain text use.

## Editor choice (decide at the start of the thread)

| | MathQuill (Desmos fork) | MathLive | Our own, on render/layout.ts |
|---|---|---|---|
| Feel | exactly Desmos (it is Desmos's editor) | polished, more menus | ours, same font as the stage |
| Size | small | large | none added |
| Fit | no framework needed; older code | web component | ids and animations shared with the stage |
| Risk | styling to match our math font | heavier, opinionated keyboard | most work |

Recommendation: start with MathQuill behind the adapter, because the user named it and
its typing feel is the target. Style it to our math font and colours. If later the typed math
should glide straight onto the stage by node id, an own editor can replace it behind the same
adapter. Vendor it into the single-file build (no CDN: the desktop app and Algebrix.html are
offline) and check its licence fits.

## What must keep working

- Every key the box handles today: Enter commits, Esc cancels, Tab/arrow behaviour of each
  box, `=` in the f menu, typing a function name in the f menu box, `□` hints for what is
  still to come (now the editor's empty slots).
- The live preview on the stage while typing (`app.preview`), and its tests in
  `e2e/calc.e2e.mjs` ("typing int x dx and d/dx…").
- Keyboard-first: no mouse needed; the app's own single-letter keys must not fire while a
  box has focus.
- Feel: a keystroke draws within one frame at 144 Hz; no layout jump when a slot opens.

## Build order

1. `latex.ts` + law tests (export works on its own: a "copy as LaTeX" on a step proves it).
2. `mathfield.ts` adapter + MathQuill vendored and themed (dark, light, accent).
3. Move `#input` first, then `#op-input`, then the f, C and Tab = boxes, one at a time, with
   their e2e tests passing after each.
4. Screenshot sweep: every construct typed letter by letter (∫ with and without bounds, Σ,
   lim, d/dx, fractions in powers, nested roots, f′(x), vectors), in dark and light.
5. Use the `edge-cases` skill: paste of plain text, paste of LaTeX, undo inside the box, a
   very long equation, a box that only takes a number, IME and non-US keyboards.
