# Algebrix prototype: design spec

Date: 2026-11-16. Status: design calls handed to Claude by Seftube ("you are the designer, I give the features").

## Intent
Algebrix is a new way to *do* math: you manipulate equations like Fortnite building. Fast, fluid, muscle memory, near-zero learning curve, and the engine makes algebra mistakes impossible. Long term: files with subject packs (algebra up to graduate math). The prior attempt failed on feel: clunky, AI-looking, disappointing animation and mechanics.

## Goals (prototype)
1. Type an equation fast in one bar, rendered as real math as you type.
2. Solve it for any variable with a small set of legal moves, each costing about two keys: **aim + action**.
3. Every move animates so you can see exactly what happened (the same `3x` travels, its sign flips, a factor is copied, cancelled pieces vanish). Animation never blocks the next key.
4. Undo/redo and a step trail. History is never lost.
5. Subtle, synthesized sound for every interaction.
6. Looks and feels like a real product, not a demo.

## Non-goals (prototype)
Systems of equations and substitution, trig, calculus, matrices, subject packs, files/accounts, mobile, combo macros ("isolate y" in one key). The engine and renderer are shaped so these fit later.

## Anti-goals (failure even if it "works")
- Any move that produces wrong math.
- Waiting on an animation before you can press the next key.
- Hunting for buttons; generic template look (cards, gradients, AI-default palettes).
- A long tutorial before you can do anything.

## Approach (Claude's call)
Considered: (a) MathLive input + KaTeX rendering + a generic CAS, (b) own math layout renderer + own small algebra engine with stable node identity, (c) canvas/WebGL game-style renderer. Picked **(b)**. Smooth "Manim-like" transitions need to know which glyph became which after a move; generic renderers and CAS libraries throw identity away. (c) loses text quality and accessibility for no gain at this stage.

Stack: TypeScript + Vite, no UI framework (direct DOM, full control over animation). Vitest for the engine, Playwright for driving the real app by keyboard. Delivered as a single HTML file so it runs anywhere.

## Engine
- AST: Num (integer), Sym, Add, Mul, Neg, Frac, Pow, Sqrt, Eq. Every node has a stable id that survives moves; copies remember their source id.
- Moves are local, typed rewrites. Each returns the new equation plus animation hints (focus piece, copies, what got absorbed where).
- Safety net: after every move the engine checks numerically at random points that the new equation is equivalent (lhs−rhs differs only by a known non-zero factor; local rewrites keep the subtree value). A failing check refuses the move instead of showing wrong math.
- Dividing or multiplying by an expression that could be zero records a condition (e.g. `x ≠ 0`) in the left rail.

## Moves (v1)
| Key | Move | Legal when |
|---|---|---|
| `m` | Move term across `=` (sign flips) | selection is a term of a side, or a whole side |
| `/` | Divide both sides by selection | selection is a factor of a side that is a single product |
| `*` | Multiply both sides by selection | selection is the denominator of a side that is a fraction |
| `d` | Distribute / split fraction | product over a sum, or a sum over a denominator |
| `s` | Simplify selection (arithmetic, combine like terms, cancel) | something to simplify |
| `F` | Factor out common factor | sum with a common factor |
| `H` / `L` | Slide term left/right inside its sum | term in a sum |
| `x` | Swap sides | always |
| `o` | Apply an operation to both sides (`+2`, `-3x`, `*4`, `/y`) | always (×0 refused) |

Illegal moves are never silent: the key shakes the selection and the hint bar says why in one sentence.

## Aiming (selection)
Selection is of math objects, never characters.
- `f` then a letter: jump labels appear on every term/factor; one letter jumps there (two keys to any target).
- `h`/`l` previous/next sibling, `k` grow to the containing object, `j` shrink back. Arrow keys mirror these.
- `Esc` clears. Mouse click selects the smallest object, click again grows.

## Other keys
`Enter` / `e` edit equation (write mode), `Enter` commits to solve mode, `u` undo, `U` or `Ctrl+R` redo, `?` key map, `M` mute.

## Screen (from Seftube's sketch)
- Left rail: variables (domain, conditions), step count.
- Center: input bar / original equation at top, faded step trail, current equation large and centered, hint bar under it showing legal moves for the current selection with their keys.
- Right panel: live graph of the equation (same curve at every step, which is itself a visual proof that nothing broke).

## Feel
- Motion: 180–240 ms, fast-out ease, the moved piece arcs over the `=`; sign flip is the `+` losing its vertical stroke. Copies start where their source is, tinted amber, settle to ink. Removed pieces shrink and fade, or fly into what absorbed them. New input interrupts and retargets running animations from their current position.
- Selection: a rounded highlight that glides and resizes between targets.
- Sound: Web Audio synthesis, quiet. Tick on aim (pitch tracks depth), a soft "clack" on a move, a muted low knock on refusal, a reversed tick on undo.
- Visual identity: drafting-instrument look. Cool paper `#EEF1F4`, ink `#18202B`, graphite `#5B6573`, cobalt selection `#2D5BE3`, amber copies `#D9901A`, refusal red `#C8423B`; dark theme mirrors it. Math in STIX Two (real math typography, italic variables); UI in Instrument Sans. Keys shown as small physical keycaps.

## Build discipline
Superpowers (plan, test-first for the engine), Karpathy guidelines (simplicity first, verifiable goals), Anthropic frontend-design (no default AI look), Playwright to check feel by actually driving the app.

## Left to the builder
Exact label alphabet, timing constants, sound recipes, graph range and zoom keys.

## Round 2 (after first play-test)
Liked: sound, animation, smoothness, arrow navigation. Changes:
- Keys: `Space` aims (jump labels), `f` factors, `i` types over the equation, `t` switches theme. Arrows are the primary walk keys; `hjkl` still work.
- Forms strip: `e` on the aimed piece (or the whole equation) shows equivalent forms above it: one fraction, factored, expanded, split into terms, simplified, highest power first; for the whole equation: everything on one side, clear fractions, expanded, simplified, sides swapped. Hold `e` + arrows and release to apply (edit-on-release); tap `e` or `Enter` for a sticky strip; `1`–`9` picks directly. The main equation previews each form live. Every form passes the same numeric check as a move.
- Factoring: common factor, integer quadratics, difference of squares, perfect squares.
- Pop-ups above the aimed piece for refusals and for the name of each move.
- New pieces fly in from a matching symbol already on screen, so factoring/expanding read as rearrangement.
- Themes: dark modeled on Claude Code (warm charcoal, orange selection) and a cool light theme; follows the system until chosen.

## Round 3 addendum (2026-11-16)

Feedback: single keys only (no Shift for ×), E as a real chord hub for techniques, a function mode, several equations with substitution, and freer arithmetic that still can't happen by accident.

- **Free, guarded arithmetic.** Typing `=` (+), `-`, `.` (×) or `/` opens a small both-sides bar above the aim, prefilled with whatever cancels the aimed piece and pre-selected so typing replaces it. The stage previews the result live; Enter applies; a tidy step follows a beat later (and undo skips over it). Every result still goes through the numeric check.
- **`m` moves anything across.** Terms subtract, factors divide, denominators multiply, exponents and outer functions are undone.
- **Hold `f` for functions on both sides** (round 3.1: moved from `p`; factoring moved to `e`+`f`). `f`+`i` is the inverse that peels the outer function (√ for squares, ln for e^, e^ for ln, …). Also square, cube, roots, ln, log, e^, 1/(…). Each notes its assumption (sides ≥ 0, > 0, extra solutions).
- **Hold `e`.** Techniques: `i` solve for a variable (plays the steps), `a` split |X| = B into two equations, digits substitute from that equation (solving a copy if needed). Forms have chord letters (`c t f x s z d w o l p r`); arrows browse and releasing applies. Tap `e` to keep it open.
- **Functions.** sin, cos, tan, ln, log, |x|, √, ∛, e, π; parsing, layout, evaluation, simplification of inverse pairs, log and power forms.
- **Systems.** Up to nine equations in the rail, `1`–`9` switch, `n` adds, Delete twice removes. The graph shows the others faintly.
- Verification gained a custom relation (`check`) for moves that aren't "same equation times a factor": functions on both sides (pointwise), substitution (holds given the other equation), and case splits.

## Round 4 (2026-11-16): mechanics pass and the f menu

- A sweep runs every move, form, peel and both-sides op over ~45 equations (`scripts/sweep.test.ts`, copy into `tests/` to run) and flags crashes, refusals, ugly output and unsolved cases.
- Solve for (e+i) now clears number fractions first, handles quadratics (factor, else complete the square), squares away a root when the variable is on both sides, flips a negative coefficient, detects a variable that cancels out, and stops instead of looping.
- Cases: |X| = B and products = 0 split into separate equations. Solve for splits automatically and solves every case. Each solved case is checked against the equation it came from, and a failing answer is marked "not a solution" in the rail.
- Exact values: ln of perfect powers, √(a/b²), sin/cos/tan at multiples of π/6 and π/4, arcsin/arccos/arctan of those values, e^(ln a + b) = a·e^b, (b^(1/n))^n = b.
- f menu: tabs Powers, Roots, Exp and log, Trig. Every item has a key that works from any tab; arrows browse with a live preview and releasing f applies; items marked n or b ask for a number. `i` is the inverse of the outer function, including arcsin for sin (principal value, with a note that other solutions exist).

## Round 5 (2026-11-16): feel, offers, graph, onboarding

- **No red pop-ups.** A refused move makes the aimed piece resist (a short springy nudge) with the low sound; the reason shows in the bottom bar. Move names still float briefly.
- **Simplify is offered, never forced.** Moves no longer auto-tidy. The smallest piece that would simplify gets dashed boxes (on the parts that would merge or vanish) plus a small `s simplify` chip; `s` takes it, or simplifies the aimed piece if that can. Leaving it keeps your form. Undoing a function (`f`+`i`, `m` on an outer function) still cancels on its own side, since that cancellation is the move; the other side is left for you.
- **f menu by arrows alone.** ← → move between families, ↓ (or Enter) steps into the functions, ← → pick one with a live preview, ↑ goes back up, releasing f (or Enter) applies. Letter keys still work as shortcuts.
- **Aiming.** ← → never hop between a fraction's top and bottom (Tab flips them); leaving a fraction, power, root or function lands on the next piece itself instead of diving inside it.
- **Graph, Desmos-style.** Drag to pan, scroll to zoom at the cursor, double-click to reset (animated), `[` `]` zoom smoothly. Minor and major grid, haloed labels pinned to the edge when an axis is off screen. Hover a curve to trace it with a coordinate label; hover a crossing for its exact point. Curves morph between steps; a new equation fades in.
- **3D.** Equations in three variables show their solution surface (marching tetrahedra on a 31³ grid, gradient shading, painter's order, faint x/y grid lines on the surface). Drag turns it, scroll zooms the box, double-click resets the view. Poles are skipped.
- **Manual.** `?` (or the rail button) opens a Manual with two tabs, How it works (eight short cards) and Keys; ← → switch tabs.
- **Tour.** A 13-step playthrough (`g`, rail button, or automatically on first visit): aim, move across, take a simplification, divide across, undo/redo, try dividing by 0 (it resists), undo a square with f+i, split |x| = 3 into cases. Each step advances when you've done it. Your own equations are put aside and come back at the end; `q` leaves early.

## Round 6 plan (2026-11-16)

Goal: finish the algebra foundation before Calc 1, and make the app easy to grow (packs, workspaces, settings).

Engine (test-first, every rewrite numerically checked):
1. Partial selections: a run of neighbouring terms (or factors) becomes a temporary group node, so every existing move works on it; groups dissolve after the move. Picked by mouse box-select or Shift + arrows.
2. Step records: each step keeps its rule and whether it is reversible (⇔) or one-way (⇒, e.g. squaring both sides).
3. New forms: polynomial long division, partial fractions (distinct linear factors), rationalize a denominator, a trig identity pack.
4. Elimination: add or subtract a multiple of another equation (`-2#2` in the both-sides bar).
5. Inequalities: <, >, ≤, ≥. Multiplying or dividing by a negative flips the sign; by an unknown sign is refused. Solving gives an interval answer (sign chart for polynomials and rational functions).
6. Expressions (no =) and identities: rewrite one expression; an equation that holds for every value is a proof goal (only one side at a time, finished when both sides match).
7. Named functions: `f(x) = …` defines f; `f(3)`, `f(g(x))` can be unfolded; e+v builds the inverse function.
8. A 50-problem "done enough" set that must solve by keys alone.

App:
9. Mouse box-select; Shift + arrows extend; Alt + arrows slide.
10. Flash mode (⚡, `z`): every animation about 3× faster but still visible.
11. Work cards (`w`): every workspace as a card, new, open, duplicate, rename, delete; Reset puts every equation back at its start.
12. Settings (`,`): theme, look pack, sound pack and volume, speed, size, hints.
13. Packs: sounds and looks are registries in `src/packs/`, so a Lego sound set or a pixel-art look is one file. Ships with "Blocks" sounds and a "Pixel" look as proof.

### Round 6: what shipped

- All 13 plan items are in. `tests/problems.test.ts` holds the 50-problem "done enough" set (plus one sanity check); all pass.
- Mouse box select counts only the smallest pieces it covers, and their common parent decides the pick. A box over most of a side now picks that run, not the whole side. Hovering outlines what a click would aim at.
- Workspaces (`src/ui/works.ts`, store key `algebrix.works`) replace the single session; the old session migrates in as "My work". The library (`w`, `src/ui/library.ts`) shows them as cards drawn with the real layout. Shift+R twice resets every equation to its start, and redo keeps the steps.
- Settings (`,`, `src/ui/settings.ts`) are backed by `src/ui/prefs.ts` (key `algebrix.prefs`), and `src/ui/appearance.ts` applies them.
- Flash mode (`z` or ⚡ in the bottom bar) uses a 0.38× pace for the stage, CSS transitions, and auto-step timers. There is also a Calm mode at 1.45×.
- Packs live in `src/packs/`: sound sets (Studio, Blocks) and looks (Studio, Pixel). The math layout measures with `--math-font`, so a look can swap the font. See `docs/EXTENDING.md`.

### Round 6b keys (user request)

- The algebra menu moved from `e` to `Tab`. Hold Tab plus a key to act; tap Tab, browse with the arrows, then tap Tab again to apply. Shift+Tab switches to the other side.
- `e` now solves: it goes straight to the answer for the aimed variable (or the only one), and otherwise asks which variable.
- Shift+←→ reorders (slides) a term again. Hold Ctrl and tap ← or → to grow the highlight on that side; letting go keeps it.

### Round 6c: tours

- `g` opens a tour menu with six short tours: basics, picking pieces, the algebra menu, systems, beyond equations, and your work and settings. A tour you finish gets a ✓, and the closing message points to the next one. A script plays every tour end to end.
- Fix: tapping Tab with nothing aimed now offers "factored", which factors either side.
- Fix: the tour card sits above the library and settings, so the steps that use them stay readable.

### Round 7: the sheet

- Equations sit side by side in lanes on the main screen. The one you're working on is the wide, live lane; the others are smaller columns in order. The rail no longer lists equations.
- Alt+←→ (or 1-9) moves between lanes, and the lanes slide to their new places.
- Aiming at a variable lights up the lanes that contain it ("Tab + 3 puts in z from here"). With nothing aimed, lanes show which variables they share with the current equation.
- Substituting, eliminating, or `#j` in a both-sides operation flies a copy of the source lane into the work.
- Typing previews the equation live: unclosed brackets are closed and a trailing operator is left off, so the preview shows faded while what you've typed is unfinished.
- Panels can be resized by dragging the gaps (double-click resets). The graph can sit on the right, below, or be hidden (Shift+G or Settings). Layout is saved in prefs.

### Round 7b: dock instead of lanes (user sketch)

- Full lanes felt cramped. Now the working equation gets the whole stage, and the other equations sit as small cards in a dock at the top right, under a brace, like side work (a u-substitution kept beside the main problem).
- Switching morphs: the card's glyphs grow into place, and the equation you left shrinks into its card.
- The typing box moved to the bottom (above the hints). It shows a live status (✓ equation / inequality / expression / function, or "keep going…") and quick-insert buttons (power, subscript, √, fraction, |x|, ≤, ≥, π, f(x) =).
- Subscript variables: x_1, v_0, a_n and x_{max} parse as their own names and draw with real subscripts.
- Side equations light up as linked only while Tab is held, so ordinary moves stay calm.

### Round 8: the algebra pack

**How formulas and identities work here.** An identity is a named rewrite of an expression into an equal one. It shows up as a form in the Tab menu ("factored", "completed square", "trig: double angle"), previewed live, and goes through the same numeric check as any move before it can be applied. A formula that solves something (the quadratic formula) is a technique instead: it is keyed in the Tab menu and splits the work into cases, the same way |x| = b or a product = 0 does, with its own numeric check that the cases together are exactly the original.

- Quadratic formula: Tab + g. Gathers everything on one side, then writes x = (−b + √(b² − 4ac))/2a here and the − case as a second equation, with a, b and c plugged in so the student sees the formula. Tab + s (or s) works out the numbers. b² − 4ac < 0 is refused with the reason; a repeated root gives one case.
- Completing the square: Tab + h, for an aimed quadratic or a whole side: a(x + b/2a)² + (c − b²/4a), with fractions when b is odd.
- Factoring identities: difference of cubes, sum of cubes, perfect squares in two letters, and factoring keeps going as far as whole numbers allow (x⁴ − 16 → (x − 2)(x + 2)(x² + 4)). Common factors may be any shared piece, not only letters (cos x pulled out of 2 sin x cos x − cos x).
- Trig identities: angle difference, even/odd, power reduction, tan double angle, plus the existing Pythagorean, double angle and angle sum. With nothing aimed, identities of a whole side are offered too.
- Expressions (no = sign): e tidies them all the way instead of solving; no "everything on one side", "clear fractions" or "sides swapped" forms, since those would change the value.
- Bug fixes: factoring with nothing aimed, the whole equation aimed, or a piece inside the sum aimed (key, Tab, and clicking the card); distribute dropped a minus when a term had two numbers; forms no longer offer the original back; one space after a minus before a root.
- Tours: the menu is grouped (Getting started, Algebra pack) in two columns, with keys 1-9 then letters. Twelve algebra tours: linear equations, fractions, factoring, completing the square, the quadratic formula, algebraic identities, trig identities, inequalities, absolute value, roots and powers, exponentials and logs, expressions. A script plays each one end to end.
- Code: app.ts was split with no change in behaviour. The hub (Tab), function palette (f), both-sides operations, solving, keys and persistence are now their own files under src/ui, as methods put on App.prototype; shared types and helpers live in src/ui/shared.ts. Every moved line was checked to be verbatim.

### Round 9: fractions by keyboard, the shelf, browser tests

- A fraction is vertical: ↓ on a fraction goes to its top (always, not wherever you last were), ↓ on the top goes to the bottom, ↑ on the bottom goes back to the top, ↑ on the top goes to the whole fraction. → or ← on the top or bottom walks into it.
- Edges do nothing: walking past the end, ↓ on the smallest piece, Ctrl past the end of a sum, Alt past the first or last equation. No shake, no message; an edge isn't a mistake.
- The shelf replaces the dock cards: the other equations sit open across the top of the board as columns, larger than the cards were, each with its number, status, and what it offers the current equation ("gives y", "shares x, y", "puts in x" when x is aimed) with the Tab key for it. They light up while Tab is held.
- Code: arrow-key aiming moved to src/ui/nav.ts as pure functions with unit tests; the shelf renders in src/ui/shelf.ts from plain data. Browser tests live in e2e/ (`npm run e2e`): aiming, the shelf and systems, and all 18 tours played end to end.
- Inverse trig shows as sin⁻¹, cos⁻¹, tan⁻¹ (typed as sin^-1 or sin⁻¹; arcsin still parses). sin⁻¹(sin u) → u is a form that carries its range (−π/2 ≤ u ≤ π/2) as a condition and is checked only inside it.

### Round 10: Calculus 1 on C

**How calculus is checked.** A derivative and a limit are things the engine can evaluate, so calculus steps go through the same numeric safety net as algebra. The kernel (src/engine/calculus.ts) differentiates by plain rules for evaluation only, and estimates limits numerically (Ridders' extrapolation from both sides; NaN when the estimate isn't clean, so the step can't be checked and is refused). The step-by-step rules the student sees (src/engine/calcmoves.ts) are separate code, so a slip in one shows up against the other. The kernel itself is fuzzed against finite differences in the tests.

- Notation: `d/dx x^2`, `d^2/dx^2`, `\frac{d}{dx}`, `dy/dx` (= y′), `y'`, `f'(x)`, `lim x->0 sin(x)/x`, `lim_{x\to 0^+}`, `∞` / `inf` / `\infty`. d/dx draws as a small fraction; lim draws with x → a underneath.
- C is the calculus hub, held or tapped like Tab:
  - d: the next derivative rule on the aimed (or innermost) derivative, its name on the key (power rule, sum rule, product rule, quotient rule, chain rule, constant multiple…). Simple inside pieces (xⁿ, sin x, a polynomial) are written out in the same step, so one press is one real rule. With no derivative in sight: on an expression it adds d/dx of it as a new equation; on f(x) = … it adds f′(x) = d/dx(…); on an equation it differentiates both sides, the other variables depend on x, y′ appears, and the step is marked ⇒.
  - p plugs in (refused with the reason when it is 0/0, a number over 0, or ∞), l is L'Hôpital (refused unless it is 0/0 or ∞/∞).
  - m: where the slope is 0, as a new equation.
  - h (a form): the derivative as its limit definition.
- e works out every derivative and limit one checked step after another (plug in, else L'Hôpital), then tidies an expression or a definition, or solves for y′ after differentiating both sides.
- Tours (Calculus 1): derivatives rule by rule, limits, implicit differentiation, max and min, the definition.

### Round 11: Calculus 2 on C

**How integrals are checked.** A definite integral has a value, worked out by double-exponential quadrature (tanh-sinh, or exp-sinh and sinh-sinh for infinite bounds), so a step on it is checked like any other. An indefinite integral is only known up to a constant, so when one is in play the safety net compares slopes (d/dx of before and after, with d/dx ∫ f dx = f) instead of values. A u-substitution is checked by the chain rule (Q(g(x))·g′(x) must equal the integrand), and putting x back by substituting u = g. Series are summed exactly when finite, and to ∞ when the terms shrink fast, are smooth and one-signed (Euler-Maclaurin tail), or alternate (repeated averaging); otherwise a step on them can't be checked and is refused.

- Notation: `int x^2 dx`, `∫_0^1 … dx`, `\int_{0}^{\pi} … \, dx`, `int_1^∞`, `sum_{n=1}^∞ 1/n^2`, `Σ`, `n!`. ∫ is drawn as a stroke as tall as what it integrates, with the bounds at its corners; F|ₐᵇ is drawn with a bar; Σ with its bounds above and below.
- C + i: the next integration rule (power, ∫ 1/x = ln|x|, eˣ, aˣ, sin, cos, sec², tan⁻¹, sin⁻¹, a linear inside by the reverse chain rule, sums, constant multiples). + C joins once, when the last indefinite integral goes. On an expression or f(x) = … with nothing to work out, it adds ∫ … dx as a new equation.
- C + u: u-substitution. It finds the inside g whose derivative is also there (or uses the aimed piece), writes the integral in u, and puts u = g on the shelf; e puts g back for u at the end. With bounds, the bounds change instead.
- C + b: by parts, u chosen by LIATE or by aiming at a factor; ∫ ln x dx works with dv = dx.
- C + p on F|ₐᵇ plugs in the bounds; an infinite bound becomes a limit, and a limit toward ∞ that is a plain number is taken in one step.
- Series: C + g (geometric: first term over 1 − r, with |r| < 1 noted), C + r (the ratio test's verdict in the bar), C + t (the Taylor polynomial of degree 5 about 0, or about 1 when 0 won't do, as a new expression to compare on the graph).
- A sum subtracted as a whole keeps its brackets when drawn: F(b) − (a + b).
- Tours (Calculus 2): antiderivatives, definite integrals, u-substitution, by parts, series.

### Round 12: Calculus 3 on C

**How vectors are checked.** A vector is worth one number: a fixed mix of its entries with irrational weights (1, √2, √3, …). Equal vectors give equal numbers, sums and multiples keep the mix, and swapping two entries changes it, so a step on a vector equation is checked like any other. Two vectors side by side are a dot product. ∇f is worth the mix of its partials, which the kernel works out. Splitting a vector equation into its entries is a ⇒ step, and its check covers every entry, including the ones that become new equations.

- Notation: `∂/∂x`, `\frac{\partial}{\partial x}`, `∇(…)`, `\nabla`, `grad`, `⟨1, 2⟩` or `(1, 2)`, nested integrals `int_0^1 int_0^x … dy dx`.
- On an expression with two or more letters, C changes: d is ∂/∂x as a new expression (aim at a letter for another), n the gradient, m sets ∇f = 0 (critical points), k is Lagrange (∇f = λ∇g with the first other equation that shares a letter), i the antiderivative in that letter.
- On worked pieces: C + n turns ∇f into a vector of partials, C + o works out a dot product, C + s splits a vector equation; e does all of it, then splits.
- Partial derivatives use the same rules as d/dx, with the other letters as constants; products keep their letters in x, y, z order.
- Double integrals go inside out: C + i takes the innermost, and after its bounds go in, e tidies what the outer one holds.
- Vectors are not graphed: the graph says to split into components.
- Tours (Calculus 3): partial derivatives, the gradient, max and min in 3D, Lagrange multipliers, double integrals. Past 31 tours the menu uses capitals.


### Round 13: Calculus 4 on C (differential equations, vector calculus)

**How differential equations are checked.** y, y′ and y″ are letters of their own, so algebra on an ODE is checked as usual (sampling now gives every character of a name its own weight, so y, y′ and y″ never share a value; before, y″ − 3y′ + 2y = 0 looked like an identity). One-way steps are checked by differentiating back with y depending on x: separating y′ = g(x)h(y) into ∫ 1/h dy = ∫ g dx must give y′/h − g = (old)/h, and integrating (μy)′ = μQ must differentiate back to it. A general solution is checked by putting it into the equation for several x, C₁, C₂; if it doesn't satisfy it, it is not offered.

- Notation: `y'`, `y''` (y′, y″), `C_1`; fields `(P, Q, R)`, `div(…)`, `curl(…)`, `∇·⟨…⟩`, `∇×⟨…⟩`.
- C on a first-order equation: s separates (when y′ = g(x)h(y), with h ≠ 0 noted), f runs the integrating factor (standard form, × μ = e^(∫P), the left side as (μy)′, integrate both sides; e^(k ln|x|) is written x^k). e picks the method, integrates, and solves for y.
- C on a y″ + b y′ + c y = 0 equation with number coefficients: r adds the characteristic equation, g the general solution (two real roots, a repeated root, or complex roots as e^(αx)(C₁cos βx + C₂sin βx)). Only the homogeneous kind for now.
- C on a field ⟨P, Q, R⟩: v divergence, w curl (a number in 2D). e works them out with partials.
- ODE steps tidy powers of the same base (e^(2x)e^x = e^(3x), x³/x = x²).
- Tours (Calculus 4): separable equations, integrating factor, second order, divergence and curl.
- Not yet: nonhomogeneous second order (undetermined coefficients), line and surface integrals, Green's and Stokes' theorems.

### Round 14: smooth typing, C in sections, a typeset ∫

User: typing `int x dx` or `d/dx` glitched on the way (stray i·n, d/d), the integral sign looked hand-drawn, and C should open in sections like f.

- Live preview: a word on its way (in, li, si, d/, d/d) never shows as letters. What is still to come shows as a grey □: `int` is ∫ □ dx, `d/dx` is d/dx(□), `lim x->` is lim_{x→□} □, `x +` is x + □. Enter takes the preview only when nothing is missing; with a □ left it resists ("Fill in the □ first").
- ∫ is the TeX large-operator glyph (the same outline as typeset LaTeX), stretched to its contents and slanted, with the limits placed like \int_a^b.
- C opens in sections: Derivatives, Limits, Integrals, Series, Several variables, Differential equations, Vector fields. ← → move between sections (a dot marks those with something that applies, and C opens on the most useful one), ↓ steps in, ← → pick, Enter or C applies, Esc goes back. A key still applies at once. An empty section says what to type for it.
- New items that work on any expression: l, a limit as x → (asks where), and a, a definite integral (asks for the bounds, like `0, pi`). Like f′, each starts a new piece of work beside the old one.
- An indefinite integral has no graph until it is worked out (+ C), and the graph says so instead of staying blank.

