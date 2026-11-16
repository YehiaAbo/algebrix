// Plastic building bricks: every move snaps into place with a two-part click
// (the studs meeting, then seating), undo pops a brick off, solving rattles a few.
import { SoundPack } from '../types';

/** one brick snapping: a bright plastic tick, then a hollow body knock a moment later */
const snap = (tone: (f: number, d: number, v: number, t?: OscillatorType, g?: number, dl?: number) => void,
  noise: (d: number, v: number, f: number, q?: number, dl?: number) => void, pitch = 1, delay = 0) => {
  noise(0.008, 0.32, 4200 * pitch, 3.5, delay);
  noise(0.018, 0.22, 1500 * pitch, 2.2, delay + 0.022);
  tone(520 * pitch, 0.035, 0.06, 'triangle', 0.8, delay + 0.022);
};

export const blocks: SoundPack = {
  id: 'blocks',
  name: 'Blocks',
  blurb: 'Plastic bricks snapping together.',
  make: ({ tone, noise }) => ({
    tick: depth => noise(0.006, 0.12, 3600 + depth * 260, 4),
    labels: () => { noise(0.006, 0.1, 3000, 4); noise(0.006, 0.1, 3600, 4, 0.03); noise(0.006, 0.1, 4200, 4, 0.06); },
    move: pitch => snap(tone, noise, pitch),
    refuse: () => { noise(0.012, 0.25, 900, 3); noise(0.012, 0.22, 800, 3, 0.07); tone(140, 0.05, 0.06, 'square', 0.9, 0.07); },
    undo: () => { noise(0.016, 0.22, 1300, 2.5); noise(0.008, 0.18, 3800, 4, 0.03); },
    commit: () => { snap(tone, noise, 0.9); snap(tone, noise, 1.1, 0.07); },
    solved: () => { [0, 0.06, 0.12, 0.18].forEach((d, i) => snap(tone, noise, 0.9 + i * 0.12, d)); tone(784, 0.18, 0.035, 'triangle', 1, 0.24); },
  }),
};
