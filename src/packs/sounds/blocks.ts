// Toy bricks: every move presses a brick on, undo pulls one off, a move that won't go is
// studs on studs, and solving is a hand through the box. The sounds are synthesized in
// ./bricks.ts; here they are chosen, varied and paced. Real bricks never click the same way
// twice, so each sound has several variants played in turn, never the same one twice running.
import { SoundPack } from '../types';
import { snap, press, unsnap, misfit, tap, studs, rummage } from './bricks';

const VARIANTS = 6;

export const blocks: SoundPack = {
  id: 'blocks',
  name: 'Bricks',
  blurb: 'Toy bricks: pressed on, pulled off, a hand in the box.',
  make: ({ sample }) => {
    const turn: Record<string, number> = {};
    // the next variant of a sound, skipping the one just played
    const next = (name: string) => { const k = ((turn[name] ?? -1) + 1 + Math.floor(Math.random() * (VARIANTS - 1))) % VARIANTS; turn[name] = k; return k; };
    const wobble = () => 0.97 + Math.random() * 0.06;
    return {
      tick: depth => { const d = Math.min(depth, 8), k = next('tap' + d); sample(`tap:${d}:${k}`, tap(k + 1, d), 0.5, wobble()); },
      labels: () => { const k = next('studs'); sample(`studs:${k}`, studs(k + 1), 0.6); },
      // a bigger change is a bigger brick: pitch below 1 is lower and heavier
      move: pitch => { const k = next('snap'); sample(`snap:${k}`, snap(k + 1), 0.95, pitch * wobble()); },
      refuse: () => { const k = next('misfit'); sample(`misfit:${k}`, misfit(k + 1), 0.8, wobble()); },
      undo: () => { const k = next('unsnap'); sample(`unsnap:${k}`, unsnap(k + 1), 0.85, wobble()); },
      commit: () => { const k = next('press'); sample(`press:${k}`, press(k + 1, 1.25), 1, wobble()); },
      solved: () => { const k = next('rummage'); sample(`rummage:${k}`, rummage(k + 1), 0.9); },
    };
  },
};
