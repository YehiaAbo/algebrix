// Drawing the work tree: a strip across the top of the board (every equation's current step on one
// line, the middle of long lines folded) and a big view you can pan and zoom. Steps glide to their
// new places; a new step is born from its arrow (the arrow draws, then the step unfurls from its tip).
import { layout as mathLayout } from '../render/layout';
import { Stage } from '../render/stage';
import { Arrow, Edge, Item, Layout, LayoutOpts, layoutTree, TNode, Tree } from './tree';
import { ms } from './prefs';

export interface HeadInfo { tag: { text: string; cls: string } | null; offer: string; linked: boolean; focus: boolean }
export interface TreeViewOpts {
  size: number;
  strip: boolean;
  /** a step was clicked: go there */
  pick: (col: number, id: string | null) => void;
  /** the background (or a fold) was clicked */
  open?: (col?: number, id?: string) => void;
}

const SVGNS = 'http://www.w3.org/2000/svg';
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
let viewN = 0;

interface Pos { x: number; y: number }
interface Shown { el: HTMLElement; x: number; y: number; w: number; h: number; born: number | null; gone: number | null }

export class TreeView {
  world: HTMLElement;
  svg: SVGSVGElement;
  layer: HTMLElement;
  headsEl: HTMLElement;
  /** a step's drawing never changes, so each is drawn once */
  private minis = new Map<string, { el: HTMLElement; w: number; h: number }>();
  private shown = new Map<string, Shown>();
  private paths = new Map<string, { p: SVGPathElement; t: SVGTextElement | null }>();
  lay: Layout | null = null;
  private cam = { x: 0, y: 0, z: 1 };
  private camFrom = { x: 0, y: 0, z: 1 };
  private camTo = { x: 0, y: 0, z: 1 };
  private t0 = 0;
  private raf = 0;
  private marker: string;
  private trees: Tree[] = [];

  constructor(public host: HTMLElement, public o: TreeViewOpts) {
    this.marker = `tree-ah-${viewN++}`;
    this.world = document.createElement('div');
    this.world.className = 'tree-world';
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.classList.add('tree-svg');
    this.svg.innerHTML = `<defs><marker id="${this.marker}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1.2 7 4 1 6.8" fill="none" stroke="context-stroke" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`;
    this.layer = document.createElement('div');
    this.layer.className = 'tree-layer';
    this.world.append(this.svg, this.layer);
    this.headsEl = document.createElement('div');
    this.headsEl.className = 'tree-heads';
    host.append(this.world);
    // the strip keeps the numbers in a row along its top; the big view puts each over its equation
    (o.strip ? host : this.world).append(this.headsEl);
  }

  /** the drawing of one step, made once */
  private mini(uid: string, n: TNode) {
    const k = `${uid}:${n.id}`;
    let m = this.minis.get(k);
    if (m) return m;
    let lay = mathLayout(n.eq, this.o.size);
    const max = this.o.strip ? 260 : 420;
    if (lay.w > max) lay = mathLayout(n.eq, Math.max(9, this.o.size * max / lay.w));
    const el = document.createElement('div');
    el.className = 'mini';
    el.style.width = `${lay.w}px`;
    el.style.height = `${lay.asc + lay.desc}px`;
    new Stage(el).show(lay, 0, 0, null);
    m = { el, w: lay.w, h: lay.asc + lay.desc };
    this.minis.set(k, m);
    return m;
  }

  /** forget drawings of equations that are gone (a new workspace) */
  reset() {
    this.minis.clear();
    for (const s of this.shown.values()) s.el.remove();
    this.shown.clear();
    for (const p of this.paths.values()) { p.p.remove(); p.t?.remove(); }
    this.paths.clear();
    this.lay = null;
  }

  render(trees: Tree[], heads: HeadInfo[], focus: number, animate: boolean) {
    this.trees = trees;
    const W = this.host.clientWidth, H = this.host.clientHeight;
    const strip = this.o.strip;
    const opts: LayoutOpts = strip
      ? { fold: true, rowGap: 22, colGap: 64, laneGap: 30, strip: { height: H, top: 34, bottom: 10, focus } }
      : { fold: false, rowGap: 30, colGap: 90, laneGap: 40 };
    const L = layoutTree(trees, (c, n) => this.mini(trees[c].uid, n), opts);
    this.lay = L;
    const now = performance.now();
    const fresh = !this.shown.size || !animate;
    // steps
    const keep = new Set<string>();
    for (const it of L.items) {
      keep.add(it.key);
      let s = this.shown.get(it.key);
      if (!s) {
        const el = document.createElement('div');
        el.className = 'titem';
        el.dataset.key = it.key;
        el.dataset.col = String(it.col);
        if (it.id) { el.append(this.mini(trees[it.col].uid, trees[it.col].nodes.get(it.id)!).el); el.dataset.id = it.id; }
        else el.innerHTML = `<span class="tfold">⋮ ${it.ids.length} steps</span>`;
        el.addEventListener('click', e => {
          e.stopPropagation();
          if (it.id) this.o.pick(Number(el.dataset.col), el.dataset.id!);
          else this.o.open?.(Number(el.dataset.col), it.ids[0]);
        });
        this.layer.append(el);
        // a new step is born where it belongs, out of the tip of its arrow
        s = { el, x: it.x, y: it.y, w: it.w, h: it.h, born: fresh ? null : now, gone: null };
        this.shown.set(it.key, s);
      }
      s.gone = null;
      s.el.dataset.col = String(it.col);
      s.el.classList.toggle('now', it.now);
      s.el.classList.toggle('here', it.now && it.col === focus);
      s.el.classList.toggle('live', it.live);
      s.el.classList.toggle('off', !it.live);
      s.el.classList.toggle('fold', !it.id);
      s.el.title = it.id ? `${it.label ? it.label + ' · ' : ''}click to go to this step` : `${it.ids.length} steps: click to see them all`;
      s.el.style.width = `${it.w}px`;
      s.el.style.height = `${it.h}px`;
    }
    for (const [k, s] of this.shown) if (!keep.has(k) && s.gone === null) s.gone = now;
    // the camera
    const pad = 28;
    if (strip) {
      const f = L.heads[focus];
      let x = (W - L.width) / 2;
      if (L.width > W - 2 * pad && f) x = Math.min(pad, Math.max(W - pad - L.width, W / 2 - f.x));
      this.camTo = { x, y: 0, z: 1 };
    }
    this.camFrom = { ...this.cam };
    if (fresh && strip) this.cam = { ...this.camTo };
    this.renderHeads(heads, L);
    this.t0 = now;
    this.from = new Map([...this.shown].map(([k, s]) => [k, { x: s.x, y: s.y }]));
    cancelAnimationFrame(this.raf);
    this.frame(now);
  }

  private from = new Map<string, Pos>();

  private renderHeads(heads: HeadInfo[], L: Layout) {
    this.headsEl.innerHTML = L.heads.map((h, c) => {
      const hi = heads[c];
      return `<button class="thead${hi?.focus ? ' on' : ''}${hi?.linked ? ' linked' : ''}" data-col="${c}" title="Equation ${c + 1}: press ${c + 1} to work on it"><kbd>${c + 1}</kbd>${hi?.tag ? `<span class="ttag ${hi.tag.cls}">${hi.tag.text}</span>` : ''}${hi?.offer ? `<span class="toffer">${hi.offer}</span>` : ''}</button>`;
    }).join('');
    this.headsEl.querySelectorAll<HTMLElement>('.thead').forEach(b => {
      const h = L.heads[Number(b.dataset.col)];
      b.style.left = `${h.x}px`;
      if (!this.o.strip) b.style.top = `${h.y - 30}px`;
      b.addEventListener('click', e => { e.stopPropagation(); this.o.pick(Number(b.dataset.col), null); });
    });
  }

  /** move the big view's camera (pan and zoom); no tween */
  setCam(x: number, y: number, z: number) {
    this.cam = { x, y, z }; this.camTo = { x, y, z };
    this.place(1);
  }
  get camera() { return { ...this.cam }; }

  private frame = (now: number) => {
    const D = ms(420), B = ms(560);
    const t = Math.min(1, (now - this.t0) / D);
    this.place(ease(t), now);
    let busy = t < 1;
    for (const s of this.shown.values()) if ((s.born !== null && now - s.born < B) || s.gone !== null) busy = true;
    if (busy) this.raf = requestAnimationFrame(this.frame);
  };

  /** draw everything at progress p of the glide; births and removals run on their own clocks */
  private place(p: number, now = performance.now()) {
    const L = this.lay;
    if (!L) return;
    const B = ms(560);
    if (this.o.strip) {
      this.cam.x = this.camFrom.x + (this.camTo.x - this.camFrom.x) * p;
      this.cam.y = 0; this.cam.z = 1;
    }
    this.world.style.transform = `translate(${this.cam.x}px, ${this.cam.y}px) scale(${this.cam.z})`;
    if (this.o.strip) this.headsEl.style.transform = `translateX(${this.cam.x}px)`;
    const target = new Map(L.items.map(i => [i.key, i]));
    const pos = new Map<string, Pos & { w: number; h: number; draw: number }>();
    for (const [k, s] of this.shown) {
      const it = target.get(k);
      if (!it) {
        // gone: fade where it stands
        const g = Math.min(1, (now - (s.gone ?? now)) / ms(220));
        s.el.style.opacity = String(1 - g);
        if (g >= 1) { s.el.remove(); this.shown.delete(k); }
        continue;
      }
      const f = this.from.get(k) ?? { x: it.x, y: it.y };
      s.x = f.x + (it.x - f.x) * p;
      s.y = f.y + (it.y - f.y) * p;
      s.w = it.w; s.h = it.h;
      // born: the arrow draws first (first 45%), then the step unfurls from its tip
      const b = s.born === null ? 1 : Math.min(1, (now - s.born) / B);
      const draw = Math.min(1, b / 0.45), open = Math.max(0, Math.min(1, (b - 0.35) / 0.65));
      if (s.born !== null && b >= 1) s.born = null;
      s.el.style.transform = `translate(${s.x - it.w / 2}px, ${s.y - it.h / 2}px)`;
      s.el.style.opacity = open >= 1 ? '' : String(ease(open));
      s.el.style.clipPath = open >= 1 ? '' : `inset(0 0 ${(1 - ease(open)) * 100}% 0 round 6px)`;
      pos.set(k, { x: s.x, y: s.y, w: it.w, h: it.h, draw });
    }
    this.drawLines(L.edges, L.arrows, pos);
  }

  private drawLines(edges: Edge[], arrows: Arrow[], pos: Map<string, Pos & { w: number; h: number; draw: number }>) {
    const keep = new Set<string>();
    const path = (k: string, cls: string, d: string, draw: number, label: string, lx: number, ly: number, anchor: 'start' | 'end') => {
      keep.add(k);
      let e = this.paths.get(k);
      if (!e) {
        const p = document.createElementNS(SVGNS, 'path');
        p.setAttribute('pathLength', '1');
        this.svg.append(p);
        e = { p, t: null };
        this.paths.set(k, e);
      }
      e.p.setAttribute('class', cls);
      e.p.setAttribute('d', d);
      e.p.style.strokeDasharray = draw < 1 ? '1 1' : '';
      e.p.style.strokeDashoffset = draw < 1 ? String(1 - draw) : '';
      e.p.style.opacity = draw <= 0 ? '0' : '';
      // the arrowhead arrives with the tip of the line
      if (draw >= 0.92) e.p.setAttribute('marker-end', `url(#${this.marker})`); else e.p.removeAttribute('marker-end');
      if (label) {
        if (!e.t) { e.t = document.createElementNS(SVGNS, 'text'); this.svg.append(e.t); }
        e.t.textContent = label;
        e.t.setAttribute('x', String(lx));
        e.t.setAttribute('y', String(ly));
        e.t.setAttribute('text-anchor', anchor);
        e.t.setAttribute('class', `tlabel ${cls}`);
        e.t.style.opacity = draw < 1 ? String(Math.max(0, draw * 2 - 1)) : '';
      } else if (e.t) { e.t.remove(); e.t = null; }
    };
    const showLabels = !this.o.strip;
    // which way each step's branches leave it, so the label of the arrow straight down sits on the other side
    const branchSide = new Map<string, number>();
    for (const E of edges) {
      const a = pos.get(E.from), b = pos.get(E.to);
      if (a && b && Math.abs(a.x - b.x) > 0.5) branchSide.set(E.from, Math.sign(b.x - a.x));
    }
    for (const E of edges) {
      const a = pos.get(E.from), b = pos.get(E.to);
      if (!a || !b) continue;
      const text = (E.dir === '⇒' ? '⇒ ' : '') + E.label;
      const lab = text && (showLabels || E.live) ? text : '';
      const y1 = a.y + a.h / 2 + 4, x2 = b.x, y2 = b.y - b.h / 2 - 4;
      let d: string, lx: number, ly: number, anchor: 'start' | 'end';
      if (Math.abs(a.x - x2) < 0.5) {
        // straight down; the label beside it, away from any branch
        d = `M${a.x} ${y1}V${y2}`;
        const side = branchSide.get(E.from) === 1 ? -1 : 1;
        lx = a.x + side * 8; ly = (y1 + y2) / 2 + 4; anchor = side > 0 ? 'start' : 'end';
      } else {
        // a branch leaves from the side of the step it starts at and bends down into its lane
        const dir = Math.sign(x2 - a.x), x1 = a.x + dir * (a.w / 2 + 7), ym = a.y;
        d = `M${x1} ${ym}C${x1 + (x2 - x1) * 0.7} ${ym} ${x2} ${ym + (y2 - ym) * 0.3} ${x2} ${y2}`;
        lx = x2 - dir * 6; ly = y2 - 8; anchor = dir > 0 ? 'end' : 'start';
        if (lab) { lx = x2 + dir * 8; ly = (ym + y2) / 2 + 10; anchor = dir > 0 ? 'start' : 'end'; }
      }
      path(`e:${E.from}>${E.to}`, `tedge${E.live ? ' live' : ''}${E.fold ? ' fold' : ''}`, d, b.draw, lab, lx, ly, anchor);
    }
    for (const A of arrows) {
      const a = pos.get(A.from), b = pos.get(A.to);
      if (!a || !b) continue;
      const dir = b.x >= a.x ? 1 : -1;
      const x1 = a.x + dir * (a.w / 2 + 6), x2 = b.x - dir * (b.w / 2 + 8);
      const dx = Math.max(24, Math.abs(x2 - x1) * 0.45) * dir;
      // a step in the way (an equation between the two): pass under it instead of through it
      const lo = Math.min(x1, x2), hi = Math.max(x1, x2), top = Math.min(a.y, b.y) - 4, bot = Math.max(a.y, b.y) + 4;
      const inWay = [...pos.values()].filter(q => q !== a && q !== b && q.x + q.w / 2 > lo && q.x - q.w / 2 < hi && q.y + q.h / 2 > top && q.y - q.h / 2 < bot);
      if (inWay.length) {
        const yl = Math.max(...inWay.map(q => q.y + q.h / 2)) + 10, r = 10;
        path(`a:${A.from}>${A.to}`, 'tarrow', `M${x1} ${a.y}C${x1 + dir * r} ${a.y} ${x1 + dir * r} ${yl} ${x1 + dir * 2 * r} ${yl}H${x2 - dir * 2 * r}C${x2 - dir * r} ${yl} ${x2 - dir * r} ${b.y} ${x2} ${b.y}`, b.draw, '', 0, 0, 'start');
        continue;
      }
      path(`a:${A.from}>${A.to}`, 'tarrow', `M${x1} ${a.y}C${x1 + dx} ${a.y} ${x2 - dx} ${b.y} ${x2} ${b.y}`, b.draw, '', 0, 0, 'start');
    }
    for (const [k, e] of this.paths) if (!keep.has(k)) { e.p.remove(); e.t?.remove(); this.paths.delete(k); }
  }

  /** where a step is drawn, on screen (for a piece flying out of it) */
  rectOf(col: number, id: string): DOMRect | null {
    const t = this.trees[col];
    const k = t && this.lay?.itemOf.get(`${t.uid}:${id}`);
    const s = k ? this.shown.get(k) : null;
    return s ? s.el.getBoundingClientRect() : null;
  }
  /** the element of a step (the strip's current step of an equation, say) */
  elOf(col: number, id: string): HTMLElement | null {
    const t = this.trees[col];
    const k = t && this.lay?.itemOf.get(`${t.uid}:${id}`);
    return (k && this.shown.get(k)?.el) || null;
  }
  items(): Item[] { return this.lay?.items ?? []; }
}

/** The big view: the whole tree, every step shown, on a canvas you can drag around and zoom
 *  (scroll or pinch). Click a step to go there. Esc (or v) closes it. */
export class TreeBig {
  el: HTMLElement;
  view: TreeView;
  isOpen = false;
  private host: HTMLElement;
  private drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;

  constructor(pick: (col: number, id: string | null) => void) {
    this.el = document.createElement('div');
    this.el.className = 'tree-big';
    this.el.hidden = true;
    this.el.innerHTML = `<div class="tree-big-card" role="dialog" aria-label="Work tree">
      <div class="tree-big-head"><h2>Work tree</h2><span class="tree-big-keys"><span>drag to move</span><span>scroll to zoom</span><span><kbd>0</kbd> fit</span><span><kbd>Esc</kbd> close</span></span><button class="tree-big-close" type="button" title="Close (Esc)">×</button></div>
      <div class="tree-big-canvas"></div></div>`;
    document.body.append(this.el);
    this.host = this.el.querySelector('.tree-big-canvas')!;
    this.view = new TreeView(this.host, { size: 21, strip: false, pick: (c, id) => { this.close(); pick(c, id); } });
    this.el.addEventListener('mousedown', e => { if (e.target === this.el) this.close(); });
    this.el.querySelector('.tree-big-close')!.addEventListener('click', () => this.close());
    this.host.addEventListener('wheel', e => {
      e.preventDefault();
      const r = this.host.getBoundingClientRect();
      this.zoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    this.host.addEventListener('pointerdown', e => {
      if ((e.target as HTMLElement).closest('.titem, .thead')) return;
      const c = this.view.camera;
      this.drag = { x: e.clientX, y: e.clientY, cx: c.x, cy: c.y, moved: false };
      this.host.setPointerCapture(e.pointerId);
      this.host.classList.add('grabbing');
    });
    this.host.addEventListener('pointermove', e => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.drag.moved = true;
      this.view.setCam(this.drag.cx + dx, this.drag.cy + dy, this.view.camera.z);
    });
    const up = () => { this.drag = null; this.host.classList.remove('grabbing'); };
    this.host.addEventListener('pointerup', up);
    this.host.addEventListener('pointercancel', up);
  }

  open(trees: Tree[], heads: HeadInfo[], focus: number, at?: { col: number; id: string }) {
    this.el.hidden = false;
    this.isOpen = true;
    this.view.reset();
    this.view.render(trees, heads, focus, false);
    this.fit();
    // a fold was clicked: start close to it
    if (at) {
      const it = this.view.items().find(i => i.col === at.col && i.id === at.id);
      if (it) this.centre(it.x, it.y);
    }
    this.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms(180), easing: 'ease-out' });
    this.host.animate([{ transform: 'scale(.97)' }, { transform: 'none' }], { duration: ms(260), easing: 'cubic-bezier(.2,.8,.16,1)' });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.hidden = true;
  }

  /** everything in view, never bigger than 1.3× */
  fit() {
    const L = this.view.lay;
    if (!L) return;
    const W = this.host.clientWidth, H = this.host.clientHeight;
    const z = Math.max(0.2, Math.min(1.3, (W - 80) / Math.max(1, L.width), (H - 100) / Math.max(1, L.height)));
    this.view.setCam((W - L.width * z) / 2, Math.max(50, (H - L.height * z) / 2), z);
  }

  centre(x: number, y: number) {
    const z = Math.max(this.view.camera.z, 0.8);
    this.view.setCam(this.host.clientWidth / 2 - x * z, this.host.clientHeight / 2 - y * z, z);
  }

  /** zoom by k around a point of the canvas */
  zoom(k: number, px = this.host.clientWidth / 2, py = this.host.clientHeight / 2) {
    const c = this.view.camera, z = Math.max(0.15, Math.min(4, c.z * k)), f = z / c.z;
    this.view.setCam(px - (px - c.x) * f, py - (py - c.y) * f, z);
  }

  key(e: KeyboardEvent) {
    e.preventDefault();
    const c = this.view.camera, step = 70;
    switch (e.key) {
      case 'Escape': case 'v': return this.close();
      case 'ArrowLeft': return this.view.setCam(c.x + step, c.y, c.z);
      case 'ArrowRight': return this.view.setCam(c.x - step, c.y, c.z);
      case 'ArrowUp': return this.view.setCam(c.x, c.y + step, c.z);
      case 'ArrowDown': return this.view.setCam(c.x, c.y - step, c.z);
      case '+': case '=': case ']': return this.zoom(1.25);
      case '-': case '[': return this.zoom(0.8);
      case '0': return this.fit();
    }
  }
}
