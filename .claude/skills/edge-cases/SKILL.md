---
name: edge-cases
description: Before calling any Algebrix feature or fix done, list its edge cases across every axis (inputs, equation states, entry points, aim, screen, maths) and run them all in the real build. Use for every new feature, every fix the user reports, and before each publish.
---

# Edge cases

The user should never be the one who finds the case nobody tried. Most misses so far were not
hard: a box that refused letters, a feature hidden behind a key, a prime that didn't parse,
brackets left on screen. Each was one axis nobody walked. Walk all of them.

## 1. List the cases (write them down, 30 or more for a real feature)

Go axis by axis. For each, write the concrete equations and keys, not categories.

- **What is typed:** a number, 0, a negative, a fraction, a letter, the same letter as the
  variable, another letter, an expression (x² + 1, e^t + 1), a nested call (f(g(x))), ∞,
  nothing, junk, an unclosed bracket, unicode (², ⁻¹, ′) and ASCII (^2, ^-1, ').
- **What it applies to:** f, f′, f″, f⁻¹, f(x, y), I(t) with an ∫ (bounds and none), a name
  with a subscript or a Greek letter, a function that is not defined, one defined twice, one
  that isn't one-to-one.
- **Where the equation is:** a definition, an ordinary equation, a step deep in a chain (after
  d/dt, ∫, simplify), an expression, an inequality, a proof, after undo, after redo, after a
  branch, in another equation than the current one, with nine equations already.
- **How it is reached:** every way in: the key, the chord (hold), tap-to-stick, the menu's box,
  arrows then Enter, the mouse, the typed line, p, Tab, C, f. Each must do the same thing.
- **The aim:** nothing, a whole side, a deep piece, a piece inside the thing being changed.
- **The screen:** both themes, a long equation, a fast second key press mid-animation, flash
  speed. Nothing may stay on screen that the equation doesn't have (stress checks strays).
- **The maths:** values outside the domain, a 0 on a bottom, a divergent integral, a value that
  makes a side undefined, a step that can add or lose solutions (is the condition recorded?).
- **Can it be found?** Screenshot the menu or bar as it first opens. Would a first-time user
  see where to do this? If not, it isn't built.

## 2. Run them in the real build

Write a probe (a Playwright script in the scratchpad, `NODE_PATH=$(npm root -g) node probe.cjs`)
that plays each case by keys on `dist/index.html` and prints: the equation before and after,
the bar text, errors in the console, and strays on the stage. Read every line. A refusal must
give a reason that says what to do instead. Fix the root cause of each miss (playtest/CAUSES.md
gets a K entry), then add the worst few cases to e2e or stress so they stay fixed.

## 3. Then the adjacent cases

Ask what the user will try next with this feature (the same thing on f′, on two letters, from
the other menu) and do those too, unprompted.
