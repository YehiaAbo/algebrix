# Algebrix

Keyboard-first math workbench. Spec: `docs/specs/2026-11-16-algebrix-prototype-design.md`.

- `src/engine/` pure algebra: AST with stable ids, parser, moves, equivalence checks. No DOM. Test-first (`npm test`). Calculus: calculus.ts is the kernel the safety net uses (plain differentiation, numeric limits); calcmoves.ts has the step-by-step rules, kept separate so each checks the other.
- `src/render/` math layout + animated transitions keyed by node id.
- `src/ui/` app.ts (state, rendering) plus nav.ts (arrow-key aiming, pure and unit-tested), sheet.ts (the equations and their steps: undo, redo, the limit; pure and unit-tested), shelf.ts (the other equations across the top), and its parts as methods on App.prototype: hub.ts (Tab), calc.ts (C, the calculus hub), fnpal.ts (f), ops.ts (both sides), solving.ts, keys.ts, persist.ts; shared.ts holds types and helpers. Also sound, graph, library (workspaces as cards), settings, prefs, tour.
- Browser tests in `e2e/` (`npm run e2e`, or `npm run e2e -- tours` for one file): they start the dev server and drive the real app by keyboard and mouse in Chromium. Every tour is played end to end. Run them before shipping a UI change, and add one for each new UI behaviour.
- `src/packs/` sound sets and looks; add one file and list it in `src/packs/index.ts`. Guide: `docs/EXTENDING.md`.
- Never ship a move that is not covered by the numeric equivalence check.
- No UI framework; keep animation code direct.

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
