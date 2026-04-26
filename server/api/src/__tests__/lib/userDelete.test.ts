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
 *  - 「session 削除 → account 削除 → users 更新」の **呼び出し順** を、
 *    対象テーブルまで含めて厳守すること（FK 違反防止）。
 *  - users 行は PII (name / email / image) が匿名化され status が "deleted" になること。
 *  - 監査ログ用 before スナップショットには PII を含めないこと。
 *
 * Unit tests for the soft-delete helpers in `lib/userDelete.ts`. Verifies the
 * impact aggregation and the cascade order/payload of the anonymization step.
 */
import { describe, it, expect } from "vitest";
import { getUserImpact, anonymizeUser } from "../../lib/userDelete.js";
import { users, session, account } from "../../schema/users.js";
import { notes } from "../../schema/notes.js";
import { subscriptions } from "../../schema/subscriptions.js";
import { aiUsageLogs } from "../../schema/aiModels.js";
import type { Database } from "../../types/index.js";

const USER_ID = "user-001";
const NOW = new Date("2026-04-26T00:00:00Z");

/**
 * Drizzle 風モック。各クエリについて
 *  - 最上位メソッド名 (`select` / `delete` / `update` / …) と引数（テーブル）
 *  - 後続のチェーン呼び出し (`from` / `where` / `set` / `returning` / …)
 * をすべて順序付きで保存し、テストから検証できるようにする。
 *
 * Drizzle-style mock that records, per query, both the top-level call (with
 * its table argument) and every chained call (`from`, `where`, `set`, …).
 * Tests can therefore assert ordering, target tables, and even the payload
 * passed to `.set()` without spinning up a second proxy layer.
 */
interface ChainCall {
  method: string;
  args: unknown[];
}
interface OpRecord {
  method: string;
  args: unknown[];
  chain: ChainCall[];
}

function createOrderedMockDb(results: unknown[]) {
  const ops: OpRecord[] = [];
  let resultIdx = 0;

  function makeChain(rIdx: number, chainSink: ChainCall[]): unknown {
    return new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            const result = results[rIdx];
            return (resolve?: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
              Promise.resolve(result).then(resolve, reject);
          }
          return (...args: unknown[]) => {
            chainSink.push({ method: prop, args });
            return makeChain(rIdx, chainSink);
          };
        },
      },
    );
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
          const chain: ChainCall[] = [];
          ops.push({ method: prop, args, chain });
          return makeChain(idx, chain);
        };
      },
    },
  );

  return { db: db as unknown as Database, ops };
}

/**
 * Find the table object passed to the first `from(...)` call on a chain.
 * select クエリは最上位 `select(...)` の引数ではなく `.from(table)` でテーブルを
 * 渡すため、対象テーブルの検証用にチェーンから抽出するヘルパ。
 */
function fromTable(op: OpRecord): unknown {
  return op.chain.find((c) => c.method === "from")?.args[0];
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

  it("queries the four expected tables: notes, session, subscriptions, aiUsageLogs", async () => {
    // メソッド数だけでなく、`.from(...)` の対象テーブルが正しいことまで検証する。
    // Verify both the operation count (4 selects) and that each one targets
    // the right Drizzle table object — protects against accidental swaps.
    const { db, ops } = createOrderedMockDb([[], [], [], []]);
    await getUserImpact(db, USER_ID);
    expect(ops).toHaveLength(4);
    expect(ops.every((o) => o.method === "select")).toBe(true);
    expect(new Set(ops.map(fromTable))).toEqual(
      new Set([notes, session, subscriptions, aiUsageLogs]),
    );
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

  it("performs select(users) → delete(session) → delete(account) → update(users), in that exact order", async () => {
    // 監査ログの一貫性 + FK 違反を避けるため、削除順とテーブルは仕様で固定されている。
    // Order AND target table are part of the contract: never update users
    // before its dependents are gone, and never confuse session/account.
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
    // select は from(users) でテーブルを指定する。
    // select uses .from(users) rather than passing the table to select().
    const selectOp = ops[0];
    expect(selectOp).toBeDefined();
    expect(fromTable(selectOp as OpRecord)).toBe(users);
    // delete / update はトップレベルでテーブルを取る。
    // delete()/update() take the table as their direct argument.
    expect(ops[1]?.args[0]).toBe(session);
    expect(ops[2]?.args[0]).toBe(account);
    expect(ops[3]?.args[0]).toBe(users);
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

    await anonymizeUser(db, USER_ID);

    // チェーンに残った `.set(...)` 呼び出しからペイロードを直接取り出す。
    // Pull the .set(...) payload directly from the recorded chain — no
    // separate spy proxy is required.
    const updateOp = ops.find((o) => o.method === "update");
    const setCall = updateOp?.chain.find((c) => c.method === "set");
    expect(setCall, "expected update chain to include a .set() call").toBeDefined();
    const payload = (setCall as ChainCall).args[0] as Record<string, unknown>;
    expect(payload.name).toBe("Deleted User");
    expect(payload.email).toBe(`deleted-${USER_ID}@example.invalid`);
    expect(payload.image).toBeNull();
    expect(payload.status).toBe("deleted");
    expect(payload.suspendedAt).toBeNull();
    expect(payload.suspendedReason).toBeNull();
    expect(payload.suspendedBy).toBeNull();
    expect(payload.updatedAt).toBeInstanceOf(Date);
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
