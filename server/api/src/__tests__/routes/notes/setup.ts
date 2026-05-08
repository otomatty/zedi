/**
 * ノートテスト共通ユーティリティ
 *
 * vi.mock は呼び出し元のテストファイルに記述する必要がある（hoisting のため）。
 * このファイルには定数・モックファクトリ・テスト用アプリ生成関数のみ置く。
 */
import { Hono } from "hono";
import type { AppEnv } from "../../../types/index.js";
import noteRoutes from "../../../routes/notes/index.js";

// ── Constants ───────────────────────────────────────────────────────────────

/** モック認証で使うユーザー ID / Mock auth user id */
export const TEST_USER_ID = "user-test-123";
/** モック認証で使うメール / Mock auth email */
export const TEST_USER_EMAIL = "test@example.com";
/** 別ユーザーのモック ID / Second mock user id */
export const OTHER_USER_ID = "user-other-456";
/** 別ユーザーのモックメール / Second mock user email */
export const OTHER_USER_EMAIL = "other@example.com";

// ── Mock Data Factories ─────────────────────────────────────────────────────

/** テスト用ノート行のデフォルト / Default mock note row */
export function createMockNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "note-test-001",
    ownerId: TEST_USER_ID,
    title: "Test Note",
    visibility: "private",
    editPermission: "owner_only",
    isOfficial: false,
    isDefault: false,
    viewCount: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    isDeleted: false,
    ...overrides,
  };
}

/** テスト用ページ行のデフォルト / Default mock page row */
export function createMockPageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "page-test-001",
    ownerId: TEST_USER_ID,
    sourcePageId: null,
    title: "Test Page",
    contentPreview: "Preview content...",
    thumbnailUrl: null,
    sourceUrl: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    isDeleted: false,
    sortOrder: 0,
    addedByUserId: TEST_USER_ID,
    addedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** テスト用ページ一覧行のデフォルト / Default mock page list row */
export function createMockPageListRow(overrides: Record<string, unknown> = {}) {
  return {
    page_id: "page-test-001",
    sort_order: 0,
    added_by: TEST_USER_ID,
    page_title: "Test Page",
    page_content_preview: "Preview...",
    page_thumbnail_url: null,
    page_updated_at: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** Mock row shape matches DB select (camelCase). Route maps to snake_case in response. */
export function createMockMember(overrides: Record<string, unknown> = {}) {
  return {
    noteId: "note-test-001",
    memberEmail: OTHER_USER_EMAIL,
    role: "viewer",
    invitedByUserId: TEST_USER_ID,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ── Mock DB ─────────────────────────────────────────────────────────────────

/** プロキシ DB モックが記録するチェーン情報 / Recorded chain info from proxy DB mock */
export interface ChainInfo {
  startMethod: string;
  startArgs: unknown[];
  ops: { method: string; args: unknown[] }[];
}

/**
 * 連鎖するクエリチェーンを順番に解決するプロキシベースの DB モック。
 * results[0] が最初のクエリ結果、results[1] が次、…と対応する。
 */
export function createMockDb(results: unknown[]) {
  let chainIndex = 0;
  const chains: ChainInfo[] = [];

  function makeChainProxy(
    resultIdx: number,
    ops: { method: string; args: unknown[] }[],
  ): Promise<unknown> & Record<string, (...args: unknown[]) => unknown> {
    return new Proxy({} as Record<string, (...args: unknown[]) => unknown>, {
      get(_, prop: string) {
        if (prop === "then") {
          const result = results[resultIdx];
          return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        if (prop === "catch") {
          const result = results[resultIdx];
          return (reject?: (e: unknown) => unknown) => Promise.resolve(result).catch(reject);
        }
        if (prop === "finally") {
          const result = results[resultIdx];
          return (fn?: () => void) => Promise.resolve(result).finally(fn);
        }
        return (...args: unknown[]) => {
          ops.push({ method: prop, args });
          return makeChainProxy(resultIdx, ops);
        };
      },
    }) as Promise<unknown> & Record<string, (...args: unknown[]) => unknown>;
  }

  const db = new Proxy({} as Record<string, (...args: unknown[]) => unknown>, {
    get(_, prop: string) {
      if (prop === "transaction") {
        return (fn: (tx: typeof db) => Promise<unknown>) => fn(db);
      }
      if (prop === "execute") {
        return (...args: unknown[]) => {
          const idx = chainIndex++;
          const ops: { method: string; args: unknown[] }[] = [];
          chains.push({ startMethod: "execute", startArgs: args, ops });
          return makeChainProxy(idx, ops);
        };
      }
      return (...args: unknown[]) => {
        const idx = chainIndex++;
        const ops: { method: string; args: unknown[] }[] = [];
        chains.push({ startMethod: prop, startArgs: args, ops });
        return makeChainProxy(idx, ops);
      };
    },
  });

  return { db, chains };
}

// ── Test App Factory ────────────────────────────────────────────────────────

/** `dbResults` の順にクエリ結果を返すテスト用 Hono アプリを組み立てる。 */
export function createTestApp(dbResults: unknown[]) {
  const { db, chains } = createMockDb(dbResults);
  const app = new Hono<AppEnv>();

  app.use("*", async (c, next) => {
    c.set("db", db as unknown as AppEnv["Variables"]["db"]);
    await next();
  });

  app.route("/api/notes", noteRoutes);
  return { app, chains };
}

// ── Auth Headers ────────────────────────────────────────────────────────────

/** テスト用の認証ヘッダ / Test auth headers */
export function authHeaders(userId = TEST_USER_ID, userEmail = TEST_USER_EMAIL) {
  return {
    "x-test-user-id": userId,
    "x-test-user-email": userEmail,
    "Content-Type": "application/json",
  };
}
