# Performance Requirements — api-worker

前提: functional-design（business-logic-model.md / business-rules.md）は infra スコープにより未作成。本書は `inception/requirements-analysis/requirements.md`（FR-1〜FR-6、NFR-1〜4）と Q&A（Q1=Paid、Q2=パリティ）から導出する。

## 目標の立て方（パリティ方針）

- PR-1: 新規の数値目標は設けない。dev Worker の応答は Railway 現行 API との**体感パリティ**を基準とする（Q2=A）。
- PR-2: Workers 特有の特性（cold start、リージョンエッジ実行）は dev 検証時に記録のみ行い、改善タスク化は本 Issue の外とする。

## リソース予算

- PR-3: バンドルサイズ: gzip 後 10 MB 以内（Workers Paid プラン上限。Q1=A）。LangGraph 除外（FR-1）が主たる達成手段。
- PR-4: CPU 時間: Paid プランの既定内で動作すること。長時間処理（LangGraph）はルート分割で Worker に載らない。残経路については dev 検証で CPU 超過エラー（exceeded CPU）が観測されないことを確認する。
- PR-5: `deploy-api-worker-dev.yml` の health-poll（/api/health）が既存のタイムアウト設定内で成功すること（FR-6.1）。

## 検証方法

- PR-6: workerd 実行テスト（FR-5）はレイテンシ計測を目的としない。性能はパリティ確認（dev 実機での手動確認）のみ。
