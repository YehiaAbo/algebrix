# Causes

Every failure found in a playtest points to one of these. Open causes first, most blocking
first. A fixed cause collapses to one line with its commit.

## Open

- **C1 Exponent laws only go one way.** (move) A power can't be rewritten as a power of a
  power or back: x^(2/3) ↔ (x^(1/3))², e^(2x) ↔ (e^x)², x⁴ ↔ (x²)², ((x − 1)^(3/4))^(4/3) ↔ x − 1;
  and f i can't undo a fractional power. Blocks every substitution on a quadratic form
  and every rational-exponent equation. A01 A02 A08 A11.
  Idea: one Tab form pair "as a power of a power" / "combine powers" on any aimed power
  (with the even-root condition recorded), and f i on a^(p/q).
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

(none yet)
