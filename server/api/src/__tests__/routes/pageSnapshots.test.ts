/**
 * pageSnapshots ルートのテスト（認可・CRUD）
 * Tests for page snapshots routes: authorization, list, detail, restore.
 *
 * Issue #823: `assertPageViewAccess` / `assertPageEditAccess` は `pages.note_id` 経由の
 * ノートロールのみで判定する。モック DB は SELECT 連鎖をこの順に返す。
 *
 * Issue #823: access checks use note roles via `pages.note_id` only; mocks must return
 * SELECT chains in this order.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

vi.mock("../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    await next();
  },
}));

import { Hono } from "hono";
import pageSnapshotRoutes from "../../routes/pageSnapshots.js";
import { createMockDb } from "../createMockDb.js";

const OWNER_ID = "owner-user-001";
const MEMBER_ID = "member-user-002";
const OTHER_ID = "other-user-003";
const PAGE_ID = "page-snap-test-001";
const SNAPSHOT_ID = "snap-001";
const NOTE_ID = "note-001";

function authHeaders(userId: string = OWNER_ID) {
  return {
    "x-test-user-id": userId,
    "Content-Type": "application/json",
  };
}

function mockNote(noteOwnerId: string) {
  return {
    id: NOTE_ID,
    ownerId: noteOwnerId,
    title: "n",
    visibility: "private" as const,
    editPermission: "owner_only" as const,
    isOfficial: false,
    viewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  };
}

/** 1: pages row  2: caller email  3: findActiveNoteById */
function viewAccessPrefix(
  asUserEmail: string,
  noteOwnerId: string,
  pageRow: Record<string, unknown>,
) {
  return [[pageRow], [{ email: asUserEmail }], [mockNote(noteOwnerId)]];
}

function createSnapshotsApp(dbResults: unknown[]) {
  const { db } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/pages", pageSnapshotRoutes);
  return app;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK" }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Authentication", () => {
  it("returns 401 without auth header", async () => {
    const app = createSnapshotsApp([]);
    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots`, {
      method: "GET",
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/pages/:id/snapshots", () => {
  it("returns snapshots for page owner", async () => {
    const now = new Date();
    const pageRow = { id: PAGE_ID, ownerId: OWNER_ID, noteId: NOTE_ID };
    const app = createSnapshotsApp([
      ...viewAccessPrefix("owner@example.com", OWNER_ID, pageRow),
      [
        {
          id: SNAPSHOT_ID,
          version: 1,
          contentText: "hello",
          createdBy: OWNER_ID,
          trigger: "auto",
          createdAt: now,
        },
      ],
      [{ id: OWNER_ID, email: "owner@example.com" }],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots`, {
      method: "GET",
      headers: authHeaders(OWNER_ID),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      snapshots: Array<{
        id: string;
        created_by_email: string;
      }>;
    };
    expect(body.snapshots).toEqual([
      expect.objectContaining({
        id: SNAPSHOT_ID,
        created_by_email: "owner@example.com",
      }),
    ]);
  });

  it("returns 404 when page does not exist", async () => {
    const app = createSnapshotsApp([[]]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots`, {
      method: "GET",
      headers: authHeaders(OWNER_ID),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not owner and not a note member", async () => {
    const pageRow = { id: PAGE_ID, ownerId: OWNER_ID, noteId: NOTE_ID };
    const app = createSnapshotsApp([
      ...viewAccessPrefix("other@example.com", OWNER_ID, pageRow),
      [],
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots`, {
      method: "GET",
      headers: authHeaders(OTHER_ID),
    });

    expect(res.status).toBe(403);
  });

  it("allows access for note member", async () => {
    const pageRow = { id: PAGE_ID, ownerId: OWNER_ID, noteId: NOTE_ID };
    const app = createSnapshotsApp([
      ...viewAccessPrefix("member@example.com", OWNER_ID, pageRow),
      [{ role: "viewer" }],
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots`, {
      method: "GET",
      headers: authHeaders(MEMBER_ID),
    });

    expect(res.status).toBe(200);
  });
});

describe("GET /api/pages/:id/snapshots/:snapshotId", () => {
  it("returns snapshot detail for owner", async () => {
    const now = new Date();
    const ydocBuffer = Buffer.from("test-ydoc");
    const pageRow = { id: PAGE_ID, ownerId: OWNER_ID, noteId: NOTE_ID };
    const app = createSnapshotsApp([
      ...viewAccessPrefix("owner@example.com", OWNER_ID, pageRow),
      [
        {
          id: SNAPSHOT_ID,
          pageId: PAGE_ID,
          version: 1,
          ydocState: ydocBuffer,
          contentText: "hello",
          createdBy: OWNER_ID,
          trigger: "auto",
          createdAt: now,
        },
      ],
      [{ email: "owner@example.com" }],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots/${SNAPSHOT_ID}`, {
      method: "GET",
      headers: authHeaders(OWNER_ID),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      ydoc_state: string;
      content_text: string;
    };
    expect(body.id).toBe(SNAPSHOT_ID);
    expect(body.ydoc_state).toBe(ydocBuffer.toString("base64"));
    expect(body.content_text).toBe("hello");
  });

  it("returns 404 when snapshot does not exist", async () => {
    const pageRow = { id: PAGE_ID, ownerId: OWNER_ID, noteId: NOTE_ID };
    const app = createSnapshotsApp([
      ...viewAccessPrefix("owner@example.com", OWNER_ID, pageRow),
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots/nonexistent`, {
      method: "GET",
      headers: authHeaders(OWNER_ID),
    });

    expect(res.status).toBe(404);
  });
});

describe("POST /api/pages/:id/snapshots/:snapshotId/restore", () => {
  it("returns 403 when non-owner tries to restore", async () => {
    const pageRow = { id: PAGE_ID, ownerId: OWNER_ID, noteId: NOTE_ID };
    const app = createSnapshotsApp([
      ...viewAccessPrefix("other@example.com", OWNER_ID, pageRow),
      [],
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots/${SNAPSHOT_ID}/restore`, {
      method: "POST",
      headers: authHeaders(OTHER_ID),
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 when page does not exist for restore", async () => {
    const app = createSnapshotsApp([[]]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots/${SNAPSHOT_ID}/restore`, {
      method: "POST",
      headers: authHeaders(OWNER_ID),
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 when snapshot does not exist for restore", async () => {
    const pageRow = { id: PAGE_ID, ownerId: OWNER_ID, noteId: NOTE_ID };
    const app = createSnapshotsApp([
      ...viewAccessPrefix("owner@example.com", OWNER_ID, pageRow),
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots/${SNAPSHOT_ID}/restore`, {
      method: "POST",
      headers: authHeaders(OWNER_ID),
    });

    expect(res.status).toBe(404);
  });

  it("restores snapshot and returns new version for owner", async () => {
    const ydocBuffer = Buffer.from("restored-ydoc");
    const pageRow = { id: PAGE_ID, ownerId: OWNER_ID, noteId: NOTE_ID };
    const app = createSnapshotsApp([
      ...viewAccessPrefix("owner@example.com", OWNER_ID, pageRow),
      [
        {
          id: SNAPSHOT_ID,
          pageId: PAGE_ID,
          version: 1,
          ydocState: ydocBuffer,
          contentText: "restored content",
          createdBy: OWNER_ID,
          trigger: "auto",
          createdAt: new Date(),
        },
      ],
      [{}],
      [{ version: 2, ydocState: Buffer.from("current"), contentText: "current" }],
      [{}],
      [{ version: 3, pageId: PAGE_ID }],
      [{ id: "snap-restore-001" }],
      [{}],
      [{}],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots/${SNAPSHOT_ID}/restore`, {
      method: "POST",
      headers: authHeaders(OWNER_ID),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { version: number; snapshot_id: string };
    expect(body.version).toBe(3);
    expect(body.snapshot_id).toBe("snap-restore-001");
  });
});
