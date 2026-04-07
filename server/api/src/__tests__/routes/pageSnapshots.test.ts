/**
 * pageSnapshots ルートのテスト（認可・CRUD）
 * Tests for page snapshots routes: authorization, list, detail, restore.
 */
import { describe, it, expect, vi } from "vitest";
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

// ── 認証 / Authentication ──────────────────────────────────────────────────

describe("Authentication", () => {
  it("returns 401 without auth header", async () => {
    const app = createSnapshotsApp([]);
    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots`, {
      method: "GET",
    });
    expect(res.status).toBe(401);
  });
});

// ── GET /snapshots — 一覧 / List ────────────────────────────────────────────

describe("GET /api/pages/:id/snapshots", () => {
  it("returns snapshots for page owner", async () => {
    const now = new Date();
    const app = createSnapshotsApp([
      // assertPageViewAccess: pages query
      [{ id: PAGE_ID, ownerId: OWNER_ID }],
      // snapshots query
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
      // users query (email resolution)
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
        version: number;
        content_text: string;
        created_by: string;
        created_by_email: string;
        trigger: string;
        created_at: string;
      }>;
    };
    expect(body.snapshots).toHaveLength(1);
    expect(body.snapshots[0].id).toBe(SNAPSHOT_ID);
    expect(body.snapshots[0].created_by_email).toBe("owner@example.com");
  });

  it("returns 404 when page does not exist", async () => {
    const app = createSnapshotsApp([
      // assertPageViewAccess: pages query returns empty
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots`, {
      method: "GET",
      headers: authHeaders(OWNER_ID),
    });

    expect(res.status).toBe(404);
  });

  it("returns 403 when user is not owner and not a note member", async () => {
    const app = createSnapshotsApp([
      // assertPageViewAccess: pages query
      [{ id: PAGE_ID, ownerId: OWNER_ID }],
      // user email lookup
      [{ email: "other@example.com" }],
      // notePages + noteMembers JOIN returns empty
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots`, {
      method: "GET",
      headers: authHeaders(OTHER_ID),
    });

    expect(res.status).toBe(403);
  });

  it("allows access for note member", async () => {
    const now = new Date();
    const app = createSnapshotsApp([
      // assertPageViewAccess: pages query (owner is different)
      [{ id: PAGE_ID, ownerId: OWNER_ID }],
      // user email lookup
      [{ email: "member@example.com" }],
      // notePages + noteMembers JOIN returns a match
      [{ noteId: NOTE_ID }],
      // snapshots query
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots`, {
      method: "GET",
      headers: authHeaders(MEMBER_ID),
    });

    expect(res.status).toBe(200);
  });
});

// ── GET /snapshots/:snapshotId — 詳細 / Detail ─────────────────────────────

describe("GET /api/pages/:id/snapshots/:snapshotId", () => {
  it("returns snapshot detail for owner", async () => {
    const now = new Date();
    const ydocBuffer = Buffer.from("test-ydoc");
    const app = createSnapshotsApp([
      // assertPageViewAccess: pages query
      [{ id: PAGE_ID, ownerId: OWNER_ID }],
      // snapshot query
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
      // user email lookup for created_by
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
    const app = createSnapshotsApp([
      // assertPageViewAccess: pages query
      [{ id: PAGE_ID, ownerId: OWNER_ID }],
      // snapshot query returns empty
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots/nonexistent`, {
      method: "GET",
      headers: authHeaders(OWNER_ID),
    });

    expect(res.status).toBe(404);
  });
});

// ── POST /snapshots/:snapshotId/restore — 復元 / Restore ──────────────────

describe("POST /api/pages/:id/snapshots/:snapshotId/restore", () => {
  it("returns 403 when non-owner tries to restore", async () => {
    const app = createSnapshotsApp([
      // page ownership check
      [{ id: PAGE_ID, ownerId: OWNER_ID }],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots/${SNAPSHOT_ID}/restore`, {
      method: "POST",
      headers: authHeaders(OTHER_ID),
    });

    expect(res.status).toBe(403);
  });

  it("returns 404 when page does not exist for restore", async () => {
    const app = createSnapshotsApp([
      // page query returns empty
      [],
    ]);

    const res = await app.request(`/api/pages/${PAGE_ID}/snapshots/${SNAPSHOT_ID}/restore`, {
      method: "POST",
      headers: authHeaders(OWNER_ID),
    });

    expect(res.status).toBe(404);
  });

  it("returns 404 when snapshot does not exist for restore", async () => {
    const app = createSnapshotsApp([
      // page ownership check
      [{ id: PAGE_ID, ownerId: OWNER_ID }],
      // snapshot query returns empty
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
    const app = createSnapshotsApp([
      // page ownership check
      [{ id: PAGE_ID, ownerId: OWNER_ID }],
      // snapshot query
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
      // transaction: current content
      [{ version: 2, ydocState: Buffer.from("current"), contentText: "current" }],
      // transaction: insert current snapshot
      [{}],
      // transaction: update page_contents
      [{ version: 3, pageId: PAGE_ID }],
      // transaction: insert restore snapshot
      [{ id: "snap-restore-001" }],
      // transaction: update pages metadata
      [{}],
      // transaction: prune old snapshots
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
