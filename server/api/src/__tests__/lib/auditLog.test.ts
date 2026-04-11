/**
 * `lib/auditLog.ts` のユニットテスト。
 * Unit tests for the audit-log helper (extractClientIp, recordAuditLog).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Context } from "hono";
import type { AppEnv } from "../../types/index.js";
import { extractClientIp, recordAuditLog } from "../../lib/auditLog.js";

/**
 * Build a minimal Hono-like Context double for tests.
 * テスト用の最小限の Hono Context ダブルを作る。
 */
function createMockContext(params: {
  userId?: string;
  headers?: Record<string, string>;
}): Context<AppEnv> {
  const headers = params.headers ?? {};
  const store: Record<string, unknown> = {};
  if (params.userId !== undefined) store.userId = params.userId;
  return {
    req: {
      header: (name: string) => headers[name.toLowerCase()],
    },
    get: (key: string) => store[key],
    set: (key: string, value: unknown) => {
      store[key] = value;
    },
  } as unknown as Context<AppEnv>;
}

describe("extractClientIp", () => {
  it("returns the leftmost IP from x-forwarded-for", () => {
    const c = createMockContext({
      headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1, 172.16.0.1" },
    });
    expect(extractClientIp(c)).toBe("203.0.113.10");
  });

  it("trims whitespace around the value", () => {
    const c = createMockContext({
      headers: { "x-forwarded-for": "  198.51.100.7 " },
    });
    expect(extractClientIp(c)).toBe("198.51.100.7");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const c = createMockContext({ headers: { "x-real-ip": "192.0.2.42" } });
    expect(extractClientIp(c)).toBe("192.0.2.42");
  });

  it("returns null when neither header is present", () => {
    const c = createMockContext({ headers: {} });
    expect(extractClientIp(c)).toBeNull();
  });

  it("returns null when x-forwarded-for is empty", () => {
    const c = createMockContext({ headers: { "x-forwarded-for": "  " } });
    expect(extractClientIp(c)).toBeNull();
  });
});

/**
 * Lightweight fake DB that captures insert().values(...) calls so we can
 * assert the payload without pulling in pg.
 * insert().values(...) の呼び出しを捕まえるだけの軽量な DB ダブル。
 */
function createFakeDb() {
  const inserts: { table: unknown; values: unknown }[] = [];
  const db = {
    insert: (table: unknown) => ({
      values: async (values: unknown) => {
        inserts.push({ table, values });
      },
    }),
  };
  return { db, inserts };
}

describe("recordAuditLog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts a row with actor, action, target, before/after, ip, and user-agent", async () => {
    const { db, inserts } = createFakeDb();
    const c = createMockContext({
      userId: "admin-001",
      headers: {
        "x-forwarded-for": "203.0.113.10",
        "user-agent": "vitest/1.0",
      },
    });

    await recordAuditLog(c, db as never, {
      action: "user.role.update",
      targetType: "user",
      targetId: "user-target-001",
      before: { role: "user" },
      after: { role: "admin" },
    });

    expect(inserts).toHaveLength(1);
    const row = inserts[0].values as Record<string, unknown>;
    expect(row.actorUserId).toBe("admin-001");
    expect(row.action).toBe("user.role.update");
    expect(row.targetType).toBe("user");
    expect(row.targetId).toBe("user-target-001");
    expect(row.before).toEqual({ role: "user" });
    expect(row.after).toEqual({ role: "admin" });
    expect(row.ipAddress).toBe("203.0.113.10");
    expect(row.userAgent).toBe("vitest/1.0");
    expect(typeof row.id).toBe("string");
    expect((row.id as string).length).toBeGreaterThan(0);
  });

  it("stores null for optional fields when omitted", async () => {
    const { db, inserts } = createFakeDb();
    const c = createMockContext({ userId: "admin-001", headers: {} });

    await recordAuditLog(c, db as never, {
      action: "user.list",
      targetType: "user",
    });

    const row = inserts[0].values as Record<string, unknown>;
    expect(row.targetId).toBeNull();
    expect(row.before).toBeNull();
    expect(row.after).toBeNull();
    expect(row.ipAddress).toBeNull();
    expect(row.userAgent).toBeNull();
  });

  it("throws when no authenticated actor is present", async () => {
    const { db } = createFakeDb();
    const c = createMockContext({ headers: {} });

    await expect(
      recordAuditLog(c, db as never, {
        action: "user.role.update",
        targetType: "user",
        targetId: "user-target-001",
      }),
    ).rejects.toThrow(/authenticated/i);
  });

  it("generates a unique id for each call", async () => {
    const { db, inserts } = createFakeDb();
    const c = createMockContext({ userId: "admin-001", headers: {} });

    await recordAuditLog(c, db as never, {
      action: "user.role.update",
      targetType: "user",
      targetId: "t1",
    });
    await recordAuditLog(c, db as never, {
      action: "user.role.update",
      targetType: "user",
      targetId: "t2",
    });

    const id1 = (inserts[0].values as Record<string, unknown>).id;
    const id2 = (inserts[1].values as Record<string, unknown>).id;
    expect(id1).not.toBe(id2);
  });
});
