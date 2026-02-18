# 仕様書: ヘッダー検索バー

## 1. 概要

| 項目 | 内容 |
|------|------|
| **機能名** | ヘッダー検索バー |
| **目的** | どのページからも検索を利用可能にし、検索できることを視覚的にわかりやすくする |
| **関連要望** | ・どのページからも検索ができるようにする<br>・検索できることをわかりやすくする |

---

## 2. 現状の実装調査

### 2.1 検索機能の現状

- **グローバル検索（Global Search）** はすでに実装済み。
- **起動方法**: キーボードショートカット **`Ctrl+K`**（Windows/Linux）/ **`Cmd+K`**（Mac）のみ。
- **配置**: `App.tsx` で `<GlobalSearch />` が 1 回だけレンダリングされ、ルートに関係なく常にマウントされている。
- **動作**: `CommandDialog`（モーダル）が開き、入力欄でキーワード検索・最近のページ表示・結果選択でページ遷移が可能。
- **検索対象**: 個人ページ（StorageAdapter / useSearchPages）＋ 共有ノート（API `GET /api/search?q=&scope=shared`）をマージし、スコア順で最大 10 件表示（C3-8）。

**主なファイル:**

| 役割 | パス |
|------|------|
| UI | `src/components/search/GlobalSearch.tsx` |
| ロジック | `src/hooks/useGlobalSearch.ts` |
| ショートカット | `src/hooks/useGlobalSearchShortcut.ts` |
| コマンドUI | `src/components/ui/command.tsx`（CommandDialog / CommandInput） |

**問題点:**

- ショートカット以外に検索を開く手段がなく、**検索の存在がわかりにくい**。
- ヘッダーに検索の入口がないため、「どのページからも検索」が**見た目上**伝わりにくい。

### 2.2 ヘッダーの現状

- **コンポーネント**: `src/components/layout/Header/index.tsx`
- **構成**:
  - **左**: `HeaderLogo`（Zedi ロゴ）、`MonthNavigation`（月ナビ）
  - **右**: `SyncIndicator`、`AppsMenu`、ゲスト時は文言、`UserMenu`
- **使用箇所**:
  - `Home.tsx`（/home）
  - `NotesLayout`（/notes, /notes/discover）
  - `NoteView.tsx`、`NotePageView.tsx`、`NoteSettings.tsx`、`NoteMembers.tsx`（ノート関連）
- **ヘッダーがない画面**:
  - ランディング（/）、サインイン（/sign-in）、認証コールバック
  - **ページエディタ**（/page/:id）— `PageEditorView` は `PageEditorHeader` のみでアプリ共通ヘッダーなし
  - **設定**（/settings, /settings/ai 等）— 各画面独自のヘッダー（戻る＋タイトル）

そのため、「どのページからも」を**画面上の入口**で満たす対象は、**共通ヘッダーが表示されている全てのページ**とするのが自然です。  
ページエディタ・設定では、現状どおり **Ctrl+K / Cmd+K** で検索を開く形を維持します。

### 2.3 useGlobalSearch の API

- `open()` / `close()` / `toggle()` がすでに存在。
- 検索ダイアログの開閉は `useGlobalSearch()` 内の `useState(false)` で管理。
- ヘッダーから「検索を開く」ためには、**ヘッダーと GlobalSearch の間で `open` を共有する必要**がある（Context または状態リフト）。

---

## 3. 提案仕様

### 3.1 方針

1. **既存の Global Search はそのまま利用**する（CommandDialog・検索ロジック・ショートカットは変更しない）。
2. **ヘッダーに「検索の入口」を追加**し、クリック／フォーカスで既存の検索ダイアログを開く。
3. 開閉状態を共有するため、**GlobalSearch 用の Context を導入**し、ヘッダーから `open()` を呼べるようにする。

### 3.2 UI 案（実装済み: 検索バー）

- ヘッダー中央に **独自の検索バー** を配置（Input ＋ フォーカス時にドロップダウン）。
- 見た目: 虫眼鏡アイコン ＋ 入力欄 ＋ ショートカット表記（⌘K）。ドロップダウンで「最近のページ」または「検索結果」を表示。
- **裏のロジックはダイアログと共通化**: `GlobalSearchContext` で `useGlobalSearch()` を 1 回だけ呼び、検索バーと CommandDialog の両方が同じ `query` / `searchResults` / `recentPages` / `handleSelect` を参照する。
- キーボードショートカット（⌘K）は従来どおり **CommandDialog を開く**。ダイアログとバーは同じ状態を共有するため、どちらで入力しても結果は同期する。
- 小画面では検索バーを非表示とし、虫眼鏡アイコンボタンのみ表示（タップでダイアログを開く）。

### 3.3 配置

- **位置**: ヘッダー内の **中央付近**（ロゴ＋月ナビの右、Sync/Apps/User の左）。
- **レスポンシブ**:
  - 中〜大画面: トリガーを常に表示（幅は 200px 程度で「ページを検索… ⌘K」を表示）。
  - 小画面: アイコンのみのボタン（虫眼鏡＋ツールチップで「検索 (⌘K)」）にしてもよい。

### 3.4 表示条件

- **ヘッダーが表示されている画面**（Home、Notes、ノート関連）では、検索トリガーを表示する。
- 未ログインでも **個人ページはローカルで利用可能** なため、ゲスト時も検索トリガーを表示してよい（現行の Global Search と同様）。
- ランディング・サインインなど、ヘッダー自体がない画面では対象外。

### 3.5 アクセシビリティ

- トリガーに `aria-label="ページを検索（ショートカット: Ctrl+K）"` など、目的とショートカットが分かるラベルを付与。
- キーボードでフォーカス可能にし、Enter / Space で検索ダイアログを開く。
- 既存の CommandDialog 内の操作（↑↓で移動、Enter で開く、Esc で閉じる）はそのまま維持。

---

## 4. 技術設計

### 4.1 状態共有（Context）

- **GlobalSearchContext** を新設し、`open` と `close` だけを提供する。
- **Provider** は、`useGlobalSearch()` を呼ぶコンポーネントでよい。  
  - 実装パターン: `GlobalSearchProvider` が `useGlobalSearch()` を実行し、返り値の `open` / `close` を Context に渡す。同一 Provider 内で `<GlobalSearch />`（CommandDialog）をレンダリングし、`children` で App のルート以下を包む。
- **ヘッダー**（またはヘッダー内の `HeaderSearchTrigger`）は `useGlobalSearchContext()` で `open` を取得し、ボタンクリックで `open()` を呼ぶ。

### 4.2 コンポーネント構成（案）

```
App
└── GlobalSearchProvider          ← useGlobalSearch() を呼び、Context に open/close を提供
    ├── GlobalSearch              ← CommandDialog（既存のまま）
    └── BrowserRouter
        └── Routes
            └── （各ページ）
                └── Header
                    └── HeaderSearchTrigger   ← 新規。Context の open() でダイアログを開く
```

### 4.3 新規・変更ファイル（案）

| 種別 | パス | 内容 |
|------|------|------|
| 新規 | `src/contexts/GlobalSearchContext.tsx` | GlobalSearchContext, GlobalSearchProvider, useGlobalSearchContext |
| 変更 | `src/App.tsx` | GlobalSearchProvider でラップし、GlobalSearch を Provider の子に |
| 新規 | `src/components/layout/Header/HeaderSearchTrigger.tsx` | 検索トリガー（バー風ボタン or アイコンボタン） |
| 変更 | `src/components/layout/Header/index.tsx` | HeaderSearchTrigger を中央付近に配置 |
| 変更 | `src/components/search/GlobalSearch.tsx` | useGlobalSearch の代わりに Context から open/close を取得するか、Provider 側で useGlobalSearch を呼び open/close を Context に渡すのみ（GlobalSearch は従来どおり useGlobalSearch を利用しても可。その場合は Provider が useGlobalSearch を呼び、open/close を Context に渡し、GlobalSearch は Context 経由で isOpen を参照するなど、役割分担は一通りに決める） |

**Context の役割分担（2 案）:**

- **案1（リフト）**: Provider が `useGlobalSearch()` を 1 回だけ呼び、Context に `open` / `close`（と必要なら `isOpen`）を渡す。GlobalSearch は Context から開閉と検索状態を受け取り、CommandDialog のみ担当する。検索ロジックは Provider 側に集約される。
- **案2（登録）**: Context の値は `{ open: (fn) => void, register: (open, close) => void }` のように「開く関数の登録用」だけ持つ。GlobalSearch は従来どおり `useGlobalSearch()` を呼び、mount 時に `register(open, close)` で Context に登録する。ヘッダーは Context から `open` を取得して呼ぶ。既存の GlobalSearch の変更が少なく済む。

実装時は、既存コードの変更量とテストのしやすさで案1・案2のどちらかを選んでよい。

### 4.4 i18n

- プレースホルダー「ページを検索…」、空結果「ページが見つかりません」、トリガーの aria-label 等は、既存の `react-i18next` のキーに揃えるか、`common.searchPlaceholder` のようなキーを追加する。

---

## 5. 実装ステップ（案）

| Step | 内容 | 備考 |
|------|------|------|
| 1 | GlobalSearchContext / Provider の追加 | useGlobalSearch を Provider 内で呼び、open/close を Context に渡す。GlobalSearch は Context から開閉と必要なら query 系を受け取るよう変更。 |
| 2 | App.tsx を GlobalSearchProvider でラップ | GlobalSearch を Provider の子として配置。 |
| 3 | HeaderSearchTrigger の新規作成 | バー風ボタン or アイコンボタン。クリックで context.open()。ショートカット表記（⌘K）と aria-label。 |
| 4 | Header に HeaderSearchTrigger を配置 | 中央付近に配置し、レスポンシブでアイコンのみにするか検討。 |
| 5 | 必要に応じて i18n キー追加・既存文言の置き換え | プレースホルダー・トリガーラベル。 |
| 6 | 動作確認 | ヘッダー表示画面でトリガーからダイアログが開くこと、Ctrl+K でも従来どおり開くこと、Esc で閉じることを確認。 |

---

## 6. 将来の拡張（任意）

- **インライン検索バー（B 案）**: ヘッダーに実入力欄を置き、結果をドロップダウンで表示する形態。
- **ページエディタ・設定画面にヘッダーを追加**: 共通 Header を表示すれば、そのヘッダーに同じ検索トリガーを載せられ、「どのページからも」の範囲が広がる。
- **検索バーのフォーカス時オープン**: トリガーを `contenteditable` や input 風にして、フォーカス時にダイアログを開く挙動にすることも可能（UX 要検討）。

---

## 7. 関連ドキュメント

- [実装計画書: Global Search（Omni-bar）](../plans/20251231/global-search.md)
- [PRD](../PRD.md)（検索・再発見の節があれば参照）

---

以上を仕様として提案する。実装時は Step 1 から順に進め、ヘッダーから検索を開けることと、検索の存在がわかりやすくなることを優先してよい。
