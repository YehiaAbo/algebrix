// What a pack is. Packs change how Algebrix sounds and looks without touching the
// engine or the app: write one file, add it to the list in ./index.ts, done.
// See docs/EXTENDING.md for a walkthrough.

/** the two building blocks every sound is made of (Web Audio, already wired to volume) */
export interface Synth {
  /** a pitched note: frequency (Hz), length (s), volume (0..1), wave, pitch glide factor, delay (s) */
  tone(freq: number, dur: number, vol: number, type?: OscillatorType, glide?: number, delay?: number): void;
  /** a filtered click or hiss: length (s), volume, centre frequency (Hz), filter sharpness, delay (s) */
  noise(dur: number, vol: number, freq: number, q?: number, delay?: number): void;
  /** a sound rendered once from samples and cached by key: render gets the sample rate and
   *  returns the samples (−1..1); played at a volume and a rate (1 = as rendered), after a delay */
  sample(key: string, render: (sampleRate: number) => Float32Array, vol: number, rate?: number, delay?: number): void;
  /** render a sample ahead of time, in idle moments, so its first play costs nothing */
  prepare(key: string, render: (sampleRate: number) => Float32Array): void;
}

/** every moment the app makes a sound for */
export interface Sounds {
  /** aiming at a piece; depth is how deep in the tree it sits */
  tick(depth: number): void;
  /** the letter labels appearing (Space) */
  labels(): void;
  /** a move landing; pitch varies a little by kind of move */
  move(pitch: number): void;
  /** a move that isn't allowed */
  refuse(): void;
  undo(): void;
  /** an equation typed in and accepted */
  commit(): void;
  /** solved, or a proof finished */
  solved(): void;
}

export interface SoundPack {
  id: string;
  name: string;
  /** one short line for the settings panel */
  blurb: string;
  make(s: Synth): Sounds;
}

export interface LookPack {
  id: string;
  name: string;
  blurb: string;
  /** Google Fonts css2 families to load, e.g. "Pixelify+Sans:wght@400;600" */
  fonts?: string;
  /** CSS scoped under :root[data-look="<id>"]; it can override any --token in style.css */
  css: string;
  /** how glyphs move: smooth curves, or stepped like a sprite */
  easing?: string;
}
