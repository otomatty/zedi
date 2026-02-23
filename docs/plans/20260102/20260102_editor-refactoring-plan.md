# エディター周りのリファクタリング計画

**日付**: 2026-01-02
**ステータス**: 計画中

## 概要

エディター関連のコード（`TiptapEditor.tsx` 720行、`PageEditorView.tsx` 836行）が複雑化しているため、責務分離とファイル分割によるリファクタリングを行う。

## 基本方針

### 1. コロケーション（Colocation）の原則

コンポーネント固有のロジックは、そのコンポーネントのディレクトリ内に配置する。

```
src/components/editor/PageEditor/
├── index.tsx                 # メインコンポーネント
├── usePageEditorState.ts     # このコンポーネント専用のフック
├── PageEditorHeader.tsx      # サブコンポーネント
└── types.ts                  # このコンポーネント専用の型
```

**配置ルール**:

- **コンポーネントディレクトリ内**: そのコンポーネントでのみ使用されるロジック
- **`src/hooks/`**: 複数のコンポーネントで共有されるフック
- **`src/lib/`**: 複数の場所で使用されるユーティリティ
- **`src/types/`**: アプリ全体で共有される型定義

### 2. テストファースト

リファクタリング前に既存動作を保証するテストを作成する。

```
Phase 0: テスト作成（ガードレール）
    ↓
Phase 1: 重複・無駄な処理の調査と修正
    ↓
Phase 2: カスタムフック抽出
    ↓
Phase 3: コンポーネント分割
```

### 3. 重複・無駄な処理の優先調査

リファクタリング前に既存コードの問題点を特定し、影響度を評価してから修正する。

## 現状分析

### 問題点

#### TiptapEditor.tsx (720行)

| 行数    | 責務                   | 問題                           |
| ------- | ---------------------- | ------------------------------ |
| 79-189  | WikiLinkナビゲーション | ページ検索、作成確認ダイアログ |
| 191-246 | コンテンツサニタイズ   | エラーメッセージ構築を含む     |
| 248-339 | エディター初期化       | 拡張設定、イベントハンドラー   |
| 341-401 | コンテンツ更新         | サニタイズ + エラー報告        |
| 403-545 | WikiLinkステータス更新 | DB照会、マーク属性更新         |
| 547-564 | サジェスト位置計算     | UI位置計算                     |
| 566-636 | 選択・Mermaid処理      | テキスト選択、Mermaid挿入      |
| 638-716 | JSX                    | 複数のポップアップ、ダイアログ |

**問題**: 1つのコンポーネントに6つ以上の独立した責務が混在

#### PageEditorView.tsx (836行)

| 行数    | 責務                 | 問題                     |
| ------- | -------------------- | ------------------------ |
| 76-155  | 状態定義             | 15個以上のuseState       |
| 157-218 | ページライフサイクル | 作成、読み込み、エラー   |
| 220-278 | 保存ロジック         | debounce、WikiLink同期   |
| 280-331 | Wiki生成連携         | useWikiGeneratorとの連携 |
| 302-386 | イベントハンドラー   | 多数のコールバック       |
| 388-528 | 削除・ナビゲーション | 複雑な条件分岐           |
| 530-555 | ローディング表示     | 2種類のローディング      |
| 557-831 | JSX                  | 280行のレンダリング      |

**問題**: 状態管理とUIが密結合、テストが困難

---

## リファクタリング方針

### Phase 1: カスタムフック抽出

ビジネスロジックをカスタムフックに分離し、コンポーネントをシンプルに保つ。

#### 1.1 usePageEditorState

**ファイル**: `src/hooks/usePageEditorState.ts`

**責務**: ページ編集の状態管理とライフサイクル

```typescript
interface UsePageEditorStateReturn {
  // 状態
  title: string;
  content: string;
  sourceUrl: string | undefined;
  currentPageId: string | null;
  lastSaved: number | null;
  isInitialized: boolean;
  isLoading: boolean;

  // アクション
  setTitle: (title: string) => void;
  setContent: (content: string) => void;
  initialize: (page: Page) => void;
  reset: () => void;
}

export function usePageEditorState(pageId: string): UsePageEditorStateReturn;
```

**抽出元**: `PageEditorView.tsx` 91-140行、194-207行

#### 1.2 useEditorAutoSave

**ファイル**: `src/hooks/useEditorAutoSave.ts`

**責務**: debounce保存とWikiLink同期

```typescript
interface UseEditorAutoSaveOptions {
  pageId: string | null;
  debounceMs?: number;
  shouldBlockSave?: boolean;
}

interface UseEditorAutoSaveReturn {
  saveChanges: (title: string, content: string) => void;
  lastSaved: number | null;
  isSaving: boolean;
}

export function useEditorAutoSave(options: UseEditorAutoSaveOptions): UseEditorAutoSaveReturn;
```

**抽出元**: `PageEditorView.tsx` 220-278行

#### 1.3 useWikiLinkNavigation

**ファイル**: `src/hooks/useWikiLinkNavigation.ts`

**責務**: WikiLinkクリック時のページナビゲーション

```typescript
interface UseWikiLinkNavigationReturn {
  handleLinkClick: (title: string, exists: boolean) => void;
  createPageDialogOpen: boolean;
  pendingCreatePageTitle: string | null;
  handleConfirmCreate: () => Promise<void>;
  handleCancelCreate: () => void;
}

export function useWikiLinkNavigation(): UseWikiLinkNavigationReturn;
```

**抽出元**: `TiptapEditor.tsx` 79-189行

#### 1.4 useWikiLinkStatusSync

**ファイル**: `src/hooks/useWikiLinkStatusSync.ts`

**責務**: WikiLinkのexists/referenced属性の同期

```typescript
interface UseWikiLinkStatusSyncOptions {
  editor: Editor | null;
  content: string;
  pageId: string | undefined;
  onChange: (content: string) => void;
}

export function useWikiLinkStatusSync(options: UseWikiLinkStatusSyncOptions): void;
```

**抽出元**: `TiptapEditor.tsx` 403-545行

#### 1.5 useContentSanitizer

**ファイル**: `src/hooks/useContentSanitizer.ts`

**責務**: コンテンツのサニタイズとエラー報告

```typescript
interface UseContentSanitizerReturn {
  sanitizedContent: string | null;
  parseError: ContentError | null;
  sanitize: (content: string) => string;
}

export function useContentSanitizer(
  content: string,
  onError?: (error: ContentError | null) => void,
): UseContentSanitizerReturn;
```

**抽出元**: `TiptapEditor.tsx` 191-246行、348-401行

#### 1.6 useEditorSelectionMenu

**ファイル**: `src/hooks/useEditorSelectionMenu.ts`

**責務**: テキスト選択時のフローティングメニュー

```typescript
interface UseEditorSelectionMenuReturn {
  showMenu: boolean;
  menuPosition: { top: number; left: number } | null;
  selectedText: string;
  handleOpenMermaidDialog: () => void;
}

export function useEditorSelectionMenu(
  editor: Editor | null,
  containerRef: React.RefObject<HTMLDivElement>,
): UseEditorSelectionMenuReturn;
```

**抽出元**: `TiptapEditor.tsx` 317-338行、618-636行

---

### Phase 2: コンポーネント分割

UIを責務ごとに分割し、再利用性を高める。

#### 2.1 ディレクトリ構造（コロケーション原則）

```
src/components/editor/
├── PageEditor/
│   ├── index.tsx                    # メインコンポーネント (エントリーポイント)
│   ├── PageEditorHeader.tsx         # ヘッダー (タイトル入力、アクションボタン)
│   ├── PageEditorAlerts.tsx         # 警告バナー群
│   ├── PageEditorDialogs.tsx        # ダイアログ群
│   ├── usePageEditorState.ts        # ★ コロケーション: ページ状態管理
│   ├── useEditorAutoSave.ts         # ★ コロケーション: 保存ロジック
│   ├── types.ts                     # ★ コロケーション: 型定義
│   └── __tests__/
│       ├── PageEditor.test.tsx      # 統合テスト (vitest)
│       └── usePageEditorState.test.ts
│
├── TiptapEditor/
│   ├── index.tsx                    # メインエディターコンポーネント
│   ├── EditorSelectionMenu.tsx      # 選択時メニュー
│   ├── WikiLinkSuggestionPopup.tsx  # サジェストポップアップ
│   ├── CreatePageDialog.tsx         # ページ作成確認ダイアログ
│   ├── editorConfig.ts              # ★ コロケーション: 拡張設定
│   ├── useWikiLinkNavigation.ts     # ★ コロケーション: WikiLinkナビゲーション
│   ├── useWikiLinkStatusSync.ts     # ★ コロケーション: ステータス同期
│   ├── useContentSanitizer.ts       # ★ コロケーション: サニタイズ
│   ├── useEditorSelectionMenu.ts    # ★ コロケーション: 選択メニュー
│   ├── types.ts                     # ★ コロケーション: 型定義
│   └── __tests__/
│       ├── TiptapEditor.test.tsx    # 統合テスト (vitest)
│       └── useWikiLinkNavigation.test.ts
│
├── extensions/                       # 既存のまま（共通拡張）
│   ├── MermaidExtension.ts
│   ├── WikiLinkExtension.ts
│   ├── WikiLinkSuggestion.tsx
│   └── wikiLinkSuggestionPlugin.ts
│
├── MermaidGeneratorDialog.tsx        # 既存のまま
├── MermaidNodeView.tsx               # 既存のまま
├── SourceUrlBadge.tsx                # 既存のまま
├── WebClipperDialog.tsx              # 既存のまま
└── WikiGeneratorButton.tsx           # 既存のまま

e2e/
├── page-editor.spec.ts               # E2Eテスト (playwright)
└── wiki-link.spec.ts                 # WikiLink機能のE2Eテスト
```

**配置の判断基準**:

- `usePageEditorState.ts` → PageEditor専用 → PageEditor/内
- `useWikiLinkNavigation.ts` → TiptapEditor専用 → TiptapEditor/内
- `extensions/` → 複数コンポーネントで共有 → 共通ディレクトリ
- `sanitizeTiptapContent()` → lib/contentUtils.ts に既存（複数箇所で使用される可能性）

#### 2.2 PageEditorHeader

**ファイル**: `src/components/editor/PageEditor/PageEditorHeader.tsx`

```tsx
interface PageEditorHeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  onBack: () => void;
  onGenerateWiki: () => void;
  onOpenWebClipper: () => void;
  onExportMarkdown: () => void;
  onCopyMarkdown: () => void;
  onDelete: () => void;
  lastSaved: number | null;
  hasContent: boolean;
  wikiStatus: WikiStatus;
  errorMessage?: string;
}
```

**抽出元**: `PageEditorView.tsx` 559-645行

#### 2.3 PageEditorAlerts

**ファイル**: `src/components/editor/PageEditor/PageEditorAlerts.tsx`

```tsx
interface PageEditorAlertsProps {
  duplicatePage: Page | null;
  isTitleEmpty: boolean;
  isNewPage: boolean;
  title: string;
  errorMessage: string | null;
  onOpenDuplicatePage: () => void;

  isWikiGenerating: boolean;
  wikiTitle: string;
  onCancelWiki: () => void;

  contentError: ContentError | null;
}
```

**抽出元**: `PageEditorView.tsx` 647-744行

#### 2.4 editorConfig.ts

**ファイル**: `src/components/editor/TiptapEditor/editorConfig.ts`

```typescript
import StarterKit from "@tiptap/starter-kit";
// ... other imports

export function createEditorExtensions(options: {
  placeholder: string;
  onLinkClick: (title: string, exists: boolean) => void;
  onStateChange: (state: WikiLinkSuggestionState) => void;
}) {
  return [
    StarterKit.configure({ ... }),
    Typography,
    Placeholder.configure({ ... }),
    Link.configure({ ... }),
    WikiLink.configure({ onLinkClick: options.onLinkClick }),
    WikiLinkSuggestionPlugin.configure({ onStateChange: options.onStateChange }),
    Mermaid,
  ];
}
```

**抽出元**: `TiptapEditor.tsx` 248-277行

---

### Phase 3: 型定義の整理

#### 3.1 共通型の分離

**ファイル**: `src/types/editor.ts`

```typescript
export interface ContentError {
  message: string;
  removedNodeTypes: string[];
  removedMarkTypes: string[];
  wasSanitized: boolean;
}

export type WikiStatus = "idle" | "generating" | "completed" | "error";

export interface EditorPosition {
  top: number;
  left: number;
}
```

---

## 実装順序

### Phase 0: テスト作成（ガードレール）【最優先】

リファクタリング前に既存動作を保証するテストを作成する。

#### 0.1 E2Eテスト (Playwright) ✅ 作成済み

**ファイル**: `e2e/page-editor.spec.ts` (14テスト)

- Page Creation: 2テスト
- Title Editing: 3テスト
- Content Editing: 3テスト
- Wiki Generator: 2テスト
- Navigation: 2テスト
- Page Actions Menu: 2テスト
- Keyboard Shortcuts: 1テスト
- Linked Pages Section: 1テスト

**ファイル**: `e2e/linked-pages.spec.ts` (既存・6テスト)

#### 0.2 統合テスト (Vitest) ✅ 作成済み

**ファイル**: `src/lib/contentUtils.test.ts` (22テスト)

- sanitizeTiptapContent: 9テスト
- validateTiptapContent: 3テスト
- extractPlainText: 4テスト
- getContentPreview: 2テスト
- generateAutoTitle: 3テスト

**次に作成が必要**:

- `src/components/editor/__tests__/TiptapEditor.integration.test.tsx`
- `src/components/editor/__tests__/PageEditor.integration.test.tsx`

### Phase 1: 重複・無駄な処理の調査と修正

#### 1.1 調査結果 ✅

| 問題                                        | 場所                                             | 影響度  | 詳細                                                                                                     |
| ------------------------------------------- | ------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------- |
| **sanitizeTiptapContent重複呼び出し**       | TiptapEditor.tsx 200行, 352行                    | 🔴 高   | コンポーネント本体とuseEffect内で同じ処理が2回実行される。再レンダリング時に無駄なサニタイズ処理が発生。 |
| **buildContentErrorMessage関数の再作成**    | TiptapEditor.tsx 231-246行                       | 🟡 中   | レンダリングごとに新しい関数インスタンスが作成される。useCallbackまたはコンポーネント外に移動すべき。    |
| **大量のデバッグログ**                      | TiptapEditor.tsx 417-539行                       | 🟡 中   | 22箇所のconsole.log/group。本番ビルドでは不要。環境変数でON/OFF切り替え、または削除。                    |
| **extractWikiLinksFromContent重複呼び出し** | PageEditorView.tsx 227行, TiptapEditor.tsx 415行 | 🟠 中低 | 保存時とステータス更新時に同じコンテンツからWikiLinkを2回抽出。ただし異なるタイミングなので許容範囲。    |

#### 1.2 修正計画

**優先度: 高**

1. [ ] `sanitizeTiptapContent`の重複呼び出しを解消
   - コンポーネント本体での呼び出しを削除
   - useEffect内でのみサニタイズを実行
   - 初期コンテンツはuseEditorの`content`に直接渡さず、useEffect経由で設定

2. [ ] `buildContentErrorMessage`をコンポーネント外に移動
   - `src/lib/contentUtils.ts` に移動（sanitizeTiptapContentと同じ場所）

**優先度: 中** 3. [ ] デバッグログの整理

- 開発時のみログを出力するユーティリティ関数を作成
- または `import.meta.env.DEV` で条件分岐

**優先度: 低** 4. [ ] extractWikiLinksFromContentの呼び出しは現状維持

- 異なるタイミング（保存時 vs ステータス更新時）での呼び出しのため、重複ではない

### Phase 2: カスタムフック抽出（コロケーション）

1. [ ] `TiptapEditor/useContentSanitizer.ts` - サニタイズロジック
2. [ ] `TiptapEditor/useWikiLinkNavigation.ts` - ナビゲーションロジック
3. [ ] `TiptapEditor/useWikiLinkStatusSync.ts` - ステータス同期
4. [ ] `TiptapEditor/useEditorSelectionMenu.ts` - 選択メニュー
5. [ ] `PageEditor/usePageEditorState.ts` - 状態管理
6. [ ] `PageEditor/useEditorAutoSave.ts` - 保存ロジック

### Phase 3: コンポーネント分割

1. [ ] `TiptapEditor/editorConfig.ts` - 拡張設定抽出
2. [ ] `TiptapEditor/types.ts` - 型定義抽出
3. [ ] `TiptapEditor/EditorSelectionMenu.tsx` - 選択メニュー
4. [ ] `TiptapEditor/CreatePageDialog.tsx` - ページ作成ダイアログ
5. [ ] `TiptapEditor/index.tsx` - 統合・シンプル化
6. [ ] `PageEditor/types.ts` - 型定義抽出
7. [ ] `PageEditor/PageEditorHeader.tsx` - ヘッダー抽出
8. [ ] `PageEditor/PageEditorAlerts.tsx` - 警告バナー抽出
9. [ ] `PageEditor/PageEditorDialogs.tsx` - ダイアログ抽出
10. [ ] `PageEditor/index.tsx` - 統合・シンプル化

### Phase 4: テスト拡充

1. [ ] 抽出したフックの単体テスト追加
2. [ ] コンポーネントの単体テスト追加
3. [ ] E2Eテストの拡充

---

## 期待される効果

### Before

| ファイル           | 行数      | 責務数  |
| ------------------ | --------- | ------- |
| TiptapEditor.tsx   | 720       | 6+      |
| PageEditorView.tsx | 836       | 7+      |
| **合計**           | **1,556** | **13+** |

### After（予想）

| ファイル                  | 行数       | 責務数                  |
| ------------------------- | ---------- | ----------------------- |
| PageEditor/index.tsx      | ~150       | 1 (統合)                |
| PageEditorHeader.tsx      | ~100       | 1                       |
| PageEditorAlerts.tsx      | ~80        | 1                       |
| PageEditorDialogs.tsx     | ~80        | 1                       |
| TiptapEditor/index.tsx    | ~200       | 1 (統合)                |
| EditorCore.tsx            | ~100       | 1                       |
| EditorSelectionMenu.tsx   | ~50        | 1                       |
| usePageEditorState.ts     | ~80        | 1                       |
| useEditorAutoSave.ts      | ~60        | 1                       |
| useWikiLinkNavigation.ts  | ~80        | 1                       |
| useWikiLinkStatusSync.ts  | ~100       | 1                       |
| useContentSanitizer.ts    | ~50        | 1                       |
| useEditorSelectionMenu.ts | ~40        | 1                       |
| editorConfig.ts           | ~40        | 1                       |
| types/editor.ts           | ~30        | 1                       |
| **合計**                  | **~1,240** | **15 (1責務/ファイル)** |

### メリット

1. **可読性向上**: 1ファイル100-200行で把握しやすい
2. **テスト容易性**: フックごとに単体テスト可能
3. **再利用性**: 他の場所でフックやコンポーネントを再利用可能
4. **保守性向上**: 変更の影響範囲が明確
5. **並行開発**: 複数人で別ファイルを同時編集可能

---

## 注意事項

1. **段階的に進める**: 一度に全てを変更せず、ステップごとに動作確認
2. **既存動作を維持**: リファクタリング中は機能追加しない
3. **テスト追加**: 各ステップでテストを追加してリグレッション防止
4. **コミット単位**: 各ステップを個別コミットとして記録

---

## 参考

- 既存の作業ログ: `docs/work-logs/20260102/tiptap-content-error-handling.md`
- Tiptap公式ドキュメント: https://tiptap.dev/
