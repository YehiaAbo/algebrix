// Math layout: turns a tree into positioned glyphs. Every glyph carries a stable
// key derived from node ids, and the ids of all nodes that own it, so the stage
// can animate glyphs between layouts and draw selection boxes.
import { Node, FN_TEXT, isDiff, isDiff2, isLeibniz2 } from '../engine/ast';
import { isNeg, absOf, signKey } from '../engine/terms';

export type GlyphKind = 'text' | 'sign' | 'eq' | 'bar' | 'paren' | 'rad' | 'int' | 'sum' | 'prod';
export interface Glyph {
  key: string;
  from?: string;
  kind: GlyphKind;
  /** for the relation glyph: =, <, >, ≤, ≥, ≟ (drawn by the same bars, so a flip animates) */
  rel?: string;
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
/** the math font in use: the --math-font token, so a look pack can swap it */
let font: string | null = null;
const mathFont = () => (font ??= getComputedStyle(document.documentElement).getPropertyValue('--math-font').trim() || MATH_FONT);
function measure(text: string, s: number, italic: boolean): number {
  const k = `${italic ? 'i' : 'n'}|${text}`;
  let w = cache.get(k);
  if (w === undefined) {
    ctx ??= document.createElement('canvas').getContext('2d')!;
    ctx.font = `${italic ? 'italic ' : ''}100px ${mathFont()}`;
    w = ctx.measureText(text).width / 100;
    cache.set(k, w);
  }
  return w * s;
}
export const clearMeasureCache = () => { cache.clear(); font = null; };

/** font ascent/descent as fractions of the size, for placing text baselines in the DOM */
export function fontMetrics() {
  ctx ??= document.createElement('canvas').getContext('2d')!;
  ctx.font = `100px ${mathFont()}`;
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

/** `bare`: false when a function's argument must keep its brackets, as in sin(x) x², which would read as sin(x·x²) */
interface Ctx { base: number; bare?: boolean }

const fracSize = (s: number, c: Ctx) => Math.max(s * (s >= c.base * 0.9 ? 0.8 : 0.78), c.base * 0.42);

/** one box over another with a bar between, centred on the math axis */
function stack(a: Box, d: Box, s: number, id: string, me: string[], from?: string): Box {
  const pad = 0.1 * s;
  const w = Math.max(a.w, d.w) + 2 * pad;
  const gap = 0.14 * s, axis = AXIS * s, rule = RULE * s;
  const numBase = -axis - rule / 2 - gap - a.desc;
  const denBase = -axis + rule / 2 + gap + d.asc;
  const bar: Glyph = { key: `b${id}`, from: from && `b${from}`, kind: 'bar', x: 0.04 * s, y: -axis - rule / 2, w: w - 0.08 * s, h: rule, s, owners: me };
  const gs = [...shift(a, (w - a.w) / 2, numBase), bar, ...shift(d, (w - d.w) / 2, denBase)];
  return { w, asc: -numBase + a.asc, desc: denBase + d.desc, gs };
}

function L(n: Node, s: number, own: string[], c: Ctx): Box {
  const me = [...own, n.id];
  const from = n.from;
  switch (n.k) {
    case 'num': {
      const digits = text(String(Math.abs(n.v)), s, `n${n.id}`, me, false, from && `n${from}`);
      return n.v < 0 ? row([sign(true, s, `sg${n.id}`, me), 0.04 * s, digits]) : digits;
    }
    case 'sym': {
      const u = n.name.indexOf('_');
      // a differential: an upright d, then the letter
      // d²y: an upright d, a raised 2, then the letter
      if (isDiff2(n.name)) {
        const d = text('d', s, `sd${n.id}`, me, false, from && `sd${from}`), es = Math.max(s * 0.62, c.base * 0.36);
        const two = text('2', es, `sd2${n.id}`, me, false, from && `sd2${from}`), rise = Math.max(0.44 * s, d.asc - 0.5 * es * ASC);
        const up: Box = { w: two.w, asc: rise + two.asc, desc: 0, gs: shift(two, 0, -rise) };
        return row([d, 0.015 * s, up, 0.03 * s, text(n.name.slice(2), s, `s${n.id}`, me, true, from && `s${from}`)]);
      }
      if (isDiff(n.name)) return row([text('d', s, `sd${n.id}`, me, false, from && `sd${from}`), 0.02 * s, text(n.name.slice(1), s, `s${n.id}`, me, true, from && `s${from}`)]);
      if (u < 0) return text(n.name, s, `s${n.id}`, me, true, from && `s${from}`);
      // x_1: the name, then its subscript smaller and lower (digits upright)
      const base = text(n.name.slice(0, u), s, `s${n.id}`, me, true, from && `s${from}`);
      const t = n.name.slice(u + 1), ss = 0.64 * s, drop = 0.24 * s;
      const sub = text(t, ss, `s${n.id}_`, me, !/^[0-9]+$/.test(t), from && `s${from}_`);
      for (const g of sub.gs) { g.x += base.w; g.y += drop; g.base! += drop; }
      return { w: base.w + sub.w + 0.02 * s, asc: base.asc, desc: Math.max(base.desc, drop + sub.desc), gs: [...base.gs, ...sub.gs] };
    }
    case 'eq': {
      const l = L(n.lhs, s, me, c);
      if (n.rel === 'expr') return termBox(n.lhs, l, s, me);
      const r = L(n.rhs, s, me, c);
      const w = 0.66 * s;
      const g: Glyph = { key: 'eq', kind: 'eq', rel: n.rel === 'def' ? '=' : n.rel ?? '=', x: 0, y: -(AXIS + 0.13) * s, w, h: 0.26 * s, s, owners: me };
      return row([termBox(n.lhs, l, s, me), 0.3 * s, { w, asc: (AXIS + 0.13) * s, desc: 0, gs: [g] }, 0.3 * s, termBox(n.rhs, r, s, me)]);
    }
    case 'add': {
      const parts: (Box | number)[] = [];
      // a group (a sum inside a sum, from a partial selection) lays out inline; its pieces belong to it too
      const flat = n.terms.flatMap(t => (t.k === 'add' ? t.terms.map(u => ({ t: u, own: [...me, t.id] })) : [{ t, own: me }]));
      flat.forEach(({ t, own }, i) => {
        const tOwn = t.k === 'neg' ? [...own, t.id] : own;
        const inner = absOf(t);
        // a whole sum taken away keeps its brackets: − (a + b), and so does a negative: − (−2x), never − −2x
        const body = (inner.k === 'add' || isNeg(inner)) && isNeg(t) ? parens(L(inner, s, tOwn, c), s, inner.id, tOwn, inner.from) : L(inner, s, tOwn, c);
        const neg = isNeg(t);
        if (i === 0) {
          if (neg) parts.push(sign(true, s, `sg${signKey(t)}`, [...own, t.id]), 0.04 * s);
        } else {
          parts.push(0.2 * s, sign(neg, s, `sg${signKey(t)}`, [...own, t.id]), 0.2 * s);
        }
        parts.push(body);
      });
      return row(parts);
    }
    case 'mul': {
      const parts: (Box | number)[] = [];
      let drawn = 0;
      n.factors.forEach((f, i) => {
        if (i === 0 && f.k === 'num' && Math.abs(f.v) === 1 && n.factors.length > 1 && n.factors[1].k !== 'num' && n.factors[1].k !== 'frac') {
          if (f.v < 0) { parts.push(sign(true, s, `sg${n.id}`, me), 0.04 * s); }
          return;
        }
        // sin x x² reads as sin(x·x²): a function with more factors after it keeps its brackets
        const shut = (f.k === 'fn' || (f.k === 'pow' && f.base.k === 'fn')) && i < n.factors.length - 1;
        let b = L(f, s, me, shut ? { base: c.base, bare: false } : c);
        const wrap = f.k === 'add' || (drawn > 0 && isNeg(f)) || (f.k === 'neg');
        if (wrap) b = parens(b, s, f.id, [...me, f.id], f.from);
        const prev = n.factors[i - 1];
        if (drawn > 0) {
          // a thin space around a differential (x dx) and dy/dx, as in print
          const diff = (m?: Node) => !!m && ((m.k === 'sym' && isDiff(m.name)) || isLeibniz2(m) || (m.k === 'frac' && m.num.k === 'sym' && isDiff(m.num.name) && m.den.k === 'sym' && isDiff(m.den.name)));
          const dot = f.k === 'num' || (f.k === 'frac' && prev?.k === 'frac') || (f.k === 'pow' && f.base.k === 'num');
          if (dot) parts.push(0.1 * s, text('·', s, `d${f.id}`, me, false), 0.1 * s);
          else parts.push(((f.k === 'fn' && f.name !== 'abs') || (f.k === 'pow' && f.base.k === 'fn' && f.base.name !== 'abs') || diff(f) || diff(prev) ? 0.16 : wrap || prev?.k === 'add' ? 0.02 : 0.05) * s);
        }
        parts.push(b);
        drawn++;
      });
      return row(parts);
    }
    case 'neg': {
      const b = L(n.arg, s, me, c);
      const wrap = n.arg.k === 'add' || n.arg.k === 'neg' || (n.arg.k === 'num' && n.arg.v < 0);
      return row([sign(true, s, `sg${signKey(n)}`, me), 0.04 * s, wrap ? parens(b, s, n.arg.id, me) : b]);
    }
    case 'frac': {
      const ss = fracSize(s, c);
      return stack(L(n.num, ss, me, c), L(n.den, ss, me, c), s, n.id, me, from);
    }
    case 'deriv': {
      // d/dx as a small fraction, then what is differentiated
      const ss = fracSize(s, c);
      const d = n.partial ? '∂' : 'd';
      const top = text(d, ss, `dd${n.id}`, me, false, from && `dd${from}`);
      const bot = row([text(d, ss, `de${n.id}`, me, false, from && `de${from}`), 0.02 * ss, text(n.v, ss, `dv${n.id}`, me, true, from && `dv${from}`)]);
      const op = stack(top, bot, s, n.id, me, from);
      const a = L(n.arg, s, me, c);
      const bare = n.arg.k === 'sym' || n.arg.k === 'num' || n.arg.k === 'call' || (n.arg.k === 'fn' && n.arg.name !== 'abs');
      return row([op, 0.06 * s, bare ? a : parens(a, s, n.id, me, from)]);
    }
    case 'int': {
      // ∫ as tall as what it integrates, bounds at its top and bottom right, then f and dx
      const a = L(n.arg, s, me, c);
      const wrap = n.arg.k === 'add' || n.arg.k === 'neg';
      const body = wrap ? parens(a, s, n.id, me, from) : a;
      // taller than what it holds, like a typeset ∫, and slanted
      // nested integrals all stand as tall as the innermost one's inside
      let core: Node = n.arg;
      while (core.k === 'int') core = core.arg;
      const sized = core === n.arg ? body : L(core, s, me, c);
      // centred on the math axis like a typeset one, never shorter than TeX's display ∫ (2.2 em)
      const half = Math.max(sized.asc - AXIS * s, sized.desc + AXIS * s) + 0.25 * s;
      const top = Math.max(half + AXIS * s, 1.36 * s), bot = Math.max(half - AXIS * s, 0.86 * s);
      // as wide as the typeset sign is for its height, within reason
      const w = Math.min(0.85 * s, Math.max(0.5 * s, 0.32 * (top + bot)));
      const sign: Glyph = { key: `i${n.id}`, from: from && `i${from}`, kind: 'int', x: 0, y: -top, w, h: top + bot, s, owners: me };
      let op: Box = { w, asc: top, desc: bot, gs: [sign] };
      if (n.lo && n.hi) {
        const ss = Math.max(s * 0.6, c.base * 0.36);
        const hi = L(n.hi, ss, me, c), lo = L(n.lo, ss, me, c);
        const bw = Math.max(hi.w, lo.w);
        op = { w: w + 0.1 * s + bw, asc: Math.max(top, top - 0.1 * s + hi.asc), desc: Math.max(bot, bot + lo.desc - 0.1 * s), gs: [sign, ...shift(hi, w + 0.1 * s, -top + hi.asc - 0.05 * s), ...shift(lo, w * 0.55, bot - lo.desc + 0.05 * s)] };
      }
      const dx = row([text('d', s, `id${n.id}`, me, false, from && `id${from}`), 0.02 * s, text(n.v, s, `iv${n.id}`, me, true, from && `iv${from}`)]);
      return row([op, 0.2 * s, body, 0.16 * s, dx]);
    }
    case 'vec': {
      // ⟨a, b, c⟩
      const parts: (Box | number)[] = [text('⟨', s, `vl${n.id}`, me, false, from && `vl${from}`), 0.06 * s];
      n.items.forEach((it, i) => {
        if (i) parts.push(text(',', s, `vc${n.id}.${i}`, me, false), 0.22 * s);
        parts.push(L(it, s, me, c));
      });
      parts.push(0.06 * s, text('⟩', s, `vr${n.id}`, me, false, from && `vr${from}`));
      return row(parts);
    }
    case 'grad': {
      const a = L(n.arg, s, me, c);
      const bare = n.arg.k === 'sym' || n.arg.k === 'call' || (!!n.op && n.arg.k === 'vec');
      const sign = text(n.op === 'div' ? '∇·' : n.op === 'curl' ? '∇×' : '∇', s, `gn${n.id}`, me, false, from && `gn${from}`);
      return row([sign, 0.04 * s, bare ? a : parens(a, s, n.id, me, from)]);
    }
    case 'sum': {
      // Σ or ∏ as TeX sets them in display: 1.4 em tall on the axis, the top bound above and
      // "n = lo" below, both centred
      const top = 0.95 * s, bot = 0.45 * s, gw = (n.prod ? 1.177 : 1.343) * 0.9 * s;
      const sign: Glyph = { key: `S${n.id}`, from: from && `S${from}`, kind: n.prod ? 'prod' : 'sum', x: 0, y: -top, w: gw, h: top + bot, s, owners: me };
      const ss = Math.max(s * 0.6, c.base * 0.36);
      const hi = L(n.hi, ss, me, c);
      const lo = row([text(n.v, ss, `Sv${n.id}`, me, true), 0.04 * ss, text('=', ss, `Se${n.id}`, me, false), 0.04 * ss, L(n.lo, ss, me, c)]);
      const w = Math.max(gw, hi.w, lo.w);
      const hiY = -(top + 0.12 * s + hi.desc), loY = bot + 0.12 * s + lo.asc;
      const op: Box = { w, asc: -hiY + hi.asc, desc: loY + lo.desc, gs: [{ ...sign, x: (w - gw) / 2 }, ...shift(hi, (w - hi.w) / 2, hiY), ...shift(lo, (w - lo.w) / 2, loY)] };
      const a = L(n.arg, s, me, c);
      return row([op, 0.18 * s, n.arg.k === 'add' || n.arg.k === 'neg' ? parens(a, s, n.id, me, from) : a]);
    }
    case 'at': {
      // F, then a bar with the bounds at its top and bottom: F|ₐᵇ
      const a = L(n.arg, s, me, c);
      const body = n.arg.k === 'add' || n.arg.k === 'neg' ? parens(a, s, n.id, me, from) : a;
      const top = Math.max(body.asc, ASC * s) + 0.1 * s, bot = Math.max(body.desc, DESC * s) + 0.1 * s;
      const bw = 0.2 * s;
      const bar: Glyph = { key: `a${n.id}`, from: from && `a${from}`, kind: 'paren', straight: true, right: true, x: 0, y: -top, w: bw, h: top + bot, s, owners: me };
      const ss = Math.max(s * 0.6, c.base * 0.36);
      const hi = L(n.hi, ss, me, c), lo = L(n.lo, ss, me, c);
      const tail: Box = { w: bw + Math.max(hi.w, lo.w), asc: top + 0.05 * s, desc: bot + 0.05 * s, gs: [bar, ...shift(hi, bw, -top + hi.asc - 0.05 * s), ...shift(lo, bw, bot - lo.desc + 0.05 * s)] };
      return row([body, 0.04 * s, tail]);
    }
    case 'lim': {
      // "lim" with "x → a" small underneath, then what the limit is of
      const word = text('lim', s, `lm${n.id}`, me, false, from && `lm${from}`);
      const ss = Math.max(s * 0.6, c.base * 0.36);
      const side = n.side ? [text(n.side === '+' ? '⁺' : '⁻', ss, `ls${n.id}`, me, false)] : [];
      // two letters: (x, y) → (0, 0)
      const two = n.v.includes(',') && n.to.k === 'vec' ? n.to.items : null;
      const point = two ? row([text('(', ss, `lp${n.id}`, me, false), ...two.flatMap((t, i) => i ? [text(',', ss, `lc${n.id}${i}`, me, false), 0.12 * ss, L(t, ss, me, c)] : [L(t, ss, me, c)]), text(')', ss, `lq${n.id}`, me, false)]) : null;
      const [va, vb] = n.v.split(',');
      const vars = two ? row([text('(', ss, `lo${n.id}`, me, false), text(va, ss, `lv${n.id}`, me, true, from && `lv${from}`), text(',', ss, `lk${n.id}`, me, false), 0.12 * ss, text(vb, ss, `lw${n.id}`, me, true), text(')', ss, `lz${n.id}`, me, false)]) : null;
      const sub = row([vars ?? text(n.v, ss, `lv${n.id}`, me, true, from && `lv${from}`), 0.04 * ss, text('→', ss, `la${n.id}`, me, false, from && `la${from}`), 0.04 * ss, point ?? L(n.to, ss, me, c), ...side]);
      const w = Math.max(word.w, sub.w);
      const drop = word.desc + 0.08 * s + sub.asc;
      const op: Box = { w, asc: word.asc, desc: drop + sub.desc, gs: [...shift(word, (w - word.w) / 2, 0), ...shift(sub, (w - sub.w) / 2, drop)] };
      const a = L(n.arg, s, me, c);
      const wrap = n.arg.k === 'add' || n.arg.k === 'neg' || n.arg.k === 'lim';
      return row([op, 0.2 * s, wrap ? parens(a, s, n.id, me, from) : a]);
    }
    case 'pow': {
      const fb = n.base;
      if (fb.k === 'fn' && fb.name !== 'abs' && fb.name !== 'fact' && n.exp.k === 'num' && Number.isInteger(n.exp.v) && n.exp.v > 0) {
        // sin(x)² is written sin² x: the power sits on the name, never after the x where it would read as sin(x²)
        const fme = [...me, fb.id], ffrom = fb.from;
        const name = text(FN_TEXT[fb.name] ?? fb.name, s, `f${fb.id}`, fme, false, ffrom && `f${ffrom}`);
        const es = Math.max(s * 0.62, c.base * 0.36);
        const e = L(n.exp, es, me, { base: c.base });
        const rise = Math.max(0.44 * s, name.asc - 0.5 * es * ASC);
        const head: Box = { w: name.w + 0.03 * s + e.w, asc: Math.max(name.asc, rise + e.asc), desc: name.desc, gs: [...name.gs, ...shift({ ...e, gs: shift(e, 0, -rise) }, name.w + 0.03 * s, 0)] };
        const a = L(fb.arg, s, fme, { base: c.base });
        const simple = c.bare !== false && (fb.arg.k === 'sym' || (fb.arg.k === 'num' && fb.arg.v >= 0));
        return simple ? row([head, 0.12 * s, a]) : row([head, 0.04 * s, parens(a, s, fb.id, fme, ffrom)]);
      }
      let b = L(n.base, s, me, c);
      if (!(n.base.k === 'sym' || (n.base.k === 'num' && n.base.v >= 0) || n.base.k === 'sqrt' || (n.base.k === 'fn' && (n.base.name === 'abs' || n.base.name === 'fact')))) b = parens(b, s, n.base.id, me);
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
    case 'call': {
      // f(x, y): the inputs with commas, no ⟨ ⟩ (the vector is only how they are held)
      const v = n.arg;
      const a = v.k === 'vec' ? row(v.items.flatMap((it, i) => i ? [text(',', s, `vc${v.id}.${i}`, me, false), 0.22 * s, L(it, s, me, c)] : [L(it, s, me, c)])) : L(n.arg, s, me, c);
      const name = text(n.name, s, `f${n.id}`, me, true, from && `f${from}`);
      return row([name, 0.04 * s, parens(a, s, n.id, me, from)]);
    }
    case 'fn': {
      const bare = c.bare !== false;
      if (!bare) c = { base: c.base };
      const a = L(n.arg, s, me, c);
      if (n.name === 'abs') return parens(a, s, n.id, me, from, true);
      if (n.name === 'fact') {
        const simple = n.arg.k === 'sym' || (n.arg.k === 'num' && n.arg.v >= 0);
        return row([simple ? a : parens(a, s, n.id, me, from), 0.02 * s, text('!', s, `f${n.id}`, me, false, from && `f${from}`)]);
      }
      const name = text(FN_TEXT[n.name] ?? n.name, s, `f${n.id}`, me, false, from && `f${from}`);
      const simple = bare && (n.arg.k === 'sym' || (n.arg.k === 'num' && n.arg.v >= 0));
      // ln|x − 1|: the bars already hold it, so no brackets around them
      const barred = n.arg.k === 'fn' && n.arg.name === 'abs';
      return simple ? row([name, 0.12 * s, a]) : barred ? row([name, 0.06 * s, a]) : row([name, 0.04 * s, parens(a, s, n.id, me, from)]);
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
