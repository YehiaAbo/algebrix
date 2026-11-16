// Settings (,): one row per choice. ↑ ↓ pick a row, ← → change it, Enter runs an action.
import { prefs, setPref, Prefs } from './prefs';
import { SOUND_PACKS, LOOKS } from '../packs';
import { sound } from './sound';

interface Option { v: unknown; name: string; blurb?: string }
interface Row { key?: keyof Prefs; label: string; options?: Option[]; action?: { name: string; run: () => void } }

const $ = (id: string) => document.getElementById(id)!;

export class Settings {
  private row = 0;
  private rows: Row[];

  constructor(actions: { tour: () => void }) {
    this.rows = [
      { key: 'theme', label: 'Theme', options: [{ v: 'system', name: 'System' }, { v: 'dark', name: 'Dark' }, { v: 'light', name: 'Light' }] },
      { key: 'look', label: 'Look', options: LOOKS.map(l => ({ v: l.id, name: l.name, blurb: l.blurb })) },
      { key: 'size', label: 'Math size', options: [{ v: 0.85, name: 'Small' }, { v: 1, name: 'Normal' }, { v: 1.15, name: 'Large' }, { v: 1.3, name: 'Huge' }] },
      { key: 'speed', label: 'Speed', options: [{ v: 'calm', name: 'Calm', blurb: 'Slower, easy to follow.' }, { v: 'standard', name: 'Standard' }, { v: 'flash', name: '⚡ Flash', blurb: 'About three times faster. Also z.' }] },
      { key: 'sounds', label: 'Sounds', options: SOUND_PACKS.map(p => ({ v: p.id, name: p.name, blurb: p.blurb })) },
      { key: 'volume', label: 'Volume', options: [{ v: 0.3, name: 'Low' }, { v: 0.55, name: 'Medium' }, { v: 0.8, name: 'Normal' }, { v: 1, name: 'Loud' }] },
      { key: 'muted', label: 'Sound', options: [{ v: false, name: 'On' }, { v: true, name: 'Off' }] },
      { key: 'hints', label: 'Key hints', options: [{ v: true, name: 'Show' }, { v: false, name: 'Hide', blurb: 'The bottom bar keeps only messages.' }] },
      { label: 'Tour', action: { name: 'Take the tour again', run: () => { this.close(); actions.tour(); } } },
    ];
    $('settings').addEventListener('mousedown', e => { if (e.target === $('settings')) this.close(); });
    $('settings-close').addEventListener('click', () => this.close());
  }

  get isOpen() { return !$('settings').hidden; }
  open() { $('settings').hidden = false; this.render(); sound.labels(); }
  close() { $('settings').hidden = true; }
  toggle() { if (this.isOpen) this.close(); else this.open(); }

  private render() {
    const list = $('settings-rows');
    list.replaceChildren();
    this.rows.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'set-row' + (i === this.row ? ' focus' : '');
      row.addEventListener('mouseenter', () => { this.row = i; this.mark(); });
      const label = document.createElement('div');
      label.className = 'set-label';
      label.textContent = r.label;
      const opts = document.createElement('div');
      opts.className = 'set-opts';
      if (r.options) {
        const cur = prefs[r.key!];
        for (const o of r.options) {
          const b = document.createElement('button');
          b.className = 'set-opt' + (o.v === cur ? ' on' : '');
          b.textContent = o.name;
          b.addEventListener('click', () => { this.row = i; this.set(r, o); });
          opts.append(b);
        }
        const now = r.options.find(o => o.v === cur);
        if (now?.blurb) { const p = document.createElement('div'); p.className = 'set-blurb'; p.textContent = now.blurb; opts.append(p); }
      } else if (r.action) {
        const b = document.createElement('button');
        b.className = 'set-opt';
        b.textContent = r.action.name;
        b.addEventListener('click', r.action.run);
        opts.append(b);
      }
      row.append(label, opts);
      list.append(row);
    });
  }

  private mark() { [...$('settings-rows').children].forEach((c, k) => c.classList.toggle('focus', k === this.row)); }

  private set(r: Row, o: Option) {
    setPref(r.key!, o.v as never);
    if (r.key === 'sounds' || r.key === 'volume') sound.move(1);
    else sound.tick(1);
    this.render();
  }

  key(e: KeyboardEvent) {
    e.preventDefault();
    const r = this.rows[this.row];
    switch (e.key) {
      case 'Escape': case ',': return this.close();
      case 'ArrowDown': case 'j': this.row = (this.row + 1) % this.rows.length; sound.tick(0); return this.mark();
      case 'ArrowUp': case 'k': this.row = (this.row + this.rows.length - 1) % this.rows.length; sound.tick(0); return this.mark();
      case 'ArrowLeft': case 'ArrowRight': case 'h': case 'l': {
        if (!r.options) return;
        const d = e.key === 'ArrowLeft' || e.key === 'h' ? -1 : 1;
        const at = r.options.findIndex(o => o.v === prefs[r.key!]);
        const next = r.options[Math.max(0, Math.min(r.options.length - 1, at + d))];
        if (next.v !== prefs[r.key!]) this.set(r, next);
        return;
      }
      case 'Enter': case ' ': return r.action?.run();
    }
  }
}
