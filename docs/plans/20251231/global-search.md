# 実装計画書: Global Search（Omni-bar）

## 概要

| 項目       | 内容                                                               |
| :--------- | :----------------------------------------------------------------- |
| **機能名** | Global Search（Omni-bar）                                          |
| **目的**   | キーボードショートカットで全文検索を起動し、ページを素早く発見する |
| **優先度** | 🔴 必須（Phase 4 のコア機能）                                      |
| **依存**   | なし                                                               |

---

## 機能要件

### ユーザーストーリー

1. ユーザーは `Cmd+K`（Mac）/ `Ctrl+K`（Windows/Linux）を押す
2. コマンドパレット風の検索 UI が画面中央に表示される
3. キーワードを入力すると、タイトル・本文からリアルタイムで検索
4. 検索結果をキーボード（↑↓）で選択し、Enter で該当ページに遷移
5. Escape で検索を閉じる

### 検索仕様

| 項目           | 内容                                                 |
| :------------- | :--------------------------------------------------- |
| **検索対象**   | ページタイトル、ページ本文（Tiptap JSON のテキスト） |
| **検索方式**   | 部分一致（キーワードを含むページを表示）             |
| **ソート順**   | 関連度 > 更新日時                                    |
| **表示件数**   | 最大 10 件                                           |
| **レスポンス** | 入力から 100ms 以内に結果表示                        |

---

## UI 設計

### Omni-bar（コマンドパレット）

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     ┌─────────────────────────────────────────────────┐     │
│     │ 🔍 ページを検索...                          ⌘K │     │
│     └─────────────────────────────────────────────────┘     │
│                                                             │
│     ┌─────────────────────────────────────────────────┐     │
│     │ 最近のページ                                    │     │
│     │ ─────────────────────────────────────────────── │     │
│     │ 📄 今日のメモ                           3分前   │     │
│     │ 📄 機械学習                             1時間前 │     │
│     │ 📄 プロジェクト計画                      昨日   │     │
│     │                                                 │     │
│     │ すべてのページ                                  │     │
│     │ ─────────────────────────────────────────────── │     │
│     │ 📄 👋 Zediへようこそ                            │     │
│     │ 📄 🔗 リンクの繋ぎ方                            │     │
│     └─────────────────────────────────────────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 検索結果表示

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     ┌─────────────────────────────────────────────────┐     │
│     │ 🔍 機械学習                                 ⌘K │     │
│     └─────────────────────────────────────────────────┘     │
│                                                             │
│     ┌─────────────────────────────────────────────────┐     │
│     │ 検索結果 (3件)                                  │     │
│     │ ─────────────────────────────────────────────── │     │
│     │ ▶ 📄 機械学習                          ← 選択中 │     │
│     │   「...機械学習（Machine Learning）は、人工知能...」 │     │
│     │                                                 │     │
│     │   📄 深層学習入門                               │     │
│     │   「...機械学習の一種である深層学習は...」      │     │
│     │                                                 │     │
│     │   🔗 機械学習入門ガイド                         │     │
│     │   「...初心者向けの機械学習チュートリアル...」  │     │
│     └─────────────────────────────────────────────────┘     │
│                                                             │
│     ↑↓ で移動  Enter で開く  Esc で閉じる                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### アイコン凡例

| アイコン | 意味                            |
| :------- | :------------------------------ |
| 📄       | 通常のページ                    |
| 🔗       | Web クリップしたページ          |
| ✨       | AI 生成されたページ（将来対応） |

---

## 技術設計

### コンポーネント構造

```
GlobalSearch
├── CommandDialog (shadcn/ui command)
│   ├── CommandInput
│   ├── CommandList
│   │   ├── CommandGroup "最近のページ"
│   │   │   └── CommandItem[]
│   │   └── CommandGroup "検索結果"
│   │       └── CommandItem[]
│   └── CommandEmpty
└── useGlobalSearch (hook)
```

### キーボードショートカット

```typescript
// hooks/useGlobalSearchShortcut.ts
import { useEffect } from "react";

export function useGlobalSearchShortcut(onOpen: () => void) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpen();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onOpen]);
}
```

### 検索ロジック

```typescript
// lib/searchPages.ts
import type { Page } from "@/types/page";
import { getTextFromTiptapJSON } from "./contentUtils";

export interface SearchResult {
  page: Page;
  matchedText: string;
  score: number;
}

export function searchPages(
  pages: Page[],
  query: string,
  limit: number = 10
): SearchResult[] {
  if (!query.trim()) {
    return [];
  }

  const normalizedQuery = query.toLowerCase().trim();
  const results: SearchResult[] = [];

  for (const page of pages) {
    if (page.isDeleted) continue;

    const title = page.title.toLowerCase();
    const content = getTextFromTiptapJSON(page.content).toLowerCase();

    // タイトルマッチ（高スコア）
    const titleMatch = title.includes(normalizedQuery);
    // 本文マッチ（低スコア）
    const contentMatch = content.includes(normalizedQuery);

    if (titleMatch || contentMatch) {
      const score = calculateScore(titleMatch, contentMatch, page.updatedAt);

      const matchedText = extractMatchedSnippet(
        titleMatch ? page.title : getTextFromTiptapJSON(page.content),
        normalizedQuery
      );

      results.push({ page, matchedText, score });
    }
  }

  // スコア順でソート
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}

function calculateScore(
  titleMatch: boolean,
  contentMatch: boolean,
  updatedAt: number
): number {
  let score = 0;

  // タイトルマッチは高スコア
  if (titleMatch) score += 100;
  if (contentMatch) score += 10;

  // 新しいページほど高スコア（最大10ポイント）
  const ageInDays = (Date.now() - updatedAt) / (1000 * 60 * 60 * 24);
  score += Math.max(0, 10 - ageInDays);

  return score;
}

function extractMatchedSnippet(
  text: string,
  query: string,
  contextLength: number = 50
): string {
  const lowerText = text.toLowerCase();
  const index = lowerText.indexOf(query.toLowerCase());

  if (index === -1) return text.slice(0, contextLength * 2) + "...";

  const start = Math.max(0, index - contextLength);
  const end = Math.min(text.length, index + query.length + contextLength);

  let snippet = text.slice(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";

  return snippet;
}
```

### React Query との統合

```typescript
// hooks/useGlobalSearch.ts
import { useState, useMemo, useCallback } from "react";
import { usePages } from "./usePageQueries";
import { searchPages, SearchResult } from "@/lib/searchPages";
import { useDebouncedValue } from "./useDebouncedValue";

export function useGlobalSearch() {
  const { data: pages = [] } = usePages();
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const debouncedQuery = useDebouncedValue(query, 100);

  const searchResults = useMemo(() => {
    return searchPages(pages, debouncedQuery);
  }, [pages, debouncedQuery]);

  const recentPages = useMemo(() => {
    return pages
      .filter((p) => !p.isDeleted)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);
  }, [pages]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  return {
    query,
    setQuery,
    isOpen,
    open,
    close,
    searchResults,
    recentPages,
    hasQuery: query.trim().length > 0,
  };
}
```

### コンポーネント実装

```typescript
// components/search/GlobalSearch.tsx
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { useGlobalSearchShortcut } from "@/hooks/useGlobalSearchShortcut";
import { useNavigate } from "react-router-dom";
import { formatTimeAgo } from "@/lib/dateUtils";
import { FileText, Link as LinkIcon } from "lucide-react";

export function GlobalSearch() {
  const navigate = useNavigate();
  const {
    query,
    setQuery,
    isOpen,
    open,
    close,
    searchResults,
    recentPages,
    hasQuery,
  } = useGlobalSearch();

  useGlobalSearchShortcut(open);

  const handleSelect = (pageId: string) => {
    navigate(`/page/${pageId}`);
    close();
  };

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <CommandInput
        placeholder="ページを検索..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>ページが見つかりません</CommandEmpty>

        {!hasQuery && (
          <CommandGroup heading="最近のページ">
            {recentPages.map((page) => (
              <CommandItem
                key={page.id}
                value={page.id}
                onSelect={() => handleSelect(page.id)}
              >
                {page.sourceUrl ? (
                  <LinkIcon className="mr-2 h-4 w-4" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                <span className="flex-1">{page.title || "無題のページ"}</span>
                <span className="text-xs text-muted-foreground">
                  {formatTimeAgo(page.updatedAt)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {hasQuery && searchResults.length > 0 && (
          <CommandGroup heading={`検索結果 (${searchResults.length}件)`}>
            {searchResults.map(({ page, matchedText }) => (
              <CommandItem
                key={page.id}
                value={page.id}
                onSelect={() => handleSelect(page.id)}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {page.sourceUrl ? (
                      <LinkIcon className="h-4 w-4" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    <span className="font-medium">
                      {page.title || "無題のページ"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground line-clamp-1">
                    {matchedText}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
```

---

## ファイル構成

```
src/
├── components/
│   └── search/
│       └── GlobalSearch.tsx      # メインコンポーネント（新規）
├── hooks/
│   ├── useGlobalSearch.ts        # 検索ロジックフック（新規）
│   ├── useGlobalSearchShortcut.ts# ショートカットフック（新規）
│   └── useDebouncedValue.ts      # デバウンスフック（新規）
├── lib/
│   └── searchPages.ts            # 検索ロジック（新規）
└── App.tsx                       # GlobalSearch を追加（修正）
```

---

## 実装ステップ

| Step | 内容                              | 見積もり |
| :--- | :-------------------------------- | :------- |
| 1    | 検索ロジック（searchPages）の実装 | 1.5 時間 |
| 2    | スニペット抽出とスコアリング      | 1 時間   |
| 3    | useGlobalSearch フック            | 1 時間   |
| 4    | キーボードショートカット          | 30 分    |
| 5    | CommandDialog UI 実装             | 1.5 時間 |
| 6    | デバウンス処理                    | 30 分    |
| 7    | 最近のページ表示                  | 30 分    |
| 8    | App.tsx への統合                  | 30 分    |
| 9    | キーボードナビゲーション調整      | 30 分    |
| 10   | テストと調整                      | 1 時間   |

**合計見積もり: 約 8.5 時間**

---

## パフォーマンス考慮

### 現在の実装（クライアントサイド検索）

- **ページ数 1,000 件以下**: 問題なし（100ms 以内）
- **ページ数 10,000 件以上**: パフォーマンス低下の可能性

### 将来の最適化

1. **Web Worker**: 検索処理をバックグラウンドスレッドで実行
2. **インデックス作成**: ページ保存時に検索インデックスを構築
3. **Rust (Tantivy)**: Tauri 移行後は Rust で高速検索

---

## アクセシビリティ

- `Cmd+K` / `Ctrl+K` でフォーカスが検索入力に移動
- `↑` `↓` で検索結果を移動
- `Enter` で選択したページを開く
- `Escape` で検索を閉じて元の位置に戻る
- スクリーンリーダー対応（`aria-label`, `role` 属性）

---

## 将来の拡張

1. **コマンドパレット機能**: `/new` で新規ページ、`/settings` で設定画面など
2. **フィルター**: タグ、日付範囲、ページタイプでフィルタリング
3. **Semantic Search**: ベクトル検索による意味検索
4. **検索履歴**: 過去の検索クエリを保存

---

## 関連ドキュメント

- [PRD: 2.6 検索と再発見 (Hybrid Retrieval)](../PRD.md#26-検索と再発見-hybrid-retrieval)
