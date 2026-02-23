import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TEST_USER_ID,
  OTHER_USER_ID,
  createMockDb,
  jsonRequest,
  type MockDb,
} from "../helpers/setup";
import { createApp } from "../../app";

let mockDb: MockDb;

vi.mock("../../db/client", () => ({ getDb: vi.fn(() => mockDb) }));
vi.mock("../../env", () => ({
  getEnvConfig: vi.fn(() => ({
    CORS_ORIGIN: "*",
    MEDIA_BUCKET: "b",
    AI_SECRETS_ARN: "a",
    RATE_LIMIT_TABLE: "r",
    THUMBNAIL_SECRETS_ARN: "a",
    THUMBNAIL_BUCKET: "b",
    THUMBNAIL_CLOUDFRONT_URL: "https://t",
    ENVIRONMENT: "test",
    POLAR_SECRET_ARN: "a",
    COGNITO_USER_POOL_ID: "p",
    COGNITO_REGION: "us-east-1",
    AURORA_CLUSTER_ARN: "a",
    DB_CREDENTIALS_SECRET: "a",
    AURORA_DATABASE_NAME: "zedi",
  })),
  resetEnvCache: vi.fn(),
}));
vi.mock("../../middleware/auth", () => ({
  authRequired: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set("userId", "00000000-0000-0000-0000-000000000001");
    c.set("cognitoSub", "test-cognito-sub");
    c.set("userEmail", "test@example.com");
    await next();
  },
  authOptional: async (c: { set: (k: string, v: string) => void }, next: () => Promise<void>) => {
    c.set("userId", "00000000-0000-0000-0000-000000000001");
    c.set("cognitoSub", "test-cognito-sub");
    c.set("userEmail", "test@example.com");
    await next();
  },
}));

const now = new Date();

function testNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-1",
    ownerId: TEST_USER_ID,
    title: "Test Note",
    visibility: "private",
    editPermission: "owner_only",
    isOfficial: false,
    viewCount: 0,
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
    ...overrides,
  };
}

describe("Notes API — authenticated flows", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    mockDb = createMockDb();
    app = createApp();
  });

  // ── POST /api/notes ─────────────────────────────────────────────────────

  describe("POST /api/notes", () => {
    it("creates a new note", async () => {
      mockDb.returning.mockResolvedValueOnce([testNote()]);

      const res = await jsonRequest(app, "POST", "/api/notes", { title: "Test Note" });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { note: Record<string, unknown> };
      expect(body.note.title).toBe("Test Note");
      expect(body.note.ownerId).toBe(TEST_USER_ID);
    });

    it("sets visibility and edit_permission", async () => {
      mockDb.returning.mockResolvedValueOnce([
        testNote({ visibility: "public", editPermission: "members_editors" }),
      ]);

      const res = await jsonRequest(app, "POST", "/api/notes", {
        title: "Public",
        visibility: "public",
        edit_permission: "members_editors",
      });

      expect(res.status).toBe(201);
      const body = (await res.json()) as { note: Record<string, unknown> };
      expect(body.note.visibility).toBe("public");
      expect(body.note.editPermission).toBe("members_editors");
    });
  });

  // ── PUT /api/notes/:noteId ──────────────────────────────────────────────

  describe("PUT /api/notes/:noteId", () => {
    it("updates note settings (owner only)", async () => {
      mockDb.limit.mockResolvedValueOnce([testNote()]);
      mockDb.returning.mockResolvedValueOnce([testNote({ title: "Updated" })]);

      const res = await jsonRequest(app, "PUT", "/api/notes/note-1", { title: "Updated" });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { note: Record<string, unknown> };
      expect(body.note.title).toBe("Updated");
    });

    it("returns 403 for non-owner", async () => {
      mockDb.limit.mockResolvedValueOnce([testNote({ ownerId: OTHER_USER_ID })]);

      const res = await jsonRequest(app, "PUT", "/api/notes/note-1", { title: "X" });
      expect(res.status).toBe(403);
    });

    it("returns 404 for deleted or missing note", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const res = await jsonRequest(app, "PUT", "/api/notes/missing", { title: "X" });
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /api/notes/:noteId ───────────────────────────────────────────

  describe("DELETE /api/notes/:noteId", () => {
    it("logically deletes a note (owner only)", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "note-1", ownerId: TEST_USER_ID }]);

      const res = await app.request("/api/notes/note-1", { method: "DELETE" });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.deleted).toBe(true);
    });

    it("returns 403 for non-owner", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "note-1", ownerId: OTHER_USER_ID }]);

      const res = await app.request("/api/notes/note-1", { method: "DELETE" });
      expect(res.status).toBe(403);
    });
  });

  // ── GET /api/notes/:noteId ──────────────────────────────────────────────

  describe("GET /api/notes/:noteId", () => {
    it("returns note with owner role", async () => {
      const note = testNote();
      // getNoteRole: note select
      mockDb.limit.mockResolvedValueOnce([note]);

      const res = await app.request("/api/notes/note-1");

      expect(res.status).toBe(200);
      const body = (await res.json()) as { note: Record<string, unknown>; role: string };
      expect(body.role).toBe("owner");
    });

    it("returns 404 for non-existent note", async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const res = await app.request("/api/notes/missing");
      expect(res.status).toBe(404);
    });

    it("returns 403 for private note when not a member", async () => {
      mockDb.limit
        .mockResolvedValueOnce([testNote({ ownerId: OTHER_USER_ID })])
        .mockResolvedValueOnce([]); // member check

      const res = await app.request("/api/notes/note-1");
      expect(res.status).toBe(403);
    });

    it("returns guest role for public note", async () => {
      mockDb.limit
        .mockResolvedValueOnce([testNote({ ownerId: OTHER_USER_ID, visibility: "public" })])
        .mockResolvedValueOnce([]); // member check → not a member, but public

      const res = await app.request("/api/notes/note-1");

      expect(res.status).toBe(200);
      const body = (await res.json()) as { role: string };
      expect(body.role).toBe("guest");
    });
  });

  // ── GET /api/notes ──────────────────────────────────────────────────────

  describe("GET /api/notes", () => {
    it("returns own and shared notes", async () => {
      const ownNotes = [testNote()];
      // Own notes query (select→from→where→orderBy)
      mockDb.then.mockImplementationOnce((r?: ((v: unknown) => unknown) | null) =>
        Promise.resolve(ownNotes).then(r),
      );
      // Member noteIds query
      mockDb.then.mockImplementationOnce((r?: ((v: unknown) => unknown) | null) =>
        Promise.resolve([]).then(r),
      );

      const res = await app.request("/api/notes");

      expect(res.status).toBe(200);
      const body = (await res.json()) as { own: unknown[]; shared: unknown[] };
      expect(body.own).toHaveLength(1);
      expect(body.shared).toHaveLength(0);
    });
  });

  // ── POST /api/notes/:noteId/pages ───────────────────────────────────────

  describe("POST /api/notes/:noteId/pages", () => {
    it("adds a page to a note (owner)", async () => {
      // getNoteRole: note exists with current user as owner
      mockDb.limit
        .mockResolvedValueOnce([testNote()])
        // Page existence check
        .mockResolvedValueOnce([{ id: "page-1" }]);
      // maxOrder query (thenable)
      mockDb.then.mockImplementationOnce((r?: ((v: unknown) => unknown) | null) =>
        Promise.resolve([{ max: 2 }]).then(r),
      );

      const res = await jsonRequest(app, "POST", "/api/notes/note-1/pages", {
        page_id: "page-1",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.added).toBe(true);
    });

    it("returns 400 when page_id is missing", async () => {
      mockDb.limit.mockResolvedValueOnce([testNote()]);

      const res = await jsonRequest(app, "POST", "/api/notes/note-1/pages", {});
      expect(res.status).toBe(400);
    });

    it("returns 403 for viewer role", async () => {
      // getNoteRole: note owned by other, user is viewer
      mockDb.limit
        .mockResolvedValueOnce([testNote({ ownerId: OTHER_USER_ID })])
        .mockResolvedValueOnce([{ role: "viewer" }]);

      const res = await jsonRequest(app, "POST", "/api/notes/note-1/pages", {
        page_id: "page-1",
      });
      expect(res.status).toBe(403);
    });
  });

  // ── POST /api/notes/:noteId/members ─────────────────────────────────────

  describe("POST /api/notes/:noteId/members", () => {
    it("adds a member (owner only)", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "note-1", ownerId: TEST_USER_ID }]);

      const res = await jsonRequest(app, "POST", "/api/notes/note-1/members", {
        member_email: "new@example.com",
        role: "editor",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.added).toBe(true);
    });

    it("returns 403 for non-owner", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "note-1", ownerId: OTHER_USER_ID }]);

      const res = await jsonRequest(app, "POST", "/api/notes/note-1/members", {
        member_email: "new@example.com",
      });
      expect(res.status).toBe(403);
    });

    it("returns 400 when member_email is missing", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "note-1", ownerId: TEST_USER_ID }]);

      const res = await jsonRequest(app, "POST", "/api/notes/note-1/members", {});
      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /api/notes/:noteId/members/:email ────────────────────────────

  describe("DELETE /api/notes/:noteId/members/:email", () => {
    it("removes a member (owner only)", async () => {
      mockDb.limit.mockResolvedValueOnce([{ id: "note-1", ownerId: TEST_USER_ID }]);

      const res = await app.request("/api/notes/note-1/members/member%40example.com", {
        method: "DELETE",
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.removed).toBe(true);
    });
  });

  // ── GET /api/notes/:noteId/members ──────────────────────────────────────

  describe("GET /api/notes/:noteId/members", () => {
    it("returns member list for authorized user", async () => {
      // getNoteRole
      mockDb.limit.mockResolvedValueOnce([testNote()]);
      // Members query (thenable)
      mockDb.then.mockImplementationOnce((r?: ((v: unknown) => unknown) | null) =>
        Promise.resolve([{ member_email: "a@b.com", role: "editor" }]).then(r),
      );

      const res = await app.request("/api/notes/note-1/members");

      expect(res.status).toBe(200);
      const body = (await res.json()) as { members: unknown[] };
      expect(body.members).toHaveLength(1);
    });
  });

  // ── PUT /api/notes/:noteId/pages (reorder) ─────────────────────────────

  describe("PUT /api/notes/:noteId/pages", () => {
    it("reorders pages", async () => {
      mockDb.limit.mockResolvedValueOnce([testNote()]);

      const res = await jsonRequest(app, "PUT", "/api/notes/note-1/pages", {
        page_ids: ["p1", "p2", "p3"],
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.reordered).toBe(true);
    });

    it("returns 400 when page_ids is empty", async () => {
      mockDb.limit.mockResolvedValueOnce([testNote()]);

      const res = await jsonRequest(app, "PUT", "/api/notes/note-1/pages", { page_ids: [] });
      expect(res.status).toBe(400);
    });
  });
});
