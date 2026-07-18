# Dashboards — api-worker (#1091)

前提: monitoring-design.md・infrastructure-services.md（unit: api-worker）の可観測性構成を確定記録する。

## いま有効なもの

- Cloudflare ダッシュボード標準ビュー（Workers & Pages → `zedi-api-dev`）: リクエスト数・エラー率・CPU 時間・invocation logs。`wrangler.jsonc` の `observability.enabled: true` により追加設定なしで利用可能。
- Sentry プロジェクト（`SENTRY_DSN_API` 投入後）: エラーイベントビュー。

## 作らないもの（prod 切替時に設計）

- カスタムダッシュボード・集約ビュー（dev 検証専用のため不要 — reliability-design.md RL-1）。
