# Algebrix history: what was asked, liked, rejected and built

Written 2026-11-22 from: the project chat and both threads ("Make every technique doable
without shortcuts", 11-16 to 11-20, and "Assess app against paper-freedom philosophy", 11-20
to 11-21), the project memory notes, the specs in `docs/specs/`, the playtest files, and the git
history of every branch. Times are UTC. Quotes are the user's words, typos kept. Anything
marked **guess** is my reading, not something the user or the record says. The user also sent
photos and sketches (layout, ∫ sign, tree); those could not be read here.

Versions all went to one link (artifact `5hPXnzKNEdyrrVku5hZ1Hw`). About 51 versions in 5 days;
source grew from about 2,300 lines (v1) to 6,300 (v7), 12,000 (v28) and 15,200 (v51).

| Date | Versions | Main thing |
|---|---|---|
| 11-16 | v1-v15 | Interview, algebra moves, hubs, graph, sheet, dock, algebra pack |
| 11-17 | v16-v28 | Fraction aiming, shelf, repo, Calc 1-4 on C, typing, ∫ Σ ∏, sounds, polish walks |
| 11-18/19 | mockups | Work tree mockups v1, A, B, C; reflection |
| 11-20 | v29, v30 | Tree in the app; general moves (branch general-moves) |
| 11-21 | v31-v51 | Skills, playtest bank, Shift everywhere, regressions, functions, the reset talk |

---

## 2026-11-16: interview and the algebra prototype

### Interview (02:20-03:43)
- **Asked:** a "wokring prototype thats really good ui, sounds, feel and ergonomic". The GPT
  attempt failed because "it was so cluncky very ai ish feel wasnt/didnt feel look like a proper
  software product and was very dispaoiting animation feel, ergonimics and actual mechanical
  funcitonality". Pasted brief: Vim for algebra, select math objects not characters, motion
  explains each operation, "It should never make you wait before taking the next action".
- Vision: subject packages from algebra to frontier math; type an equation in a Desmos-like bar
  that renders as you type, then "very ergonomically and very fast be able to solve for x";
  "you are an equation or expression builder and master"; "there shouldnt be any major
  bottleneck or as a big of a learning curve, so ergonomic design, animations and such is going
  to be very thought of an planned".
- Fortnite: "to build something it usually takes a couple binds", "you need good placement
  binds and speed and muscle memory"; keyboard main, mouse later. Adopt useful skills (Karpathy
  guidelines, superpowers, etc.). "you are going to be the designer software, Ill just tell you
  the features".
- **Built:** spec, then v1 (04:00): own engine with stable ids and a numeric safety net, own
  renderer with id-keyed animation, jump labels, nine moves, trail, graph, synthesized sound.

### Round 1 → v2 (04:19-04:27)
- **Liked:** "decent first prototype, honestly first impressions pretty good!"; "sound design,
  animation, smoothness, naviagting with arrow keys was pretty intuitive".
- **Asked:** pro dark (like Claude Code) and pro light themes; key chording; E for editing
  forms, f for factoring; "more engaged pop ups on top of the equaation" to browse forms;
  "we need to perfect the algebra mechanics entirely first"; "use more familar keys".
- **Built (v2):** Space aims, f factors, hold e for a forms strip (edit on release), pop-ups
  above the aim, themes, symbols flying from matching symbols.

### Round 2 → v3, v4 (04:37-05:00)
- **Disliked:** "slightly better but not exactly what I imagined"; `*` "requires to keybinds";
  "mechanics hasnt improved as much I would hope, slightly feels a bit limiting".
- **Asked:** E as a real chord hub; a function mode; several equations, edit one at a time,
  substitute via E; arithmetic "more intituive and free", "free but not too free".
  Then: "make f a key chord for functions like invers efunctions functions, and keep e for
  factoring or general algebra techinques".
- **Built:** free both-sides arithmetic (`=` `-` `.` `/`, live preview), `m` moves anything
  across, hold e techniques, hold f functions (`f i` inverse), equations 1-9 with `n`.

### Round 3 → v5 (05:03-05:12)
- **Liked:** "ok nice, slightly better"; live updates while working: "its kind of weird that
  you can edit at the same time while im working but I guess I kinda like it!"
- **Asked:** fine-tune pure mechanics and edge cases; the f menu browsable by family (trig,
  powers, exp and log) with nth cases.
- **Built:** sweep over 45 equations, smarter solve, cases with answer checks, tabbed f menu.

### Direction talk (05:21-05:25)
- User: "is this project really any different than like an advanced Cas engine?"; the way it
  could be more is "alot more mathematically formal/ proof based". Then proposed: perfect "the
  algebra system and layout system first" then dabble in proofs, "since those are the core
  foundations". Agreed.

### Round 5 → v6 (05:43-06:04)
- **Asked:** "get rid of the red pop ups, the equation should just resist and make that noise,
  if you want an error put it at the bottom"; a manual and a playthrough tour; fractions
  "a bit clancky"; f menu by "arrow keys and not other keybinds"; no auto-simplify: a small
  offer that highlights the part, one key; graph "more \"desmos-like\"" plus 3D.
- **Liked:** "the graph box transiitions is nice I do like that".
- **Built:** resist nudge plus sound, bar text, `s` simplify offer, arrow-only f menu, Desmos
  graph, 3D surfaces, manual, 13-step tour. User after: "okay nice, the app works alot better".

### Round 6 → v7 (06:44-07:11)
- **Asked:** the whole algebra roadmap; work as cards; reset; settings; "easier to work on the
  future" (Lego sounds, pixel art); a flash mode that "still shows animations" with a lightning
  bolt; a mouse box select because "highlight lets say most of one side but not all" was
  impossible; "small incremental but noticeable upgrades in everything already built".
- **Built:** partial selections, box select, step records (⇔/⇒), long division, partial
  fractions, inequalities, expressions, f(x), 50-problem set, cards, settings, flash, packs.

### Round 6b, 6c → v8, v9 (07:26-08:07)
- **Asked:** "use shift to reorder like you have before, use ctrl to expand" as a chord (hold
  Ctrl, tap ← or →, let go); "move E's entire functionality to \"tab\"" with tap-browse-tap
  applying; give e a use. Then a tour menu and bug fixes.
- **Built:** Tab hub, e solves, Shift slides, Ctrl grows, Shift+Tab other side; six tours.
- **Liked:** "this is a good first prototype! algebra prototype". Claude rated progress 6/10,
  potential 8/10.

### Round 7 → v10, v11 (16:05-16:15)
- **Asked:** bugs when substituting or adding equations; highlight "more robust, and visually
  pleasing"; `x+y>z` "changes to an equal sign"; is the side list "not engaged enough"?
  "it should be perfect foundation before" calculus. Then lanes "like physics when we had like
  5 equations"; resizable panels; Alt + ← →; "a seemless way to connect these equations";
  typing "should show immeidately".
- **Built:** inequality fix, Ctrl cues, lanes, links, live typing, resizable panels.

### Round 7b → v12, v13 (16:27-16:34)
- **Disliked:** lanes: "the work feels to comact/claustraphobic"; a u-sub "shouldnt take like
  a whole lane".
- **Asked:** side equations small, seamless switching; typing box better and at the bottom;
  subscripts. Then "make it stop highlighting the other equations every time i naturally move".
- **Liked:** "okay other than that I think this is good!"
- **Built:** dock under a brace, morphing switches, bottom typing box, subscripts.

### Round 8 → v14, v15 (16:50-19:08)
- **Disliked:** "I kept clicking factoring and it doesn't work" in expression mode.
- **Asked:** complete the algebra pack with many tours; quadratic formula, completing the square,
  identities; how formulas and identities fit; split the big file, "that process should be
  flawless". Then arcsin(sin x); "I prefer using sin^-1"; is the code clean and not bloated?
- **Built:** factoring fixes, identities, Tab g and Tab h, 12 tours, app.ts split into 7 files;
  sin⁻¹ notation. Claude rated code 7/10 and named two weak spots.

## 2026-11-17: aiming, calculus, typing, sounds

### Round 9 → v16, v17 (01:00-01:38)
- **Disliked:** "you really cant reach the denominator ... (actualy later on it SWITCHED now I
  cant access the numerator"; at an edge "the equation shouldn't shake it should just do
  nothing"; the dock "is lwk not much better than equations on the left", wanted "kind of in
  between".
- **Built:** fraction ↓/↑, silent edges, the shelf, nav.ts and sheet.ts with tests, `npm run e2e`.
  Repo access sorted; PR #1 and #2 merged.

### Calculus 1-4 → v18-v21 (01:53-03:20)
- **Asked:** "time for a big upgrade, calc 1 -4"; "make the calculus dedicated button C".
  A slanted, taller ∫ like LaTeX (from a screenshot).
- **Built in about 80 minutes:** Calc 1 (rules, limits, implicit), Calc 2 (integrals, u-sub,
  by parts, series), Calc 3 (partials, gradient, Lagrange, double integrals), Calc 4 (ODEs,
  div, curl), 19 tours, PRs #3 to #6 merged.

### Round 14 → v22 (03:46-04:07)
- **Disliked:** "I cant even type like int x dx without it buggiing or d/dx as an expression,
  also that does not look the specific integral sign I send you, now it looks ugly".
- **Asked:** C should open in sections ("a derivative section, integral section etc").
- **Built:** □ holes in the preview, the TeX ∫ glyph, C in sections. PR #7 (calc-fixes) opened,
  which then carried every later round.

### Round 15 → v23 (04:17-04:57)
- **Liked:** "the integral looks perfect its just slanted at an angle"; UI "really good alreay".
- **Asked:** stacked integrals ("I cant stack integrals"); Σ and ∏ like LaTeX; tidy calculus;
  graph more like Desmos; notation cards; "a critique (blind one)" on purpose versus "just
  bloat"; one big merge at the end; a subagent to research one or two more skills.
- **Built:** upright ∫, TeX Σ ∏, products, notation cards, calculus graphs, critique fixes.
  Claude proposed three bloat cuts (37 tours to about 6, merge sound and theme toggles, hide
  empty panels). **Never answered, never done.**

### Round 16 → v24 (05:10-05:37)
- **Disliked:** "putting integrals, double, triple is stil buggy ... I should be able to just
  write anything and for it to parse correctly cmon".
- **Built:** fast-check property tests over every integral spelling; parser, preview fixes.

### Overnight → v25 (08:25-09:19)
- **Asked:** "make me impressed but not by adding a lot of bloat but by fixing the smallest t
  nuances that I don't point out"; "a Lego building sound? its form my childhood"; "do a bit of
  thinking before you even touch the code".
- **Built:** Bricks sound pack, typing spellings, cubics, "no real x" reasons, small polish.

### Round 17 → v26-v28 (18:15-23:22)
- **Disliked:** "there is no seperate lego sound ... I want like an actual lego sound thats like
  lego building sound in the games"; "I thoght your gonna do more".
- **Liked:** "you did found alot of tiny mistakes so good job on that"; "this project is slowly
  turning really good".
- **Asked:** zoom y′ into dy/dx and differentials; keep polishing "till like my 5 hour usage
  runs out".
- **Built:** Build sound pack, y′ → dy/dx → differentials, ten polish walks (integrals, limits,
  trig solutions, systems as points, 2-letter limits). Never confirmed by the user that Build
  is the sound they meant.

## 2026-11-18 and 11-19: the work tree mockups

### The idea (11-18 07:39-08:13)
- **Asked:** "how about we add a graph tree!" One tree per equation, forks, substitution arrows,
  a replay "and varying speed you choose like the slider (also the fast mode should also be a
  slider not a set speed)". "this idea needs to be down flawless". From the sketch: top-down,
  arrows that "show the exact algebraic step", current step orange, redoing an identical move
  returns to the undone node, switch equations and "navigate by arrow keys", "it shouldnt feel
  overwhelming and isnt the main star of the show, but it is second".

### Mockup rounds (08:25-16:13)
- v1 → "decent progress but could be better": arrows "grayish", "I dont want an outline border",
  new steps must not "just fade in" but come "from the arrow", less space between columns,
  fold long chains.
- A (Cards) and B (Ink) → "okay B is better! ... Its just not what I imagine din my mind".
  "the animation should literally show the mechanics ... and doing it in reverse too";
  substitution from the highlight; u-sub must not have "its own mechanism since that leads to
  bloat and speicfics when maths as we all know is for the general case"; other equations
  "kinda shouldnt" fade.
- C (Mechanics): stable-key morphs, name it (v) and sub in (s), now line, no fading.

### Reflection (11-19 01:26-03:32)
- User: "its still needs work". Asked for Claude's analysis of its mistakes. Then: "you should
  always have the general case ... and then the shortcuts right next to it".

## 2026-11-20: tree in the app, general moves, the north star

### v29 (07:24-07:47)
- **Asked:** "okay better, okay try to implement it as best as you can to the main one", a big
  view to pan as a canvas, and an adjustable share of the screen.
- **Built:** tree.ts and treeview.ts; shelf and trail removed; v big view; drag to resize.
- **Liked:** "the app is slowly turning into something tangible! you could see how it works,
  the arrows and stuff".

### General moves → v30 (10:17-12:22, branch general-moves)
- **Asked:** the philosophy test: "if you remove a technique’s shortcut, can you still carry it
  out comfortably?"; "the entire calculus menu is the best exempler of this problem"; fork
  first; "an actual substitution button" on the highlight, "maybe like \"b\""; "whole lot
  vairety of sums and products not just like 2 checklist shortcuts"; the Feynman technique.
- **Built overnight:** b, p, sub in, C both sides, Leibniz, Σ/∏ forms, shortcuts as chains,
  Feynman by keyboard, blind review of 14 techniques. **Never asked the user how it felt.**

### North star thread (23:34-23:48)
- North star message (see CORE.md). Then: "Im not focused on proof based just yet, just trying
  to make the algebra and mechanics, but I am just afraid you do allot of refactoring/mistakes I
  won't necessarily 100 precent like"; "the rpdocut should also be pick from my moves and
  resketch the problem quickly when neccessary fast."

## 2026-11-21: skills, playtests, the slide

### Skills and the first playtest → v31-v37 (00:07-01:47)
- **Asked:** add Impeccable plus concept exploration, interaction microdesign, composability
  auditing and problem scouting with hands-on playtesting, "not bypassing it with direct engine
  calls"; "dont try to do everything at once, one by one high quality"; scouting must "connect
  failures to a single reason" and stay compressed. Then "short prototypes between 10 minute
  intervals".
- **Built:** skills playtest, microdesign, design-review; 15-problem OpenStax round; exponent
  laws both ways, cases as "or", Tab q own factor, log rule key, quadratic formula with
  letters, repeated partial fractions, math-looking step names. Two decision cards (Tab f
  one-press factoring; sign chart by hand) **still open**.

### "You forgot" → reminder list (03:11)
- "dam I feel like you forgot alot of stuff from last thread". Claude listed: speed slider,
  replay, no feedback asked on general moves, e doing u-sub in one step, multiply by 1,
  compare coefficients, bloat calls.

### The big vent → v38-v46 (03:40-05:32)
- **Disliked:** "it was like a smooth 120 hz( my monitor) and now its like straight 30";
  "very big lag spikes and delay when I put like a definite integral"; after a C or menu move
  "I stop highlighting"; the tree "can explode over silly stuff"; the C menu "feels very bland
  un-interactive and just 1 button move".
- **Asked:** Shift to "put things in or out" of sums, integrals, derivatives, limits, products
  (Leibniz too); round trips return to the node with a counter; C "more integrated and
  connected with that tab button since after all calculus is basically 90 precent algebra";
  "a relatively easy way to be able to test the engine"; prototypes every 20 minutes. Then:
  Shift must work through fractions, roots, powers, "shift key should be that engaging and
  useful"; Tab q "I cant factor a constant out, only terms".
- **Built:** graph sampling no longer freezes (25 s to 0); aim follows the work; ↺ counter;
  Shift through every structure; Tab shows calculus rules; speed slider and Shift+P replay;
  `npm run bank` (293 problems, 274 solved by e); Tab m, Tab e, wider Tab q; e plays u-sub as
  general moves.

### Core keys break → v47, v48 (05:39-07:20)
- **Disliked:** "wait wtf why cant I use control to select selective parts or use shift to move
  things or x to switch the equation??? ... and I cant use m aswell, the most pure mechanics are
  breaking down infront o fmy own eyes, and the app still feels laggy at 30 frames";
  "are you bloating the code?"; "I wonder what else is bugged and got broken aswell".
- **Asked (same message):** play Stewart's calculus "a few representative problems from each
  section", act "like an intermediate user", and "a really really super hard pure algebra
  mechanics book". **Not done.**
- Claude first could not reproduce (tested on tidy equations) and guessed the side panel caps
  the frame rate. The user's repro: `I = int 1 to 0 of (x^2 + 1)/lnx dx`: "insane lag spikes",
  "isnt centered", "m,x,shift etc they dont move the equation", the Tab menu "at the bottom of
  the screen", "I cant sub stuff"; "this program is slowly rotting than getting better";
  "everything should be to the general case and not hyper specific".
- **Built (v48):** the check handles pieces with no value; graph redraws on pause; centering;
  Tab menu kept on screen; typed names change an integral's variable.

### Functions → v49-v51 (22:29-23:08)
- **Asked:** define `I(t) = int 0 to 1 of (x^t -1)/lnx dx` (refused because "\"I\" was already
  defined"); the function menu "is slightly underwhelming"; b "need sot be that flexible";
  "easily be able to plug randoms tuff into the function". Chose "Both, f first" on the card.
  The message ended at "also", and the rest never came.
- **Built:** any letter defines a function; b with I(t); f takes any typed function and a Yours
  tab; Tab u folds. Gap left: g(x + 1) = g(5) is not cancelled by f's inverse.

### The reset talk (23:41-23:57)
- "every next version of this app I get slightly disappointed"; "now I can get through 10
  versions still have the same problem"; errors "compound from like a early version".
- Then: "maybe the 20 minute candence is a bad idea, so just focus on the highest quality
  product you can produce"; "feel should should be the absolute number 1 target, if it feels
  clancky, the animations are unsmooth the tree diagram looks ugly (which sometimes it is with
  al the things going on) then no matter how productive no one wants to use a laggy app";
  "when I spot an error you tend ot just fix it and not the big reason why it was happening".
  Asked for this history review.

---

## Regressions and repeated complaints

1. **Core keys dead (m, x, Shift, Ctrl, sub in).** Reported 11-21 05:39 and 06:58. Earlier cousins:
   factoring dead in expression mode (11-16 16:50), `m` turning an inequality into `=`
   (11-16 16:05), weird substitute/add cases (11-16 16:05).
   **Cause (from v48):** the numeric safety net. Every move is proved by plugging in numbers;
   on an equation whose piece has no value (a divergent integral) every sample was NaN, so every
   move was refused. Tests and e2e use tidy equations, and Claude's first repro did too.
   **Guess:** other "valueless" or unusual inputs (defined functions, letters bound in integrals,
   branch cuts) can still hit the same wall; the fix added fallbacks rather than a new design.
   Ctrl + ← → on a Mac may switch desktops (raised, never confirmed).

2. **Lag: 30 fps instead of 120, spikes while typing.** Reported 11-21 03:40, 05:39, 06:58, 23:57.
   Freezes before that: triple integrals for seconds (11-17 05:37), ∫ eˣ sin x looping (11-17 20:06).
   **Found causes:** the graph sampled definite integrals with a letter bound on every key (up
   to 25 s; fixed e1f9222), and redrew on every key (debounced in v48).
   **Not found:** the steady 30 fps. Claude measured only per-key script time (under 10 ms,
   `playtest/frames.mjs`), never frame pacing during an animation, and blamed the claude.ai side
   panel. **Guesses:** the user remembered 120 Hz from before the work tree; the first report
   says "laggy in this new thread", the day after v29. The tree view (`treeview.ts`) runs its
   own per-frame JS loop that repositions every step during each glide, at the same time as the
   stage animation; the selection box transitions `left/top/width/height` (layout, not
   transform); several box-shadow animations; and hub menus may run numeric checks for every
   form on open. None of this has been profiled.

3. **Typing and parsing notation.** 11-17 03:46 (`int x dx`, `d/dx`), 04:17 (stacked
   integrals), 05:10 ("cmon"), 11-21 06:58 (lag while typing an integral), 22:29 (`I(t)` read as
   I·t). **Cause:** the parser grew case by case; function names were only f, g, h from day one
   (found 11-21). fast-check fixed integrals, but each new notation was not given a generator.

4. **Specific mechanisms instead of general moves.** 11-18 15:53, 11-19 03:32, 11-20 10:17,
   11-21 03:40 (C "just 1 button move"), 06:58, 22:29 (function menu).
   **Cause (Claude's own diagnosis, 11-20):** each request became a menu entry, and the numeric
   net made any correct shortcut cheap, so nothing pushed toward small moves. The C hub still
   exists next to the general moves.

5. **Aim and highlight.** Fractions clunky (11-16 05:43), highlight "more robust" (11-16 16:05),
   denominator unreachable then numerator (11-17 01:00), aim lost after C or menu moves
   (11-21 03:40). **Guess:** where the aim lands after each move was decided per move rather than
   by one rule; it was fixed piecemeal (nav.ts, a462884).

6. **Where the other equations live.** Side list (11-16 16:05), lanes too cramped (16:27), lighting
   up while moving (16:33), dock cards (11-17 01:00), then the tree (11-18 to 11-20), then "the tree
   diagram looks ugly" (11-21 23:57). **Guess:** the mockup look (C) was approved as "better"
   but never as "what I imagine"; the app version got busier (labels, arrows, ↺ badges, now line)
   with no design review since v29.

7. **The integral sign.** 11-17 02:52, 03:46 ("now it looks ugly"), 04:17 (slant). Fixed by
   using the TeX glyph. Lesson in memory: draw big operators from TeX outlines.

8. **The Lego sound.** Asked 11-17 08:25; "no seperate lego sound" 18:15. Build pack made;
   never confirmed.

9. **"Not enough" or "forgot".** 11-17 18:15 ("I thoght your gonna do more"), 11-21 03:11
   ("forgot alot of stuff from last thread"), 23:41 ("same problem"). **Cause:** long threads
   compressed twice; memory notes kept decisions but not every open ask; the new thread started
   on Claude's own agenda (the north-star assessment, then playtests) rather than the carry-over
   list.

10. **Bugs piling up and bloat.** Bug sweeps asked 11-16 07:59, 16:05, 16:50; 11-17 03:46;
    11-21 03:40. Bloat asked 11-16 19:03, 11-17 04:17, 08:25, 11-21 05:39, 23:57.
    **Cause:** about 15,000 lines in 5 days on three stacked branches, features faster than
    cleanup, symptom fixes ("fixed the check itself" still meant three fallbacks), and the
    10 then 20 minute cadence on 11-21 that rewarded small visible patches.

## Open asks never done (or half done)

- **120 fps feel.** Never measured as frame pacing, never confirmed fixed.
- **Tree look** the user imagines; **walking the tree by arrow keys** (arrows pan the big view;
  steps are reached by click only).
- **Typed "resketch" line** checked against the last step and kept in the tree (agreed 11-20 23:45).
- **Stress suite of core keys on messy equations** and a frame budget (proposed 11-21 23:42).
- **Stewart calculus and a very hard algebra book**, played as an intermediate user (11-21 05:39).
  `npm run bank` runs the engine's `e` on OpenStax and classic problems, not the keys.
- **C feeling like Tab.** Half done: Tab now shows calculus rules, Shift slides through calculus;
  the C hub with one-press entries remains.
- **Replay "of your work" across all equations** with the slider: Shift+P replays steps; a
  whole-tree replay as in the mockup is not confirmed.
- **The Lego video-game sound** (Build pack unconfirmed).
- **Decisions waiting on the user:** Tab f one-press factoring (11-21 01:04), sign chart by hand
  for inequalities (01:26), the three bloat cuts (11-17 04:57).
- **Small gaps:** f's inverse on g(x + 1) = g(5); the user's 22:29 message cut off at "also".
- **Later by the user's choice:** linear algebra, proof mode, mouse-first work.
- **One big merge.** calc-fixes (PR #7) < general-moves < claude/project-thread-e1mk3a, all unmerged.

## Drift

- **Breadth before the foundation was perfect.** The user said "perfect the algebra mechanics
  entirely first" (11-16 04:19) and "it should be perfect foundation before" (16:05), then asked
  for Calc 1-4, which was built in about 80 minutes as about 25 one-press C entries. The user
  asked for calculus; the speed and the macro shape were Claude's.
- **Solver over hands.** The ask is free hand manipulation ("doing the thinking for them" is
  ruled out), yet `e`, the C hub and Tab f solve in one press, and the bank measures `e`.
  The playtest brief said not to bypass the interface with engine calls; `bank.mjs` calls the
  engine directly.
- **Feel stopped being the target.** v1 was loved for sound, animation, smoothness and arrows.
  From 11-17 on most versions were engine work; frame rate was never a test.
- **Cadence over quality.** Many small versions (v31 to v51 in one day) patched symptoms; the
  user withdrew the 20-minute cadence at the end.
- **Claude's agenda over the user's list.** The north-star review pushed proof-style features
  (obligations, assume lines) that the user deferred; the 11-20 carry-over list was dropped until
  the user noticed.
- **Learning curve.** "no ... big of a learning curve", yet 37 tours, three hubs, and many
  chords; the bloat cuts were never decided.
- **Specific checks.** "Never ship a move not covered by the numeric check" became many custom
  check routines and fallbacks (pointwise, slope, mixed slope, NaN fallbacks), a back door
  Claude itself flagged on 11-20.
