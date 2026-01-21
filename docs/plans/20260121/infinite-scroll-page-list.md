# ページ一覧の無限スクロール化

**日付**: 2026-01-21  
**ステータス**: 計画中

## 概要

ページ一覧（Home のグリッド）を **カーソル型無限スクロール + 仮想化** に変更し、大量ページでも高速に表示できるようにする。

## 現状の問題

| 項目 | 現状 | 問題点 |
|------|------|--------|
| データ取得 | `getPagesSummary()` で全件取得 | ページ数に比例して遅くなる |
| ソート | フロント側で `updatedAt` 降順 | 全件メモリに載せる必要がある |
| 描画 | 全カードを DOM に生成 | 1000件超えると描画負荷大 |

## 目標

- **DB GET量の最小化**: 必要分だけ取得（初回20件、追加20件ずつ）
- **高速な初回表示**: 最初の20件だけ取得すれば表示開始
- **スムーズなスクロール**: 仮想化で表示領域のみレンダリング
- **大規模対応**: 10,000件以上でも快適に動作
- **シームレスな読み込み体験**: 追加読み込み中はスケルトンカードを表示

## UI の振る舞い

### スケルトンカード表示方式

追加データの読み込み中は、**スケルトンカード**を表示し、データ取得完了後に実際のカードに置き換える。

```
┌─────────────────────────────────────────────────────┐
│  [Card 1]  [Card 2]  [Card 3]  [Card 4]  [Card 5]  │  ← 実データ
│  [Card 6]  [Card 7]  [Card 8]  [Card 9]  [Card 10] │  ← 実データ
│  [Card 11] [Card 12] [Card 13] [Card 14] [Card 15] │  ← 実データ
│  [Card 16] [Card 17] [Card 18] [Card 19] [Card 20] │  ← 実データ
│  [░░░░░░░] [░░░░░░░] [░░░░░░░] [░░░░░░░] [░░░░░░░] │  ← スケルトン（読み込み中）
│  [░░░░░░░] [░░░░░░░] [░░░░░░░] [░░░░░░░] [░░░░░░░] │  ← スケルトン（読み込み中）
└─────────────────────────────────────────────────────┘
                         ↓ データ取得完了
┌─────────────────────────────────────────────────────┐
│  ...                                                │
│  [Card 16] [Card 17] [Card 18] [Card 19] [Card 20] │  ← 実データ
│  [Card 21] [Card 22] [Card 23] [Card 24] [Card 25] │  ← 実データ（置き換え）
│  [Card 26] [Card 27] [Card 28] [Card 29] [Card 30] │  ← 実データ（置き換え）
└─────────────────────────────────────────────────────┘
```

**実装のポイント:**
- `isFetchingNextPage` が `true` の間、`pages` 配列の末尾にプレースホルダーを追加
- プレースホルダーは `{ isPlaceholder: true, id: string }` の形式
- `isPlaceholder()` 型ガードで判定し、スケルトンカード or 実カードを描画
- React Query がデータ取得完了すると自動的に `pages` が更新され、スケルトンが実データに置き換わる

## 技術選定

| 要素 | 選定 | 理由 |
|------|------|------|
| ページング方式 | **カーソル型** | OFFSET方式より大規模時に高速 |
| カーソルキー | `updated_at` + `id` 複合 | ユニーク性を保証 |
| データ取得 | `useInfiniteQuery` | React Query の無限スクロール対応 |
| 仮想化 | `@tanstack/react-virtual` | 既にインストール済み、軽量 |

## 詳細設計

### 1. 型定義の追加

```typescript
// src/types/page.ts

/**
 * カーソル型ページネーションのカーソル
 */
export interface PageCursor {
  updatedAt: number;
  id: string;
}

/**
 * ページ一覧の取得結果（ページネーション対応）
 */
export interface PageSummaryPage {
  items: PageSummary[];
  nextCursor: PageCursor | null;
  hasMore: boolean;
}

/**
 * 読み込み中のプレースホルダー
 */
export interface PageSummaryPlaceholder {
  isPlaceholder: true;
  id: string;
}

/**
 * PageGrid で表示するアイテム（実データまたはプレースホルダー）
 */
export type PageGridItem = PageSummary | PageSummaryPlaceholder;

/**
 * プレースホルダーかどうかを判定する型ガード
 */
export function isPlaceholder(item: PageGridItem): item is PageSummaryPlaceholder {
  return 'isPlaceholder' in item && item.isPlaceholder === true;
}
```

### 2. Repository層の追加

```typescript
// src/lib/pageRepository.ts

/**
 * Get page summaries with cursor-based pagination
 * @param userId User ID
 * @param limit Number of items per page (default: 20)
 * @param cursor Cursor for pagination (null for first page)
 */
async getPagesSummaryPage(
  userId: string,
  limit: number = 20,
  cursor: PageCursor | null = null
): Promise<PageSummaryPage> {
  let sql: string;
  let args: (string | number)[];

  if (cursor) {
    // Cursor-based pagination
    // updated_at DESC, id DESC でソート
    // カーソル以降のデータを取得
    sql = `
      SELECT id, title, content_preview, thumbnail_url, source_url, created_at, updated_at, is_deleted
      FROM pages
      WHERE user_id = ? AND is_deleted = 0
        AND (updated_at < ? OR (updated_at = ? AND id < ?))
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `;
    args = [userId, cursor.updatedAt, cursor.updatedAt, cursor.id, limit + 1];
  } else {
    // First page
    sql = `
      SELECT id, title, content_preview, thumbnail_url, source_url, created_at, updated_at, is_deleted
      FROM pages
      WHERE user_id = ? AND is_deleted = 0
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `;
    args = [userId, limit + 1];
  }

  const result = await this.client.execute({ sql, args });
  const rows = result.rows.map((row) => this.rowToPageSummary(row));

  // Check if there are more items
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // Generate next cursor
  const lastItem = items[items.length - 1];
  const nextCursor = hasMore && lastItem
    ? { updatedAt: lastItem.updatedAt, id: lastItem.id }
    : null;

  return { items, nextCursor, hasMore };
}
```

### 3. Hook層の追加

```typescript
// src/hooks/usePageQueries.ts

import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { 
  PageCursor, 
  PageSummaryPage, 
  PageGridItem,
  PageSummaryPlaceholder 
} from "@/types/page";

// Query keys に追加
export const pageKeys = {
  // ... 既存のキー
  infiniteList: (userId: string) => [...pageKeys.lists(), "infinite", userId] as const,
};

/**
 * Hook to fetch page summaries with infinite scroll
 * 
 * 追加読み込み中は末尾にプレースホルダーを追加し、
 * データ取得完了後に実データに置き換わる
 */
export function usePagesSummaryInfinite(limit: number = 20) {
  const { getRepository, userId, isLoaded } = useRepository();

  const query = useInfiniteQuery({
    queryKey: pageKeys.infiniteList(userId),
    queryFn: async ({ pageParam }) => {
      const repo = await getRepository();
      return repo.getPagesSummaryPage(userId, limit, pageParam);
    },
    initialPageParam: null as PageCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: isLoaded,
    staleTime: 1000 * 60, // 1 minute
  });

  // Flatten pages for easy access
  const allPages = query.data?.pages.flatMap((page) => page.items) ?? [];

  // 読み込み中のプレースホルダーを追加
  // isFetchingNextPage が true の間、末尾にスケルトン用のプレースホルダーを追加
  // データ取得が完了すると自動的に実データに置き換わる
  const pagesWithPlaceholders: PageGridItem[] = useMemo(() => {
    if (!query.isFetchingNextPage) return allPages;

    // 次のページ読み込み中は、limit 個のプレースホルダーを追加
    const placeholders: PageSummaryPlaceholder[] = Array.from(
      { length: limit },
      (_, i) => ({
        isPlaceholder: true as const,
        id: `placeholder-${i}`,
      })
    );

    return [...allPages, ...placeholders];
  }, [allPages, query.isFetchingNextPage, limit]);

  return {
    ...query,
    pages: pagesWithPlaceholders,
    rawPages: allPages, // プレースホルダーなしの実データ
    isLoading: query.isLoading || !isLoaded,
    isRepositoryReady: isLoaded,
  };
}
```

### 4. PageCardSkeleton コンポーネントの追加

```typescript
// src/components/page/PageCardSkeleton.tsx

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * ページカードのスケルトン表示
 * 無限スクロールの追加読み込み時に表示される
 */
const PageCardSkeleton: React.FC = () => {
  return (
    <div
      className="page-card w-full rounded-lg overflow-hidden bg-card border border-border/50 aspect-square flex flex-col"
    >
      {/* Title skeleton */}
      <div className="p-3 pb-2">
        <div className="flex items-start gap-1.5">
          <Skeleton className="h-4 w-4 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      </div>
      {/* Thumbnail/Preview skeleton */}
      <div className="flex-1 min-h-0 px-3 pb-3">
        <Skeleton className="h-full w-full" />
      </div>
    </div>
  );
};

export default PageCardSkeleton;
```

### 5. コンポーネント層の変更

```typescript
// src/components/page/PageGrid.tsx

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useEffect, useState } from "react";
import { usePagesSummaryInfinite, useSyncStatus } from "@/hooks/usePageQueries";
import { isPlaceholder } from "@/types/page";
import PageCard from "./PageCard";
import PageCardSkeleton from "./PageCardSkeleton";
import EmptyState from "./EmptyState";

const PAGE_SIZE = 20;

const PageGrid: React.FC<PageGridProps> = ({ isSeeding = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { isSignedIn } = useAuth();
  const syncStatus = useSyncStatus();

  const {
    pages,
    rawPages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = usePagesSummaryInfinite(PAGE_SIZE);

  // カラム数の計算（レスポンシブ対応）
  const [columnCount, setColumnCount] = useState(2);

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width >= 1280) setColumnCount(5);
      else if (width >= 1024) setColumnCount(4);
      else if (width >= 768) setColumnCount(3);
      else setColumnCount(2);
    };
    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  // グリッド行の計算（プレースホルダー含む）
  const rowCount = Math.ceil(pages.length / columnCount);

  // 仮想化設定
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 200, // 各行の推定高さ
    overscan: 2, // 表示外の余分な行数
  });

  // 無限スクロールのトリガー
  // 実データの最後の行に近づいたら次のページを取得
  useEffect(() => {
    const [lastItem] = [...rowVirtualizer.getVirtualItems()].reverse();
    if (!lastItem) return;

    // 実データの行数で判定（プレースホルダーは除く）
    const realRowCount = Math.ceil(rawPages.length / columnCount);
    const isNearEnd = lastItem.index >= realRowCount - 2; // 2行前でトリガー

    if (isNearEnd && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [
    rowVirtualizer.getVirtualItems(),
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    rawPages.length,
    columnCount,
  ]);

  // 初回ローディング
  if (isLoading && rawPages.length === 0) {
    return <PageGridSkeleton />;
  }

  // 空状態
  if (rawPages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div
      ref={containerRef}
      className="pb-24 overflow-auto"
      style={{ height: "calc(100vh - 120px)" }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          // 行内のアイテムを計算
          const startIndex = virtualRow.index * columnCount;
          const rowItems = pages.slice(startIndex, startIndex + columnCount);

          return (
            <div
              key={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {rowItems.map((item, i) => {
                  // プレースホルダーならスケルトンを表示
                  if (isPlaceholder(item)) {
                    return <PageCardSkeleton key={item.id} />;
                  }

                  // 実データならPageCardを表示
                  return (
                    <PageCard
                      key={item.id}
                      page={item}
                      index={startIndex + i}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
```

### 5. キャッシュの整合性

新規作成/更新/削除時に無限スクロールのキャッシュも更新する必要がある。

```typescript
// useCreatePage の onSuccess
onSuccess: (newPage) => {
  // 既存のキャッシュ更新
  queryClient.invalidateQueries({ queryKey: pageKeys.lists() });
  queryClient.invalidateQueries({ queryKey: pageKeys.summaries() });

  // 無限スクロールのキャッシュに先頭追加
  queryClient.setQueryData<InfiniteData<PageSummaryPage>>(
    pageKeys.infiniteList(userId),
    (oldData) => {
      if (!oldData) return oldData;
      const newSummary = pageToSummary(newPage);
      return {
        ...oldData,
        pages: oldData.pages.map((page, index) => {
          if (index === 0) {
            return { ...page, items: [newSummary, ...page.items] };
          }
          return page;
        }),
      };
    }
  );
};
```

## インデックス追加

カーソルクエリのパフォーマンス向上のため、複合インデックスを追加。

```sql
-- ローカル・リモート両方に適用
CREATE INDEX IF NOT EXISTS idx_pages_user_updated_id 
  ON pages(user_id, updated_at DESC, id DESC);
```

## 実装順序

1. **型定義の追加** (`src/types/page.ts`)
   - `PageCursor`, `PageSummaryPage` 型
   - `PageSummaryPlaceholder`, `PageGridItem` 型
   - `isPlaceholder` 型ガード関数
2. **Repository層の実装** (`src/lib/pageRepository.ts`)
3. **Hook層の実装** (`src/hooks/usePageQueries.ts`)
   - `usePagesSummaryInfinite` hook
   - プレースホルダー追加ロジック
4. **インデックス追加** (`src/lib/turso.ts` のスキーマ)
5. **PageCardSkeleton の作成** (`src/components/page/PageCardSkeleton.tsx`)
6. **PageGrid の変更** (`src/components/page/PageGrid.tsx`)
7. **キャッシュ整合性の実装** (各mutation hook)
8. **テスト**

## 動作確認項目

- [ ] 初回表示で20件のみ取得されること
- [ ] スクロールで追加データが読み込まれること
- [ ] **追加読み込み中にスケルトンカードが表示されること**
- [ ] **データ取得完了後、スケルトンカードが実データのカードに置き換わること**
- [ ] 仮想化によりDOM数が制限されること
- [ ] 新規作成時に先頭に追加されること
- [ ] 削除時にリストから消えること
- [ ] 更新時に順序が変わること
- [ ] エンプティステート/初回スケルトンが正しく表示されること
- [ ] レスポンシブでカラム数が変わること

## リスクと対策

| リスク | 対策 |
|--------|------|
| 同期中にカーソルがずれる | invalidateQueries で再取得 |
| 仮想化でアニメーションが効かない | カード出現アニメーションを調整 |
| グリッドレイアウトとの相性 | 行単位の仮想化で対応 |

## 将来の拡張

- フィルター/タグによる絞り込み（クエリパラメータ拡張）
- ソート順の変更（`created_at`/`title` など）
- 検索結果の無限スクロール化
