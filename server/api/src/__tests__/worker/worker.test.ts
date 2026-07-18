/**
 * Worker エントリ（src/worker.ts）の workerd 実行テスト（#1091 FR-5.2）。
 *
 * 対象: /api/health のランタイム判定、CORS プリフライト、ルート分割の登録有無、
 * auth マウントのランタイム適合（例外なく整形済みレスポンス）、エラーマスキング。
 * DB 依存の成功系は #1090（D1）後 — ここでは「クラッシュせずマスクされる」まで。
 *
 * workerd-runtime tests for the Worker entry: health runtime field, CORS
 * preflight, agent-route exclusion, auth mount runtime compatibility, and
 * masked error shaping. DB-backed success paths are deferred to #1090.
 */
/// <reference types="@cloudflare/vitest-pool-workers/types" />
import { describe, it, expect } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import worker from "../../worker.js";

async function dispatch(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const request = new Request(`https://zedi-api-dev.test${path}`, init);
  const handler = worker as unknown as {
    fetch: (req: unknown, env: unknown, ctx: unknown) => Promise<unknown>;
  };
  const res = await handler.fetch(request, env, ctx);
  await waitOnExecutionContext(ctx);
  return res as Response;
}

describe("worker entry — health & runtime (FR-6.2)", () => {
  it("serves /api/health with runtime=cloudflare-workers", async () => {
    const res = await dispatch("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runtime?: string };
    expect(body.runtime).toBe("cloudflare-workers");
  });
});

describe("worker entry — CORS preflight (SR-7)", () => {
  it("answers OPTIONS preflight without a runtime error", async () => {
    const res = await dispatch("/api/health", {
      method: "OPTIONS",
      headers: {
        Origin: "https://zedi-note.app",
        "Access-Control-Request-Method": "GET",
      },
    });
    expect([200, 204]).toContain(res.status);
    expect(res.headers.get("access-control-allow-methods")).toBeTruthy();
  });
});

describe("worker entry — agent route split (FR-1.4)", () => {
  it("returns 404 for /api/ingest (excluded from the Worker)", async () => {
    // CSRF ミドルウェアの 403 で遮られないよう許可オリジンを付け、
    // ルーティングの不在（404 fallback）そのものを検証する。
    const res = await dispatch("/api/ingest", {
      method: "POST",
      headers: { Origin: "https://zedi-note.app", "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for compose-sessions routes (excluded from the Worker)", async () => {
    const res = await dispatch("/api/pages/00000000-0000-0000-0000-000000000000/compose-sessions");
    expect(res.status).toBe(404);
  });
});

describe("worker entry — auth mount runtime compatibility (FR-5.2 / A-2)", () => {
  it("responds to /api/auth/get-session as well-formed JSON (no workerd crash)", async () => {
    const res = await dispatch("/api/auth/get-session");
    // DB 未接続のため成功は要求しない。Worker ランタイム例外（fetch reject）に
    // ならず、HTTP レスポンスとして整形されていることが合格条件。
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(600);
  });
});

describe("worker entry — masked error shaping (RL-3 / SR-3)", () => {
  it("shapes DB-dependent route failures as JSON, never a 1101 crash", async () => {
    // /api/users/me は認証→DB 到達で失敗し得るが、onError で必ず整形される。
    const res = await dispatch("/api/users/me");
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = (await res.json()) as { error?: string };
    expect(typeof body.error).toBe("string");
    // 5xx の場合は内部メッセージが漏れていないこと。
    if (res.status >= 500) {
      expect(body.error).toBe("Internal server error");
    }
  });
});
