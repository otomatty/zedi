import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";
import type { CloudflareBindings } from "../types/cloudflare.js";

const app = new Hono<AppEnv>();

/**
 * Deployment commit SHA for rollout verification. Workers CI sets `GIT_COMMIT_SHA`
 * via wrangler vars.
 *
 * デプロイコミット SHA（ロールアウト検証用）。Workers CI が wrangler vars の
 * `GIT_COMMIT_SHA` で渡す。
 */
function readGitCommitSha(): string | null {
  const sha = process.env.GIT_COMMIT_SHA;
  return typeof sha === "string" && sha.length > 0 ? sha : null;
}

/** Detect Workers runtime from R2 binding presence. / R2 binding の有無で Workers を判定。 */
function readRuntime(
  bindings: Partial<CloudflareBindings> | undefined,
): "cloudflare-workers" | "node" {
  return bindings?.STORAGE_BUCKET ? "cloudflare-workers" : "node";
}

app.get("/health", (c) => {
  const bindings = c.env as Partial<CloudflareBindings> | undefined;
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    git_commit_sha: readGitCommitSha(),
    runtime: readRuntime(bindings),
  });
});

export default app;
