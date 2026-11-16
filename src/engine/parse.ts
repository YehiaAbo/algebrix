// Parses what people type ("7y + 3x = 20", "(x+1)/2 = 3x^2") and pasted LaTeX
// ("\frac{x+1}{2}=3x^{2}") into the tree. Juxtaposition binds tighter than "/",
// like Desmos: 1/2x is 1/(2x).
import { Node, Eq, num, sym, add, mul, frac, pow, sqrt, fn, eq, FnName, Rel, call, FUNC_NAMES } from './ast';
import { negate, gcd } from './terms';

type Tok = { t: 'num'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string } | { t: 'cmd'; v: string };

const FNS = ['sqrt', 'cbrt', 'arcsin', 'arccos', 'arctan', 'asin', 'acos', 'atan', 'sin', 'cos', 'tan', 'abs', 'exp', 'ln', 'log'];

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π',
  sigma: 'σ', phi: 'φ', omega: 'ω', tau: 'τ', rho: 'ρ', epsilon: 'ε',
};

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
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
    if (word) { out.push({ t: 'cmd', v: word }); i += word.length; continue; }
    if (s.startsWith('pi', i)) { out.push({ t: 'id', v: 'π' }); i += 2; continue; }
    if (/[a-zA-Zα-ω]/.test(c)) {
      // a subscript makes a new name: x_1, v_0, x_12, a_n, x_{max}
      const sub = /^_(?:\{([a-zA-Z0-9]+)\}|([0-9]+|[a-zA-Z]))/.exec(s.slice(i + 1));
      if (sub) { out.push({ t: 'id', v: `${c}_${sub[1] ?? sub[2]}` }); i += 1 + sub[0].length; continue; }
      out.push({ t: 'id', v: c }); i++; continue;
    }
    if ((c === '<' || c === '>') && s[i + 1] === '=') { out.push({ t: 'op', v: c === '<' ? '≤' : '≥' }); i += 2; continue; }
    const map: Record<string, string> = { '−': '-', '×': '*', '·': '*', '÷': '/', '√': 'sqrt', '⩽': '≤', '⩾': '≥' };
    const v = map[c] ?? c;
    if (v === 'sqrt') out.push({ t: 'cmd', v });
    else if ('+-*/^=(){}[]|<>≤≥'.includes(v)) out.push({ t: 'op', v });
    else throw new ParseError(`I don't know the symbol “${c}”.`);
    i++;
  }
  return out;
}

export class ParseError extends Error {}

class Parser {
  i = 0;
  abs = 0;
  constructor(private toks: Tok[]) {}
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
    return t.t === 'op' && (t.v === '(' || t.v === '{' || t.v === '[' || (t.v === '|' && this.abs === 0));
  }

  group(): Node {
    const fs: Node[] = [this.power()];
    while (this.startsAtom()) fs.push(this.power());
    return mulOf(fs);
  }

  power(): Node {
    const base = this.atom();
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
      if (FUNC_NAMES.includes(t.v) && this.isOp('(')) { this.i++; const a = this.expr(); this.eat(')'); return call(t.v, a); }
      return sym(t.v);
    }
    if (t.t === 'cmd') {
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
    const close = ({ '(': ')', '{': '}', '[': ']' } as Record<string, string>)[t.v];
    if (close) { const outer = this.abs; this.abs = 0; const e = this.expr(); this.abs = outer; this.eat(close); return e; }
    throw new ParseError(`Unexpected “${t.v}”.`);
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
  const rels = toks.filter(t => t.t === 'op' && RELS.includes(t.v));
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
