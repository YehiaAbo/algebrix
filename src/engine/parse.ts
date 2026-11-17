// Parses what people type ("7y + 3x = 20", "(x+1)/2 = 3x^2") and pasted LaTeX
// ("\frac{x+1}{2}=3x^{2}") into the tree. Juxtaposition binds tighter than "/",
// like Desmos: 1/2x is 1/(2x).
import { Node, Eq, num, sym, add, mul, frac, pow, sqrt, fn, eq, FnName, Rel, call, FUNC_NAMES, deriv, lim, primed, int, at, sum, symbols, partial, grad, vec, varOrder, fieldOp } from './ast';
import { negate, gcd } from './terms';

type Tok = { t: 'num'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string } | { t: 'cmd'; v: string };

const FNS = ['sqrt', 'cbrt', 'arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan', 'sin', 'cos', 'tan', 'abs', 'exp', 'ln', 'log'];

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π',
  sigma: 'σ', phi: 'φ', omega: 'ω', tau: 'τ', rho: 'ρ', epsilon: 'ε',
};

function tokenize(src: string): Tok[] {
  // LaTeX dressing that changes nothing: \mathrm{d}x is dx, \limits and \displaystyle are looks
  const s = src.replace(/\\(?:mathrm|operatorname|text|mathit|rm)\{d\}/g, 'd').replace(/\\(?:limits|nolimits|displaystyle|textstyle)(?![a-zA-Z])/g, '');
  const out: Tok[] = [];
  let i = 0;
  // integrals still waiting for their dx
  let open = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
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
    const leib = prevLetter ? null : /^(?:d([a-zA-Z])\/d([a-zA-Z])|\\frac\{d([a-zA-Z])\}\{d([a-zA-Z])\})(?![a-zA-Z])/.exec(rest);
    if (leib) { out.push({ t: 'id', v: primed(leib[1] ?? leib[3]) }); i += leib[0].length; continue; }
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
    const word = FNS.find(f => s.startsWith(f, i));
    if (word) {
      i += word.length;
      // sin⁻¹, sin^-1 and sin^(-1) are the inverse, like arcsin
      const inv = ['sin', 'cos', 'tan'].includes(word) ? /^(?:⁻¹|\^-1|\^\(-1\)|\^\{-1\})/.exec(s.slice(i)) : null;
      if (inv) i += inv[0].length;
      out.push({ t: 'cmd', v: inv ? 'a' + word : word });
      continue;
    }
    if (s.startsWith('pi', i)) { out.push({ t: 'id', v: 'π' }); i += 2; continue; }
    if (/[a-zA-Zα-ω]/.test(c)) {
      // a subscript makes a new name: x_1, v_0, x_12, a_n, x_{max}
      const sub = /^_(?:\{([a-zA-Z0-9]+)\}|([0-9]+|[a-zA-Z]))/.exec(s.slice(i + 1));
      let name = sub ? `${c}_${sub[1] ?? sub[2]}` : c;
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

export class ParseError extends Error {}

class Parser {
  i = 0;
  abs = 0;
  constructor(readonly toks: Tok[]) {}
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
      terms.push(minus ? negate(t) : t);
    }
    return terms.length === 1 ? terms[0] : add(terms);
  }

  term(): Node {
    let left = this.signed();
    while (this.isOp('*') || this.isOp('/')) {
      const op = this.peek()!.v; this.i++;
      const right = this.signed();
      left = op === '/' ? frac(left, right) : mulOf([left, right]);
    }
    return left;
  }

  signed(): Node {
    if (this.isOp('-')) { this.i++; return negate(this.signed()); }
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
    while (this.startsAtom()) fs.push(this.power());
    return mulOf(fs);
  }

  power(): Node {
    let base = this.atom();
    while (this.isOp('!')) { this.i++; base = fn('fact', base); }
    if (this.isOp('^')) {
      this.i++;
      const e = this.isOp('-') ? (this.i++, negate(this.atom())) : this.atom();
      return pow(base, e);
    }
    return base;
  }

  atom(): Node {
    const t = this.peek();
    if (!t) throw new ParseError('Unfinished expression.');
    this.i++;
    if (t.t === 'num') return number(t.v);
    if (t.t === 'id') {
      if (FUNC_NAMES.includes(t.v.replace(/[′″‴]+$/, '')) && this.isOp('(')) { this.i++; const a = this.expr(); this.eat(')'); return call(t.v, a); }
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
      if (['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'ln', 'log', 'abs'].includes(t.v)) return fn(t.v as FnName, this.fnArg());
      throw new ParseError(`\\${t.v} isn't supported yet.`);
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

  /** lim x→a f, lim_{x→a} f, lim_(x→0+) f: the variable, where it goes, from which side, then f */
  limit(): Node {
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
  return flat.length === 1 ? flat[0] : mul(flat);
}

export function parseExpr(src: string): Node {
  const p = new Parser(tokenize(src));
  if (!p.peek()) throw new ParseError('Empty.');
  const e = p.expr();
  if (p.peek()) throw new ParseError(`Unexpected “${(p.peek() as Tok).v}”.`);
  return e;
}

const RELS = ['=', '<', '>', '≤', '≥'];

/** An equation, an inequality, or (with `allowExpr`) a lone expression. */
export function parseEquation(src: string, allowExpr = false): Eq {
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
  if (rels.length > 1) throw new ParseError('Only one “=”, “<” or “>” for now.');
  const rel = rels[0].v as Rel;
  const p = new Parser(toks);
  if (p.isOp(rel)) throw new ParseError('The left side is empty.');
  const lhs = p.expr();
  p.eat(rel);
  if (!p.peek()) throw new ParseError('The right side is empty.');
  const rhs = p.expr();
  if (p.peek()) throw new ParseError(`Unexpected “${(p.peek() as Tok).v}”.`);
  // f(x) = … defines f
  if (rel === '=' && lhs.k === 'call' && lhs.arg.k === 'sym') return eq(lhs, rhs, 'def');
  return eq(lhs, rhs, rel);
}
