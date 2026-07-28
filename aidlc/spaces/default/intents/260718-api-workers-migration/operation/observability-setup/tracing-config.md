# Tracing Config — api-worker (#1091)

前提: monitoring-design.md・security-design.md（Sentry スクラブ方針）の確定記録。

## 設定するもの

- Sentry エラートレース（withSentry ラッパ経由、LC-4）: エラーイベントに `httpStatus` タグ + `method`/`routePath` extra（現行 `captureApiException` の文脈情報を両ランタイムで維持）。PII は `scrubSentryEvent` + `sendDefaultPii: false` で除外。

## 設定しないもの

- 分散トレーシング（OpenTelemetry / Sentry Performance）: 単一 Worker + 外部依存最小の dev 検証に対して過剰。prod 切替後、D1/DO/Workflows が絡む構成（#1090/#1095）になった時点で必要性を再評価。
