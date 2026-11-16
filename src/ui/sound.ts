// Small synthesized sounds. Quiet, short, and tuned so repeated use never grates.
let ac: AudioContext | null = null;
let out: GainNode | null = null;
let muted = false;
try { muted = localStorage.getItem('algebrix.muted') === '1'; } catch { /* storage blocked */ }

function ctx() {
  if (!ac) {
    ac = new AudioContext();
    out = ac.createGain();
    out.gain.value = 0.55;
    const comp = ac.createDynamicsCompressor();
    out.connect(comp).connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', glide = 1, delay = 0) {
  const c = ctx(), t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glide !== 1) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out!);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, freq: number, q = 1.2, delay = 0) {
  const c = ctx(), t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.value = vol;
  src.connect(f).connect(g).connect(out!);
  src.start(t);
}

const play = (fn: () => void) => { if (!muted) try { fn(); } catch { /* audio unavailable */ } };

export const sound = {
  /** aiming: pitch tracks depth, deeper = higher */
  tick: (depth = 0) => play(() => { tone(1400 + depth * 130, 0.035, 0.05, 'triangle'); noise(0.012, 0.045, 5200, 2); }),
  labels: () => play(() => tone(620, 0.07, 0.035, 'sine', 1.5)),
  /** a move landing: soft "clack" with a little body */
  move: (pitch = 1) => play(() => {
    noise(0.03, 0.2, 2600 * pitch, 1.4);
    tone(190 * pitch, 0.12, 0.15, 'sine', 0.7);
    tone(820 * pitch, 0.05, 0.03, 'triangle', 0.9, 0.012);
  }),
  refuse: () => play(() => { tone(150, 0.07, 0.11, 'square', 0.9); tone(120, 0.09, 0.09, 'square', 0.9, 0.075); }),
  undo: () => play(() => { tone(900, 0.05, 0.045, 'triangle', 0.6); noise(0.02, 0.06, 1800, 1.5); }),
  commit: () => play(() => { tone(392, 0.16, 0.05); tone(587, 0.2, 0.045, 'sine', 1, 0.05); noise(0.025, 0.1, 2200); }),
  solved: () => play(() => { tone(523, 0.22, 0.045); tone(659, 0.24, 0.04, 'sine', 1, 0.06); tone(988, 0.3, 0.035, 'sine', 1, 0.12); }),
  get muted() { return muted; },
  toggle() {
    muted = !muted;
    try { localStorage.setItem('algebrix.muted', muted ? '1' : '0'); } catch { /* storage blocked */ }
    return muted;
  },
};
