# Observability Setup — Questions

質問なし（0 件）。

可観測性の方針は monitoring-design.md（unit: api-worker）で確定済み: dev 検証専用のためアラート・ダッシュボード・SLO は設定しない（RL-1）、エラー監視は withSentry + `observability.enabled: true`、手動確認は `wrangler tail` / MCP。本ステージは各成果物で「いま有効なもの」と「prod 切替時に設計するもの」を確定記録するのみで、判断事項はない。
