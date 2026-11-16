// Linear text form. `ascii` is what the input bar shows when you edit;
// the pretty form is for labels like "÷ 7" and conditions like "x ≠ 0".
import { Node, FN_TEXT } from './ast';
import { isNeg, absOf } from './terms';

export function toText(n: Node, ascii = false): string {
  const minus = ascii ? '-' : '−';
  const p = (m: Node, wrap: boolean) => (wrap ? `(${toText(m, ascii)})` : toText(m, ascii));
  switch (n.k) {
    case 'num': return n.v < 0 ? minus + Math.abs(n.v) : String(n.v);
    case 'sym': return n.name;
    case 'eq': {
      const rel = n.rel ?? '=';
      if (rel === 'expr') return toText(n.lhs, ascii);
      const shown = rel === '≟' || rel === 'def' ? '=' : ascii ? ({ '≤': '<=', '≥': '>=' } as Record<string, string>)[rel] ?? rel : rel;
      return `${toText(n.lhs, ascii)} ${shown} ${toText(n.rhs, ascii)}`;
    }
    case 'neg': return minus + p(n.arg, n.arg.k === 'add' || n.arg.k === 'neg');
    case 'add':
      // a group (sum inside a sum) reads as part of the same sum
      return n.terms.flatMap(t => (t.k === 'add' ? t.terms : [t])).map((t, i) => {
        const body = toText(absOf(t), ascii);
        if (i === 0) return (isNeg(t) ? minus : '') + body;
        return (isNeg(t) ? ` ${minus} ` : ' + ') + body;
      }).join('');
    case 'mul': {
      let out = '';
      n.factors.forEach((f, i) => {
        if (i === 0 && f.k === 'num' && Math.abs(f.v) === 1 && n.factors.length > 1) { if (f.v < 0) out += minus; return; }
        const wrap = f.k === 'add' || f.k === 'frac' || (i > 0 && isNeg(f));
        const s = p(f, wrap);
        const prev = n.factors[i - 1];
        const needsDot = i > 0 && out !== '' && out !== minus && (f.k === 'num' || (prev && prev.k === 'num' && /^\d/.test(s)));
        const fnLike = (f.k === 'fn' && f.name !== 'abs') || (f.k === 'pow' && f.base.k === 'fn' && f.base.name !== 'abs');
        // after a subscripted name (a_n) a space keeps the next letter out of the subscript
        const afterSub = i > 0 && /_[a-zA-Z0-9]+$/.test(out) && /^[a-zA-Zα-ω]/.test(s);
        out += (needsDot ? (ascii ? '*' : '·') : i > 0 && out !== '' && out !== minus && fnLike || f.k === 'sqrt' || afterSub ? ' ' : '') + s;
      });
      return out;
    }
    case 'frac': {
      const simple = (m: Node): boolean => m.k === 'num' && m.v >= 0 || m.k === 'sym' || m.k === 'pow' || m.k === 'sqrt' || m.k === 'fn' || (m.k === 'mul' && !isNeg(m) && m.factors.every(f => f.k !== 'add' && f.k !== 'frac'));
      if (isNeg(n.num) && n.num.k !== 'add') return minus + toText({ ...n, num: absOf(n.num) }, ascii);
      return `${p(n.num, !simple(n.num))}/${p(n.den, !(n.den.k === 'num' && n.den.v >= 0 || n.den.k === 'sym' || n.den.k === 'fn' || n.den.k === 'sqrt'))}`;
    }
    case 'pow': return `${p(n.base, n.base.k !== 'num' && n.base.k !== 'sym' && n.base.k !== 'fn' || isNeg(n.base))}^${p(n.exp, !(n.exp.k === 'num' && n.exp.v >= 0 || n.exp.k === 'sym'))}`;
    case 'sqrt': return `sqrt(${toText(n.arg, ascii)})`;
    case 'call': return `${n.name}(${toText(n.arg, ascii)})`;
    case 'fn': return n.name === 'abs' ? `|${toText(n.arg, ascii)}|` : `${FN_TEXT[n.name] ?? n.name}(${toText(n.arg, ascii)})`;
  }
}
