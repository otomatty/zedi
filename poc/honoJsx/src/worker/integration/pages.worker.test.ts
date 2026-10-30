import { describe, expect, it } from "vitest";
import { api, me, signIn, uniqueEmail } from "./helpers";

type PageItem = { id: string; title: string; preview: string; updatedAt: number };
type PageList = { items: PageItem[]; nextCursor: string | null; total: number };

async function createPage(cookie: string, noteId: string, title: string): Promise<string> {
  const res = await api(`/api/notes/${noteId}/pages`, cookie, { method: "POST", body: { title } });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function search(cookie: string, q: string): Promise<string[]> {
  const res = await api(`/api/search?q=${encodeURIComponent(q)}`, cookie);
  expect(res.status).toBe(200);
  return ((await res.json()) as { items: PageItem[] }).items.map((i) => i.title);
}

describe("pages API on D1", () => {
  it("lists pages newest-first with a keyset cursor and a trigger-maintained total", async () => {
    const cookie = await signIn(uniqueEmail("list"));
    const { defaultNoteId } = await me(cookie);
    for (const title of ["p1", "p2", "p3", "p4", "p5"])
      await createPage(cookie, defaultNoteId, title);

    const titles: string[] = [];
    let cursor: string | null = null;
    let total = 0;
    do {
      const query: string = cursor ? `&cursor=${cursor}` : "";
      const res = await api(`/api/notes/${defaultNoteId}/pages?limit=2${query}`, cookie);
      expect(res.status).toBe(200);
      expect(Number(res.headers.get("x-d1-rows-read"))).toBeGreaterThan(0);
      const body = (await res.json()) as PageList;
      titles.push(...body.items.map((i) => i.title));
      total = body.total;
      cursor = body.nextCursor;
    } while (cursor);

    expect(titles).toEqual(["p5", "p4", "p3", "p2", "p1"]);
    expect(total).toBe(5);
  });

  it("rejects an invalid limit or cursor", async () => {
    const cookie = await signIn(uniqueEmail("invalid"));
    const { defaultNoteId } = await me(cookie);
    expect((await api(`/api/notes/${defaultNoteId}/pages?limit=0`, cookie)).status).toBe(400);
    expect((await api(`/api/notes/${defaultNoteId}/pages?cursor=%%%`, cookie)).status).toBe(400);
  });

  it("searches Japanese with the FTS5 trigram index and falls back to LIKE for short terms", async () => {
    const cookie = await signIn(uniqueEmail("search"));
    const { defaultNoteId } = await me(cookie);
    await createPage(cookie, defaultNoteId, "知識ネットワークの設計");
    await createPage(cookie, defaultNoteId, "Durable Objects 入門");
    await createPage(cookie, defaultNoteId, "AI メモ");

    expect(await search(cookie, "ネットワーク")).toEqual(["知識ネットワークの設計"]);
    expect(await search(cookie, "durable")).toEqual(["Durable Objects 入門"]);
    expect(await search(cookie, "入門")).toEqual(["Durable Objects 入門"]);
    expect(await search(cookie, "AI")).toEqual(["AI メモ"]);
    expect(await search(cookie, "設計 Durable")).toEqual([]);
  });

  it("hides another user's note and pages (404, never 403, so existence does not leak)", async () => {
    const owner = await signIn(uniqueEmail("owner"));
    const { defaultNoteId } = await me(owner);
    const pageId = await createPage(owner, defaultNoteId, "秘密のページ");
    const stranger = await signIn(uniqueEmail("stranger"));

    expect((await api(`/api/pages/${pageId}`, stranger)).status).toBe(404);
    expect((await api(`/api/notes/${defaultNoteId}/pages`, stranger)).status).toBe(404);
    expect(
      (
        await api(`/api/notes/${defaultNoteId}/pages`, stranger, {
          method: "POST",
          body: { title: "x" },
        })
      ).status,
    ).toBe(404);
    expect(await search(stranger, "秘密のページ")).toEqual([]);
  });

  it("lets members read shared pages, and only editors create them", async () => {
    const owner = await signIn(uniqueEmail("sharer"));
    const { defaultNoteId } = await me(owner);
    const pageId = await createPage(owner, defaultNoteId, "共有されたページ");
    const memberEmail = uniqueEmail("member");
    const member = await signIn(memberEmail);

    const add = await api(`/api/notes/${defaultNoteId}/members`, owner, {
      method: "POST",
      body: { email: memberEmail, role: "viewer" },
    });
    expect(add.status).toBe(204);
    expect((await api(`/api/pages/${pageId}`, member)).status).toBe(200);
    expect(await search(member, "共有されたページ")).toEqual(["共有されたページ"]);
    expect(
      (
        await api(`/api/notes/${defaultNoteId}/pages`, member, {
          method: "POST",
          body: { title: "x" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api(`/api/notes/${defaultNoteId}/members`, member, {
          method: "POST",
          body: { email: memberEmail, role: "editor" },
        })
      ).status,
    ).toBe(403);

    await api(`/api/notes/${defaultNoteId}/members`, owner, {
      method: "POST",
      body: { email: memberEmail, role: "editor" },
    });
    expect(
      (
        await api(`/api/notes/${defaultNoteId}/pages`, member, {
          method: "POST",
          body: { title: "編集者のページ" },
        })
      ).status,
    ).toBe(201);
  });

  it("seeds pages in multi-row batches within D1's bound-parameter limit", async () => {
    const cookie = await signIn(uniqueEmail("seed"));
    const { defaultNoteId } = await me(cookie);
    const res = await api("/api/dev/seed", cookie, { method: "POST", body: { count: 300 } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { inserted: number }).inserted).toBe(300);
    const list = (await (
      await api(`/api/notes/${defaultNoteId}/pages?limit=10`, cookie)
    ).json()) as PageList;
    expect(list.total).toBe(300);
    expect(list.items).toHaveLength(10);
  });
});
