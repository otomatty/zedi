/**
 * `lib/userDelete.ts` のユニットテスト。
 *
 * `getUserImpact`:
 *  - notes / sessions / subscriptions / aiUsageLogs を並行に問い合わせ、
 *    それぞれのカウントと最終 AI 使用日時を返すこと。
 *  - 各テーブルにデータが無い場合のフォールバック値が正しいこと。
 *
 * `anonymizeUser`:
 *  - 削除対象が存在しない場合は throw すること。
 *  - 「session 削除 → account 削除 → users 更新」の **呼び出し順** を厳守すること。
 *  - users 行は PII (name / email / image) が匿名化され status が "deleted" になること。
 *  - 監査ログ用 before スナップショットには PII を含めないこと。
 *
 * Unit tests for the soft-delete helpers in `lib/userDelete.ts`. Verifies the
 * impact aggregation and the cascade order/payload of the anonymization step.
 */
import { describe, it, expect } from "vitest";
import { getUserImpact, anonymizeUser } from "../../lib/userDelete.js";
import type { Database } from "../../types/index.js";

const USER_ID = "user-001";
const NOW = new Date("2026-04-26T00:00:00Z");

/**
 * Build a Drizzle-style mock that returns the supplied chain results in order
 * **and** records the top-level operation name (select/delete/update) so that
 * tests can assert call ordering and per-operation arguments.
 *
 * 各クエリの「最上位メソッド名」を順序付きで保存する Drizzle 風モック。
 * anonymizeUser のような順序が重要なフローで、呼び出し順を検証できる。
 */
function createOrderedMockDb(results: unknown[]) {
  const ops: { method: string; args: unknown[]; whereCalls: unknown[] }[] = [];
  let resultIdx = 0;

  function makeChain(rIdx: number, whereSink: unknown[]): unknown {
    const handler = {
      get(_target: object, prop: string) {
        if (prop === "then") {
          const result = results[rIdx];
          return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        return (...args: unknown[]) => {
          if (prop === "where") whereSink.push(args[0]);
          return makeChain(rIdx, whereSink);
        };
      },
    };
    return new Proxy({}, handler);
  }

  const db = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "transaction") {
          return (fn: (tx: Database) => Promise<unknown>) => fn(db as unknown as Database);
        }
        return (...args: unknown[]) => {
          const idx = resultIdx++;
          const whereCalls: unknown[] = [];
          ops.push({ method: prop, args, whereCalls });
          return makeChain(idx, whereCalls);
        };
      },
    },
  );

  return { db: db as unknown as Database, ops };
}

describe("getUserImpact", () => {
  it("returns counts and last AI usage timestamp aggregated across tables", async () => {
    const { db } = createOrderedMockDb([
      [{ count: 4 }], // notes
      [{ count: 2 }], // sessions
      [{ count: 1 }], // active subs (>0)
      [{ createdAt: NOW }], // aiUsageLogs latest
    ]);

    const impact = await getUserImpact(db, USER_ID);

    expect(impact).toEqual({
      notesCount: 4,
      sessionsCount: 2,
      activeSubscription: true,
      lastAiUsageAt: NOW.toISOString(),
    });
  });

  it("falls back to zeros / null when all queries return empty rows", async () => {
    // 新規ユーザーや関連データの無いユーザーで NaN を返さないこと。
    // No notes / no sessions / no sub / no AI usage → defaults must hold.
    const { db } = createOrderedMockDb([[], [], [], []]);

    const impact = await getUserImpact(db, USER_ID);

    expect(impact).toEqual({
      notesCount: 0,
      sessionsCount: 0,
      activeSubscription: false,
      lastAiUsageAt: null,
    });
  });

  it("treats subscription count of 0 as activeSubscription=false", async () => {
    const { db } = createOrderedMockDb([
      [{ count: 0 }],
      [{ count: 0 }],
      [{ count: 0 }], // 0 active subs
      [],
    ]);
    const impact = await getUserImpact(db, USER_ID);
    expect(impact.activeSubscription).toBe(false);
  });

  it("issues exactly four select queries (one per impact dimension)", async () => {
    const { db, ops } = createOrderedMockDb([[], [], [], []]);
    await getUserImpact(db, USER_ID);
    expect(ops).toHaveLength(4);
    expect(ops.every((o) => o.method === "select")).toBe(true);
  });
});

describe("anonymizeUser", () => {
  it("throws when the target user does not exist", async () => {
    // 1 つ目の select が空配列 → ターゲットなし → エラー。
    // Empty initial select must abort before any destructive write.
    const { db, ops } = createOrderedMockDb([[]]);
    await expect(anonymizeUser(db, "missing-user")).rejects.toThrow(/not found/i);
    // It must short-circuit before issuing delete/update statements.
    // 後続の delete / update が走らないことを保証する。
    expect(ops).toHaveLength(1);
    expect(ops[0]?.method).toBe("select");
  });

  it("performs select → delete sessions → delete accounts → update user, in that exact order", async () => {
    // 監査ログの一貫性 + FK 違反を避けるため、削除順は仕様で固定されている。
    // Order is fixed by spec: never update users before its dependents are gone.
    const target = {
      id: USER_ID,
      name: "Alice",
      email: "alice@example.com",
      image: "https://cdn.example/avatar.png",
      status: "active",
    };
    const updatedRow = {
      id: USER_ID,
      name: "Deleted User",
      email: `deleted-${USER_ID}@example.invalid`,
      role: "user",
      status: "deleted",
      suspendedAt: null,
      suspendedReason: null,
      suspendedBy: null,
      createdAt: NOW,
    };
    const { db, ops } = createOrderedMockDb([
      [target], // select existing user
      undefined, // delete sessions
      undefined, // delete accounts
      [updatedRow], // update users RETURNING
    ]);

    const result = await anonymizeUser(db, USER_ID);

    expect(ops.map((o) => o.method)).toEqual(["select", "delete", "delete", "update"]);
    expect(result.updated).toEqual(updatedRow);
  });

  it("anonymizes name/email/image and clears suspension fields on the update payload", async () => {
    const target = {
      id: USER_ID,
      name: "Alice",
      email: "alice@example.com",
      image: "https://cdn.example/avatar.png",
      status: "suspended",
    };
    const updatedRow = {
      id: USER_ID,
      name: "Deleted User",
      email: `deleted-${USER_ID}@example.invalid`,
      role: "user",
      status: "deleted",
      suspendedAt: null,
      suspendedReason: null,
      suspendedBy: null,
      createdAt: NOW,
    };
    const { db, ops } = createOrderedMockDb([[target], undefined, undefined, [updatedRow]]);

    // We need to capture the .set(...) payload from the update chain — the
    // ordered mock doesn't, so wrap the db to spy on update().set(...).
    // .set(...) のペイロードを別途キャプチャし、匿名化された値を検証する。
    let setPayload: Record<string, unknown> | null = null;
    const spiedDb = new Proxy(db as unknown as Record<string, unknown>, {
      get(target, prop: string) {
        const original = (target as Record<string, unknown>)[prop];
        if (prop === "update" && typeof original === "function") {
          return (...args: unknown[]) => {
            const chain = (original as (...a: unknown[]) => unknown)(...args) as Record<
              string,
              unknown
            >;
            return new Proxy(chain, {
              get(c, cprop: string) {
                const inner = (c as Record<string, unknown>)[cprop];
                if (cprop === "set" && typeof inner === "function") {
                  return (payload: Record<string, unknown>) => {
                    setPayload = payload;
                    return (inner as (...a: unknown[]) => unknown)(payload);
                  };
                }
                return inner;
              },
            });
          };
        }
        return original;
      },
    }) as unknown as Database;

    await anonymizeUser(spiedDb, USER_ID);

    expect(setPayload).not.toBeNull();
    const payload = setPayload as unknown as Record<string, unknown>;
    expect(payload.name).toBe("Deleted User");
    expect(payload.email).toBe(`deleted-${USER_ID}@example.invalid`);
    expect(payload.image).toBeNull();
    expect(payload.status).toBe("deleted");
    expect(payload.suspendedAt).toBeNull();
    expect(payload.suspendedReason).toBeNull();
    expect(payload.suspendedBy).toBeNull();
    expect(payload.updatedAt).toBeInstanceOf(Date);
    expect(ops).toHaveLength(4);
  });

  it("returns a redacted before-snapshot that contains status only (no PII)", async () => {
    // 監査ログには元の name / email を残してはいけない。
    // The audit log must NOT receive recoverable PII.
    const target = {
      id: USER_ID,
      name: "Bob",
      email: "bob@example.com",
      image: null,
      status: "active",
    };
    const updatedRow = {
      id: USER_ID,
      name: "Deleted User",
      email: `deleted-${USER_ID}@example.invalid`,
      role: "user",
      status: "deleted",
      suspendedAt: null,
      suspendedReason: null,
      suspendedBy: null,
      createdAt: NOW,
    };
    const { db } = createOrderedMockDb([[target], undefined, undefined, [updatedRow]]);

    const { before } = await anonymizeUser(db, USER_ID);

    expect(before).toEqual({ status: "active", piiRedacted: true });
    // Defensive: the before snapshot must not leak any of these fields.
    // 念のため、PII を持ち込んでいないことを構造的にも確認する。
    expect(before).not.toHaveProperty("name");
    expect(before).not.toHaveProperty("email");
    expect(before).not.toHaveProperty("image");
  });

  it("throws if the update returns no row (race / concurrent delete)", async () => {
    const target = {
      id: USER_ID,
      name: "Alice",
      email: "alice@example.com",
      image: null,
      status: "active",
    };
    const { db } = createOrderedMockDb([
      [target],
      undefined,
      undefined,
      [], // RETURNING empty → race
    ]);

    await expect(anonymizeUser(db, USER_ID)).rejects.toThrow(/Failed to anonymize/i);
  });
});
