import { SELF, env, runInDurableObject } from "cloudflare:test";
import * as encoding from "lib0/encoding";
import { getServerByName } from "partyserver";
import { describe, expect, it } from "vitest";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import type { PageRoom } from "../pageRoom";
import { BASE, api, cookieHeader, me, signIn, signInFirstFactor, uniqueEmail } from "./helpers";

const pageTitle = "Visibility test page";

async function createNoteFixture() {
  const owner = await signIn(uniqueEmail("visibility-owner"));
  const { defaultNoteId: noteId } = await me(owner);
  const notePath = `/api/notes/${noteId}`;
  const listPath = `${notePath}/pages`;
  const res = await api(listPath, owner, { method: "POST", body: { title: pageTitle } });
  expect(res.status).toBe(201);
  const { id: pageId } = (await res.json()) as { id: string };
  return { owner, noteId, notePath, listPath, pageId, pagePath: `/api/pages/${pageId}` };
}

function patchVisibility(notePath: string, cookie: string | null, visibility: unknown) {
  return api(notePath, cookie, { method: "PATCH", body: { visibility } });
}

function connect(pageId: string, cookie: string | null) {
  const headers: Record<string, string> = { upgrade: "websocket", origin: BASE };
  if (cookie) headers.cookie = cookie;
  return SELF.fetch(`${BASE}/parties/page-room/${pageId}`, { headers });
}

async function sendUpdate(pageId: string, cookie: string, text: string) {
  const res = await connect(pageId, cookie);
  expect(res.status).toBe(101);
  const ws = res.webSocket as WebSocket;
  ws.accept();
  const doc = new Y.Doc();
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText(text)]);
  doc.getXmlFragment("default").insert(0, [paragraph]);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, 0); // messageSync
  syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(doc));
  ws.send(encoding.toUint8Array(encoder));
  await new Promise((resolve) => setTimeout(resolve, 100));
  ws.close();
  doc.destroy();
}

async function expectReadStatus(
  fixture: Awaited<ReturnType<typeof createNoteFixture>>,
  cookie: string | null,
  status: number,
) {
  for (const path of [fixture.notePath, fixture.listPath, fixture.pagePath]) {
    expect((await api(path, cookie)).status, path).toBe(status);
  }
  expect((await connect(fixture.pageId, cookie)).status).toBe(status);
}

/**
 * Note visibility through the authenticated API and the page room.
 * 認証済み API とページルームでのノートの公開範囲。
 */
describe("note visibility", () => {
  it("defaults to private and hides the note and its pages from non-members", async () => {
    const fixture = await createNoteFixture();
    const { owner, noteId, notePath } = fixture;
    const stranger = await signIn(uniqueEmail("visibility-stranger"));
    await expectReadStatus(fixture, stranger, 404);

    const response = await api(notePath, owner);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: noteId,
      title: expect.any(String),
      visibility: "private",
      role: "owner",
    });
    expect((await patchVisibility(notePath, stranger, "public")).status).toBe(404);
  });

  it.each(["unlisted", "public"] as const)(
    "lets non-members read a %s note by ID, without writing or finding it in search",
    async (visibility) => {
      const fixture = await createNoteFixture();
      const { owner, noteId, notePath, listPath, pageId, pagePath } = fixture;
      const stranger = await signIn(uniqueEmail("visibility-reader"));
      expect((await patchVisibility(notePath, owner, visibility)).status).toBe(204);

      const note = await api(notePath, stranger);
      expect(note.status).toBe(200);
      expect(await note.json()).toEqual({
        id: noteId,
        title: expect.any(String),
        visibility,
        role: "viewer",
      });
      const list = await api(listPath, stranger);
      expect(list.status).toBe(200);
      expect(await list.json()).toMatchObject({
        items: [{ id: pageId, title: pageTitle }],
        total: 1,
        role: "viewer",
      });
      const page = await api(pagePath, stranger);
      expect(page.status).toBe(200);
      expect(await page.json()).toMatchObject({ id: pageId, title: pageTitle, role: "viewer" });
      expect(
        (await api(listPath, stranger, { method: "POST", body: { title: "Denied" } })).status,
      ).toBe(403);
      expect((await patchVisibility(notePath, stranger, "private")).status).toBe(403);

      const query = `/api/search?q=${encodeURIComponent("Visibility test")}`;
      const ownerSearch = await api(query, owner);
      expect(ownerSearch.status).toBe(200);
      expect(await ownerSearch.json()).toMatchObject({ items: [{ id: pageId }] });
      const strangerSearch = await api(query, stranger);
      expect(strangerSearch.status).toBe(200);
      expect(await strangerSearch.json()).toMatchObject({ items: [] });

      await sendUpdate(pageId, stranger, "stranger-write");
      await sendUpdate(pageId, owner, "owner-write");
      const stub = await getServerByName(env.PageRoom as DurableObjectNamespace<PageRoom>, pageId);
      const documentText = await runInDurableObject(stub, (room: PageRoom) =>
        room.document.getXmlFragment("default").toString(),
      );
      expect(documentText).toContain("owner-write");
      expect(documentText).not.toContain("stranger-write");

      expect((await patchVisibility(notePath, owner, "private")).status).toBe(204);
      await expectReadStatus(fixture, stranger, 404);
    },
  );

  it("keeps an editor's role on a public note and reserves visibility changes for the owner", async () => {
    const { owner, notePath, listPath } = await createNoteFixture();
    const email = uniqueEmail("visibility-editor");
    const editor = await signIn(email);
    expect((await patchVisibility(notePath, owner, "public")).status).toBe(204);
    expect(
      (await api(`${notePath}/members`, owner, { method: "POST", body: { email, role: "editor" } }))
        .status,
    ).toBe(204);

    const note = await api(notePath, editor);
    expect(note.status).toBe(200);
    expect(await note.json()).toMatchObject({ role: "editor", visibility: "public" });
    expect(
      (await api(listPath, editor, { method: "POST", body: { title: "Allowed" } })).status,
    ).toBe(201);
    expect((await patchVisibility(notePath, editor, "private")).status).toBe(403);
  });

  it("rejects invalid visibility values and malformed JSON without changing the note", async () => {
    const { owner, notePath } = await createNoteFixture();
    for (const value of ["restricted", 42, undefined]) {
      expect((await patchVisibility(notePath, owner, value)).status).toBe(400);
    }
    const malformed = await SELF.fetch(`${BASE}${notePath}`, {
      method: "PATCH",
      headers: { origin: BASE, cookie: owner, "content-type": "application/json" },
      body: "not JSON",
    });
    expect(malformed.status).toBe(400);
    expect(await (await api(notePath, owner)).json()).toMatchObject({ visibility: "private" });
  });

  it("requires both sign-in steps at every visibility", async () => {
    const fixture = await createNoteFixture();
    const { owner, notePath } = fixture;
    const firstFactor = cookieHeader(await signInFirstFactor(uniqueEmail("visibility-first")));
    for (const visibility of ["private", "unlisted", "public"]) {
      expect((await patchVisibility(notePath, owner, visibility)).status).toBe(204);
      for (const [cookie, status] of [
        [null, 401],
        [firstFactor, 403],
      ] as const) {
        await expectReadStatus(fixture, cookie, status);
        expect((await patchVisibility(notePath, cookie, "private")).status).toBe(status);
      }
    }
  });
});
