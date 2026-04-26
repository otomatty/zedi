/**
 * `services/subscriptionService.ts` のユニットテスト。
 *
 * - `getUserTier`:
 *   - active / trialing なサブスク行から `plan` を返す。
 *   - 未契約 (DB ヒットなし) は `"free"` を返す。
 *   - 30 秒の TTL キャッシュが効いており、同 TTL 内では DB を再問い合わせしない。
 *   - TTL 経過後は再問い合わせする。
 * - `getSubscription`:
 *   - DB の最初の 1 行を返す / 無ければ null。
 *
 * Unit tests for getUserTier (with its 30s in-memory TTL cache) and
 * getSubscription. The cache is a module-level Map, so tests use distinct
 * userIds per case to avoid cross-test bleed.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import type { Database } from "../../types/index.js";
import { getUserTier, getSubscription } from "../../services/subscriptionService.js";

/**
 * Minimal Drizzle stub: select().from().where().limit() resolves with `rows`.
 * Counts how many times the chain was started so cache hits are observable.
 *
 * select チェーンが何回起動されたかを数える最小の DB スタブ。
 * キャッシュヒット時に呼ばれないことを検証するために使う。
 */
function createCountingDb(rows: unknown[]) {
  const selectSpy = vi.fn(() => ({
    from: () => ({
      where: () => ({
        limit: async () => rows,
      }),
    }),
  }));
  return {
    db: { select: selectSpy } as unknown as Database,
    selectSpy,
  };
}

describe("getUserTier", () => {
  // setSystemTime を使った各テストの後始末。
  // Restore real timers after every test that mocks them.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'pro' when DB returns a pro subscription row", async () => {
    const { db } = createCountingDb([{ plan: "pro" }]);
    const tier = await getUserTier("u-pro-1", db);
    expect(tier).toBe("pro");
  });

  it("returns 'free' when DB returns no active/trialing subscription", async () => {
    // 未契約ユーザー / non-subscribed users are billed as free.
    const { db } = createCountingDb([]);
    const tier = await getUserTier("u-none-1", db);
    expect(tier).toBe("free");
  });

  it("caches the result for the TTL window (no DB call on second hit)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T00:00:00Z"));

    const { db, selectSpy } = createCountingDb([{ plan: "pro" }]);
    const userId = "u-cache-hit";

    expect(await getUserTier(userId, db)).toBe("pro");
    expect(selectSpy).toHaveBeenCalledTimes(1);

    // Within the 30s TTL: cached value, no second DB call.
    // TTL 内: DB は再問い合わせしない。
    vi.setSystemTime(new Date("2026-04-26T00:00:29Z"));
    expect(await getUserTier(userId, db)).toBe("pro");
    expect(selectSpy).toHaveBeenCalledTimes(1);
  });

  it("re-queries the DB after the TTL window expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T00:00:00Z"));

    const { db, selectSpy } = createCountingDb([{ plan: "pro" }]);
    const userId = "u-cache-expire";

    expect(await getUserTier(userId, db)).toBe("pro");
    expect(selectSpy).toHaveBeenCalledTimes(1);

    // Advance past the 30s TTL: cache is invalidated.
    // TTL 経過: キャッシュが切れて再問い合わせされる。
    vi.setSystemTime(new Date("2026-04-26T00:00:31Z"));
    expect(await getUserTier(userId, db)).toBe("pro");
    expect(selectSpy).toHaveBeenCalledTimes(2);
  });

  it("does not share cache entries across distinct userIds", async () => {
    const { db: dbA, selectSpy: spyA } = createCountingDb([{ plan: "pro" }]);
    const { db: dbB, selectSpy: spyB } = createCountingDb([]);

    expect(await getUserTier("u-iso-A", dbA)).toBe("pro");
    expect(await getUserTier("u-iso-B", dbB)).toBe("free");
    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledTimes(1);
  });
});

describe("getSubscription", () => {
  it("returns the first row when one exists", async () => {
    const sub = { id: "sub-1", userId: "u1", plan: "pro", status: "active" };
    const { db } = createCountingDb([sub]);
    const got = await getSubscription("u1", db);
    expect(got).toEqual(sub);
  });

  it("returns null when no subscription row exists", async () => {
    const { db } = createCountingDb([]);
    const got = await getSubscription("u-no-sub", db);
    expect(got).toBeNull();
  });
});
