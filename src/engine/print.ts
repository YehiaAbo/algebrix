// Linear text form. `ascii` is what the input bar shows when you edit;
// the pretty form is for labels like "÷ 7" and conditions like "x ≠ 0".
import { Node, FN_TEXT, isDiff, isDiff2, isLeibniz2 } from './ast';
import { isNeg, absOf } from './terms';

export function toText(n: Node, ascii = false): string {
  const minus = ascii ? '-' : '−';
  const p = (m: Node, wrap: boolean) => (wrap ? `(${toText(m, ascii)})` : toText(m, ascii));
  switch (n.k) {
    case 'num': return n.v < 0 ? minus + Math.abs(n.v) : String(n.v);
    case 'sym': return ascii && isDiff2(n.name) ? 'd^2' + n.name.slice(2) : n.name;
    case 'eq': {
      const rel = n.rel ?? '=';
      if (rel === 'expr') return toText(n.lhs, ascii);
      const shown = rel === '≟' || rel === 'def' ? '=' : ascii ? ({ '≤': '<=', '≥': '>=' } as Record<string, string>)[rel] ?? rel : rel;
      return `${toText(n.lhs, ascii)} ${shown} ${toText(n.rhs, ascii)}`;
    }
    // −(−1), never −−1
    case 'neg': return minus + p(n.arg, n.arg.k === 'add' || n.arg.k === 'neg' || (n.arg.k === 'num' && n.arg.v < 0));
    case 'add':
      // a group (sum inside a sum) reads as part of the same sum
      return n.terms.flatMap(t => (t.k === 'add' ? t.terms : [t])).map((t, i) => {
        const inner = absOf(t);
        const body = (inner.k === 'add' || isNeg(inner)) && isNeg(t) ? `(${toText(inner, ascii)})` : toText(inner, ascii);
        if (i === 0) return (isNeg(t) ? minus : '') + body;
        return (isNeg(t) ? ` ${minus} ` : ' + ') + body;
      }).join('');
    case 'mul': {
      let out = '';
      n.factors.forEach((f, i) => {
        if (i === 0 && f.k === 'num' && Math.abs(f.v) === 1 && n.factors.length > 1 && n.factors[1].k !== 'num' && n.factors[1].k !== 'frac') { if (f.v < 0) out += minus; return; }
        const leib = (f.k === 'frac' && f.num.k === 'sym' && isDiff(f.num.name) && f.den.k === 'sym' && isDiff(f.den.name)) || isLeibniz2(f);
        const wrap = f.k === 'add' || (f.k === 'frac' && !leib) || (i > 0 && isNeg(f));
        const s = p(f, wrap);
        // a number written after anything needs a dot: x·3 (x3 would read as x₃), 2·3!
        // and so does anything next to |x|, whose bars could otherwise be read the other way
        const needsDot = i > 0 && out !== '' && out !== minus && (f.k === 'num' || /^[\d.|]/.test(s) || /\|$/.test(out) || (/(?:^|[^a-zA-Zα-ω])d$/.test(out) && /^[a-zA-Zα-ω]/.test(s)));
        const fnLike = (f.k === 'fn' && f.name !== 'abs' && f.name !== 'fact') || f.k === 'deriv' || f.k === 'lim' || f.k === 'int' || f.k === 'sum' || (f.k === 'pow' && f.base.k === 'fn' && f.base.name !== 'abs');
        // after a subscripted name (a_n) a space keeps the next letter out of the subscript
        const afterSub = i > 0 && /_[a-zA-Z0-9]+$/.test(out) && /^[a-zA-Zα-ω]/.test(s);
        // x dx, dx dy: a differential keeps a space on each side (xdx would read as x·d·x)
        const prevF = n.factors[i - 1];
        const diff = i > 0 && ((f.k === 'sym' && isDiff(f.name)) || leib || (prevF?.k === 'sym' && isDiff(prevF.name))) && /^[a-zA-Zα-ω(√]/.test(s);
        out += (needsDot ? (ascii ? '*' : '·') : i > 0 && out !== '' && out !== minus && (fnLike || f.k === 'sqrt' || afterSub || diff) ? ' ' : '') + s;
      });
      return out;
    }
    case 'frac': {
      const simple = (m: Node): boolean => m.k === 'num' && m.v >= 0 || m.k === 'sym' || m.k === 'pow' || m.k === 'sqrt' || m.k === 'fn' || (m.k === 'mul' && !isNeg(m) && m.factors.every(f => f.k !== 'add' && f.k !== 'frac'));
      if (isNeg(n.num) && n.num.k !== 'add') return minus + toText({ ...n, num: absOf(n.num) }, ascii);
      if (isLeibniz2(n)) return `${toText(n.num, ascii)}/${toText(n.den, ascii)}`;
      return `${p(n.num, !simple(n.num))}/${p(n.den, !(n.den.k === 'num' && n.den.v >= 0 || n.den.k === 'sym' || n.den.k === 'fn' || n.den.k === 'sqrt'))}`;
    }
    case 'pow': return `${p(n.base, (n.base.k !== 'num' && n.base.k !== 'sym' && (n.base.k !== 'fn' || /\|$/.test(toText(n.base, ascii)) && n.base.name !== 'abs') || isNeg(n.base)) && !/^(?:[a-zA-Zα-ωπ]|\d+)$/.test(toText(n.base, ascii)))}^${p(n.exp, !(n.exp.k === 'num' && n.exp.v >= 0 || n.exp.k === 'sym'))}`;
    case 'sqrt': return `sqrt(${toText(n.arg, ascii)})`;
    case 'call': return `${n.name}(${toText(n.arg, ascii)})`;
    case 'deriv': return n.partial ? `∂/∂${n.v}(${toText(n.arg, ascii)})` : `d/d${n.v}(${toText(n.arg, ascii)})`;
    case 'vec': return `⟨${n.items.map(i => toText(i, ascii)).join(', ')}⟩`;
    case 'grad': return `∇${n.op === 'div' ? '·' : n.op === 'curl' ? '×' : ''}${p(n.arg, !(n.arg.k === 'sym' || n.arg.k === 'call' || (!!n.op && n.arg.k === 'vec')))}`;
    case 'int': {
      const b = n.lo && n.hi ? `_{${toText(n.lo, ascii)}}^{${toText(n.hi, ascii)}}` : '';
      return `${ascii ? 'int' : '∫'}${b} ${p(n.arg, n.arg.k === 'add' || n.arg.k === 'neg')} d${n.v}`;
    }
    case 'at': return `[${toText(n.arg, ascii)}]_{${n.v}=${toText(n.lo, ascii)}}^{${toText(n.hi, ascii)}}`;
    case 'sum': return `${n.prod ? (ascii ? 'prod' : '∏') : ascii ? 'sum' : 'Σ'}_{${n.v}=${toText(n.lo, ascii)}}^{${toText(n.hi, ascii)}} ${p(n.arg, n.arg.k === 'add' || n.arg.k === 'neg')}`;
    case 'lim': {
      const side = n.side ? (ascii ? n.side : n.side === '+' ? '⁺' : '⁻') : '';
      // two letters at once: lim_{(x,y)→(0,0)}
      const at = n.v.includes(',') && n.to.k === 'vec' ? `(${n.v})${ascii ? '->' : '→'}(${n.to.items.map(t => toText(t, ascii)).join(',')})` : `${n.v}${ascii ? '->' : '→'}${toText(n.to, ascii)}`;
      return `lim_{${at}${side}} ${p(n.arg, n.arg.k === 'add' || n.arg.k === 'neg' || n.arg.k === 'lim')}`;
    }
    case 'fn': if (n.name === 'fact') return `${p(n.arg, !(n.arg.k === 'num' && n.arg.v >= 0 || n.arg.k === 'sym'))}!`;
      if (n.name === 'abs') return `|${toText(n.arg, ascii)}|`;
      // ln|x − 1|: the bars hold it already
      return `${(ascii ? FN_TEXT[n.name]?.replace('⁻¹', '^-1') : FN_TEXT[n.name]) ?? n.name}${n.arg.k === 'fn' && n.arg.name === 'abs' && (n.name === 'ln' || n.name === 'log') ? toText(n.arg, ascii) : `(${toText(n.arg, ascii)})`}`;
  }
}
