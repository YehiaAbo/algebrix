# Extending Algebrix

Algebrix is split so that big additions land in one place each.

| You want to add | Where | Touches the rest? |
|---|---|---|
| A sound set (e.g. bricks, 8-bit) | `src/packs/sounds/<name>.ts` + one line in `src/packs/index.ts` | No |
| A look (e.g. pixel art, chalkboard) | `src/packs/looks/<name>.ts` + one line in `src/packs/index.ts` | No |
| A new rewrite of an equation (a "form", hold `e`) | `src/engine/forms.ts`, using helpers from `rewrite.ts` / `polytools.ts` | Shows up in the `e` menu by itself |
| A new move or technique | `src/engine/moves.ts` or `techniques.ts`, then a key in `src/ui/app.ts` | One key binding |
| A new kind of goal (prove, define, solve an inequality…) | `src/engine/ast.ts` (`Rel`), `moves.ts` (`relAfter`) | Print/layout for the relation |
| A setting | `src/ui/prefs.ts` (field + default) and a row in `src/ui/settings.ts` | Listen with `onPrefs` |
| A subject pack (calculus, linear algebra) | Start in `src/engine/`, test-first, then a menu in the UI | See "Rules" |

## A sound pack

```ts
// src/packs/sounds/chalk.ts
import { SoundPack } from '../types';

export const chalk: SoundPack = {
  id: 'chalk', name: 'Chalk', blurb: 'Scratchy and dry.',
  make: ({ tone, noise }) => ({
    tick: depth => noise(0.01, 0.08, 6000 + depth * 200, 3),
    labels: () => noise(0.03, 0.06, 5000, 1),
    move: pitch => noise(0.06, 0.18, 3000 * pitch, 0.8),
    refuse: () => tone(140, 0.08, 0.1, 'square'),
    undo: () => noise(0.04, 0.1, 2200, 1),
    commit: () => noise(0.09, 0.15, 3500, 0.7),
    solved: () => { tone(660, 0.2, 0.04); tone(990, 0.25, 0.035, 'sine', 1, 0.08); },
  }),
};
```

Add `chalk` to `SOUND_PACKS` in `src/packs/index.ts`. It appears under Settings → Sounds.
`tone`, `noise` and `sample` are already connected to the volume and mute settings.
`sample(key, render, vol, rate)` plays samples you compute yourself: `render` gets the sample
rate and returns a `Float32Array`, rendered once and cached by `key`. `prepare(key, render)`
renders one ahead, in idle moments after the first sound, so a first play never stalls a frame. The Bricks pack
(`src/packs/sounds/bricks.ts`) builds every sound this way, by modal synthesis (a struck
brick as a few damped plate modes), with several variants per sound so no two clicks match;
`WAV_OUT=dir npx vitest run tests/bricks.test.ts` writes them out to listen to.
Recorded samples work the same way: decode them once and return their samples from `render`.

## A look

A look is CSS scoped to `:root[data-look="<id>"]`. It can override any token at the top
of `src/style.css` (`--bg`, `--ink`, `--sel`, `--math-font`, `--ease`…) and any class.
`fonts` loads a Google Font when the look is chosen; `easing` changes how glyphs move.
See `src/packs/looks/pixel.ts`. The math layout measures with `--math-font`, so changing it is safe.

## Rules (from CLAUDE.md)

- Engine code is pure and test-first (`npm test`). The 50-problem set in `tests/problems.test.ts` must stay green.
- Never ship a move that isn't covered by the numeric equivalence check (`verify` / `checked`).
- No UI framework; animation code stays direct (Web Animations API, keyed by node id).
