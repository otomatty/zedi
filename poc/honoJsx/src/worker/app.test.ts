import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { createNoteStore } from "./fakeNotes";
import type { NoteListResponse, NoteSummary } from "../shared/types";

const app = createApp({ notes: createNoteStore({ count: 20, seed: 1 }) });

describe("worker app", () => {
  it("server-renders the landing page with hono/jsx", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain('href="/notes"');
  });

  it("lists notes with the total count", async () => {
    const res = await app.request("/api/notes?limit=5&offset=2");
    expect(res.status).toBe(200);
    const body = (await res.json()) as NoteListResponse;
    expect(body.total).toBe(20);
    expect(body.items).toHaveLength(5);
  });

  it("rejects a non-numeric or out-of-range limit", async () => {
    expect((await app.request("/api/notes?limit=abc")).status).toBe(400);
    expect((await app.request("/api/notes?limit=0")).status).toBe(400);
  });

  it("returns a single note by id and 404 for an unknown id", async () => {
    const list = (await (await app.request("/api/notes?limit=1")).json()) as NoteListResponse;
    const first = list.items[0] as NoteSummary;
    const res = await app.request(`/api/notes/${first.id}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as NoteSummary).id).toBe(first.id);
    expect((await app.request("/api/notes/unknown")).status).toBe(404);
  });

  it("streams mock AI tokens as server-sent events", async () => {
    const res = await app.request("/api/ai/chat?tokens=3&interval=0");
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const body = await res.text();
    expect(body.match(/^data: \{"t":/gm)).toHaveLength(3);
    expect(body).toContain("event: done");
  });
});
