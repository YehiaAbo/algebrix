// The live math editor every typing box uses: what you type turns into math as you type it
// (int is ∫ at once, ^ raises, / makes a fraction), the way Desmos types. It speaks LaTeX; the app
// reads it through engine/latex.ts.
//
// MathQuill (Desmos's jQuery-free fork, vendored in src/vendor/mathquill) does the editing, and this
// file is the only one that talks to it: no box knows MathQuill is there, so it can be swapped.
// What this adds to MathQuill is how the app's math is typed:
//   int  ∫ with the cursor on its lower bound. _ stays there, ^ goes up, space moves on, and a
//        space with nothing in the bounds makes the integral indefinite (int x dx types ∫ x dx)
//   sum  Σ the same way (n= is filled in; typing k= replaces it)
//   lim  lim with the cursor under it: lim x->0 sin x / x
//   d/dx a ( or space after the dx of d/dx, dy/dx, ∂/∂x leaves the fraction: d/dx(x^2)
//   ->   →, and in a subscript - and + stay there (x → 0⁺) instead of leaving it
//   space leaves a power, a subscript or a bound; elsewhere it types nothing (spacing is the math's)
import '../vendor/mathquill/mathquill.js';
import '../vendor/mathquill/mathquill.css';
import { latexToText } from '../engine/latex';

/** MathQuill's editable field, as far as this file uses it */
interface MQField {
  latex(): string; latex(s: string): void;
  focus(): void; blur(): void; select(): void;
  typedText(s: string): void; keystroke(k: string, e?: KeyboardEvent): void; cmd(s: string): void; write(s: string): void;
  selection(): { latex: string; startIndex: number; endIndex: number };
  selection(s: { latex: string; startIndex: number; endIndex: number }): void;
  config(o: object): void;
  // internals, read only here: where the cursor is
  __controller: { cursor: MQCursor };
}
interface MQNode { parent: MQNode; ctrlSeq?: string; sub?: MQNode; sup?: MQNode; ends: Record<number, MQNode | 0>; latex(): string; [-1]: MQNode | 0; [1]: MQNode | 0 }
interface MQCursor { parent: MQNode; [-1]: MQNode | 0; [1]: MQNode | 0 }

export interface MathField {
  /** the element the field lives in (its id is the box's id) */
  el: HTMLElement;
  latex(): string;
  setLatex(s: string): void;
  /** what is typed, as the app's text form (parse.ts reads it); an empty slot is □ */
  value: string;
  /** the LaTeX before the cursor */
  before(): string;
  /** puts the cursor at this place in the LaTeX */
  caretAt(i: number): void;
  /** chooses [from, to) of the LaTeX, so typing replaces it */
  selectRange(from: number, to: number): void;
  /** types text as keys would, with the same rules */
  typeText(s: string): void;
  /** puts LaTeX in place of [from, to) of the LaTeX, the cursor where it has a $ */
  splice(from: number, to: number, tex: string): void;
  focus(): void;
  blur(): void;
  select(): void;
  placeholder: string;
}

export interface FieldOptions {
  /** a key the box handles itself (Enter, Esc, Tab, ↑ ↓…, and typed characters, which come as { key }):
   *  return true and the editor won't see it */
  onKey?: (e: KeyboardEvent) => boolean;
  placeholder?: string;
}

/** LaTeX as MathQuill takes it: it has no thin space \, (it would read a comma), so a plain one */
const forMQ = (s: string) => s.replace(/\\,/g, '\\ ');

const FIELDS = new WeakMap<HTMLElement, MathField>();

declare global { interface Window { MathQuill: { getInterface(v: 3): { MathField(el: HTMLElement, o: object): MQField } } } }

const OPTIONS = {
  spaceBehavesLikeTab: false,
  restrictMismatchedBrackets: true,
  sumStartsWithNEquals: true,
  // ^2 alone is a power of each side in the both-sides box
  supSubsRequireOperand: false,
  charsThatBreakOutOfSupSub: '+-=<>',
  autoSubscriptNumerals: true,
  typingAsteriskWritesTimesSymbol: true,
  autoCommands: 'pi theta alpha beta gamma delta epsilon lambda sigma phi omega tau rho sqrt sum prod int infty partial nabla nthroot',
  autoOperatorNames: 'sin cos tan sec csc cot sinh cosh tanh ln log exp lim arcsin arccos arctan',
  maxDepth: 12,
};

/** the field on an element made with mathField */
export function field(id: string): MathField {
  const el = document.getElementById(id)!;
  const f = FIELDS.get(el);
  if (!f) throw new Error(`#${id} is not a math field`);
  return f;
}

/** makes `host` a live math field (once; later calls give the same field) */
export function mathField(host: HTMLElement, opts: FieldOptions = {}): MathField {
  const had = FIELDS.get(host);
  if (had) return had;
  host.classList.add('mf');
  host.textContent = '';
  let quiet = false;
  const changed = () => {
    host.classList.toggle('mf-empty', mq.latex() === '');
    if (!quiet) host.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const mq: MQField = window.MathQuill.getInterface(3).MathField(host, {
    ...OPTIONS,
    handlers: { edit: changed },
    overrideTypedText: (t: string) => { if (!opts.onKey?.({ key: t } as KeyboardEvent)) type(t); },
    overrideKeystroke: (k: string, e: KeyboardEvent) => { if (!opts.onKey?.(e)) mq.keystroke(k, e); else e.preventDefault(); },
  });
  // keys typed here are the field's: the app's own single-letter keys must not see them
  host.addEventListener('keydown', e => e.stopPropagation());
  host.addEventListener('keyup', e => e.stopPropagation());

  const cur = () => mq.__controller.cursor;
  /** powers and roots whose ( was swallowed (e^(x + 1)): their ) steps out */
  const ownBracket = new WeakSet<MQNode>();
  /** the command that holds the cursor's block, and which of its blocks that is */
  const where = () => {
    const block = cur().parent, cmd = block?.parent;
    if (!cmd || !cmd.ctrlSeq) return null;
    return { block, cmd, seq: cmd.ctrlSeq.trim(), lower: cmd.ends[-1] === block, upper: cmd.ends[1] === block };
  };
  const atEnd = () => !cur()[1];
  /** moves right until the cursor is just after cmd */
  const leave = (cmd: MQNode) => { for (let i = 0; i < 40 && cur()[-1] !== cmd; i++) mq.keystroke('Right'); };
  const before = () => { const s = mq.selection(); return s.latex.slice(0, s.startIndex); };
  /** ∫, Σ, ∏ and lim x→a: what follows them is theirs, so a / after them starts after them */
  const boundary = (n: MQNode) => /^\\(?:int|sum|prod)\b/.test(n.latex().trim()) || (!!n.sub && /\\to/.test(n.sub.latex()));
  /** the fraction holding the cursor when it is d/dx, dy/dx, d²y/dx², ∂/∂x, and its bottom is done */
  const leibniz = (): MQNode | null => {
    const w = where();
    let cmd = w?.cmd, block = w?.block;
    // d²/dx²: the cursor may be in the ² of the bottom
    if (w && w.cmd.sup === w.block && w.cmd.parent?.parent?.ctrlSeq === '\\frac') { block = w.cmd.parent; cmd = block.parent; }
    if (!cmd || cmd.ctrlSeq !== '\\frac' || cmd.ends[1] !== block) return null;
    const top = (cmd.ends[-1] as MQNode).latex().replace(/\s/g, ''), bottom = (cmd.ends[1] as MQNode).latex().replace(/\s/g, '');
    return /^(?:d|\\partial|d\^\{?2\}?|d[a-zA-Z]|d\^\{?2\}?[a-zA-Z])$/.test(top) && /^(?:d[a-zA-Z]|\\partial[a-zA-Z])(?:\^\{?2\}?)?$/.test(bottom) ? cmd : null;
  };

  /** one typed character, by the app's rules (see the top of this file), else as MathQuill types it */
  function type(t: string) {
    // typing over everything chosen (Ctrl+A, or a box that opened chosen) replaces it, as in any box
    { const sel = mq.selection(); if (sel.endIndex > sel.startIndex && sel.startIndex === 0 && sel.endIndex >= sel.latex.length) mq.keystroke('Backspace'); }
    const w = where();
    const big = w && (w.seq === '\\int' || w.seq === '\\sum' || w.seq === '\\prod');
    const inSub = w && w.cmd.sub === w.block;
    const inSup = w && w.cmd.sup === w.block;
    const limSub = inSub && /\\lim\s*$/.test(before().replace(/_\{[^{}]*$/, ''));
    // ∇ ⟨ √ ∫ Σ typed as characters (a keyboard or a paste that has them)
    const CHARS: Record<string, string> = { '∇': 'nabla', '√': 'sqrt', '∫': 'int', 'Σ': 'sum', '∑': 'sum', '∏': 'prod', 'π': 'pi', '−': '-', '·': '*', '×': '*', '≤': '<=', '≥': '>=', '→': '->', '′': "'", '″': "''" };
    if (CHARS[t]) { for (const c of CHARS[t]) type(c); return; }
    if (t === '⟨') { mq.cmd('\\langle'); return; }
    if (t === '⟩') { if (w && /langle/.test(w.seq)) leave(w.cmd); return; }
    const OP = /^(?:[-+=<>,]|\\(?:le|ge|cdot|div|ne|to|times|pm))$/;
    // inf (or oo) then anything but a letter is ∞
    { const m = !/[a-zA-Z]/.test(t) && /(?:^|[^a-zA-Z\\])(inf|oo)$/.exec(before()); if (m) { for (let i = 0; i < m[1].length; i++) mq.keystroke('Backspace'); mq.cmd('\\infty'); } }
    // int typed inside the bounds of another (int_0^1int …) or as iint / iiint: ∫ after ∫, each in the body of the last
    if (t === 't') {
      const m = /(?:^|[^a-zA-Z\\])(i{0,2})in$/.exec(before());
      if (m && (m[1] || big)) {
        for (let i = 0; i < m[1].length + 2; i++) mq.keystroke('Backspace');
        if (big) leave(w.cmd);
        for (let k = 0; k <= m[1].length; k++) { mq.typedText('i'); mq.typedText('n'); mq.typedText('t'); if (k < m[1].length) type(' '); }
        return;
      }
    }
    // a power -1 on a name is its inverse: tan^-1( and f^-1( go on after the power
    if (t === '(' && inSup && /^-1$/.test(w.block.latex().replace(/\s/g, ''))) leave(w.cmd);
    // the bottom of d/dx, dy/dx, d²y/dx² is done once something else comes
    { const lb = leibniz(); if (lb && atEnd() && /[ =+\-<>()]/.test(t)) { leave(lb); if (t === ' ') return; } }
    // d²y: the y comes after the ², not in it
    if (inSup && /[a-zA-Z]/.test(t) && /(?:^|[^a-zA-Z\\])d\^\{2$/.test(before())) leave(w.cmd);
    // braces are how LaTeX groups bounds and powers; here the slots group them already
    if ((t === '{' || t === '}') && (big || inSub || inSup)) return;
    if (t === ' ') {
      // inside a bracket that was swallowed (1/(t + 1), e^(x + 1)), only its ) ends it
      if (w && ownBracket.has(w.cmd)) return;
      const empty = w && !w.block.latex().trim();
      // lim x: the space after lim (or after the n= Σ fills in) is just a space
      if ((limSub && empty) || ((w?.seq === '\\sum' || w?.seq === '\\prod') && w.lower && /^n=$/.test(w.block.latex().replace(/\s/g, '')))) return;
      // a space after the bottom of a fraction ends it, as in 1/2 x (but ln x on the bottom is ln of x)
      if (w?.seq === '\\frac' && w.upper && atEnd() && !empty && !/\\[a-z]+\s*$/.test(before())) return leave(w.cmd);
      if (big && w.lower) {
        // nothing in either bound: an indefinite ∫, so on to its body
        if (!(w.block.latex().trim()) && !(w.cmd.ends[1] as MQNode).latex().trim()) return leave(w.cmd);
        return mq.keystroke('Up');
      }
      if (big || ((inSub || inSup) && atEnd())) return leave(w!.cmd);
      return;
    }
    if (big && w.lower && t === '_') return;
    if (big && w.lower && t === '^') return mq.keystroke('Up');
    if (big && w.upper && t === '^') return;
    // sum_{k=1}: n= was filled in for you; a letter and = takes its place
    if ((w?.seq === '\\sum' || w?.seq === '\\prod') && w.lower && t === '=' && /^n=[a-zA-Z]$/.test(w.block.latex().replace(/\s/g, ''))) {
      const v = w.block.latex().replace(/\s/g, '').slice(-1);
      for (let i = 0; i < 3; i++) mq.keystroke('Backspace');
      mq.typedText(v); mq.typedText('=');
      return;
    }
    if (t === '(' || t === '[') { const lb = leibniz(); if (lb && atEnd()) leave(lb); }
    // e^(x + 1), sqrt(x + 1): a ( straight into an empty power or root is the power's own bracket,
    // so it isn't drawn, and the ) that matches it steps back out
    if (t === '(' && w && !w.block.latex().trim() && (inSup || w.seq === '\\sqrt' || (w.seq === '\\frac' && w.upper))) { ownBracket.add(w.cmd); return; }
    if (t === ')' && w && ownBracket.has(w.cmd)) return leave(w.cmd);
    // and inside it, + − = don't end the power early: 2^(x + 1)
    if ('+-=<>'.includes(t) && inSup && ownBracket.has(w.cmd)) { mq.write(t); return; }
    // a ) for a bracket outside: out of the power, root or fraction first (d/dx(x^3))
    if (t === ')' && w && (inSup || inSub || w.seq === '\\sqrt' || w.seq === '\\frac') && /\\left\(/.test(before())) { leave(w.cmd); return type(')'); }
    // ÷ 3 in the both-sides box: a / with nothing before it is the operation, not a fraction
    if (t === '/' && !mq.latex()) { mq.cmd('\\div'); return; }
    // (x + 1)/(x − 1): a bracket alone on top of a fraction is only grouping, so it goes
    const left = cur()[-1];
    if (t === '/' && left && /^\\left\(.*\\right\)$/.test(left.latex().trim()) && (!left[-1] || OP.test((left[-1] as MQNode).latex().trim()) || boundary(left[-1] as MQNode))) {
      const inner = left.latex().trim().slice(6, -7);
      mq.keystroke('Shift-Left'); mq.keystroke('Backspace');
      mq.cmd('\\frac'); mq.write(inner); mq.keystroke('Down');
      return;
    }
    // / after lim x→0 sin x, ∫ … or Σ …: the fraction is of what comes after them, not of the limit
    if (t === '/') {
      let k = 0, n = cur()[-1];
      for (; n; n = n[-1], k++) {
        const l = n.latex().trim();
        if (OP.test(l)) break;
        if (boundary(n)) {
          if (!k) { mq.cmd('\\frac'); return; }
          for (let j = 0; j < k; j++) mq.keystroke('Shift-Left');
          mq.typedText('/');
          return;
        }
      }
    }
    // _ with nothing before it is a slot to fill, □: e^_ and _^2 + 1 in the f menu (x_1 is still x₁)
    if (t === '_' && (!cur()[-1] || /[-+=*/(,]$|\\(?:cdot|div|le|ge|left\()$/.test(before()))) { mq.write('□'); return; }
    // -> is →
    if (t === '>' && /-$/.test(before())) { mq.keystroke('Backspace'); mq.cmd('\\to'); return; }
    // in a subscript (lim x → 0⁺), - and + belong to it
    if ((t === '-' || t === '+') && limSub) { mq.write(t); return; }
    mq.typedText(t);
    // lim takes the cursor under it at once
    if (t === 'm' && /\\lim\s*$/.test(before())) mq.cmd('_');
  }

  const f: MathField = {
    el: host,
    latex: () => mq.latex(),
    setLatex(s: string) { quiet = true; mq.latex(forMQ(s)); quiet = false; host.classList.toggle('mf-empty', s === ''); },
    get value() { return latexToText(mq.latex()); },
    set value(text: string) {
      // typed in key by key, as you would type it: the text keeps its shape (I(5) stays a call of I
      // even before I means anything, and a start like f( stays open)
      quiet = true;
      mq.latex('');
      for (const ch of text) type(ch);
      quiet = false;
      host.classList.toggle('mf-empty', mq.latex() === '');
    },
    before,
    caretAt(i: number) { const l = mq.latex(); mq.selection({ latex: l, startIndex: i, endIndex: i }); },
    selectRange(from: number, to: number) { const l = mq.latex(); mq.selection({ latex: l, startIndex: from, endIndex: to }); },
    typeText(s: string) { for (const ch of s) type(ch); },
    splice(from: number, to: number, tex: string) {
      const l = mq.latex();
      quiet = true;
      mq.latex(forMQ(l.slice(0, from) + tex.replace('$', '\\square ') + l.slice(to)));
      quiet = false;
      // the □ marks where the cursor goes: stand after it and take it away
      const now = mq.latex(), m = /\\square\s?/.exec(now);
      if (m) { const at = m.index + m[0].length; mq.selection({ latex: now, startIndex: at, endIndex: at }); mq.keystroke('Backspace'); }
      else changed();
    },
    focus: () => mq.focus(),
    blur: () => mq.blur(),
    select: () => mq.select(),
    get placeholder() { return host.dataset.placeholder ?? ''; },
    set placeholder(p: string) { host.dataset.placeholder = p; },
  };
  f.placeholder = opts.placeholder ?? '';
  host.classList.add('mf-empty');
  FIELDS.set(host, f);
  return f;
}
