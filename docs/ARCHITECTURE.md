# Algebrix architecture

The map of the code: how a key press becomes animated math, what each part owns, where it
hurts today, and the target shape with the plan to get there. Read this before changing code.

- What the product must be and feel like: `docs/CORE.md`. Why things are the way they are: `docs/HISTORY.md`.
- Status line: **as of 2026-11-27 (v77)**. Sections 1 to 6 describe the code as it is. Section 7 is the
  diagnosis, section 8 the target design, section 9 the slice plan. Recipes for common changes are in
  section 10 and are updated as each slice lands.

---

## 1. Layers

```
 keyboard / mouse
        │
  src/ui/        App (state, modes, menus, boxes, rail, tree, graph)      DOM, sound, storage
        │  calls pure functions, gets back results
  src/engine/    AST, parser, moves, forms, calculus, safety net          no DOM, unit-tested
        │  returns a new Eq + "hints" (what merged, what flew where)
  src/render/    layout (tree → glyphs keyed by node id) + Stage (FLIP animation)
```

| Layer | Size | Rule |
|---|---|---|
| `src/engine/` 23 files | 10.7k lines | Pure algebra. No DOM. Test-first (`npm test`). Every step it returns must pass the numeric check. |
| `src/render/` 2 files | 0.8k | Turns a tree into positioned glyphs; animates between two layouts by glyph key. |
| `src/ui/` 30 files | 7.6k | The app. `App` class plus "parts" (files whose functions are copied onto `App.prototype`). |
| `src/packs/` | 0.5k | Sound sets and looks, one file each (`docs/EXTENDING.md`). |
| `src/vendor/mathquill` | vendored | Desmos's MathQuill fork. Only `ui/mathfield.ts` touches it. |
| `src/style.css` | 840 lines | All styling, one file, theme tokens on `:root`. |

Tests: `tests/` (48 files, 1041 unit tests, about 19 s), `e2e/` (12 files, real app in Chromium by
keys and mouse), `stress/chaos.mjs` (seeded random play of the built app), `stress/stress.mjs`,
`playtest/bank.mjs` (344 book problems through `e`).

## 2. Life of a key press

Example: the aim is on `3` in `2x + 3 = 7` and the person presses `m`.

1. `ui/keys.ts key()` routes by mode. In solve mode `m` is in `MOVE_KEYS` (`ui/shared.ts`).
2. It calls `moveAny(eq, sel)` (`engine/techniques.ts`), which builds a `MoveOk`: the new `Eq`,
   a label ("move across"), `hints` (which glyphs merge into which, which fly where), `factor`
   (how lhs − rhs scaled), optional `conditions`, `select` (what to aim at after).
3. The engine runs `checked(before, result)` (`engine/moves.ts`): the relation is recomputed and
   `verify()` evaluates both equations at seeded sample points. A mismatch becomes `{ error }`.
4. `App.apply(result)` (`ui/app.ts`): refusal → resist + low sound + reason in the bar. Otherwise
   `sheet.addStep` records the step (undo, redo, conditions, the work tree), `nav.aimAfter` moves the
   aim onto what changed, then `renderAll` draws.
5. `renderMain` → `render/layout.ts layout(eq)` gives glyphs whose keys come from node ids →
   `Stage.show(layout, transition)` moves glyphs with the same key (FLIP from where they are now, so a
   fast second key retargets instead of waiting), flies absorbed pieces into what took them, and
   grows new ones from their source. One easing curve for everything: `SMOOTH` in `render/stage.ts`.
6. Then the move's name bubble, the sound, the tree strip, the graph (after the move), and `save()`.

Undo plays the same step's stored `fx` backwards (`Step.fx`), so it shows the mechanics in reverse.

## 3. Core data

- **Node** (`engine/ast.ts`): a tagged union (`num, sym, add, mul, neg, frac, pow, sqrt, fn, call,
  deriv, lim, int, at, sum, vec, grad, eq`). Every node has a stable `id`. Moves keep ids of pieces
  that survive, which is what makes animation and aim-following work. `key(n)` is a structural key
  (ids ignored) used for "same expression" tests and caches.
- **Eq**: `{ lhs, rhs, rel }`; `rel` is `=`, an inequality, `expr` (just an expression), `≟` (a proof
  goal) or `def` (a definition like `I(t) = …`).
- **MoveOk / MoveResult** (`engine/moves.ts`): what every move, form and technique returns.
  `Form` (`engine/forms.ts`) is a `MoveOk` with a `name` and a `chord` key.
- **Sheet / Slot / Step** (`ui/sheet.ts`, `ui/shared.ts`): up to nine equations (slots). A slot has the
  line of steps you are on (`steps`, `at`), the other lines you tried (`alts`, which together make the
  work tree, `ui/tree.ts`), links to steps of other equations it used, and its aim `sel`.
- **Hints** (`engine/simplify.ts`): `absorbs` (glyph A merges into B) and `flights` (A is copied to B).
  The renderer uses them to show the math physically.

## 4. Engine map

| File | Owns |
|---|---|
| `ast.ts` | Node types, constructors, walk/find/replace, `evaluate`, `key`, and the shared registries (see below). |
| `parse.ts`, `print.ts`, `latex.ts` | Text → tree (any reasonable typing), tree → text, tree ↔ LaTeX (MathQuill and export). |
| `moves.ts` | The core moves (move across, ÷ ×, distribute, slide, lift, drop, swap, both sides), `verify`, `checked`, domains. |
| `simplify.ts`, `rewrite.ts`, `terms.ts` | Simplify (with hints), distribute, factor, combine fractions, standard order, rational coefficients. |
| `forms.ts` | Tab's forms: every equal rewrite of the aimed piece (expanded, factored, one fraction, log rules …), each verified. |
| `polytools.ts` | Long division, partial fractions, completing the square, trig forms, prime factors. |
| `techniques.ts` | A mix: the f menu's function list (`FN_TABS`), wrapping both sides, peel/inverse, solving (isolate, quadratic, cases, impossible), substitution, elimination, compare coefficients, the simplify spot. |
| `general.ts` | The general moves: name it (b), sub in, put in a value (p), calculus to both sides, rewrite as, multiply by 1, and shortcuts as chains of them. |
| `calculus.ts` | The kernel the safety net uses: plain derivative, substitute, numeric limits, numeric integrals. |
| `calcmoves.ts` | Step-by-step calculus rules (next derivative rule, plug in, L'Hôpital, limits forms), kept apart from `calculus.ts` so each checks the other. |
| `integrate.ts` | Integration steps, u-sub, trig sub, by parts, bounds, geometric and p-series, Taylor. |
| `series.ts`, `sums.ts` | Written-out Σ/∏ with ⋯ (more/fewer terms, fold back, cross out, telescoping); known sums. |
| `ode.ts`, `leibniz.ts` | Differential equations (separable, linear, second order); dy/dx ↔ y′ ↔ differentials. |
| `goals.ts`, `inequality.ts`, `solve.ts`, `select.ts` | Fold/unfold definitions, proofs; inequalities; numeric solve; grouping a run of terms. |

**Shared registries (global mutable state).** The engine is pure except for these, which the UI keeps
in sync before calling it: `DEFS` (your functions, 13 files use it), `LETS` (named letters), `LIMITS`,
`EVAL.anyFn`, `defsSig` (a cache key for DEFS), `DOMAINS` via `setDomains` (what each letter may be),
`setRedefining` in the parser, and the node id counter.

## 5. Render

- `layout.ts`: `layout(node, size)` → `{ glyphs, boxes, w, asc, desc }`. Glyph keys come from node ids
  (`D<id>` for a ⋯, etc.), so the same piece keeps the same glyph across steps. `boxes` maps node id →
  rectangle, used for aiming, the aim box and menu placement.
- `stage.ts`: `Stage.show(layout, ox, oy, transition)`. FLIP per glyph; `absorbs`, `flights`, `emerge`
  (undo), `focus` (the travelling piece arcs). `Stage` is also used small inside menu cards
  (`cardMath` in `ui/hub.ts`) and the tree.

## 6. UI today

### 6.1 App and its parts

`App` (`ui/app.ts`, 1216 lines) holds all state. Nine part files export functions taking `this: App`,
copied onto the prototype at the bottom of `app.ts`: `ops` (both-sides box), `hub` (Tab and C),
`fnpal` (f), `solving` (e, cases, domains), `keys` (all key and mouse routing), `persist`, `calc`
(C's technique list and its chains), `general` (b, p, sub in, rewrite, multiply by 1, chains), `replay`.
Self-contained classes: `Graph`, `TreeView`/`TreeBig`, `Library`, `Settings`, `Tour`.
Pure, unit-tested modules: `nav.ts` (arrow aiming), `sheet.ts`, `tree.ts`.

App's fields, by concern (about 45):

| Concern | Fields |
|---|---|
| The work | `slots`, `cur`, `grouped`, `linkNext`, `domains`, `memory`, `workId` |
| What is drawn | `preview` (typed), `peek` (browsed in a menu), `room` (menu glide), `renders`, `labels` |
| Mode | `mode` (`write, solve, labels, op, hub, fnpal, fnask`) plus `hub`, `pal`, `nota`, `replaying` |
| The small box | `opKind` (`both, name, value, divide, one, as`), `valueOf`, `valueCheck`, `divideAt`, `oneAt`, `asAt` |
| Timing | `pending`, `typingTimer`, `messageTimer`, `graphTimer`, `deleteArmed`, `resetArmed`, `chordUsed` |

### 6.2 The three menus

All three draw into the same `#forms` element and are placed by `App.place()` (above or below the
equation; the equation glides to make room). Everything else differs:

| | Tab (algebra) | C (calculus) | f (functions) |
|---|---|---|---|
| Content | `techniques()` in `hub.ts` + `formsFor` + `calcForms` | `calcTechniques()` in `calc.ts` (about 40 hand-written entries) | `FN_TABS` (engine) + Yours + typed box |
| Layout | chips row (words) + one card row that does not wrap | section tabs + card row that wraps | box + tabs + chip row |
| Card DOM | `.form-card` showing the changed piece | `.form-card` showing the whole result | `.chip` with the result filled in over frames |
| Keys | `hubKey`: ← → over forms only | `calcKey`: ← → sections, ↓ in, ← → items, ↑ out | `palKey`: same as C but its own copy |
| Previews | computed when opened (blocks: 153 ms on `I(t) = ∫₀¹ …`) | eager per technique, then recomputed on run | lazy, one per frame (`fillPal`) |
| Typed input | separate boxes (`openDivide`, `openRewrite`, `openOne` via `ops`) | `h.asking` with its own field | `pal.ask` with its own field and mode `fnask` |
| Hold/tap | keyup handler in `keys.ts bind()` | same handler, other branch | separate branch |

Mouse clicks for all three go through one `mousedown` handler in `bind()` that re-dispatches fake
key events per mode.

## 7. Where it hurts (diagnosis)

Ranked by how much each slows down every future change. Each has evidence from the code or a probe.

1. **Three menus, three implementations.** Same ideas (browse, preview, apply, hold or tap, ask for
   input, refuse with a reason) coded three times with different rules. A fix in one never reaches
   the others. All four open issues come from this:
   - Tab on a written-out sum: `.hub-forms` does not wrap and `.form-card` may shrink, so cards are
     squeezed below their content (measured: 107 px wide holding 172 px) and names and math overlap.
   - C: cards wrap into two visual rows but navigation is a 1-D index, so ↓ does nothing and ↑ leaves
     for the tabs (measured: ↓ keeps `i` unchanged).
   - Tab's technique row shows words only, while f and C cards show the result as math.
2. **The ⋯ is an ordinary term.** A written-out sum is an `add` whose middle term is a `sum` node with
   `dots`. Every reordering move (Shift slides, standard order, `m`) treats it as a term like any other.
   That is why it can be moved and why Tab offers "highest power first" as `⋯ + 1 + 4 + 9 + 250000 + ⋯`.
   Nothing in the engine knows that a written-out run is an ordered sequence.
3. **App is one object with about 45 fields and an implicit state machine.** `mode` says one thing, but
   the real state is `mode` plus `hub.calc`, `hub.awaitVar`, `hub.asking`, `pal.ask`, `opKind`,
   `valueCheck` … Nothing lists the states or the legal transitions. Six "small box" uses each add
   their own fields (`divideAt`, `oneAt`, `asAt` …). Any part can change any field.
4. **The safety net is a convention.** `App.apply` accepts any `MoveResult`. Each engine function must
   remember to call `checked()` (about 95 call sites). Forgetting once ships an unchecked move, which
   breaks the rule "never ship a move not covered by the numeric check". It also leads to checking
   the same move twice (menus compute it to preview, `run` recomputes and re-checks it).
5. **Hidden global state in the engine.** `DEFS`, `LETS`, `DOMAINS` and friends live in module scope and
   are synced by the UI. Results depend on what was synced last; caches need `defsSig`.
6. **Files grouped by history, not by concept.** `techniques.ts` holds the f menu's UI list, solving,
   systems and the simplify spot. Tests are named by round (`polish17`, `round6b`, `bookround`), so it is
   hard to find the tests for a feature.
7. **Tests check features, not contracts.** Nothing asserts that every card in every menu is reachable
   by arrows, that cards never overlap, or that a menu opens within a frame budget. Chaos checks strays
   and errors, not layout.
8. **Too much context per thread.** CLAUDE.md, CORE.md, HISTORY.md (27 KB), the prototype spec (35 KB)
   and a long project memory are all loaded or skimmed by every new thread, and none of them says how
   the code fits together. Threads re-derive the architecture each time and patch where they land.

### 7.1 How the work has been done (workflow)

The code problems above come from how it was built, so the fixes have to change that too.

- **Adding, never consolidating.** 143 commits in 12 days: 51,400 lines added, 4,800 deleted. Each ask
  became a new entry or mechanism next to the old ones (40 hand-written C entries, six small boxes,
  three menus). 59 causes (K1 to K59) in `playtest/CAUSES.md` were mostly fixed one at a time, where each showed up.
- **The user is the tester.** Tests check what the builder thought of, on tidy equations. The person's
  freeform use finds the rest (divergent integrals breaking every key, the menus on a written-out sum).
- **Visible UI built before it is seen.** The series UI, the tree and the C hub were built, then judged.
  The user's verdict arrived after the code, so the fix became a patch.
- **Feel never measured.** "30 fps" was reported four times; frame pacing was never recorded during an
  animation, and no test has a time budget.
- **Context lost between threads.** Long threads were compressed and lost open asks ("you forgot");
  the project memory grew into a long status log; no document said how the code fits together, so
  each thread rediscovered it.
- **One long branch.** Everything since PR #5 sits on stacked, unmerged branches, waiting for one merge.

What changes: section 9's slices consolidate instead of adding; contract tests and time budgets make the
machine the first tester; a screenshot or mockup is shown before any visible UI is built (skill
`microdesign`); this file is the starting point of every thread, and memory keeps decisions, not status.

## 8. Target design

Principles: one mechanism per idea; data in, data out (pure and unit-tested where possible); the UI
layer only routes keys, holds state and draws. No framework. Feel first: nothing here may cost a frame.

### 8.1 One menu system (Tab, C and f)

```
ui/menu/model.ts     pure: Card, Row, Section, MenuState, the key reducer, grid navigation
ui/menu/view.ts      draws any menu into #forms (one DOM shape, one CSS block), fills previews lazily
ui/menu/offer.ts     offer(): a card from an engine function, computed once and checked once
ui/menus/tab.ts      Tab's content: techniques + forms + calculus rules for the aimed piece
ui/menus/calc.ts     C's content, by section
ui/menus/fn.ts       f's content: typed box, Yours, families
```

```ts
interface Card {
  key?: string;                    // one-key shortcut, shown as a kbd
  label: string;                   // words with math, drawn by mathLabel
  ok: boolean; why?: string;       // off cards stay visible, dimmed, and refuse with `why`
  shows?: () => Shown | null;      // lazy: the result as math (drawn on the card, peeked on the stage)
  ask?: Ask;                       // needs typed input first (a limit's target, a factor, a value)
  run(): void;                     // what applying it does
  tag?: 'chain' | 'suggested';
}
interface Section { name: string; rows: Card[][]; live: boolean }   // C sections, f families; Tab has one
interface MenuSpec { id: 'tab' | 'calc' | 'fn'; openKey: string; sections: Section[]; input?: Ask }
interface MenuState { section: number; at: { row: number; col: number } | null; sticky: boolean; chordUsed: boolean; asking?: Ask }
```

**One set of keys for every menu.**
- Open by tap (stays open) or hold (press a card's key while holding; release applies what you browsed,
  or pins the menu if you browsed nothing and pressed nothing).
- A card's key applies it from anywhere in the menu, in any section.
- ← → move through cards in reading order. ↑ ↓ move to the card above or below **as drawn**: the
  nearest card by horizontal centre in the visual line above or below, so wrapped rows work. ↑ from
  the top line goes to the section tabs (or the box), ↓ from the tabs enters the first line.
  Navigation runs on the card rectangles measured after drawing, through a pure function
  `nextCard(rects, at, dir)` that is unit-tested with fixtures.
- Browsing a card peeks its result on the stage (the equation glides to it), in every menu.
- Enter or the open key again applies. Esc steps back one level: asking → browsing → closed.
- A key the menu does not offer, in a menu opened by tap and not yet browsed, closes it and does its
  usual job (K28).

**One way to draw.** Tabs row (when there are sections), then rows of cards that wrap and never shrink
(`flex: 0 0 auto`), each with its key, its label as math, and its result drawn small by `cardMath`
(scaled down to fit a maximum width, never cropped). Technique cards and form cards are the same card;
a card without a result just has no math line. Previews fill one per frame after the menu is drawn, so
opening never waits on the engine (target: open in under 16 ms on any equation).

**One way to build a card.** `offer(key, label, () => engineFn(eq, sel))` computes the engine call at
most once (when first shown, browsed or run), uses its error as `why`, its label as the card's label
when it has one, and runs the same checked result it previewed. This replaces the forty hand-written
`{ key, label, ok, why, move, run }` blocks in `calc.ts` that each compute the move twice.

**Who owns what.** Tab: algebra on the aimed piece, plus the next calculus rule for it. C: the calculus
catalogue by section. f: functions of both sides. When a rule belongs in two menus, both menus list
the same card from the same offer, so key, label and result are identical.

### 8.2 One small box

The both-sides box, b (name it), p (put in a value), Tab q (take out a factor), Tab = (rewrite as),
Tab m (multiply by 1), C's typed inputs and f's typed input become one `Ask`:

```ts
interface Ask { prompt: string; prefill?: string; hint: string; preview(text: string): Shown | { error: string } | null; commit(text: string): void }
```

`mode` becomes a discriminated union, and the box fields (`opKind`, `valueOf`, `divideAt` …) go away:

```ts
type Mode = { k: 'solve' } | { k: 'write' } | { k: 'labels' } | { k: 'box'; ask: Ask } | { k: 'menu'; spec: MenuSpec; state: MenuState }
```

### 8.3 One gate for the safety net

`checked()` returns a branded type (`Checked`), and `sheet.addStep` and `App.apply` accept only that.
An unchecked move then fails to compile instead of failing silently. A result is checked once; menus
preview and apply the same object.

### 8.4 Engine context in one place

The registries move into `engine/context.ts` with one documented way to set them
(`setContext({ defs, lets, domains })`) and one signature for caches. No change of behaviour, and no
change to the hundred function signatures for now; passing it explicitly can come later if it pays.

### 8.5 Fixed pieces

One predicate, `isFixed(node, parent)`, true for the ⋯ of a written-out sum and the terms that frame it.
The reordering moves and forms (slides, standard order, move across of a ⋯) ask it in one place and
refuse with a reason ("the ⋯ stays where it is: [ ] { } change how much is written out"). Aiming still
works, so [ ] { } b o keep working on it.

### 8.6 Files by concept

`techniques.ts` splits into `engine/solve.ts` (isolate, quadratic, cases, impossible), `engine/systems.ts`
(substitution, elimination, compare coefficients) and `engine/wrap.ts` (functions of both sides, peel);
the f menu's list moves to `ui/menus/fn.ts`. Code moves only; no logic change in the same commit.

## 9. Refactor plan (stage 2)

Every slice keeps behaviour the same unless it says otherwise, and is done only when: `npm test`
passes, `npm run build` passes (types), `npm run e2e` passes, `npm run chaos` passes, and the core
keyboard mechanics in `docs/CORE.md` still work in the built app. One commit per slice on the branch.

| # | Slice | Done when |
|---|---|---|
| 0 | Baseline: record tests, e2e, chaos, menu-open times, bundle size (below). | numbers in this file |
| 1 | Menu contract tests first: for each menu on a corpus, no two cards overlap, every card reachable by arrows, open under budget. They fail today on the written-out sum (issues 2, 3). | tests exist and fail for the known reasons only |
| 2 | `Checked` gate (8.3). | types enforce it; no behaviour change |
| 3 | Engine context (8.4) and the `techniques.ts` split (8.6). | moves only |
| 4 | `ui/menu/model.ts`: state, key reducer, `nextCard`, with unit tests. | pure tests pass |
| 5 | `ui/menu/view.ts` + one CSS block; port **f** first (the one you like best). | f e2e tests pass unchanged |
| 6 | Port **C** onto it (sections, asking). ↑ ↓ work across wrapped rows. | issue 3 fixed, C e2e pass |
| 7 | Port **Tab** onto it; technique cards show their result as math; `offer()` everywhere. | issue 2 fixed, Tab opens under 16 ms |
| 8 | One `Ask` box (8.2) and the `Mode` union. | box fields gone from App |
| 9 | Fixed pieces (8.5). | issue 1 fixed |
| 10 | Series UI: microdesign pass with screenshots for your review, then build it. | issue 4, your call |
| 11 | Docs, CLAUDE.md, skills and memory brought up to date with the new shape. | a fresh thread can find any part from CLAUDE.md in one hop |

Baseline (2026-11-27, v77 at `375ab26`): unit 1041 passed / 1 skipped in 18.5 s; e2e all pass;
build 789 KB (251 KB gzip). Menu open time, keydown to drawn: Tab 5 to 20 ms on simple equations,
**153 ms** on `I(t) = ∫₀¹ (xᵗ − 1)/ln x dx`; C 3 to 16 ms; f 3 to 10 ms.

## 10. Recipes

How to make the common changes. Each names the one place to touch; if a change needs more places
than listed, the architecture is missing something: say so instead of patching around it.

- **A new move on a key:** engine function returning `MoveResult` and ending in `checked()`, with a test
  in `tests/`; then one entry in `MOVE_KEYS` (`ui/shared.ts`) or the key switch in `ui/keys.ts`.
- **A new form (Tab, browse with preview):** a `push(name, next, hints)` in `engine/forms.ts formsFor`,
  and a chord in its `CHORDS` table if it gets a key.
- **A new calculus technique (C):** today an entry in `calcTechniques()` (`ui/calc.ts`) under its
  section; after slice 7, one `offer()` in `ui/menus/calc.ts`.
- **A new function family (f):** today `FN_TABS` in `engine/techniques.ts`; after slice 3, `ui/menus/fn.ts`.
- **A new typed input:** today a new `opKind` plus open/result/commit functions; after slice 8, one `Ask`.
- **A sound set or look:** one file in `src/packs/`, listed in `src/packs/index.ts` (`docs/EXTENDING.md`).
- **A new UI behaviour:** microdesign skill first, then an e2e test in `e2e/` that presses the real keys.
