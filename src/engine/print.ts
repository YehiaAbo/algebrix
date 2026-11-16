// Linear text form. `ascii` is what the input bar shows when you edit;
// the pretty form is for labels like "÷ 7" and conditions like "x ≠ 0".
import { Node } from './ast';
import { isNeg, absOf } from './terms';

export function toText(n: Node, ascii = false): string {
  const minus = ascii ? '-' : '−';
  const p = (m: Node, wrap: boolean) => (wrap ? `(${toText(m, ascii)})` : toText(m, ascii));
  switch (n.k) {
    case 'num': return n.v < 0 ? minus + Math.abs(n.v) : String(n.v);
    case 'sym': return n.name;
    case 'eq': return `${toText(n.lhs, ascii)} = ${toText(n.rhs, ascii)}`;
    case 'neg': return minus + p(n.arg, n.arg.k === 'add' || n.arg.k === 'neg');
    case 'add':
      return n.terms.map((t, i) => {
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
        out += (needsDot ? (ascii ? '*' : '·') : i > 0 && out !== '' && out !== minus && f.k === 'fn' && f.name !== 'abs' ? ' ' : '') + s;
      });
      return out;
    }
    case 'frac': {
      const simple = (m: Node): boolean => m.k === 'num' && m.v >= 0 || m.k === 'sym' || m.k === 'pow' || (m.k === 'mul' && !isNeg(m) && m.factors.every(f => f.k !== 'add' && f.k !== 'frac'));
      return `${p(n.num, !simple(n.num))}/${p(n.den, !(n.den.k === 'num' && n.den.v >= 0 || n.den.k === 'sym'))}`;
    }
    case 'pow': return `${p(n.base, n.base.k !== 'num' && n.base.k !== 'sym' || isNeg(n.base))}^${p(n.exp, !(n.exp.k === 'num' && n.exp.v >= 0 || n.exp.k === 'sym'))}`;
    case 'sqrt': return `sqrt(${toText(n.arg, ascii)})`;
    case 'fn': return n.name === 'abs' ? `|${toText(n.arg, ascii)}|` : `${n.name}(${toText(n.arg, ascii)})`;
  }
}
