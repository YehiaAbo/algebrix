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
- **K11 Work done inside the key press that the frames needed.** Every move re-sampled the
  graph's implicit curve (15,000 evaluations) and the move bubble read its own width right after
  the stage changed, laying out the whole page mid-press. A step that keeps the same solutions
  now keeps the curve it has; the graph redraws after the move plays; the bubble is measured the
  next frame. And a move that lands on an earlier step went back to it without carrying the aim,
  so the 4th m in a row moved the whole side. Guard: stress presses m four times; the frame
  meter (`) measures where the app actually runs.
- **K12 Motion faster than the frames could show it.** On a 144 Hz screen the app felt like 30 fps:
  the shared ease cubic-bezier(.2,.8,.16,1) over 260 ms did a third of each trip in the first 3
  frames and up to 11% per frame, which the eye reads as a skip. Several places also carried
  their own copy of it, and the aim box moved by left/top (layout, main thread). Now one glide
  (SMOOTH, and CSS --ease) everywhere, at most about 6% per frame at 144 Hz, a little longer for
  long trips; the aim moves by transform. Rule: a new animation uses SMOOTH, never its own curve.
- **K13 The letter of an ∫ with no bounds counted as an unknown that depends on t.** d/dt both
  sides of I(t) = ∫ (x^t − 1)/ln x dx read x as x(t) and had no rule for it, and the safety net
  could not work out an ∫ with no bounds at all, so it refused anyway; then e integrated inside
  before differentiating. Now the letter of ∫ … dx is its own, a check reads each ∫ … dx (and a
  function defined by one, and its slopes) as ∫ from a fixed start to x, and d/dt goes under an
  ∫ with or without bounds before anything inside is worked out. Guard: tests/functions.test.ts.
- **K14 One box moved by two engines.** The aim box glided its position on the compositor but its
  size by width/height on the main thread, snapping edges to whole pixels, so walking with the
  arrows looked less smooth than the screen's rate. It is now nine pieces that only move by
  transform (aimBox in shared.ts). Rule: anything that moves every key press moves by transform.
- **K15 Fixes landed in one move instead of where the gap was.** K13 taught only d/dt both sides
  to give an ∫ with no bounds a value, so the very next move (∫ both sides dt on I′(t) = …) hit
  the same wall. Two more gates stood in the way: I′(t) = … typed or reloaded was read as a new
  definition (a primed name defining itself), and several both-sides moves (∫ both sides, a
  function of both sides, adding an equation in) refused anything marked a definition, though a
  definition is an equation. Now the evaluator itself reads ∫ … dx as one fixed antiderivative
  whenever the safety net checks (so every move gets it; the special case in d/dt is gone), a
  primed name never defines, and every both-sides move takes a definition as the equation it is.
  When an integral truly has no formula (eᵘ/u, sin u/u, e^(−u²), 1/ln u, sin u²) e says which
  famous one it is instead of "no rule fits". Rule: when a fix is about what something *is* (has
  a value, is an equation), put it where that is decided, not in the move that tripped on it.
  Guard: tests/functions.test.ts (K15).
- **K16 The f menu only knew one thing to do with a function: put it on both sides.** Your own
  functions sat on 1–9 but only wrapped both sides, so there was no way to put a value in from
  the menu; and the 1–9 handler refused before the families saw the key, so square (2), cube (3)
  and flip (1) had silently stopped working, as had b to the (b, taken by naming). Inverses of your
  functions didn't exist: f⁻¹ couldn't be typed (f^-1(x) read as a power), had no value, never
  cancelled, and i (undo the outer layer) ignored calls. Now 1–9 put a value in (Enter on nothing
  still wraps both sides), the families use letters (q, u, v, p), f⁻¹ parses wherever f is a
  function, has a value from f itself before its formula exists (and s finds exact ones), cancels
  f both ways for a one-to-one f, i and m undo your f (refusing, with the reason, when f isn't
  one-to-one), and - writes out f⁻¹. s leaves f(4) alone in f(4) = 2·4 + 3 (it is the subject).
  Rule: one key, one meaning in a menu; a menu row never swallows keys another row shows.
  Guards: tests/functions.test.ts (K16), e2e byhand "your functions in the f menu".
- **K17 "Values" were read as numbers only, and I fixed the entry point I assumed.** Asked three
  times to put values into functions, I made your functions take values (K16) but never opened
  the f menu's own boxes (power n, nth root, b to the, log base b), which refused anything with a
  letter ("use a plain number"). Adding a multiple of another equation refused letters the same
  way. Now every box takes anything algebraic: a letter in the power or base goes through the
  general any-function move (checked the same way) and records what the letters must be (n ≠ 0,
  a > 0, a ≠ 1, and that it can add solutions). Rule: when the user says a thing doesn't work,
  try every place that thing is entered before saying it's fixed, with letters and expressions,
  not only numbers. Guard: tests/functions.test.ts (K17), e2e byhand.
- **K18 A function meant one letter, and an inverse meant the whole real line.** A definition held a
  single letter, so f(x, y) = … couldn't be typed (f(1, 2) didn't parse), and a function that
  isn't one-to-one everywhere (x², 4 − x²) got "can't be solved for x" with no way forward. Now a
  definition keeps all its letters (f(x, y), values in order or by name, simultaneous unfolding,
  slopes through the definition), and an inverse looks at the letter's domain: with x ≥ 0 it takes
  the branch that gives every input back (x² + 1 → √(x − 1)), and says plainly when the function
  still turns around inside it. The graph draws a one-to-one function's inverse as its mirror
  image in y = x. Guard: tests/functions.test.ts (K18), e2e byhand.
- **K19 A feature that works but can't be found is not built.** Values into your function (v58) hid
  behind "press 1, then type"; the owner couldn't find it. The f menu now opens with its input box
  on top, saying what goes in it (f(4), f(x² + 1), ln, e^_), and pressing your function's letter
  starts typing it (the closing bracket can wait). Rule: put a feature where the user would look
  first (the f menu's box for anything typed into a function), and check discoverability with a
  screenshot of the menu as it first opens, before calling it done. Guard: e2e byhand.
- **K20 Two pieces on screen shared one name, and the first was never cleared.** The stage keys
  each glyph by its node; brackets were keyed by the node they wrap, so a call's own brackets and
  the brackets a power or ln put around it, (g(x))², ln(I(t)), had the same key. The second
  replaced the first in the stage's map, and the first stayed in the page forever (it piled up,
  even across loading a new equation). Now repeated keys are numbered the same way every render,
  and each render removes anything on screen that no layout owns. Separately, e "solved" I′(t) =
  1/(t + 1) for t (multiplying out); an equation true for every value now says so instead.
  Rule: the stage must hold exactly what the layout says, checked after every key in the stress run.
  Guards: stress (strays after every move and undo), e2e byhand.
- **K21 A value went into the wrong form of a function.** The f menu box read f(…) from the
  definition, so with I′(t) = 1/(t + 1) on screen, I′(0) went back to the integral. Now the form in
  front of you comes first, when it holds for every input (an identity, a definition, or a form up to
  + C like I(t) = ln|t + 1| + C); a claim like f(x) = 7 picks x, so the definition is used. Derived
  names (f′, f″, f⁻¹) are worked out from f. Underneath: a fresh workspace (and the tour) parsed its
  first line against the previous workspace's definitions, so f(x) = … there could read as a claim
  about an old f. Rule: anything read from the screen (what's defined, which form) is synced when the
  workspace changes, not on the next render.
  Guards: functions.test.ts K21, e2e byhand (the f menu box reads the function in front of you).
- **K22 A fraction over a quadratic with no rational roots had no next step.** Partial fractions
  only knew linear factors, and (Bx + C)/(x² + px + q) had no rule; u-sub also missed a top that is a
  constant multiple of the bottom's slope ((x + 1)/(x² + 2x + 5)). Now partial fractions keep
  (Bx + C)/q pieces (q, q², two quadratics in x²), the top splits into the slope plus a number (a log
  and a tan⁻¹), and u-sub cancels a letter that only shows. Guards: tests/bookround.test.ts.
- **K23 Plugging ∞ in skipped the thinking.** At ∞, plug in took the numeric value of anything, so
  (1 + 1/x)^x became e in one press, and the moves a student uses were missing (the message even named
  a "divide by the highest power" that didn't exist). Now plug in names the form in the way (∞/∞, 0·∞,
  ∞ − ∞, 1^∞), C has h (÷ highest power), j (conjugate), q (0·∞ as a fraction), g (power down), and
  values like π/2, e, ∞ come out exact. eˣ toward ∞ no longer reads as "no value" (overflow is ∞), and
  the safety net compares sides that are both ∞. Guards: bookround.test.ts, e2e calc.
- **K24 |g| and undefined ends stopped definite integrals.** ∫₀² |x − 1| had no move, and the numeric
  check failed at a corner; [x² ln x]₀ had no value at 0. Now e splits at each turn (exact, π/2 and √2
  too), and an end with no value goes in as a one-sided limit (evaluated that way too).
  Guards: bookround.test.ts.
- **K25 log₂ turned into ln/ln the moment it was typed.** The base was kept as ln a/ln b, and shown that
  way, so log rules (log₂ a + log₂ b) and undoing it (2 to both sides) had nothing to grab. Now ln a/ln b
  with b a whole number is drawn and printed as log_b(a), its logs combine, f i takes b to both sides,
  and b^(log_b a), log_b(b^E), log₂ 8 simplify. Guards: bookround.test.ts, e2e byhand.
- **K26 The solve-for chooser couldn't take y′.** "Press the variable" only took one key. Now y waits for
  a prime when y′ is there (y then '). Every C item that doesn't apply says why (its own error), and
  u-sub aimed at the wrong piece names the one that works. Guards: e2e byhand.
- **K27 sin³x had no way to split off one sin.** Tab d ("one factor out") writes aⁿ as a·aⁿ⁻¹, so
  the odd-power technique (sin²x = 1 − cos²x, then u = cos x) is all general moves. Guard: bookround.
- **K28 A tapped C or Tab hub swallowed every later key.** Tapped and released, the hub stays open to
  browse, and then refused anything not on it, so a typed equation or e vanished. Now a key the hub
  doesn't show closes it and acts as usual (the K2 rule: a key means one thing). Guard: e2e byhand.
- **K29 Squaring both sides had no key of its own, and the tree heads collided.** ^ now opens the
  both-sides box as a power (2 offered when a side is a root). Heads drop their offers, then tags,
  where two would touch; a sibling case or a failed answer offers nothing to sub in. Guard: e2e byhand.
- **K30 Adding equations left every term uncollected,** so Tab k "eliminated" z with z still on the
  page. = #n and Tab k now follow with a "collect like terms" step. Guard: e2e byhand.
- **K31 The f box doubled what you typed:** V then ( gave V((, and V then '' added primes to the V″ the
  box offered. Typing the name yourself now goes on from what the box started. Guard: e2e byhand.
- **K32 Related rates had no way through.** ÷ dt left (2x dx + 2y dy)/dt; p refused with nothing aimed
  and took only single letters. Now ÷ dt writes rates, p opens empty for x = 3, y = 4, dx/dt = 2, and
  e on an instant (an equation of values) solves for the rate. Guards: bookround, e2e calc.
- **K33 ⚠ dy/dx + 2 = 0 lost its + C** (the integrating factor with P = 0 gave e^C). Separable is now
  read from the slope whether or not y′ stands alone. Guard: bookround.
- **K34 ⚠ u-substitutions went back first in, first out,** so w = 1 − u² was put back after u = 2x and
  the check failed (∫ cos⁻¹(2x) dx stopped). Now the last one named goes back first. Guard: bookround.
- **K35 √(1 − cos A) had no route for e.** The half angle read backwards under a root gives
  √2·|sin(A/2)|, and the |g| split finishes definite ones (C2-3.2#111, K-H7, K-H8).
- **K36 An odd trig power on the bottom had no route** (∫ tan² sec = sin²/cos³, ∫ sec³). × cos/cos
  makes it even, cos⁴ = (1 − sin²)², then u = sin x and partial fractions. Guard: bookround.
- **K37 u = eᵗ failed when e⁻ᵗ was written too,** and 1/((u − 1/u)²u) had no route. e⁻ᵗ is now read as
  1/u, and little fractions inside a fraction clear by × uᵐ top and bottom before partial fractions.
- **K38 An integral that came back was solved for only when the side was that integral alone,**
  and by parts refused sin(ln x) on its own. The side is now remembered as m·I + b, and a lone
  function of ln v takes by parts. (C2-3.1#23, K-H14, K-H15.) Guard: bookround.
- **K39 A substitution on an improper integral failed:** the new end stayed cos⁻¹(1/∞), and tan θ near
  its pole read as undefined, so the numbers couldn't check the step. Ends at ∞ now land on the number
  they head to (π/2), and quadrature skips undefined points within 10⁻⁷ of an end. Guard: bookround.
- **K40 u-substitution left x behind when it was a line in u** (y³ with u = 1 − y³, x⁴ = (u − 1)²), never
  tried w = √u, and s left √u·u and u/u^(3/2) as they were. All four now go; odd sin over cos powers
  (sin⁵/cos⁶) keep one sin back too. Bank 314/314. Guard: bookround.
- **K41 A harder set (playtest/problems/hard1.txt, 30 problems) found seven gaps:** ∞ − ∞ of fractions
  in a limit (now one fraction, then L'Hôpital); a definite integral that comes back (now solved for,
  unless the rest still holds another integral, which just went round); u = ln x to ∞ (the numbers
  can't add up so slow a tail: the inside matching across the range is the check, the ends being
  g(a), g(b)); Σ of a fraction of polynomials (partial fractions, then it telescopes); x/cos²x had no
  by parts (a fraction is a product too); sin⁻¹ x was never tried as u; s left X − (X). 30/30.
- **K42 Sub in judged "anything shared" by letters only:** I(0) = 0 has no letters, so Tab + n
  said it didn't apply to I(0) = ln|0 + 1| + C. Now appearsIn(): a shared letter, an integral's
  letter, or a side written here. subIn replaces a side that is here when neither side is a letter.
- **K43 Fold needed the exact piece aimed:** after unfolding, an aim inside the integral (or no
  aim) couldn't fold it back. fold() now tries the aim, then each piece around it, else the first
  that folds anywhere.
- **K44 Typing f(a) = … decided "a is in the body" from raw text:** a inside ax or tan⁻¹(ax) has
  letters next to it, so I(a) = ∫ (tan⁻¹(ax) − tan⁻¹ x)/x dx read as I·a. Now usesLetter() asks the
  tokenizer. Also oo is ∞. Guard: tests/functions.test.ts (K44).
- **K45 du = x da + a dx couldn't sub into ∫ … dx:** a is fixed inside the integral, so da is 0; the
  new letter is the one written inside. And the u-sub chain now tries all three moves before playing
  any (it stopped halfway, leaving ∫ 1/(1 + u²) dx). Guard: tests/params.test.ts.
- **K46 An ∞ end with a parameter (a∞ for u = ax):** decided over a's domain; when its sign decides
  it, e says so and points at the letter card. **K47** a letter written outside the integral is a
  parameter, not tied to u. **K48** lim at ∞ with another letter: pieces in u alone go to their
  numbers (tan⁻¹ u → π/2). |a| is a when a > 0. Frullani end to end: e2e/general.
- **K49 Shift only pushed numbers out of √ and |…|, and only from the left:** a type gate (isConstNum)
  decided instead of the safety net, so √((n + 1)(n − 1)) wouldn't split. Now any factor goes out from
  either end and back in from either side; a rule that needs a part ≥ 0 records it as a condition
  (none when a Σ or ∫ range keeps it ≥ 0), and a refusal says what is needed. Also a^(mn) = (a^m)^n
  and a^m a^n = a^(m + n) by Shift. Guard: tests/slideout.test.ts, e2e/byhand.
