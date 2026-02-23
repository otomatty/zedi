# 本番環境の検証・監視計画

> 作成日: 2026-02-23
> ステータス: 計画

## 概要

本番環境で問題が起きないことを確認するための手法を、**事前確認（デプロイ前）** と **稼働中の確認（ランタイム監視）** の 2 軸で整理する。

---

## 現状の整理

### 導入済み

| カテゴリ | 項目                                                    | 場所                                                          |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| CI       | ESLint + Prettier                                       | `.github/workflows/ci.yml`                                    |
| CI       | TypeScript 型チェック                                   | 同上                                                          |
| CI       | Vitest ユニットテスト + カバレッジ                      | 同上                                                          |
| CI       | Vite ビルド確認                                         | 同上                                                          |
| CI       | Terraform validate + fmt                                | 同上                                                          |
| CD       | Terraform Plan の PR コメント                           | `.github/workflows/terraform-plan.yml`                        |
| CD       | DB マイグレーション自動実行                             | `deploy-dev.yml`, `deploy-prod.yml`                           |
| CD       | ECS デプロイ Circuit Breaker + ロールバック             | `terraform/modules/realtime/main.tf`                          |
| API      | ヘルスチェック (`GET /api/health`)                      | `terraform/modules/api/lambda/src/routes/health.ts`           |
| API      | Hocuspocus ヘルスチェック (`GET /health`)               | `server/hocuspocus/src/index.ts`                              |
| API      | エラーハンドラ（HTTPException, Aurora auto-pause 検知） | `terraform/modules/api/lambda/src/middleware/errorHandler.ts` |
| API      | DynamoDB ベースのレート制限                             | `terraform/modules/api/lambda/src/middleware/rateLimiter.ts`  |
| API      | 503 リトライ（DB resuming）                             | `src/lib/api/apiClient.ts`                                    |
| インフラ | Aurora バックアップ（03:00–04:00 UTC）                  | `terraform/modules/database/main.tf`                          |
| インフラ | Redis スナップショット                                  | `terraform/modules/cache/main.tf`                             |
| インフラ | CloudWatch Log Groups（ECS, Lambda）                    | 各モジュール                                                  |
| インフラ | ECS オートスケーリング                                  | `terraform/modules/realtime/main.tf`                          |

### 未導入（ギャップ）

| カテゴリ       | 項目                               | 重要度 |
| -------------- | ---------------------------------- | ------ |
| フロントエンド | React Error Boundary               | 高     |
| 監視           | CloudWatch アラーム                | 高     |
| 監視           | CloudWatch ダッシュボード          | 中     |
| 監視           | APM（Sentry 等）                   | 中     |
| 監視           | 外形監視（Synthetic Monitoring）   | 中     |
| ログ           | 構造化ログ（pino 等）              | 中     |
| フロントエンド | Web Vitals トラッキング            | 低     |
| CI             | E2E テスト（CI から外れている）    | 高     |
| CD             | Smoke Test（デプロイ後の疎通確認） | 高     |

---

## 事前確認（デプロイ前）

### 1. E2E テストの CI 復活

Playwright は設定済みだが `ci.yml` から E2E ジョブが外れている。UI レベルの回帰を防ぐため復活させる。

**対応ファイル:** `.github/workflows/ci.yml`

```yaml
e2e:
  name: E2E Tests
  needs: build
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: oven-sh/setup-bun@v2
      with:
        bun-version: latest
    - run: bun install --frozen-lockfile
    - run: bunx playwright install --with-deps chromium
    - run: bun run build
    - name: Start preview server
      run: bun run preview &
    - run: bun run test:e2e
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: playwright-report/
        retention-days: 7
```

### 2. デプロイ後の Smoke Test

`deploy-prod.yml` の各デプロイジョブ完了後に、本番 URL に対して主要エンドポイントの疎通を確認するステップを追加する。

**対応ファイル:** `.github/workflows/deploy-prod.yml`

```yaml
smoke-test:
  name: Smoke Test (prod)
  needs: [terraform, db-migration, frontend, hocuspocus]
  runs-on: ubuntu-latest
  environment: prod
  steps:
    - name: API health check
      run: |
        for i in 1 2 3 4 5; do
          STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ secrets.VITE_ZEDI_API_BASE_URL }}/api/health")
          if [ "$STATUS" = "200" ]; then
            echo "API health check passed"
            exit 0
          fi
          echo "Attempt $i: status=$STATUS, retrying in 10s..."
          sleep 10
        done
        echo "API health check failed after 5 attempts"
        exit 1

    - name: Frontend accessibility check
      run: |
        STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://zedi-note.app")
        if [ "$STATUS" != "200" ]; then
          echo "Frontend check failed: $STATUS"
          exit 1
        fi
        echo "Frontend accessible"
```

### 3. DB マイグレーションの Dry Run

本番マイグレーション前に `--dry-run` を実行し、SQL が安全かを確認する。

**対応ファイル:** `.github/workflows/deploy-prod.yml` の `db-migration` ジョブ

```yaml
- name: Dry run migrations
  run: node migrate.mjs --dry-run
  working-directory: db/aurora
  env:
    CLUSTER_ARN: ${{ needs.terraform.outputs.cluster_arn }}
    SECRET_ARN: ${{ needs.terraform.outputs.secret_arn }}

- name: Run pending migrations
  run: node migrate.mjs
  working-directory: db/aurora
  env:
    CLUSTER_ARN: ${{ needs.terraform.outputs.cluster_arn }}
    SECRET_ARN: ${{ needs.terraform.outputs.secret_arn }}
```

### 4. バンドルサイズの回帰チェック

現在 `build` ジョブでサイズを `GITHUB_STEP_SUMMARY` に出力しているが、閾値を超えたら失敗させる仕組みがない。`size-limit` の導入を検討する。

```bash
bun add -d size-limit @size-limit/file
```

```json
// package.json
"size-limit": [
  { "path": "dist/assets/*.js", "limit": "500 KB" }
]
```

### 5. Terraform Plan の承認ゲート

`deploy-prod.yml` で `terraform plan` 後すぐに `apply` している。GitHub Environment の **Protection Rules** で Required Reviewers を設定し、Plan 結果をレビューしてから Apply する運用にする。

**設定場所:** GitHub > Settings > Environments > `prod` > Required reviewers

---

## 稼働中の確認（ランタイム監視）

### 6. CloudWatch アラームの有効化（優先度: 高）

Terraform に監視モジュールが定義済みだがコメントアウトされている。

**対応ファイル:** `terraform/main.tf` (285-290 行目付近)

```hcl
module "monitoring" {
  source = "./modules/monitoring"
  environment = local.environment
  alarm_email = var.alarm_email
  # ... 各モジュールの ARN/名前を渡す
}
```

**設定すべきアラーム:**

| メトリクス                  | 閾値     | 期間 | 通知先             |
| --------------------------- | -------- | ---- | ------------------ |
| Lambda Errors               | > 1%     | 5 分 | SNS → メール/Slack |
| Lambda Duration P95         | > 5 秒   | 5 分 | SNS                |
| API Gateway 5xx             | > 5 件   | 1 分 | SNS                |
| ECS CPU 使用率              | > 80%    | 5 分 | SNS                |
| ECS Running Task Count      | = 0      | 1 分 | SNS（即時）        |
| Aurora CPU 使用率           | > 80%    | 5 分 | SNS                |
| Aurora FreeableMemory       | < 256 MB | 5 分 | SNS                |
| CloudFront 5xx Error Rate   | > 1%     | 5 分 | SNS                |
| CloudFront Total Error Rate | > 5%     | 5 分 | SNS                |

**Terraform 変数の設定:**

```hcl
# environments/prod.tfvars
alarm_email              = "alerts@example.com"
enable_detailed_monitoring = true
```

### 7. React Error Boundary の追加（優先度: 高）

フロントエンドにグローバルな Error Boundary がないため、レンダリングエラーでアプリ全体がクラッシュする。

**対応ファイル:** `src/components/ErrorBoundary.tsx`（新規作成）

```tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error:", error, info.componentStack);
    // Sentry 導入後: Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex min-h-screen flex-col items-center justify-center gap-4">
            <h1 className="text-2xl font-bold">予期しないエラーが発生しました</h1>
            <p className="text-muted-foreground">ページを再読み込みしてください。</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded bg-primary px-4 py-2 text-primary-foreground"
            >
              再読み込み
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
```

**適用場所:** `src/main.tsx` または `src/App.tsx` のルートに `<ErrorBoundary>` でラップ。

### 8. ヘルスチェックの強化（優先度: 高）

現在の `/api/health` は `{ status: "ok" }` を返すだけで、DB やキャッシュの疎通を確認していない。

**対応ファイル:** `terraform/modules/api/lambda/src/routes/health.ts`

```typescript
import type { Hono } from "hono";

export function registerHealthRoutes(app: Hono) {
  // 簡易チェック（ALB / Route 53 用）
  app.get("/api/health", (c) => {
    return c.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // 詳細チェック（ダッシュボード / Smoke Test 用）
  app.get("/api/health/detailed", async (c) => {
    const checks: Record<string, string> = {
      api: "ok",
      database: "unknown",
    };

    try {
      // DB 疎通（Aurora Data API）
      // await executeStatement("SELECT 1");
      checks.database = "ok";
    } catch {
      checks.database = "error";
    }

    const allOk = Object.values(checks).every((v) => v === "ok");
    return c.json(
      {
        status: allOk ? "healthy" : "degraded",
        checks,
        timestamp: new Date().toISOString(),
      },
      allOk ? 200 : 503,
    );
  });
}
```

### 9. Sentry の導入（優先度: 中）

エラーの発生状況・スタックトレース・影響ユーザー数をリアルタイムで把握する。

**フロントエンド:**

```bash
bun add @sentry/react
```

```typescript
// src/main.tsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({ maskAllText: true }),
  ],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,
});
```

**Lambda:**

```bash
# terraform/modules/api/lambda/ 内
npm install @sentry/aws-serverless
```

```typescript
// Lambda ハンドラの先頭
import * as Sentry from "@sentry/aws-serverless";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
});

export const handler = Sentry.wrapHandler(originalHandler);
```

### 10. 構造化ログの導入（優先度: 中）

`console.log` を `pino` に置き換え、CloudWatch Logs Insights でのクエリを容易にする。

**Lambda 側:**

```bash
# terraform/modules/api/lambda/ 内
npm install pino
```

```typescript
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Lambda は stdout が CloudWatch に流れるため transport 不要
});

// 使用例
logger.info({ userId, action: "page_created", pageId }, "Page created");
logger.error({ err, userId }, "Failed to save page");
```

**CloudWatch Logs Insights クエリ例:**

```
fields @timestamp, msg, userId, action
| filter level >= 40
| sort @timestamp desc
| limit 50
```

### 11. 外形監視（優先度: 中）

外部からの定期的な疎通確認。ユーザー視点で可用性を監視する。

**選択肢:**

| サービス                  | コスト                  | 機能                                              |
| ------------------------- | ----------------------- | ------------------------------------------------- |
| UptimeRobot               | 無料（50 モニターまで） | HTTP 監視、ダウン時メール/Slack 通知              |
| AWS Route 53 Health Check | 約 $0.50/月             | DNS フェイルオーバーと組み合わせ可能              |
| AWS CloudWatch Synthetics | 約 $12/月（100 回実行） | Canary スクリプトでページ操作・スクリーンショット |
| Better Uptime             | 無料（10 モニターまで） | ステータスページ付き                              |

**推奨構成:**

1. **UptimeRobot**（無料）で `/api/health` と `https://zedi-note.app` を 5 分間隔で監視
2. 本格運用時は **CloudWatch Synthetics** で主要ユーザーフロー（ログイン → ノート作成 → 保存）を Canary で監視

### 12. Web Vitals トラッキング（優先度: 低）

ユーザー体験のパフォーマンス劣化を検知する。

```bash
bun add web-vitals
```

```typescript
// src/lib/webVitals.ts
import { onCLS, onFCP, onLCP, onTTFB, type Metric } from "web-vitals";

function sendMetric(metric: Metric) {
  // Sentry 導入後は Sentry.metrics.distribution() に送信
  // または CloudWatch RUM / 独自エンドポイントに送信
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      `${import.meta.env.VITE_ZEDI_API_BASE_URL}/api/metrics`,
      JSON.stringify({
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
      }),
    );
  }
}

export function initWebVitals() {
  onCLS(sendMetric);
  onFCP(sendMetric);
  onLCP(sendMetric);
  onTTFB(sendMetric);
}
```

### 13. CloudWatch ダッシュボード（優先度: 低）

主要メトリクスを一覧できるダッシュボードを Terraform で定義する。

**パネル構成:**

| パネル         | メトリクス                        |
| -------------- | --------------------------------- |
| API レイテンシ | Lambda Duration P50/P95/P99       |
| エラー率       | 4xx/5xx カウント                  |
| DB 負荷        | Aurora CPU, 接続数, ACU 使用量    |
| ECS            | タスク数, CPU, メモリ             |
| WebSocket      | Hocuspocus 接続数                 |
| CDN            | CloudFront リクエスト数, エラー率 |

---

## 実装の優先順位

| 優先度 | 施策                        | 難易度 | 効果                       | 対応 Issue タスク |
| ------ | --------------------------- | ------ | -------------------------- | ----------------- |
| **P0** | CloudWatch アラーム有効化   | 低     | 障害の即時検知             | Task 1            |
| **P0** | React Error Boundary        | 低     | フロントクラッシュ防止     | Task 2            |
| **P0** | ヘルスチェック強化          | 低     | DB/Cache 障害の早期検知    | Task 3            |
| **P0** | E2E テスト CI 復活          | 低     | UI 回帰の防止              | Task 4            |
| **P1** | Smoke Test（デプロイ後）    | 低     | デプロイ失敗の即時検知     | Task 5            |
| **P1** | Sentry 導入                 | 中     | エラーの可視化・通知       | Task 6            |
| **P1** | 構造化ログ（pino）          | 中     | ログ分析の効率化           | Task 7            |
| **P1** | 外形監視                    | 低     | ユーザー視点の可用性確認   | Task 8            |
| **P2** | DB マイグレーション Dry Run | 低     | マイグレーション事故の防止 | Task 9            |
| **P2** | バンドルサイズ回帰チェック  | 低     | パフォーマンス劣化の防止   | Task 10           |
| **P2** | Terraform Plan 承認ゲート   | 低     | インフラ変更の安全性       | Task 11           |
| **P2** | Web Vitals                  | 低     | パフォーマンス劣化検知     | Task 12           |
| **P2** | CloudWatch ダッシュボード   | 中     | 運用の可視化               | Task 13           |

---

## 参照

| 項目                                         | 場所                                                          |
| -------------------------------------------- | ------------------------------------------------------------- |
| CI ワークフロー                              | `.github/workflows/ci.yml`                                    |
| 本番デプロイ                                 | `.github/workflows/deploy-prod.yml`                           |
| Terraform 監視モジュール（コメントアウト中） | `terraform/main.tf` (285-290 行目)                            |
| API ヘルスチェック                           | `terraform/modules/api/lambda/src/routes/health.ts`           |
| Hocuspocus ヘルスチェック                    | `server/hocuspocus/src/index.ts`                              |
| エラーハンドラ                               | `terraform/modules/api/lambda/src/middleware/errorHandler.ts` |
| API クライアント（リトライ）                 | `src/lib/api/apiClient.ts`                                    |
| 本番環境変数チェックリスト                   | `docs/work-logs/env-production-checklist.md`                  |
| ESLint/Prettier 方針                         | `docs/lint-and-format.md`                                     |
