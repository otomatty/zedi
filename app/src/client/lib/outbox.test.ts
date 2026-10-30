import { describe, expect, it, vi } from "vitest";
import { createPageOutbox, type PendingPage } from "./outbox";

class Refused extends Error {}

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};
const page = (id: string, noteId = "n1"): PendingPage => ({
  id,
  noteId,
  title: `page ${id}`,
  createdAt: 1,
});
const outboxWith = (storage = memoryStorage()) =>
  createPageOutbox(storage, { isPermanent: (error) => error instanceof Refused });

describe("createPageOutbox", () => {
  it("keeps pending pages across reloads", () => {
    const storage = memoryStorage();
    outboxWith(storage).add(page("a"));
    outboxWith(storage).add(page("b", "n2"));

    const reloaded = outboxWith(storage);

    expect(reloaded.list().map((p) => p.id)).toEqual(["a", "b"]);
    expect(reloaded.list("n2").map((p) => p.id)).toEqual(["b"]);
    expect(reloaded.get("a")).toEqual(page("a"));
  });

  it("sends pending pages in order and removes the ones the server accepted", async () => {
    const outbox = outboxWith();
    outbox.add(page("a"));
    outbox.add(page("b"));
    const sent: string[] = [];

    const result = await outbox.flush(async (p) => void sent.push(p.id));

    expect(sent).toEqual(["a", "b"]);
    expect(result.sent.map((p) => p.id)).toEqual(["a", "b"]);
    expect(outbox.list()).toEqual([]);
  });

  it("stops at the first failure that may succeed later and keeps the rest", async () => {
    const outbox = outboxWith();
    outbox.add(page("a"));
    outbox.add(page("b"));
    const send = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const result = await outbox.flush(send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ sent: [], refused: [] });
    expect(outbox.list().map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("drops a page the server refuses for good, reports it and goes on", async () => {
    const outbox = outboxWith();
    outbox.add(page("a"));
    outbox.add(page("b"));

    const result = await outbox.flush(async (p) => {
      if (p.id === "a") throw new Refused("409");
    });

    expect(result.refused.map((p) => p.id)).toEqual(["a"]);
    expect(result.sent.map((p) => p.id)).toEqual(["b"]);
    expect(outbox.list()).toEqual([]);
  });

  it("does not send a page twice when flushes overlap", async () => {
    const outbox = outboxWith();
    outbox.add(page("a"));
    const send = vi.fn(async () => undefined);

    await Promise.all([outbox.flush(send), outbox.flush(send)]);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends a page added while a flush is already running", async () => {
    const outbox = outboxWith();
    outbox.add(page("a"));
    const sent: string[] = [];

    const first = outbox.flush(async (p) => {
      sent.push(p.id);
      // 送信中に新しいページが作られ、作成側も同期を呼ぶ（実行中の flush に合流する）。
      // A new page is created mid-flush and its creator also asks for a sync.
      if (p.id === "a") {
        outbox.add(page("b"));
        void outbox.flush(async () => undefined);
      }
    });
    const result = await first;

    expect(sent).toEqual(["a", "b"]);
    expect(result.sent.map((p) => p.id)).toEqual(["a", "b"]);
    expect(outbox.list()).toEqual([]);
  });

  it("does not retry a page in the same flush after a failure that may succeed later", async () => {
    const outbox = outboxWith();
    outbox.add(page("a"));
    const send = vi.fn(async () => {
      outbox.add(page("b"));
      throw new TypeError("Failed to fetch");
    });

    await outbox.flush(send);

    expect(send).toHaveBeenCalledTimes(1);
    expect(outbox.list().map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("forgets every pending page on clear, also after a reload", () => {
    const storage = memoryStorage();
    const outbox = outboxWith(storage);
    const listener = vi.fn();
    outbox.subscribe(listener);
    outbox.add(page("a"));

    outbox.clear();

    expect(outbox.all()).toEqual([]);
    expect(outboxWith(storage).all()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("returns the same snapshot until the queue changes, and re-reads it on reload", () => {
    const storage = memoryStorage();
    const outbox = outboxWith(storage);
    outbox.add(page("a"));
    const snapshot = outbox.all();

    expect(outbox.all()).toBe(snapshot);
    outboxWith(storage).add(page("b"));
    expect(outbox.all()).toBe(snapshot);

    outbox.reload();
    expect(outbox.all().map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("tells subscribers when the queue changes", async () => {
    const outbox = outboxWith();
    const listener = vi.fn();
    const unsubscribe = outbox.subscribe(listener);

    outbox.add(page("a"));
    await outbox.flush(async () => undefined);
    unsubscribe();
    outbox.add(page("b"));

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
