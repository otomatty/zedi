# NFR Requirements — Questions (unit: api-worker)

Construction 段階のため質問は真のギャップのみ（requirements.md で大半の NFR 方針は確定済み）。

## Q1. Cloudflare Workers のプラン

NFR-1 のバンドル上限（有料 10MB / 無料 3MB）と CPU 時間予算（Issue は「有料プランで最大 5 分」と記載）の判定基準になります。zedi の Cloudflare アカウントはどちらですか?

A. 有料（Workers Paid）— バンドル 10MB / CPU 上限拡張可
B. 無料（Free）— バンドル 3MB / CPU 10ms
C. 現在無料だが移行までに有料化する予定
X. Other (please specify)

[Answer]: A. 有料（Workers Paid）— バンドル 10MB / CPU 上限拡張可 (2026-07-18, mode: guided)

## Q2. パフォーマンス要件の立て方

本 Issue は dev 検証までがスコープです。パフォーマンス目標はどう扱いますか?

A. Railway 現行との体感パリティで十分 — 新たな数値目標は設けない（cold start 等の Workers 特性は記録のみ）
B. 明示的な数値目標を設定したい（p95 レイテンシ等を指定してください）
X. Other (please specify)

[Answer]: A. Railway 現行との体感パリティで十分 — 新たな数値目標は設けない（cold start 等の Workers 特性は記録のみ） (2026-07-18, mode: guided)

---

## G1. Approval gate (typed turn required)

NFR 5成果物（READY）の承認ゲート。チャットに approve / request changes をタイプしてください。

[Answer]: approve (typed, 2026-07-18)
