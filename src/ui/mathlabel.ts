// A move's name with its maths drawn as maths: "move −96x + f(x) across" shows −96x + f(x) the way
// the stage draws it, "Σ k² = n(n + 1)(2n + 1)/6" all of it. Words stay words; any run that
// doesn't read as maths stays as it was written.
import { parseEquation } from '../engine/parse';
import { cardMath } from './hub';

/** names that are maths though they are words */
const FN = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'ln', 'log', 'exp', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'sqrt', 'lim', 'det', 'dx', 'dy', 'dt', 'du', 'dv']);
const isWord = (t: string) => /^[A-Za-z]{2,}[:,;.…]?$/.test(t) && !FN.has(t.replace(/[:,;.…]$/, ''));
const LEAD = /^([Σ∏∫÷×±√·])\s*/;

const CACHE = new Map<string, (string | { math: string; sym?: string })[]>();

/** the label split into words and maths, worked out once per label */
function pieces(text: string): (string | { math: string; sym?: string })[] {
  const hit = CACHE.get(text);
  if (hit) return hit;
  const toks = text.split(/(\s+)/);
  const out: (string | { math: string; sym?: string })[] = [];
  let run = '';
  const flush = () => {
    if (!run.trim()) { if (run) out.push(run); run = ''; return; }
    const lead = run.match(/^\s*/)![0], tail = run.match(/\s*$/)![0];
    let core = run.trim();
    const punct = /[:,;]$/.test(core) ? core.slice(-1) : '';
    if (punct) core = core.slice(0, -1);
    const sym = LEAD.exec(core);
    const body = sym ? core.slice(sym[0].length) : core;
    let ok = false;
    if (body) { try { parseEquation(body, true); ok = true; } catch { ok = false; } }
    if (lead) out.push(lead);
    if (ok) out.push({ math: body, sym: sym?.[1] });
    else out.push(core);
    out.push(punct + tail);
    run = '';
  };
  toks.forEach((t, i) => {
    // a single letter before a word ("a factor") is English, not maths
    const article = /^(a|A)$/.test(t) && isWord(toks[i + 2] ?? '');
    if (/^\s+$/.test(t) || t === '') run += t;
    else if (isWord(t) || article) { flush(); out.push(t); }
    else run += t;
  });
  flush();
  const merged = out.filter(p => p !== '');
  if (CACHE.size > 500) CACHE.clear();
  CACHE.set(text, merged);
  return merged;
}

/** the label as nodes for a chip, card or bubble: maths at this size, inline */
export function mathLabel(text: string, size = 13): DocumentFragment {
  const f = document.createDocumentFragment();
  for (const p of pieces(text)) {
    if (typeof p === 'string') { f.append(p); continue; }
    const span = document.createElement('span');
    span.className = 'mlabel';
    // what it says, for screen readers and for reading the label back as text
    span.setAttribute('aria-label', (p.sym ?? '') + p.math);
    span.dataset.text = (p.sym ?? '') + p.math;
    if (p.sym) span.append(Object.assign(document.createElement('span'), { className: 'mlabel-sym', textContent: p.sym }));
    try { span.append(cardMath(parseEquation(p.math, true), size, 360)); } catch { span.append(p.math); }
    f.append(span);
  }
  return f;
}
