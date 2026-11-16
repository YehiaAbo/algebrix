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
