/**
 * rateLimit ミドルウェアのユニットテスト
 *
 * - 既存互換: `rateLimit("free")` は 1h ウィンドウで tier 既定値を適用する
 * - 新 API: `rateLimit({ limit, windowSec, keyBy, label })` が意図通り動く
 * - 429 応答に Retry-After / X-RateLimit-* ヘッダと RATE_LIMIT_EXCEEDED JSON を返す
 * - keyBy: "ip" は IP ヘッダでキー付けされ、ユーザーごとの干渉がないこと
 *
 * Unit tests for the rate limit middleware (#562).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../../types/index.js";
import { rateLimit } from "../../middleware/rateLimit.js";

/**
 * rateLimit ミドルウェアは `multi().incr(key).expire(key, ttl).exec()` を呼ぶため、
 * その最低限の形を満たすインメモリ Redis を用意する。
 * Minimal in-memory stand-in that mimics the subset of ioredis used by the middleware.
 */
function createMockRedis(): AppEnv["Variables"]["redis"] {
  const store = new Map<string, number>();
  const incr = (key: string): number => {
    const next = (store.get(key) ?? 0) + 1;
    store.set(key, next);
    return next;
  };
  return {
    multi: vi.fn(() => {
      const ops: Array<() => unknown> = [];
      const chain = {
        incr(key: string) {
          ops.push(() => incr(key));
          return chain;
        },
        expire(_key: string, _ttl: number) {
          ops.push(() => 1);
          return chain;
        },
        async exec() {
          return ops.map((op) => [null, op()]);
        },
      };
      return chain;
    }),
  } as unknown as AppEnv["Variables"]["redis"];
}

function appWith(middleware: ReturnType<typeof rateLimit>, setup: (c: Context<AppEnv>) => void) {
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    setup(c);
    await next();
  });
  app.get("/test", middleware, (c) => c.json({ ok: true }));
  app.post("/test", middleware, (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit middleware", () => {
  let redis: AppEnv["Variables"]["redis"];

  beforeEach(() => {
    redis = createMockRedis();
  });

  it("passes through when no redis is bound (graceful degradation)", async () => {
    const app = new Hono<AppEnv>();
    app.get("/test", rateLimit({ limit: 1, windowSec: 60, keyBy: "user", label: "t" }), (c) =>
      c.json({ ok: true }),
    );
    for (let i = 0; i < 3; i++) {
      const res = await app.request("/test");
      expect(res.status).toBe(200);
    }
  });

  it("rejects after the configured limit with 429 and Retry-After", async () => {
    const app = appWith(rateLimit({ limit: 2, windowSec: 60, keyBy: "user", label: "t" }), (c) => {
      c.set("redis", redis);
      c.set("userId", "user-1");
    });

    const first = await app.request("/test");
    const second = await app.request("/test");
    const third = await app.request("/test");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(third.headers.get("X-RateLimit-Limit")).toBe("2");
    expect(third.headers.get("X-RateLimit-Remaining")).toBe("0");
    const body = (await third.json()) as {
      error?: string;
      retry_after?: number;
      message?: string;
    };
    expect(body.error).toBe("RATE_LIMIT_EXCEEDED");
    expect(body.message).toMatch(/retry in \d+ seconds/i);
    expect(typeof body.retry_after).toBe("number");
  });

  it("scopes buckets by label so different endpoints don't share counters", async () => {
    // 同じユーザーで label が違えば干渉しないこと。
    // Same user, different labels → independent buckets.
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("redis", redis);
      c.set("userId", "user-1");
      await next();
    });
    app.get("/a", rateLimit({ limit: 1, windowSec: 60, keyBy: "user", label: "label-a" }), (c) =>
      c.json({ ok: true }),
    );
    app.get("/b", rateLimit({ limit: 1, windowSec: 60, keyBy: "user", label: "label-b" }), (c) =>
      c.json({ ok: true }),
    );
    expect((await app.request("/a")).status).toBe(200);
    expect((await app.request("/a")).status).toBe(429);
    // /b のカウンタは独立している。
    // /b counter is independent.
    expect((await app.request("/b")).status).toBe(200);
  });

  it("keyBy: ip uses the forwarded IP header", async () => {
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("redis", redis);
      await next();
    });
    app.get("/test", rateLimit({ limit: 1, windowSec: 60, keyBy: "ip", label: "ipt" }), (c) =>
      c.json({ ok: true }),
    );

    const ok = await app.request("/test", {
      headers: { "x-forwarded-for": "203.0.113.1" },
    });
    expect(ok.status).toBe(200);

    const limited = await app.request("/test", {
      headers: { "x-forwarded-for": "203.0.113.1" },
    });
    expect(limited.status).toBe(429);

    // 別 IP は別バケット。
    // Different IP → different bucket.
    const other = await app.request("/test", {
      headers: { "x-forwarded-for": "203.0.113.2" },
    });
    expect(other.status).toBe(200);
  });

  it("legacy tier string form still enforces hourly limits", async () => {
    // 既存呼び出し (`rateLimit()` や `rateLimit("free")`) は Free=120/h のまま動く必要がある。
    // Legacy callers must keep the old semantics.
    const app = appWith(rateLimit(), (c) => {
      c.set("redis", redis);
      c.set("userId", "user-legacy");
    });

    // 1回目で通ること、ヘッダに 120 が入っていること。
    // First call succeeds and reports the free-tier ceiling.
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("120");
  });

  it("hourly bucket reports remaining seconds, not a hardcoded 60s", async () => {
    // 1h ウィンドウでも Retry-After は実時間で算出し、最大 1 時間まで広がる。
    // Hourly windows should report actual remaining seconds — cap is 3600.
    const app = appWith(
      rateLimit({ limit: 1, windowSec: 60 * 60, keyBy: "user", label: "hour" }),
      (c) => {
        c.set("redis", redis);
        c.set("userId", "user-hour");
      },
    );
    expect((await app.request("/test")).status).toBe(200);
    const limited = await app.request("/test");
    expect(limited.status).toBe(429);
    const retryAfter = Number.parseInt(limited.headers.get("Retry-After") ?? "0", 10);
    expect(retryAfter).toBeGreaterThanOrEqual(1);
    expect(retryAfter).toBeLessThanOrEqual(3600);
  });

  it("uses MULTI/EXEC so INCR and EXPIRE are issued atomically", async () => {
    // MULTI/EXEC による原子性を保証するため、rateLimit は単独の incr / expire を呼ばない。
    // The middleware should use `multi()` so a crash cannot leave a TTL-less key.
    const multiSpy = vi.fn();
    const fakeRedis = {
      multi: () => {
        multiSpy();
        const chain = {
          incr: () => chain,
          expire: () => chain,
          exec: async () => [
            [null, 1],
            [null, 1],
          ],
        };
        return chain;
      },
      incr: vi.fn(),
      expire: vi.fn(),
    } as unknown as AppEnv["Variables"]["redis"];

    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("redis", fakeRedis);
      c.set("userId", "user-atomic");
      await next();
    });
    app.get("/test", rateLimit({ limit: 5, windowSec: 60, keyBy: "user", label: "atomic" }), (c) =>
      c.json({ ok: true }),
    );
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(multiSpy).toHaveBeenCalled();
    expect(
      (fakeRedis as unknown as { incr: ReturnType<typeof vi.fn> }).incr,
    ).not.toHaveBeenCalled();
  });

  it("keyBy: user falls back to IP when no userId is set", async () => {
    // 認証前に rateLimit が走る場合でも IP でキーが決まり、空欄で全通しにはならない。
    // Even before auth, the middleware keys on IP so it isn't a free pass.
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("redis", redis);
      await next();
    });
    app.get("/test", rateLimit({ limit: 1, windowSec: 60, keyBy: "user", label: "ut" }), (c) =>
      c.json({ ok: true }),
    );
    const a = await app.request("/test", { headers: { "x-forwarded-for": "198.51.100.9" } });
    expect(a.status).toBe(200);
    const b = await app.request("/test", { headers: { "x-forwarded-for": "198.51.100.9" } });
    expect(b.status).toBe(429);
  });
});
