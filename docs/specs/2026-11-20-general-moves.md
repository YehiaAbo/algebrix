# General moves: every technique from a few tools

Date: 2026-11-20. Branch `general-moves`, forked from v29.

## The rule

Every common technique in algebra and calculus has to be doable with a small set of
general moves, definitions and theorems. The test is:

> Take away a technique's shortcut. Can you still do it comfortably?

If you can't, then either a general move is missing or the moves are too clumsy to put
together. Niche tricks can be left out. Anything you would meet once or twice in a
course has to work.

## How v29 broke the rule

- Calculus grew as a menu. Each request became one more entry in C (u-sub, separate the
  variables, integrating factor, characteristic equation, general solution, Lagrange,
  Taylor, geometric series, p-series). Each entry jumped from the problem to the result
  and made the choices for you.
- Because the numeric check accepts any correct result, a shortcut was always cheap.
  Nothing pushed toward breaking a technique into smaller moves.
- Some things were impossible without the shortcut:
  - There was no way to name a piece (let u = x²).
  - You could only substitute a letter, never an expression, and never dx.
  - You couldn't integrate both sides of an equation unless it was already written in
    differentials.
  - You couldn't move d/dt inside an integral.
  - You couldn't put a value into an identity.
  - Sums had two shortcuts and nothing else.

## The toolset

The whole app is these moves. Everything else is a fact the moves use, or a shortcut
built from them.

1. **Rewrite a piece.** Aim at it and rewrite it in an equal form (Tab forms, s simplify,
   d distribute, factor, slide). This works anywhere, including inside ∫, Σ, ∏, lim and
   d/dx.
2. **Do the same thing to both sides.** The arithmetic operations + − × ÷ (o, or the
   keys = - . /), any function (f), and the calculus operations: d/dv of both sides
   (C d) and ∫ … dv of both sides (C i).
3. **Name it (b).** Aim at a piece, press b, then type one of these:
   - a new letter, such as `u`. This gives a new equation `u = x²`, and the piece
     becomes u everywhere in this equation.
   - a function of a letter, such as `I(t)`. This gives a definition `I(t) = ∫ …`, and
     the piece becomes I(t).
   - an expression, such as `sin(θ)` when aimed at x, or `e^(rx)` when aimed at y. This
     gives `x = sin θ`, and x is swapped for sin θ. When y is a function, y′ and y″
     become d/dx of what you typed.
4. **Sub in (hold Tab + n).** Replace a piece using equation n, in either direction,
   whether the piece is a letter or a whole expression. A differential equation such
   as `du = 2x dx` changes the variable of an integral: dx becomes du/(2x).
5. **Put in a value (p).** A statement that holds for every t, such as `I(t) = ln(t + 1) + C`
   or a definition, becomes a new equation at t = a.
6. **Use a fact.** Apply one theorem or definition to the piece you aimed at. That
   takes one step, and you choose where it goes. The facts are:
   - the derivative rules;
   - the integral table and linearity;
   - by parts and the fundamental theorem;
   - Leibniz's rule;
   - the limit laws and L'Hôpital;
   - the sum rules and known sums;
   - the quadratic formula and the zero product rule.
7. **Split into cases.**

**e** is the autopilot. It plays these same moves one after another, so every step it
takes is a real step in the tree.

## Facts and shortcuts

- A **fact** is one theorem or definition used once, in the place you aimed. Examples:
  the chain rule, ∫ u dv = uv − ∫ v du with your choice of u, d/dt ∫ f dx = ∫ ∂f/∂t dx,
  and Σ k = n(n + 1)/2.
- A **shortcut** makes choices for you and takes several steps. Shortcuts stay, because
  being fast matters. But each one is now a chain of the general moves, played into the
  tree step by step, so you can see it and replay it.

## Techniques written as chains

Each row says what the technique is when you do it by hand.

| Technique | Chain of general moves |
|---|---|
| u-substitution | b on g(x), name it u → in u = g: C d gives du = g′ dx → sub in: dx = du/g′ → s → C i → sub back u = g |
| trig substitution | b on x, type sin θ → C d: dx = cos θ dθ → sub in → Tab trig forms → C i → sub back |
| by parts | a fact (∫ u dv = uv − ∫ v du), with u the factor you aim at |
| definite integral | C i on the integral → C p (fundamental theorem: plug in the bounds) |
| separable ODE | Tab as differentials (dy = … dx) → ÷ g(y) both sides → C i both sides → solve for y |
| integrating factor | × μ both sides → d distribute → Tab "product rule backwards" gives (μy)′ → C i both sides → ÷ μ |
| constant-coefficient ODE | b on y, type e^(rx) → C d rules → Tab factor → ÷ e^(rx) → solve for r → general solution (a fact) |
| undetermined coefficients | b on y, type A cos x + B sin x → C d → p (put in two values of x) → solve the system |
| Feynman technique | b on a constant, name it t → b on the integral, name it I(t) → C d both sides → Leibniz (C d) → rules → C i → C p → C i both sides dt → p at t = 0 → sub in → p at the value you want |
| critical points | C d (the derivative) → = 0 → solve |
| Lagrange | the Lagrange condition ∇f = λ∇g (a fact) → split into components → solve the system |
| L'Hôpital | a fact on a 0/0 limit, then the derivative rules and plug in |
| limit of f^g | Tab: as e^(g ln f) → the limit moves inside e^ (limit law) → L'Hôpital |
| telescoping sum | Tab partial fractions → split the sum → shift one index → peel the ends → cancel |
| Σ k, Σ k², Σ rᵏ | known sums (facts) on a Σ with any upper bound n |
| infinite series | Σ to ∞ = lim of the partial sum to N (definition) → known sum → the limit |
| product ∏ | split, pull out constants (c becomes c to the number of terms), ln of a product as a sum, write out, known products (∏ k = n!) |
| completing the square | Tab completed square (a form) |
| quadratic formula | a fact (or complete the square, then roots) |
| partial fractions by hand | b on the top, type A(x + 1) + B(x − 1) → p at x = 1 and x = −1 → solve |

## Checking

Every step still goes through the numeric safety net. These parts are new:

- **Named letters.** A letter made with b is not a free variable. In any equation that
  still mentions what it stands for, the check gives it that value (u = x²). This is why
  integrating ∫ 2x cos(u) dx as if u were a constant is refused: u is still tied to x.
- **Letters in the bounds of a sum.** These are sampled as whole numbers, so
  Σ_{k=1}^{n} k = n(n + 1)/2 can be checked.
- **Leibniz's rule** is in the kernel as well, so d/dt ∫ … dx has a value to check against.
- **Put in a value** is a one-way (⇒) step. It is only allowed on a statement that holds
  for every value of the letter.
