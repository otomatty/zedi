---
agent: "agent"
description: "報告されたバグを調査し、原因と修正方針をまとめる"
argument-hint: "バグの概要または .github/issues/ のファイル名"
---

# バグ調査

対象: $ARGUMENTS

## 手順

1. **再現手順の理解**: バグ報告の内容と影響範囲を特定
2. **関連コードの特定**: コンポーネント、フック、API ルート、ユーティリティを洗い出し、データフローを追跡
3. **原因の分析**:
   - フロントエンド（React, Zustand, TanStack Query）
   - バックエンド（Hono API, Drizzle ORM）
   - コラボレーション層（Y.js, Hocuspocus）
4. **調査結果の文書化**: `.github/issues/` に Markdown で記録
   - 概要、再現手順、関連ファイル一覧、原因候補と根拠、修正の方向性（複数案）
