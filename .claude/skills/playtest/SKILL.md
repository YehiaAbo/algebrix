---
name: playtest
description: Scout hard math problems from real sources and play them in Algebrix by keyboard and mouse only, to find missing mechanics, wrong math and friction. Use for any playtest, problem-bank or "does technique X really work" round.
---

# Playtest

The point is to find what Algebrix can't do yet, by doing real problems the way a person
would. A problem that fails is good news: it points at a mechanic to fix.

## Files (read these first, in this order)

- `playtest/CAUSES.md`: the open causes. Every failure ever found points to one of these.
- `playtest/BANK.md`: one row per problem, with its source, answer and last outcome, plus
  coverage counts by strategy.
- `playtest/play.mjs`: the driver. `node playtest/play.mjs session.txt` runs one session
  file (its header lists the commands) and prints what the screen shows after each line.
- `playtest/runs/`: raw notes of the current round only (see Compress).

## The loop

1. **Scout.** Pick problems for the strategies with the lowest counts in BANK.md. Take them
   from openly licensed, trustworthy books and course sets (OpenStax, MIT OCW, Active
   Calculus, APEX, Paul's Online Notes and the like). Prefer the late "extension" exercises
   and ones with a trap: an extraneous root, a domain limit, a sign flip, a hidden
   substitution. Record the exact source (book, section, exercise number, URL).
2. **Check the answer outside Algebrix.** Use the source's answer key when it has one, and
   confirm it with sympy (`pip install sympy`) or by substituting back. Never take an
   answer from Algebrix's engine. If the key and sympy disagree, work it out by hand and note it.
3. **Play it, by hand first.** Fresh session (`key i`, `key Control+a`, type it, Enter).
   Only keys, typing and clicks on what is drawn. Never call the app's functions to make a
   move. First pass with no shortcuts: no `e`, no entries marked as a shortcut or chain, no
   one-press formulas. Do it the way a strong student would on paper. Then, if it worked,
   note whether a shortcut makes it faster. Budget: if one step needs more than three
   attempts, or the problem needs about three times the keystrokes a person writing it
   on paper would spend, stop and record it.
4. **Record the outcome** in a run note, one line per problem:
   - `✓` done by hand · `◐` only with a shortcut (a composability failure) ·
     `✗` stuck · `⚠` wrong math (a false step accepted, a right step refused, a wrong
     answer). `⚠` outranks everything and gets fixed first.
   - Plus friction notes: the exact keys that felt clumsy, and what paper would do.
5. **Diagnose to one cause.** For every failure, ask what general mechanic is missing or
   clumsy, not what this problem needs. Name the cause in terms of the mechanic ("sub in
   can't match a side up to a constant"), never the problem ("can't do 7.3 #24"). Look for
   an existing cause in CAUSES.md first and add the problem to it. Two failures with the
   same cause are worth more than one; that's what makes a fix general. Kinds, for sorting:
   type (can't write it), aim (can't pick the piece), move (missing), clumsy (too many
   keys), find (exists but couldn't be found from the menus), check (the safety net is wrong),
   show (the answer or a step reads wrong).
6. **Fix the cause, not the problem.** Fix the most-blocking cause (by severity, then by how
   many problems it blocks). Test-first in the engine; an e2e test for a UI behaviour. No
   code may mention a problem's numbers or shape. If a fix needs a new move, write the
   technique as a chain of general moves first (`docs/specs/2026-11-20-general-moves.md`).
   For a visible behaviour, use the `microdesign` skill before building it.
7. **Retest.** Replay the original problem, plus at least one sibling it has never seen
   (scouted after the fix: different numbers and a different surface). Add the sibling to
   the bank. A cause is fixed only when both pass.

## Compress (every round, before committing)

- Fold the run notes into CAUSES.md and BANK.md, then delete the run notes in the same
  commit. Git keeps them.
- CAUSES.md: an open cause is at most four lines (statement, kind, problems, idea). A fixed
  one collapses to a single line with its commit.
- BANK.md: one row per problem; outcome is the latest only. If it grows past about 150
  rows, split it by topic into `playtest/bank/<topic>.md` and keep BANK.md as the index and
  the coverage counts.
- The session files that solved a problem are worth keeping only when they show a non-obvious
  route; save those in `playtest/routes/` and link them from the bank row.

## Report

Lead with the counts (✓ ◐ ✗ ⚠), then the causes in order of severity, each with one
example. Say which cause you will fix next and why.
