// Parses what people type ("7y + 3x = 20", "(x+1)/2 = 3x^2") and pasted LaTeX
// ("\frac{x+1}{2}=3x^{2}") into the tree. Juxtaposition binds tighter than "/",
// like Desmos: 1/2x is 1/(2x).
import { Node, Eq, num, sym, add, mul, neg, frac, pow, sqrt, fn, eq, FnName, Rel, call, FUNC_NAMES, DEFS, deriv, lim, int, at, sum, symbols, partial, grad, vec, varOrder, fieldOp } from './ast';

/** f, g, h, and any function you named (b, then I(t)) read as calls when a bracket follows */
/** a letter this equation defines as a function (I in I(t) = …), while it is being read */
let DEFINING: string | null = null;
const isFnName = (name: string) => FUNC_NAMES.includes(name) || DEFS.has(name) || name === DEFINING;
import { negate, gcd, isNeg } from './terms';

type Tok = ({ t: 'num'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string } | { t: 'cmd'; v: string }) & { space?: boolean };

const FNS = ['sqrt', 'cbrt', 'arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'abs', 'exp', 'ln', 'log'];
/** functions that take a power before their argument: sin^2 x, ln² x */
const POWERED = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'ln', 'log'];
/** Greek letters typed as words (two-letter ones like mu stay letters, so m u is still m·u) */
const GREEK_WORDS = /^(alpha|beta|gamma|delta|theta|lambda|sigma|omega|epsilon|phi|rho|tau)(?![a-zA-Z])/;
/** words people type that aren't functions here yet: say so instead of reading them as letters */
const NOT_YET = /^(floor|ceil|max|min|mod|gcd|lcm|round|sgn|sign)(?![a-zA-Z])/;
const SUPER: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-', '⁺': '+' };
const SUB: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const VULGAR: Record<string, string> = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅙': '1/6', '⅛': '1/8' };

/** what people paste or type that means something plainer: x² is x^2, ½ is (1/2), ** is ^ */
function plain(src: string): string {
  return src
    // LaTeX dressing that changes nothing: \mathrm{d}x is dx, \limits and \displaystyle are looks
    .replace(/\\(?:mathrm|operatorname|text|mathit|rm)\{d\}/g, 'd').replace(/\\(?:limits|nolimits|displaystyle|textstyle)(?![a-zA-Z])/g, '')
    // \frac12 and \frac1x: TeX takes one character each when there are no braces
    .replace(/\\[dt]?frac\s*([0-9a-zA-Z])\s*([0-9a-zA-Z])/g, '\\frac{$1}{$2}')
    // superscripts with a digit (x², x⁻¹), but not a lone ⁺ or ⁻, which is a side of a limit
    .replace(/[⁻⁺]?[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, m => `^{${[...m].map(c => SUPER[c]).join('')}}`)
    .replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, m => `_{${[...m].map(c => SUB[c]).join('')}}`)
    .replace(/[½⅓⅔¼¾⅕⅙⅛]/g, m => `(${VULGAR[m]})`)
    .replace(/∛/g, 'cbrt').replace(/∜/g, '\\sqrt[4]')
    .replace(/\*\*/g, '^').replace(/[–—]/g, '-').replace(/∗/g, '*')
    // <1, 2, 3> is the vector ⟨1, 2, 3⟩ (a comma inside, so never a less-than), as is \langle … \rangle
    .replace(/\\langle\s*/g, '⟨').replace(/\s*\\rangle/g, '⟩')
    .replace(/<([^<>=]*,[^<>=]*)>/g, '⟨$1⟩')
    .replace(/=</g, '≤').replace(/=>/g, '≥');
}

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π',
  sigma: 'σ', phi: 'φ', omega: 'ω', tau: 'τ', rho: 'ρ', epsilon: 'ε',
};

function tokenize(src: string): Tok[] {
  const s = plain(src);
  const out: Tok[] = [];
  let i = 0;
  // integrals still waiting for their dx
  let open = 0;
  const noInt = !/int|∫|∬|∭/.test(s);
  while (i < s.length) {
    const c = s[i];
    // a space after a token is remembered: 4/3 π r³ reads as (4/3)·π r³
    if (/\s/.test(c)) { const last = out[out.length - 1]; if (last) last.space = true; i++; continue; }
    // calculus: d/dx, d²/dx², dy/dx (= y′), \frac{d}{dx}, lim, →, ∞
    const rest = s.slice(i), prevLetter = i > 0 && /[a-zA-Zα-ω]/.test(s[i - 1]);
    const cal = prevLetter ? null
      : /^(?:d\/d|\\frac\{d\}\{d)([a-zA-Zα-ω])\}?/.exec(rest) ?? /^(?:d\^2\/d|d²\/d|\\frac\{d\^\{?2\}?\}\{d)([a-zA-Zα-ω])(?:\^\{?2\}?|²)\}?/.exec(rest);
    if (cal) { out.push({ t: 'cmd', v: `${/2|²/.test(cal[0]) ? 'deriv2' : 'deriv'}:${cal[1]}` }); i += cal[0].length; continue; }
    const par = /^(?:∂\/∂|\\frac\{\\partial\}\{\\partial ?)([a-zA-Zα-ω])\}?/.exec(rest);
    if (par) { out.push({ t: 'cmd', v: `pderiv:${par[1]}` }); i += par[0].length; continue; }
    // ∇· and ∇× (or div, curl) before plain ∇
    const vop = /^(?:(?:∇|\\nabla) ?(?:·|\\cdot|\*)|div(?![a-zA-Z]))/.exec(rest) ?? null;
    const cop = /^(?:(?:∇|\\nabla) ?(?:×|\\times)|curl(?![a-zA-Z]))/.exec(rest) ?? null;
    if ((vop || cop) && (!prevLetter || /^[∇\\]/.test(rest))) { out.push({ t: 'cmd', v: vop ? 'div' : 'curl' }); i += (vop ?? cop)![0].length; continue; }
    const nab = /^(?:∇|\\nabla(?![a-zA-Z])|grad(?![a-zA-Z]))/.exec(rest);
    if (nab && (nab[0] === '∇' || !prevLetter)) { out.push({ t: 'cmd', v: 'grad' }); i += nab[0].length; continue; }
    if (c === '⟨' || c === '⟩' || c === ',') { out.push({ t: 'op', v: c }); i++; continue; }
    // □: a hole the live preview puts where something is still to come
    if (c === '□') { out.push({ t: 'id', v: '□' }); i++; continue; }
    // d²y/dx² (or d^2y/dx^2, \frac{d^2y}{dx^2}): the second derivative, before d² could read as d squared
    const leib2 = prevLetter ? null : /^(?:d(?:\^\{?2\}?|²) ?([a-zA-Z]) ?\/ ?d([a-zA-Z])(?:\^\{?2\}?|²)|\\frac\{d(?:\^\{?2\}?|²) ?([a-zA-Z])\}\{d([a-zA-Z])(?:\^\{?2\}?|²)\})(?![a-zA-Z0-9])/.exec(rest);
    if (leib2) { out.push({ t: 'id', v: `leib2:${leib2[1] ?? leib2[3]}:${leib2[2] ?? leib2[4]}` }); i += leib2[0].length; continue; }
    const leib = prevLetter ? null : /^(?:d([a-zA-Z])\/d([a-zA-Z])|\\frac\{d([a-zA-Z])\}\{d([a-zA-Z])\})(?![a-zA-Z])/.exec(rest);
    // dy/dx stays dy/dx (a fraction of two differentials); the methods read it as y′
    if (leib) { out.push({ t: 'id', v: `leib:${leib[1] ?? leib[3]}:${leib[2] ?? leib[4]}` }); i += leib[0].length; continue; }
    // dy = x y dx: outside an integral, d and one letter on its own is a differential
    const diff = noInt && !prevLetter ? /^d([a-zA-Zα-ω])(?![a-zA-Zα-ω0-9(′'_])/.exec(rest) : null;
    if (diff) { out.push({ t: 'id', v: 'd' + diff[1] }); i += 2; continue; }
    // integral signs stack, even typed together: intint, \int\int, ∫∫, iint, ∬, \iiint
    const stacking = /^(?:[∫∬∭\\])/.test(rest) || /(?:int|integral|∫|\^pi|\^[a-zA-Zα-ω])$/.test(s.slice(0, i));
    const big = prevLetter && !stacking ? null : /^(?:[∫∬∭]|\\i{0,2}int(?:(?![a-zA-Z])|(?=i{0,2}int))|integral(?:(?![a-zA-Z])|(?=i{0,2}int))|i{0,2}int(?:(?![a-zA-Z])|(?=i{0,2}int))|Σ|∑|\\sum(?![a-zA-Z])|sum(?![a-zA-Z])|∏|Π|\\prod(?![a-zA-Z])|prod(?![a-zA-Z]))/.exec(rest);
    if (big) {
      const isInt = /[∫∬∭]|int/.test(big[0]);
      const many = big[0] === '∬' ? 2 : big[0] === '∭' ? 3 : isInt ? 1 + (/^\\?(i*)int/.exec(big[0])?.[1].length ?? 0) : 1;
      for (let k = 0; k < many; k++) out.push({ t: 'cmd', v: isInt ? 'int' : /∏|Π|prod/.test(big[0]) ? 'prod' : 'sum' });
      if (isInt) open += many;
      i += big[0].length;
      if (s[i] === '_') { out.push({ t: 'op', v: '_' }); i++; }
      continue;
    }
    // the dx that closes an integral
    // (dxdy and xdx too, and a dx past the last ∫ is one more integral: ∫ f dy dx is ∫∫ f dy dx)
    const lastD = out.length > 0 && out[out.length - 1].t === 'op' && /^d\+?:/.test(out[out.length - 1].v);
    const dx = open > 0 || lastD ? /^d([a-zA-Zα-ω□])(?:(?![a-zA-Zα-ω(])|(?=(?:d[a-zA-Zα-ω□])+(?![a-zA-Zα-ω(])))/.exec(rest) : null;
    if (dx && (!prevLetter || lastD || /^.{2}(?:\s|$|[)=+\-<>≤≥,\\]|(?:d[a-zA-Zα-ω])+(?![a-zA-Zα-ω(]))/.test(rest))) {
      out.push({ t: 'op', v: (open > 0 ? 'd:' : 'd+:') + dx[1] });
      open = Math.max(0, open - 1); i += dx[0].length; continue;
    }
    if (c === '_' && s[i - 1] === ']') { out.push({ t: 'op', v: '_' }); i++; continue; }
    if (/^\\?lim(?![a-zA-Z])/.test(rest)) { out.push({ t: 'cmd', v: 'lim' }); i += rest[0] === '\\' ? 4 : 3; if (s[i] === '_') i++; continue; }
    const arrow = /^(?:->|→|\\to(?![a-zA-Z])|\\rightarrow)/.exec(rest);
    if (arrow) { out.push({ t: 'op', v: '→' }); i += arrow[0].length; continue; }
    const inf = prevLetter ? null : /^(?:∞|\\infty|infinity|inf(?![a-zA-Z]))/.exec(rest);
    if (inf) { out.push({ t: 'id', v: '∞' }); i += inf[0].length; continue; }
    if (c === '⁺' || c === '⁻') { out.push({ t: 'op', v: c }); i++; continue; }
    // a one-sided limit in LaTeX: 0^+ or 0^{-} (but not x^-1)
    const sideMark = /^\^(?:\{([+-])\}|([+-]))(?=\s*[})]|\s|$)/.exec(rest);
    if (sideMark) { out.push({ t: 'op', v: (sideMark[1] ?? sideMark[2]) === '+' ? '⁺' : '⁻' }); i += sideMark[0].length; continue; }
    // and typed plainly: lim x->0+ 1/x (the sign stuck to where x goes, then a space)
    if ((c === '+' || c === '-') && /(?:->|→)\s*-?[\w∞.]+$/.test(s.slice(0, i)) && /^\s/.test(s.slice(i + 1, i + 2))) { out.push({ t: 'op', v: c === '+' ? '⁺' : '⁻' }); i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j++;
      out.push({ t: 'num', v: s.slice(i, j) }); i = j; continue;
    }
    if (c === '\\') {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++;
      const name = s.slice(i + 1, j);
      // \sin, \log: the same as typing the word (so \sin^2 x and \log_2 x work too)
      if (FNS.includes(name)) { i++; continue; }
      i = j === i + 1 ? i + 2 : j; // "\," "\;" etc. are spacing
      if (!name || name === 'left' || name === 'right') continue;
      if (name === 'cdot' || name === 'times') out.push({ t: 'op', v: '*' });
      else if (name === 'le' || name === 'leq') out.push({ t: 'op', v: '≤' });
      else if (name === 'ge' || name === 'geq') out.push({ t: 'op', v: '≥' });
      else if (name === 'lt' || name === 'gt') out.push({ t: 'op', v: name === 'lt' ? '<' : '>' });
      else if (name === 'lvert' || name === 'rvert' || name === 'vert') out.push({ t: 'op', v: '|' });
      else if (name === 'div') out.push({ t: 'op', v: '/' });
      else if (GREEK[name]) out.push({ t: 'id', v: GREEK[name] });
      else out.push({ t: 'cmd', v: name });
      continue;
    }
    if (c === '≠' || (c === '!' && s[i + 1] === '=')) throw new ParseError('“≠” isn\'t something I can solve yet. Solve the “=” version, then leave that answer out.', true);
    const nope = prevLetter ? null : NOT_YET.exec(rest);
    if (nope) throw new ParseError(`${nope[1]} isn't built in yet.`, true);
    const word = FNS.find(f => s.startsWith(f, i));
    if (word) {
      i += word.length;
      // sin⁻¹, sin^-1 and sin^(-1) are the inverse, like arcsin
      const inv = ['sin', 'cos', 'tan'].includes(word) ? /^(?:⁻¹|\^-1|\^\(-1\)|\^\{-1\})/.exec(s.slice(i)) : null;
      if (inv) i += inv[0].length;
      // sin^2 x is (sin x)^2
      const sq = !inv && POWERED.includes(word) ? /^\^(?:\{(\d+)\}|(\d+))/.exec(s.slice(i)) : null;
      if (sq) i += sq[0].length;
      out.push({ t: 'cmd', v: inv ? 'a' + word : sq ? `${word}^${sq[1] ?? sq[2]}` : word });
      // log_2 x: the base
      if (word === 'log' && s[i] === '_') { out.push({ t: 'op', v: '_' }); i++; }
      // log2(x) and log10 x, as in code: the digits straight after log are the base
      else if (word === 'log' && !sq && /^\d+(?=[\s(a-zA-Z])/.test(s.slice(i))) out.push({ t: 'op', v: '_' });
      continue;
    }
    const greek = prevLetter ? null : GREEK_WORDS.exec(rest);
    if (greek) { out.push({ t: 'id', v: GREEK[greek[1]] }); i += greek[1].length; continue; }
    // 50% is 50/100
    if (c === '%') { out.push({ t: 'op', v: '/' }, { t: 'num', v: '100' }); i++; continue; }
    if (s.startsWith('pi', i)) { out.push({ t: 'id', v: 'π' }); i += 2; continue; }
    if (/[a-zA-Zα-ω]/.test(c)) {
      // a subscript makes a new name: x_1, v_0, x_12, a_n, x_{max}
      // (and like Desmos, digits straight after a letter: x1 is x_1, but 2e3 stays 2e·3)
      const sub = /^_(?:\{([a-zA-Z0-9]+)\}|([0-9]+|[a-zA-Z]))/.exec(s.slice(i + 1)) ?? (c !== 'e' && !/[0-9.]/.test(s[i - 1] ?? '') ? /^()([0-9]+)(?![0-9.])/.exec(s.slice(i + 1)) : null);
      let name = sub ? `${c}_${sub[1] || sub[2]}` : c;
      i += sub ? 1 + sub[0].length : 1;
      // primes: y′, f'(x), y''
      while (s[i] === "'" || s[i] === '′' || s[i] === '″') { name += s[i] === '″' ? '′′' : '′'; i++; }
      out.push({ t: 'id', v: name.replace(/′′/g, '″').replace(/″′/g, '‴') }); continue;
    }
    if ((c === '<' || c === '>') && s[i + 1] === '=') { out.push({ t: 'op', v: c === '<' ? '≤' : '≥' }); i += 2; continue; }
    const map: Record<string, string> = { '−': '-', '×': '*', '·': '*', '÷': '/', '√': 'sqrt', '⩽': '≤', '⩾': '≥' };
    const v = map[c] ?? c;
    if (v === 'sqrt') out.push({ t: 'cmd', v });
    else if ('+-*/^=(){}[]|<>≤≥!'.includes(v)) out.push({ t: 'op', v });
    else throw new ParseError(`I don't know the symbol “${c}”.`);
    i++;
  }
  return out;
}

/** `sure`: no amount of further typing fixes it, so it can show while you type */
export class ParseError extends Error { constructor(message: string, public sure = false) { super(message); } }

class Parser {
  i = 0;
  abs = 0;
  constructor(readonly toks: Tok[], readonly greedyBars = false) {}
  peek() { return this.toks[this.i]; }
  isOp(v: string) { const t = this.peek(); return !!t && t.t === 'op' && t.v === v; }
  eat(v: string) {
    if (!this.isOp(v)) throw new ParseError(this.peek() ? `Expected “${v}”.` : `Unfinished: expected “${v}”.`);
    this.i++;
  }

  expr(): Node {
    const terms: Node[] = [this.term()];
    while (this.isOp('+') || this.isOp('-')) {
      const minus = this.peek()!.v === '-';
      this.i++;
      const t = this.term();
      // x − (y + 1) stays as typed: a group taken away keeps its brackets
      terms.push(minus ? (t.k === 'add' ? neg(t) : negate(t)) : t);
    }
    return terms.length === 1 ? terms[0] : add(terms);
  }

  term(): Node {
    let left = this.signed();
    while (this.isOp('*') || this.isOp('/')) {
      const op = this.peek()!.v; this.i++;
      // a number on the bottom with a space after it is the whole bottom: 1/2 x is x/2, 4/3 π r³
      const n = this.peek();
      const after = this.toks[this.i + 1];
      if (op === '/' && n?.t === 'num' && n.space && after && (after.t !== 'op' || after.v === '(')) {
        const bottom = this.atom();
        const fs: Node[] = [frac(left, bottom)];
        while (this.startsAtom()) fs.push(this.power());
        left = mulOf(fs);
        continue;
      }
      const right = this.signed();
      left = op === '/' ? frac(left, right) : mulOf([left, right]);
    }
    // −x·y is −(xy), the same as −xy
    const f0 = left.k === 'mul' ? left.factors[0] : null;
    if (left.k === 'mul' && f0?.k === 'frac' && isNeg(f0.num)) return negate(mulOf([negate(f0), ...left.factors.slice(1)]));
    return left;
  }

  signed(): Node {
    if (this.isOp('-')) { this.i++; const t = this.signed(); return t.k === 'add' ? neg(t) : negate(t); }
    if (this.isOp('+')) { this.i++; return this.signed(); }
    return this.group();
  }

  startsAtom() {
    const t = this.peek();
    if (!t) return false;
    if (t.t === 'num' || t.t === 'id' || t.t === 'cmd') return true;
    return t.t === 'op' && (t.v === '(' || t.v === '{' || t.v === '[' || t.v === '⟨' || (t.v === '|' && this.abs === 0));
  }

  group(): Node {
    const fs: Node[] = [this.power()];
    for (;;) {
      if (this.startsAtom()) { fs.push(this.power()); continue; }
      // inside |…|, a bar followed by something may open another: |2|x|| is |2·|x||.
      // Try it; if it doesn't close, the bar was the end of the outer one after all
      const next = this.toks[this.i + 1];
      if (this.greedyBars && this.abs > 0 && this.isOp('|') && next && (next.t !== 'op' || '({[⟨-'.includes(next.v))) {
        const at = this.i, depth = this.abs;
        try { this.abs = 0; fs.push(this.power()); this.abs = depth; continue; } catch { this.i = at; this.abs = depth; }
      }
      return mulOf(fs);
    }
  }

  power(): Node {
    let base = this.atom();
    while (this.isOp('!')) { this.i++; base = fn('fact', base); }
    if (this.isOp('^')) { this.i++; return pow(base, this.exponent()); }
    return base;
  }

  /** what follows ^: a signed atom, and powers stack to the right (e^x^2 is e^(x^2)) */
  exponent(): Node {
    if (this.isOp('-')) { this.i++; return negate(this.exponent()); }
    if (this.isOp('+')) { this.i++; return this.exponent(); }
    let b = this.atom();
    while (this.isOp('!')) { this.i++; b = fn('fact', b); }
    if (this.isOp('^')) { this.i++; return pow(b, this.exponent()); }
    return b;
  }

  atom(): Node {
    const t = this.peek();
    if (!t) throw new ParseError('Unfinished expression.');
    this.i++;
    if (t.t === 'num') return number(t.v);
    if (t.t === 'id') {
      if (t.v.startsWith('leib2:')) { const [, y, x] = t.v.split(':'); return frac(sym('d²' + y), pow(sym('d' + x), num(2))); }
      if (t.v.startsWith('leib:')) { const [, y, x] = t.v.split(':'); return frac(sym('d' + y), sym('d' + x)); }
      if (isFnName(t.v.replace(/[′″‴]+$/, '')) && this.isOp('(')) { this.i++; const a = this.expr(); this.eat(')'); return call(t.v, a); }
      return sym(t.v);
    }
    if (t.t === 'cmd') {
      if (t.v.startsWith('pderiv')) return partial(t.v.slice(7), this.term());
      if (t.v === 'grad') { const a = this.fnArg(); return grad(a, varOrder(symbols(a))); }
      if (t.v === 'div' || t.v === 'curl') return fieldOp(t.v, this.isOp('(') || this.isOp('⟨') ? this.atom() : this.fnArg());
      if (t.v.startsWith('deriv')) {
        const v = t.v.slice(t.v.indexOf(':') + 1), a = this.term();
        return t.v.startsWith('deriv2') ? deriv(v, deriv(v, a)) : deriv(v, a);
      }
      if (t.v === 'lim') return this.limit();
      if (t.v === 'int') return this.integral();
      if (t.v === 'sum' || t.v === 'prod') return this.series(t.v === 'prod');
      if (t.v === 'frac' || t.v === 'dfrac' || t.v === 'tfrac') {
        const a = this.braced(), b = this.braced();
        return frac(a, b);
      }
      if (t.v === 'sqrt') {
        if (this.isOp('[')) { this.i++; const k = this.expr(); this.eat(']'); return pow(this.fnArg(), frac(num(1), k)); }
        return sqrt(this.fnArg());
      }
      if (t.v === 'cbrt') return pow(this.fnArg(), frac(num(1), num(3)));
      if (t.v === 'exp') return pow(sym('e'), this.fnArg());
      if (t.v.startsWith('arc')) return fn(('a' + t.v.slice(3)) as FnName, this.fnArg());
      // sin^2 x
      const sq = /^(\w+)\^(\d+)$/.exec(t.v);
      if (sq) return pow(this.named(sq[1]), num(Number(sq[2])));
      return this.named(t.v);
    }
    if (t.v === '|') {
      const outer = this.abs;
      this.abs = outer + 1;
      const e = this.expr();
      this.abs = outer;
      this.eat('|');
      return fn('abs', e);
    }
    const close = ({ '(': ')', '{': '}', '[': ']', '⟨': '⟩' } as Record<string, string>)[t.v];
    if (close) {
      const outer = this.abs; this.abs = 0; const e = this.expr();
      // a comma makes it a vector: ⟨1, 2⟩, (1, 2), [1, 2]
      if (this.isOp(',') || t.v === '⟨') {
        const items = [e];
        while (this.isOp(',')) { this.i++; items.push(this.expr()); }
        this.abs = outer; this.eat(close);
        return vec(items);
      }
      this.abs = outer; this.eat(close);
      // [F]_a^b: what F is worth between two bounds
      if (t.v === '[' && this.isOp('_')) { this.i++; const b = this.bound(); this.eat('^'); const hi = this.bound(); return at(b.v ?? onlyVar(e), e, b.at, hi.at); }
      return e;
    }
    throw new ParseError(`Unexpected “${t.v}”.`);
  }

  /** a function by name, with its argument: sin x, log_2 8, and the ones written with others */
  named(name: string): Node {
    if (['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln'].includes(name)) return fn(name as FnName, this.wideArg());
    if (name === 'abs') return fn('abs', this.fnArg());
    if (name === 'log') {
      // log_b x is ln x / ln b (log_10 is log, log_e is ln)
      if (!this.isOp('_')) return fn('log', this.wideArg());
      this.i++;
      const b = this.bound().at, a = this.wideArg();
      if (b.k === 'num' && b.v === 10) return fn('log', a);
      if (b.k === 'sym' && b.name === 'e') return fn('ln', a);
      return frac(fn('ln', a), fn('ln', b));
    }
    // sec, csc and cot are one over cos, sin and tan; sinh, cosh, tanh are made of eˣ
    if (name === 'sec' || name === 'csc' || name === 'cot') return frac(num(1), fn(({ sec: 'cos', csc: 'sin', cot: 'tan' } as Record<string, FnName>)[name], this.wideArg()));
    if (name === 'sinh' || name === 'cosh' || name === 'tanh') {
      const a = this.wideArg(), ep = () => pow(sym('e'), a), em = () => pow(sym('e'), negate(a));
      if (name === 'tanh') return frac(add([ep(), negate(em())]), add([ep(), em()]));
      return frac(name === 'sinh' ? add([ep(), negate(em())]) : add([ep(), em()]), num(2));
    }
    throw new ParseError(`\\${name} isn't supported yet.`);
  }

  /** lim x→a f, lim_{x→a} f, lim_(x→0+) f: the variable, where it goes, from which side, then f */
  limit(): Node {
    // (x, y) → (a, b): two letters at once, in or out of braces
    const pair = (j: number) => this.toks[j]?.v === '(' && this.toks[j + 1]?.t === 'id' && this.toks[j + 2]?.v === ',' && this.toks[j + 3]?.t === 'id' && this.toks[j + 4]?.v === ')';
    const brace = this.isOp('{') ? '{' : null;
    if (pair(this.i + (brace ? 1 : 0))) {
      if (brace) this.i++;
      const vs = [this.toks[this.i + 1].v, this.toks[this.i + 3].v];
      this.i += 5;
      this.eat('→');
      const to = this.atom();
      if (to.k !== 'vec' || to.items.length !== 2) throw new ParseError('Write where (x, y) goes as a point, like (0, 0).');
      if (brace) this.eat('}');
      if (!this.peek()) throw new ParseError('Unfinished: what is the limit of?');
      return lim(vs.join(','), to, this.term());
    }
    const open = this.isOp('{') || this.isOp('(') ? this.peek()!.v : null;
    if (open) this.i++;
    const v = this.peek();
    if (!v || v.t !== 'id') throw new ParseError('Write the limit like lim x→0 (…).');
    this.i++;
    this.eat('→');
    const minus = this.isOp('-') ? (this.i++, true) : false;
    let to = open ? this.term() : this.power();
    if (minus) to = negate(to);
    let side: '+' | '-' | undefined;
    if (this.isOp('⁺') || this.isOp('⁻')) { side = this.peek()!.v === '⁺' ? '+' : '-'; this.i++; }
    else if (open && (this.isOp('+') || this.isOp('-'))) { side = this.peek()!.v as '+' | '-'; this.i++; }
    if (open) this.eat(open === '{' ? '}' : ')');
    if (!this.peek()) throw new ParseError('Unfinished: what is the limit of?');
    return lim(v.v, to, this.term(), side);
  }

  /** a bound after _ or ^: a single piece (0, -1, ∞, π) or anything in braces; "n = 1" names the variable */
  bound(): { v?: string; at: Node } {
    const open = this.isOp('{') || this.isOp('(') ? this.peek()!.v : null;
    if (!open) {
      const minus = this.isOp('-') ? (this.i++, true) : false;
      const a = this.atom();
      return { at: minus ? negate(a) : a };
    }
    this.i++;
    let v: string | undefined;
    const t = this.peek(), next = this.toks[this.i + 1];
    if (t?.t === 'id' && next?.t === 'op' && next.v === '=') { v = t.v; this.i += 2; }
    const at = this.expr();
    this.eat(open === '{' ? '}' : ')');
    return { v, at };
  }

  /** ∫ f dx, ∫_a^b f dx */
  integral(): Node {
    let lo: Node | undefined, hi: Node | undefined;
    if (this.isOp('_')) { this.i++; lo = this.bound().at; this.eat('^'); hi = this.bound().at; }
    const isD = (t?: Tok) => !!t && t.t === 'op' && t.v.startsWith('d:');
    let r: Node;
    if (isD(this.peek())) {
      // ∫ dx is ∫ 1 dx, and ∫ dx/x is ∫ 1/x dx
      const v = this.peek()!.v.slice(2); this.i++;
      r = int(v, this.isOp('/') ? (this.i++, frac(num(1), this.signed())) : num(1), lo, hi);
    } else {
      const f = this.expr();
      const d = this.peek();
      if (!isD(d)) throw new ParseError(this.toks.some(t => t.t === 'op' && /^d\+?:[AVS]$/.test(t.v)) ? 'Write dA as dx dy (and dV as dx dy dz), so each ∫ has its own d.' : 'Finish the integral with dx (or dt, du…).');
      this.i++;
      r = int(d!.v.slice(2), f, lo, hi);
    }
    // ∫_0^x … dx: the bound can't be the variable that runs between the bounds
    if (r.k === 'int' && r.lo && r.hi && symbols(add([r.lo, r.hi])).includes(r.v)) throw new ParseError(`A bound of the ∫ … d${r.v} can't use ${r.v} itself: the inner integral needs another letter, like ∫_0^${r.v} f(t) dt.`);
    // more d's than ∫ signs: each one is an integral around this one
    while (this.peek()?.t === 'op' && this.peek()!.v.startsWith('d+:')) { r = int(this.peek()!.v.slice(3), r); this.i++; }
    return r;
  }

  /** Σ_{n=1}^∞ f, or ∏ */
  series(prod = false): Node {
    if (!this.isOp('_')) throw new ParseError(prod ? 'Write a product like prod_{k=1}^5 k.' : 'Write a sum like sum_{n=1}^∞ 1/n^2.');
    this.i++;
    const b = this.bound();
    this.eat('^');
    const hi = this.bound().at;
    if (!this.peek()) throw new ParseError(prod ? 'Unfinished: what is being multiplied?' : 'Unfinished: what is being added up?');
    return sum(b.v ?? 'n', b.at, hi, this.term(), undefined, prod);
  }

  /** argument of a function: braced/parenthesised, or the next power like "ln x²" */
  fnArg(): Node {
    if (this.isOp('{') || this.isOp('(')) return this.braced();
    return this.power();
  }

  /** the argument of sin, ln and the like, which reaches a little further than √'s */
  wideArg(): Node {
    if (this.isOp('{') || this.isOp('(')) return this.braced();
    const first = this.power();
    // sin 2x is sin(2x): a number takes the letters written straight after it (sin x cos x stays two)
    if (first.k !== 'num' && !(first.k === 'frac' && first.num.k === 'num')) return first;
    const fs: Node[] = [first];
    while (this.peek()?.t === 'id' && !isFnName(this.peek()!.v)) fs.push(this.power());
    return mulOf(fs);
  }

  braced(): Node {
    const open = this.peek();
    if (open?.t === 'op' && (open.v === '{' || open.v === '(')) {
      this.i++;
      const e = this.expr();
      this.eat(open.v === '{' ? '}' : ')');
      return e;
    }
    return this.atom();
  }
}

function number(s: string): Node {
  if (!/^\d*\.?\d*$/.test(s) || s === '.') throw new ParseError(`“${s}” isn't a number.`);
  const [a, b = ''] = s.split('.');
  if (!b) return num(parseInt(a, 10));
  const d = 10 ** b.length, n = parseInt(a + b, 10), g = gcd(n, d);
  return d / g === 1 ? num(n / g) : frac(num(n / g), num(d / g));
}

function onlyVar(e: Node): string {
  const vs = symbols(e);
  return vs.includes('x') ? 'x' : vs[0] ?? 'x';
}

function mulOf(fs: Node[]): Node {
  const flat = fs.flatMap(f => (f.k === 'mul' ? f.factors : [f]));
  // −x·y is −(xy), the same as −xy
  if (flat.length > 1 && flat[0].k === 'neg') return negate(mulOf([flat[0].arg, ...flat.slice(1)]));
  return flat.length === 1 ? flat[0] : mul(flat);
}

/** read it the plain way; if that fails, once more letting a bar inside |…| open another (|2|x||) */
function twice<T>(read: (greedyBars: boolean) => T): T {
  try { return read(false); } catch (e) {
    if (!(e instanceof ParseError)) throw e;
    try { return read(true); } catch { throw e; }
  }
}

export function parseExpr(src: string): Node {
  const toks = tokenize(src);
  return twice(greedy => {
    const p = new Parser(toks, greedy);
    if (!p.peek()) throw new ParseError('Empty.');
    const e = p.expr();
    if (p.peek()) throw new ParseError(`Unexpected “${(p.peek() as Tok).v}”.`);
    return e;
  });
}

const RELS = ['=', '<', '>', '≤', '≥'];

/** An equation, an inequality, or (with `allowExpr`) a lone expression. */
export function parseEquation(src: string, allowExpr = false): Eq {
  // F(t) = … with t on the right defines F, whatever letter F is (I(t) = ∫₀¹ … dx), not F·t
  const dm = /^\s*([A-Za-zα-ωΑ-Ω])\s*\(\s*([A-Za-zα-ω])\s*\)\s*:?=([^=<>≤≥]*)$/.exec(src);
  if (dm && !DEFINING && dm[1] !== dm[2] && dm[1] !== 'e' && new RegExp(`(^|[^A-Za-z])${dm[2]}([^A-Za-z]|$)`).test(dm[3])) {
    DEFINING = dm[1];
    try { return parseEquation(src.replace(/:=/, '='), allowExpr); } finally { DEFINING = null; }
  }
  const toks = tokenize(src);
  let depth = 0;
  const rels = toks.filter(t => {
    if (t.t === 'op' && '({['.includes(t.v)) depth++;
    if (t.t === 'op' && ')}]'.includes(t.v)) depth--;
    return depth === 0 && t.t === 'op' && RELS.includes(t.v);
  });
  if (rels.length === 0) {
    if (!allowExpr) throw new ParseError('Add an “=” to make it an equation.');
    return eq(parseExpr(src), num(0), 'expr');
  }
  if (rels.length > 1) {
    const ineq = rels.every(r => r.v !== '=');
    throw new ParseError(ineq ? 'One inequality at a time: type 2 < x and x < 5 as two (n adds another).' : 'Only one “=” for now: n adds another equation.', true);
  }
  const rel = rels[0].v as Rel;
  const [lhs, rhs] = twice(greedy => {
    const p = new Parser(toks, greedy);
    if (p.isOp(rel)) throw new ParseError('The left side is empty.');
    const l = p.expr();
    p.eat(rel);
    if (!p.peek()) throw new ParseError('The right side is empty.');
    const r = p.expr();
    if (p.peek()) throw new ParseError(`Unexpected “${(p.peek() as Tok).v}”.`);
    return [l, r];
  });
  // f(x) = … defines f
  if (rel === '=' && lhs.k === 'call' && lhs.arg.k === 'sym') return eq(lhs, rhs, 'def');
  return eq(lhs, rhs, rel);
}
