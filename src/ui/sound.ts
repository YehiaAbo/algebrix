// Sound output. The sounds themselves live in packs (src/packs/sounds); this file
// owns the audio context, the volume and mute, and hands packs their two primitives.
import { prefs, setPref, onPrefs } from './prefs';
import { soundPack, Sounds, Synth } from '../packs';

let ac: AudioContext | null = null;
let out: GainNode | null = null;
const GAIN = 0.7;

function ctx() {
  if (!ac) {
    ac = new AudioContext();
    out = ac.createGain();
    out.gain.value = GAIN * prefs.volume;
    const comp = ac.createDynamicsCompressor();
    out.connect(comp).connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

const synth: Synth = {
  tone(freq, dur, vol, type = 'sine', glide = 1, delay = 0) {
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
  },
  noise(dur, vol, freq, q = 1.2, delay = 0) {
    const c = ctx(), t = c.currentTime + delay;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.value = vol;
    src.connect(f).connect(g).connect(out!);
    src.start(t);
  },
  sample(name, render, vol, rate = 1, delay = 0) {
    const c = ctx(), buf = bake(c, name, render);
    warmUp();
    const src = c.createBufferSource(), g = c.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = vol;
    src.connect(g).connect(out!);
    src.start(c.currentTime + delay);
  },
  prepare(name, render) { if (!rendered.has(name)) { queue.push([name, render]); warmUp(); } },
};
const rendered = new Map<string, AudioBuffer>();
function bake(c: AudioContext, name: string, render: (sampleRate: number) => Float32Array) {
  let buf = rendered.get(name);
  if (!buf) {
    const d = render(c.sampleRate);
    buf = c.createBuffer(1, d.length, c.sampleRate);
    buf.getChannelData(0).set(d);
    rendered.set(name, buf);
  }
  return buf;
}
// samples waiting to be rendered: a few at a time while the page is idle, once there is an
// audio context (made on the first sound, never before, so the browser has no reason to complain)
const queue: [string, (sampleRate: number) => Float32Array][] = [];
let warming = false;
function warmUp() {
  if (warming || !ac || !queue.length) return;
  warming = true;
  const idle = (window as { requestIdleCallback?: (f: (d: { timeRemaining(): number }) => void) => void }).requestIdleCallback ?? ((f: (d: { timeRemaining(): number }) => void) => setTimeout(() => f({ timeRemaining: () => 8 }), 50));
  const step = (d: { timeRemaining(): number }) => {
    while (queue.length && d.timeRemaining() > 4) { const [name, render] = queue.shift()!; bake(ac!, name, render); }
    if (queue.length) idle(step); else warming = false;
  };
  idle(step);
}

let active: Sounds = soundPack(prefs.sounds).make(synth);
onPrefs((p, k) => {
  if (k === 'sounds') active = soundPack(p.sounds).make(synth);
  if (k === 'volume' && out) out.gain.value = GAIN * p.volume;
});

const play = (fn: () => void) => { if (!prefs.muted && prefs.volume > 0) try { fn(); } catch { /* audio unavailable */ } };

export const sound = {
  tick: (depth = 0) => play(() => active.tick(depth)),
  labels: () => play(() => active.labels()),
  move: (pitch = 1) => play(() => active.move(pitch)),
  refuse: () => play(() => active.refuse()),
  undo: () => play(() => active.undo()),
  commit: () => play(() => active.commit()),
  solved: () => play(() => active.solved()),
  get muted() { return prefs.muted; },
  toggle() { setPref('muted', !prefs.muted); return prefs.muted; },
};
