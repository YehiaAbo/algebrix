// The rail's letters and functions open in place when clicked: what a letter can be, what it
// equals so far, which equations use it and what it was named as; a function's definition, a
// small graph of it, and where it is used. One open at a time; click again to close.
import { Node, symbols, evaluate, DEFS, LETS, eq, call, sym } from '../engine/ast';
import { layout } from '../render/layout';
import { Stage } from '../render/stage';
import { toText } from '../engine/print';
import { solvedFor, Domain } from '../engine/moves';
import { DOMAIN_TEXT, mathHtml as plain, escapeHtml } from './shared';

/** math text with its single letters in italic, like the equation (sin, ln and tags stay upright) */
const mathHtml = (t: string) => plain(t).replace(/(^|[^a-zA-Z&#;<\/])([a-zA-Z])(?![a-zA-Z;])/g, '$1<i>$2</i>');
import type { App } from './app';

type Host = App;

/** the equations whose current line holds v (or a call of the function v) */
function usedIn(app: Host, v: string, fn = false): number[] {
  const out: number[] = [];
  app.slots.forEach((_, j) => {
    const e = app.eqOf(j);
    if (fn ? JSON.stringify(e).includes(`"name":"${v}"`) : symbols(e).includes(v)) out.push(j);
  });
  return out;
}

const chips = (app: Host, js: number[]) => js.length
  ? js.map(j => `<button class="ri-eq${j === app.cur ? ' here' : ''}" data-j="${j}" title="Go to equation ${j + 1}">${j + 1}</button>`).join('')
  : '<span class="ri-none">none yet</span>';

function wire(app: Host, card: HTMLElement) {
  card.querySelectorAll<HTMLButtonElement>('.ri-eq').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); app.switchTo(Number(b.dataset.j)); }));
}

/** the card under a letter */
export function letterCard(app: Host, v: string): HTMLElement {
  const card = document.createElement('div');
  card.className = 'ri-card';
  const rows: string[] = [];
  const now = app.domains[v] ?? 'real';
  rows.push(`<div class="ri-row stack"><span>Can be</span><b class="ri-doms">${(Object.keys(DOMAIN_TEXT) as Domain[]).map(d => `<button class="ri-dom${d === now ? ' on' : ''}" data-d="${d}">${DOMAIN_TEXT[d]}</button>`).join('')}</b></div>`);
  // what it equals so far: any equation solved for it with no other letters left
  const vals: string[] = [];
  app.slots.forEach((s, j) => {
    const e = app.eqOf(j);
    if (solvedFor(e) !== v) return;
    const other = e.lhs.k === 'sym' && e.lhs.name === v ? e.rhs : e.lhs;
    if (symbols(other).filter(w => w !== v).length) return;
    vals.push(`<span class="ri-val${s.bad ? ' bad' : ''}" title="${s.bad ? escapeHtml(s.bad) : `from equation ${j + 1}`}">${mathHtml(toText(other))}</span>`);
  });
  if (vals.length) rows.push(`<div class="ri-row"><span>Equals</span><b>${vals.join('<i class="ri-or">or</i>')}</b></div>`);
  const named = LETS.get(v);
  if (named) rows.push(`<div class="ri-row"><span>Named as</span><b>${mathHtml(`${v} = ${toText(named)}`)}</b></div>`);
  rows.push(`<div class="ri-row"><span>In equations</span><b class="ri-eqs">${chips(app, usedIn(app, v))}</b></div>`);
  const conds = (app.step?.conditions ?? []).filter(c => new RegExp(`(^|[^a-zα-ω])${v}([^a-zα-ω]|$)`).test(c));
  if (conds.length) rows.push(`<div class="ri-row"><span>Conditions</span><b>${conds.map(mathHtml).join(', ')}</b></div>`);
  card.innerHTML = rows.join('');
  wire(app, card);
  card.querySelectorAll<HTMLButtonElement>('.ri-dom').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); app.setDomain(v, b.dataset.d as Domain); }));
  return card;
}

/** math drawn the way the stage draws it (an integral as an integral), small */
export function mathEl(n: Node, size: number): HTMLElement {
  const lay = layout(n, size);
  const mini = document.createElement('div');
  mini.className = 'mini';
  mini.style.width = lay.w + 'px';
  mini.style.height = lay.asc + lay.desc + 'px';
  new Stage(mini).show(lay, 0, 0, null);
  return mini;
}

/** the card under a function: its definition, a small graph, where it is used */
export function fnCard(app: Host, name: string): HTMLElement {
  const d = DEFS.get(name)!;
  const card = document.createElement('div');
  card.className = 'ri-card';
  card.innerHTML = `<div class="ri-def"></div>`
    + (d.param.includes(',') ? '' : '<canvas class="ri-graph" height="120"></canvas>')
    + `<div class="ri-row"><span>Used in</span><b class="ri-eqs">${chips(app, usedIn(app, name, true))}</b></div>`;
  const def = call(name, sym(d.param));
  card.querySelector('.ri-def')!.append(mathEl(eq(def, d.body) as Node, 16));
  wire(app, card);
  const cv = card.querySelector<HTMLCanvasElement>('canvas');
  if (cv) requestAnimationFrame(() => miniGraph(cv, d.body, d.param));
  return card;
}

/** y = body over param, about −6 to 6, the height fitted to most of the values */
export function miniGraph(cv: HTMLCanvasElement, body: Node, p: string) {
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const c = cv.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const x0 = -6, x1 = 6, N = 96;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const x = x0 + (x1 - x0) * i / N;
    let y = NaN;
    try { y = evaluate(body, { [p]: x }); } catch { /* not defined here */ }
    pts.push([x, y]);
  }
  const ys = pts.map(q => q[1]).filter(Number.isFinite).sort((a, b) => a - b);
  if (!ys.length) { c.fillStyle = css('--muted'); c.font = '12px ' + css('--ui-font'); c.fillText('No real values from −6 to 6', 8, H / 2); return; }
  let lo = ys[Math.floor(ys.length * 0.05)], hi = ys[Math.ceil(ys.length * 0.95) - 1];
  if (lo > 0 && lo < (hi - lo)) lo = 0;
  if (hi < 0 && -hi < (hi - lo)) hi = 0;
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
  const X = (x: number) => (x - x0) / (x1 - x0) * W, Y = (y: number) => H - (y - lo) / (hi - lo) * H;
  c.strokeStyle = css('--line'); c.lineWidth = 1;
  for (let x = Math.ceil(x0); x <= x1; x++) { c.beginPath(); c.moveTo(Math.round(X(x)) + .5, 0); c.lineTo(Math.round(X(x)) + .5, H); c.globalAlpha = x % 5 ? .45 : .9; c.stroke(); }
  c.globalAlpha = 1;
  c.strokeStyle = css('--axis'); c.beginPath();
  c.moveTo(Math.round(X(0)) + .5, 0); c.lineTo(Math.round(X(0)) + .5, H);
  if (lo < 0 && hi > 0) { c.moveTo(0, Math.round(Y(0)) + .5); c.lineTo(W, Math.round(Y(0)) + .5); }
  c.stroke();
  c.strokeStyle = css('--graph-a'); c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath();
  let pen = false;
  for (const [x, y] of pts) {
    if (!Number.isFinite(y) || Y(y) < -H || Y(y) > 2 * H) { pen = false; continue; }
    if (pen) c.lineTo(X(x), Y(y)); else c.moveTo(X(x), Y(y));
    pen = true;
  }
  c.stroke();
  c.fillStyle = css('--muted'); c.font = '10.5px ' + css('--ui-font'); c.textBaseline = 'top';
  c.fillText(`${p} from −6 to 6`, 6, 5);
}
