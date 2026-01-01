# 実装計画書: Linked Pages Cards（リンクカード表示）

## 概要

| 項目       | 内容                                                                                       |
| :--------- | :----------------------------------------------------------------------------------------- |
| **機能名** | Linked Pages Cards（リンクカード表示）                                                     |
| **目的**   | ページ下部に、そのページからリンクしているページと、逆にリンクされているページをカード表示 |
| **優先度** | 🟡 推奨（Phase 4 の保留機能）                                                              |
| **依存**   | WikiLink 機能（✅ 実装済み）、links テーブル（✅ 実装済み）                                |

---

## 機能要件

### ユーザーストーリー

1. ユーザーがページを開くと、エディタ下部にリンク関連のセクションが表示される
2. 以下の 3 種類のリンク情報がカード形式で表示される：
   - **Outgoing Links（リンク先）**: このページから `[[リンク]]` しているページ
   - **Backlinks（被リンク）**: このページを `[[リンク]]` している他のページ
   - **2-hop Links（2 階層先）**: リンク先ページがさらにリンクしているページ（オプション）
3. カードをクリックすると、そのページに遷移する
4. リンクがない場合は、セクションは表示されない

### リンク表示仕様

| 項目                 | 内容                                                             |
| :------------------- | :--------------------------------------------------------------- |
| **Outgoing Links**   | ページ内の WikiLink から抽出。存在するページのみ表示             |
| **Backlinks**        | links テーブルから target_id でクエリ                            |
| **2-hop Links**      | Outgoing Links のページが持つ Outgoing Links（重複排除）         |
| **カード表示内容**   | ページタイトル、本文プレビュー（50 文字）、更新日時              |
| **表示件数**         | 各セクション最大 6 件（「もっと見る」で展開）                    |
| **Ghost Links 表示** | 存在しないリンク先も点線スタイルで表示（クリックで作成ダイアログ）|

---

## UI 設計

### ページ下部のリンクセクション

```
┌─────────────────────────────────────────────────────────────┐
│  ページタイトル                                    編集中...│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [エディタ本文]                                             │
│  機械学習とは、コンピュータがデータから学習し...             │
│  詳しくは [[ニューラルネットワーク]] を参照。               │
│  [[深層学習]] も関連概念です。                              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  🔗 リンク先 (2)                                            │
│  ┌──────────────────┐ ┌──────────────────┐                  │
│  │ ニューラルネット │ │ 深層学習         │                  │
│  │ ワーク           │ │ ────────────     │                  │
│  │ ────────────     │ │ 機械学習の一種で │                  │
│  │ 人工知能の基盤技 │ │ ある深層学習は...│                  │
│  │ 術であり...      │ │ 3日前            │                  │
│  │ 1週間前          │ └──────────────────┘                  │
│  └──────────────────┘                                       │
│                                                             │
│  ↩️ 被リンク (3)                                            │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────┐ │
│  │ AI入門           │ │ データサイエンス │ │ 自動運転技術 │ │
│  │ ────────────     │ │ 入門             │ │ ──────────── │ │
│  │ AIの基礎知識を   │ │ ────────────     │ │ 自動運転に必 │ │
│  │ まとめた...      │ │ データ分析の基礎 │ │ 要な技術...  │ │
│  │ 昨日             │ │ を学ぶ...        │ │ 2週間前      │ │
│  └──────────────────┘ │ 3日前            │ └──────────────┘ │
│                       └──────────────────┘                  │
│                                                             │
│  🌐 2階層先 (4)                       ▶ もっと見る          │
│  ┌──────────────────┐ ┌──────────────────┐ ...              │
│  │ パーセプトロン   │ │ 活性化関数       │                  │
│  │ ────────────     │ │ ────────────     │                  │
│  └──────────────────┘ └──────────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### カードコンポーネント

```
┌──────────────────────┐
│ 📄 ページタイトル    │  ← アイコン + タイトル
│ ──────────────────── │  ← 区切り線
│ 本文のプレビューテキ │  ← 最大2行、50文字
│ ストがここに表示...  │
│                      │
│ 🕐 3日前             │  ← 更新日時（相対表記）
└──────────────────────┘
```

### Ghost Link カード（存在しないページ）

```
┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐
│ 📝 未作成のリンク    │  ← 点線ボーダー
│ ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌ │
│                      │
│ クリックして         │
│ ページを作成         │
│                      │
└╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
```

---

## 技術設計

### データ取得 Hook

```typescript
// hooks/useLinkedPages.ts

export interface LinkedPagesData {
  outgoingLinks: PageCard[];     // このページからリンクしているページ
  backlinks: PageCard[];         // このページにリンクしているページ
  twoHopLinks: PageCard[];       // 2階層先のページ
  ghostLinks: string[];          // 存在しないリンク先
}

export interface PageCard {
  id: string;
  title: string;
  preview: string;              // 本文プレビュー（50文字）
  updatedAt: number;
  sourceUrl?: string;           // Webクリップの場合
}

export function useLinkedPages(pageId: string) {
  const { getRepository, userId, isLoaded } = useRepository();
  const { data: currentPage } = usePage(pageId);

  return useQuery({
    queryKey: [...pageKeys.all, "linkedPages", userId, pageId],
    queryFn: async (): Promise<LinkedPagesData> => {
      if (!currentPage) {
        return { outgoingLinks: [], backlinks: [], twoHopLinks: [], ghostLinks: [] };
      }

      const repo = await getRepository();

      // 1. 現在のページからWikiLinkを抽出
      const wikiLinks = extractWikiLinksFromContent(currentPage.content);
      const linkTitles = getUniqueWikiLinkTitles(wikiLinks);

      // 2. 全ページを取得してマッピング
      const allPages = await repo.getPages(userId);
      const pageByTitle = new Map(
        allPages.map(p => [p.title.toLowerCase().trim(), p])
      );
      const pageById = new Map(allPages.map(p => [p.id, p]));

      // 3. Outgoing Links（存在するページのみ）
      const outgoingLinks: PageCard[] = [];
      const ghostLinks: string[] = [];

      for (const title of linkTitles) {
        const targetPage = pageByTitle.get(title.toLowerCase().trim());
        if (targetPage && targetPage.id !== pageId) {
          outgoingLinks.push({
            id: targetPage.id,
            title: targetPage.title,
            preview: getContentPreview(targetPage.content, 50),
            updatedAt: targetPage.updatedAt,
            sourceUrl: targetPage.sourceUrl,
          });
        } else if (!targetPage) {
          ghostLinks.push(title);
        }
      }

      // 4. Backlinks（linksテーブルから取得）
      const backlinkIds = await repo.getBacklinks(pageId);
      const backlinks: PageCard[] = backlinkIds
        .map(id => pageById.get(id))
        .filter((p): p is Page => p !== undefined && !p.isDeleted)
        .map(p => ({
          id: p.id,
          title: p.title,
          preview: getContentPreview(p.content, 50),
          updatedAt: p.updatedAt,
          sourceUrl: p.sourceUrl,
        }));

      // 5. 2-hop Links（Outgoing Linksのページが持つOutgoing Links）
      const twoHopSet = new Set<string>();
      const twoHopLinks: PageCard[] = [];

      for (const outgoing of outgoingLinks) {
        const outgoingPage = pageById.get(outgoing.id);
        if (!outgoingPage) continue;

        const secondaryLinks = extractWikiLinksFromContent(outgoingPage.content);
        for (const link of secondaryLinks) {
          const targetPage = pageByTitle.get(link.title.toLowerCase().trim());
          if (
            targetPage &&
            targetPage.id !== pageId &&
            !twoHopSet.has(targetPage.id) &&
            !outgoingLinks.some(o => o.id === targetPage.id)
          ) {
            twoHopSet.add(targetPage.id);
            twoHopLinks.push({
              id: targetPage.id,
              title: targetPage.title,
              preview: getContentPreview(targetPage.content, 50),
              updatedAt: targetPage.updatedAt,
              sourceUrl: targetPage.sourceUrl,
            });
          }
        }
      }

      return {
        outgoingLinks: outgoingLinks.slice(0, 10),
        backlinks: backlinks.slice(0, 10),
        twoHopLinks: twoHopLinks.slice(0, 10),
        ghostLinks: ghostLinks.slice(0, 5),
      };
    },
    enabled: isLoaded && !!pageId && !!currentPage,
    staleTime: 1000 * 30, // 30秒
  });
}
```

### Repository への追加

```typescript
// lib/pageRepository.ts と localPageRepository.ts に追加

/**
 * Get pages that link to the specified page (backlinks)
 */
async getBacklinks(targetPageId: string): Promise<string[]> {
  const result = await this.client.execute({
    sql: `SELECT source_id FROM links WHERE target_id = ?`,
    args: [targetPageId],
  });

  return result.rows.map((row) => row.source_id as string);
}

/**
 * Get outgoing links from a page
 */
async getOutgoingLinks(sourcePageId: string): Promise<string[]> {
  const result = await this.client.execute({
    sql: `SELECT target_id FROM links WHERE source_id = ?`,
    args: [sourcePageId],
  });

  return result.rows.map((row) => row.target_id as string);
}
```

### UI コンポーネント

```typescript
// components/page/LinkedPagesSection.tsx

interface LinkedPagesSectionProps {
  pageId: string;
}

export function LinkedPagesSection({ pageId }: LinkedPagesSectionProps) {
  const { data, isLoading } = useLinkedPages(pageId);
  const navigate = useNavigate();

  if (isLoading) {
    return <LinkedPagesSkeleton />;
  }

  if (!data) return null;

  const { outgoingLinks, backlinks, twoHopLinks, ghostLinks } = data;
  const hasAnyLinks =
    outgoingLinks.length > 0 ||
    backlinks.length > 0 ||
    twoHopLinks.length > 0 ||
    ghostLinks.length > 0;

  if (!hasAnyLinks) return null;

  return (
    <div className="border-t pt-6 mt-6 space-y-6">
      {/* Outgoing Links */}
      {outgoingLinks.length > 0 && (
        <LinkSection
          title="リンク先"
          icon={<Link2 className="h-4 w-4" />}
          pages={outgoingLinks}
          onPageClick={(id) => navigate(`/page/${id}`)}
        />
      )}

      {/* Ghost Links */}
      {ghostLinks.length > 0 && (
        <GhostLinkSection
          title="未作成のリンク"
          links={ghostLinks}
        />
      )}

      {/* Backlinks */}
      {backlinks.length > 0 && (
        <LinkSection
          title="被リンク"
          icon={<ArrowLeft className="h-4 w-4" />}
          pages={backlinks}
          onPageClick={(id) => navigate(`/page/${id}`)}
        />
      )}

      {/* 2-hop Links */}
      {twoHopLinks.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <span>2階層先 ({twoHopLinks.length})</span>
            <ChevronDown className="h-4 w-4" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <LinkSection
              pages={twoHopLinks}
              onPageClick={(id) => navigate(`/page/${id}`)}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
```

### ページカードコンポーネント

```typescript
// components/page/PageLinkCard.tsx

interface PageLinkCardProps {
  page: PageCard;
  onClick: () => void;
}

export function PageLinkCard({ page, onClick }: PageLinkCardProps) {
  return (
    <Card
      className="cursor-pointer hover:bg-accent transition-colors"
      onClick={onClick}
    >
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {page.sourceUrl ? (
            <LinkIcon className="h-3 w-3 text-muted-foreground" />
          ) : (
            <FileText className="h-3 w-3 text-muted-foreground" />
          )}
          <span className="truncate">{page.title || "無題のページ"}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <p className="text-xs text-muted-foreground line-clamp-2">
          {page.preview || "内容がありません"}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {formatTimeAgo(page.updatedAt)}
        </p>
      </CardContent>
    </Card>
  );
}
```

---

## ファイル構成

```
src/
├── components/
│   └── page/
│       ├── LinkedPagesSection.tsx    # メインセクション（新規）
│       ├── PageLinkCard.tsx          # ページカード（新規）
│       ├── GhostLinkCard.tsx         # Ghost Link カード（新規）
│       └── LinkSection.tsx           # セクションコンポーネント（新規）
├── hooks/
│   └── useLinkedPages.ts             # リンク取得フック（新規）
└── lib/
    ├── pageRepository.ts             # getBacklinks 追加（修正）
    └── localPageRepository.ts        # getBacklinks 追加（修正）
```

---

## 実装ステップ

| Step | 内容                                               | 見積もり |
| :--- | :------------------------------------------------- | :------- |
| 1    | Repository に getBacklinks メソッド追加            | 1 時間   |
| 2    | useLinkedPages フックの実装                        | 2 時間   |
| 3    | PageLinkCard コンポーネントの実装                  | 1 時間   |
| 4    | GhostLinkCard コンポーネントの実装                 | 30 分    |
| 5    | LinkSection コンポーネントの実装                   | 1 時間   |
| 6    | LinkedPagesSection の実装                          | 1.5 時間 |
| 7    | 2-hop Links の取得ロジック実装                     | 1.5 時間 |
| 8    | PageEditorView への統合                            | 30 分    |
| 9    | レスポンシブ対応とスタイリング                     | 1 時間   |
| 10   | テストと調整                                       | 1 時間   |

**合計見積もり: 約 11 時間**

---

## 考慮事項

### パフォーマンス

| 懸念事項                    | 対策                                                     |
| :-------------------------- | :------------------------------------------------------- |
| 大量のページがある場合      | 各セクション最大 10 件に制限、staleTime を設定           |
| 2-hop Links の計算コスト    | 遅延ロード（Collapsible で展開時に取得）                 |
| リンク変更時のキャッシュ    | ページ保存時に関連クエリを invalidate                    |

### エッジケース

| ケース                     | 対応                                           |
| :------------------------- | :--------------------------------------------- |
| 自分自身へのリンク         | 表示から除外                                   |
| 削除されたページへのリンク | Ghost Link として扱う                          |
| 循環リンク                 | 重複排除で対応                                 |
| リンクが大量にある場合     | 「もっと見る」で展開表示                       |

---

## 将来の拡張

1. **グラフビジュアライゼーション**: リンク関係をグラフで可視化
2. **リンク強度表示**: 双方向リンクを強調表示
3. **リンク提案**: AIがリンク候補を提案
4. **バックリンクコンテキスト**: リンク元の文脈（前後の文章）を表示

---

## 関連ドキュメント

- [PRD: 2.4 リンク機能 - Backlinks & 2-hop Links](../PRD.md#24-リンク機能)
- [PRD: 2.2 Ghost Link System](../PRD.md#ghost-link-system)
