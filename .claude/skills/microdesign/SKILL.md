---
name: microdesign
description: Think through a new or changed Algebrix behaviour before building it, from different interaction models down to every key, edge, sound and animation. Use before adding a move, key, panel or animation, or changing how one feels.
---

# Microdesign

How Algebrix feels is decided by small things: what a key does when held, what happens at
an edge, what undo plays. Most of the user's feedback has been about these. Think them
through before writing code, not after.

## 1. Explore first (a few lines, not a document)

- Write down the obvious design. Then two genuinely different ones: a different key model
  (tap, hold, chord, typed), a different place (on the equation, in the tree, in the bar), or
  no new control at all (an existing general move that already does it).
- For each, ask: does it make the math freer or just add a menu entry? What does it cost
  later (keys used up, things that must stay consistent, more to learn)?
- Pick one and say why in a sentence. If the choice changes what the user asked for, ask them.
- When the difference is about feel, make a quick throwaway mockup instead of arguing.

## 2. Walk every state of the chosen design

- **Keys:** tap, hold, hold-and-release, key repeat, a second press, Esc, Enter. Single keys,
  no Shift for common moves. Does it clash with a key already taken (`?` lists them)?
- **Mouse:** the same action by click, and by box select where it makes sense.
- **Aim:** what is aimed before and after. Fractions, powers, deep pieces, a whole side, nothing.
- **Edges:** nothing applies, the end of a list, an empty equation, nine equations. Edges do
  nothing silently; a refused move resists (the nudge and the low sound) with a reason in
  the bar. No pop-ups.
- **Undo and redo:** one press undoes the whole action and plays the same mechanics back.
- **The tree:** what step label it leaves, and whether a fork or link appears.
- **Feedback:** the sound, the animation (pieces move, merge and are carried; never a plain
  fade), the bar text (short, plain words), flash mode, and both themes.
- **Checking:** what the safety net compares, and what conditions the step records.

## 3. Prove it

Every behaviour above that matters gets an e2e test that presses the real keys. Then look
at it: screenshots in both themes, and play it at normal speed, not only flash.
