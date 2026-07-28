# Anomaly Config — api-worker (#1091)

前提: alarms.md（アラートなし）・slo-config.md（SLO なし）と同じ dev スコープ判断の確定記録。

## 異常検知

設定しない（意図的）。検知対象となる定常トラフィックが dev Worker には存在せず、ベースライン学習が成立しない。

## prod 切替時の再評価

- Cloudflare の標準メトリクス（エラー率・レイテンシ）に対する閾値検知から開始し、必要なら Sentry の issue alert / spike detection を重ねる。異常検知は SLO（slo-config.md）確定後に意味を持つため、順序もそれに従う。
