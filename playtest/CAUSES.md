# Causes

Every failure found in a playtest points to one of these. Open causes first, most blocking
first. A fixed cause collapses to one line with its commit.

## Open

- **C3 No hand route for a sign question.** (move) A product or quotient ≤ 0 has no "split
  into cases" or sign chart you drive; only `e` answers it. A06.
- **C4 Tab f still factors a quartic in one press.** (shortcut) Taking out your own factor works now
  (below), but the one-press full factoring sits right beside it and does the thinking. A07.
- **C6 Two-equation systems go silent.** (show) `e` and Tab k on a system do nothing, with
  no message. A12.
- **C7 Step labels show code text.** (show) "move sqrt(x + 2) across" instead of √; floating
  move names pile up on top of each other in flash mode. A03.
- **C8 Cases from two splits are hard to find.** (find) After an |…| split and then a
  zero-product split, number 2 is the factor case, not the other |…| case. A04.
- **C9 Partial fractions only for distinct linear factors.** (move) Tab v doesn't apply to
  2x(x + 1)², and the hand route (name the unknowns, put in values) isn't clear. A13.

## Fixed

- C5 Tab l didn't apply to ln(a^b): a plain simplify gave the same result first and took its key. Named rules now come before "simplified".
- C4a No way to test a root or divide by your own factor: Tab + q on a polynomial takes out a factor you type and shows what is left over. A07 by hand.
- C10 Cases were treated as a system: subbing or adding one case into another now resists, and Tab shows "(n) is another case".
- C2 (−a)² stayed as it was: s drops the minus under an even power (023fef5).
- C1 Exponent laws only went one way: Tab p splits or combines a power, f i undoes any fractional power, s cancels a root (A01 A02 A08 A11, siblings 2.6 #10 #42 #44, 6.6 #27) (023fef5).
