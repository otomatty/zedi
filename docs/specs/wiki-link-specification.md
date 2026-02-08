# WikiLink 機能仕様書

## 概要

Zedi の WikiLink 機能は、ページ間の双方向リンクを実現するための機能です。Notion の`[[ページ名]]`記法や Roam の双方向リンクに似た体験を提供します。

## リンクの種類

WikiLink は 3 つの状態を持ちます：

| 状態               | `exists` | `referenced` | 説明                                                 | 外観                 |
| ------------------ | -------- | ------------ | ---------------------------------------------------- | -------------------- |
| **通常リンク**     | `true`   | -            | リンク先のページが存在する                           | ターコイズ色（実線） |
| **参照リンク**     | `false`  | `true`       | ページは存在しないが、複数のページから参照されている | 青色（点線）         |
| **ゴーストリンク** | `false`  | `false`      | ページは存在せず、このページからのみ参照されている   | オレンジ色（点線）   |

### 色の定義（CSS 変数）

```css
/* ダークテーマ */
--link-color: 175 50% 60%; /* 通常リンク: ターコイズ */
--link-referenced: 200 70% 60%; /* 参照リンク: 青 */
--link-ghost: 35 80% 60%; /* ゴーストリンク: オレンジ */

/* ライトテーマ */
--link-color: 175 60% 40%;
--link-referenced: 200 65% 50%;
--link-ghost: 35 70% 50%;
```

## データベース構造

### links テーブル

実際に存在するページ間のリンクを管理します。

```sql
CREATE TABLE links (
    source_id TEXT NOT NULL,     -- リンク元ページID
    target_id TEXT NOT NULL,     -- リンク先ページID
    created_at INTEGER NOT NULL,
    PRIMARY KEY (source_id, target_id)
);
```

### ghost_links テーブル

まだ存在しないページへのリンクを追跡します。共有ノートからコピーしたページ内で「元のノート内の他ページ」へのリンクをゴースト化した場合、元参照先を保持する拡張カラムを持ちます（新設計では UUID に統一。詳細は `docs/specs/zedi-data-structure-spec.md` §2.7, §3.4）。

```sql
CREATE TABLE ghost_links (
    link_text TEXT NOT NULL,                  -- リンクテキスト（例: "Concept X"）
    source_page_id TEXT NOT NULL,             -- 使用しているページID（新設計では UUID）
    created_at INTEGER NOT NULL,
    original_target_page_id TEXT NULL,        -- 【拡張】共有ノート由来のゴーストのみ。元のリンク先ページID（新設計では UUID）
    original_note_id TEXT NULL,               -- 【拡張】共有ノート由来のゴーストのみ。元のノートID（新設計では UUID）
    PRIMARY KEY (link_text, source_page_id)
);
```

- 通常のゴースト（手書きの未解決リンク）では `original_target_page_id` と `original_note_id` は NULL。
- 両方が非 NULL のとき、クリック時に「新規作成」か「元の共有ノートのページをコピー」を選択する UX で利用する。

## リンクの作成

### 入力方法

1. エディタで `[[` と入力
2. サジェストポップアップが表示される
3. 既存ページを選択するか、新しいタイトルを入力
4. `]]` で確定、または選択肢をクリック

### サジェストポップアップ

- 既存ページのタイトルで絞り込み検索
- 入力したテキストが既存ページにない場合、「新規作成」オプションが表示される
- キーボード操作（↑↓ で選択、Enter で確定、Esc でキャンセル）

## リンクのクリック動作

### 通常リンク（exists=true）

- クリックするとリンク先ページに遷移

### ゴーストリンク / 参照リンク（exists=false）

1. 確認ダイアログが表示される：「ページを作成しますか？」
2. 「作成する」を選択した場合のみ：
   - 新しいページが作成される
   - 作成されたページに遷移
3. 「キャンセル」を選択した場合：
   - 何も起こらない

## ステータスの自動更新

### ページ読み込み時

ページを開いた際に、そのページ内のすべての WikiLink のステータスが自動的に更新されます：

1. リンク先ページの存在チェック → `exists`属性を更新
2. 他ページからの参照チェック → `referenced`属性を更新

### ページ保存時

ページを保存する際に、リンク情報がデータベースに同期されます：

1. 存在するページへのリンク → `links`テーブルに追加
2. 存在しないページへのリンク → `ghost_links`テーブルに追加

## 技術的実装

### Tiptap エクステンション

WikiLink は Tiptap の Mark（マーク）として実装されています。

```typescript
// 属性
- title: string      // リンク先ページのタイトル
- exists: boolean    // ページが存在するか
- referenced: boolean // 他のページから参照されているか

// CSSクラス
- .wiki-link           // 通常リンク
- .wiki-link-referenced // 参照リンク
- .wiki-link-ghost     // ゴーストリンク
```

### HTML 出力

```html
<span
  data-wiki-link
  data-title="ページ名"
  data-exists="true"
  data-referenced="false"
  class="wiki-link"
>
  [[ページ名]]
</span>
```

### 関連ファイル

- `src/components/editor/extensions/WikiLinkExtension.ts` - Tiptap Mark エクステンション
- `src/components/editor/extensions/wikiLinkSuggestionPlugin.ts` - サジェストプラグイン
- `src/components/editor/extensions/WikiLinkSuggestion.tsx` - サジェスト UI
- `src/lib/wikiLinkUtils.ts` - ユーティリティ関数
- `src/hooks/usePageQueries.ts` - `useSyncWikiLinks`, `useWikiLinkExistsChecker`

## 制限事項・注意点

1. **自動ページ作成なし**: 複数のページから参照されていても、ページは自動作成されません。ユーザーが明示的にクリックして作成する必要があります。

2. **大文字小文字の区別**: タイトルの比較は大文字小文字を区別しません（正規化されます）。

3. **リンクの一意性**: 同じソースページから同じターゲットへのリンクは 1 つだけ保存されます。

## 今後の拡張予定

- バックリンク（逆リンク）の表示パネル
- リンクグラフの可視化
- 孤立ページ（リンクされていないページ）の検出
