// Draws a layout as absolutely positioned glyphs and animates between layouts.
// Glyphs with the same key move (FLIP from wherever they are right now, so a new
// keypress retargets a running animation instead of waiting for it). Copies start
// at their source; removed glyphs shrink away or fly into whatever absorbed them.
import { Glyph, Layout, Rect, fontMetrics } from './layout';

export interface Transition {
  focus?: string;
  absorbs?: Map<string, string>;
  flights?: { from: string; to: string }[];
  /** undo/redo: no arcs, slightly quicker */
  quick?: boolean;
  /** a move played backwards: new pieces (by node id) come out of the old piece that had swallowed them */
  emerge?: Map<string, string>;
}

interface Entry { el: HTMLElement | SVGSVGElement; g: Glyph }

export const SMOOTH = 'cubic-bezier(.2,.8,.16,1)';
export let EASE = SMOOTH;
/** a look can make glyphs move differently (a pixel look steps like a sprite) */
export const setEase = (e: string) => { EASE = e; };
/** animation length multiplier (flash mode makes it small) */
let pace = 1;
export const setPace = (p: number) => { pace = p; };
const SVGNS = 'http://www.w3.org/2000/svg';

let metrics: { A: number; D: number } | null = null;
export const resetMetrics = () => { metrics = null; };

export class Stage {
  private entries = new Map<string, Entry>();
  private ghosts = new Set<Element>();
  layout: Layout | null = null;
  ox = 0; oy = 0;

  constructor(public root: HTMLElement) {}

  /** rect of a node in stage coordinates */
  box(id: string): Rect | null {
    const r = this.layout?.boxes.get(id);
    return r ? { x: r.x + this.ox, y: r.y + this.oy, w: r.w, h: r.h } : null;
  }

  show(lay: Layout, ox: number, oy: number, tr: Transition | null) {
    metrics ??= fontMetrics();
    const rootRect = this.root.getBoundingClientRect();
    const visual = new Map<string, Rect>();
    if (tr) {
      for (const [k, e] of this.entries) {
        const r = e.el.getBoundingClientRect();
        visual.set(k, { x: r.left - rootRect.left, y: r.top - rootRect.top, w: r.width, h: r.height });
      }
    }
    for (const g of this.ghosts) g.remove();
    this.ghosts.clear();
    const prev = this.entries;
    const prevLayout = this.layout, pox = this.ox, poy = this.oy;
    this.entries = new Map();
    this.layout = lay; this.ox = ox; this.oy = oy;

    const focusOwned = (g: Glyph) => !!tr?.focus && g.owners.includes(tr.focus);
    const dur = Math.round((tr?.quick ? 200 : 260) * pace);

    // Pieces that vanish can be "reused" by new pieces showing the same symbol, so a
    // rewrite like factoring reads as symbols rearranging instead of fading in and out.
    const pool = new Map<string, { key: string; r: Rect }[]>();
    const claimed = new Set<string>();
    if (tr) {
      const next = new Set(lay.glyphs.map(g => g.key));
      for (const [k, e] of prev) {
        if (next.has(k) || !visual.has(k)) continue;
        if (e.g.owners.some(id => tr.absorbs?.has(id))) continue;
        const sg = sig(e.g);
        if (!pool.has(sg)) pool.set(sg, []);
        pool.get(sg)!.push({ key: k, r: visual.get(k)! });
      }
    }
    const reuse = (g: Glyph, target: Rect): Rect | null => {
      const list = pool.get(sig(g));
      if (!list?.length) return null;
      let best = 0, bestD = Infinity;
      list.forEach((c, i) => { const d = Math.hypot(c.r.x - target.x, c.r.y - target.y); if (d < bestD) { bestD = d; best = i; } });
      const [hit] = list.splice(best, 1);
      claimed.add(hit.key);
      return hit.r;
    };

    for (const g0 of lay.glyphs) {
      const g = { ...g0, x: g0.x + ox, y: g0.y + oy, base: g0.base === undefined ? undefined : g0.base + oy };
      const old = prev.get(g.key);
      prev.delete(g.key);
      const oldText = old?.g.text;
      const el = old && old.el.tagName === elTag(g) ? old.el : create(g);
      if (old && old.el !== el) old.el.remove();
      el.getAnimations().forEach(a => a.cancel());
      place(el, g);
      if (!el.isConnected) this.root.appendChild(el);
      this.entries.set(g.key, { el, g });
      if (!tr) continue;

      const target = finalRect(g);
      const from = visual.get(g.key);
      if (from) {
        if (oldText !== undefined && oldText !== g.text) this.crossfade(old!.el as HTMLElement, from, target, dur);
        this.flip(el, from, target, dur, focusOwned(g) && !tr.quick, oldText !== undefined && oldText !== g.text);
      } else {
        const src = g.from ? visual.get(g.from) : null;
        const outOf = !src && tr.emerge ? [...g.owners].reverse().find(id => tr.emerge!.has(id)) : undefined;
        const box = outOf ? prevLayout?.boxes.get(tr.emerge!.get(outOf)!) : undefined;
        const same = src || box ? null : reuse(g, target);
        if (box) {
          // it comes back out of what had swallowed it
          const r = { x: box.x + pox + box.w / 2 - target.w * 0.25, y: box.y + poy + box.h / 2 - target.h * 0.25, w: target.w * 0.5, h: target.h * 0.5 };
          this.flip(el, r, target, dur + 40, false, true);
        } else if (src) {
          this.flip(el, src, target, dur + 60, !tr.quick, false);
          el.animate([{ color: 'var(--copy)' }, { color: 'var(--copy)', offset: 0.55 }, { color: 'currentColor' }], { duration: dur + 300, easing: 'ease-out' });
        } else if (same) {
          this.flip(el, same, target, dur + 40, false, false);
        } else {
          el.animate([{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'none' }],
            { duration: dur * 0.8, delay: dur * 0.3, easing: EASE, fill: 'backwards' });
        }
      }
    }

    // whatever is left disappeared
    for (const [k, e] of prev) {
      if (!tr || claimed.has(k)) { e.el.remove(); continue; }
      this.ghosts.add(e.el);
      const r = visual.get(k)!;
      const absorbId = [...e.g.owners].reverse().find(id => tr.absorbs?.has(id));
      const dest = absorbId ? this.box(tr.absorbs!.get(absorbId)!) : null;
      let anim: Animation;
      if (dest && r) {
        const dx = dest.x + dest.w / 2 - (r.x + r.w / 2), dy = dest.y + dest.h / 2 - (r.y + r.h / 2);
        placeAt(e.el, r);
        anim = e.el.animate([{ transform: 'none', opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(.7)`, opacity: 0.9, offset: 0.8 }, { transform: `translate(${dx}px,${dy}px) scale(.5)`, opacity: 0 }],
          { duration: dur, easing: EASE, fill: 'forwards' });
      } else {
        if (r) placeAt(e.el, r);
        anim = e.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.4)' }], { duration: dur * 0.7, easing: 'ease-in', fill: 'forwards' });
      }
      anim.onfinish = () => { e.el.remove(); this.ghosts.delete(e.el); };
    }

    // ghost copies flying from a source into a target (e.g. distribution folding a number in)
    if (tr?.flights) {
      for (const f of tr.flights) {
        const dest = this.box(f.to);
        if (!dest) continue;
        for (const [k, r] of visual) {
          const src = this.findOwned(prevLayout, k, f.from);
          if (!src) continue;
          const ghost = createGhost(src, r);
          this.root.appendChild(ghost);
          this.ghosts.add(ghost);
          const dx = dest.x + dest.w / 2 - (r.x + r.w / 2), dy = dest.y + dest.h / 2 - (r.y + r.h / 2);
          const a = ghost.animate([{ transform: 'none', opacity: 1, color: 'var(--copy)' }, { transform: `translate(${dx}px,${dy}px) scale(.6)`, opacity: 0, color: 'var(--copy)' }],
            { duration: dur + 40, easing: EASE, fill: 'forwards' });
          a.onfinish = () => { ghost.remove(); this.ghosts.delete(ghost); };
        }
      }
    }
  }

  private findOwned(prevLayout: Layout | null, key: string, id: string): Glyph | null {
    const g = prevLayout?.glyphs.find(x => x.key === key);
    return g && g.owners.includes(id) ? g : null;
  }

  private flip(el: Element, from: Rect, to: Rect, dur: number, arc: boolean, fadeIn: boolean) {
    const dx = from.x - to.x, dy = from.y - to.y;
    let sx = to.w ? from.w / to.w : 1, sy = to.h ? from.h / to.h : 1;
    if (Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) sx = sy = 1;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01 && !fadeIn) return;
    const start = `translate(${dx}px,${dy}px) scale(${sx},${sy})`;
    const frames: Keyframe[] = [{ transform: start, opacity: fadeIn ? 0 : 1 }];
    if (arc) {
      const lift = Math.min(54, 0.22 * Math.abs(dx) + 0.35 * to.h);
      frames.push({ transform: `translate(${dx / 2}px,${dy / 2 - lift}px) scale(${(sx + 1) / 2},${(sy + 1) / 2})`, offset: 0.5 });
    }
    frames.push({ transform: 'none', opacity: 1 });
    el.animate(frames, { duration: arc ? dur + 60 : dur, easing: arc && EASE === SMOOTH ? 'cubic-bezier(.3,.6,.2,1)' : EASE });
  }

  private crossfade(oldEl: HTMLElement, from: Rect, to: Rect, dur: number) {
    const ghost = oldEl.cloneNode(true) as HTMLElement;
    placeAt(ghost, from);
    ghost.style.lineHeight = ghost.style.height;
    this.root.appendChild(ghost);
    this.ghosts.add(ghost);
    const dx = to.x - from.x, dy = to.y - from.y;
    const a = ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translate(${dx}px,${dy}px)` }], { duration: dur * 0.6, easing: EASE, fill: 'forwards' });
    a.onfinish = () => { ghost.remove(); this.ghosts.delete(ghost); };
  }

  /** the drawn elements belonging to a node (all of them when id is null) */
  elements(id: string | null): Element[] {
    return [...this.entries.values()].filter(e => !id || e.g.owners.includes(id)).map(e => e.el);
  }

  clear() {
    for (const e of this.entries.values()) e.el.remove();
    for (const g of this.ghosts) g.remove();
    this.entries.clear(); this.ghosts.clear(); this.layout = null;
  }
}

function sig(g: Glyph): string {
  if (g.kind === 'text') return `t${g.italic ? 'i' : ''}:${g.text}`;
  if (g.kind === 'paren') return g.straight ? 'p|' : g.right ? 'p)' : 'p(';
  return g.kind;
}

/** ∫, Σ and ∏ from the Computer Modern large operators (as MathJax ships them, Apache 2.0), in font
 *  units with y up. The ∫ is set a little more upright than TeX's (skewed back by 0.1). */
const BIG_OPS: Record<string, { box: string; d: string; skew?: number }> = {
  int: { box: '120 -1366 712 2234', d: '', skew: 0.1 },
  sum: { box: '50 -955 1343 1410', d: 'M60 948Q63 950 665 950H1267L1325 815Q1384 677 1388 669H1348L1341 683Q1320 724 1285 761Q1235 809 1174 838T1033 881T882 898T699 902H574H543H251L259 891Q722 258 724 252Q725 250 724 246Q721 243 460 -56L196 -356Q196 -357 407 -357Q459 -357 548 -357T676 -358Q812 -358 896 -353T1063 -332T1204 -283T1307 -196Q1328 -170 1348 -124H1388Q1388 -125 1381 -145T1356 -210T1325 -294L1267 -449L666 -450Q64 -450 61 -448Q55 -446 55 -439Q55 -437 57 -433L590 177Q590 178 557 222T452 366T322 544L56 909L55 924Q55 945 60 948Z' },
  prod: { box: '50 -955 1177 1410', d: 'M220 812Q220 813 218 819T214 829T208 840T199 853T185 866T166 878T140 887T107 893T66 896H56V950H1221V896H1211Q1080 896 1058 812V-311Q1076 -396 1211 -396H1221V-450H725V-396H735Q864 -396 888 -314Q889 -312 889 -311V896H388V292L389 -311Q405 -396 542 -396H552V-450H56V-396H66Q195 -396 219 -314Q220 -312 220 -311V812Z' },
};
const TEX_INTEGRAL = 'M114 -798Q132 -824 165 -824H167Q195 -824 223 -764T275 -600T320 -391T362 -164Q365 -143 367 -133Q439 292 523 655T645 1127Q651 1145 655 1157T672 1201T699 1257T733 1306T777 1346T828 1360Q884 1360 912 1325T944 1245Q944 1220 932 1205T909 1186T887 1183Q866 1183 849 1198T832 1239Q832 1287 885 1296L882 1300Q879 1303 874 1307T866 1313Q851 1323 833 1323Q819 1323 807 1311T775 1255T736 1139T689 936T633 628Q574 293 510 -5T410 -437T355 -629Q278 -862 165 -862Q125 -862 92 -831T55 -746Q55 -711 74 -698T112 -685Q133 -685 150 -700T167 -741Q167 -789 114 -798Z';
BIG_OPS.int.d = TEX_INTEGRAL;
const isSvg = (g: Glyph) => g.kind === 'paren' || g.kind === 'rad' || g.kind === 'int' || g.kind === 'sum' || g.kind === 'prod';

function elTag(g: Glyph) { return isSvg(g) ? 'svg' : 'DIV'; }

function create(g: Glyph): HTMLElement | SVGSVGElement {
  if (isSvg(g)) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('class', 'g ' + g.kind);
    svg.appendChild(document.createElementNS(SVGNS, 'path'));
    return svg;
  }
  const el = document.createElement('div');
  el.className = 'g ' + g.kind;
  if (g.kind === 'sign') el.innerHTML = '<i class="h"></i><i class="v"></i>';
  if (g.kind === 'eq') el.innerHTML = '<i></i><i></i><i></i>';
  return el;
}

function createGhost(g: Glyph, r: Rect): HTMLElement | SVGSVGElement {
  const el = create(g);
  place(el, g);
  placeAt(el, r);
  return el;
}

function finalRect(g: Glyph): Rect {
  if (g.kind === 'text') {
    const { A, D } = metrics!;
    return { x: g.x, y: g.base! - A * g.s, w: g.w, h: (A + D) * g.s };
  }
  return { x: g.x, y: g.y, w: g.w, h: g.h };
}

function placeAt(el: Element, r: Rect) {
  const st = (el as HTMLElement).style;
  st.left = r.x + 'px'; st.top = r.y + 'px'; st.width = r.w + 'px'; st.height = r.h + 'px';
}

function place(el: HTMLElement | SVGSVGElement, g: Glyph) {
  const r = finalRect(g);
  placeAt(el, r);
  const st = el.style;
  st.setProperty('--s', g.s + 'px');
  if (g.kind === 'text') {
    if (el.textContent !== g.text) el.textContent = g.text!;
    st.fontSize = g.s + 'px';
    st.lineHeight = r.h + 'px';
    el.classList.toggle('it', !!g.italic && g.text !== '□');
    el.classList.toggle('hole', g.text === '□');
  } else if (g.kind === 'eq') {
    (el as HTMLElement).dataset.rel = g.rel ?? '=';
  } else if (g.kind === 'sign') {
    el.classList.toggle('minus', !!g.minus);
  } else if (isSvg(g)) {
    const svg = el as SVGSVGElement;
    svg.setAttribute('viewBox', `0 0 ${g.w} ${g.h}`);
    const sw = Math.max(1.1, 0.044 * g.s);
    const path = svg.firstChild as SVGPathElement;
    path.setAttribute('stroke-width', String(g.kind === 'rad' ? sw * 0.95 : sw));
    const big = BIG_OPS[g.kind];
    if (big) {
      // the display-size operator of Computer Modern (TeX), drawn to the box
      svg.setAttribute('viewBox', big.box);
      svg.setAttribute('preserveAspectRatio', 'none');
      path.setAttribute('transform', big.skew ? `scale(1,-1) matrix(1,0,${-big.skew},1,0,0)` : 'scale(1,-1)');
      path.setAttribute('d', big.d);
    } else if (g.kind === 'paren' && g.straight) {
      path.setAttribute('d', `M ${g.w / 2} ${sw} L ${g.w / 2} ${g.h - sw}`);
    } else if (g.kind === 'paren') {
      const w = g.w, h = g.h, x0 = g.right ? w * 0.25 : w * 0.75, x1 = g.right ? w * 0.72 : w * 0.28;
      path.setAttribute('d', `M ${x0} ${sw} Q ${x1 + (g.right ? 1 : -1) * w * 0.12} ${h / 2} ${x0} ${h - sw}`);
    } else {
      const s = g.s, h = g.h, top = sw / 2;
      path.setAttribute('d', `M ${0.06 * s} ${h * 0.62} L ${0.18 * s} ${h * 0.54} L ${0.33 * s} ${h - sw} L ${0.52 * s} ${top} L ${g.w} ${top}`);
    }
  }
}
