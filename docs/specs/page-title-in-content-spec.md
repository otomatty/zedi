# ページタイトルをコンテンツ上部に表示する仕様

> **目的**: ページ詳細（個人ページ・ノート内ページ）でタイトルをヘッダーからコンテンツ上部に移し、長文タイトルの表示・入力を可能にする。スクロール時はスティッキータイトルバーでタイトルを表示し、クリックでタイトル位置へスクロールできるようにする。

---

## 1. 概要

### 1.1 背景・課題

- 現状、ページタイトルはヘッダー内の 1 行入力で表示・編集しているため、長いタイトルが切り捨てられ、入力・表示しづらい。
- ノート内ページ（NotePageView）ではヘッダー下バーにタイトルを表示しており、個人ページ（PageEditor）と UX が分かれている。

### 1.2 達成したいこと

- **PageEditor**（`/page/:id`）と **NotePageView**（`/note/:noteId/page/:pageId`）の両方で、タイトルをコンテンツ上部に統一表示する。
- タイトルは複数行で折り返し表示・入力可能とし、長文でもすべて表示できるようにする。
- スクロールでタイトルが画面外に出たら、ヘッダー直下にスティッキータイトルバーを表示する。
- スティッキータイトルバーをクリックすると、タイトル部分までスクロールする。
- ヘッダー高さをアプリ全体で統一する。

---

## 2. 決定事項一覧

| 項目                                 | 決定内容                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| **スティッキータイトルバーの見た目** | ヘッダーと同様に半透明＋ブラー（`bg-background/95 backdrop-blur` 等）                      |
| **ノート名の表示**                   | ページ詳細ページでは表示しない（削除）                                                     |
| **タイトル入力のフォーカス**         | 控えめなスタイルで「見出し」感を維持（リング・ボーダーは最小限）                           |
| **プレースホルダー**                 | 「タイトル」のみ表示。文字色は薄く（`text-muted-foreground`）                              |
| **アニメーション**                   | スティッキータイトルバーの出現・非表示にフェード／スライド等のトランジションを入れる       |
| **ヘッダー高さ**                     | 統一する。**h-16（64px）** に揃える（現状: PageEditorHeader は h-14、共通 Header は h-16） |
| **テスト**                           | タイトル入力関連のテストを新コンポーネントに合わせて修正する                               |

---

## 3. ヘッダー高さの統一

### 3.1 現状

| コンポーネント   | ファイル                                                | 高さ   |
| ---------------- | ------------------------------------------------------- | ------ |
| 共通 Header      | `src/components/layout/Header/index.tsx`                | `h-16` |
| PageEditorHeader | `src/components/editor/PageEditor/PageEditorHeader.tsx` | `h-14` |

### 3.2 変更後

- **PageEditorHeader** の `Container` 内の高さを **`h-14` → `h-16`** に変更する。
- アプリ内の「メインのヘッダー」はすべて **h-16（64px）** で統一する。

### 3.3 スティッキーバー位置への影響

- スティッキータイトルバーは「ヘッダー直下」に固定するため、`top` はヘッダー高さに合わせる。
- 統一後は **`top-16`（64px）** を共通値として使用する。
- z-index はヘッダーより下とする（例: ヘッダー `z-50`、スティッキータイトルバー `z-40`）。

---

## 4. 新規コンポーネント

### 4.1 PageTitleBlock

**責務**: コンテンツ上部にタイトルを表示または編集するブロック。スクロール検知用の ref を渡せるようにする。

**配置**: `src/components/editor/PageEditor/PageTitleBlock.tsx`（または `src/components/page/PageTitleBlock.tsx`）

**Props**

| Prop            | 型                                     | 必須       | 説明                                                               |
| --------------- | -------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `title`         | `string`                               | ○          | 表示・編集するタイトル                                             |
| `onTitleChange` | `(value: string) => void`              | 編集時のみ | タイトル変更時のコールバック（編集モード時）                       |
| `isReadOnly`    | `boolean`                              | -          | 閲覧専用なら true。デフォルト false                                |
| `errorMessage`  | `string \| null`                       | -          | バリデーションエラー（例: 重複）。ある場合にスタイル表示           |
| `placeholder`   | `string`                               | -          | プレースホルダー。デフォルト「タイトル」                           |
| `titleRef`      | `React.RefObject<HTMLElement \| null>` | -          | IntersectionObserver 用。タイトルブロックのルート要素に ref を付与 |

**表示仕様**

- **編集モード**（`isReadOnly === false`）
  - 自動伸長する **textarea** を使用（または 1 行で足りる場合は入力欄 1 行）。
  - 見た目: 見出し風（例: `text-2xl` または `text-3xl`、`font-semibold`）。
  - フォーカス時: 控えめ（`focus-visible:ring-2 focus-visible:ring-ring/20` 程度、または `focus-visible:outline-none` ＋薄い下線のみ）。
  - プレースホルダー: 「タイトル」。文字色は **薄く**（`placeholder:text-muted-foreground`）。
  - エラー時: `errorMessage` があるときは `text-destructive` 等で表示。

- **閲覧モード**（`isReadOnly === true`）
  - 編集不可。`h1` または同等の見出しとして表示し、長文は折り返す（`whitespace-normal`）。
  - 表示テキスト: `title || '無題のページ'` など。

**レイアウト**

- `Container` と同じ幅（`max-w-4xl`）で、コンテンツ本体（SourceUrlBadge / TiptapEditor）と同じコンテナ内の**先頭**に配置する想定。
- 上下マージン: 例として `pt-6 pb-2` など、本文との間が適度に空くようにする。

---

### 4.2 StickyTitleBar

**責務**: タイトルがビューポート外に出たとき、ヘッダー直下に表示するバー。クリックでタイトル位置へスクロールする。

**配置**: `src/components/editor/PageEditor/StickyTitleBar.tsx`（または `src/components/page/StickyTitleBar.tsx`）

**Props**

| Prop       | 型                                     | 必須 | 説明                                             |
| ---------- | -------------------------------------- | ---- | ------------------------------------------------ |
| `visible`  | `boolean`                              | ○    | バーを表示するか                                 |
| `title`    | `string`                               | ○    | 表示するタイトル（1 行で省略表示）               |
| `onClick`  | `() => void`                           | ○    | クリック時にタイトル位置へスクロールする処理     |
| `titleRef` | `React.RefObject<HTMLElement \| null>` | -    | スクロール先要素（PageTitleBlock の ref を渡す） |

**表示・スタイル**

- **見た目**: ヘッダーと同様の半透明＋ブラー。
  - 例: `bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60`
  - ボーダー: `border-b border-border`
- **レイアウト**: 高さはコンパクトに（例: `h-10` または `h-12`）。`Container` 内で 1 行表示、長いタイトルは **truncate**。
- **位置**: `sticky top-16 z-40`（ヘッダー `h-16` の直下）。
- **アニメーション**: 出現・非表示にトランジションを付ける。
  - 例: `transition-all duration-200` と、`visible` に応じた `opacity` および `transform`（例: 上からスライド）または `max-height` で制御。
  - 非表示時は `pointer-events-none` でクリック不可にし、レイアウトシフトを防ぐ場合は `invisible` や `opacity-0` で非表示にする。

**インタラクション**

- クリック時: `onClick` を実行。実装側で `titleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })` を呼ぶ。

---

## 5. 既存コンポーネントの変更

### 5.1 PageEditorHeader

**ファイル**: `src/components/editor/PageEditor/PageEditorHeader.tsx`

**変更内容**

- **タイトル入力（Input）を削除**する。戻るボタン、Wiki ボタン、保存時刻、コラボ表示、ドロップダウン（エクスポート／コピー／削除）はそのまま残す。
- **ヘッダー高さを `h-14` → `h-16` に変更**する。
- **Props から削除**: `title`, `onTitleChange`, `errorMessage`。  
  （`errorMessage` は PageTitleBlock 側で表示するため、ヘッダーでは不要。）

**変更後の Props（案）**

- `lastSaved`, `hasContent`, `wikiStatus`, `onBack`, `onDelete`, `onExportMarkdown`, `onCopyMarkdown`, `onGenerateWiki`, `collaboration` のみ。

---

### 5.2 PageEditorContent

**ファイル**: `src/components/editor/PageEditor/PageEditorContent.tsx`

**変更内容**

- **先頭に PageTitleBlock を追加**する。順序: **PageTitleBlock** → SourceUrlBadge → TiptapEditor → LinkedPagesSection。
- PageTitleBlock に渡すもの:
  - `title`, `onTitleChange`（編集時）, `isReadOnly`（既存の `isReadOnly` を流用）, `errorMessage`（新規 prop で親から渡す）, `titleRef`（StickyTitleBar と共有する ref）。
- **新規 Props**:
  - `onTitleChange?: (value: string) => void`（編集可能な画面のみ渡す）
  - `errorMessage?: string | null`
  - `titleRef?: React.RefObject<HTMLElement | null>`（省略可。StickyTitleBar とタイトルブロックの両方で使う）

**NotePageView からの利用**

- NotePageView では `onTitleChange` を渡さず、`isReadOnly` を true（または編集不可時）にすれば、PageTitleBlock は閲覧表示のみになる。
- ノート内ページで編集可能な場合は、将来 `onTitleChange` を渡す拡張が可能。

---

### 5.3 PageEditorView

**ファイル**: `src/components/editor/PageEditorView.tsx`

**変更内容**

- タイトル関連の state（`title`, `handleTitleChange`）は **PageEditorContent に渡す**（現状の `title` は既に PageEditorContent に渡しているので、`onTitleChange` と `errorMessage` を追加）。
- **StickyTitleBar を配置**する。
  - 表示条件: タイトルがビューポート外に出たとき（IntersectionObserver で検知）。
  - クリック時: タイトルブロック要素の `scrollIntoView({ behavior: 'smooth', block: 'start' })` を実行。
- **IntersectionObserver** は PageEditorView で行うか、StickyTitleBar 内で行うかどちらか。
  - 推奨: **StickyTitleBar** に `titleRef` と「タイトルが画面内にあるか」を渡し、StickyTitleBar 内で Observer を張り、`visible` を親に伝えるか、StickyTitleBar が内部で `visible` を決めて表示する。
- PageEditorHeader には **title / onTitleChange / errorMessage を渡さない**（削除）。

---

### 5.4 NotePageView

**ファイル**: `src/pages/NotePageView.tsx`

**変更内容**

- **ヘッダー下のバーを変更**する。
  - **ノート名・ページタイトルの表示を削除**する。
  - 残すもの: **戻るボタン** と、必要なら **閲覧専用ラベル** のみ。バー自体は高さを小さくするか、ヘッダーと一体化（戻るだけならヘッダー左に戻るボタンを出す等）してもよい。
  - 仕様上は「ノート名は表示しない」なので、タイトルは PageEditorContent 内の PageTitleBlock のみで表示する。
- **PageEditorContent** に、既存どおり `title={page.title}`、`isReadOnly={!canEdit}` を渡す。
  - `onTitleChange` は渡さない（ノート内ページではタイトル編集をしない前提でよい場合）、または将来編集対応するなら渡す。
- スティッキータイトルバーは **PageEditorContent 内で共通表示**するか、NotePageView でも StickyTitleBar を同じロジックで表示する。
  - 推奨: PageEditorContent 内で「タイトル ref」「タイトルが可視か」を扱い、StickyTitleBar も PageEditorContent 内に含めて、PageEditor / NotePageView の両方で同じレイアout にすると重複が少ない。

---

## 6. スティッキーバー表示ロジック（IntersectionObserver）

- **監視対象**: PageTitleBlock のルート要素（`titleRef`）。
- **閾値**: 例として `threshold: 0` または `threshold: 0.1`。要素の少しでも見えたら「表示中」、完全に見えなくなったら「非表示」→ スティッキーバー表示。
- **root**: デフォルトのビューポート。
- 結果を `visible` に反映: タイトルが**見えていない**ときにスティッキーバーを **表示**する（`visible = !isTitleInView`）。

---

## 7. テストの修正

### 7.1 PageEditorHeader.test.tsx

**ファイル**: `src/components/editor/PageEditor/PageEditorHeader.test.tsx`

**削除・変更するテスト**

- タイトル入力に関するテストを **削除** または **修正** する。
  - 「タイトル入力とプレースホルダーを表示する」→ 削除。
  - 「タイトルを変更すると onTitleChange が呼ばれる」→ 削除。
  - 「errorMessage があるときタイトル入力に text-destructive クラスが付く」→ 削除。
  - 「errorMessage が null のときタイトル入力に text-destructive を付けない」→ 削除。
- **defaultProps から削除**: `title`, `onTitleChange`, `errorMessage`。
- 上記削除後も、戻る・Wiki・ドロップダウン・コラボ等のテストは **そのまま維持** する。

### 7.2 PageTitleBlock のテスト（新規）

**ファイル**: `src/components/editor/PageEditor/PageTitleBlock.test.tsx`（または PageTitleBlock の配置に合わせる）

**追加するテスト例**

- 編集モードでプレースホルダー「タイトル」が表示されること。
- 編集モードでテキストを変更すると `onTitleChange` が呼ばれること。
- `errorMessage` があるとき、タイトルにエラー用スタイル（例: `text-destructive`）が付くこと。
- 閲覧モード（`isReadOnly === true`）では入力欄が表示されず、タイトルテキスト（または「無題のページ」）が表示されること。
- `titleRef` を渡した場合、ルート要素に ref が付与されていること（必要な場合）。

### 7.3 StickyTitleBar のテスト（新規）

**ファイル**: `src/components/editor/PageEditor/StickyTitleBar.test.tsx`

**追加するテスト例**

- `visible === false` のときバーが表示されない（または非表示状態である）こと。
- `visible === true` のとき、タイトルが表示されること。
- クリック時に `onClick` が 1 回呼ばれること。
- `titleRef.current` に対して `scrollIntoView` が呼ばれること（モックして検証）。

### 7.4 その他

- PageEditorView の統合テストや E2E で「タイトルを編集できる」「スクロールでスティッキーバーが出る」などを確認する場合は、必要に応じて追加する。
- 既存の `IntersectionObserver` のグローバルモック（`src/test/setup.ts`）は、StickyTitleBar（または PageEditorView）のテストで「タイトルが非表示になったときに visible になる」を検証する場合、モックの実装を少し拡張する可能性がある（コールバックを呼んで `isIntersecting` を切り替える等）。

---

## 8. 実装順序の提案

1. **ヘッダー高さの統一**  
   PageEditorHeader の `h-14` → `h-16` に変更。

2. **PageTitleBlock の新規作成**  
   Props・編集/閲覧モード・プレースホルダー・ref 対応を実装。

3. **StickyTitleBar の新規作成**  
   見た目（半透明ブラー）、`top-16`、アニメーション、クリックで `scrollIntoView` を実装。IntersectionObserver は StickyTitleBar 内で行うか、PageEditorView で行って `visible` を渡す。

4. **PageEditorContent の修正**  
   PageTitleBlock を先頭に追加。`onTitleChange`, `errorMessage`, `titleRef` を props で受け取り、StickyTitleBar も PageEditorContent 内に含める場合は、ここで Observer と ref を扱う。

5. **PageEditorHeader の修正**  
   タイトル入力・関連 props 削除、高さ h-16 に変更。

6. **PageEditorView の修正**  
   Header に渡す props から title 関連を削除。StickyTitleBar の表示制御（ref と Observer）を接続。

7. **NotePageView の修正**  
   ヘッダー下バーからノート名・ページタイトルを削除。戻るボタンのみ残す（またはレイアウトを簡素化）。PageEditorContent に title/isReadOnly を渡し、StickyTitleBar が NotePageView でも動くようにする。

8. **テストの修正・追加**  
   PageEditorHeader のタイトル関連テスト削除、PageTitleBlock と StickyTitleBar のユニットテスト追加、必要なら統合テストの更新。

---

## 9. 受け入れ基準（チェックリスト）

- [ ] 個人ページ（`/page/:id`）で、タイトルがコンテンツ上部（エディタ上）に表示・編集できる。
- [ ] ノート内ページ（`/note/:noteId/page/:pageId`）で、タイトルがコンテンツ上部に表示される（ノート名は表示されない）。
- [ ] タイトルは複数行で折り返し表示・入力でき、長文でもすべて表示される。
- [ ] プレースホルダーは「タイトル」で、文字色は薄い。
- [ ] タイトル入力のフォーカス時はスタイルが控えめで、見出し感が維持されている。
- [ ] スクロールしてタイトルが画面外に出ると、ヘッダー直下にスティッキータイトルバーが表示される。
- [ ] スティッキータイトルバーは半透明＋ブラーで、ヘッダーと同様の見た目である。
- [ ] スティッキータイトルバーの出現・非表示にアニメーションが付いている。
- [ ] スティッキータイトルバーをクリックすると、タイトル部分までスムーズにスクロールする。
- [ ] PageEditorHeader と共通 Header の高さがどちらも h-16 で統一されている。
- [ ] PageEditorHeader からタイトル入力が削除され、関連テストが削除または移行されている。
- [ ] PageTitleBlock と StickyTitleBar のユニットテストが追加されている。

---

## 10. 参照

- 現状のタイトル表示: `PageEditorHeader.tsx`（ヘッダー内 Input）、`NotePageView.tsx`（ヘッダー下バー内 h1）。
- コンテンツレイアウト: `PageEditorContent.tsx`（Container → SourceUrlBadge → TiptapEditor → LinkedPagesSection）。
- テスト: `PageEditorHeader.test.tsx`、`src/test/setup.ts`（IntersectionObserver モック）。
