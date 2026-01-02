# エディター周りリファクタリング - Phase 1, 2, 3 作業ログ

**日付**: 2026-01-02
**ステータス**: 完了
**関連計画**: `docs/plans/20260102/20260102_editor-refactoring-plan.md`

## 概要

エディター関連のコード（`TiptapEditor.tsx` 720行、`PageEditorView.tsx` 836行）のリファクタリングを実施。Phase 1（重複・無駄な処理の修正）、Phase 2（カスタムフック抽出）、Phase 3（コンポーネント分割）を完了。

**最終結果**:
- `TiptapEditor.tsx`: 720行 → 327行（約55%削減）
- `PageEditorView.tsx`: 836行 → 610行（約27%削減）

## 完了した作業

### Phase 1: 重複・無駄な処理の修正 ✅

#### 1.1 sanitizeTiptapContentの重複呼び出しを解消

**問題**: `TiptapEditor.tsx`で、コンポーネント本体（200行目）とuseEffect内（352行目）で同じサニタイズ処理が2回実行されていた。

**修正内容**:
- コンポーネント本体での呼び出しを削除
- useEffect内でのみサニタイズを実行するように変更
- 初期コンテンツのパースはコンポーネント本体で行い、サニタイズはuseEffectに集約

**ファイル**: `src/components/editor/TiptapEditor.tsx`

#### 1.2 buildContentErrorMessageをコンポーネント外に移動

**問題**: `TiptapEditor.tsx`内で定義されていた`buildContentErrorMessage`関数が、レンダリングごとに再作成されていた。

**修正内容**:
- `src/lib/contentUtils.ts`に`buildContentErrorMessage`関数を移動
- `sanitizeTiptapContent`と同じファイルに配置し、関連性を明確化
- テストケースを4つ追加（`contentUtils.test.ts`）

**ファイル**:
- `src/lib/contentUtils.ts` - 関数を追加
- `src/lib/contentUtils.test.ts` - テストケースを追加
- `src/components/editor/TiptapEditor.tsx` - インポートに変更

#### 1.3 デバッグログの整理

**問題**: `TiptapEditor.tsx`内に22箇所のconsole.log/groupが存在し、本番ビルドでも出力されていた。

**修正内容**:
- `src/lib/debugUtils.ts`を作成
- 開発時のみログを出力するユーティリティ関数を実装
  - `debugLog()`, `debugWarn()`, `debugError()`, `debugGroup()`, `debugGroupEnd()`
- `import.meta.env.DEV`で条件分岐
- `TiptapEditor.tsx`内のconsole.logを全てdebugLogに置き換え

**ファイル**:
- `src/lib/debugUtils.ts` - 新規作成
- `src/components/editor/TiptapEditor.tsx` - デバッグログを置き換え

### Phase 2: カスタムフック抽出（6/6完了） ✅

#### 2.1 useContentSanitizer フック

**責務**: コンテンツのサニタイズとエラー報告

**実装内容**:
- `src/components/editor/TiptapEditor/useContentSanitizer.ts`を作成
- エディターコンテンツのサニタイズ処理をフック化
- エラー報告のコールバックを提供
- コンテンツ更新時の初期化状態を通知

**インターフェース**:
```typescript
interface UseContentSanitizerOptions {
  editor: Editor | null;
  content: string;
  onError?: (error: ContentError | null) => void;
  onContentUpdated?: (initialized: boolean) => void;
}
```

**ファイル**:
- `src/components/editor/TiptapEditor/useContentSanitizer.ts` - 新規作成
- `src/components/editor/TiptapEditor.tsx` - フックを使用するように変更

#### 2.2 useWikiLinkNavigation フック

**責務**: WikiLinkクリック時のページナビゲーション

**実装内容**:
- `src/components/editor/TiptapEditor/useWikiLinkNavigation.ts`を作成
- WikiLinkクリック時のページ検索とナビゲーション処理をフック化
- ページ作成確認ダイアログの状態管理を内包
- `usePageByTitle`と`useCreatePage`を使用

**インターフェース**:
```typescript
interface UseWikiLinkNavigationReturn {
  handleLinkClick: (title: string, exists: boolean) => void;
  createPageDialogOpen: boolean;
  pendingCreatePageTitle: string | null;
  handleConfirmCreate: () => Promise<void>;
  handleCancelCreate: () => void;
}
```

**ファイル**:
- `src/components/editor/TiptapEditor/useWikiLinkNavigation.ts` - 新規作成
- `src/components/editor/TiptapEditor.tsx` - フックを使用するように変更

#### 2.3 useWikiLinkStatusSync フック

**責務**: WikiLinkのexists/referenced属性の同期

**実装内容**:
- `src/components/editor/TiptapEditor/useWikiLinkStatusSync.ts`を作成
- WikiLinkステータスの更新処理をフック化
- ページ読み込み時にWikiLinkの存在確認と参照状態を更新
- デバッグログを削除（ユーザーによる修正）

**インターフェース**:
```typescript
interface UseWikiLinkStatusSyncOptions {
  editor: Editor | null;
  content: string;
  pageId: string | undefined;
  onChange: (content: string) => void;
}
```

**ファイル**:
- `src/components/editor/TiptapEditor/useWikiLinkStatusSync.ts` - 新規作成
- `src/components/editor/TiptapEditor.tsx` - フックを使用するように変更

#### 2.4 useEditorSelectionMenu フック

**責務**: テキスト選択時のフローティングメニュー管理

**実装内容**:
- `src/components/editor/TiptapEditor/useEditorSelectionMenu.ts`を作成
- 10文字以上のテキスト選択時にメニューを表示
- Mermaidダイアグラム生成ダイアログを開くハンドラを提供

**インターフェース**:
```typescript
interface UseEditorSelectionMenuReturn {
  showMenu: boolean;
  menuPosition: { top: number; left: number } | null;
  selectedText: string;
  handleOpenMermaidDialog: () => void;
  handleSelectionUpdate: (props: { editor: Editor }) => void;
}
```

**ファイル**:
- `src/components/editor/TiptapEditor/useEditorSelectionMenu.ts` - 新規作成
- `src/components/editor/TiptapEditor.tsx` - フックを使用するように変更

#### 2.5 usePageEditorState フック

**責務**: ページ編集の状態管理とライフサイクル

**実装内容**:
- `src/components/editor/PageEditor/usePageEditorState.ts`を作成
- ページデータの初期化と状態管理を集約
- ページID変更時のリセット処理を含む

**インターフェース**:
```typescript
interface UsePageEditorStateReturn {
  title: string;
  content: string;
  sourceUrl: string | undefined;
  currentPageId: string | null;
  lastSaved: number | null;
  isInitialized: boolean;
  originalTitle: string;
  contentError: ContentError | null;
  setTitle: (title: string) => void;
  setContent: (content: string) => void;
  setSourceUrl: (sourceUrl: string | undefined) => void;
  setContentError: (error: ContentError | null) => void;
  initialize: (page: Page) => void;
  reset: () => void;
  updateLastSaved: (timestamp: number) => void;
}
```

**ファイル**:
- `src/components/editor/PageEditor/usePageEditorState.ts` - 新規作成
- `src/components/editor/PageEditorView.tsx` - フックを使用するように変更

#### 2.6 useEditorAutoSave フック

**責務**: debounce保存とWikiLink同期

**実装内容**:
- `src/components/editor/PageEditor/useEditorAutoSave.ts`を作成
- 500msのdebounce保存処理を実装
- WikiLink同期処理を含む
- タイトル重複時のブロック機能

**インターフェース**:
```typescript
interface UseEditorAutoSaveReturn {
  saveChanges: (title: string, content: string, forceBlockTitle?: boolean) => void;
  lastSaved: number | null;
  isSaving: boolean;
}
```

**ファイル**:
- `src/components/editor/PageEditor/useEditorAutoSave.ts` - 新規作成
- `src/components/editor/PageEditorView.tsx` - フックを使用するように変更

### Phase 3: コンポーネント分割 ✅

#### 3.1 TiptapEditor/editorConfig.ts

**責務**: Tiptapエディターの拡張設定を集約

**実装内容**:
- `createEditorExtensions()`関数で拡張配列を生成
- `defaultEditorProps`でエディタープロパティを定義
- StarterKit, Typography, Placeholder, Link, WikiLink, Mermaidの設定

**ファイル**:
- `src/components/editor/TiptapEditor/editorConfig.ts` - 新規作成（65行）

#### 3.2 TiptapEditor/types.ts

**責務**: TiptapEditor関連の型定義

**実装内容**:
- `TiptapEditorProps`インターフェース
- `ContentError`インターフェース（再エクスポート）
- `SuggestionItem`, `FloatingPosition`, `WikiLinkSuggestionHandle`

**ファイル**:
- `src/components/editor/TiptapEditor/types.ts` - 新規作成（51行）

#### 3.3 TiptapEditor/CreatePageDialog.tsx

**責務**: WikiLinkクリック時のページ作成確認ダイアログ

**実装内容**:
- AlertDialogを使用した確認UI
- 作成・キャンセルのコールバック

**ファイル**:
- `src/components/editor/TiptapEditor/CreatePageDialog.tsx` - 新規作成（53行）

#### 3.4 PageEditor/types.ts

**責務**: PageEditor関連の型定義

**実装内容**:
- `PageEditorData`, `TitleValidationState`
- `WikiGeneratorStatus`
- `PageEditorHeaderProps`, `PageEditorAlertsProps`, `PageEditorDialogsProps`

**ファイル**:
- `src/components/editor/PageEditor/types.ts` - 新規作成（96行）

#### 3.5 PageEditor/PageEditorHeader.tsx

**責務**: ページエディターのヘッダーUI

**実装内容**:
- タイトル入力
- アクションボタン（戻る、削除、エクスポート等）
- WikiGeneratorButton、WebClipperボタン
- DropdownMenu

**ファイル**:
- `src/components/editor/PageEditor/PageEditorHeader.tsx` - 新規作成（155行）

#### 3.6 PageEditor/PageEditorAlerts.tsx

**責務**: ページエディターの警告バナー

**実装内容**:
- タイトル重複警告
- 空タイトル警告
- Wiki生成中バナー
- コンテンツエラー警告

**ファイル**:
- `src/components/editor/PageEditor/PageEditorAlerts.tsx` - 新規作成（151行）

## ディレクトリ構造の変更

```
src/components/editor/
├── TiptapEditor/
│   ├── useContentSanitizer.ts       # 新規作成（95行）
│   ├── useWikiLinkNavigation.ts     # 新規作成（113行）
│   ├── useWikiLinkStatusSync.ts     # 新規作成（139行）
│   ├── useEditorSelectionMenu.ts    # 新規作成（72行）
│   ├── editorConfig.ts              # 新規作成（65行）
│   ├── types.ts                     # 新規作成（51行）
│   └── CreatePageDialog.tsx         # 新規作成（53行）
├── PageEditor/
│   ├── usePageEditorState.ts        # 新規作成（120行）
│   ├── useEditorAutoSave.ts         # 新規作成（99行）
│   ├── types.ts                     # 新規作成（96行）
│   ├── PageEditorHeader.tsx         # 新規作成（155行）
│   └── PageEditorAlerts.tsx         # 新規作成（151行）
├── TiptapEditor.tsx                 # リファクタリング（720→327行）
└── PageEditorView.tsx               # リファクタリング（836→610行）

src/lib/
├── contentUtils.ts                  # buildContentErrorMessage追加
├── contentUtils.test.ts             # テストケース追加
└── debugUtils.ts                    # 新規作成
```

## テスト結果

### ユニットテスト

**ファイル**: `src/lib/contentUtils.test.ts`
- 26テスト全てパス ✅
- `buildContentErrorMessage`のテストケースを4つ追加

**テスト内容**:
- エラーがない場合のデフォルトメッセージ
- 削除されたノードタイプを含むメッセージ
- 削除されたマークタイプを含むメッセージ
- ノードとマークの両方を含むメッセージ

### ビルドテスト

- TypeScriptのビルドが成功 ✅
- コンパイルエラーなし
- リンターエラーは既存のもので、今回の変更とは無関係

## コード変更統計

### 削除されたコード
- `TiptapEditor.tsx`: 約150行のロジックをフックに移動
- 重複していたサニタイズ処理を削除
- デバッグログを整理

### 追加されたコード
- 3つのカスタムフック（約400行）
- `debugUtils.ts`（51行）
- `buildContentErrorMessage`関数とテスト（約50行）

### ファイル行数の変化

| ファイル | Before | After | 変化 |
|---------|--------|-------|------|
| TiptapEditor.tsx | 720行 | 327行 | -393行 |
| PageEditorView.tsx | 836行 | 610行 | -226行 |
| TiptapEditor/useContentSanitizer.ts | - | 95行 | +95行 |
| TiptapEditor/useWikiLinkNavigation.ts | - | 113行 | +113行 |
| TiptapEditor/useWikiLinkStatusSync.ts | - | 139行 | +139行 |
| TiptapEditor/useEditorSelectionMenu.ts | - | 72行 | +72行 |
| TiptapEditor/editorConfig.ts | - | 65行 | +65行 |
| TiptapEditor/types.ts | - | 51行 | +51行 |
| TiptapEditor/CreatePageDialog.tsx | - | 53行 | +53行 |
| PageEditor/usePageEditorState.ts | - | 120行 | +120行 |
| PageEditor/useEditorAutoSave.ts | - | 99行 | +99行 |
| PageEditor/types.ts | - | 96行 | +96行 |
| PageEditor/PageEditorHeader.tsx | - | 155行 | +155行 |
| PageEditor/PageEditorAlerts.tsx | - | 151行 | +151行 |
| debugUtils.ts | - | 51行 | +51行 |
| contentUtils.ts | 309行 | 329行 | +20行 |

**元のファイル行数**: 1,556行（TiptapEditor.tsx + PageEditorView.tsx）
**リファクタリング後**: 937行（主要ファイル2つ）+ 1,209行（抽出されたファイル14個）= 2,146行

**効果**:
- 主要ファイルのサイズを約40%削減
- 関心事が明確に分離され、保守性が向上
- 各ファイルが単一責務を持つ構造に

## 完了した作業チェックリスト

### Phase 1: 重複・無駄な処理の修正
- [x] sanitizeTiptapContentの重複呼び出しを解消
- [x] buildContentErrorMessageをコンポーネント外に移動
- [x] デバッグログの整理

### Phase 2: カスタムフック抽出
- [x] TiptapEditor/useContentSanitizer.ts - サニタイズロジック
- [x] TiptapEditor/useWikiLinkNavigation.ts - ナビゲーションロジック
- [x] TiptapEditor/useWikiLinkStatusSync.ts - ステータス同期
- [x] TiptapEditor/useEditorSelectionMenu.ts - 選択メニュー
- [x] PageEditor/usePageEditorState.ts - 状態管理
- [x] PageEditor/useEditorAutoSave.ts - 保存ロジック

### Phase 3: コンポーネント分割
- [x] TiptapEditor/editorConfig.ts - 拡張設定抽出
- [x] TiptapEditor/types.ts - 型定義抽出
- [x] TiptapEditor/CreatePageDialog.tsx - ページ作成ダイアログ
- [x] PageEditor/types.ts - 型定義抽出
- [x] PageEditor/PageEditorHeader.tsx - ヘッダー抽出
- [x] PageEditor/PageEditorAlerts.tsx - 警告バナー抽出

## 学んだこと・気づき

1. **コロケーション原則の効果**: コンポーネント専用のフックを同じディレクトリに配置することで、関連性が明確になり、コードの理解が容易になった。

2. **デバッグログの整理**: 開発時のみログを出力するユーティリティを作成することで、本番ビルドでのパフォーマンスへの影響を排除できた。

3. **重複処理の解消**: サニタイズ処理を1箇所に集約することで、コードの保守性が向上し、バグの発生リスクを低減できた。

4. **テストの重要性**: `buildContentErrorMessage`のテストを追加することで、関数の動作を保証できた。

5. **段階的なリファクタリング**: Phase 1→2→3と段階的に進めることで、各段階でビルドとテストを確認しながら安全にリファクタリングを進められた。

6. **型定義の集約**: 型定義を専用ファイルに抽出することで、インポートが明確になり、型の再利用性が向上した。

## 今後の改善候補

1. **各フックの単体テスト追加**: 抽出したフックごとにテストファイルを作成
2. **E2Eテストの実行**: ページエディターの動作確認
3. **PageEditorDialogs.tsxの抽出**: 削除確認ダイアログ、Wiki生成エラーダイアログをコンポーネント化
4. **index.tsxへの統合**: TiptapEditor/index.tsx, PageEditor/index.tsxを作成してエクスポートを整理

## 参考

- 実装計画: `docs/plans/20260102/20260102_editor-refactoring-plan.md`
- 関連作業ログ: `docs/work-logs/20260102/tiptap-content-error-handling.md`
