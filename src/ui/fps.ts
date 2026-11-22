// The frame meter: ` (backquote) or #fps in the address shows how smoothly the app is drawing,
// measured where it runs (the Claude app, a browser, the desktop app). Costs nothing while off.
//   fps       frames in the last second (the screen's refresh rate when nothing is lost)
//   low       the slowest 1% of frames, as fps: what a stutter feels like
//   worst     the longest frame in the last 5 s, in ms
//   blocked   main-thread tasks over 50 ms in the last 5 s
// window.algebrixPerf() returns the same numbers.
const W = window as unknown as { algebrixPerf?: () => Record<string, number> };
let on = false, el: HTMLElement | null = null, raf = 0;
const frames: number[] = []; // [time, interval] pairs, last 5 s
const longs: number[] = [];
let last = 0, shown = 0;

function stats() {
  const now = performance.now();
  while (frames.length && frames[0] < now - 5000) frames.splice(0, 2);
  while (longs.length && longs[0] < now - 5000) longs.splice(0, 2);
  const iv: number[] = [];
  let lastSec = 0;
  for (let i = 0; i < frames.length; i += 2) { iv.push(frames[i + 1]); if (frames[i] > now - 1000) lastSec++; }
  const sorted = [...iv].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  return { fps: lastSec, refreshHz: median ? Math.round(1000 / median) : 0, low1pct: p99 ? Math.round(1000 / p99) : 0, worstMs: Math.round(sorted[sorted.length - 1] ?? 0), blocked: longs.length / 2, blockedMs: longs.filter((_, i) => i % 2).reduce((a, b) => Math.max(a, b), 0) };
}

function tick(t: number) {
  if (last) frames.push(t, t - last);
  last = t;
  if (t - shown > 250 && el) {
    shown = t;
    const s = stats();
    el.textContent = `${s.fps} fps · low ${s.low1pct} · worst ${s.worstMs} ms${s.blocked ? ` · blocked ${s.blocked}× (${s.blockedMs} ms)` : ''}`;
    el.classList.toggle('bad', s.low1pct < 0.75 * s.refreshHz || s.blocked > 0);
  }
  raf = requestAnimationFrame(tick);
}

let observer: PerformanceObserver | null = null;
export function toggleMeter(force?: boolean) {
  on = force ?? !on;
  if (on) {
    el ??= Object.assign(document.createElement('div'), { id: 'fps' });
    document.body.append(el);
    frames.length = 0; longs.length = 0; last = 0;
    try { observer = new PerformanceObserver(l => { for (const e of l.getEntries()) longs.push(e.startTime, Math.round(e.duration)); }); observer.observe({ type: 'longtask' }); } catch { /* not supported */ }
    raf = requestAnimationFrame(tick);
  } else {
    cancelAnimationFrame(raf); observer?.disconnect(); el?.remove();
  }
}

export function initMeter() {
  W.algebrixPerf = stats;
  window.addEventListener('keydown', e => {
    const t = e.target as HTMLElement | null;
    if (e.key === '`' && !e.ctrlKey && !e.metaKey && !(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) { e.preventDefault(); toggleMeter(); }
  }, true);
  if (location.hash.includes('fps')) toggleMeter(true);
}
