// The player: plays the problem bank through the real app the way a person does, with no model in
// the loop, so it can run on every problem for free. See docs/ARCHITECTURE.md 8.7.
//
//   npm run build && npm run player                 (every file in playtest/problems)
//   npm run player -- calc1                         (files whose name contains "calc1")
//   MODE=shortcuts npm run player                   (hands is the default: general moves only)
//   ONLY=H-L4 npm run player                        (one problem, with its search printed)
//   WORKERS=4 BUDGET=40 SECONDS=60 npm run player   (pages in parallel; expansions and time per problem)
//
// How it plays. It sees what a person sees: the equation, the pieces it can aim at, and what the
// keys and menus offer there (Tab's forms and techniques, C's, f's inverse). From each equation it
// tries every offer on every piece, by the same key presses a person makes, and goes on best-first
// toward the goal (the letter alone; no ∫, lim, d/dx or Σ left). In hands mode it never presses e
// and never takes an entry marked as a chain. The app's drawing is off while it searches.
//
// What it writes. playtest/PLAYER.md: how many problems it finished, and every failure grouped by
// its signature (what was left, and the most common refusal there), each group labelled with a
// guess at its kind (wrong maths, general gap, typing, slow). One example per group is enough to
// diagnose it: that is the point of grouping.
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const MODE = process.env.MODE ?? 'hands';
const WORKERS = Number(process.env.WORKERS ?? 4), BUDGET = Number(process.env.BUDGET ?? 40), SECONDS = Number(process.env.SECONDS ?? 60);
const ONLY = process.env.ONLY ?? '';
const filter = process.argv[2] ?? '';

// the engine in Node, to read the equations the page shows and judge them against the book
const server = await createServer({ root, server: { middlewareMode: true, hmr: false }, logLevel: 'error', appType: 'custom' });
const load = p => server.ssrLoadModule(p);
const { parseEquation, parseExpr } = await load('/src/engine/parse.ts');
const { evaluate, symbols, walk } = await load('/src/engine/ast.ts');
const { solvedFor } = await load('/src/engine/moves.ts');

/* ---------- problems ---------- */

/** the scraped book text writes a fraction as (a)/(b) and an integral's dx inside the top: same reading as bank.mjs */
function tidy(src) {
  let dvar = '';
  const close = (s, i) => { for (let d = 0, j = i; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')' && --d === 0) return j; } return -1; };
  const go = s => {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '(') { out += s[i]; continue; }
      const j = close(s, i);
      if (j < 0) { out += s.slice(i); break; }
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

async function problems() {
  const dir = join(root, 'playtest/problems');
  const out = [];
  for (const f of (await readdir(dir)).filter(f => f.endsWith('.txt') && f.includes(filter)).sort()) {
    for (const line of (await readFile(join(dir, f), 'utf8')).split('\n')) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      const [id, kind, problem, answer = '?', tags = ''] = line.split('|').map(s => s.trim());
      if (ONLY && id !== ONLY) continue;
      const [k, v = 'x'] = kind.split(':');
      // what is typed into the app: a name for the thing to work out, so it is an equation
      const name = { value: 'L', deriv: 'y', antideriv: 'F' }[k];
      out.push({ id, file: f, kind: k, v, name, answer, tags, start: name ? `${name} = ${tidy(problem)}` : tidy(problem) });
    }
  }
  return out;
}

/* ---------- judging, in Node ---------- */

const CALC = new Set(['deriv', 'int', 'lim', 'sum', 'at', 'grad']);
const count = (n, f) => { let c = 0; walk(n, m => { if (f(m)) c++; }); return c; };
const close = (a, b) => a === b || Math.abs(a - b) <= 1e-6 * (1 + Math.abs(b));
const num = t => { const s = t.trim().toLowerCase(); if (s === 'inf' || s === '∞') return Infinity; if (s === '-inf' || s === '−∞') return -Infinity; return evaluate(parseExpr(tidy(t.replace(/−/g, '-'))), {}); };

/** how far an equation is from done (0 = done), for the search to go toward */
function distance(P, text) {
  let e;
  try { e = parseEquation(text, true); } catch { return 1e9; }
  const size = count(e, () => true);
  // a letter the problem didn't have (a name, u) still has to go back: not done while one is left
  const from = new Set([...symbols(parseEquation(P.start, true)), 'C', 'C_1', 'C_2']);
  const foreign = symbols(e).filter(v => !from.has(v)).length * 4;
  if (P.kind === 'solve') {
    const there = count(e, m => m.k === 'sym' && m.name === P.v);
    if (solvedFor(e) === P.v && !foreign) return 0;
    const both = count(e.lhs, m => m.k === 'sym' && m.name === P.v) && count(e.rhs, m => m.k === 'sym' && m.name === P.v);
    return there * 3 + (both ? 4 : 0) + foreign + size / 20;
  }
  // the name (L, y, F) alone on one side, with no calculus left on the other
  const calc = count(e, m => CALC.has(m.k));
  const alone = solvedFor(e) === P.name;
  const other = alone ? (e.lhs.k === 'sym' && e.lhs.name === P.name ? e.rhs : e.lhs) : null;
  if (alone && !calc && !foreign && !(P.kind === 'value' && symbols(other).length)) return 0;
  return foreign + calc * 6 + (alone ? 0 : 5) + (P.kind === 'value' && other && symbols(other).length ? 2 : 0) + size / 20;
}
/** the side that holds the answer: across from the name */
const answerSide = (P, e) => (e.lhs.k === 'sym' && e.lhs.name === (P.name ?? P.v) ? e.rhs : e.lhs);

/** done, and right? null = right; a string says what is wrong */
function judge(P, text) {
  const e = parseEquation(text, true);
  if (P.kind === 'solve') {
    const side = answerSide(P, e);
    if (P.answer === '?' || /∈|none|all/.test(P.answer)) return null;
    const want = P.answer.split(/\s*[,;]\s*/).map(num), got = evaluate(side, {});
    return want.some(w => close(got, w)) ? null : `gave ${P.v} = ${got}, book: ${P.answer}`;
  }
  if (P.kind === 'value') {
    if (P.answer === '?') return null;
    const got = evaluate(answerSide(P, e), {}), want = num(P.answer);
    return close(got, want) ? null : `gave ${got}, book: ${P.answer}`;
  }
  // deriv and antideriv: the bank's own numeric checks run on the start; here, same slope or value
  const start = parseEquation(P.start, true).rhs;
  const v = start.v ?? 'x';
  // small ones too: a domain may be narrow (√(1 − 4x²) lives on |x| ≤ ½)
  const pts = [0.07, 0.19, 0.31, 0.43, -0.23, 0.37, 0.83, 1.29, 1.71, 2.13, -0.61, 3.3];
  const slope = (n, x) => { const h = 1e-5 * (1 + Math.abs(x)); return (evaluate(n, { [v]: x + h, C: 0 }) - evaluate(n, { [v]: x - h, C: 0 })) / (2 * h); };
  const agree = (f, g) => { let n = 0; for (const x of pts) { const a = f(x), b = g(x); if (!Number.isFinite(a) || !Number.isFinite(b)) continue; n++; if (Math.abs(a - b) > 1e-4 * (1 + Math.abs(b))) return false; } return n >= 3; };
  const got = answerSide(P, e);
  if (P.kind === 'deriv') return agree(x => evaluate(got, { [v]: x }), x => slope(start.arg, x)) ? null : 'not the slope';
  if (P.kind === 'antideriv') return agree(x => slope(got, x), x => evaluate(start.arg, { [v]: x })) ? null : 'its slope is not the integrand';
  return null;
}

/* ---------- the page: what a person can do, with drawing off ---------- */

const PAGE = () => {
  const a = window.algebrix, P = Object.getPrototypeOf(a);
  const off = ['renderAll', 'renderMain', 'renderTree', 'renderHints', 'renderRail', 'renderSelection', 'renderSpot', 'renderHub', 'renderPal', 'renderOriginal', 'bubble', 'place', 'giveBackRoom', 'save', 'drawGraphSoon', 'entrance', 'flyFrom'];
  for (const k of off) if (typeof P[k] === 'function') a[k] = () => {};
  // renderAll also brings the names and definitions up to date (the engine's context): keep that part
  a.renderAll = () => { a.syncDefs(); a.syncLets(); };
  a.graph.draw = () => {};
  let refused = null;
  a.refuse = t => { refused = t; };
  a.say = () => {};
  const send = (key, type = 'keydown', extra = {}) => window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, ...extra }));
  const tap = key => { send(key); send(key, 'keyup'); };
  const kids = n => { const out = []; for (const [k, v] of Object.entries(n)) { if (k === 'id') continue; if (Array.isArray(v)) v.forEach(x => x && typeof x === 'object' && x.k && out.push(x)); else if (v && typeof v === 'object' && v.k) out.push(v); } return out; };
  /** the pieces a person can aim at, by their place (ids change every time the equation is loaded) */
  const pieces = eq => {
    const out = [];
    const go = (n, path, depth) => { if (n.k !== 'eq') out.push({ path, depth, k: n.k }); kids(n).forEach((c, i) => go(c, [...path, i], depth + 1)); };
    go(eq, [], 0);
    // the sides and the calculus first, then shallow pieces: a person aims at what matters
    const score = p => (['deriv', 'int', 'lim', 'sum', 'at'].includes(p.k) ? 0 : 1) * 10 + p.depth;
    return out.sort((x, y) => score(x) - score(y)).slice(0, 14);
  };
  const at = (eq, path) => path.reduce((n, i) => kids(n)[i], eq);
  const start = text => { a.closeModes?.(); a.hub = null; a.mode = 'solve'; a.loadFresh(text); a.flush(); refused = null; };
  const aim = path => { a.select(path.length ? at(a.eq, path).id : null, true); };
  /** play keys at a piece (by its place in the equation you are on) */
  const press = (path, keys) => {
    try { aim(path); } catch { return false; }
    for (const k of keys) { if (k === 'box:Enter') { if (a.mode === 'op') a.opKey(new KeyboardEvent('keydown', { key: 'Enter' })); } else if (k.startsWith('up:')) send(k.slice(3), 'keyup'); else if (k.startsWith('Shift+')) send(k.slice(6), 'keydown', { shiftKey: true }); else send(k); }
    a.flush();
    if (a.mode !== 'solve') { tap('Escape'); tap('Escape'); }
    return true;
  };
  /** from the problem as typed, replay the moves so far (names, definitions and other equations come
   *  with them, as when you play), then the new keys */
  const replay = (text, hist) => {
    start(text);
    if (a.slots.length !== 1) return false;
    for (const [p, k] of hist) if (!press(p, k)) return false;
    refused = null;
    return true;
  };
  const run = (text, hist, path, keys) => {
    if (!replay(text, hist)) return { error: 'did not load' };
    if (!press(path, keys)) return { error: 'no such piece' };
    return { eq: window.toText(a.eq), cur: a.cur, slots: a.slots.map(s => window.toText(s.steps[s.at].eq)), refused };
  };
  /** every offer at every piece: [label, path, keys] */
  const offers = (text, hist, hands) => {
    const start = () => replay(text, hist);
    start();
    const out = [];
    for (const { path, k: kind } of pieces(a.eq)) {
      for (const k of ['m', 's', 'd', 'Shift+ArrowUp', 'Shift+ArrowDown']) out.push([k, path, [k]]);
      // Tab, tapped: its forms (a chord, or browsed to and applied) and techniques that need nothing typed
      start(); aim(path); tap('Tab');
      const h = a.hub;
      if (h) {
        h.forms.forEach((f, i) => out.push([`Tab ${f.name}`, path, f.chord ? ['Tab', 'up:Tab', f.chord] : ['Tab', 'up:Tab', ...Array(i + 1).fill('ArrowRight'), 'Tab']]));
        for (const t of h.techs) if (t.ok && !['q', '=', 'm', 'k'].includes(t.key) && !/^[1-9]$/.test(t.key) && !t.label.endsWith('…')) out.push([`Tab ${t.label}`, path, ['Tab', 'up:Tab', t.key]]);
        tap('Escape');
      }
      // C, tapped: what applies here, nothing typed; chains only with shortcuts
      start(); aim(path); tap('c');
      if (a.hub) { for (const t of a.hub.techs) if (t.ok && !t.ask && !(hands && t.shortcut)) out.push([`C ${t.label}`, path, ['c', 'up:c', t.key]]); tap('Escape'); }
      out.push(['f inverse', path, ['f', 'up:f', 'i']]);
      // name a piece (b, the letter it suggests, Enter): how a u-substitution starts by hand
      if (path.length >= 2 && !['sym', 'num'].includes(kind)) out.push(['b name it', path, ['b', 'box:Enter']]);
    }
    // to another equation (a name's own, u = ln x, to take its differentials): its number
    a.slots.forEach((_, j) => { if (j !== a.cur) out.push([`go to equation ${j + 1}`, [], [String(j + 1)]]); });
    if (!hands) out.push(['e', [], ['e']]);
    return out;
  };
  window.__player = { run, offers };
};

/* ---------- the search ---------- */

async function play(page, P) {
  const t0 = Date.now();
  const seen = new Map([[P.start, null]]);
  const open = [{ text: P.start, hist: [], path: [], g: 0, h: distance(P, P.start) }];
  const refusals = new Map();
  let best = open[0], expansions = 0, slowest = 0;
  while (open.length && expansions < BUDGET && Date.now() - t0 < SECONDS * 1000) {
    open.sort((x, y) => (x.h + x.g * 0.3) - (y.h + y.g * 0.3));
    const s = open.shift();
    expansions++;
    const offers = await page.evaluate(([t, hi, h]) => window.__player.offers(t, hi, h), [P.start, s.hist, MODE === 'hands']);
    for (const [label, path, keys] of offers) {
      const k0 = Date.now();
      const r = await page.evaluate(([t, hi, p, k]) => window.__player.run(t, hi, p, k), [P.start, s.hist, path, keys]);
      slowest = Math.max(slowest, Date.now() - k0);
      if (r.error) continue;
      if (r.refused) { const why = r.refused.replace(/[0-9.]+/g, '#').slice(0, 90); refusals.set(why, (refusals.get(why) ?? 0) + 1); }
      // the equation the move leaves you on (one case of a split, or the one a name came off)
      // the problem's own equation is the first one: it is what has to end up solved
      const next = r.slots[0] ?? r.eq, state = r.slots.join(' ; ') + ' @ ' + r.cur;
      if (seen.has(state)) continue;
      seen.set(state, s.text);
      const n = { text: next, hist: [...s.hist, [path, keys]], path: [...s.path, `${label} @${path.join('.') || 'all'}`], g: s.g + 1, h: distance(P, next) };
      if (n.h === 0) {
        let wrong = null;
        try { wrong = judge(P, next); } catch (e) { wrong = 'could not judge: ' + e.message; }
        return { ok: !wrong, wrong, steps: n.path, end: next, expansions, ms: Date.now() - t0, slowest };
      }
      if (n.h < best.h) best = n;
      open.push(n);
    }
  }
  const timeout = Date.now() - t0 >= SECONDS * 1000;
  // triage: can the shortcut (e) do it from the start? then the hands route is what's missing or too long
  const e = await page.evaluate(t => window.__player.run(t, [], [], ['e']), P.start);
  const eDone = !e.error && distance(P, e.eq) === 0 && !judge(P, e.eq);
  const eSays = e.error ? e.error : e.refused ? e.refused.replace(/-?[0-9.]+/g, '#').slice(0, 90) : distance(P, e.eq) < distance(P, P.start) ? 'gets further' : 'does nothing';
  return { ok: false, best, eDone, eSays, refusals: [...refusals].sort((x, y) => y[1] - x[1]).slice(0, 3), expansions, ms: Date.now() - t0, slowest, timeout };
}

/** what was left where it got stuck: the kind of the hardest piece and the most common refusal */
function signature(P, r) {
  if (r.wrong) return `wrong maths: ${r.wrong.replace(/-?[0-9.]+(e-?\d+)?/g, '#')}`;
  let left = 'nothing recognisable';
  try {
    const e = parseEquation(r.best.text, true);
    const kinds = [];
    walk(e, m => { if (CALC.has(m.k)) kinds.push(m.k === 'int' ? `∫ of ${m.arg.k}` : m.k === 'lim' ? `lim of ${m.arg.k}` : m.k); });
    left = kinds.length ? kinds.slice(0, 2).join(', ') : P.kind === 'solve' ? `${P.v} not alone (${e.lhs.k} = ${e.rhs.k})` : 'letters left';
  } catch (e) { left = 'unreadable: ' + e.message.slice(0, 40); }
  return r.eDone ? `${left} | e does it, by hand not found` : `${left} | e: ${r.eSays}`;
}

function kindOf(sig, r) {
  if (sig.startsWith('wrong maths')) return 'wrong maths';
  if (r.timeout || r.slowest > 1000) return 'slow';
  if (/unreadable|did not load/.test(sig)) return 'typing';
  return r.eDone ? 'clumsy (shortcut only)' : 'general gap';
}

/* ---------- run ---------- */

const list = await problems();
const browser = await chromium.launch();
const results = [];
let next = 0;
async function worker() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto('file://' + join(root, 'dist/index.html'));
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('algebrix.toured', '1'); localStorage.setItem('algebrix.prefs', JSON.stringify({ speed: 'flash', muted: true })); });
  await page.reload();
  await page.waitForFunction(() => !!window.algebrix);
  await page.evaluate(PAGE);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 160)));
  while (next < list.length) {
    const P = list[next++];
    errors.length = 0;
    let r;
    try { r = await play(page, P); } catch (e) { r = { ok: false, best: { text: P.start, path: [] }, refusals: [], error: String(e.message).slice(0, 160) }; }
    if (errors.length) r.pageErrors = [...errors];
    results.push({ P, r });
    process.stdout.write(r.ok ? '✓' : r.wrong ? '⚠' : '✗');
    if (ONLY) console.log('\n' + JSON.stringify(r, null, 1));
  }
  await page.close();
}
const t0 = Date.now();
await Promise.all(Array.from({ length: Math.min(WORKERS, list.length) }, worker));
await browser.close();
await server.close();

const done = results.filter(x => x.r.ok), wrong = results.filter(x => x.r.wrong), stuck = results.filter(x => !x.r.ok && !x.r.wrong);
const groups = new Map();
for (const x of [...wrong, ...stuck]) {
  const sig = x.r.error ? `player error: ${x.r.error.slice(0, 80)}` : signature(x.P, x.r);
  const g = groups.get(sig) ?? { sig, kind: kindOf(sig, x.r), items: [] };
  g.items.push(x);
  groups.set(sig, g);
}
const order = ['wrong maths', 'general gap or clumsy', 'typing', 'slow'];
const sorted = [...groups.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.items.length - a.items.length);
const lines = [
  `# Player report (${MODE})`, '',
  `${new Date().toISOString().slice(0, 16)}Z, ${results.length} problems in ${Math.round((Date.now() - t0) / 1000)} s: ` +
  `**${done.length} finished**, ${wrong.length} wrong, ${stuck.length} stuck. Budget ${BUDGET} expansions, ${SECONDS} s each.`, '',
  '## Failures by signature', '',
  ...sorted.flatMap(g => {
    const ex = g.items[0];
    return [`### ${g.kind}: ${g.sig} (${g.items.length})`, '',
      `Problems: ${g.items.map(x => x.P.id).join(', ')}`, '',
      `Example ${ex.P.id}: \`${ex.P.start}\` reached \`${ex.r.end ?? ex.r.best?.text}\` by ${(ex.r.steps ?? ex.r.best?.path ?? []).join(' → ') || 'nothing'}`, ''];
  }),
  '## Finished', '',
  ...done.map(x => `- ${x.P.id}: ${x.r.steps.length} steps (${x.r.steps.join(' → ')})`),
];
await writeFile(join(root, 'playtest/PLAYER.md'), lines.join('\n') + '\n');
console.log(`\n${done.length}/${results.length} finished, ${wrong.length} wrong, ${stuck.length} stuck, ${groups.size} signatures → playtest/PLAYER.md`);
