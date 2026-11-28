# Algebrix

Keyboard-first math workbench. Read in this order, and only as far as the task needs:
1. `docs/ARCHITECTURE.md`: the map (layers, life of a key press, every menu, where it hurts, the target
   shape, the refactor plan, recipes for common changes). Start here for any code change.
2. `docs/CORE.md`: what must always hold (north star, feel targets, core mechanics, the user's design rules).
3. `docs/HISTORY.md`: why, by date. Only when a decision needs its background.

Commands: `npm test` (unit, ~20 s) · `npm run build` (types + single-file build) · `npm run e2e`
(`npm run e2e -- series` for one file) · `npm run chaos` (after a build; random play of the real app) ·
`npm run bank` (book problems through `e`).

Hard rules:
- `src/engine/` is pure (no DOM) and test-first. Never ship a move that is not covered by the numeric
  equivalence check (`checked()` in `engine/moves.ts`).
- A technique must be doable with the general moves; a shortcut only plays them into the tree
  (`docs/specs/2026-11-20-general-moves.md`).
- Never break a core keyboard mechanic (`docs/CORE.md`). Feel is the first priority: no lag, every key
  animates with `SMOOTH`, no plain fades.
- No UI framework. Fix the cause where the property is decided, not the symptom where it showed up.
- Done means: unit tests, build, e2e and chaos all pass, and the change was tried in the real build
  (skill `edge-cases`). Every new UI behaviour gets an e2e test that presses the real keys.

How to decide (the user, 2026-11-28: "if I don't tell you exactly, you take the worst option"):
1. What the user reported is fixed first, before any plan of your own. Never park a reported bug
   behind a refactor slice.
2. No change to how keys or menus behave unless the user asked for it. A refactor keeps behaviour
   exactly; a behaviour you think would help is a question on a decision card, not a surprise.
3. Every visible change: screenshot it at the user's window (1250 × 850, dark), next to what the user
   already likes (today: the f menu's outlined cards), before sending a build.
4. When unsure, copy what the user already likes rather than inventing something new. Fewer options
   on screen beats more.

Skills in `.claude/skills/`: `microdesign` (before any visible behaviour), `edge-cases` (before calling
anything done), `playtest` (book problems by keyboard; `playtest/`), `design-review` (polish rounds).
Sound sets and looks: one file in `src/packs/` (`docs/EXTENDING.md`).

# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
