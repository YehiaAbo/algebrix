// What a piece of work is for: an identity to prove, a function to unfold or invert.
import { Node, Eq, eq, sym, call, cloneFresh, find, key, walk, evaluate, symbols, replace, Env } from './ast';
import { MoveResult, checked, sampleIn, solvedFor } from './moves';
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
  const body = substituteSym(cloneFresh(d.body), d.param, c.arg);
  return checked(e, { eq: replace(e, c.id, body), label: `unfold ${c.name}`, hints: newHints(), factor: () => 1, select: body.id, rule: 'unfold' });
}

import { DEFS } from './ast';
const defsOf = () => DEFS;

/** f(x) = body → f⁻¹(x) = …, by solving y = body for x */
export function inverseFunction(d: Eq): Eq | { error: string } {
  if (d.rel !== 'def' || d.lhs.k !== 'call' || d.lhs.arg.k !== 'sym') return { error: 'Aim at a definition like f(x) = 2x + 3.' };
  const p = d.lhs.arg.name;
  const out = symbols(d.rhs).includes('y') ? 'w' : 'y';
  const steps = isolate(eq(sym(out), cloneFresh(d.rhs)), p);
  if (!Array.isArray(steps)) return steps;
  const last = steps.length ? steps[steps.length - 1].eq : null;
  if (!last || solvedFor(last) !== p) return { error: `${toText(d.lhs)} can't be solved for ${p} here, so I can't build its inverse.` };
  const expr = last.lhs.k === 'sym' && last.lhs.name === p ? last.rhs : last.lhs;
  if (steps.some(s => (s.conditions ?? []).some(c => c.includes('add solutions')))) return { error: `${d.lhs.k === 'call' ? d.lhs.name : 'f'} isn't one-to-one everywhere, so it has no single inverse. Limit its domain first.` };
  return eq(call(`${d.lhs.name}⁻¹`, sym(p)), substituteSym(expr, out, sym(p)), 'def');
}
