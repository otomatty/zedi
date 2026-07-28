# NFR Design — Questions (unit: api-worker)

質問なし（0 件）。

Construction 段階の質問は「真のギャップがある場合のみ」（stage-protocol §3 depth guidance）。本ステージの設計判断は上流で全て確定済み:

- レジリエンス/信頼性方針 → reliability-requirements.md（RL-1〜5: SLA 不要、Railway 並行稼働が保険）
- スケーラビリティパターン → scalability-requirements.md（SC-1〜4: エッジ自動スケール + 論理キー毎 DO）
- パフォーマンス方針 → performance-requirements.md（PR-1〜6: パリティ、10MB/Paid）
- セキュリティ方針 → security-requirements.md（SR-1〜7）+ 既存実装踏襲
- コンポーネント境界 → tech-stack-decisions.md（TS-1〜9）+ requirements.md FR-1〜6

残る未確定事項（OQ-1 ルート分割境界、OQ-2 Sentry 統合方式、OQ-3 vitest 併存構成、OQ-5 clientIp 利用箇所）は人間への質問ではなく、コード事実の調査で確定する設計作業として本ステージで解決する。

---

## G1. Approval gate (typed turn required)

NFR Design 5成果物（READY）の承認ゲート。チャットに approve / request changes をタイプしてください。

[Answer]: approve (typed, 2026-07-18)
