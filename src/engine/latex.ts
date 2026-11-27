// LaTeX in and out: the format the typing boxes speak (the live math editor reads and writes
// LaTeX) and the one the work can be exported in.
//
// toLatex: a tree (or an equation) as LaTeX, total over every node kind.
// latexToText: LaTeX (what the editor writes, or what people paste) as the app's text form, so
//   the one grammar of meaning stays parse.ts. An empty slot {} becomes □, a hole the live preview
//   already knows how to show.
// fromLatex: the two together, LaTeX to an equation.
// No DOM here.
import { writtenParts } from './series';
import { ungroup } from './select';
import { toText } from './print';
import { Node, Eq, FN_TEXT, isDiff2, isLeibniz2, logBase } from './ast';
import { isNeg, absOf } from './terms';
import { parseEquation } from './parse';

const GREEK: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ι: 'iota', κ: 'kappa',
  λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma', τ: 'tau', υ: 'upsilon', φ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega',
};
const FROM_GREEK = Object.fromEntries(Object.entries(GREEK).map(([g, w]) => [w, g]));
const POWERED = ['sin', 'cos', 'tan', 'ln', 'log'];

/** a letter or a name as LaTeX: π → \pi, a_n → a_{n}, y′ → y', d²y → d^{2}y */
function name(s: string): string {
  if (s === '∞') return '\\infty';
  if (isDiff2(s)) return `d^{2}${name(s.slice(2))}`;
  const primes = /[′″‴]*$/.exec(s)![0];
  const ticks = [...primes].map(p => (p === '′' ? "'" : p === '″' ? "''" : "'''")).join('');
  const core = s.slice(0, s.length - primes.length);
  const [base, sub] = core.split('_');
  const b = [...base].map(c => (GREEK[c] ? `\\${GREEK[c]} ` : c)).join('').trimEnd();
  return (sub !== undefined ? `${b}_{${name(sub)}}` : b) + ticks;
}

const paren = (s: string) => `\\left(${s}\\right)`;

/** two pieces of LaTeX side by side: a command never runs into a letter after it (\int x, not \intx) */
const cat = (a: string, b: string) => a + (/\\[a-zA-Z]+$/.test(a) && /^[a-zA-Z0-9]/.test(b) ? ' ' : '') + b;

export function toLatex(n: Node): string {
  const L = toLatex;
  const wrapIf = (m: Node, w: boolean) => (w ? paren(L(m)) : L(m));
  const loose = (m: Node) => m.k === 'add' || m.k === 'neg' || isNeg(m);
  switch (n.k) {
    case 'num': return n.v < 0 ? `-${Math.abs(n.v)}` : String(n.v);
    case 'sym': return name(n.name);
    case 'eq': {
      const rel = n.rel ?? '=';
      if (rel === 'expr') return L(n.lhs);
      const r = ({ '≤': '\\le', '≥': '\\ge', '≟': '=', def: '=' } as Record<string, string>)[rel] ?? rel;
      return cat(cat(L(n.lhs), r), L(n.rhs));
    }
    case 'neg': return '-' + wrapIf(n.arg, loose(n.arg) || (n.arg.k === 'num' && n.arg.v < 0));
    case 'add': {
      // written out with ⋯: each written term whole (bracketed when it is a difference), then \cdots
      const w = writtenParts(n);
      if (w) {
        const tex = w.parts.map((t, i) => {
          if (t.k === 'sum' && t.dots) return (i ? '+' : '') + '\\cdots';
          if (w.grouped.has(t)) return (i ? '+' : '') + `\\left(${L(t)}\\right)`;
          return (isNeg(t) ? '-' : i === 0 ? '' : '+') + wrapIf(absOf(t), (absOf(t).k === 'add' || isNeg(absOf(t))) && isNeg(t));
        }).join('');
        // only if it reads back as the same terms (2 − √3 hides the pattern of √(k + 1) − √k): else the Σ
        let back = '';
        try { back = toText(ungroup(fromLatex(tex).lhs)); } catch { back = ''; }
        if (back === toText(ungroup(n))) return tex;
      }
      return n.terms.flatMap(t => (t.k === 'add' ? t.terms : [t])).map((t, i) => {
        const inner = absOf(t);
        const body = wrapIf(inner, (inner.k === 'add' || isNeg(inner)) && isNeg(t));
        return (isNeg(t) ? '-' : i === 0 ? '' : '+') + body;
      }).join('');
    }
    case 'mul': {
      const asTex = (dots: boolean) => {
      let out = '';
      n.factors.forEach((f, i) => {
        if (dots && f.k === 'sum' && f.dots) { out += '\\cdots '; return; }
        if (i === 0 && f.k === 'num' && Math.abs(f.v) === 1 && n.factors.length > 1 && n.factors[1].k !== 'num' && n.factors[1].k !== 'frac') { if (f.v < 0) out += '-'; return; }
        // ∫ … dx, Σ, lim with more after them: brackets, or what follows would join them
        const s = wrapIf(f, f.k === 'add' || (i > 0 && isNeg(f)) || (i < n.factors.length - 1 && (f.k === 'int' || f.k === 'sum' || f.k === 'lim' || f.k === 'deriv')));
        // a number after anything takes a dot (x·3, never x3, which reads as x₃); so do two
        // fractions side by side, and anything next to |x|
        const dot = i > 0 && out !== '' && out !== '-' && (f.k === 'num' || /^\d/.test(s) || /\\right\|$/.test(out) || /^\\left\|/.test(s));
        // letters run together fine in LaTeX, but a command needs a space before a letter
        const gap = i > 0 && !dot && /\\[a-zA-Z]+$/.test(out) && /^[a-zA-Z]/.test(s) ? ' ' : '';
        out += (dot ? '\\cdot ' : gap) + s;
      });
      return out;
      };
      // a written-out product shows ⋯ only if it reads back as the same factors
      if (n.factors.some(f => f.k === 'sum' && f.dots)) {
        const tex = asTex(true);
        let back = '';
        try { back = toText(ungroup(fromLatex(tex).lhs)); } catch { back = ''; }
        if (back === toText(ungroup(n))) return tex;
      }
      return asTex(false);
    }
    case 'frac': {
      const lb = logBase(n);
      if (lb) return `\\log_{${L(lb.base)}}${paren(L(lb.arg))}`;
      if (isNeg(n.num) && n.num.k !== 'add') return '-' + L({ ...n, num: absOf(n.num) });
      if (isLeibniz2(n)) return `\\frac{${L(n.num)}}{${L(n.den)}}`;
      return `\\frac{${L(n.num)}}{${L(n.den)}}`;
    }
    case 'pow': {
      if (n.base.k === 'fn' && POWERED.includes(n.base.name) && n.exp.k === 'num' && Number.isInteger(n.exp.v) && n.exp.v > 1)
        return `\\${n.base.name}^{${n.exp.v}}${paren(L(n.base.arg))}`;
      const atomBase = (n.base.k === 'num' && n.base.v >= 0 && Number.isInteger(n.base.v)) || n.base.k === 'sym' || n.base.k === 'call' || (n.base.k === 'fn' && (n.base.name === 'abs'));
      return `${wrapIf(n.base, !atomBase)}^{${L(n.exp)}}`;
    }
    case 'sqrt': return `\\sqrt{${L(n.arg)}}`;
    case 'call': return `${name(n.name)}${paren(n.arg.k === 'vec' ? n.arg.items.map(L).join(',') : L(n.arg))}`;
    case 'deriv': return n.partial ? `\\frac{\\partial}{\\partial ${name(n.v)}}${paren(L(n.arg))}` : `\\frac{d}{d${name(n.v)}}${paren(L(n.arg))}`;
    case 'vec': return `\\left\\langle ${n.items.map(L).join(',')}\\right\\rangle `;
    case 'grad': {
      const op = n.op === 'div' ? '\\cdot ' : n.op === 'curl' ? '\\times ' : '';
      return `\\nabla ${op}${wrapIf(n.arg, !(n.arg.k === 'sym' || n.arg.k === 'call' || (!!n.op && n.arg.k === 'vec')))}`;
    }
    case 'int': {
      const b = n.lo && n.hi ? `_{${L(n.lo)}}^{${L(n.hi)}}` : '';
      return cat(`\\int${b}`, wrapIf(n.arg, loose(n.arg))) + `\\,d${name(n.v)}`;
    }
    case 'at': return `\\left[${L(n.arg)}\\right]_{${name(n.v)}=${L(n.lo)}}^{${L(n.hi)}}`;
    case 'sum': return `\\${n.prod ? 'prod' : 'sum'}_{${name(n.v)}=${L(n.lo)}}^{${L(n.hi)}}${wrapIf(n.arg, loose(n.arg))}`;
    case 'lim': {
      const side = n.side ? `^{${n.side}}` : '';
      const at = n.v.includes(',') && n.to.k === 'vec'
        ? `\\left(${n.v.split(',').map(name).join(',')}\\right)\\to \\left(${n.to.items.map(L).join(',')}\\right)`
        : `${name(n.v)}\\to ${L(n.to)}`;
      return `\\lim_{${at}${side}}${wrapIf(n.arg, loose(n.arg) || n.arg.k === 'lim')}`;
    }
    case 'fn': {
      if (n.name === 'fact') return `${wrapIf(n.arg, !((n.arg.k === 'num' && n.arg.v >= 0) || n.arg.k === 'sym'))}!`;
      if (n.name === 'abs') return `\\left|${L(n.arg)}\\right|`;
      const head = FN_TEXT[n.name] ? `\\${n.name.slice(1)}^{-1}` : `\\${n.name}`;
      return `${head}${n.arg.k === 'fn' && n.arg.name === 'abs' && (n.name === 'ln' || n.name === 'log') ? L(n.arg) : paren(L(n.arg))}`;
    }
  }
}

/* ---------------- LaTeX → text ---------------- */

type Tok = { cmd: string } | { ch: string } | { group: Tok[] };

/** LaTeX as tokens: \commands, braced groups (nested), and single characters */
function lex(src: string): Tok[] {
  let i = 0;
  const read = (close: boolean): Tok[] => {
    const out: Tok[] = [];
    while (i < src.length) {
      const c = src[i];
      if (c === '}') { i++; if (close) return out; continue; }
      if (c === '{') { i++; out.push({ group: read(true) }); continue; }
      if (c === '\\') {
        const m = /^\\(?:[a-zA-Z]+|.)/.exec(src.slice(i))!;
        out.push({ cmd: m[0].slice(1) }); i += m[0].length;
        continue;
      }
      out.push({ ch: c }); i++;
    }
    return out;
  };
  return read(false);
}

const WORDS = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'ln', 'log', 'exp', 'arcsin', 'arccos', 'arctan', 'lim'];
const CMD_TEXT: Record<string, string> = {
  infty: '∞', to: '->', rightarrow: '->', le: '<=', leq: '<=', ge: '>=', geq: '>=', ne: '!=', neq: '!=',
  cdots: ' … ', ldots: ' … ', dots: ' … ', cdot: '*', times: '*', div: '/', partial: '∂', nabla: '∇', int: 'int', iint: 'int int', iiint: 'int int int', sum: 'sum', prod: 'prod',
  langle: '⟨', rangle: '⟩', lt: '<', gt: '>', square: '□', '{': '{', '}': '}', '%': '%', '#': '#',
  ' ': ' ', ',': ' ', ';': ' ', ':': ' ', '!': '', quad: ' ', qquad: ' ',
};

/** the text of a group: an empty one is a slot still to fill, □ */
function slot(ts: Tok[]): string {
  const s = conv(ts).trim();
  return s === '' ? '□' : s;
}

const LEIB_TOP = /^(?:d|∂|d\^2|d[a-zA-Zα-ω]|d\^2[a-zA-Zα-ω])$/;
const LEIB_BOT = /^(?:d[a-zA-Zα-ω](?:\^2)?|∂ ?[a-zA-Zα-ω])$/;

function conv(ts: Tok[]): string {
  let out = '';
  // a word (sin, lim, int) or ∂ glued to a letter after it reads as one word: keep a space
  const push = (s: string) => {
    if (/[a-zA-Z]$/.test(out) && /^[a-zA-Z]/.test(s) && /(?:^|[^a-zA-Z])(?:sin|cos|tan|sec|csc|cot|sinh|cosh|tanh|ln|log|exp|lim|int|sum|prod|arcsin|arccos|arctan)$/.test(out)) out += ' ';
    out += s;
  };
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const group = (k: number): Tok[] => { const g = ts[k]; return g && 'group' in g ? g.group : g ? [g] : []; };
    if ('group' in t) { push(conv(t.group)); continue; }
    if ('ch' in t) {
      // ^ and _ with their group: a power, a subscript, or the bounds of ∫ Σ lim
      if (t.ch === '^' || t.ch === '_') {
        const g = group(i + 1); i++;
        const s = slot(g);
        // ∫ with both bounds empty (as the editor writes one before any are typed) has none
        const nx = ts[i + 1];
        if (t.ch === '_' && s === '□' && /(?:^|[^a-zA-Z])int$/.test(out) && nx && 'ch' in nx && nx.ch === '^' && slot(group(i + 2)) === '□') { i += 2; continue; }
        if (t.ch === '_') { push(`_{${s}}`); continue; }
        // a one-sided limit, x → 0⁺, is a ^{+} on where it goes
        if (s === '+' || s === '-') { push(s); continue; }
        // the bounds of ∫ and Σ stay braced; a power is (…) unless it is one plain thing
        const bounds = /(?:int|sum|prod|_\{[^{}]*\})$/.test(out);
        push(bounds ? `^{${s}}` : /^(?:-?\d+(?:\.\d+)?|[π∞□])$/.test(s) ? `^${s}` : `^(${s})`);
        continue;
      }
      // 3!=y is 3! = y in LaTeX (≠ is \ne)
      push(t.ch === '=' && out.endsWith('!') ? ' =' : t.ch === '−' ? '-' : t.ch);
      continue;
    }
    const c = t.cmd;
    if (c === 'frac' || c === 'dfrac' || c === 'tfrac') {
      const a = slot(group(i + 1)), b = slot(group(i + 2)); i += 2;
      // Leibniz: d/dx, dy/dx, d²y/dx², ∂/∂x stay the notation they are
      if (LEIB_TOP.test(a) && LEIB_BOT.test(b)) { push(` ${a}/${b.replace(" ", "")} `); continue; }
      push(`((${a})/(${b}))`);
      continue;
    }
    if (c === 'binom' || c === 'dbinom' || c === 'tbinom') {
      const a = slot(group(i + 1)), b = slot(group(i + 2)); i += 2;
      push(` C(${a}, ${b}) `);
      continue;
    }
    if (c === 'sqrt') {
      // \sqrt[n]{x}: an nth root
      let idx: string | null = null;
      const nx = ts[i + 1];
      if (nx && 'ch' in nx && nx.ch === '[') {
        let j = i + 2; const inside: Tok[] = [];
        while (j < ts.length && !('ch' in ts[j] && (ts[j] as { ch: string }).ch === ']')) inside.push(ts[j++]);
        idx = slot(inside); i = j;
      }
      const a = slot(group(i + 1)); i++;
      push(idx === null ? `sqrt(${a})` : idx === '3' ? `cbrt(${a})` : `(${a})^(1/(${idx}))`);
      continue;
    }
    if (c === 'left' || c === 'right' || c === 'big' || c === 'Big' || c === 'bigl' || c === 'bigr') {
      // \left( … \right): the delimiter after it is what counts
      const d = ts[i + 1];
      if (d && 'ch' in d) { push(d.ch === '.' ? '' : d.ch); i++; }
      else if (d && 'cmd' in d) { push(d.cmd === 'langle' ? '⟨' : d.cmd === 'rangle' ? '⟩' : d.cmd === 'vert' || d.cmd === 'lvert' || d.cmd === 'rvert' ? '|' : d.cmd === '{' || d.cmd === '}' ? '' : ''); i++; }
      continue;
    }
    if (c === 'operatorname' || c === 'mathrm' || c === 'text' || c === 'mathit' || c === 'rm' || c === 'mathbf') {
      push(conv(group(i + 1)).replace(/\s+/g, '')); i++;
      continue;
    }
    if (c === 'displaystyle' || c === 'limits' || c === 'nolimits' || c === 'textstyle') continue;
    if (FROM_GREEK[c]) { push(FROM_GREEK[c]); continue; }
    if (c === 'varphi') { push('φ'); continue; }
    if (c === 'varepsilon') { push('ε'); continue; }
    if (WORDS.includes(c)) { if (/[a-zA-Z0-9α-ωπ]$/.test(out)) out += ' '; push(c === 'arcsin' || c === 'arccos' || c === 'arctan' ? c.slice(3) + '^-1' : c === 'exp' ? 'e^' : c); continue; }
    if (c in CMD_TEXT) { if (/^[a-z∞∂∇]/.test(CMD_TEXT[c]) && /[a-zA-Z0-9α-ωπ]$/.test(out)) out += ' '; push(CMD_TEXT[c]); continue; }
    // anything else: its name, so the parser can say what it doesn't know
    push(c);
  }
  return out;
}

/** LaTeX as the app's text form (what parse.ts reads) */
export function latexToText(src: string): string {
  let t = conv(lex(src)).replace(/\s+/g, ' ').trim();
  // in an integral, a d-letter run into what is before it is a differential: xydx is xy dx, dydx dy dx
  if (/int/.test(t)) for (let k = 0; k < 3; k++) t = t.replace(/([a-zA-Z0-9α-ω)])(d[a-zA-Zα-ω])(?=$|[^a-zA-Zα-ω(_^])/g, '$1 $2');
  return t;
}

/** LaTeX to an equation (or a lone expression when allowExpr) */
export function fromLatex(src: string, allowExpr = true): Eq {
  return parseEquation(latexToText(src), allowExpr);
}
