---
agent: "agent"
description: "新機能を設計・実装する"
argument-hint: "実装する機能の概要"
---

# 新機能の実装

機能: $ARGUMENTS

## 手順

1. **要件の整理**: 目的、スコープ、受け入れ基準を明確化
2. **設計**: コンポーネント、フック、API、データモデルを洗い出す
3. **実装** - 技術スタック:
   - フロントエンド: React 19, TypeScript, Tailwind CSS, Radix UI (shadcn/ui)
   - 状態管理: Zustand, TanStack Query
   - バックエンド: Hono, Drizzle ORM, Bun
   - エディタ: Tiptap 3, Y.js
4. **テスト**: Vitest でユニットテスト、必要に応じて Playwright で E2E
5. **検証**: `bun run lint` と `bun run test:run` を実行
6. **コミット**: Conventional Commits 形式 `feat: 機能の説明`
