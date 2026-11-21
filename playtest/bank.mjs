// The engine against a problem bank, in bulk: every problem in playtest/problems/*.txt is solved
// by the engine (what e does) and its answer checked against the book's. Writes
// playtest/REPORT.md: pass/fail by file and tag, and why each failure failed.
//
//   npm run bank                 (all files)
//   npm run bank -- calc         (files whose name contains "calc")
//
// A problem file: one problem a line, fields split by |, # starts a comment.
//   id | kind | problem | answer | tags
// kinds:
//   solve      an equation or inequality in x (solve:t for another letter). answer: values
//              "−1, 6" (any expression: sqrt(2), pi/6), "none", or an interval "x ∈ [−2, 2)"
//   value      a limit, a definite integral, a sum: answer a number (or inf, -inf, dne)
//   deriv      d/dx(…): answer the derivative, checked at many points
//   antideriv  ∫ … dx: answer an antiderivative, checked up to a constant
//   same       an expression to rewrite (simplify, a trig identity): answer an equal expression
// An answer of ? checks the engine against plain numbers instead of a key: a definite integral
// by Simpson's rule, a limit by values closer and closer, an antiderivative by its slope (finite
// differences), a derivative by finite differences of what was differentiated.
import { createServer } from 'vite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, server: { middlewareMode: true, hmr: false }, logLevel: 'error', appType: 'custom' });
const load = p => server.ssrLoadModule(p);
const { parseEquation, parseExpr } = await load('/src/engine/parse.ts');
const { solveAll } = await load('/src/engine/solve.ts');
const { finishCalc } = await load('/src/engine/calcmoves.ts');
const { evaluate, symbols } = await load('/src/engine/ast.ts');
const { toText } = await load('/src/engine/print.ts');

const filter = process.argv[2] ?? '';
const dir = join(root, 'playtest/problems');
const files = (await readdir(dir)).filter(f => f.endsWith('.txt') && f.includes(filter)).sort();
const num = t => { const s = t.trim().toLowerCase(); if (s === 'inf' || s === '∞') return Infinity; if (s === '-inf' || s === '−∞') return -Infinity; return evaluate(parseExpr(tidy(t.replace(/−/g, '-'))), {}); };
const close = (a, b) => (a === b) || Math.abs(a - b) <= 1e-6 * (1 + Math.abs(b));
/** the scraped book text writes a fraction as (a)/(b) and an integral's dx inside the top,
 *  (dx)/(…); in the app (a)/(b) c means a/(b c), so wrap each fraction whole and move dx out */
function tidy(src) {
  let dvar = '';
  const close = (s, i) => { for (let d = 0, j = i; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')' && --d === 0) return j; } return -1; };
  const go = s => {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '(') { out += s[i]; continue; }
      const j = close(s, i);
      if (j < 0) { out += s.slice(i); break; }
      // ln(x)/(x − 1): the bracket is a function's, so the fraction is ln(x) over (x − 1) already
      if (s.slice(j + 1, j + 3) === '/(' && !/[A-Za-z_^]$/.test(out)) {
        const k = close(s, j + 2);
        let top = s.slice(i + 1, j);
        const m = top.match(/(^|\s)d([a-zθ])\s*$/);
        if (m && /^int/.test(src.trim())) { dvar = m[2]; top = top.slice(0, m.index).trim() || '1'; }
        out += `((${go(top)})/(${go(s.slice(j + 3, k))}))`;
        i = k;
      } else { out += `(${go(s.slice(i + 1, j))})`; i = j; }
    }
    return out;
  };
  const t = go(src);
  return dvar ? `${t} d${dvar}` : t;
}
const pts = [0.37, 0.83, 1.29, 1.71, 2.13, 2.9, -0.61, -1.37, 3.3, 4.1, 7.5, 0.11, 0.23, -0.17, -0.29];

/** what e gives for an expression: the last line of the worked steps */
function worked(src) {
  const e = parseEquation(tidy(src), true);
  const r = finishCalc(e);
  const last = r.steps.length ? r.steps[r.steps.length - 1].eq : e;
  return { node: last.lhs, stuck: r.stuck, text: toText(last.lhs) };
}
function sameAt(f, g, v, upToConst) {
  let k = null, n = 0;
  for (const x of pts) {
    const a = evaluate(f, { [v]: x, C: 0 }), b = evaluate(g, { [v]: x, C: 0 });
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    n++;
    if (upToConst) { if (k === null) k = a - b; else if (Math.abs(a - b - k) > 1e-6 * (1 + Math.abs(a) + Math.abs(b))) return false; }
    else if (!close(a, b)) return false;
  }
  return n >= 3;
}

/** Simpson's rule on [a, b], skipping points where f is undefined (an end like 1/√x) */
function simpson(f, a, b) {
  const N = 20000, h = (b - a) / N;
  let s = 0;
  for (let i = 0; i <= N; i++) {
    let x = a + i * h;
    if (i === 0) x += h * 1e-3; else if (i === N) x -= h * 1e-3;
    const y = f(x);
    if (!Number.isFinite(y)) return NaN;
    s += y * (i === 0 || i === N ? 1 : i % 2 ? 4 : 2);
  }
  return (s * h) / 3;
}
/** the plain-number check for a ? answer */
function byNumbers(k, problem, got) {
  const e = parseEquation(tidy(problem), true), P = e.lhs;
  if (k === 'value' && P.k === 'int') {
    const a = evaluate(P.lo, {}), b = evaluate(P.hi, {});
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const want = simpson(x => evaluate(P.arg, { [P.v]: x }), a, b);
    return Number.isFinite(want) && Math.abs(got.value - want) <= 1e-5 * (1 + Math.abs(want)) ? null : `gave ${got.text} = ${got.value}, Simpson: ${want}`;
  }
  if (k === 'value' && P.k === 'lim') {
    const a = evaluate(P.to, {}), f = x => evaluate(P.arg, { [P.v]: x });
    const want = Number.isFinite(a) ? (f(a + 1e-6) + f(a - 1e-6)) / 2 : f(a > 0 ? 1e7 : -1e7);
    return Number.isFinite(want) && Math.abs(got.value - want) <= 1e-3 * (1 + Math.abs(want)) ? null : `gave ${got.text} = ${got.value}, numbers say ${want}`;
  }
  const slope = (n, v, x) => { const h = 1e-5 * (1 + Math.abs(x)); return (evaluate(n, { [v]: x + h, C: 0 }) - evaluate(n, { [v]: x - h, C: 0 })) / (2 * h); };
  const agree = (f, g, v) => { let n = 0; for (const x of pts) { const a = f(x), b = g(x); if (!Number.isFinite(a) || !Number.isFinite(b)) continue; n++; if (Math.abs(a - b) > 1e-4 * (1 + Math.abs(b))) return false; } return n >= 3; };
  if (k === 'antideriv' && P.k === 'int') return agree(x => slope(got.node, P.v, x), x => evaluate(P.arg, { [P.v]: x }), P.v) ? null : `gave ${got.text}: its slope is not the integrand`;
  if (k === 'deriv' && P.k === 'deriv') return agree(x => evaluate(got.node, { [P.v]: x }), x => slope(P.arg, P.v, x), P.v) ? null : `gave ${got.text}: not the slope of ${toText(P.arg)}`;
  return `no plain-number check for ${k} here`;
}

function run(kind, problem, answer) {
  const [k, v = 'x'] = kind.split(':');
  if (k === 'solve') {
    const r = solveAll(parseEquation(tidy(problem)), v);
    if ('error' in r) return `e stops: ${r.error}`;
    const a = answer.trim();
    if (r.text !== undefined || /∈|no solution|all real/.test(a)) return r.text === a ? null : `gave "${r.text ?? r.values.join(', ')}", book: "${a}"`;
    const want = a === 'none' ? [] : a.split(/\s*[,;]\s*/).map(num).sort((p, q) => p - q);
    const got = [...r.values].sort((p, q) => p - q);
    return got.length === want.length && got.every((g, i) => close(g, want[i])) ? null : `gave ${got.map(x => +x.toFixed(6)).join(', ') || 'none'}, book: ${a}`;
  }
  const w = worked(problem);
  if (w.stuck) return `e stops: ${w.stuck} (at ${w.text})`;
  if (answer.trim() === '?') {
    if (k === 'value' && symbols(w.node).length) return `not a number: ${w.text}`;
    return byNumbers(k, problem, { ...w, value: k === 'value' ? evaluate(w.node, {}) : NaN });
  }
  if (k === 'value') {
    if (symbols(w.node).length) return `not a number: ${w.text}`;
    const got = evaluate(w.node, {}), want = num(answer);
    return close(got, want) ? null : `gave ${w.text} = ${got}, book: ${answer}`;
  }
  const want = parseExpr(tidy(answer.replace(/−/g, '-')));
  const vv = symbols(want)[0] ?? 'x';
  if (k === 'deriv' || k === 'same') return sameAt(w.node, want, vv, false) ? null : `gave ${w.text}, book: ${answer}`;
  if (k === 'antideriv') return sameAt(w.node, want, vv, true) ? null : `gave ${w.text}, book: ${answer} (+ C)`;
  return `unknown kind ${kind}`;
}

const rows = [];
for (const f of files) {
  for (const [n, line] of (await readFile(join(dir, f), 'utf8')).split('\n').entries()) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const [id, kind, problem, answer, tags = ''] = t.split('|').map(s => s.trim());
    let why;
    const t0 = performance.now();
    try { why = run(kind, problem, answer); } catch (e) { why = `crash: ${e.message}`; }
    const ms = performance.now() - t0;
    if (!why && ms > 1500) why = `slow: ${Math.round(ms)} ms`;
    rows.push({ file: f, line: n + 1, id, kind, problem, answer, tags: tags.split(/\s*,\s*/).filter(Boolean), why });
  }
}
await server.close();

const pass = rows.filter(r => !r.why).length;
const by = key => { const m = new Map(); for (const r of rows) for (const k of [].concat(key(r))) { const s = m.get(k) ?? [0, 0]; s[1]++; if (!r.why) s[0]++; m.set(k, s); } return [...m].sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]); };
const pct = ([a, b]) => `${a}/${b}`;
let md = `# Bank report\n\n${pass} of ${rows.length} solved by the engine (${new Date().toISOString().slice(0, 16)} UTC).\n\n`;
md += `| file | solved |\n|---|---|\n${by(r => r.file).map(([k, s]) => `| ${k} | ${pct(s)} |`).join('\n')}\n\n`;
md += `| tag | solved |\n|---|---|\n${by(r => r.tags.length ? r.tags : ['(none)']).map(([k, s]) => `| ${k} | ${pct(s)} |`).join('\n')}\n\n`;
md += `## Failures\n\n${rows.filter(r => r.why).map(r => `- **${r.id}** (${r.file}:${r.line}, ${r.kind}) \`${r.problem}\`: ${r.why}`).join('\n') || 'None.'}\n`;
await writeFile(join(root, 'playtest/REPORT.md'), md);
console.log(`${pass}/${rows.length} solved. Report: playtest/REPORT.md`);
for (const r of rows.filter(r => r.why)) console.log(`  ✗ ${r.id}: ${r.why}`);
process.exit(0);
