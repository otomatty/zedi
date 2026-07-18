# Alarms — api-worker (#1091)

前提: monitoring-design.md「本 Issue で追加しないもの」と reliability-design.md（RL-1: SLA なし）の確定記録。

## 設定するアラート

なし（意図的）。dev Worker は検証専用でユーザー影響がなく、障害対応は「次の push で直す」（rollback-runbook.md の原則）。

## prod 切替時に設計するもの

- エラー率・CPU 超過・health 失敗の通知（Cloudflare notifications / Sentry alert rules）。
- ロールバックトリガと連動した閾値（deployment-strategy.md の prod 設計とセット）。
