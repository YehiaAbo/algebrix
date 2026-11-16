import { describe, it, expect, beforeAll } from 'vitest';

// a tiny in-memory localStorage, with an old single-session save in it
const mem = new Map<string, string>();
beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: k => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: k => void mem.delete(k),
    clear: () => mem.clear(), key: () => null, length: 0,
  };
  mem.set('algebrix.session', JSON.stringify({ v: 3, slots: [{ steps: [{ eq: 1 }, { eq: 2 }], at: 1, sel: null }], cur: 0, domains: { x: 'positive' } }));
});

describe('workspaces', () => {
  it('turns the old single session into the first card', async () => {
    const { works } = await import('../src/ui/works');
    const list = works.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('My work');
    expect(list[0].domains).toEqual({ x: 'positive' });
    expect(works.currentId).toBe(list[0].id);
  });

  it('creates, copies, renames and removes, newest first', async () => {
    const { works } = await import('../src/ui/works');
    const first = works.list()[0];
    const w = works.create([{ steps: [] }]);
    expect(w.name).toBe('Work 1');
    expect(works.currentId).toBe(w.id);
    const c = works.duplicate(first.id)!;
    expect(c.name).toBe('My work copy');
    works.rename(c.id, '  Quadratics ');
    expect(works.get(c.id)!.name).toBe('Quadratics');
    works.save(first.id, { slots: [{ steps: [], at: 0 }], cur: 0, domains: {} });
    expect(works.list()[0].id).toBe(first.id);
    works.remove(w.id);
    expect(works.get(w.id)).toBeUndefined();
    expect(works.currentId).not.toBe(w.id);
    expect(JSON.parse(mem.get('algebrix.works')!).list).toHaveLength(2);
  });
});
