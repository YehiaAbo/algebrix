// Math layout: turns a tree into positioned glyphs. Every glyph carries a stable
// key derived from node ids, and the ids of all nodes that own it, so the stage
// can animate glyphs between layouts and draw selection boxes.
import { Node } from '../engine/ast';
import { isNeg, absOf, signKey } from '../engine/terms';

export type GlyphKind = 'text' | 'sign' | 'eq' | 'bar' | 'paren' | 'rad';
export interface Glyph {
  key: string;
  from?: string;
  kind: GlyphKind;
  text?: string;
  italic?: boolean;
  minus?: boolean;
  right?: boolean;
  /** a straight bar (absolute value) instead of a curved paren */
  straight?: boolean;
  x: number; y: number; w: number; h: number;
  /** font size (px) the glyph is drawn at */
  s: number;
  /** text baseline (absolute y) */
  base?: number;
  owners: string[];
}
export interface Rect { x: number; y: number; w: number; h: number }
export interface Layout { glyphs: Glyph[]; w: number; asc: number; desc: number; boxes: Map<string, Rect>; eqX: number | null }

interface Box { w: number; asc: number; desc: number; gs: Glyph[] }

export const MATH_FONT = '"STIX Two Text", "STIX Two Math", "Cambria Math", "Times New Roman", serif';
let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();
function measure(text: string, s: number, italic: boolean): number {
  const k = `${italic ? 'i' : 'n'}|${text}`;
  let w = cache.get(k);
  if (w === undefined) {
    ctx ??= document.createElement('canvas').getContext('2d')!;
    ctx.font = `${italic ? 'italic ' : ''}100px ${MATH_FONT}`;
    w = ctx.measureText(text).width / 100;
    cache.set(k, w);
  }
  return w * s;
}
export const clearMeasureCache = () => cache.clear();

/** font ascent/descent as fractions of the size, for placing text baselines in the DOM */
export function fontMetrics() {
  ctx ??= document.createElement('canvas').getContext('2d')!;
  ctx.font = `100px ${MATH_FONT}`;
  const m = ctx.measureText('Hxy');
  return { A: (m.fontBoundingBoxAscent || 90) / 100, D: (m.fontBoundingBoxDescent || 25) / 100 };
}

const AXIS = 0.25;   // math axis above baseline (em)
const ASC = 0.70, DESC = 0.21;
const RULE = 0.052;  // stroke weight (em)

function shift(b: Box, dx: number, dy: number): Glyph[] {
  return b.gs.map(g => ({ ...g, x: g.x + dx, y: g.y + dy, base: g.base === undefined ? undefined : g.base + dy }));
}

/** Concatenate boxes horizontally on a shared baseline. */
function row(parts: (Box | number)[]): Box {
  let x = 0, asc = 0, desc = 0;
  const gs: Glyph[] = [];
  for (const p of parts) {
    if (typeof p === 'number') { x += p; continue; }
    gs.push(...shift(p, x, 0));
    x += p.w; asc = Math.max(asc, p.asc); desc = Math.max(desc, p.desc);
  }
  return { w: x, asc, desc, gs };
}

function text(t: string, s: number, key: string, owners: string[], italic: boolean, from?: string): Box {
  const w = measure(t, s, italic) + (italic ? 0.03 * s : 0);
  const g: Glyph = { key, from, kind: 'text', text: t, italic, x: 0, y: -ASC * s, w, h: (ASC + DESC) * s, s, base: 0, owners };
  return { w, asc: ASC * s, desc: DESC * s, gs: [g] };
}

function sign(minus: boolean, s: number, key: string, owners: string[]): Box {
  const w = 0.62 * s;
  const g: Glyph = { key, kind: 'sign', minus, x: 0, y: -(AXIS + 0.31) * s, w, h: 0.62 * s, s, owners };
  return { w, asc: (AXIS + 0.31) * s, desc: 0, gs: [g] };
}

function parens(b: Box, s: number, id: string, owners: string[], from?: string, straight = false): Box {
  if (b.asc <= 0.82 * s && b.desc <= 0.3 * s) {
    // short content: the font's own parentheses look best
    const l = text(straight ? '|' : '(', s, `(${id}`, owners, false, from && `(${from}`);
    const r = text(straight ? '|' : ')', s, `)${id}`, owners, false, from && `)${from}`);
    return row([l, (straight ? 0.06 : 0.03) * s, b, (straight ? 0.06 : 0.03) * s, r]);
  }
  const top = Math.max(b.asc, ASC * s) + 0.08 * s, bot = Math.max(b.desc, DESC * s) + 0.08 * s;
  const w = 0.33 * s;
  const mk = (right: boolean): Glyph => ({ key: `${right ? ')' : '('}${id}`, from: from && `${right ? ')' : '('}${from}`, kind: 'paren', right, straight, x: 0, y: -top, w: straight ? w * 0.6 : w, h: top + bot, s, owners });
  const pw = straight ? w * 0.6 : w;
  const l: Box = { w: pw, asc: top, desc: bot, gs: [mk(false)] };
  const r: Box = { w: pw, asc: top, desc: bot, gs: [mk(true)] };
  return row([l, 0.02 * s, b, 0.02 * s, r]);
}

interface Ctx { base: number }

function L(n: Node, s: number, own: string[], c: Ctx): Box {
  const me = [...own, n.id];
  const from = n.from;
  switch (n.k) {
    case 'num': {
      const digits = text(String(Math.abs(n.v)), s, `n${n.id}`, me, false, from && `n${from}`);
      return n.v < 0 ? row([sign(true, s, `sg${n.id}`, me), 0.04 * s, digits]) : digits;
    }
    case 'sym': return text(n.name, s, `s${n.id}`, me, true, from && `s${from}`);
    case 'eq': {
      const l = L(n.lhs, s, me, c), r = L(n.rhs, s, me, c);
      const w = 0.66 * s;
      const g: Glyph = { key: 'eq', kind: 'eq', x: 0, y: -(AXIS + 0.13) * s, w, h: 0.26 * s, s, owners: me };
      return row([termBox(n.lhs, l, s, me), 0.3 * s, { w, asc: (AXIS + 0.13) * s, desc: 0, gs: [g] }, 0.3 * s, termBox(n.rhs, r, s, me)]);
    }
    case 'add': {
      const parts: (Box | number)[] = [];
      n.terms.forEach((t, i) => {
        const tOwn = t.k === 'neg' ? [...me, t.id] : me;
        const body = L(absOf(t), s, tOwn, c);
        const neg = isNeg(t);
        if (i === 0) {
          if (neg) parts.push(sign(true, s, `sg${signKey(t)}`, [...me, t.id]), 0.04 * s);
        } else {
          parts.push(0.2 * s, sign(neg, s, `sg${signKey(t)}`, [...me, t.id]), 0.2 * s);
        }
        parts.push(body);
      });
      return row(parts);
    }
    case 'mul': {
      const parts: (Box | number)[] = [];
      let drawn = 0;
      n.factors.forEach((f, i) => {
        if (i === 0 && f.k === 'num' && Math.abs(f.v) === 1 && n.factors.length > 1) {
          if (f.v < 0) { parts.push(sign(true, s, `sg${n.id}`, me), 0.04 * s); }
          return;
        }
        let b = L(f, s, me, c);
        const wrap = f.k === 'add' || (drawn > 0 && isNeg(f)) || (f.k === 'neg');
        if (wrap) b = parens(b, s, f.id, [...me, f.id], f.from);
        const prev = n.factors[i - 1];
        if (drawn > 0) {
          const dot = f.k === 'num' || (f.k === 'frac' && prev?.k === 'frac') || (f.k === 'pow' && f.base.k === 'num');
          if (dot) parts.push(0.1 * s, text('·', s, `d${f.id}`, me, false), 0.1 * s);
          else parts.push((f.k === 'fn' && f.name !== 'abs' ? 0.16 : wrap || prev?.k === 'add' ? 0.02 : 0.05) * s);
        }
        parts.push(b);
        drawn++;
      });
      return row(parts);
    }
    case 'neg': {
      const b = L(n.arg, s, me, c);
      return row([sign(true, s, `sg${signKey(n)}`, me), 0.04 * s, n.arg.k === 'add' ? parens(b, s, n.arg.id, me) : b]);
    }
    case 'frac': {
      const fs = s >= c.base * 0.9 ? 0.8 : 0.78;
      const ss = Math.max(s * fs, c.base * 0.42);
      const a = L(n.num, ss, me, c), d = L(n.den, ss, me, c);
      const pad = 0.1 * s;
      const w = Math.max(a.w, d.w) + 2 * pad;
      const gap = 0.14 * s, axis = AXIS * s, rule = RULE * s;
      const numBase = -axis - rule / 2 - gap - a.desc;
      const denBase = -axis + rule / 2 + gap + d.asc;
      const bar: Glyph = { key: `b${n.id}`, from: from && `b${from}`, kind: 'bar', x: 0.04 * s, y: -axis - rule / 2, w: w - 0.08 * s, h: rule, s, owners: me };
      const gs = [...shift(a, (w - a.w) / 2, numBase), bar, ...shift(d, (w - d.w) / 2, denBase)];
      return { w, asc: -numBase + a.asc, desc: denBase + d.desc, gs };
    }
    case 'pow': {
      let b = L(n.base, s, me, c);
      if (!(n.base.k === 'sym' || (n.base.k === 'num' && n.base.v >= 0) || n.base.k === 'sqrt' || (n.base.k === 'fn' && n.base.name === 'abs'))) b = parens(b, s, n.base.id, me);
      const es = Math.max(s * 0.62, c.base * 0.36);
      const e = L(n.exp, es, me, c);
      const rise = Math.max(0.44 * s, b.asc - 0.5 * es * ASC);
      const eb = { ...e, gs: shift(e, 0, -rise) };
      const gap = n.base.k === 'sym' ? 0.015 * s : 0.04 * s;
      return { w: b.w + gap + e.w, asc: Math.max(b.asc, rise + e.asc), desc: b.desc, gs: [...b.gs, ...shift(eb, b.w + gap, 0)] };
    }
    case 'sqrt': {
      const a = L(n.arg, s, me, c);
      const top = Math.max(a.asc, ASC * s) + 0.14 * s;
      const lead = 0.6 * s;
      const w = lead + a.w + 0.1 * s;
      const rad: Glyph = { key: `r${n.id}`, from: from && `r${from}`, kind: 'rad', x: 0, y: -top, w, h: top + a.desc + 0.06 * s, s, owners: me };
      return { w, asc: top + 0.03 * s, desc: a.desc + 0.06 * s, gs: [rad, ...shift(a, lead, 0)] };
    }
    case 'fn': {
      const a = L(n.arg, s, me, c);
      if (n.name === 'abs') return parens(a, s, n.id, me, from, true);
      const name = text(n.name, s, `f${n.id}`, me, false, from && `f${from}`);
      const simple = n.arg.k === 'sym' || (n.arg.k === 'num' && n.arg.v >= 0);
      return simple ? row([name, 0.12 * s, a]) : row([name, 0.04 * s, parens(a, s, n.id, me, from)]);
    }
  }
}

/** A side of the equation is laid out like a one-term sum: a negative side gets a leading sign. */
function termBox(n: Node, laid: Box, s: number, own: string[]): Box {
  if (n.k === 'add' || !isNeg(n)) return laid;
  const c: Ctx = { base: s };
  const tOwn = n.k === 'neg' ? [...own, n.id] : own;
  const body = L(absOf(n), s, tOwn, c);
  return row([sign(true, s, `sg${signKey(n)}`, [...own, n.id]), 0.04 * s, body]);
}

export function layout(n: Node, s: number): Layout {
  const c: Ctx = { base: s };
  const raw = L(n, s, [], c);
  const b = n.k === 'eq' ? raw : termBox(n, raw, s, []);
  const gs = shift(b, 0, b.asc);
  const boxes = new Map<string, Rect>();
  for (const g of gs) {
    for (const id of g.owners) {
      const r = boxes.get(id);
      if (!r) boxes.set(id, { x: g.x, y: g.y, w: g.w, h: g.h });
      else {
        const x2 = Math.max(r.x + r.w, g.x + g.w), y2 = Math.max(r.y + r.h, g.y + g.h);
        r.x = Math.min(r.x, g.x); r.y = Math.min(r.y, g.y); r.w = x2 - r.x; r.h = y2 - r.y;
      }
    }
  }
  const eqG = gs.find(g => g.key === 'eq');
  return { glyphs: gs, w: b.w, asc: b.asc, desc: b.desc, boxes, eqX: eqG ? eqG.x + eqG.w / 2 : null };
}
