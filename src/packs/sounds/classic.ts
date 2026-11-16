// The original sound set: soft clacks and sine chimes, quiet enough to never grate.
import { SoundPack } from '../types';

export const classic: SoundPack = {
  id: 'classic',
  name: 'Studio',
  blurb: 'Soft clacks and quiet chimes.',
  make: ({ tone, noise }) => ({
    tick: depth => { tone(1400 + depth * 130, 0.035, 0.05, 'triangle'); noise(0.012, 0.045, 5200, 2); },
    labels: () => tone(620, 0.07, 0.035, 'sine', 1.5),
    move: pitch => {
      noise(0.03, 0.2, 2600 * pitch, 1.4);
      tone(190 * pitch, 0.12, 0.15, 'sine', 0.7);
      tone(820 * pitch, 0.05, 0.03, 'triangle', 0.9, 0.012);
    },
    refuse: () => { tone(150, 0.07, 0.11, 'square', 0.9); tone(120, 0.09, 0.09, 'square', 0.9, 0.075); },
    undo: () => { tone(900, 0.05, 0.045, 'triangle', 0.6); noise(0.02, 0.06, 1800, 1.5); },
    commit: () => { tone(392, 0.16, 0.05); tone(587, 0.2, 0.045, 'sine', 1, 0.05); noise(0.025, 0.1, 2200); },
    solved: () => { tone(523, 0.22, 0.045); tone(659, 0.24, 0.04, 'sine', 1, 0.06); tone(988, 0.3, 0.035, 'sine', 1, 0.12); },
  }),
};
