#!/usr/bin/env bun
/**
 * 本番 AWS デプロイ: 環境変数読み込み → ビルド → S3 アップロード → CloudFront 無効化
 *
 * 前提:
 * - プロジェクトルートに .env.production がある（または ENV_FILE でパス指定）
 * - .env.production に PROD_FRONTEND_S3_BUCKET, PROD_CLOUDFRONT_DISTRIBUTION_ID を設定
 * - AWS CLI の認証済み（AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY または AWS_PROFILE）
 *
 * 使い方:
 *   bun run deploy:prod
 *   ENV_FILE=.env.production.local bun run deploy:prod
 */

import { loadEnvFile } from "./load-env";
import { join, resolve } from "path";

const ROOT = resolve(import.meta.dir, "..", "..");

async function main(): Promise<void> {
  const envPath = process.env.ENV_FILE
    ? resolve(process.env.ENV_FILE)
    : join(ROOT, ".env.production");
  console.log("[deploy] Loading env from:", envPath);
  const loaded = await loadEnvFile(envPath);
  if (!loaded) {
    console.warn("[deploy] Env file not found. Copy .env.production.example to .env.production and set values.");
  }

  const bucket = process.env.PROD_FRONTEND_S3_BUCKET;
  const distributionId = process.env.PROD_CLOUDFRONT_DISTRIBUTION_ID;

  if (!bucket || !distributionId) {
    console.error(
      "[deploy] Missing PROD_FRONTEND_S3_BUCKET or PROD_CLOUDFRONT_DISTRIBUTION_ID. Set them in .env.production (see .env.production.example)."
    );
    process.exit(1);
  }

  // 1. Build（Vite が .env.production も読み込むが、ここで読み込んだ env で上書きされる）
  console.log("[deploy] Building...");
  const buildProc = Bun.spawn(["bun", "run", "build"], {
    cwd: ROOT,
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  const buildExit = await buildProc.exited;
  if (buildExit !== 0) {
    console.error("[deploy] Build failed.");
    process.exit(buildExit);
  }

  // 2. S3 sync
  console.log("[deploy] Syncing dist/ to s3://" + bucket + "/ ...");
  const syncProc = Bun.spawn(
    ["aws", "s3", "sync", "dist/", `s3://${bucket}/`, "--delete"],
    {
      cwd: ROOT,
      env: process.env,
      stdout: "inherit",
      stderr: "inherit",
    }
  );
  const syncExit = await syncProc.exited;
  if (syncExit !== 0) {
    console.error("[deploy] S3 sync failed.");
    process.exit(syncExit);
  }

  // 3. CloudFront invalidation
  console.log("[deploy] Invalidating CloudFront distribution:", distributionId);
  const invalProc = Bun.spawn(
    [
      "aws",
      "cloudfront",
      "create-invalidation",
      "--distribution-id",
      distributionId,
      "--paths",
      "/*",
    ],
    {
      cwd: ROOT,
      env: process.env,
      stdout: "inherit",
      stderr: "inherit",
    }
  );
  const invalExit = await invalProc.exited;
  if (invalExit !== 0) {
    console.error("[deploy] CloudFront invalidation failed.");
    process.exit(invalExit);
  }

  console.log("[deploy] Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
