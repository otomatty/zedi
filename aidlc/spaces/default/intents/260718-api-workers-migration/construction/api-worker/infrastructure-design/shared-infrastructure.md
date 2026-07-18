# Shared Infrastructure — api-worker

前提: security-design.md（SR-2）・deployment-architecture.md と Epic #1088 の全体設計（cloudflare-zedi スキル resource-map）に整合させる。application-design / business-logic-model.md は infra スコープにより不在。

## サービス間で共有されるもの

| 共有物 | 共有先 | 本 Issue での扱い |
|--------|--------|------------------|
| `BETTER_AUTH_SECRET` | api ↔ mcp ↔ hocuspocus | 値の同期は運用ルールのまま（自動強制なし、既知ギャップ）。Worker へは `wrangler secret bulk` で供給 |
| R2 バケット（zedi-storage-*） | api Worker binding + Railway API（S3 互換エンドポイント） | 同一バケットを両ランタイムから利用（#1089 の設計どおり、変更なし） |
| Cloudflare アカウント / トークン | 全 Worker + Pages deploy | **要修復（C-2）**: ローカル wrangler が別アカウント、CI トークンも失効。復旧は本 Issue のコード実装とは独立に進められる |
| `KvDurableObject` クラス定義 | api Worker 専有（mcp は別 Worker で別途） | migration v1 のまま変更なし |

## 他 Issue との境界

- #1092（mcp Workers 化）: 本 Issue のモジュール境界原則・withSentry 方式（project.md の learnings に永続化済み）を再利用する。
- #1090（D1）: DB binding・`drizzle-migration-check` の D1 化はここに含めない。
- #1094（hocuspocus DO）/ #1095（LangGraph Workflows）: 接点なし（ルート分割で境界のみ確定）。
- Terraform: 凍結。DNS・ゾーンは現状維持（Phase 5 で撤去）。
