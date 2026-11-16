// Legal moves. Each one is a small, explicit rewrite; `applyMove` then checks it
// numerically and refuses anything that isn't provably the same equation.
import {
  Node, Eq, Mul, Frac, find, findPath, replace, cloneFresh, num, add, mul, frac, eq,
  evaluate, Env, symbols, hasSymbols, allIds, key, newId,
} from './ast';
import { negate, isNeg, coefOf, termInfo, buildTerm, gcd, rat, rdiv } from './terms';
import { simplify, newHints, Hints } from './simplify';
import { toText } from './print';
import { parseExpr } from './parse';

export interface MoveOk {
  eq: Eq;
  label: string;
  /** node that travels: gets the arc animation */
  focus?: string;
  /** what should be selected afterwards (null = clear) */
  select?: string | null;
  conditions?: string[];
  hints: Hints;
  /** lhs−rhs of the new equation = factor × (lhs−rhs of the old one) */
  factor: (env: Env) => number;
}
export type MoveResult = MoveOk | { error: string };
export const isErr = (r: MoveResult): r is { error: string } => 'error' in r;

export type MoveName = 'move' | 'divide' | 'multiply' | 'distribute' | 'simplify' | 'factor' | 'slideL' | 'slideR' | 'swap';

const one = () => 1;
const t = (n: Node) => toText(n);
const side = (e: Eq, s: 'lhs' | 'rhs') => e[s];
const other = (s: 'lhs' | 'rhs') => (s === 'lhs' ? 'rhs' : 'lhs');

function locate(e: Eq, sel: string | null) {
  if (!sel || sel === 'eq') return null;
  const path = findPath(e, sel);
  if (!path) return null;
  const s: 'lhs' | 'rhs' = path[1] === e.lhs ? 'lhs' : 'rhs';
  return { path, node: path[path.length - 1], parent: path[path.length - 2], s, root: side(e, s) };
}

function appendTerms(target: Node, terms: Node[]): Node {
  if (target.k === 'num' && target.v === 0) return terms.length === 1 ? terms[0] : add(terms);
  if (target.k === 'add') return { ...target, terms: [...target.terms, ...terms] };
  return add([target, ...terms]);
}

function withSides(e: Eq, s: 'lhs' | 'rhs', mine: Node, theirs: Node): Eq {
  return s === 'lhs' ? eq(mine, theirs) : eq(theirs, mine);
}

/* ---------- move a term across "=" ---------- */
function moveAcross(e: Eq, sel: string | null): MoveResult {
  const at = locate(e, sel);
  if (!at) return { error: 'Pick a term to move across the =.' };
  const { node, parent, s, root } = at;
  let moving: Node[];
  let mine: Node;
  if (node === root) {
    if (node.k === 'num' && node.v === 0) return { error: 'This side is already 0. Nothing to move.' };
    moving = node.k === 'add' ? node.terms : [node];
    mine = num(0);
  } else if (parent === root && root.k === 'add') {
    const rest = root.terms.filter(x => x !== node);
    moving = [node];
    mine = rest.length === 1 ? rest[0] : { ...root, terms: rest };
  } else if (parent.k === 'mul' && parent === root) {
    return { error: `${t(node)} is a factor, not a term. Factors leave by dividing: press /.` };
  } else if (parent.k === 'frac' && parent === root && parent.den === node) {
    return { error: `${t(node)} is a denominator. It leaves by multiplying: press *.` };
  } else {
    return { error: `${t(node)} is inside ${t(parent)}. Only a whole term on a side can cross the =. Press k to grow the selection.` };
  }
  const moved = moving.map(negate);
  const theirs = appendTerms(side(e, other(s)), moved);
  const label = moving.length === 1 ? `move ${isNeg(moving[0]) ? '−' : '+'}${t(isNeg(moving[0]) ? negate(moving[0]) : moving[0])}` : 'move side';
  return {
    eq: withSides(e, s, mine, theirs), label, focus: moved.length === 1 ? moved[0].id : undefined,
    select: moved.length === 1 ? moved[0].id : null, hints: newHints(), factor: one,
  };
}

/* ---------- divide both sides ---------- */
function divideBoth(e: Eq, sel: string | null): MoveResult {
  const at = locate(e, sel);
  if (!at) return { error: 'Pick the factor to divide both sides by.' };
  const { node, parent, s, root } = at;
  let divisor: Node;
  if (node === root && root.k === 'mul' && coefOf(root) && coefOf(root)!.v !== 1) divisor = coefOf(root)!;
  else if (parent === root && root.k === 'mul') divisor = node;
  else if (root.k === 'add') return { error: node === root ? 'This side is a sum, so there is no single factor to divide by. Move terms across first, or press o to divide both sides by anything.' : `${t(node)} is one term of a sum. Move the other terms across first, then divide.` };
  else return { error: `${t(node)} isn't a factor of the whole side, so I can't divide it out.` };
  if (divisor.k === 'num' && divisor.v === 0) return { error: 'Dividing by 0 is undefined.' };
  const rest = (root as Mul).factors.filter(f => f !== divisor);
  const mine = rest.length === 0 ? num(1) : rest.length === 1 ? rest[0] : { ...(root as Mul), factors: rest };
  const o = side(e, other(s));
  const theirs = o.k === 'frac' ? { ...o, den: o.den.k === 'mul' ? { ...o.den, factors: [...o.den.factors, divisor] } : mul([o.den, divisor]) } : frac(o, divisor);
  return {
    eq: withSides(e, s, mine, theirs), label: `÷ ${t(divisor)}`, focus: divisor.id, select: divisor.id,
    conditions: hasSymbols(divisor) ? [`${t(divisor)} ≠ 0`] : [], hints: newHints(),
    factor: env => 1 / evaluate(divisor, env),
  };
}

/* ---------- multiply both sides (clear a denominator) ---------- */
function multiplyBoth(e: Eq, sel: string | null): MoveResult {
  const at = locate(e, sel);
  if (!at) return { error: 'Pick a denominator to multiply both sides by.' };
  const { node, parent, s, root } = at;
  let m: Node, mine: Node;
  if (root.k === 'frac' && (node === root || node === root.den)) { m = root.den; mine = root.num; }
  else if (root.k === 'frac' && root.den.k === 'mul' && parent === root.den) {
    m = node;
    const rest = root.den.factors.filter(f => f !== node);
    mine = frac(root.num, rest.length === 1 ? rest[0] : { ...root.den, factors: rest }, root.id);
  } else return { error: '× clears a denominator. Select the bottom of a side that is a fraction.' };
  const o = side(e, other(s));
  const theirs = o.k === 'mul' ? { ...o, factors: [m, ...o.factors] } : mul([m, o]);
  return {
    eq: withSides(e, s, mine, theirs), label: `× ${t(m)}`, focus: m.id, select: m.id,
    conditions: hasSymbols(m) ? [`${t(m)} ≠ 0`] : [], hints: newHints(),
    factor: env => evaluate(m, env),
  };
}

/* ---------- distribute / split a fraction ---------- */
function distribute(e: Eq, sel: string | null): MoveResult {
  const n = sel && sel !== 'eq' ? find(e, sel) : null;
  if (!n) return { error: 'Pick a product with a bracket, like 2(x + 3).' };
  const h = newHints();
  let out: Node;
  if (n.k === 'mul' && n.factors.some(f => f.k === 'add')) {
    const ai = n.factors.findIndex(f => f.k === 'add');
    const A = n.factors[ai] as Extract<Node, { k: 'add' }>;
    const outer = n.factors.filter((_, i) => i !== ai);
    const terms = A.terms.map((term, j) => {
      const outs = j === 0 ? outer : outer.map(cloneFresh);
      const neg = isNeg(term);
      const body = neg ? negate(term) : term;
      const bodyFs = body.k === 'mul' ? body.factors : [body];
      // numbers fold into the term's own coefficient; a copy of the outer number flies into it
      const outerNums = outs.filter(f => f.k === 'num') as Extract<Node, { k: 'num' }>[];
      const innerNum = bodyFs.find(f => f.k === 'num') as Extract<Node, { k: 'num' }> | undefined;
      let fs: Node[] = [...outs, ...bodyFs];
      if (outerNums.length && innerNum) {
        const v = [...outerNums, innerNum].reduce((p, x) => p * x.v, 1);
        outerNums.forEach(x => (j === 0 ? h.absorbs.set(x.id, innerNum.id) : h.flights.push({ from: x.from!, to: innerNum.id })));
        fs = [num(v, innerNum.id), ...fs.filter(f => f.k !== 'num')];
      } else if (innerNum) {
        fs = [innerNum, ...fs.filter(f => f !== innerNum)];
      }
      const built: Node = fs.length === 1 ? fs[0] : mul(fs, body.k === 'mul' ? body.id : j === 0 ? n.id : newId());
      return neg ? negate(built) : built;
    });
    out = add(terms, A.id);
  } else if (n.k === 'neg' && n.arg.k === 'add') {
    out = { ...n.arg, terms: n.arg.terms.map(negate) };
  } else if (n.k === 'frac' && n.num.k === 'add') {
    const F = n as Frac;
    out = add((F.num as Extract<Node, { k: 'add' }>).terms.map((term, j) =>
      frac(term, j === 0 ? F.den : cloneFresh(F.den), j === 0 ? F.id : newId())), F.num.id);
  } else {
    return { error: 'Nothing to distribute. Select a product with a bracket, like 2(x + 3), or a sum over a denominator.' };
  }
  return { eq: replace(e, n.id, out), label: n.k === 'frac' ? 'split fraction' : 'distribute', hints: h, factor: one, select: out.id };
}

/* ---------- simplify the selection ---------- */
function simplifyMove(e: Eq, sel: string | null): MoveResult {
  const h = newHints();
  const target = sel && sel !== 'eq' ? find(e, sel) : null;
  let next: Eq;
  if (!target) next = eq(simplify(e.lhs, h), simplify(e.rhs, h));
  else next = replace(e, target.id, simplify(target, h));
  if (key(next) === key(e)) return { error: 'Already as simple as it gets.' };
  const keep = target && find(next, target.id) ? target.id : null;
  return { eq: next, label: 'simplify', hints: h, factor: one, select: target ? keep : null };
}

/* ---------- factor out a common factor ---------- */
function factorOut(e: Eq, sel: string | null): MoveResult {
  const n = sel && sel !== 'eq' ? find(e, sel) : null;
  if (!n || n.k !== 'add') return { error: 'Select a sum to factor.' };
  const infos = n.terms.map(termInfo);
  let g = infos.every(i => i.coef.q === 1) ? infos.reduce((a, i) => gcd(a, i.coef.p), 0) : 1;
  if (isNeg(n.terms[0]) && g > 0) g = -g;
  // common symbols with their smallest power
  const powerOf = (mono: Node[], name: string) => mono.reduce((s, f) =>
    s + (f.k === 'sym' && f.name === name ? 1 : f.k === 'pow' && f.base.k === 'sym' && f.base.name === name && f.exp.k === 'num' ? f.exp.v : 0), 0);
  const common: { name: string; p: number }[] = [];
  for (const name of symbols(n)) {
    const p = Math.min(...infos.map(i => powerOf(i.mono, name)));
    if (p > 0) common.push({ name, p });
  }
  if ((g === 1 || g === 0) && common.length === 0) return { error: 'These terms share no common factor.' };
  const h = newHints();
  const first = n.terms[0];
  const firstMono = infos[0].mono;
  const outer: Node[] = [];
  if (g !== 1 && g !== 0) {
    const c = coefOf(first) ?? (first.k === 'num' ? first : null);
    const o = num(g); if (c) o.from = c.id;
    outer.push(o);
  }
  for (const c of common) {
    const src = firstMono.find(f => (f.k === 'sym' && f.name === c.name) || (f.k === 'pow' && f.base.k === 'sym' && f.base.name === c.name));
    const base = src ? cloneFresh(src.k === 'pow' ? src.base : src) : { k: 'sym' as const, id: newId(), name: c.name };
    outer.push(c.p === 1 ? base : { k: 'pow', id: newId(), base, exp: num(c.p) });
  }
  const inner = n.terms.map((term, i) => {
    const mono: Node[] = [];
    let left = new Map(common.map(c => [c.name, c.p]));
    for (const f of infos[i].mono) {
      const name = f.k === 'sym' ? f.name : f.k === 'pow' && f.base.k === 'sym' && f.exp.k === 'num' ? f.base.name : null;
      const have = name ? (f.k === 'sym' ? 1 : (f as any).exp.v as number) : 0;
      const take = name ? Math.min(left.get(name) ?? 0, have) : 0;
      if (name && take) left.set(name, (left.get(name) ?? 0) - take);
      const remain = have - take;
      if (!name || take === 0) mono.push(f);
      else if (remain === 0) h.absorbs.set(f.id, outer[0]?.id ?? n.id);
      else if (remain === 1) mono.push(f.k === 'pow' ? f.base : f);
      else mono.push({ ...(f as any), exp: num(remain, (f as any).exp.id) });
    }
    return buildTerm(g ? rdiv(infos[i].coef, rat(g)) : infos[i].coef, mono, term);
  });
  const out = mul([...outer, { ...n, terms: inner }]);
  return { eq: replace(e, n.id, out), label: `factor out ${outer.map(t).join('')}`, hints: h, factor: one, select: out.id };
}

/* ---------- reorder inside a sum or product ---------- */
function slide(e: Eq, sel: string | null, dir: -1 | 1): MoveResult {
  const at = locate(e, sel);
  if (!at || (at.parent.k !== 'add' && at.parent.k !== 'mul')) return { error: 'Only a term in a sum or a factor in a product can slide.' };
  const list = at.parent.k === 'add' ? at.parent.terms : at.parent.factors;
  const i = list.indexOf(at.node), j = i + dir;
  if (j < 0 || j >= list.length) return { error: 'Already at the edge.' };
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  const p = at.parent.k === 'add' ? { ...at.parent, terms: next } : { ...at.parent, factors: next };
  return { eq: replace(e, at.parent.id, p), label: 'reorder', hints: newHints(), factor: one, select: at.node.id };
}

function swapSides(e: Eq, sel: string | null): MoveResult {
  return { eq: eq(e.rhs, e.lhs), label: 'swap sides', hints: newHints(), factor: () => -1, select: sel };
}

const MOVES: Record<MoveName, (e: Eq, sel: string | null) => MoveResult> = {
  move: moveAcross, divide: divideBoth, multiply: multiplyBoth, distribute, simplify: simplifyMove,
  factor: factorOut, slideL: (e, s) => slide(e, s, -1), slideR: (e, s) => slide(e, s, 1), swap: swapSides,
};

/* ---------- apply an operation to both sides ---------- */
export function applyBoth(e: Eq, text: string): MoveResult {
  const m = /^\s*([+\-−*×·/÷])\s*(.+)$/.exec(text);
  if (!m) return { error: 'Start with + − * or /, like “/7” or “+3x”.' };
  const op = ({ '−': '-', '×': '*', '·': '*', '÷': '/' } as Record<string, string>)[m[1]] ?? m[1];
  let x: Node;
  try { x = parseExpr(m[2]); } catch (err) { return { error: (err as Error).message }; }
  const isZero = !hasSymbols(x) && Math.abs(evaluate(x, {})) < 1e-12;
  if ((op === '*' || op === '/') && isZero) return { error: op === '/' ? 'Dividing by 0 is undefined.' : 'Multiplying by 0 erases the equation.' };
  const c = cloneFresh(x); c.from = undefined;
  const cond = hasSymbols(x) && (op === '*' || op === '/') ? [`${t(x)} ≠ 0`] : [];
  let L: Node, R: Node, factor: (env: Env) => number = one;
  if (op === '+' || op === '-') {
    L = appendTerms(e.lhs, [op === '-' ? negate(x) : x]);
    R = appendTerms(e.rhs, [op === '-' ? negate(c) : c]);
  } else if (op === '*') {
    const pre = (f: Node, s: Node): Node => (s.k === 'mul' ? { ...s, factors: [f, ...s.factors] } : mul([f, s]));
    L = pre(x, e.lhs); R = pre(c, e.rhs);
    factor = env => evaluate(x, env);
  } else {
    const div = (s: Node, f: Node): Node => (s.k === 'frac' ? { ...s, den: s.den.k === 'mul' ? { ...s.den, factors: [...s.den.factors, f] } : mul([s.den, f]) } : frac(s, f));
    L = div(e.lhs, x); R = div(e.rhs, c);
    factor = env => 1 / evaluate(x, env);
  }
  const sym = { '+': '+', '-': '−', '*': '×', '/': '÷' }[op]!;
  return { eq: eq(L, R), label: `${sym} ${t(x)} both sides`, hints: newHints(), factor, conditions: cond, select: null };
}

/* ---------- the safety net ---------- */
let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

export function verify(before: Eq, r: MoveOk): string | null {
  const ids = allIds(r.eq);
  if (new Set(ids).size !== ids.length) return 'duplicate ids';
  const vars = symbols(eq(before.lhs, add([before.rhs, r.eq.lhs, r.eq.rhs])));
  let checked = 0;
  for (let i = 0; i < 40 && checked < 6; i++) {
    const env: Env = {};
    for (const v of vars) env[v] = Math.round((rand() * 9 - 4.5) * 1000) / 1000 + 0.137;
    const d0 = evaluate(before, env), d1 = evaluate(r.eq, env), f = r.factor(env);
    const want = f * d0;
    if (![d0, d1, f, want].every(Number.isFinite)) continue;
    checked++;
    if (Math.abs(d1 - want) > 1e-6 * (1 + Math.abs(want) + Math.abs(d1))) return `mismatch at ${JSON.stringify(env)}: ${d1} vs ${want}`;
  }
  return null;
}

function checked(e: Eq, r: MoveResult): MoveResult {
  if (isErr(r)) return r;
  const problem = verify(e, r);
  if (problem) {
    console.error('[algebrix] refused move', r.label, problem);
    return { error: 'The engine refused this: it would not keep the equation true.' };
  }
  return r;
}

export function applyMove(name: MoveName, e: Eq, sel: string | null): MoveResult {
  return checked(e, MOVES[name](e, sel));
}

export function applyBothChecked(e: Eq, text: string): MoveResult {
  return checked(e, applyBoth(e, text));
}

/** Is this equation solved for some variable? Returns that variable. */
export function solvedFor(e: Eq): string | null {
  for (const [a, b] of [[e.lhs, e.rhs], [e.rhs, e.lhs]] as const) {
    if (a.k === 'sym' && !symbols(b).includes(a.name)) return a.name;
  }
  return null;
}
