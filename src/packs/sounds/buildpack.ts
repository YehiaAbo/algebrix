// Brick-game building: every move snaps a piece on with a note, and a run of moves climbs a
// scale, so solving sounds like a model coming together. Stop for a moment and it starts low
// again. The sounds are synthesized in ./build.ts; Bricks (./blocks.ts) is the quiet, real one.
import { SoundPack } from '../types';
import { click, assemble, pop, nope, tick, ratchet, complete } from './build';

const VARIANTS = 4;
/** a major pentatonic run, two octaves from A5: never a wrong note, whatever the order */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const BASE = 880;
const note = (step: number) => BASE * 2 ** (SCALE[Math.min(step, SCALE.length - 1)] / 12);

export const build: SoundPack = {
  id: 'build',
  name: 'Build',
  blurb: 'Brick-game building: snaps that climb as you go, a sparkle when it is done.',
  make: ({ sample, prepare }) => {
    for (let k = 0; k < VARIANTS; k++) {
      for (let s = 0; s < SCALE.length; s++) prepare(`build:click:${s}:${k}`, click(k + 1, note(s)));
      prepare(`build:assemble:${k}`, assemble(k + 1)); prepare(`build:pop:${k}`, pop(k + 1)); prepare(`build:nope:${k}`, nope(k + 1));
      prepare(`build:ratchet:${k}`, ratchet(k + 1)); prepare(`build:complete:${k}`, complete(k + 1));
      for (let d = 0; d <= 8; d++) prepare(`build:tick:${d}:${k}`, tick(k + 1, d));
    }
    const turn: Record<string, number> = {};
    const next = (name: string) => { const k = ((turn[name] ?? -1) + 1 + Math.floor(Math.random() * (VARIANTS - 1))) % VARIANTS; turn[name] = k; return k; };
    // the build streak: each move within a few seconds of the last goes one note up
    let streak = 0, last = 0;
    const climb = () => { const now = performance.now(); streak = now - last < 3000 ? streak + 1 : 0; last = now; return Math.min(streak, SCALE.length - 1); };
    return {
      tick: depth => { const d = Math.min(depth, 8), k = next('tick' + d); sample(`build:tick:${d}:${k}`, tick(k + 1, d), 0.45); },
      labels: () => { const k = next('ratchet'); sample(`build:ratchet:${k}`, ratchet(k + 1), 0.55); },
      move: () => { const s = climb(), k = next('click'); sample(`build:click:${s}:${k}`, click(k + 1, note(s)), 0.9); },
      refuse: () => { const k = next('nope'); sample(`build:nope:${k}`, nope(k + 1), 0.75); },
      // undo steps back down the scale with the piece it took off
      undo: () => { streak = Math.max(0, streak - 1); last = performance.now(); const k = next('pop'); sample(`build:pop:${k}`, pop(k + 1), 0.8); },
      commit: () => { streak = 0; last = performance.now(); const k = next('assemble'); sample(`build:assemble:${k}`, assemble(k + 1), 0.95); },
      solved: () => { streak = 0; const k = next('complete'); sample(`build:complete:${k}`, complete(k + 1), 0.95); },
    };
  },
};
