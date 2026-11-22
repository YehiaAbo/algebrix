// Saving and loading: the workspace on disk, fresh loads, reset.
// Methods of App, kept in their own file; app.ts puts them on App.prototype.
import { SMOOTH } from '../render/stage';
import { bumpIds } from '../engine/ast';
import { setDomains } from '../engine/moves';
import { sound } from './sound';
import { ms } from './prefs';
import { works } from './works';
import { Slot, $ } from './shared';
import { linesOf } from './tree';
import type { App } from './app';

/** start over with one equation (the tour uses this) */
export function loadFresh(this: App, src: string) {
  this.slots = []; this.cur = 0; this.writing = 'new';
  // the old workspace's definitions go with it, or f(x) = … here would read as an equation about them
  this.syncDefs();
  this.commit(src, true);
  this.message = null; this.renderHints();
}

export function restoreSlots(this: App, slots: Slot[], cur: number) {
  this.slots = slots; this.cur = cur;
  this.setMode('solve');
  this.stage.clear();
  this.renderAll(null);
  this.save();
}

export function save(this: App) {
  if (this.noSave) return;
  if (!this.workId || !works.get(this.workId)) this.workId = works.create<Slot>().id;
  works.save<Slot>(this.workId, { slots: this.slots, cur: this.cur, domains: this.domains });
}

/** open the workspace you were last in */
export function restore(this: App): boolean {
  const id = works.currentId;
  return !!id && this.load(id);
}

export function load(this: App, id: string): boolean {
  try {
    const w = works.get<Slot>(id);
    if (!w || !w.slots.length) return false;
    const slots = JSON.parse(JSON.stringify(w.slots)) as Slot[];
    slots.forEach(sl => { linesOf(sl).forEach(l => l.forEach(st => bumpIds(st.eq))); sl.at = Math.min(sl.at, sl.steps.length - 1); sl.sel = null; });
    this.workId = id;
    works.setCurrent(id);
    this.domains = { ...w.domains };
    setDomains(this.domains);
    this.slots = slots;
    this.cur = Math.min(w.cur ?? 0, slots.length - 1);
    this.grouped = null; this.preview = null; this.peek = null;
    this.setMode('solve');
    this.stage.clear();
    this.renderAll(null);
    return true;
  } catch { return false; }
}

/** switch to another workspace from the library */
export function openWork(this: App, id: string) {
  this.save();
  if (!this.load(id)) return;
  sound.commit();
  $('stage').animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: ms(260), easing: SMOOTH });
  this.say(`Opened ${works.get(id)?.name ?? 'workspace'}.`);
}

/** a fresh, empty workspace: type its first equation */
export function newWork(this: App) {
  this.save();
  const w = works.create<Slot>();
  this.workId = w.id;
  this.slots = []; this.cur = 0; this.domains = {}; setDomains(this.domains);
  this.syncDefs();
  this.grouped = null; this.peek = null;
  this.stage.clear();
  this.edit(true);
  this.say(`${w.name}: type the first equation.`);
}

/** every equation back to where it started; your steps stay on redo (r) */
export function resetWork(this: App) {
  if (!this.slots.length) return;
  if (performance.now() - this.resetArmed > 1600) {
    this.resetArmed = performance.now();
    sound.refuse();
    this.say('Press R again to put every equation back at its start. Your steps stay on redo.', true);
    return;
  }
  this.resetArmed = 0;
  this.closeModes();
  this.grouped = null;
  this.slots.forEach(sl => { sl.at = 0; sl.sel = null; });
  sound.undo();
  this.renderAll({ quick: true }, true);
  this.say('Back to the start. r redoes a step, Shift+P plays them all back.');
  this.save();
}
