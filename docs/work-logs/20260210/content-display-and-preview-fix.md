# コンテンツ表示・プレビュー問題の調査と修正（2026-02-10）

## 概要

個人ページ（`/page/[id]`）において、以下の2つの問題が発生していた。

1. **ページ一覧のカード**で、サムネイルがないページにコンテンツのプレビュー（先頭テキスト）が表示されない
2. **エディターを開いても**、保存済みのコンテンツが表示されず、画面が空のままになる

本ドキュメントは、問題の原因調査と対応内容を記録する。

---

## 発生していた問題

### 問題1: ページカードにコンテンツプレビューが表示されない

- **現象**: ホームのページグリッドで、サムネイル画像がないカードに「コンテンツがありません」と表示され、本文の先頭テキストが表示されない
- **期待**: `content_preview`（本文の先頭約200文字）がカードに表示される

### 問題2: エディターを開いてもコンテンツが表示されない

- **現象**: 既存ページを開くとエディターが空のまま。保存済みの本文が読み込まれない
- **期待**: Aurora またはローカルに保存された Y.Doc の内容がエディターに表示される

### その他の経緯

- 個人ページではリアルタイム共同編集を使わないため、「リアルタイム編集を準備中...」という表示が不要だった
- 当初その表示を消すために `useCollaboration` を削除したところ、**コンテンツそのものの読み込み経路がなくなり**、問題2が顕在化した（コンテンツは Y.Doc / y-indexeddb 経由でしか読み込まれていなかった）

---

## 原因の整理

### データの流れ（設計上の前提）

- **メタデータ**（タイトル、`content_preview`、サムネイルURL など）: `GET/POST /api/sync/pages` で Aurora の `pages` テーブルと同期し、クライアントの IndexedDB に保存。一覧・カードはここから取得
- **本文（Y.Doc）**: `page_contents` テーブル（`ydoc_state`, `content_text`）に保存。ページを開いたときに `GET /api/pages/:id/content` で取得し、ローカルの Y.Doc にマージ。編集後は `PUT /api/pages/:id/content` で保存
- 個人ページでは `useCollaboration({ mode: "local" })` が **Y.Doc の読み込み（y-indexeddb + Aurora fetch）** と **保存（y-indexeddb + Aurora PUT）** の窓口になっている

### 原因1: ページカードのプレビューが出ない

| 要因 | 説明 |
|------|------|
| **Aurora の `content_preview` が NULL** | 移行時や従来の保存フローでは `pages.content_preview` が更新されておらず、多くの行が NULL だった |
| **差分 sync で更新が拾われない** | 後から SQL で `content_preview` だけを backfill しても `updated_at` を変えていなかったため、クライアントの「前回 sync 時刻以降」の差分取得に含まれず、古い NULL のまま pull されていた |
| **PUT content で preview を更新していない** | 編集保存時に `PUT /api/pages/:id/content` は `page_contents` だけを更新し、`pages.content_preview` を更新していなかった |

### 原因2: エディターにコンテンツが表示されない

| 要因 | 説明 |
|------|------|
| **Y.Doc のフィールド名の不一致** | 移行スクリプト（`tiptap-to-ydoc.ts`）は **`prosemirrorJSONToYDoc(..., "default")`** により、Y.Doc の XmlFragment を **`"default"`** という名前で保存していた。一方、フロントの CollaborationManager と TiptapEditor は **`"prosemirror"`** という名前で `getXmlFragment('prosemirror')` / `Collaboration.configure({ field: "prosemirror" })` を参照していた。Aurora に保存されているデータは `"default"` に入っているため、`"prosemirror"` を読んでも空で、エディターが空表示になっていた |
| **コンテンツ取得経路の喪失** | 個人ページで「準備中」を消すために `useCollaboration` を丸ごと外したことで、Y.Doc を読みにいく処理がなくなり、`page.content` は常に `""`（Repository はメタデータのみ返す）のままだった |

### 原因3: 「リアルタイム編集を準備中」が個人ページに出る

- **要因**: `PageEditorContent` の「コラボ準備完了」判定に **`awareness`** が必須だった。個人ページは `mode: "local"` のため WebSocket に接続せず、`awareness` は常に `undefined`。その結果、いつまで経っても「準備完了」にならず「準備中」のまま表示されていた

---

## 実施した対応

### 1. 個人ページでの「準備中」表示の解消（local モードで awareness を必須にしない）

- **対象**: `PageEditorContent.tsx`, `TiptapEditor/types.ts`, `TiptapEditor.tsx`, `TiptapEditor/editorConfig.ts`
- **内容**:
  - コラボ「準備完了」判定から **awareness を必須条件から外した**（ydoc + xmlFragment + collaborationUser があればよい）
  - `CollaborationConfig.awareness` をオプショナルに変更
  - Tiptap の Collaboration 拡張は **awareness があるときだけ** CollaborationCaret を追加するように変更
- **結果**: 個人ページでは「準備中」が出ず、Y.Doc ベースのエディターがそのまま表示される

### 2. 個人ページでのコンテンツ取得・保存の確立（Aurora と Y.Doc の同期）

- **対象**: `CollaborationManager.ts`
- **内容**:
  - **取得**: IndexedDB (y-indexeddb) の synced 後に、`GET /api/pages/:id/content` で Aurora の Y.Doc を取得し、`Y.applyUpdate(ydoc, binary)` でローカル Y.Doc にマージ
  - **保存**: Y.Doc の `update` イベントを監視し、2秒 debounce で `PUT /api/pages/:id/content` に `ydoc_state`（base64）と `content_text` を送信
  - ページを閉じるとき（destroy）で、未保存分を同期的に保存
- **結果**: エディターを開くと Aurora の内容がマージされて表示され、編集後は Aurora に保存される

### 3. Y.Doc フィールド名の統一（エディターが正しいフラグメントを参照するようにする）

- **対象**: `CollaborationManager.ts`, `TiptapEditor.tsx`
- **内容**:
  - 移行データが **`"default"`** に保存されているため、フロント側を **`"default"`** に合わせた
  - `getXmlFragment('prosemirror')` → `getXmlFragment('default')`
  - Collaboration 拡張の `field: "prosemirror"` → `field: "default"`
  - `saveToAurora` 内の `getXmlFragment('prosemirror')` → `'default'`
- **結果**: Aurora から取得した Y.Doc をマージしたあと、エディターが同じ `"default"` フィールドを参照するため、コンテンツが正しく表示される

### 4. ページカード用の content_preview の整備

#### 4.1 Aurora の既存データの backfill

- **作業**: `page_contents.content_text` の先頭 200 文字を `pages.content_preview` に一括コピーする SQL を実行
- **結果**: 1,244 件の `content_preview` を設定

#### 4.2 差分 sync で backfill が pull されるようにする

- **作業**: `content_preview` が入っている行について `pages.updated_at = NOW()` で更新（1,244 件）
- **結果**: 次回の sync（差分取得）でこれらの行が「更新あり」として返り、クライアントの IndexedDB に content_preview が入る

#### 4.3 今後の保存でも content_preview が更新されるようにする

- **対象**: Lambda `terraform/modules/api/lambda/handlers/pages.mjs`
- **内容**: `PUT /api/pages/:id/content` の処理で、`page_contents` を更新したあとに、**`content_text` の先頭 200 文字で `pages.content_preview` を更新する** SQL を追加
- **結果**: 編集保存のたびに `pages.content_preview` が更新され、sync 経由でクライアントに反映され、カードにプレビューが表示される

#### 4.4 Lambda のデプロイ

- **作業**: `terraform apply -target=module.api.aws_lambda_function.main` で API 用 Lambda を更新
- **結果**: 本番（dev）環境で上記 content_preview 更新が有効になった

---

## 変更・影響したファイル一覧

| 種別 | パス | 変更内容の要約 |
|------|------|----------------|
| フロント | `src/components/editor/PageEditorView.tsx` | 個人ページで `useCollaboration` を復元（Y.Doc 読み込みのため） |
| フロント | `src/components/editor/PageEditor/PageEditorContent.tsx` | コラボ準備完了判定から awareness を必須から外す |
| フロント | `src/components/editor/TiptapEditor/types.ts` | `CollaborationConfig.awareness` をオプショナルに |
| フロント | `src/components/editor/TiptapEditor.tsx` | `field: "prosemirror"` → `"default"`、awareness ありきのカーソル更新をガード |
| フロント | `src/components/editor/TiptapEditor/editorConfig.ts` | awareness があるときだけ CollaborationCaret を追加、`field` は呼び出し元から渡すため変更なし |
| フロント | `src/lib/collaboration/CollaborationManager.ts` | Aurora からの fetch/マージ、Aurora への save、全 XmlFragment 参照を `'default'` に統一 |
| バックエンド | `terraform/modules/api/lambda/handlers/pages.mjs` | `PUT /api/pages/:id/content` で `pages.content_preview` を `content_text` の先頭 200 文字で更新 |
| DB | Aurora `pages` テーブル | backfill: `content_preview` を `content_text` から設定、続けて `updated_at` を NOW() で更新（sync で取得されるようにするため） |

---

## 今後の注意点

- **Y.Doc のフィールド名**: 新規に Tiptap の Collaboration や移行スクリプトを触る場合は、**`"default"`** と **`"prosemirror"`** のどちらで統一するか仕様を決め、クライアント・サーバー・移行スクリプトで一致させること。現在は移行データに合わせてクライアントを `"default"` に統一済み。
- **content_preview**: 本文の保存経路（`PUT /api/pages/:id/content`）で、必ず `pages.content_preview` も更新するようにした。別経路で本文だけ更新する処理を追加する場合は、同様に preview の更新を検討すること。
- **個人ページの useCollaboration**: 個人ページでも Y.Doc の読み書きのために `useCollaboration({ mode: "local" })` は必要。削除するとコンテンツが表示されなくなる。

---

## 参照

- データ構造・同期方針: `docs/specs/zedi-data-structure-spec.md`
- 移行スクリプト（Tiptap → Y.Doc）: `scripts/migration/transform-for-aurora/tiptap-to-ydoc.ts`（111行目で `"default"` を使用）
- リアルタイムコラボ仕様: `docs/specs/realtime-collaboration-specification.md`
