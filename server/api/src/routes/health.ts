import { Hono } from "hono";
import type { AppEnv } from "../types/index.js";

const app = new Hono<AppEnv>();

/**
 * Railway が GitHub 連携デプロイ時に注入するコミット SHA。ローカルや Railway 外では
 * 未設定のため null を返す。deploy-prod のロールアウト検証で使う。
 *
 * Commit SHA injected by Railway on GitHub-triggered deploys; null locally or
 * off Railway. Used by deploy-prod rollout verification.
 */
function readGitCommitSha(): string | null {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA;
  return typeof sha === "string" && sha.length > 0 ? sha : null;
}

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    git_commit_sha: readGitCommitSha(),
  });
});

export default app;
