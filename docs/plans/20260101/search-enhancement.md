# 実装計画書: Search Enhancement（検索機能の強化）

## 概要

| 項目       | 内容                                                                   |
| :--------- | :--------------------------------------------------------------------- |
| **機能名** | Search Enhancement（検索機能の強化）                                   |
| **目的**   | 検索機能の精度向上とユーザー体験の改善                                 |
| **優先度** | 🟢 改善（既存機能の強化）                                              |
| **依存**   | Global Search（✅ 実装済み）                                           |

---

## 現状分析

### 既存実装の確認

現在の `useGlobalSearch.ts` を確認したところ、**タイトルとコンテンツ両方を検索対象にしている**ことが確認できました：

```typescript
// useGlobalSearch.ts より抜粋
const titleMatch = page.title.toLowerCase().includes(normalizedQuery);
const content = extractPlainText(page.content);
const contentMatch = content.toLowerCase().includes(normalizedQuery);

return titleMatch || contentMatch;
```

**つまり、基本的なコンテンツ検索は既に実装済みです。**

### 改善の余地

| 項目                   | 現状                               | 改善案                                     |
| :--------------------- | :--------------------------------- | :----------------------------------------- |
| **ハイライト表示**     | スニペット内のマッチ箇所が不明瞭   | キーワードをハイライト表示                 |
| **スコアリング**       | 基本的なスコアリング               | より精度の高い関連度計算                   |
| **検索対象の明示**     | タイトル/コンテンツの区別なし     | どこでマッチしたか明示                     |
| **複数キーワード**     | 未対応                             | AND/OR 検索のサポート                      |
| **検索結果のプレビュー** | 固定長スニペット                  | 文脈を考慮したスマートスニペット           |

---

## 機能要件

### 強化ポイント

1. **キーワードハイライト**: 検索結果のスニペット内でマッチ箇所を視覚的に強調
2. **マッチ箇所の明示**: タイトルマッチ / コンテンツマッチを区別して表示
3. **スマートスニペット**: 文単位・段落単位で意味が通る範囲をスニペットとして表示
4. **複数キーワード対応**: スペース区切りで複数キーワードの AND 検索

### 検索仕様（強化版）

| 項目               | 現状                     | 強化後                                         |
| :----------------- | :----------------------- | :--------------------------------------------- |
| **検索対象**       | タイトル + コンテンツ    | 変更なし                                       |
| **複数キーワード** | 未対応                   | スペース区切りで AND 検索                      |
| **ハイライト**     | なし                     | `<mark>` タグでハイライト                      |
| **スニペット**     | キーワード前後 40 文字   | 文単位で 100 文字程度                          |
| **マッチ表示**     | 区別なし                 | 「タイトル一致」「本文一致」のバッジ表示       |

---

## UI 設計

### 検索結果の強化表示

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     ┌─────────────────────────────────────────────────┐     │
│     │ 🔍 機械学習 ニューラル                       ⌘K │     │
│     └─────────────────────────────────────────────────┘     │
│                                                             │
│     ┌─────────────────────────────────────────────────┐     │
│     │ 検索結果 (3件)                                   │     │
│     │ ────────────────────────────────────────────────│     │
│     │                                                  │     │
│     │ ▶ 📄 機械学習入門                  [タイトル一致]│     │
│     │   「...人工知能の一分野である【機械学習】は、    │     │
│     │   【ニューラル】ネットワークを用いて...」        │     │
│     │                                       ← マーク表示│     │
│     │                                                  │     │
│     │   📄 深層学習とニューラルネットワーク            │     │
│     │   「...【機械学習】の一種である深層学習では、    │     │ ← 本文マッチのみ
│     │   【ニューラル】ネットワークの層を...」  [本文一致]│     │
│     │                                                  │     │
│     │   📄 AI技術概要                                  │     │
│     │   「...【機械学習】や【ニューラル】ネットなど    │     │
│     │   の技術を総称して...」              [本文一致]  │     │
│     └─────────────────────────────────────────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### マッチタイプバッジ

| バッジ           | 意味                           | スタイル                 |
| :--------------- | :----------------------------- | :----------------------- |
| `[タイトル一致]` | タイトルにキーワードが含まれる | 緑色バッジ               |
| `[本文一致]`     | 本文にキーワードが含まれる     | 灰色バッジ               |
| `[完全一致]`     | タイトルが完全一致             | 緑色バッジ + 太字        |

---

## 技術設計

### 検索ロジックの強化

```typescript
// hooks/useGlobalSearch.ts の強化

export interface SearchResult {
  page: Page;
  matchedText: string;
  highlightedText: string;    // 追加: ハイライト付きテキスト
  matchType: MatchType;       // 追加: マッチタイプ
  score: number;
}

export type MatchType = 'exact_title' | 'title' | 'content' | 'both';

/**
 * 複数キーワードをサポートする検索
 */
function searchPages(pages: Page[], query: string): SearchResult[] {
  if (!query.trim()) return [];

  // スペースで分割して複数キーワードに対応
  const keywords = query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(k => k.length > 0);

  if (keywords.length === 0) return [];

  return pages
    .filter((page) => {
      if (page.isDeleted) return false;

      const title = page.title.toLowerCase();
      const content = extractPlainText(page.content).toLowerCase();

      // すべてのキーワードがタイトルまたはコンテンツに含まれる（AND検索）
      return keywords.every(
        keyword => title.includes(keyword) || content.includes(keyword)
      );
    })
    .map((page) => {
      const title = page.title.toLowerCase();
      const content = extractPlainText(page.content);
      const contentLower = content.toLowerCase();

      // マッチタイプを判定
      const titleMatchAll = keywords.every(k => title.includes(k));
      const contentMatchAll = keywords.every(k => contentLower.includes(k));
      const isExactTitle = title === query.toLowerCase().trim();

      let matchType: MatchType;
      if (isExactTitle) {
        matchType = 'exact_title';
      } else if (titleMatchAll && contentMatchAll) {
        matchType = 'both';
      } else if (titleMatchAll) {
        matchType = 'title';
      } else {
        matchType = 'content';
      }

      // スコア計算
      const score = calculateEnhancedScore(page, keywords, matchType);

      // スマートスニペット生成
      const matchedText = extractSmartSnippet(content, keywords);
      const highlightedText = highlightKeywords(matchedText, keywords);

      return { page, matchedText, highlightedText, matchType, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}
```

### スマートスニペット生成

```typescript
// lib/searchUtils.ts

/**
 * 文単位でスニペットを抽出
 */
export function extractSmartSnippet(
  text: string,
  keywords: string[],
  maxLength: number = 120
): string {
  const sentences = text.split(/[。.!?！？\n]+/).filter(s => s.trim());

  // キーワードを最も多く含む文を探す
  let bestSentence = '';
  let bestScore = 0;

  for (const sentence of sentences) {
    const lowerSentence = sentence.toLowerCase();
    const score = keywords.reduce((acc, keyword) => {
      return acc + (lowerSentence.includes(keyword) ? 1 : 0);
    }, 0);

    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence.trim();
    }
  }

  // 文が長すぎる場合は最初のキーワード周辺を抽出
  if (bestSentence.length > maxLength) {
    const firstKeyword = keywords[0];
    const index = bestSentence.toLowerCase().indexOf(firstKeyword);

    if (index !== -1) {
      const start = Math.max(0, index - 40);
      const end = Math.min(bestSentence.length, index + firstKeyword.length + 60);
      let snippet = bestSentence.slice(start, end);

      if (start > 0) snippet = '...' + snippet;
      if (end < bestSentence.length) snippet = snippet + '...';

      return snippet;
    }
  }

  // 文が短い場合はそのまま返す
  if (bestSentence.length <= maxLength) {
    return bestSentence;
  }

  return bestSentence.slice(0, maxLength) + '...';
}

/**
 * キーワードをハイライト
 */
export function highlightKeywords(text: string, keywords: string[]): string {
  let result = text;

  for (const keyword of keywords) {
    // 大文字小文字を保持しながら置換
    const regex = new RegExp(`(${escapeRegExp(keyword)})`, 'gi');
    result = result.replace(regex, '【$1】');
  }

  return result;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

### 強化版スコアリング

```typescript
// lib/searchUtils.ts

export function calculateEnhancedScore(
  page: Page,
  keywords: string[],
  matchType: MatchType
): number {
  let score = 0;

  // マッチタイプによる基本スコア
  switch (matchType) {
    case 'exact_title':
      score += 200;
      break;
    case 'title':
      score += 100;
      break;
    case 'both':
      score += 80;
      break;
    case 'content':
      score += 30;
      break;
  }

  // タイトルの先頭一致ボーナス
  const titleLower = page.title.toLowerCase();
  if (titleLower.startsWith(keywords[0])) {
    score += 50;
  }

  // キーワード出現回数ボーナス（コンテンツ内）
  const content = extractPlainText(page.content).toLowerCase();
  for (const keyword of keywords) {
    const occurrences = (content.match(new RegExp(keyword, 'g')) || []).length;
    score += Math.min(occurrences, 5) * 2;
  }

  // 新しさボーナス
  const ageInDays = (Date.now() - page.updatedAt) / (1000 * 60 * 60 * 24);
  score += Math.max(0, 10 - Math.floor(ageInDays));

  return score;
}
```

### UI コンポーネントの更新

```typescript
// components/search/GlobalSearch.tsx の更新

{hasQuery && searchResults.length > 0 && (
  <CommandGroup heading={`検索結果 (${searchResults.length}件)`}>
    {searchResults.map(({ page, highlightedText, matchType }) => (
      <CommandItem
        key={page.id}
        value={page.id}
        onSelect={() => handleSelect(page.id)}
      >
        <div className="flex flex-col gap-1 w-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {page.sourceUrl ? (
                <LinkIcon className="h-4 w-4 shrink-0" />
              ) : (
                <FileText className="h-4 w-4 shrink-0" />
              )}
              <span className="font-medium truncate">
                {page.title || "無題のページ"}
              </span>
            </div>
            <MatchTypeBadge type={matchType} />
          </div>
          <HighlightedSnippet text={highlightedText} />
        </div>
      </CommandItem>
    ))}
  </CommandGroup>
)}

// マッチタイプバッジ
function MatchTypeBadge({ type }: { type: MatchType }) {
  const config = {
    exact_title: { label: '完全一致', className: 'bg-green-100 text-green-800 font-semibold' },
    title: { label: 'タイトル', className: 'bg-green-50 text-green-700' },
    both: { label: 'タイトル+本文', className: 'bg-blue-50 text-blue-700' },
    content: { label: '本文', className: 'bg-gray-100 text-gray-600' },
  };

  const { label, className } = config[type];

  return (
    <span className={cn('text-xs px-1.5 py-0.5 rounded', className)}>
      {label}
    </span>
  );
}

// ハイライトされたスニペット
function HighlightedSnippet({ text }: { text: string }) {
  // 【keyword】を<mark>に変換
  const parts = text.split(/【|】/);

  return (
    <p className="text-xs text-muted-foreground line-clamp-2">
      {parts.map((part, index) => (
        index % 2 === 1 ? (
          <mark key={index} className="bg-yellow-200 text-yellow-900 px-0.5 rounded">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      ))}
    </p>
  );
}
```

---

## ファイル構成

```
src/
├── components/
│   └── search/
│       ├── GlobalSearch.tsx          # UI更新（修正）
│       ├── MatchTypeBadge.tsx        # マッチタイプバッジ（新規）
│       └── HighlightedSnippet.tsx    # ハイライトスニペット（新規）
├── hooks/
│   └── useGlobalSearch.ts            # 検索ロジック強化（修正）
└── lib/
    └── searchUtils.ts                # 検索ユーティリティ（新規）
```

---

## 実装ステップ

| Step | 内容                                        | 見積もり |
| :--- | :------------------------------------------ | :------- |
| 1    | searchUtils.ts の作成（スニペット、ハイライト） | 1.5 時間 |
| 2    | 複数キーワード対応の実装                    | 1 時間   |
| 3    | 強化版スコアリングの実装                    | 1 時間   |
| 4    | MatchTypeBadge コンポーネントの作成         | 30 分    |
| 5    | HighlightedSnippet コンポーネントの作成     | 30 分    |
| 6    | GlobalSearch の UI 更新                     | 1 時間   |
| 7    | useGlobalSearch の更新                      | 1 時間   |
| 8    | テストと調整                                | 1 時間   |

**合計見積もり: 約 7.5 時間**

---

## パフォーマンス考慮

| 懸念事項                       | 対策                                           |
| :----------------------------- | :--------------------------------------------- |
| 複数キーワードでの処理負荷増加 | デバウンス（100ms）で対応                      |
| ハイライト処理のコスト         | 結果表示時のみ実行（検索時は行わない）         |
| 正規表現の安全性               | escapeRegExp でユーザー入力をエスケープ        |

---

## 将来の拡張

1. **フレーズ検索**: `"machine learning"` で完全一致フレーズ検索
2. **除外検索**: `-keyword` で除外
3. **フィールド指定検索**: `title:機械学習` でタイトルのみ検索
4. **Fuzzy Search**: タイポ許容の曖昧検索
5. **Semantic Search**: 意味ベースの検索（Turso ベクトル検索連携）

---

## 関連ドキュメント

- [PRD: 2.6 検索と再発見 - Smart Snippet](../PRD.md#26-検索と再発見-hybrid-retrieval)
- [既存実装: docs/plans/20251231/global-search.md](../20251231/global-search.md)
