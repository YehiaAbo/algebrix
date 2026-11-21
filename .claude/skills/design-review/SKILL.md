---
name: design-review
description: Critique and polish Algebrix's screens, adapted from Impeccable (pbakaus/impeccable). Use for a polish round, a blind self-critique, or before showing the user a visible change.
---

# Design review

Borrowed from Impeccable's critique, distill, harden, clarify, polish and audit commands,
and bent to Algebrix: a keyboard-first instrument where every key press moves the math.
Skip anything that adds decoration: Impeccable's bolder, colorize, delight and overdrive
push toward effects, which is the bloat Algebrix avoids.

Look at real screenshots (both themes, 1440 wide and a narrow window) taken by driving the
app, not at code. Then go through these, in order.

1. **Critique.** In one paragraph: what is this screen for, and does it look like it? What
   does the eye land on first, and is that the math? Anything that reads as generic web-app or
   "AI-made" (cards everywhere, gray-on-color text, default fonts, random accent colors)?
2. **Distill.** What could go? An empty panel, a label that repeats the key row, a second
   way to do the same thing, a toggle nobody needs. Removing beats restyling.
3. **Clarify.** Every visible word: is it short, plain, and in the user's terms, not code
   names? Does the bar say what happened and what to do next?
4. **Harden.** Long equations, deep nesting, nine equations, huge numbers, a narrow window,
   an empty state, a refused move, typing nonsense. Nothing overflows, overlaps or jumps.
5. **Motion.** Every key press animates (that's the product, unlike Impeccable's defaults):
   pieces move with the math, the resist nudge is springy on purpose, nothing simply fades.
   Check timing at normal speed and in flash mode, and that nothing stutters.
6. **Polish.** Alignment, spacing rhythm, the math typesetting (TeX quality: operators, limits,
   fractions), focus states, both themes equally finished.
7. **Audit.** Contrast, keyboard reachability of everything, reduced motion, frame rate on a
   long solve.

Fix what you find in small, separate commits, each checked by a screenshot. Report what
you changed and what you chose to leave.
