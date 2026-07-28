# Infrastructure Design — Questions (unit: api-worker)

質問なし（0 件）。

インフラ判断は全て確定済み: 構成の正本 = `server/api/wrangler.jsonc`（C-3、実体確認済み）、dev のみデプロイ（Q8=B）、Terraform 凍結、リソースは既存（R2 バケット・KV DO 作成済み、#1089/#1093）。application-design 成果物（components.md / services.md）は infra スコープにより不在（expected）— nfr-design の logical-components.md がコンポーネント正本。

新規リソースの作成・変更を伴わない（既存 binding の設計固定 + `RUNTIME` var 追加のみ）ため、人間への確認事項はない。

---

## G1. Approval gate (typed turn required)

Infrastructure Design 5成果物（READY）の承認ゲート。チャットに approve / request changes をタイプしてください。

[Answer]: approve (typed, 2026-07-18)
