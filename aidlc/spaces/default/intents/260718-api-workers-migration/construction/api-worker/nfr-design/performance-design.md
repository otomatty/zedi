# Performance Design — api-worker

前提: performance-requirements.md（PR-1〜6）を実現する設計。business-logic-model.md は infra スコープにより未作成。

## バンドル予算の達成設計（PR-3）

- LangGraph 除外はモジュールレベルの境界（logical-components.md LC-1）で達成する。フラグによる実行時分岐ではなく、Worker エントリから agent 系モジュールへの静的到達経路を断つ。
- 検査は LC-5 のバンドル検査スクリプトで自動化し、gzip 後サイズを 10MB 上限（Paid、PR-3）に対して報告する。

## キャッシュ・最適化（パリティ方針）

- 新規キャッシュ層・クエリ最適化・接続プーリング変更は**行わない**（PR-1 パリティ方針。既存の KvStore キャッシュ用途は #1093 設計のまま）。
- cold start への対策は本 Issue では講じない（PR-2: 記録のみ）。LangGraph 除外によるバンドル縮小が事実上の主要な cold start 改善になる。

## 検証設計（PR-5, PR-6）

- CI 自動: `deploy-api-worker-dev.yml` の health-poll（HTTP 成功判定）を不変で通過させる。
- 手動 dev 検証: /api/health の `runtime` フィールド確認、主要非 DB 経路の体感パリティ確認、CPU 超過エラー（exceeded CPU）の不在確認（PR-4）。チェックリストは build-and-test 段階で作成する（レビュー指摘の送り事項）。
