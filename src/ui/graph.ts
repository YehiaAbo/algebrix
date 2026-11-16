// Live graph of the current equation. One variable: the two sides as curves, their
// crossing is the solution (it never moves while you work). Two variables: the
// solution curve itself (it never changes at all). Both are visual proof that no
// move broke anything.
import { Eq, Node, evaluate, symbols } from '../engine/ast';

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class Graph {
  private ctx: CanvasRenderingContext2D;
  private prev: { l: number[]; r: number[] } | null = null;
  private raf = 0;
  private eq: Eq | null = null;
  span = 10;

  constructor(private canvas: HTMLCanvasElement, private note: HTMLElement) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.eq && this.draw(this.eq, false)).observe(canvas);
  }

  zoom(f: number) {
    this.span = Math.min(200, Math.max(1, this.span * f));
    if (this.eq) this.draw(this.eq, false);
  }

  draw(eq: Eq, animate: boolean) {
    this.eq = eq;
    cancelAnimationFrame(this.raf);
    const vars = symbols(eq);
    const dpr = window.devicePixelRatio || 1;
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    if (!W || !H) return;
    this.canvas.width = W * dpr; this.canvas.height = H * dpr;
    const c = this.ctx;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sx = W / (2 * this.span), sy = sx;
    const X = (x: number) => W / 2 + x * sx, Y = (y: number) => H / 2 - y * sy;
    const ux = (px: number) => (px - W / 2) / sx, uy = (py: number) => (H / 2 - py) / sy;

    if (vars.length === 0 || vars.length > 2) {
      this.prev = null;
      this.grid(W, H, X, Y, ux, uy, 'x', 'y');
      this.note.textContent = vars.length === 0 ? 'No variables to graph.' : `${vars.length} variables. The graph needs two or fewer.`;
      return;
    }
    if (vars.length === 1) {
      const v = vars[0];
      const N = Math.ceil(W / 2);
      const sample = (n: Node) => Array.from({ length: N + 1 }, (_, i) => evaluate(n, { [v]: ux((i / N) * W) }));
      const l = sample(eq.lhs), r = sample(eq.rhs);
      const roots = findRoots(i => l[i] - r[i], N).map(i => ux((i / N) * W));
      this.note.innerHTML = roots.length
        ? `Sides cross at <b>${v} ≈ ${roots.slice(0, 3).map(fmt).join(', ')}</b>${roots.length > 3 ? '…' : ''}. That point never moves.`
        : 'The two sides never cross in view.';
      const from = animate && this.prev && this.prev.l.length === l.length ? this.prev : null;
      this.prev = { l, r };
      const frame = (t: number) => {
        c.clearRect(0, 0, W, H);
        this.grid(W, H, X, Y, ux, uy, v, '');
        const lerp = (a: number[], b: number[]) => (from ? b.map((y, i) => (Number.isFinite(a[i]) ? a[i] + (y - a[i]) * t : y)) : b);
        this.curve(lerp(from?.l ?? l, l), N, W, Y, css('--graph-a'), H);
        this.curve(lerp(from?.r ?? r, r), N, W, Y, css('--graph-b'), H);
        if (t === 1) for (const x0 of roots) this.dot(X(x0), Y(evaluate(eq.lhs, { [v]: x0 })));
      };
      if (!from) return frame(1);
      const t0 = performance.now();
      const tick = () => {
        const t = Math.min(1, (performance.now() - t0) / 280);
        frame(1 - Math.pow(1 - t, 3));
        if (t < 1) this.raf = requestAnimationFrame(tick);
      };
      tick();
      return;
    }
    this.prev = null;
    const hx = vars.includes('x') ? 'x' : vars[0];
    const vy = vars.includes('y') && hx !== 'y' ? 'y' : vars.find(n => n !== hx)!;
    c.clearRect(0, 0, W, H);
    this.grid(W, H, X, Y, ux, uy, hx, vy);
    this.implicit(eq, hx, vy, W, H, ux, uy);
    this.note.innerHTML = `Every point on the curve solves the equation. It stays the same curve at every step.`;
  }

  private grid(W: number, H: number, X: (x: number) => number, Y: (y: number) => number, ux: (p: number) => number, uy: (p: number) => number, xl: string, yl: string) {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    const step = niceStep(this.span / 5);
    c.lineWidth = 1;
    c.strokeStyle = css('--grid');
    c.beginPath();
    for (let x = Math.ceil(ux(0) / step) * step; x <= ux(W); x += step) { c.moveTo(Math.round(X(x)) + 0.5, 0); c.lineTo(Math.round(X(x)) + 0.5, H); }
    for (let y = Math.ceil(uy(H) / step) * step; y <= uy(0); y += step) { c.moveTo(0, Math.round(Y(y)) + 0.5); c.lineTo(W, Math.round(Y(y)) + 0.5); }
    c.stroke();
    c.strokeStyle = css('--axis');
    c.beginPath();
    c.moveTo(Math.round(X(0)) + 0.5, 0); c.lineTo(Math.round(X(0)) + 0.5, H);
    c.moveTo(0, Math.round(Y(0)) + 0.5); c.lineTo(W, Math.round(Y(0)) + 0.5);
    c.stroke();
    c.fillStyle = css('--muted');
    c.font = `11px ${css('--ui-font')}`;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let x = Math.ceil(ux(0) / step) * step; x <= ux(W); x += step) if (Math.abs(x) > 1e-9 && X(x) > 14 && X(x) < W - 14) c.fillText(fmt(x), X(x), Math.min(H - 14, Math.max(4, Y(0) + 4)));
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let y = Math.ceil(uy(H) / step) * step; y <= uy(0); y += step) if (Math.abs(y) > 1e-9 && Y(y) > 10 && Y(y) < H - 10) c.fillText(fmt(y), Math.max(24, X(0) - 5), Y(y));
    c.font = `italic 13px ${css('--math-font')}`;
    c.fillStyle = css('--ink');
    c.textAlign = 'right'; c.textBaseline = 'bottom';
    c.fillText(xl, W - 6, Y(0) - 4);
    if (yl) { c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(yl, X(0) + 6, 6); }
  }

  private curve(ys: number[], N: number, W: number, Y: (y: number) => number, color: string, H: number) {
    const c = this.ctx;
    c.strokeStyle = color; c.lineWidth = 2.25; c.lineJoin = 'round';
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

  private dot(x: number, y: number) {
    const c = this.ctx;
    c.fillStyle = css('--ink');
    c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = css('--bg'); c.lineWidth = 2; c.stroke();
  }

  private implicit(eq: Eq, hx: string, vy: string, W: number, H: number, ux: (p: number) => number, uy: (p: number) => number) {
    const c = this.ctx;
    const n = 140, m = Math.round(n * H / W);
    const F: number[][] = [];
    for (let j = 0; j <= m; j++) {
      F.push([]);
      for (let i = 0; i <= n; i++) F[j].push(evaluate(eq, { [hx]: ux(i / n * W), [vy]: uy(j / m * H) }));
    }
    c.strokeStyle = css('--graph-a'); c.lineWidth = 2.25; c.lineCap = 'round';
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
      // skip poles: a sign change through infinity, not through zero
      const mid = evaluate(eq, { [hx]: ux(px(i + 0.5)), [vy]: uy(py(j + 0.5)) });
      if (Math.abs(mid) > 4 * Math.max(...v.map(Math.abs))) continue;
      c.moveTo(...pts[0]); c.lineTo(...pts[1]);
      if (pts.length === 4) { c.moveTo(...pts[2]); c.lineTo(...pts[3]); }
    }
    c.stroke();
  }
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

const fmt = (x: number) => {
  const r = Math.round(x * 1000) / 1000;
  return (r < 0 ? '−' : '') + Math.abs(r).toString();
};
