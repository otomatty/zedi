import { SELF, env, runInDurableObject } from "cloudflare:test";
import { getServerByName } from "partyserver";
import * as encoding from "lib0/encoding";
import { describe, expect, it } from "vitest";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import type { PageRoom } from "../pageRoom";
import { BASE, api, me, signIn, uniqueEmail } from "./helpers";

function connect(pageId: string, cookie: string | null) {
  const headers: Record<string, string> = { upgrade: "websocket", origin: BASE };
  if (cookie) headers.cookie = cookie;
  return SELF.fetch(`${BASE}/parties/page-room/${pageId}`, { headers });
}

async function newPage(cookie: string, title: string): Promise<string> {
  const { defaultNoteId } = await me(cookie);
  const res = await api(`/api/notes/${defaultNoteId}/pages`, cookie, {
    method: "POST",
    body: { title },
  });
  return ((await res.json()) as { id: string }).id;
}

describe("realtime (PageRoom Durable Object)", () => {
  it("rejects a WebSocket upgrade without a session", async () => {
    const owner = await signIn(uniqueEmail("ws-owner"));
    const pageId = await newPage(owner, "ws");
    expect((await connect(pageId, null)).status).toBe(401);
  });

  it("rejects a signed-in user without access to the page", async () => {
    const owner = await signIn(uniqueEmail("ws-owner2"));
    const pageId = await newPage(owner, "ws");
    const stranger = await signIn(uniqueEmail("ws-stranger"));
    expect((await connect(pageId, stranger)).status).toBe(404);
  });

  it("accepts the owner's WebSocket upgrade", async () => {
    const owner = await signIn(uniqueEmail("ws-owner3"));
    const pageId = await newPage(owner, "ws");
    const res = await connect(pageId, owner);
    expect(res.status).toBe(101);
    res.webSocket?.accept();
    res.webSocket?.close();
  });

  it("projects saved document text into D1 so full-text search finds it", async () => {
    const owner = await signIn(uniqueEmail("ws-project"));
    const pageId = await newPage(owner, "プロジェクション");
    const stub = await getServerByName(env.PageRoom as DurableObjectNamespace<PageRoom>, pageId);

    await runInDurableObject(stub, async (room: PageRoom) => {
      const paragraph = new Y.XmlElement("paragraph");
      paragraph.insert(0, [new Y.XmlText("Durable Object から書き戻された本文")]);
      room.document.getXmlFragment("default").insert(0, [paragraph]);
      await room.onSave();
    });

    const res = await api(`/api/search?q=${encodeURIComponent("書き戻された")}`, owner);
    const items = ((await res.json()) as { items: { id: string; preview: string }[] }).items;
    expect(items.map((i) => i.id)).toEqual([pageId]);
    expect(items[0]?.preview).toBe("Durable Object から書き戻された本文");
  });
});

describe("realtime write permissions", () => {
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
  }

  async function documentText(pageId: string): Promise<string> {
    const stub = await getServerByName(env.PageRoom as DurableObjectNamespace<PageRoom>, pageId);
    return runInDurableObject(stub, (room: PageRoom) =>
      room.document.getXmlFragment("default").toString(),
    );
  }

  it("applies updates from an editor and ignores updates from a viewer", async () => {
    const owner = await signIn(uniqueEmail("rw-owner"));
    const { defaultNoteId } = await me(owner);
    const pageId = await newPage(owner, "permissions");
    const viewerEmail = uniqueEmail("rw-viewer");
    const viewer = await signIn(viewerEmail);
    await api(`/api/notes/${defaultNoteId}/members`, owner, {
      method: "POST",
      body: { email: viewerEmail, role: "viewer" },
    });

    await sendUpdate(pageId, viewer, "viewer-write");
    expect(await documentText(pageId)).not.toContain("viewer-write");

    await sendUpdate(pageId, owner, "owner-write");
    expect(await documentText(pageId)).toContain("owner-write");
  });
});
