import { SELF, env, runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
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

/** Refreshes permissions on open connections. / 接続中の権限を再確認する。 */
describe("realtime permission refresh", () => {
  async function openSocket(pageId: string, cookie: string, claimedUserId?: string) {
    const res = claimedUserId
      ? await SELF.fetch(`${BASE}/parties/page-room/${pageId}`, {
          headers: { upgrade: "websocket", origin: BASE, cookie, "x-zedi-user": claimedUserId },
        })
      : await connect(pageId, cookie);
    expect(res.status).toBe(101);
    const socket = res.webSocket as WebSocket;
    socket.accept();
    return socket;
  }

  function sendText(socket: WebSocket, text: string) {
    const doc = new Y.Doc();
    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText(text)]);
    doc.getXmlFragment("default").insert(0, [paragraph]);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); // messageSync
    syncProtocol.writeUpdate(encoder, Y.encodeStateAsUpdate(doc));
    socket.send(encoding.toUint8Array(encoder));
    doc.destroy();
  }

  it("schedules an alarm, closes a revoked reader, and stops polling an empty room", async () => {
    const owner = await signIn(uniqueEmail("refresh-owner"));
    const { defaultNoteId, user } = await me(owner);
    const pageId = await newPage(owner, "visibility refresh");
    const reader = await signIn(uniqueEmail("refresh-reader"));
    const stub = await getServerByName(env.PageRoom as DurableObjectNamespace<PageRoom>, pageId);
    const alarm = () => runInDurableObject(stub, (_room, state) => state.storage.getAlarm());
    const changeVisibility = (visibility: "private" | "public") =>
      api(`/api/notes/${defaultNoteId}`, owner, { method: "PATCH", body: { visibility } });

    expect((await changeVisibility("public")).status).toBe(204);
    const ownerSocket = await openSocket(pageId, owner);
    const readerSocket = await openSocket(pageId, reader, user.id);
    const closed = new Promise<CloseEvent>((resolve) =>
      readerSocket.addEventListener("close", resolve, { once: true }),
    );
    try {
      expect(await alarm()).toEqual(expect.any(Number));
      expect((await changeVisibility("private")).status).toBe(204);
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      expect(await closed).toMatchObject({ code: 4403, reason: "access revoked" });
      expect(ownerSocket.readyState).toBe(WebSocket.OPEN);
      expect(await alarm()).toEqual(expect.any(Number));
    } finally {
      if (readerSocket.readyState === WebSocket.OPEN) readerSocket.close(1000);
      ownerSocket.close(1000);
    }

    await expect
      .poll(() => runInDurableObject(stub, (_room, state) => state.getWebSockets().length))
      .toBe(0);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await alarm()).toBeNull();
  });

  it("makes an existing editor connection read-only when its role changes to viewer", async () => {
    const owner = await signIn(uniqueEmail("refresh-editor-owner"));
    const { defaultNoteId } = await me(owner);
    const pageId = await newPage(owner, "role refresh");
    const email = uniqueEmail("refresh-editor");
    const editor = await signIn(email);
    const stub = await getServerByName(env.PageRoom as DurableObjectNamespace<PageRoom>, pageId);
    const setMemberRole = (role: "editor" | "viewer") =>
      api(`/api/notes/${defaultNoteId}/members`, owner, {
        method: "POST",
        body: { email, role },
      });
    const documentText = () =>
      runInDurableObject(stub, (room) => room.document.getXmlFragment("default").toString());

    expect((await setMemberRole("editor")).status).toBe(204);
    const socket = await openSocket(pageId, editor);
    try {
      sendText(socket, "before-downgrade");
      await expect.poll(documentText).toContain("before-downgrade");
      expect((await setMemberRole("viewer")).status).toBe(204);
      expect(await runDurableObjectAlarm(stub)).toBe(true);

      sendText(socket, "after-downgrade");
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(await documentText()).not.toContain("after-downgrade");
      expect(socket.readyState).toBe(WebSocket.OPEN);
    } finally {
      socket.close(1000);
    }
  });

  it.each(["resumeReauthorization", "onLoad"] as const)(
    "resumes checking an existing connection with no user ID or alarm via %s",
    async (resume) => {
      const owner = await signIn(uniqueEmail("resume-owner"));
      const pageId = await newPage(owner, "resume permission checks");
      const stub = await getServerByName(env.PageRoom as DurableObjectNamespace<PageRoom>, pageId);
      const socket = await openSocket(pageId, owner);
      const closed = new Promise<CloseEvent>((resolve) =>
        socket.addEventListener("close", resolve, { once: true }),
      );
      try {
        await runInDurableObject(stub, async (room, state) => {
          const connections = [...room.getConnections<{ readOnly: boolean }>()];
          expect(connections).toHaveLength(1);
          connections[0]?.setState({ readOnly: false });
          await state.storage.deleteAlarm();
          expect(await state.storage.getAlarm()).toBeNull();

          await room[resume]();
          expect(await state.storage.getAlarm()).toEqual(expect.any(Number));
        });
        expect(await runDurableObjectAlarm(stub)).toBe(true);
        expect(await closed).toMatchObject({ code: 4403, reason: "access revoked" });
      } finally {
        if (socket.readyState === WebSocket.OPEN) socket.close(1000);
      }
    },
  );

  it("does not start permission checks when an empty room wakes", async () => {
    const owner = await signIn(uniqueEmail("resume-empty-owner"));
    const pageId = await newPage(owner, "empty room");
    const stub = await getServerByName(env.PageRoom as DurableObjectNamespace<PageRoom>, pageId);
    await runInDurableObject(stub, async (room, state) => {
      await room.resumeReauthorization();
      expect(await state.storage.getAlarm()).toBeNull();
    });
    expect(await runDurableObjectAlarm(stub)).toBe(false);
  });
});
