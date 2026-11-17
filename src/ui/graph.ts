// Live graph of the current equation. One variable: the two sides as curves, their
// crossing is the solution (it never moves while you work). Two variables: the
// solution curve itself. Three variables: the solution surface in 3D. Both curve and
// surface stay the same at every step: visual proof that no move broke anything.
// Desmos-style handling: drag to pan (or turn, in 3D), scroll to zoom at the cursor,
// double-click to reset, hover a curve or a point to read its coordinates.
import { Eq, Node, Int, Lim, evaluate, symbols, relOf, isIneq, holds, walk, num } from '../engine/ast';
import { toText } from '../engine/print';
import { substitute } from '../engine/calculus';

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

type View = { cx: number; cy: number; span: number };
type Quad = { p: [number, number, number][]; n: number[] };

/** a number to picture: ∫ₐᵇ f dx as the area under f, lim x→a f as the point f heads for */
function calcPicture(eq: Eq): Int | Lim | null {
  if (relOf(eq) !== 'expr') return null;
  let pic: Int | Lim | null = null;
  walk(eq.lhs, n => {
    if (pic) return;
    if (n.k === 'int' && n.lo && n.hi && symbols(n.arg).every(s => s === n.v) && !Number.isNaN(evaluate(n.lo, {})) && !Number.isNaN(evaluate(n.hi, {}))) pic = n;
    if (n.k === 'lim' && symbols(n.arg).every(s => s === n.v)) pic = n;
  });
  return pic;
}

/** + C and C₁, C₂: constants of integration, not axes */
const isConst = (v: string) => /^C(_\d+)?$/.test(v);
/** the letters to graph against */
const plotVars = (eq: Eq) => symbols(eq).filter(v => !isConst(v));
/** y′ = f(x, y): the letters x, y and y′, when it is a first-order differential equation */
function odeVars(vars: string[]): { x: string; y: string; p: string } | null {
  const p = vars.find(v => v.endsWith('′'));
  if (!p || vars.some(v => v.endsWith('″')) || vars.length !== 3) return null;
  const y = p.slice(0, -1);
  const x = vars.find(v => v !== p && v !== y);
  return vars.includes(y) && x ? { x, y, p } : null;
}
/** eq with every constant of integration set to c */
const withConst = (eq: Eq, c: number): Eq => { const cs = symbols(eq).filter(isConst); return cs.reduce<Eq>((e, v) => substitute(e, v, num(c)) as Eq, eq); };

const hasVector = (eq: Eq) => { let f = false; walk(eq, n => { if (n.k === 'vec' || n.k === 'grad') f = true; }); return f; };

export class Graph {
  private ctx: CanvasRenderingContext2D;
  private eq: Eq | null = null;
  private others: Eq[] = [];
  private view: View = { cx: 0, cy: 0, span: 10 };
  private raf = 0;
  private viewRaf = 0;
  /** curve morph between steps (1 variable): samples taken before the step, and progress */
  private morph: { l: number[]; r: number[]; t: number } | null = null;
  private last: { l: number[]; r: number[] } | null = null;
  private fade = 1;
  /** said under the graph after its own note (the app's warnings, like an answer that fails the original) */
  extra = '';
  /** the view was moved to frame an area or a limit */
  private framed = false;
  private mouse: { x: number; y: number } | null = null;
  private drag: { x: number; y: number; moved: boolean } | null = null;
  // 3D
  private yaw = -0.7;
  private pitch = 0.45;
  private r3 = 5;
  private mesh: { quads: Quad[]; key: string; vars: string[] } | null = null;
  private W = 0;
  private H = 0;

  constructor(private canvas: HTMLCanvasElement, private note: HTMLElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.render()).observe(canvas);
    canvas.addEventListener('pointerdown', e => {
      this.drag = { x: e.clientX, y: e.clientY, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 2) this.drag.moved = true;
        this.drag.x = e.clientX; this.drag.y = e.clientY;
        if (this.is3d()) {
          this.yaw -= dx * 0.008;
          this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * 0.008));
        } else {
          const s = this.scale();
          this.view.cx -= dx / s; this.view.cy += dy / s;
        }
        cancelAnimationFrame(this.viewRaf);
        canvas.style.cursor = 'grabbing';
      }
      this.render();
    });
    const end = () => { this.drag = null; canvas.style.cursor = ''; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => { this.mouse = null; this.render(); });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const f = Math.exp(e.deltaY * 0.0015);
      if (this.is3d()) { this.r3 = clamp(this.r3 * f, 1, 100); this.mesh = null; return this.render(); }
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const [ux, uy] = this.toUnits(px, py);
      const span = clamp(this.view.span * f, 0.05, 2000);
      // keep the point under the cursor fixed
      const s = this.W / (2 * span);
      this.view = { span, cx: ux - (px - this.W / 2) / s, cy: uy + (py - this.H / 2) / s };
      cancelAnimationFrame(this.viewRaf);
      this.render();
    }, { passive: false });
    canvas.addEventListener('dblclick', () => this.reset());
  }

  zoom(f: number) {
    if (this.is3d()) { this.r3 = clamp(this.r3 * f, 1, 100); this.mesh = null; return this.render(); }
    this.animateView({ ...this.view, span: clamp(this.view.span * f, 0.05, 2000) });
  }

  reset() {
    if (this.is3d()) {
      const from = { yaw: this.yaw, pitch: this.pitch }, t0 = performance.now();
      this.r3 = 5; this.mesh = null;
      const tick = () => {
        const t = ease(Math.min(1, (performance.now() - t0) / 380));
        this.yaw = from.yaw + (-0.7 - from.yaw) * t; this.pitch = from.pitch + (0.45 - from.pitch) * t;
        this.render();
        if (t < 1) this.viewRaf = requestAnimationFrame(tick);
      };
      cancelAnimationFrame(this.viewRaf); tick();
      return;
    }
    this.animateView({ cx: 0, cy: 0, span: 10 });
  }

  /** a new picture of an area or a limit: bring its part of the curve into view */
  private frame(eq: Eq) {
    const p = plotVars(eq).length === 0 ? calcPicture(eq) : null;
    if (!p) {
      // one letter: make sure where the sides cross is in view (3x + 7 = 22 meets at y = 22,
      // 3x + 5 = 2x − 7 at x = −12): look near first, then further out, and frame the nearest
      const vs = plotVars(eq);
      if (vs.length === 1 && relOf(eq) === '=') {
        const v = vs[0], f = (x: number) => evaluate(eq.lhs, { [v]: x }) - evaluate(eq.rhs, { [v]: x });
        const ratio = (this.H || 1) / (this.W || 1);
        for (const reach of [10, 100, 1000]) {
          const step = reach / 200;
          let best: number | null = null;
          for (let a = -reach; a < reach; a += step) {
            const fa = f(a), fb = f(a + step);
            if (fa * fb <= 0 && Number.isFinite(fa + fb) && (best === null || Math.abs(a) < Math.abs(best))) best = a + step / 2;
          }
          if (best === null) continue;
          const y = evaluate(eq.lhs, { [v]: best });
          if (!Number.isFinite(y)) break;
          // already comfortably in the usual view: leave it
          if (Math.abs(best) < 8.5 && Math.abs(y) < 0.85 * 10 * ratio) break;
          this.framed = true;
          this.animateView({ cx: best / 2, cy: y / 2, span: Math.max(10, Math.abs(best) / 2 + 2, (Math.abs(y) / 2 + 2) / ratio) });
          return;
        }
      }
      // back from a framed view to an ordinary graph: the usual view again
      if (this.framed) { this.framed = false; this.animateView({ cx: 0, cy: 0, span: 10 }); }
      return;
    }
    this.framed = true;
    const f = (x: number) => evaluate(p.arg, { [p.v]: x });
    let a: number, b: number;
    if (p.k === 'int') { a = evaluate(p.lo!, {}); b = evaluate(p.hi!, {}); if (!Number.isFinite(a) || !Number.isFinite(b)) return; }
    else { const t = evaluate(p.to, {}); if (!Number.isFinite(t)) return; a = t - 2; b = t + 2; }
    if (a > b) [a, b] = [b, a];
    const ys = Array.from({ length: 41 }, (_, i) => f(a + (b - a) * i / 40)).filter(Number.isFinite);
    const span = Math.max(0.5, (b - a) * 0.8);
    const lo = Math.min(0, ...ys), hi = Math.max(0, ...ys);
    const halfH = span * (this.H || 1) / (this.W || 1);
    const cy = hi - lo < 2 * halfH ? (lo + hi) / 2 : clamp((lo + hi) / 2, lo + halfH * 0.8, hi - halfH * 0.8);
    this.animateView({ cx: (a + b) / 2, cy, span });
  }

  private animateView(to: View) {
    cancelAnimationFrame(this.viewRaf);
    const from = { ...this.view }, t0 = performance.now();
    const tick = () => {
      const t = ease(Math.min(1, (performance.now() - t0) / 320));
      // zoom geometrically so it feels even
      this.view = { cx: from.cx + (to.cx - from.cx) * t, cy: from.cy + (to.cy - from.cy) * t, span: from.span * Math.pow(to.span / from.span, t) };
      this.render();
      if (t < 1) this.viewRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  draw(eq: Eq, animate: boolean, others: Eq[] = this.others) {
    const fresh = !this.eq || symbols(this.eq).join() !== symbols(eq).join();
    this.eq = eq;
    this.others = others;
    const morph = animate && this.last ? { ...this.last, t: 0 } : null;
    // nothing new to animate: draw, and let a fade or morph already under way finish
    if (!morph && !fresh) return this.render();
    cancelAnimationFrame(this.raf);
    this.morph = morph;
    if (fresh) { this.fade = 0; this.frame(eq); }
    const t0 = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / 300);
      if (this.morph) this.morph.t = ease(t);
      if (fresh) this.fade = ease(t);
      this.render();
      if (t < 1) this.raf = requestAnimationFrame(tick);
      else this.morph = null;
    };
    tick();
  }

  private is3d() { return !!this.eq && plotVars(this.eq).length === 3 && !odeVars(plotVars(this.eq)); }
  private scale() { return this.W / (2 * this.view.span); }
  private toUnits(px: number, py: number): [number, number] {
    const s = this.scale();
    return [this.view.cx + (px - this.W / 2) / s, this.view.cy - (py - this.H / 2) / s];
  }

  private render() {
    let eq = this.eq;
    if (!eq) return;
    const dpr = window.devicePixelRatio || 1;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    if (!W || !H) return;
    if (this.canvas.width !== Math.round(W * dpr) || this.canvas.height !== Math.round(H * dpr)) {
      this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    }
    this.W = W; this.H = H;
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const full = eq;
    const vars = plotVars(eq);
    const family = symbols(eq).some(isConst);
    // + C: a whole family of curves; drawn with C = 0 where one curve is wanted
    if (family) eq = withConst(eq, vars.length === 2 ? 1 : 0);
    const ode = odeVars(vars);
    if (ode) return this.renderSlopes(eq, ode);
    if (vars.length === 3 && !hasVector(eq)) return this.render3d(eq, vars);
    this.last = null;
    const s = this.scale();
    const X = (x: number) => W / 2 + (x - this.view.cx) * s, Y = (y: number) => H / 2 - (y - this.view.cy) * s;
    const ux = (px: number) => this.toUnits(px, 0)[0], uy = (py: number) => this.toUnits(0, py)[1];
    const vector = hasVector(eq);
    const pic = vars.length === 0 && !vector ? calcPicture(eq) : null;
    if (pic) {
      c.globalAlpha = this.fade;
      this.renderPicture(pic, X, Y, ux, uy);
      c.globalAlpha = 1;
      return;
    }
    if (vars.length === 0 || vars.length > 3 || vector) {
      this.grid(X, Y, ux, uy, 'x', 'y');
      this.note.textContent = vector ? 'Vectors are not graphed. Split into components (e) to see each one.' : vars.length === 0 ? (relOf(eq) !== 'expr' && holds(eq, {}) !== null ? `No letters left: ${toText(eq)} is ${holds(eq, {}) ? 'always' : 'never'} true.` : 'No letters, so nothing to graph.') : vars.some(v => v.endsWith('″')) ? 'A second-order equation: solve it (e) to see its family of solutions.' : `${vars.length} variables. The graph shows up to three.`;
      return;
    }
    c.globalAlpha = this.fade;
    if (vars.length === 1) this.render1(eq, vars[0], X, Y, ux);
    else this.render2(eq, vars, X, Y, ux, uy, family ? full : null);
    c.globalAlpha = 1;
  }

  private render1(eq: Eq, v: string, X: (x: number) => number, Y: (y: number) => number, ux: (p: number) => number) {
    const { W } = this, c = this.ctx;
    const N = Math.ceil(W / 1.5);
    const xs = Array.from({ length: N + 1 }, (_, i) => ux((i / N) * W));
    const sample = (n: Node) => xs.map(x => evaluate(n, { [v]: x }));
    const l = sample(eq.lhs), r = sample(eq.rhs);
    this.last = { l, r };
    const f = (x: number) => evaluate(eq.lhs, { [v]: x }) - evaluate(eq.rhs, { [v]: x });
    const roots: number[] = [];
    for (const i of findRoots(i => l[i] - r[i], N)) {
      let a = xs[Math.floor(i)], b = xs[Math.min(N, Math.ceil(i + 1e-9))];
      if (f(a) === 0) b = a;
      for (let k = 0; k < 60 && b - a > 1e-13; k++) { const m = (a + b) / 2; (f(a) < 0) === (f(m) < 0) ? (a = m) : (b = m); }
      const x0 = Math.round(((a + b) / 2) * 1e9) / 1e9;
      if (!roots.some(x => Math.abs(x - x0) < 1e-6)) roots.push(x0);
    }
    const rel = relOf(eq);
    // a lone expression or a definition is one curve: y = it
    const single = rel === 'expr' ? 'l' : rel === 'def' ? 'r' : null;
    const blank = single && (single === 'l' ? l : r).every(y => !Number.isFinite(y));
    this.note.innerHTML = blank ? 'Nothing to draw yet: an indefinite integral is only known up to + C. Work it out (e) and its curve appears.'
      : single ? `The graph of <b>y = ${rel === 'def' ? (eq.lhs.k === 'call' ? eq.lhs.name + '(' + v + ')' : 'it') : toText(eq.lhs).length <= 28 ? escapeText(eq.lhs) : 'it'}</b>. Rewriting never changes it. Grey dots: zeros, peaks and dips (hover one).`
      : isIneq(eq) ? `Shaded where it holds. The boundary is where the sides meet${roots.length ? `, <b>${v} ${roots.every(exact) ? '=' : '≈'} ${roots.slice(0, 3).map(fmt).join(', ')}</b>` : ''}.`
      : rel === '≟' ? 'The two sides are the same curve everywhere. That is what you are proving.'
      : roots.length
      ? `Sides cross at <b>${v} ${roots.every(exact) ? '=' : '≈'} ${roots.slice(0, 3).map(fmt).join(', ')}</b>${roots.length > 3 ? '…' : ''}. ${roots.length > 1 ? 'Those points never move' : 'That point never moves'} while the steps are reversible.`
      : 'The two sides never cross in view. Drag or scroll to look around.';
    if (this.extra) this.note.innerHTML += ` <span class="graph-warn">${this.extra}</span>`;
    this.grid(X, Y, ux, (py: number) => this.toUnits(0, py)[1], v, '');
    if (isIneq(eq)) {
      c.fillStyle = css('--graph-a'); c.globalAlpha = 0.14 * this.fade;
      xs.forEach((x, i) => { if (holds(eq, { [v]: x })) c.fillRect((i / N) * this.W - 0.5, 0, this.W / N + 1, this.H); });
      c.globalAlpha = this.fade;
    }
    const m = this.morph && this.morph.l.length === l.length ? this.morph : null;
    const lerp = (a: number[] | undefined, b: number[]) => (m && a ? b.map((y, i) => (Number.isFinite(a[i]) && Number.isFinite(y) ? a[i] + (y - a[i]) * m.t : y)) : b);
    const A = css('--graph-a'), B = css('--graph-b');
    if (single !== 'r') this.curve(lerp(m?.l, l), N, Y, A);
    if (single !== 'l') this.curve(lerp(m?.r, r), N, Y, single ? A : B);
    if (m && m.t < 1) return;
    if (single) roots.length = 0;
    const pts = roots.map(x0 => ({ x: x0, y: evaluate(eq.lhs, { [v]: x0 }) })).filter(p => Number.isFinite(p.y));
    // one curve: its points of interest in grey, like Desmos (zeros, the y-intercept, peaks and dips)
    if (single) pts.push(...interesting((x: number) => evaluate(single === 'l' ? eq.lhs : eq.rhs, { [v]: x }), xs, single === 'l' ? l : r));
    for (const p of pts) this.dot(X(p.x), Y(p.y), single ? css('--faint') : css('--ink'));
    // hover: a point near the cursor, else trace the nearest curve
    const ms = this.mouse;
    if (!ms || this.drag?.moved) return;
    const near = pts.find(p => Math.hypot(X(p.x) - ms.x, Y(p.y) - ms.y) < 12);
    if (near) return this.label(X(near.x), Y(near.y), `(${fmt(near.x)}, ${fmt(near.y)})`);
    const x = ux(ms.x);
    const cand = [{ y: evaluate(eq.lhs, { [v]: x }), col: A }, { y: evaluate(eq.rhs, { [v]: x }), col: B }]
      .filter(o => Number.isFinite(o.y))
      .map(o => ({ ...o, d: Math.abs(Y(o.y) - ms.y) }))
      .sort((a, b) => a.d - b.d)[0];
    if (cand && cand.d < 24) {
      this.dot(X(x), Y(cand.y), cand.col, true);
      this.label(X(x), Y(cand.y), `(${fmt(x)}, ${fmt(cand.y)})`);
    }
    void c;
  }

  /** ∫ₐᵇ f dx: f with the area shaded. lim x→a f: f, and a ring where it heads. */
  private renderPicture(p: Int | Lim, X: (x: number) => number, Y: (y: number) => number, ux: (p: number) => number, uy: (p: number) => number) {
    const { W } = this, c = this.ctx;
    this.grid(X, Y, ux, uy, p.v, '');
    const N = Math.ceil(W / 1.5);
    const xs = Array.from({ length: N + 1 }, (_, i) => ux((i / N) * W));
    const f = (x: number) => evaluate(p.arg, { [p.v]: x });
    const ys = xs.map(f);
    const A = css('--graph-a');
    const value = evaluate(p, {});
    if (p.k === 'int') {
      const a = evaluate(p.lo!, {}), b = evaluate(p.hi!, {});
      const lo = Math.max(Math.min(a, b), ux(0)), hi = Math.min(Math.max(a, b), ux(W));
      if (hi > lo) {
        c.fillStyle = A; c.globalAlpha = 0.18 * this.fade;
        c.beginPath(); c.moveTo(X(lo), Y(0));
        const n = Math.max(2, Math.ceil((X(hi) - X(lo)) / 2));
        for (let i = 0; i <= n; i++) { const x = lo + (hi - lo) * i / n, y = f(x); c.lineTo(X(x), Number.isFinite(y) ? Y(y) : Y(0)); }
        c.lineTo(X(hi), Y(0)); c.closePath(); c.fill();
        c.globalAlpha = this.fade;
      }
      this.curve(ys, N, Y, A);
      this.note.innerHTML = `The shaded area under <b>y = ${escapeText(p.arg)}</b> from ${fmt(a)} to ${fmt(b)}${Number.isFinite(value) ? `: <b>${exact(value) ? '=' : '≈'} ${fmt(value)}</b>` : ''}. Area below the axis counts as negative.`;
    } else {
      this.curve(ys, N, Y, A);
      const to = evaluate(p.to, {});
      if (Number.isFinite(to) && Number.isFinite(value)) this.dot(X(to), Y(value), A, true);
      if (!Number.isFinite(to) && Number.isFinite(value)) {
        c.strokeStyle = A; c.setLineDash([6, 5]); c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(0, Y(value)); c.lineTo(W, Y(value)); c.stroke(); c.setLineDash([]);
      }
      this.note.innerHTML = Number.isFinite(value)
        ? `As ${p.v} → ${Number.isFinite(to) ? fmt(to) : to > 0 ? '∞' : '−∞'}, <b>y = ${escapeText(p.arg)}</b> heads for <b>${fmt(value)}</b>${Number.isFinite(to) ? ' (the ring), whether or not it gets there' : ' (the dashed line)'}.`
        : `As ${p.v} → ${Number.isFinite(to) ? fmt(to) : '∞'}, the curve doesn't settle on one value.`;
    }
    const ms = this.mouse;
    if (ms && !this.drag?.moved) {
      const x = ux(ms.x), y = f(x);
      if (Number.isFinite(y) && Math.abs(Y(y) - ms.y) < 24) { this.dot(X(x), Y(y), A, true); this.label(X(x), Y(y), `(${fmt(x)}, ${fmt(y)})`); }
    }
  }

  /** y′ = f(x, y): a dash of slope f at each grid point; hover draws the solution through it */
  private renderSlopes(eq: Eq, o: { x: string; y: string; p: string }) {
    const { W, H } = this, c = this.ctx;
    const s = this.scale();
    const X = (x: number) => W / 2 + (x - this.view.cx) * s, Y = (y: number) => H / 2 - (y - this.view.cy) * s;
    const ux = (px: number) => this.toUnits(px, 0)[0], uy = (py: number) => this.toUnits(0, py)[1];
    this.grid(X, Y, ux, uy, o.x, o.y);
    // y′ from the equation as typed: it is linear in y′, so two looks give it
    const F = (x: number, y: number, p: number) => evaluate(eq, { [o.x]: x, [o.y]: y, [o.p]: p });
    const slope = (x: number, y: number) => {
      const f0 = F(x, y, 0), f1 = F(x, y, 1);
      const p = -f0 / (f1 - f0);
      return Number.isFinite(p) && Math.abs(F(x, y, 2) - (2 * f1 - f0)) < 1e-6 * (1 + Math.abs(f0) + Math.abs(f1)) ? p : NaN;
    };
    c.globalAlpha = this.fade;
    c.strokeStyle = css('--muted'); c.lineWidth = 1.4; c.lineCap = 'round';
    c.beginPath();
    const gap = 26, len = 8;
    for (let py = gap / 2; py < H; py += gap) for (let px = gap / 2; px < W; px += gap) {
      const m = slope(ux(px), uy(py));
      if (!Number.isFinite(m)) continue;
      const a = Math.atan(m), dx = Math.cos(a) * len, dy = -Math.sin(a) * len;
      c.moveTo(px - dx, py - dy); c.lineTo(px + dx, py + dy);
    }
    c.globalAlpha = 0.55 * this.fade; c.stroke(); c.globalAlpha = this.fade;
    this.note.innerHTML = `The slope field of the equation: each dash has the slope ${o.p} has there. Hover to draw the solution through a point; solving (e) gives all of them.`;
    const ms = this.mouse;
    if (!ms || this.drag?.moved) return;
    // the solution through the cursor, both ways, by Runge-Kutta
    const h = (2 * this.view.span) / 300;
    const A = css('--graph-a');
    c.strokeStyle = A; c.lineWidth = 2.5; c.lineJoin = 'round';
    for (const dir of [1, -1]) {
      let x = ux(ms.x), y = uy(ms.y);
      c.beginPath(); c.moveTo(X(x), Y(y));
      for (let i = 0; i < 400; i++) {
        const k1 = slope(x, y), k2 = slope(x + dir * h / 2, y + dir * h / 2 * k1), k3 = slope(x + dir * h / 2, y + dir * h / 2 * k2), k4 = slope(x + dir * h, y + dir * h * k3);
        const dy = dir * h * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
        if (!Number.isFinite(dy)) break;
        x += dir * h; y += dy;
        if (Math.abs(Y(y)) > 3 * H || X(x) < -10 || X(x) > W + 10) break;
        c.lineTo(X(x), Y(y));
      }
      c.stroke();
    }
    this.dot(ms.x, ms.y, A, true);
  }

  private render2(eq: Eq, vars: string[], X: (x: number) => number, Y: (y: number) => number, ux: (p: number) => number, uy: (p: number) => number, family: Eq | null = null) {
    const hx = vars.includes('x') ? 'x' : vars[0];
    const vy = vars.includes('y') && hx !== 'y' ? 'y' : vars.find(n => n !== hx)!;
    this.grid(X, Y, ux, uy, hx, vy);
    // a general solution: one faint curve for each C, the bold one is C = 1
    if (family) {
      for (const k of [-2, -1, 0, 2, 3]) this.implicit(withConst(family, k), hx, vy, ux, uy, css('--graph-a'), 0.3);
      this.implicit(eq, hx, vy, ux, uy, css('--graph-a'), 1);
      this.note.innerHTML = 'A whole family: one curve for each value of the constant. The bold one is C = 1; the faint ones C = −2, −1, 0, 2, 3.';
      return;
    }
    const extra = this.others.filter(o => symbols(o).every(v => v === hx || v === vy) && symbols(o).length > 0);
    for (const o of extra) this.implicit(o, hx, vy, ux, uy, css('--graph-b'), 0.75);
    if (isIneq(eq)) {
      // shade the region where it holds; a strict inequality gets a dashed boundary
      const c = this.ctx, cell = 4;
      c.fillStyle = css('--graph-a'); c.globalAlpha = 0.13 * this.fade;
      for (let py = 0; py < this.H; py += cell) for (let px = 0; px < this.W; px += cell) {
        if (holds(eq, { [hx]: ux(px + cell / 2), [vy]: uy(py + cell / 2) })) c.fillRect(px, py, cell, cell);
      }
      c.globalAlpha = this.fade;
    }
    this.implicit(eq, hx, vy, ux, uy, css('--graph-a'), 1, relOf(eq) === '<' || relOf(eq) === '>');
    this.note.innerHTML = isIneq(eq) ? 'Shaded: every point where it holds. A dashed edge is not included.' : extra.length
      ? `Your equation is the bold curve. Where it crosses the others, all of them hold at once.`
      : `Every point on the curve solves the equation. It stays the same curve at every step.`;
    const ms = this.mouse;
    if (ms && !this.drag?.moved) {
      const [x, y] = [ux(ms.x), uy(ms.y)];
      this.label(ms.x, ms.y, `(${fmt(x)}, ${fmt(y)})`, true);
    }
    void X; void Y;
  }

  // ---------- 3D ----------

  private render3d(eq: Eq, vars: string[]) {
    const { W, H } = this, c = this.ctx;
    const vz = vars.includes('z') ? 'z' : vars[2];
    const [vx, vy] = vars.filter(v => v !== vz);
    const R = this.r3;
    const key = `${JSON.stringify(eq)}|${R}`;
    if (!this.mesh || this.mesh.key !== key) this.mesh = { quads: surface(eq, vx, vy, vz, R), key, vars: [vx, vy, vz] };
    const { quads } = this.mesh;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const S = Math.min(W, H) * 0.3 / R;
    // world (x, y, z-up) -> camera: yaw about z, then pitch about the screen's x axis
    const proj = (p: [number, number, number]) => {
      const x1 = p[0] * cy - p[1] * sy, y1 = p[0] * sy + p[1] * cy;
      const depth = y1 * cp - p[2] * sp, up = p[2] * cp + y1 * sp;
      const k = 1 / (1 + depth / (R * 7)); // gentle perspective
      return { x: W / 2 + x1 * S * k, y: H / 2 + 10 - up * S * k, d: depth };
    };
    c.globalAlpha = this.fade;
    // back half of the box first, then surface, then the front edges
    const box: [number, number, number][] = [];
    for (const a of [-R, R]) for (const b of [-R, R]) for (const d of [-R, R]) box.push([a, b, d]);
    const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const bp = box.map(proj);
    const drawEdges = (front: boolean) => {
      c.strokeStyle = css('--axis'); c.lineWidth = 1; c.globalAlpha = this.fade * (front ? 0.3 : 0.8);
      c.beginPath();
      for (const [i, j] of edges) {
        if ((bp[i].d + bp[j].d < 0) !== front) continue;
        c.moveTo(bp[i].x, bp[i].y); c.lineTo(bp[j].x, bp[j].y);
      }
      c.stroke(); c.globalAlpha = this.fade;
    };
    drawEdges(false);
    // floor grid
    c.strokeStyle = css('--grid'); c.beginPath();
    const step = niceStep(R / 2.5);
    for (let g = Math.ceil(-R / step) * step; g <= R + 1e-9; g += step) {
      let a = proj([g, -R, -R]), b = proj([g, R, -R]); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
      a = proj([-R, g, -R]); b = proj([R, g, -R]); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
    }
    c.stroke();
    // axes through the origin
    c.strokeStyle = css('--axis'); c.lineWidth = 1.25; c.beginPath();
    const ax: [[number, number, number], [number, number, number], string][] = [[[-R, 0, 0], [R, 0, 0], vx], [[0, -R, 0], [0, R, 0], vy], [[0, 0, -R], [0, 0, R], vz]];
    for (const [a, b] of ax) { const p = proj(a), q = proj(b); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); }
    c.stroke();
    // surface, far to near
    const A = hexRgb(css('--graph-a')), Bc = hexRgb(css('--graph-b'));
    const L = norm([0.4, -0.5, 0.9]);
    // grid lines on the surface (constant x and constant y), computed per triangle so they hide correctly
    const gs = niceStep(R / 4);
    const faces = quads.map(q => {
      const ps = q.p.map(proj);
      const d = ps.reduce((s, p) => s + p.d, 0) / ps.length;
      const n = norm(q.n);
      const lit = 0.55 + 0.45 * Math.abs(dot(n, L));
      const h = (q.p.reduce((s, p) => s + p[2], 0) / q.p.length + R) / (2 * R);
      const segs: { x: number; y: number }[][] = [];
      for (const ax of [0, 1]) {
        const vs = q.p.map(p => p[ax]);
        for (let lv = Math.ceil(Math.min(...vs) / gs) * gs; lv <= Math.max(...vs); lv += gs) {
          const hits: [number, number, number][] = [];
          for (let a = 0; a < 3; a++) {
            const P = q.p[a], Q = q.p[(a + 1) % 3];
            if ((P[ax] - lv) * (Q[ax] - lv) < 0) { const u = (lv - P[ax]) / (Q[ax] - P[ax]); hits.push([P[0] + (Q[0] - P[0]) * u, P[1] + (Q[1] - P[1]) * u, P[2] + (Q[2] - P[2]) * u]); }
          }
          if (hits.length === 2) segs.push(hits.map(proj));
        }
      }
      return { ps, d, lit, h, segs };
    }).sort((a, b) => b.d - a.d);
    c.lineWidth = 0.75;
    for (const f of faces) {
      const col = mix(mix(A, Bc, clamp(f.h, 0, 1) * 0.6), [255, 255, 255], 0.3).map(v => Math.round(v * f.lit));
      c.fillStyle = `rgb(${col.join(',')})`;
      c.beginPath(); c.moveTo(f.ps[0].x, f.ps[0].y);
      for (let i = 1; i < f.ps.length; i++) c.lineTo(f.ps[i].x, f.ps[i].y);
      c.closePath(); c.fill();
      if (f.segs.length) {
        c.strokeStyle = `rgba(${col.map(v => Math.round(v * 0.62)).join(',')},0.55)`;
        c.beginPath();
        for (const [a, b] of f.segs) { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
        c.stroke();
      }
    }
    drawEdges(true);
    c.font = `italic 14px ${css('--math-font')}`; c.fillStyle = css('--ink'); c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const [, b, name] of ax) { const q = proj(b.map(v => v * 1.12) as [number, number, number]); c.fillText(name, q.x, q.y); }
    c.font = `11px ${css('--ui-font')}`; c.fillStyle = css('--muted');
    c.fillText(`${fmt(-R)} to ${fmt(R)}`, W - 52, H - 14);
    c.globalAlpha = 1;
    this.note.innerHTML = quads.length
      ? `Every point on the surface solves the equation. Drag to turn it, scroll to zoom.`
      : `No part of the surface is in view. Scroll out to look further.`;
  }

  // ---------- 2D pieces ----------

  private grid(X: (x: number) => number, Y: (y: number) => number, ux: (p: number) => number, uy: (p: number) => number, xl: string, yl: string) {
    const { W, H } = this, c = this.ctx;
    const step = niceStep(this.view.span / 5);
    const minor = step / (String(step / Math.pow(10, Math.floor(Math.log10(step)))).startsWith('2') ? 4 : 5);
    const lines = (st: number) => {
      c.beginPath();
      for (let x = Math.ceil(ux(0) / st) * st; x <= ux(W); x += st) { c.moveTo(Math.round(X(x)) + 0.5, 0); c.lineTo(Math.round(X(x)) + 0.5, H); }
      for (let y = Math.ceil(uy(H) / st) * st; y <= uy(0); y += st) { c.moveTo(0, Math.round(Y(y)) + 0.5); c.lineTo(W, Math.round(Y(y)) + 0.5); }
      c.stroke();
    };
    c.lineWidth = 1;
    c.strokeStyle = css('--grid'); c.globalAlpha = 0.55; lines(minor);
    c.globalAlpha = 1; lines(step);
    c.strokeStyle = css('--axis'); c.lineWidth = 1.25;
    c.beginPath();
    c.moveTo(Math.round(X(0)) + 0.5, 0); c.lineTo(Math.round(X(0)) + 0.5, H);
    c.moveTo(0, Math.round(Y(0)) + 0.5); c.lineTo(W, Math.round(Y(0)) + 0.5);
    c.stroke();
    // labels with a halo, pinned to the edge when the axis is off screen
    c.font = `11px ${css('--ui-font')}`;
    c.lineWidth = 3; c.strokeStyle = css('--desk'); c.fillStyle = css('--muted');
    const halo = (t: string, x: number, y: number) => { c.strokeText(t, x, y); c.fillText(t, x, y); };
    c.textAlign = 'center'; c.textBaseline = 'top';
    const ly = Math.min(H - 16, Math.max(4, Y(0) + 4));
    for (let x = Math.ceil(ux(0) / step) * step; x <= ux(W); x += step) if (Math.abs(x) > step / 1e6 && X(x) > 14 && X(x) < W - 14) halo(fmt(x), X(x), ly);
    c.textAlign = 'right'; c.textBaseline = 'middle';
    const lx = Math.min(W - 6, Math.max(30, X(0) - 5));
    for (let y = Math.ceil(uy(H) / step) * step; y <= uy(0); y += step) if (Math.abs(y) > step / 1e6 && Y(y) > 10 && Y(y) < H - 10) halo(fmt(y), lx, Y(y));
    c.font = `italic 13px ${css('--math-font')}`;
    c.fillStyle = css('--ink');
    c.textAlign = 'right'; c.textBaseline = 'bottom';
    halo(xl, W - 6, Math.min(H - 4, Math.max(16, Y(0) - 4)));
    if (yl) { c.textAlign = 'left'; c.textBaseline = 'top'; halo(yl, Math.min(W - 16, Math.max(4, X(0) + 6)), 6); }
  }

  private curve(ys: number[], N: number, Y: (y: number) => number, color: string) {
    const { W, H } = this, c = this.ctx;
    c.strokeStyle = color; c.lineWidth = 2.5; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath();
    let pen = false;
    ys.forEach((y, i) => {
      const py = Y(y);
      if (!Number.isFinite(py) || py < -H || py > 2 * H) { pen = false; return; }
      const px = (i / N) * W;
      if (pen && Math.abs(py - Y(ys[i - 1])) > H) pen = false;
      pen ? c.lineTo(px, py) : c.moveTo(px, py);
      pen = true;
    });
    c.stroke();
  }

  private dot(x: number, y: number, color: string, hollow = false) {
    const c = this.ctx;
    c.beginPath(); c.arc(x, y, hollow ? 5 : 4.5, 0, Math.PI * 2);
    c.fillStyle = hollow ? css('--desk') : color; c.fill();
    c.strokeStyle = hollow ? color : css('--desk'); c.lineWidth = hollow ? 2.5 : 2; c.stroke();
  }

  private label(x: number, y: number, text: string, faint = false) {
    const { W } = this, c = this.ctx;
    c.font = `500 12px ${css('--ui-font')}`;
    const w = c.measureText(text).width + 14, h = 22;
    let bx = x + 10, by = y - h - 8;
    if (bx + w > W - 4) bx = x - w - 10;
    if (by < 4) by = y + 10;
    c.globalAlpha = faint ? 0.8 : 1;
    c.fillStyle = css('--bg');
    c.strokeStyle = css('--line');
    c.lineWidth = 1;
    c.beginPath(); c.roundRect(bx, by, w, h, 6); c.fill(); c.stroke();
    c.fillStyle = css('--ink'); c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText(text, bx + 7, by + h / 2 + 0.5);
    c.globalAlpha = 1;
  }

  private implicit(eq: Eq, hx: string, vy: string, ux: (p: number) => number, uy: (p: number) => number, color: string, alpha: number, dashed = false) {
    const { W, H } = this, c = this.ctx;
    const n = 150, m = Math.round(n * H / W);
    const F: number[][] = [];
    for (let j = 0; j <= m; j++) {
      F.push([]);
      for (let i = 0; i <= n; i++) F[j].push(evaluate(eq, { [hx]: ux(i / n * W), [vy]: uy(j / m * H) }));
    }
    c.strokeStyle = color; c.lineWidth = alpha < 1 ? 2 : 2.5; c.lineCap = 'round';
    c.globalAlpha = alpha * this.fade;
    c.beginPath();
    const px = (i: number) => i / n * W, py = (j: number) => j / m * H;
    for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) {
      const v = [F[j][i], F[j][i + 1], F[j + 1][i + 1], F[j + 1][i]];
      if (!v.every(Number.isFinite)) continue;
      const pts: [number, number][] = [];
      const edge = (a: number, b: number, x0: number, y0: number, x1: number, y1: number) => {
        if ((a < 0) !== (b < 0)) { const t = a / (a - b); pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); }
      };
      edge(v[0], v[1], px(i), py(j), px(i + 1), py(j));
      edge(v[1], v[2], px(i + 1), py(j), px(i + 1), py(j + 1));
      edge(v[3], v[2], px(i), py(j + 1), px(i + 1), py(j + 1));
      edge(v[0], v[3], px(i), py(j), px(i), py(j + 1));
      if (pts.length < 2) continue;
      if (dashed && (i + j) % 6 < 3) continue;
      // skip poles: a sign change through infinity, not through zero
      const mid = evaluate(eq, { [hx]: ux(px(i + 0.5)), [vy]: uy(py(j + 0.5)) });
      if (Math.abs(mid) > 4 * Math.max(...v.map(Math.abs))) continue;
      c.moveTo(...pts[0]); c.lineTo(...pts[1]);
      if (pts.length === 4) { c.moveTo(...pts[2]); c.lineTo(...pts[3]); }
    }
    c.stroke();
    c.globalAlpha = this.fade;
  }
}

/** The solution surface of a 3-variable equation, by marching tetrahedra: sample the
 *  equation (lhs − rhs) on a 3D grid, split each cube into six tetrahedra, and put a
 *  triangle (or two) wherever the sign changes. Seamless for any implicit surface. */
export function surface(eq: Eq, vx: string, vy: string, vz: string, R: number, n = 30): Quad[] {
  const g = (i: number) => -R + (2 * R * i) / n;
  const N = n + 1;
  const F = new Float64Array(N * N * N);
  const env: Record<string, number> = {};
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
    env[vx] = g(i); env[vy] = g(j); env[vz] = g(k);
    F[(i * N + j) * N + k] = evaluate(eq, env);
  }
  const at = (p: number[]) => { env[vx] = p[0]; env[vy] = p[1]; env[vz] = p[2]; return evaluate(eq, env); };
  const TETS = [[0, 1, 3, 7], [0, 3, 2, 7], [0, 2, 6, 7], [0, 6, 4, 7], [0, 4, 5, 7], [0, 5, 1, 7]];
  const out: Quad[] = [];
  const P: [number, number, number][] = Array.from({ length: 8 }, () => [0, 0, 0]);
  const V = new Array<number>(8);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    let ok = true, neg = 0;
    for (let c = 0; c < 8; c++) {
      const a = i + (c & 1), b = j + ((c >> 1) & 1), d = k + ((c >> 2) & 1);
      const v = F[(a * N + b) * N + d];
      if (!Number.isFinite(v)) { ok = false; break; }
      V[c] = v; if (v < 0) neg++;
      P[c][0] = g(a); P[c][1] = g(b); P[c][2] = g(d);
    }
    if (!ok || neg === 0 || neg === 8) continue;
    const big = Math.max(...V.map(Math.abs));
    for (const t of TETS) {
      const ins = t.filter(c => V[c] < 0), outs = t.filter(c => V[c] >= 0);
      if (!ins.length || !outs.length) continue;
      const cut = (a: number, b: number): [number, number, number] => {
        const u = V[a] / (V[a] - V[b]);
        return [P[a][0] + (P[b][0] - P[a][0]) * u, P[a][1] + (P[b][1] - P[a][1]) * u, P[a][2] + (P[b][2] - P[a][2]) * u];
      };
      const tris: [number, number, number][][] = [];
      if (ins.length === 1 || outs.length === 1) {
        const [lone, rest] = ins.length === 1 ? [ins[0], outs] : [outs[0], ins];
        tris.push(rest.map(r => cut(lone, r)));
      } else {
        const [a, b] = ins, [c, d] = outs;
        const q = [cut(a, c), cut(a, d), cut(b, d), cut(b, c)];
        tris.push([q[0], q[1], q[2]], [q[0], q[2], q[3]]);
      }
      for (const tri of tris) {
        // a sign change through a pole (like 1/x) isn't a surface
        const m = [0, 1, 2].map(ax => (tri[0][ax] + tri[1][ax] + tri[2][ax]) / 3);
        if (Math.abs(at(m)) > 0.5 * big) continue;
        // smooth shading: the normal is the equation's gradient, not the facet's
        const e = (2 * R) / n / 4;
        const grad = [0, 1, 2].map(ax => { const p1 = [...m], p2 = [...m]; p1[ax] += e; p2[ax] -= e; return at(p1) - at(p2); });
        out.push({ p: tri, n: grad.every(Number.isFinite) && grad.some(v => v) ? grad : cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])) });
      }
    }
  }
  return out;
}

function findRoots(f: (i: number) => number, N: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = f(i), b = f(i + 1);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a === 0) { out.push(i); continue; }
    if ((a < 0) !== (b < 0) && Math.abs(a - b) < 1e6) out.push(i + a / (a - b));
  }
  return out;
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / p;
  return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p;
}

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]) => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);
function hexRgb(h: string): number[] {
  const m = h.replace('#', '');
  const v = m.length === 3 ? m.split('').map(x => x + x) : [m.slice(0, 2), m.slice(2, 4), m.slice(4, 6)];
  return v.map(x => parseInt(x, 16));
}

/** a whole number, or a short decimal, that fmt shows exactly */
const exact = (x: number) => Math.abs(x * 1000 - Math.round(x * 1000)) < 1e-9;

const fmt = (x: number) => {
  const a = Math.abs(x);
  const r = a >= 100 ? Math.round(x * 10) / 10 : a >= 1 ? Math.round(x * 1000) / 1000 : Math.round(x * 10000) / 10000;
  return (r < 0 ? '−' : '') + Math.abs(r).toString();
};

/** where one curve is worth a look: zeros, the y-intercept, and peaks and dips (at most a dozen) */
function interesting(f: (x: number) => number, xs: number[], ys: number[]): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const N = xs.length - 1;
  const push = (x: number) => { const y = f(x); if (Number.isFinite(y) && !out.some(p => Math.abs(p.x - x) < (xs[1] - xs[0]) * 3)) out.push({ x: Math.round(x * 1e9) / 1e9, y }); };
  for (const i of findRoots(i => ys[i], N)) {
    let a = xs[Math.floor(i)], b = xs[Math.min(N, Math.ceil(i + 1e-9))];
    if (f(a) === 0) b = a;
    for (let k = 0; k < 60 && b - a > 1e-13; k++) { const m = (a + b) / 2; (f(a) < 0) === (f(m) < 0) ? (a = m) : (b = m); }
    push((a + b) / 2);
  }
  if (xs[0] < 0 && xs[N] > 0) push(0);
  for (let i = 1; i < N; i++) {
    const d0 = ys[i] - ys[i - 1], d1 = ys[i + 1] - ys[i];
    if (!Number.isFinite(d0) || !Number.isFinite(d1) || d0 === 0 || (d0 > 0) === (d1 > 0)) continue;
    // a smooth turn, not a pole or a corner jump: golden-section search on the bracket
    if (Math.abs(d0) + Math.abs(d1) > Math.abs(ys[i]) + 1e3) continue;
    let a = xs[i - 1], b = xs[i + 1];
    const peak = d0 > 0, g = (Math.sqrt(5) - 1) / 2;
    for (let k = 0; k < 50; k++) {
      const m1 = b - g * (b - a), m2 = a + g * (b - a);
      (peak ? f(m1) > f(m2) : f(m1) < f(m2)) ? (b = m2) : (a = m1);
    }
    push((a + b) / 2);
  }
  return out.slice(0, 12);
}

/** an expression as plain text for a note */
function escapeText(n: Node) {
  // every power raised, not just digits: x²eˣ, never x²e^x
  const raise = (t: string): string => t.replace(/\^(?:\(((?:[^()]|\([^()]*\))*)\)|(−?\d+(?:\.\d+)?|[a-zA-Zα-ωπ]))/g, (_, g, a) => `<sup>${g ? raise(g) : a}</sup>`);
  return raise(toText(n).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]!)));
}

