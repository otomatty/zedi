/**
 * `apiErrorService` の単体テスト。
 *
 * - 状態遷移のバリデーション（仕様: open ↔ investigating ↔ resolved/ignored、
 *   ignored から resolved への直接遷移は禁止）。
 * - Sentry サマリの upsert: 初回 insert と、同一 `sentry_issue_id` での
 *   再来時に `occurrences` が増え `first_seen_at` が保持されることを、
 *   モック DB が返す行を介して検証する。
 * - 一覧取得・単件取得・状態更新の振る舞いをモック DB で確認する。
 *
 * Unit tests for `apiErrorService`. Status-transition logic is covered as a
 * pure function; the upsert path uses a mock DB that returns the post-upsert
 * row so we can assert the `occurrences` increment and `first_seen_at`
 * preservation contract without spinning up Postgres.
 */
import { describe, it, expect } from "vitest";
import {
  ALLOWED_API_ERROR_STATUS_TRANSITIONS,
  assertValidApiErrorStatusTransition,
  isValidApiErrorStatusTransition,
  upsertFromSentrySummary,
  listApiErrors,
  getApiErrorById,
  getApiErrorBySentryIssueId,
  updateApiErrorStatus,
  API_ERROR_LIST_DEFAULT_LIMIT,
  API_ERROR_LIST_MAX_LIMIT,
} from "./apiErrorService.js";
import type { ApiError, ApiErrorStatus } from "../schema/apiErrors.js";

// ── Mock DB helpers ─────────────────────────────────────────────────────────

/**
 * drizzle のチェイン (`select().from().where()...` や
 * `insert().values().onConflictDoUpdate().returning()`) を素通しで一定の
 * 結果に解決する Proxy。最終 `await` 時に `result` を返す。
 *
 * Proxy that lets any drizzle query-builder chain resolve to a fixed result.
 * The terminal `await` returns the canned `result`, regardless of which
 * builder method ends the chain.
 */
function makeChainProxy(result: unknown): unknown {
  return new Proxy({} as Record<string, unknown>, {
    get(_target, prop: string) {
      if (prop === "then") {
        return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject);
      }
      if (prop === "catch") {
        return (reject?: (e: unknown) => unknown) => Promise.resolve(result).catch(reject);
      }
      if (prop === "finally") {
        return (fn?: () => void) => Promise.resolve(result).finally(fn);
      }
      return (..._args: unknown[]) => makeChainProxy(result);
    },
  });
}

function createMockDb(queryResults: unknown[]) {
  let queryIndex = 0;
  return new Proxy({} as Record<string, unknown>, {
    get(_target, _prop: string) {
      return (..._args: unknown[]) => {
        const idx = queryIndex++;
        return makeChainProxy(queryResults[idx] ?? []);
      };
    },
  });
}

function makeRow(overrides: Partial<ApiError> = {}): ApiError {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    sentryIssueId: "sentry-issue-1",
    fingerprint: null,
    title: "TypeError: Cannot read properties of undefined",
    route: "POST /api/ingest",
    statusCode: 500,
    occurrences: 1,
    firstSeenAt: new Date("2026-05-01T00:00:00Z"),
    lastSeenAt: new Date("2026-05-01T00:00:00Z"),
    severity: "unknown",
    status: "open",
    aiSummary: null,
    aiSuspectedFiles: null,
    aiRootCause: null,
    aiSuggestedFix: null,
    githubIssueNumber: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T00:00:00Z"),
    ...overrides,
  };
}

// ── Status transition rules ────────────────────────────────────────────────

describe("ALLOWED_API_ERROR_STATUS_TRANSITIONS", () => {
  it("exposes a complete map for every known status", () => {
    const statuses: ApiErrorStatus[] = ["open", "investigating", "resolved", "ignored"];
    for (const s of statuses) {
      expect(ALLOWED_API_ERROR_STATUS_TRANSITIONS[s]).toBeDefined();
    }
  });
});

describe("isValidApiErrorStatusTransition", () => {
  it("allows open -> investigating, resolved, ignored", () => {
    expect(isValidApiErrorStatusTransition("open", "investigating")).toBe(true);
    expect(isValidApiErrorStatusTransition("open", "resolved")).toBe(true);
    expect(isValidApiErrorStatusTransition("open", "ignored")).toBe(true);
  });

  it("allows investigating -> resolved, ignored, open", () => {
    expect(isValidApiErrorStatusTransition("investigating", "resolved")).toBe(true);
    expect(isValidApiErrorStatusTransition("investigating", "ignored")).toBe(true);
    expect(isValidApiErrorStatusTransition("investigating", "open")).toBe(true);
  });

  it("allows resolved -> open (regression) and resolved -> ignored", () => {
    expect(isValidApiErrorStatusTransition("resolved", "open")).toBe(true);
    expect(isValidApiErrorStatusTransition("resolved", "ignored")).toBe(true);
  });

  it("allows ignored -> open only", () => {
    expect(isValidApiErrorStatusTransition("ignored", "open")).toBe(true);
    expect(isValidApiErrorStatusTransition("ignored", "investigating")).toBe(false);
    expect(isValidApiErrorStatusTransition("ignored", "resolved")).toBe(false);
  });

  it("rejects same-state transitions (caller is expected to short-circuit)", () => {
    expect(isValidApiErrorStatusTransition("open", "open")).toBe(false);
    expect(isValidApiErrorStatusTransition("resolved", "resolved")).toBe(false);
  });

  it("rejects skipping investigating: resolved -> investigating", () => {
    expect(isValidApiErrorStatusTransition("resolved", "investigating")).toBe(false);
  });
});

describe("assertValidApiErrorStatusTransition", () => {
  it("throws with a structured message on invalid transition", () => {
    expect(() => assertValidApiErrorStatusTransition("ignored", "resolved")).toThrow(
      /invalid api_errors status transition: ignored -> resolved/i,
    );
  });

  it("does not throw on a valid transition", () => {
    expect(() => assertValidApiErrorStatusTransition("open", "investigating")).not.toThrow();
  });
});

// ── upsertFromSentrySummary ────────────────────────────────────────────────

describe("upsertFromSentrySummary", () => {
  it("inserts a fresh row when the sentry_issue_id has not been seen", async () => {
    const inserted = makeRow({ occurrences: 1 });
    const db = createMockDb([[inserted]]);

    const result = await upsertFromSentrySummary(db as never, {
      sentryIssueId: "sentry-issue-1",
      title: "TypeError: Cannot read properties of undefined",
      route: "POST /api/ingest",
      statusCode: 500,
      lastSeenAt: new Date("2026-05-01T00:00:00Z"),
    });

    expect(result.occurrences).toBe(1);
    expect(result.sentryIssueId).toBe("sentry-issue-1");
    expect(result.firstSeenAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("on conflict, returns the row with incremented occurrences and preserved first_seen_at", async () => {
    // 2 回目の alert 受信を想定。upsert 後の行 (occurrences=2) が返る。
    // Simulate a second alert for the same sentry_issue_id; the mock returns
    // the post-upsert row to reflect the increment + preservation contract.
    const upserted = makeRow({
      occurrences: 2,
      firstSeenAt: new Date("2026-05-01T00:00:00Z"),
      lastSeenAt: new Date("2026-05-02T00:00:00Z"),
    });
    const db = createMockDb([[upserted]]);

    const result = await upsertFromSentrySummary(db as never, {
      sentryIssueId: "sentry-issue-1",
      title: "TypeError: Cannot read properties of undefined",
      route: "POST /api/ingest",
      statusCode: 500,
      occurrencesDelta: 1,
      lastSeenAt: new Date("2026-05-02T00:00:00Z"),
    });

    expect(result.occurrences).toBe(2);
    expect(result.firstSeenAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(result.lastSeenAt.toISOString()).toBe("2026-05-02T00:00:00.000Z");
  });

  it("throws when the upsert returns no rows (defensive guard)", async () => {
    const db = createMockDb([[]]);
    await expect(
      upsertFromSentrySummary(db as never, {
        sentryIssueId: "sentry-issue-x",
        title: "noop",
      }),
    ).rejects.toThrow(/upsert returned no rows/i);
  });

  it("rejects empty sentry_issue_id at the boundary", async () => {
    const db = createMockDb([[makeRow()]]);
    await expect(
      upsertFromSentrySummary(db as never, {
        sentryIssueId: "  ",
        title: "noop",
      }),
    ).rejects.toThrow(/sentryIssueId is required/i);
  });
});

// ── listApiErrors / get* ───────────────────────────────────────────────────

describe("listApiErrors", () => {
  it("returns rows and total count", async () => {
    const rows = [makeRow({ id: "00000000-0000-0000-0000-000000000001" })];
    const db = createMockDb([rows, [{ count: 1 }]]);

    const result = await listApiErrors(db as never, {});

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("uses the documented default and max limits", () => {
    expect(API_ERROR_LIST_DEFAULT_LIMIT).toBe(50);
    expect(API_ERROR_LIST_MAX_LIMIT).toBe(200);
  });

  it("clamps oversized limits to the max without throwing", async () => {
    const db = createMockDb([[], [{ count: 0 }]]);

    const result = await listApiErrors(db as never, { limit: 10_000 });

    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("accepts status and severity filters without error", async () => {
    const db = createMockDb([[], [{ count: 0 }]]);

    const result = await listApiErrors(db as never, {
      status: "open",
      severity: "high",
      limit: 25,
      offset: 50,
    });

    expect(result).toEqual({ rows: [], total: 0 });
  });
});

describe("getApiErrorById", () => {
  it("returns the row when present", async () => {
    const row = makeRow({ id: "00000000-0000-0000-0000-000000000099" });
    const db = createMockDb([[row]]);
    const result = await getApiErrorById(db as never, row.id);
    expect(result?.id).toBe(row.id);
  });

  it("returns null when not found", async () => {
    const db = createMockDb([[]]);
    const result = await getApiErrorById(db as never, "00000000-0000-0000-0000-000000000099");
    expect(result).toBeNull();
  });
});

describe("getApiErrorBySentryIssueId", () => {
  it("returns the row when present", async () => {
    const row = makeRow({ sentryIssueId: "sentry-issue-42" });
    const db = createMockDb([[row]]);
    const result = await getApiErrorBySentryIssueId(db as never, "sentry-issue-42");
    expect(result?.sentryIssueId).toBe("sentry-issue-42");
  });

  it("returns null when not found", async () => {
    const db = createMockDb([[]]);
    const result = await getApiErrorBySentryIssueId(db as never, "missing");
    expect(result).toBeNull();
  });
});

// ── updateApiErrorStatus ───────────────────────────────────────────────────

describe("updateApiErrorStatus", () => {
  it("updates the status when the transition is valid", async () => {
    const before = makeRow({ status: "open" });
    const after = makeRow({ ...before, status: "investigating" });
    // 1) SELECT current row, 2) UPDATE returning row
    const db = createMockDb([[before], [after]]);

    const result = await updateApiErrorStatus(db as never, {
      id: before.id,
      nextStatus: "investigating",
    });

    expect(result?.status).toBe("investigating");
  });

  it("rejects an invalid transition without issuing the UPDATE", async () => {
    const before = makeRow({ status: "ignored" });
    const db = createMockDb([[before]]);

    await expect(
      updateApiErrorStatus(db as never, {
        id: before.id,
        nextStatus: "resolved",
      }),
    ).rejects.toThrow(/invalid api_errors status transition/i);
  });

  it("returns null when the target row does not exist", async () => {
    const db = createMockDb([[]]);

    const result = await updateApiErrorStatus(db as never, {
      id: "00000000-0000-0000-0000-000000000099",
      nextStatus: "investigating",
    });

    expect(result).toBeNull();
  });

  it("treats a same-state transition as an idempotent no-op (returns the existing row)", async () => {
    const before = makeRow({ status: "open" });
    const db = createMockDb([[before]]);

    const result = await updateApiErrorStatus(db as never, {
      id: before.id,
      nextStatus: "open",
    });

    expect(result?.status).toBe("open");
  });
});
