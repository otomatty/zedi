/**
 * PDF ソース derive-page の権限テスト。
 * Permission tests for POST /api/sources/pdf/:sourceId/highlights/:highlightId/derive-page.
 */
import { describe, it, expect, vi } from "vitest";
import type { Context, Next } from "hono";
import type { AppEnv } from "../../types/index.js";

vi.mock("../../middleware/auth.js", () => ({
  authRequired: async (c: Context<AppEnv>, next: Next) => {
    const userId = c.req.header("x-test-user-id");
    if (!userId) return c.json({ message: "Unauthorized" }, 401);
    c.set("userId", userId);
    c.set("userEmail", "tester@example.com");
    await next();
  },
}));

vi.mock("../../middleware/rateLimit.js", () => ({
  rateLimit: () => async (_c: Context<AppEnv>, next: Next) => {
    await next();
  },
}));

vi.mock("../../services/defaultNoteService.js", () => ({
  ensureDefaultNote: vi.fn(async (_db: unknown, userId: string) => ({
    id: "default-note-mock",
    ownerId: userId,
    title: "Mock note",
    visibility: "private" as const,
    editPermission: "owner_only" as const,
    isOfficial: false,
    isDefault: true,
    viewCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
  })),
}));

import { Hono } from "hono";
import { errorHandler } from "../../middleware/errorHandler.js";
import pdfSourcesRoutes from "../../routes/pdfSources.js";
import { createMockDb } from "../createMockDb.js";

const TEST_USER_ID = "user-pdf-derive-1";
const SOURCE_ID = "pdf-source-1";
const HIGHLIGHT_ID = "highlight-1";
const FOREIGN_NOTE_ID = "foreign-note-id";

const PDF_SOURCE_ROW = {
  id: SOURCE_ID,
  kind: "pdf_local" as const,
  ownerId: TEST_USER_ID,
  displayName: "Test PDF",
};

const HIGHLIGHT_ROW = {
  id: HIGHLIGHT_ID,
  sourceId: SOURCE_ID,
  ownerId: TEST_USER_ID,
  text: "Highlighted text",
  derivedPageId: null,
};

function authHeaders(): Record<string, string> {
  return {
    "x-test-user-id": TEST_USER_ID,
    "Content-Type": "application/json",
  };
}

function createPdfSourcesApp(dbResults: unknown[]) {
  const { db } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });
  app.route("/api/sources", pdfSourcesRoutes);
  return app;
}

describe("POST /api/sources/pdf/:sourceId/highlights/:highlightId/derive-page", () => {
  it("returns 403 when noteId points to a note the caller cannot edit", async () => {
    const foreignNote = {
      id: FOREIGN_NOTE_ID,
      ownerId: "other-user",
      title: "Someone else's note",
      visibility: "private" as const,
      editPermission: "owner_only" as const,
      isOfficial: false,
      isDefault: false,
      viewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDeleted: false,
      memberRole: null,
      domainRole: null,
    };

    const app = createPdfSourcesApp([[PDF_SOURCE_ROW], [HIGHLIGHT_ROW], [foreignNote]]);

    const res = await app.request(
      `/api/sources/pdf/${SOURCE_ID}/highlights/${HIGHLIGHT_ID}/derive-page`,
      {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ noteId: FOREIGN_NOTE_ID, title: "Injected page" }),
      },
    );

    expect(res.status).toBe(403);
  });
});
