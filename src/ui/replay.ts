// Replay (P): the current equation's steps played again from its start, at the speed you set.
// ← → change the speed while it plays (the same speed as the setting); Esc or any other key stops
// it where you were. Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { prefs, setPref, ms } from './prefs';
import { sound } from './sound';
import * as sheet from './sheet';
import { $ } from './shared';
import type { App } from './app';

const STEP = 0.25, MIN = 0.5, MAX = 3;

export function startReplay(this: App) {
  const slot = this.slot;
  if (!slot || slot.steps.length < 2) return this.refuse('Nothing to replay yet: take a step first.');
  // to where you are, or the whole line when you are at its start
  const to = slot.at > 0 ? slot.at : slot.steps.length - 1;
  this.flush();
  this.sel = null;
  slot.at = 0;
  this.renderAll({ quick: true }, true);
  this.replaying = { to, timer: 0 };
  replayBar(this);
  const tick = () => {
    const R = this.replaying;
    if (!R) return;
    if (this.slot!.at >= R.to) return stopReplay.call(this, false);
    const from = this.at;
    sheet.redo(this);
    this.afterJump(this.played(from + 1, this.at, false));
    sound.move(1);
    replayBar(this);
    R.timer = window.setTimeout(tick, ms(900));
  };
  this.replaying.timer = window.setTimeout(tick, ms(500));
}

/** end it: done, or cut short (then jump straight to where it was going) */
export function stopReplay(this: App, cut = true) {
  const R = this.replaying;
  if (!R) return;
  clearTimeout(R.timer);
  this.replaying = null;
  if (cut && this.slot && this.slot.at < R.to) { this.slot.at = R.to; this.renderAll({ quick: true }, true); }
  $('replay').hidden = true;
  if (!cut) this.say('Replayed. Shift+P plays it again.');
}

/** keys while it plays: ← → speed, anything else stops (and, unless Esc, still does its job) */
export function replayKey(this: App, e: KeyboardEvent): boolean {
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const t = Math.max(MIN, Math.min(MAX, (prefs.tempo || 1) + (e.key === 'ArrowRight' ? STEP : -STEP)));
    // the slider speed rules here, so ⚡ flash steps aside
    if (prefs.speed !== 'standard') setPref('speed', 'standard');
    setPref('tempo', t);
    sound.tick(1);
    replayBar(this);
    return true;
  }
  if (e.key === 'Shift') return true;
  stopReplay.call(this);
  if (e.key === 'Escape') { e.preventDefault(); return true; }
  return false;
}

function replayBar(app: App) {
  const R = app.replaying, slot = app.slot;
  if (!R || !slot) return;
  const bar = $('replay');
  bar.hidden = false;
  bar.innerHTML = `<span class="rp-dot"></span>Replaying step ${slot.at} of ${R.to}<span class="rp-speed"><kbd>←</kbd><kbd>→</kbd> speed <b>${prefs.speed === 'flash' ? '⚡' : `${prefs.tempo || 1}×`}</b></span><span class="rp-stop"><kbd>Esc</kbd> stops</span>`;
}
