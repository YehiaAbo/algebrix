# Causes

Every failure found in a playtest points to one of these. Open causes first, most blocking
first. A fixed cause collapses to one line with its commit.

## Open

- **C10 Cases are treated as a system.** (check, ⚠) The two cases of a split (u = A, u = B)
  are separate equations, and Tab + number subs one case into the other, giving a false
  A = B as a step. Cases are "or", not "and"; sub in between siblings should refuse. Found
  retesting A11.
- **C2 s misses (−a)² = a².** (move) An even power of a negation stays as it is, so after
  squaring −√(x + 2) the next step needs `e`. A03.
- **C3 No hand route for a sign question.** (move) A product or quotient ≤ 0 has no "split
  into cases" or sign chart you drive; only `e` answers it. A06.
- **C4 Can't test a root or divide by your own factor.** (move) Rational root theorem by
  hand needs "put in x = 2" on a polynomial and "divide by (x − 2)"; p refuses on an equation
  in one letter and long division takes no divisor. Meanwhile Tab f factors a quartic in one
  press (does the thinking). A07.
- **C5 Log rules don't apply to an aimed ln(a^b).** (find) Tab l says the form doesn't
  apply, yet `e` uses the power rule. A10.
- **C6 Two-equation systems go silent.** (show) `e` and Tab k on a system do nothing, with
  no message. A12.
- **C7 Step labels show code text.** (show) "move sqrt(x + 2) across" instead of √; floating
  move names pile up on top of each other in flash mode. A03.
- **C8 Cases from two splits are hard to find.** (find) After an |…| split and then a
  zero-product split, number 2 is the factor case, not the other |…| case. A04.
- **C9 Partial fractions only for distinct linear factors.** (move) Tab v doesn't apply to
  2x(x + 1)², and the hand route (name the unknowns, put in values) isn't clear. A13.

## Fixed

- C1 Exponent laws only went one way: Tab p splits or combines a power, f i undoes any fractional power, s cancels a root (A01 A02 A08 A11, siblings 2.6 #10 #42 #44, 6.6 #27).
