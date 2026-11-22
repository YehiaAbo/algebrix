// What a piece of work is for: an identity to prove, a function to unfold or invert.
import { Node, Eq, eq, sym, neg, call, cloneFresh, find, findPath, key, walk, evaluate, symbols, replace, Env, children, withChildren, paramsOf, argsOf } from './ast';
import { MoveResult, checked, sampleIn, solvedFor, domainOf } from './moves';
import { isolate } from './techniques';
import { newHints } from './simplify';
import { toText } from './print';

/** true when both sides agree for every value tried: an identity, so the goal is a proof */
export function isIdentity(e: Eq): boolean {
  if ((e.rel ?? '=') !== '=') return false;
  const vars = symbols(e);
  if (!vars.length) return false;
  let seen = 0;
  for (let i = 0; i < 40; i++) {
    const env: Env = {};
    vars.forEach(v => (env[v] = sampleIn(v, i)));
    const a = evaluate(e.lhs, env), b = evaluate(e.rhs, env);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.abs(a - b) > 1e-8 * (1 + Math.abs(a))) return false;
    seen++;
  }
  return seen >= 6;
}

/** a proof is done when both sides are written the same way */
export const isProved = (e: Eq) => key(e.lhs) === key(e.rhs) || toText(e.lhs) === toText(e.rhs);

function substituteSym(n: Node, name: string, by: Node): Node {
  let out = n;
  const hits: string[] = [];
  walk(n, m => { if (m.k === 'sym' && m.name === name) hits.push(m.id); });
  for (const id of hits) out = replace(out, id, cloneFresh(by));
  return out;
}

/** f(a) → the body of f with a in place of its variable */
export function unfold(e: Eq, sel: string | null, defs = defsOf()): MoveResult {
  const aimed = sel && sel !== 'eq' ? find(e, sel) : null;
  let target: Node | null = aimed?.k === 'call' ? aimed : null;
  if (!target) walk(e, n => { if (!target && n.k === 'call' && defs.has(n.name)) target = n; });
  const c = target as Node | null;
  if (!c || c.k !== 'call') return { error: 'Nothing to unfold. Define a function first, like f(x) = x^2, then use f(3) or f(x + 1).' };
  const d = defs.get(c.name);
  if (!d) return { error: `${c.name} isn't defined yet. Add an equation like ${c.name}(x) = …` };
  const ps = paramsOf(d), as = argsOf(c);
  if (ps.length !== as.length) return { error: `${c.name} takes ${ps.length} input${ps.length > 1 ? 's' : ''}: ${c.name}(${ps.join(', ')}).` };
  // all at once, so f(y, x) swaps the letters rather than putting one into the other
  const put = (m: Node): Node => (m.k === 'sym' && ps.includes(m.name) ? cloneFresh(as[ps.indexOf(m.name)]) : withChildren(m, children(m).map(put)));
  const body = put(cloneFresh(d.body));
  return checked(e, { eq: replace(e, c.id, body), label: `unfold ${c.name}`, hints: newHints(), factor: () => 1, select: body.id, rule: 'unfold' });
}

import { DEFS } from './ast';
const defsOf = () => DEFS;

/** the A with body[p := A] written exactly as n, read off where p sits (x^t against x^5: t is 5) */
function match(body: Node, p: string, n: Node, got: { a?: Node }): boolean {
  if (body.k === 'sym' && body.name === p) {
    if (got.a) return key(got.a) === key(n);
    got.a = n;
    return true;
  }
  let has = false;
  walk(body, m => { if (m.k === 'sym' && m.name === p) has = true; });
  if (!has) return key(body) === key(n);
  const kb = children(body), kn = children(n);
  if (body.k !== n.k || kb.length !== kn.length) return false;
  // what isn't a child (the operator, the letter of dx) has to match too
  if (key(withChildren(body, kn)) !== key(n)) return false;
  return kb.every((c, i) => match(c, p, kn[i], got));
}

/** fold, unfold backwards: a piece written out like a function you defined becomes that function
 *  of something (∫₀¹ (x⁵ − 1)/ln x dx with I(t) = ∫₀¹ (xᵗ − 1)/ln x dx is I(5)) */
export function fold(e: Eq, sel: string | null, defs = defsOf()): MoveResult {
  // the aimed piece or the smallest piece around it that folds; nothing aimed: the first that folds
  const path = sel && sel !== 'eq' ? findPath(e, sel) : null;
  const cands: Node[] = [];
  if (path) cands.push(...[...path].reverse());
  else walk(e, n => { cands.push(n); });
  for (const P of cands) {
    if (P.k === 'eq' || P.k === 'call') continue;
    for (const [F, d] of defs) {
      const got: { a?: Node } = {};
      if (d.param.includes(',') || !match(d.body, d.param, P, got) || !got.a) continue;
      const c = call(F, cloneFresh(got.a));
      return checked(e, { eq: replace(e, P.id, c), label: `fold into ${F}(${toText(got.a)})`, hints: newHints(), factor: () => 1, select: c.id, rule: 'fold' });
    }
  }
  const P = path ? path[path.length - 1] : null;
  if (!P || P.k === 'eq') return { error: 'Nothing here is written like a function you defined. Define one (I(t) = …), then fold.' };
  return { error: `${toText(P)} isn't written like any function you defined. Define one (I(t) = …), then fold.` };
}

/** f(x) = body → f⁻¹(x) = …, by solving y = body for x */
export function inverseFunction(d: Eq): Eq | { error: string } {
  if (d.rel !== 'def' || d.lhs.k !== 'call' || d.lhs.arg.k !== 'sym') return { error: 'Aim at a definition like f(x) = 2x + 3.' };
  const p = d.lhs.arg.name;
  const out = symbols(d.rhs).includes('y') ? 'w' : 'y';
  const steps = isolate(eq(sym(out), cloneFresh(d.rhs)), p);
  if (!Array.isArray(steps)) return steps;
  let last = steps.length ? steps[steps.length - 1].eq : null;
  // |A| = R (x² gives |x| = √y): two branches, A = R and A = −R. Only a limited domain picks one
  if (last && solvedFor(last) !== p) {
    const bar = [last.lhs, last.rhs].find(s => s.k === 'fn' && s.name === 'abs' && symbols(s).includes(p)) as Extract<Node, { k: 'fn' }> | undefined;
    if (bar) {
      const R = bar === last.lhs ? last.rhs : last.lhs, dom = domainOf(p);
      const name = d.lhs.k === 'call' ? d.lhs.name : 'f';
      if (dom !== 'positive' && dom !== 'nonneg') return { error: `${name} isn't one-to-one (two values of ${p} give the same value), so it has no inverse as it stands. Limit its domain first: click ${p} in the letters list until it says ≥ 0 or > 0, then ask again.` };
      for (const sign of [1, -1]) {
        const start = eq(cloneFresh(bar.arg), sign > 0 ? cloneFresh(R) : neg(cloneFresh(R)));
        const branch = solvedFor(start) === p ? [] : isolate(start, p);
        const end = !Array.isArray(branch) ? null : branch.length ? branch[branch.length - 1].eq : start;
        if (!end || solvedFor(end) !== p) continue;
        const x = end.lhs.k === 'sym' && end.lhs.name === p ? end.rhs : end.lhs;
        // the branch whose answers lie in the domain and give back y
        let ok = 0, bad = 0;
        // (it has to give back every input of the domain, not only some)
        for (let i = 0; i < 24; i++) {
          const pv = 0.05 + i * 0.4, yv = evaluate(d.rhs, { [p]: pv });
          const xv = evaluate(x, { [out]: yv });
          if (!Number.isFinite(yv)) continue;
          if (Math.abs(xv - pv) < 1e-7 * (1 + pv)) ok++; else bad++;
        }
        if (ok >= 6 && !bad) { last = eq(sym(p), x); steps.length = 0; break; }
      }
      if (solvedFor(last) !== p) return { error: `${name} still isn't one-to-one where ${p} ${dom === 'positive' ? '> 0' : '≥ 0'} (it turns around inside it), so it has no single inverse there.` };
    }
  }
  if (!last || solvedFor(last) !== p) return { error: `${toText(d.lhs)} can't be solved for ${p} here, so I can't build its inverse.` };
  const expr = last.lhs.k === 'sym' && last.lhs.name === p ? last.rhs : last.lhs;
  if (steps.some(s => (s.conditions ?? []).some(c => c.includes('add solutions')))) return { error: `${d.lhs.k === 'call' ? d.lhs.name : 'f'} isn't one-to-one everywhere, so it has no single inverse. Limit its domain first.` };
  return eq(call(`${d.lhs.name}⁻¹`, sym(p)), substituteSym(expr, out, sym(p)), 'def');
}
