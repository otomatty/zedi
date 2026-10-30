import { describe, expect, it } from "vitest";
import { MAX_LIST_LIMIT, createNoteStore } from "./fakeNotes";

describe("createNoteStore", () => {
  it("generates the requested number of notes with unique ids", () => {
    const store = createNoteStore({ count: 500, seed: 1 });
    const { items, total } = store.list({ offset: 0, limit: 500 });
    expect(total).toBe(500);
    expect(items).toHaveLength(500);
    expect(new Set(items.map((n) => n.id)).size).toBe(500);
  });

  it("is deterministic for the same seed and differs for another seed", () => {
    const a = createNoteStore({ count: 20, seed: 7 }).list({ offset: 0, limit: 20 }).items;
    const b = createNoteStore({ count: 20, seed: 7 }).list({ offset: 0, limit: 20 }).items;
    const c = createNoteStore({ count: 20, seed: 8 }).list({ offset: 0, limit: 20 }).items;
    expect(b).toEqual(a);
    expect(c.map((n) => n.title)).not.toEqual(a.map((n) => n.title));
  });

  it("paginates with offset and limit while reporting the full total", () => {
    const store = createNoteStore({ count: 50, seed: 1 });
    const all = store.list({ offset: 0, limit: 50 }).items;
    const page = store.list({ offset: 10, limit: 5 });
    expect(page.total).toBe(50);
    expect(page.items.map((n) => n.id)).toEqual(all.slice(10, 15).map((n) => n.id));
  });

  it("filters by a case-insensitive title substring", () => {
    const store = createNoteStore({ count: 300, seed: 3 });
    const target = store.list({ offset: 0, limit: 300 }).items[42];
    if (!target) throw new Error("fixture missing");
    const query = target.title.slice(0, 4).toUpperCase();
    const result = store.list({ offset: 0, limit: 300, query });
    expect(result.items.map((n) => n.id)).toContain(target.id);
    expect(result.total).toBe(result.items.length);
    for (const note of result.items) {
      expect(note.title.toLowerCase()).toContain(query.toLowerCase());
    }
  });

  it("caps the page size at MAX_LIST_LIMIT", () => {
    const store = createNoteStore({ count: MAX_LIST_LIMIT + 5, seed: 1 });
    expect(store.list({ offset: 0, limit: MAX_LIST_LIMIT + 5 }).items).toHaveLength(MAX_LIST_LIMIT);
  });

  it("finds a note by id and returns undefined for an unknown id", () => {
    const store = createNoteStore({ count: 10, seed: 1 });
    const first = store.list({ offset: 0, limit: 1 }).items[0];
    expect(first && store.get(first.id)).toEqual(first);
    expect(store.get("does-not-exist")).toBeUndefined();
  });
});
