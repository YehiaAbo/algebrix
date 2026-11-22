# Causes

Every failure found in a playtest points to one of these. Open causes first, most blocking
first. A fixed cause collapses to one line with its commit.

## Open

- **C3 No hand route for a sign question.** (move) A product or quotient ≤ 0 has no "split
  into cases" or sign chart you drive; only `e` answers it. A06.
- **C4 Tab f still factors a quartic in one press.** (shortcut) Taking out your own factor works now
  (below), but the one-press full factoring sits right beside it and does the thinking. A07.
- **C8 Cases from two splits are hard to find.** (find) After an |…| split and then a
  zero-product split, number 2 is the factor case, not the other |…| case. A04.

## Fixed

- C7 Move names, the tree and the bar showed code text (sqrt, ^2) and piled up in flash mode: they read √ and ² now, one name at a time.
- C9 Partial fractions only for distinct factors: Tab v now gives a term per power of a repeated factor, and p refuses a value that zeroes a bottom ("multiply it out first"). A13 by hand: type the identity, × both sides, d, s, then p x = 0 and x = −1.
- C6 (was misread as "systems go silent") The quadratic formula needed number coefficients: Tab g now takes letters in a, b, c and says when b² − 4ac is never above 0. A12 by hand: −6#2, Tab g, then p y = 0.
- C5 Tab l didn't apply to ln(a^b): a plain simplify gave the same result first and took its key. Named rules now come before "simplified".
- C4a No way to test a root or divide by your own factor: Tab + q on a polynomial takes out a factor you type and shows what is left over. A07 by hand.
- C10 Cases were treated as a system: subbing or adding one case into another now resists, and Tab shows "(n) is another case".
- C2 (−a)² stayed as it was: s drops the minus under an even power (023fef5).
- C1 Exponent laws only went one way: Tab p splits or combines a power, f i undoes any fractional power, s cancels a root (A01 A02 A08 A11, siblings 2.6 #10 #42 #44, 6.6 #27) (023fef5).

## Bug classes

A bug found anywhere (playtest, stress, the user) is logged here by its class, fixed for the
whole class, and guarded by a test that would catch any member of it. `npm run stress` plays
every core key on stress/corpus.txt; add an equation there for each new class.

- **K1 Pieces with no value break the safety net.** A divergent integral (or any piece that is
  NaN everywhere) made the numeric check refuse every move. Fixed in checked(): ties put back,
  valueless pieces compared as atoms, then a local check of the one changed piece.
  Guard: tests/divergent.test.ts, corpus lines with ∫ (x²+1)/ln x.
- **K2 A question holds the keys hostage.** After e on a two-letter equation the "solve for
  which letter?" prompt refused every key, so u could not undo. A prompt now takes only its
  answer; any other key closes it and does its usual job. Guard: stress (u returns to the start
  after every key, on every corpus line).
- **K3 Per-frame work grows with the screen.** The graph redrew its grid and re-read the theme
  and its size every frame; the tree, the hint bar and the rail rewrote unchanged DOM every
  key. Now: static layers cached, sizes from ResizeObserver, every write diffed.
  Guard: stress flags any key that blocks over 50 ms; perf probe budgets.
- **K4 A sign change taken for a zero.** The graph called the pole of (2x + 3)/(x − 1) = 5 a
  crossing (x ≈ 1, 2.667) and framed the view around it, 100 units off. Every root finder in
  the graph now goes through one bisectRoot that rejects a bracket where f blows up instead of
  closing in on 0. Guard: e2e polish "a pole is not a crossing".
- **K5 A class's display beat the hidden attribute.** The replay bar (display: flex) showed as an
  empty dark pill under every equation. One global `[hidden] { display: none !important }`
  replaces eleven per-class rules, so no element can show while hidden.
