/**
 * `evaluateHealth` のユニットテスト。Postgres プールの飽和判定と payload shape を網羅する。
 *
 * Unit tests for `evaluateHealth`. Exhaustive coverage of the saturation logic
 * and the wire shape consumed by Railway / external monitors.
 */
import { describe, expect, it } from "vitest";
import { POOL_SATURATION_THRESHOLD, evaluateHealth } from "./health.js";

const NOW = "2026-05-17T00:00:00.000Z";

/** デフォルトの spacious pool snapshot / Roomy pool snapshot for negative tests. */
const idlePool = { totalCount: 1, idleCount: 1, waitingCount: 0 };

describe("evaluateHealth", () => {
  it("returns healthy when pool has plenty of headroom", () => {
    const payload = evaluateHealth({
      connections: 3,
      documents: 2,
      pool: { totalCount: 2, idleCount: 1, waitingCount: 0 },
      poolMax: 10,
      now: NOW,
    });
    expect(payload).toEqual({
      status: "healthy",
      service: "zedi-hocuspocus",
      timestamp: NOW,
      connections: 3,
      documents: 2,
      pool: {
        total: 2,
        idle: 1,
        active: 1,
        waiting: 0,
        max: 10,
        saturation: 0.1,
        saturated: false,
      },
    });
  });

  it("flips to degraded when there is even a single waiter", () => {
    // waiters > 0 はキュー化が始まったサイン。飽和率に関わらず degraded にする。
    // Any non-zero waiter means the queue has started; degrade unconditionally.
    const payload = evaluateHealth({
      connections: 100,
      documents: 50,
      pool: { totalCount: 10, idleCount: 10, waitingCount: 1 },
      poolMax: 10,
      now: NOW,
    });
    expect(payload.status).toBe("degraded");
    expect(payload.pool.saturated).toBe(true);
    expect(payload.pool.waiting).toBe(1);
  });

  it("flips to degraded once active/max crosses the saturation threshold", () => {
    // POOL_SATURATION_THRESHOLD = 0.8 → max=10, active=8 で degraded になること。
    // With max=10 and active=8 we hit the 80% threshold and trip `degraded`.
    const payload = evaluateHealth({
      connections: 8,
      documents: 8,
      pool: { totalCount: 10, idleCount: 2, waitingCount: 0 },
      poolMax: 10,
      now: NOW,
    });
    expect(payload.pool.saturation).toBeCloseTo(0.8, 5);
    expect(payload.pool.saturation).toBeGreaterThanOrEqual(POOL_SATURATION_THRESHOLD);
    expect(payload.pool.saturated).toBe(true);
    expect(payload.status).toBe("degraded");
  });

  it("stays healthy when active/max is just below the threshold", () => {
    // 7/10 = 0.7 はまだ閾値未満。waiters も 0 なので healthy のまま。
    // 70% is below the 80% threshold and there are no waiters → healthy.
    const payload = evaluateHealth({
      connections: 7,
      documents: 7,
      pool: { totalCount: 10, idleCount: 3, waitingCount: 0 },
      poolMax: 10,
      now: NOW,
    });
    expect(payload.pool.saturation).toBeCloseTo(0.7, 5);
    expect(payload.pool.saturated).toBe(false);
    expect(payload.status).toBe("healthy");
  });

  it("treats a cold pool (totalCount=0) as healthy regardless of max", () => {
    // 起動直後で接続がまだ無い場合は誤って degraded にしない（active=0, saturation=0）。
    // A freshly started Hocuspocus that has not yet opened any pg client must
    // not be reported as degraded just because the pool is empty.
    const payload = evaluateHealth({
      connections: 0,
      documents: 0,
      pool: { totalCount: 0, idleCount: 0, waitingCount: 0 },
      poolMax: 10,
      now: NOW,
    });
    expect(payload.status).toBe("healthy");
    expect(payload.pool.saturated).toBe(false);
    expect(payload.pool.active).toBe(0);
    expect(payload.pool.saturation).toBe(0);
  });

  it("clamps an out-of-range idleCount > totalCount (defensive)", () => {
    // `pg.Pool` 内部実装が変わって idle > total が観測されても、active が負にならず
    // saturation も 0..1 の範囲に収まること。
    // Guard against future `pg.Pool` internals exposing idle > total; active
    // must never go negative and saturation must stay non-negative.
    const payload = evaluateHealth({
      connections: 1,
      documents: 1,
      pool: { totalCount: 2, idleCount: 99, waitingCount: 0 },
      poolMax: 10,
      now: NOW,
    });
    expect(payload.pool.total).toBe(2);
    expect(payload.pool.idle).toBe(2);
    expect(payload.pool.active).toBe(0);
    expect(payload.pool.saturation).toBe(0);
    expect(payload.status).toBe("healthy");
  });

  it("yields saturation=0 when poolMax is 0 (avoids divide-by-zero)", () => {
    // poolMax を渡し忘れたケースでも例外を投げず、飽和度 0 で degrade させない。
    // A misconfigured poolMax=0 must not throw or trip `degraded`.
    const payload = evaluateHealth({
      connections: 1,
      documents: 1,
      pool: { totalCount: 1, idleCount: 0, waitingCount: 0 },
      poolMax: 0,
      now: NOW,
    });
    expect(payload.pool.saturation).toBe(0);
    expect(payload.pool.saturated).toBe(false);
    expect(payload.status).toBe("healthy");
  });

  it("preserves Hocuspocus counters verbatim", () => {
    // `connections` / `documents` はそのまま透過する。Railway / 外部監視はこれを直接参照する。
    // `connections` / `documents` must pass through unchanged for external dashboards.
    const payload = evaluateHealth({
      connections: 42,
      documents: 17,
      pool: idlePool,
      poolMax: 10,
      now: NOW,
    });
    expect(payload.connections).toBe(42);
    expect(payload.documents).toBe(17);
  });

  it("defaults `timestamp` to a parseable ISO string when `now` is omitted", () => {
    // 引数 `now` を省略すると `new Date().toISOString()` が呼ばれる。具体値は固定せず、
    // ISO 8601 のフォーマットだけ検証する。
    // When `now` is omitted, fall back to `new Date().toISOString()`. We only
    // assert the result parses cleanly, not its literal value.
    const before = Date.now();
    const payload = evaluateHealth({
      connections: 0,
      documents: 0,
      pool: idlePool,
      poolMax: 10,
    });
    const after = Date.now();
    const parsed = Date.parse(payload.timestamp);
    expect(Number.isNaN(parsed)).toBe(false);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});
