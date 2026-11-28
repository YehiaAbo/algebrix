# Algebrix core: what it must be

One page, from the user's own messages (2026-11-16 to 11-21). Dates, quotes and causes: `docs/HISTORY.md`.

## North star

> "The challenge is to make doing mathematics as free and expressive as paper, but faster, mechanically satisfying, and reliably checkable, without restricting the user’s ideas or doing the thinking for them" (Seftube, 11-20; the original has a dash after "checkable").

The product is both: "pick from my moves and resketch the problem quickly when neccessary fast". Picking moves stays the main way to work. The feel is Fortnite building: "you are an equation or expression builder and master".

## Feel targets ("feel should should be the absolute number 1 target")

- **Frame rate:** steady 120 fps on the user's 120 Hz monitor ("it was like a smooth 120 hz( my monitor) and now its like straight 30"). No lag spikes while typing, even a definite integral. A key never waits on an animation.
- **Motion is the math:** "the animation should literally show the mechanics just like actually doing the math not just fading out the old thing then fading in the new thing", and undo plays it in reverse. Pieces move, merge, are carried. Never a plain fade.
- **Tree:** grey arrows, no outline borders, columns close together, long middles folded, current step orange, new steps grow out of their arrow, other equations never fade. It is "not the main star of the show, but it is second". Never busy or ugly.
- **Sound:** liked from v1. A refusal is the piece resisting plus the low sound. Wanted: a pack like "lego building sound in the games".
- **Speed:** one slider, not fixed modes; even the fastest still shows the motion.
- **Look:** pro dark (Claude Code style) and pro light. LaTeX-quality math: TeX ∫, Computer Modern Σ and ∏, sin⁻¹ rather than arcsin. Nothing "ai ish".
- **Ergonomics:** keyboard first, "a couple binds", "good placement binds and speed and muscle memory", almost no learning curve.
- **Layout:** the working equation owns the stage and sits centered; menus stay on screen; panels resize; typing box at the bottom; nothing cramped.
- **Calm edges:** past an edge nothing happens (no shake). After any move the aim stays on what just moved.

## Core mechanics that must always work

Every line holds on messy input too (divergent integrals, pieces with no value, defined functions), not only tidy equations.

- [ ] **Typing** (`i` retype, `n` new): live preview each key, grey □ for what is missing; "I should be able to just write anything and for it to parse correctly"; subscripts; any letter defines a function (`I(t) = …`).
- [ ] **Space:** jump labels, one letter aims anywhere.
- [ ] **Arrows:** ← → siblings, ↑ grow, ↓ shrink; on a fraction ↓ top, ↓ again bottom.
- [ ] **Ctrl + ← →:** grow the highlight on that side; let go and it stays.
- [ ] **Shift + ← →:** reorder a term; slide a factor out or in one level per press (fraction, √, power, |…|, ln, ∫, Σ, d/dx, lim; d/dt into ∫ is Leibniz).
- [ ] **Mouse:** click aims; a box takes part of a side.
- [ ] **m:** move it across (a term subtracts, a factor divides, a bottom multiplies, a power or function is undone).
- [ ] **x:** swap sides.
- [ ] **= - . /** (and `o`): both-sides box, prefilled, live preview. `=` is +, `.` is ×, no Shift.
- [ ] **s:** simplify, offered with a dashed box and chip, never automatic. **d:** distribute.
- [ ] **Tab:** algebra hub. Hold Tab + key, or tap, browse by arrows, tap Tab to apply; forms previewed. Shift+Tab other side. Tab + number subs in from that equation. Tab q takes out any factor. Tab u folds and unfolds a function.
- [ ] **C:** calculus hub in sections, behaving like Tab ("calculus is basically 90 precent algebra").
- [ ] **f:** a function on both sides; arrows alone (family, then function), release applies; `f i` inverse; type any function (`e^_`); your own in Yours.
- [ ] **e:** solve, playing real general moves into the tree.
- [ ] **b** name it (a letter, `I(t)`, or an expression); **p** put in a value; **sub in** (Tab + number).
- [ ] **u undo / r redo:** plays the mechanics back; the same move after undo returns to the existing step; a round trip shows ↺n instead of a new node.
- [ ] **n** new equation; **1-9** switch; **Alt + ← →** step between equations.
- [ ] **Tree:** strip across the top, resizable; click a step to go there; **v** big view (drag, scroll zoom, 0 fits, Esc).
- [ ] **Shift+P** replay at the slider's speed.
- [ ] **Graph:** live while you work, Desmos-like pan, zoom and hover; 3D for three letters.
- [ ] **Refusal:** resist and the low sound, reason in the bottom bar.
- [ ] **z** flash, **t** theme, **w** work cards, **,** settings, **?** manual, **g** tours.
- [ ] **Asked, not built yet:** a typed "resketch" line checked against the last step and added to the tree; walking the tree by arrow keys.

## Design rules the user set

- General moves first: "if you remove a technique’s shortcut, can you still carry it out comfortably?" Shortcuts stay, right next to the general move, as chains of it. "everything should be to the general case and not hyper specific when not necessary".
- Do not do the thinking: Algebrix executes the user's reasoning.
- No pop-ups: "the equation should just resist and make that noise, if you want an error put it at the bottom".
- No auto-simplify: highlight what could simplify, one key takes it.
- Single, familiar keys; no Shift for common moves; few binds; hubs are chords (hold a key + a key).
- Free but guarded: "entire thing shoudl be free but not too free".
- Every menu works by arrow keys alone.
- No bloat. Fix "the big reason why it was happening", not the one symptom.
- Never a strictness bottleneck (2026-11-28): informal maths (physics derivations, odd notation, re-indexing) must work, "free, relaxed, mechanical and fast". Strictness is a label on each step, never a wall: proved / checked / ≈ in a regime / assumed / notation. The app never stops you; it tells the truth about each step. (Planned, not built: today a step that fails the check is refused.)
- Algebra and mechanics first; proofs later. Small changes; ask before big refactors; never break a core mechanic; quality over a 20-minute cadence.

## Rejected or disliked

- The GPT attempt: "so cluncky very ai ish". `*` needing Shift. Red pop-ups. Auto-simplify. An f menu driven by letters, not arrows.
- Shaking at edges. Side equations lighting up as you move. Full lanes ("to comact/claustraphobic"). Dock cards "not much better than equations on the left".
- The hand-drawn ∫ ("now it looks ugly"), then its slant. Bricks offered as the Lego sound.
- Fade-in and fade-out motion; outline borders on tree steps; wide gaps; mockup A.
- A technique as its own mechanism (u-sub "leads to bloat and speicfics"); a C hub that feels "bland un-interactive and just 1 button move".
- A tree that grows for repeated or undone moves. Losing the aim after a C or menu move.
- 30 fps and lag spikes. Core keys dead on an unusual equation.
- Function names limited (I(t) refused); Tab q unable to take out a constant.
- Patching symptoms, forgetting earlier asks, many small versions that "still have the same problem".
