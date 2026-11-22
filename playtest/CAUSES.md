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
- **K6 A cache key that leaves out an input.** The graph's slow-equation grid was cached by
  equation and view but not by grid size; when the size changed it read past the end and threw
  (on I(t) definitions). The size is now part of the key. Same class: y = I(5) was cached as
  "no value" from the moment before I was defined. Every cache that evaluates now adds defsSig
  (what the defined functions say). Rule: a memo key names every input.
- **K7 Layout changed inside a ResizeObserver callback.** The graph, the stage and the tree
  redrew inside the observer, so the browser looped. One onResize helper runs them on the next
  frame. Guard: e2e output has no "ResizeObserver loop".
- **K8 What a function is depended on spelling and on a registry.** `F(v) = …` always became
  a frozen definition (moves refused, e refused), even f(a) = 10 with f already defined, and
  I(5) typed before I existed read as I·5. Now a definition is an ordinary equation that also
  defines its name (only when the name is new), s and e see through defined functions, and
  the b box always reads F(…) as a function. Guard: tests/functions.test.ts, e2e byhand.
- **K9 The safety net's verdict depended on history and ignored scale.** Its sample values came
  from one running random stream, so a move could pass or fail depending on what had been
  checked earlier in the session; and it compared lhs − rhs to 10⁻⁶ absolutely, so a side worked
  out numerically (∫₀¹ x^t dx near t = −1) failed by 10⁻⁶ while both sides were about 3. The
  Feynman chain from a typed I(t) stopped at random. Now every check starts the stream afresh,
  and the tolerance grows with the size of the sides. Guard: tests/functions.test.ts "the safety
  net gives the same verdict".
- **K10 A move's own result wasn't a valid place to press it again.** m moved x across as −x, but
  the aim landed on the x inside the minus, which m refused ("x is inside −x"), so holding m
  stopped after one or two crossings; and f(x) with no definition had no value, so the safety
  net refused moving it at all. Now m on a piece inside a minus moves the whole −piece, and while
  checking a move an undefined f is "some function" (one fixed function per name). Guards:
  tests/moves.prop.test.ts (m, m, m ping-pongs over random equations; RUNS=… SEED=… for more),
  and the stress suite now presses m three times on every term it moves.
