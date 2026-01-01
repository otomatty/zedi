# 作業ログ: Linked Pages Cards 実装

| 項目           | 内容                                       |
| :------------- | :----------------------------------------- |
| **日付**       | 2026 年 1 月 1 日                          |
| **機能**       | Linked Pages Cards（リンクカード表示）     |
| **Phase**      | Phase 4                                    |
| **ステータス** | ✅ 完了                                    |

---

## 概要

ページ下部に、そのページからリンクしているページ（Outgoing Links）、逆にリンクされているページ（Backlinks）、2階層先のページ（2-hop Links）、未作成のリンク（Ghost Links）をカード形式で表示する機能を実装しました。

また、この機能に対する統合テスト（Vitest + React Testing Library）とE2Eテスト（Playwright）も合わせて実装しました。

---

## 実装内容

### 新規作成ファイル

#### 機能実装

| ファイル                                      | 役割                                                   |
| :-------------------------------------------- | :----------------------------------------------------- |
| `src/hooks/useLinkedPages.ts`                 | リンクデータ取得フック（計算ロジック含む）             |
| `src/components/page/LinkedPagesSection.tsx`  | リンクカードセクション（メインコンポーネント）         |
| `src/components/page/PageLinkCard.tsx`        | 個別ページカードコンポーネント                         |
| `src/components/page/GhostLinkCard.tsx`       | Ghost Link（新しいリンク）カード                       |
| `src/components/page/LinkSection.tsx`         | リンクセクションコンポーネント                         |
| `src/components/page/LinkGroupRow.tsx`        | 2階層リンクの横並び表示コンポーネント（新規追加）      |

#### テスト環境

| ファイル                     | 役割                                    |
| :--------------------------- | :-------------------------------------- |
| `src/test/setup.ts`          | Vitestセットアップ（モック設定）        |
| `src/test/testDatabase.ts`   | sql.js インメモリDB用テストユーティリティ |
| `src/test/testWrapper.tsx`   | React Query / Router用テストラッパー    |
| `src/test/mocks.ts`          | モック関数群                            |
| `playwright.config.ts`       | Playwright設定                          |

#### テストファイル

| ファイル                                             | テスト数 | 内容                                           |
| :--------------------------------------------------- | :------- | :--------------------------------------------- |
| `src/hooks/useLinkedPages.test.ts`                   | 21       | 計算ロジックテスト（Outgoing/Backlinks/2-hop/Ghost/グループ化） |
| `src/components/page/PageLinkCard.test.tsx`          | 7        | カードコンポーネントの表示・動作テスト         |
| `src/components/page/GhostLinkCard.test.tsx`         | 4        | Ghost Linkカードのテスト                       |
| `src/components/page/LinkedPagesSection.test.tsx`    | 9        | 統合テスト（各セクションの表示・ナビゲーション・グループ表示）|
| `e2e/linked-pages.spec.ts`                           | 6        | E2Eテスト（ブラウザ上での操作）                |

### 修正ファイル

| ファイル                                   | 変更内容                                      |
| :----------------------------------------- | :-------------------------------------------- |
| `src/hooks/usePageQueries.ts`              | `useRepository` をエクスポート                |
| `src/components/editor/PageEditorView.tsx` | `LinkedPagesSection` をエディタ下部に統合     |
| `vite.config.ts`                           | Vitest設定を統合（`vitest.config.ts` を削除） |
| `package.json`                             | テストスクリプト追加                          |

### 追加パッケージ

```bash
# 統合テスト用
bun add -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom @vitejs/plugin-react happy-dom

# E2Eテスト用
bun add -D @playwright/test
```

---

## 機能詳細

### 1. リンクカードセクション

ページエディタ下部に以下のセクションを表示：

| セクション             | アイコン | 内容                                                       |
| :--------------------- | :------- | :--------------------------------------------------------- |
| **2階層リンクグループ** | 🔗       | 2階層先がある場合、左にリンク元カード、右に子ページを横並び |
| **リンク**             | 🔗       | リンク先（子なし）と被リンクを統合したセクション           |
| **新しいリンク**       | 📝       | 存在しないリンク先（クリックでページ作成）                 |

### 2. カード表示内容

- ページタイトル
- 本文プレビュー（最大50文字）
- 更新日時（相対表記：「3日前」など）
- Webクリップページは🔗アイコンで区別

### 3. Ghost Link（新しいリンク）

- 点線ボーダーで未作成リンクを表示
- クリックするとそのタイトルで新規ページを作成
- ラベルを「未作成のリンク」から「新しいリンク」に変更

### 4. 2階層リンクグループ表示

- 2階層先のリンクがあるページは特別なレイアウトで表示
- 左側にリンク元ページのカード（アイコン付きのヘッダースタイル）
- 右側にその先のページ（子ページ）をカードとして横並びで表示
- 各リンク元につき最大5件の子ページを表示

### 5. リンク統合

- 「リンク先」と「被リンク」を「リンク」として1つのセクションに統合
- 2階層先があるリンクは「リンク」セクションから除外され、グループ表示に移動

---

## テスト

### テストコマンド

```bash
# 統合テスト
bun run test:run      # 全テスト実行
bun run test          # ウォッチモード
bun run test:coverage # カバレッジ付き

# E2Eテスト
bun run test:e2e         # ヘッドレス実行
bun run test:e2e:headed  # ブラウザ表示
bun run test:e2e:ui      # UIモード
```

### テスト結果

| テスト種別      | ファイル数 | テスト数 | 結果      |
| :-------------- | :--------- | :------- | :-------- |
| 統合テスト      | 4          | 41       | ✅ 全パス |
| E2Eテスト       | 1          | 6        | ✅ 全パス |

### テストカバレッジ

#### `useLinkedPages.test.ts` (20テスト)

- Outgoing Links の抽出
- 自己リンクの除外
- 大文字小文字を区別しないマッチング
- 件数制限（最大10件）
- Ghost Links の識別
- Backlinks の取得
- 削除済みページの除外
- 2-hop Links の計算
- 重複排除
- 循環リンクの処理
- エッジケース（空コンテンツ、リンクなし）

#### `LinkedPagesSection.test.tsx` (10テスト)

- リンクがない場合は非表示
- 各セクションの条件付き表示
- カードクリック時のナビゲーション
- Ghost Linkクリック時のページ作成
- 2階層先の折りたたみ動作

---

## 技術的な課題と解決策

### 1. VitestとViteの型競合

**問題**: `@vitejs/plugin-react` と Vitest 内部の Vite で型が競合

**解決策**: `vitest.config.ts` を削除し、Vitest設定を `vite.config.ts` に統合

```typescript
/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  // ... plugins, resolve ...
  test: {
    globals: true,
    environment: "jsdom",
    // ...
  },
}));
```

### 2. useLinkedPagesのテスト容易性

**問題**: フックが `useRepository` と `usePage` に依存しており、直接テストが困難

**解決策**: 計算ロジックを純粋関数 `calculateLinkedPages` として抽出し、独立してテスト可能に

```typescript
// 純粋関数として抽出
export function calculateLinkedPages(input: CalculateLinkedPagesInput): LinkedPagesData {
  // 計算ロジック
}

// フックは関数を呼び出すだけ
export function useLinkedPages(pageId: string) {
  // ...
  return useQuery({
    queryFn: async () => {
      // データ取得
      return calculateLinkedPages({ ... });
    },
  });
}
```

### 3. E2EテストでのWikiLink入力

**問題**: WikiLinkはTiptap拡張機能として実装されており、単純なテキスト入力では認識されない

**解決策**: `[[` を入力してサジェストをトリガーし、Enter で選択する操作をシミュレート

```typescript
await page.keyboard.type("[[");
await page.waitForTimeout(500);
await page.keyboard.type("Page Title");
await page.keyboard.press("Enter");
```

---

## 今後の拡張可能性

1. **グラフビジュアライゼーション**: リンク関係をグラフで可視化
2. **リンク強度表示**: 双方向リンクを強調表示
3. **リンク提案**: AIがリンク候補を提案
4. **バックリンクコンテキスト**: リンク元の文脈（前後の文章）を表示

---

## 関連ドキュメント

- [実装計画書: Linked Pages Cards](../../plans/20260101/linked-pages-cards.md)
- [PRD: 2.4 リンク機能 - Backlinks & 2-hop Links](../../PRD.md)
