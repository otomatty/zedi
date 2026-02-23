## 概要

本番環境で問題が起きないことを確認するための施策を、**事前確認（デプロイ前）** と **稼働中の確認（ランタイム監視）** の 2 軸で整理し、段階的に導入する。

詳細は `docs/plans/20260223/production-verification-and-monitoring.md` を参照。

---

## 現状の課題

- CloudWatch アラームが**コメントアウト**されており、障害が起きても通知されない
- フロントエンドに **React Error Boundary** がなく、レンダリングエラーでアプリ全体がクラッシュする
- ヘルスチェックが**簡易版のみ**（DB/Cache の疎通を確認していない）
- E2E テストが **CI から外れている**ため、UI 回帰を検知できない
- デプロイ後の **Smoke Test** がなく、デプロイ失敗に気付くのが遅れる
- **APM（Sentry 等）** が未導入で、本番エラーの詳細を把握できない
- ログが `console.log` ベースで**構造化されておらず**、CloudWatch Logs Insights での分析が困難
- **外形監視**がなく、ユーザー視点での可用性が分からない

---

## タスク一覧

### P0: 即座に対応（低コスト・高効果）

- [ ] **Task 1: CloudWatch アラーム有効化**
  - `terraform/main.tf` の監視モジュールのコメントアウトを解除
  - `prod.tfvars` に `alarm_email` と `enable_detailed_monitoring = true` を設定
  - アラーム: Lambda エラー率 > 1%, API Gateway 5xx, ECS CPU > 80%, ECS タスク数 = 0, Aurora CPU > 80%

- [ ] **Task 2: React Error Boundary の追加**
  - `src/components/ErrorBoundary.tsx` を新規作成
  - `src/main.tsx` または `src/App.tsx` のルートでラップ
  - フォールバック UI（再読み込みボタン付き）を表示

- [ ] **Task 3: ヘルスチェック強化**
  - `GET /api/health/detailed` エンドポイントを追加
  - DB（Aurora Data API）の疎通チェックを含める
  - レスポンス: `{ status: "healthy" | "degraded", checks: { api, database }, timestamp }`

- [ ] **Task 4: E2E テストを CI に復活**
  - `.github/workflows/ci.yml` に `e2e` ジョブを追加
  - `bun run build` → `bun run preview` → `bun run test:e2e`
  - 失敗時に Playwright レポートをアーティファクトとしてアップロード

### P1: 短期（1-2 週間以内）

- [ ] **Task 5: Smoke Test（デプロイ後の疎通確認）**
  - `deploy-prod.yml` に smoke-test ジョブを追加
  - API `/api/health` と `https://zedi-note.app` の HTTP ステータスを確認
  - 5 回リトライ（10 秒間隔）で失敗判定

- [ ] **Task 6: Sentry 導入**
  - フロントエンド: `@sentry/react`（Error Boundary 統合、Session Replay）
  - Lambda: `@sentry/aws-serverless`（コールドスタート・タイムアウト検知）
  - 環境変数: `VITE_SENTRY_DSN` / `SENTRY_DSN` を追加
  - サンプリングレート: traces 10%, replays error 100%

- [ ] **Task 7: 構造化ログ導入（pino）**
  - Lambda 側: `pino` を導入し `console.log` を置き換え
  - JSON 形式でログ出力 → CloudWatch Logs Insights でクエリ可能に
  - ログレベル: `LOG_LEVEL` 環境変数で制御

- [ ] **Task 8: 外形監視の設定**
  - UptimeRobot（無料）で `/api/health` と `https://zedi-note.app` を 5 分間隔で監視
  - ダウン時にメール/Slack 通知

### P2: 中期（余裕があるとき）

- [ ] **Task 9: DB マイグレーション Dry Run**
  - `deploy-prod.yml` のマイグレーション実行前に `node migrate.mjs --dry-run` を追加

- [ ] **Task 10: バンドルサイズ回帰チェック**
  - `size-limit` を導入し、JS バンドルの閾値超過で CI を失敗させる

- [ ] **Task 11: Terraform Plan 承認ゲート**
  - GitHub Environment `prod` に Required Reviewers を設定
  - Plan 結果をレビュー後に Apply する運用に変更

- [ ] **Task 12: Web Vitals トラッキング**
  - `web-vitals` パッケージを導入
  - CLS, FCP, LCP, TTFB を計測し、Sentry または独自エンドポイントに送信

- [ ] **Task 13: CloudWatch ダッシュボード**
  - Terraform で定義: API レイテンシ, エラー率, DB 負荷, ECS, CDN のパネル

---

## 参照

| 項目                     | 場所                                                          |
| ------------------------ | ------------------------------------------------------------- |
| 詳細ドキュメント         | `docs/plans/production-verification-and-monitoring.md`        |
| CI ワークフロー          | `.github/workflows/ci.yml`                                    |
| 本番デプロイ             | `.github/workflows/deploy-prod.yml`                           |
| Terraform 監視モジュール | `terraform/main.tf` (285-290 行目)                            |
| API ヘルスチェック       | `terraform/modules/api/lambda/src/routes/health.ts`           |
| エラーハンドラ           | `terraform/modules/api/lambda/src/middleware/errorHandler.ts` |
| 本番環境変数チェック     | `docs/work-logs/env-production-checklist.md`                  |
| 関連 Issue               | #67 Phase 5: モニタリング整備                                 |
