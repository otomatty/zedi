# Zedi リアーキテクチャ タスク細分化・作業提案

**作成日:** 2026-02-09  
**前提:** `docs/specs/zedi-rearchitecture-spec.md` および現行実装の調査に基づく。

---

## 1. 調査サマリー：現状 vs 仕様

### 1.1 ストレージ・接続

| 項目 | 現状 | 仕様（リアーキテクチャ後） |
|------|------|---------------------------|
| **ローカル** | sql.js (WASM) + IndexedDB 永続化。全テーブル（pages, links, ghost_links, notes, note_pages, note_members）をローカルに保持 | Web: IndexedDB（**自分のページのみ**）。共有ノートはローカルに保存しない |
| **リモート** | Turso（LibSQL）にブラウザから**直結**（JWT 認証） | Aurora Serverless v2 に**API 経由**で接続（Lambda + API Gateway）。Turso 直結は廃止 |
| **ID** | TEXT（nanoid） | **UUID** に統一 |
| **users テーブル** | なし（user_id / owner_user_id は Cognito sub 等の文字列） | **users** を新設。pages.owner_id / notes.owner_id は users.id (UUID) を参照 |
| **ページ本文** | `pages.content` に **Tiptap JSON** を文字列で保存 | 本文は **Y.Doc**。`page_contents`（ydoc_state, version）で管理。pages には content_preview のみ |
| **ghost_links** | link_text, source_page_id, created_at のみ | **original_target_page_id**, **original_note_id**（NULL 許容）を追加 |

### 1.2 エディタ・コラボ

| 項目 | 現状 | 仕様 |
|------|------|------|
| **個人ページ** (`/page/:id`) | CollaborationManager: **Y.Doc + y-indexeddb + Hocuspocus** の 3 つを常時使用 | **Y.Doc + y-indexeddb のみ**。Hocuspocus は使わない。同期は手動/起動時のみ API 経由 |
| **共有ノート内ページ** (`/note/:noteId/page/:pageId`) | **閲覧のみ**（PageEditorContent に content を渡して read-only）。編集は「編集」ボタンで `/page/:id` に遷移 | ノートコンテキストでも**編集可能**にし、**Hocuspocus のみ**でリアルタイム共同編集。編集権限は**ノートのメンバーで editor ロール**のユーザーのみ。ローカルには保存しない |
| **コンテンツ形式** | 個人: エディタは Y.Doc、同期は pages.content（Tiptap JSON）を Turso とやりとり | 全ページ **Y.Doc 統一**。API で ydoc_state を GET/PUT。メタデータは差分同期 |

### 1.3 API・インフラ

| 項目 | 現状 | 仕様 |
|------|------|------|
| **ページ/ノート/同期 API** | **なし**。Turso 直結のみ | **Lambda + API Gateway** で REST API（§13）を新規実装 |
| **Hocuspocus** | メモリのみ（永続化なし） | **Aurora 永続化 + Redis**（定期保存・切断時保存・マルチインスタンス） |
| **検索** | ローカル: PageRepository + searchUtils（Tiptap JSON からテキスト抽出して JS でフィルタ）。サーバー検索なし | 個人: **ローカル検索**（Web は IndexedDB + 将来的に MiniSearch）。共有: **API 経由でサーバー検索**（pg_bigm） |

### 1.4 認証

| 項目 | 現状 | 仕様 |
|------|------|------|
| 認証 | Cognito 済み | 変更なし（Cognito）。API 認可は Cognito JWT 検証 |

---

## 2. タスク細分化（フェーズ別）

以下は **Phase C（AWS 移行）→ Phase D（Tauri Desktop）→ Phase E（Tauri Mobile）** の順で、仕様書 §16 移行計画をベースに細かく分解したもの。

---

### Phase C1: API レイヤー構築

| # | タスク | 内容 | 依存 | 工数目安 |
|---|--------|------|------|----------|
| C1-1 | Aurora DDL 作成・適用 | zedi-data-structure-spec + 仕様 §14.2 に基づき、users / pages / page_contents / notes / note_pages / note_members / links / ghost_links / media の PostgreSQL DDL を作成し、dev の Aurora に適用 | なし | 小 |
| C1-2 | REST API 基盤 | Lambda + API Gateway のプロジェクト構成、Cognito JWT 検証（Authorizer または Lambda 内検証）、共通エラーハンドリング | なし | 中 |
| C1-3 | ユーザー API | POST /api/users/upsert, GET /api/users/{id}。Cognito の sub/email から users を upsert | C1-1, C1-2 | 小 |
| C1-4 | ページ・同期 API（メタデータ） | GET /api/sync/pages?since=, POST /api/sync/pages。差分同期（LWW）。自分のページのみ | C1-1, C1-2 | 中 |
| C1-5 | ページ・コンテンツ API | GET /api/pages/{id}/content, PUT /api/pages/{id}/content（ydoc_state, version）。POST /api/pages, DELETE /api/pages/{id} | C1-1, C1-2 | 中 |
| C1-6 | ノート API | GET/POST/PUT/DELETE /api/notes, /api/notes/{id}/pages, /api/notes/{id}/members。ノート内新規ページ作成時は owner_id = notes.owner_id | C1-1, C1-2 | 中 |
| C1-7 | 検索 API | GET /api/search?q=&scope=shared。共有ノートの全文検索（pg_bigm）。Aurora に content_text とインデックスを用意 | C1-1 | 小〜中 |
| C1-8 | メディア API | POST /api/media/upload（Presigned URL）, POST /api/media/confirm。media テーブル連携 | C1-1, C1-2 | 小 |
| C1-9 | API テスト・デプロイ | 統合テスト、dev 環境へのデプロイ、環境変数・Secrets の整備 | C1-3〜C1-8 | 小 |

---

### Phase C2: データ移行

| # | タスク | 内容 | 依存 | 工数目安 |
|---|--------|------|------|----------|
| C2-1 | Turso エクスポート手順 | 全テーブル（pages, links, ghost_links, notes, note_pages, note_members）のエクスポートスクリプト・フォーマット定義 | なし | 小 |
| C2-2 | ID 変換・users 生成 | nanoid → UUID のマッピング表作成。Cognito sub / email から users レコード生成。pages.owner_id, notes.owner_id を users.id に変換 | C2-1 | 中 |
| C2-3 | Tiptap JSON → Y.Doc 変換 | 既存 pages.content（Tiptap JSON）を Y.Doc に一括変換（prosemirrorJSONToYDoc 等）。page_contents 用の ydoc_state + version を生成 | C2-2 | 中 |
| C2-4 | テキスト抽出・content_text | Y.Doc から全文検索用テキストを抽出し、page_contents.content_text に格納 | C2-3 | 小 |
| C2-5 | Aurora インポート | 変換済みデータを Aurora に投入。テーブル順序・制約・冪等性の考慮 | C1-1, C2-2, C2-3, C2-4 | 中 |
| C2-6 | ghost_links 拡張 | 既存データは original_target_page_id / original_note_id を NULL のまま投入。スキーマのみ対応 | C1-1 | 小 |
| C2-7 | 整合性検証 | 件数・サンプル比較・リンク整合性のチェックスクリプト | C2-5 | 小 |
| C2-8 | ロールバック手順書 | Turso を読み取り専用で残し、Aurora 不具合時に切り戻す手順を文書化 | - | 小 |

#### C2 補足: Tiptap JSON → Y.Doc 一括変換について

**結論: 可能です。** 既存の Tiptap JSON（`pages.content`）を Y.Doc に一括変換し、移行データとして扱えます。テストデータのみ・**一度だけ実行する作業**であり、通常のアプリ処理フローには含めません。

- **利用する API**: すでに導入している **`@tiptap/y-tiptap`** に `prosemirrorJSONToYDoc(schema, json)` が含まれています。追加パッケージは不要です。
- **手順のイメージ**:
  1. Turso エクスポートで取得した各ページの `content`（Tiptap JSON 文字列）をパースする。
  2. **schema**: 本番エディタと同じ Tiptap の Extension から生成した ProseMirror schema を使う（`createEditorExtensions` で Editor を生成し `editor.schema` を取得する、または Extension から schema を組み立てる）。
  3. `prosemirrorJSONToYDoc(schema, { type: "doc", content: [...] })` で Y.Doc を生成する。
  4. `Y.encodeStateAsUpdate(ydoc)` でバイナリ（ydoc_state）を取得し、`page_contents` 用のレコード（page_id, ydoc_state, version=1）を用意する。
- **空・不正 JSON**: `content` が空または不正な場合は、空の doc（`{ type: "doc", content: [] }` 相当）で Y.Doc を生成するなど、フォールバックをスクリプト内で定義する。
- **実行タイミング**: C2 のデータ移行時、C2-2（ID 変換・users 生成）のあと、C2-3 として「Turso の pages を読み、各 page の content を Y.Doc に変換し、page_contents 用のデータを出力する」スクリプトを**一度だけ**実行する。

---

### Phase C3: クライアント移行（Web）

| # | タスク | 内容 | 依存 | 工数目安 |
|---|--------|------|------|----------|
| C3-1 | StorageAdapter インターフェース定義 | 仕様 §6.1 の StorageAdapter（getAllPages, getPage, upsertPage, deletePage, getYDocState, saveYDocState, getLinks, saveLinks, searchPages, getLastSyncTime, setLastSyncTime, initialize, close）を TypeScript で定義 | なし | 小 |
| C3-2 | IndexedDBStorageAdapter 実装 | メタデータ: IndexedDB（my_pages）。Y.Doc: y-indexeddb。リンク: my_links, my_ghost_links。検索: テキストを IndexedDB に保持し JS でフィルタ（将来 MiniSearch 検討） | C3-1 | 大 |
| C3-3 | API クライアント実装 | REST API を呼ぶ apiClient（getSyncPages, postSyncPages, getPageContent, putPageContent, createPage, deletePage, getNotes, getNote, ...）。Cognito トークンをヘッダーに付与 | C1-4, C1-5, C1-6, C1-7 | 中 |
| C3-4 | ストレージ選択ロジック | createStorageAdapter() で isTauri() なら TauriStorageAdapter（Phase D で実装）、そうでなければ IndexedDBStorageAdapter。既存 getLocalClient の呼び出しを StorageAdapter に置き換える方針を決定 | C3-1, C3-2 | 小 |
| C3-5 | 個人ページを「Y.Doc のみ」に統一 | 個人ページでは **Hocuspocus を無効化**。CollaborationManager に mode: 'local' | 'collaborative' を導入。local 時は y-indexeddb のみ。保存は StorageAdapter.saveYDocState + upsertPage（メタデータ） | C3-2, C3-3 | 中 |
| C3-6 | 同期ロジックの差し替え | turso.ts の syncWithRemote を、API の GET/POST /api/sync/pages および GET/PUT /api/pages/{id}/content を使う実装に変更。last_sync は StorageAdapter で保持 | C3-2, C3-3, C3-5 | 大 |
| C3-7 | PageRepository の抽象化 | PageRepository が Turso Client に依存している部分を、StorageAdapter + apiClient に切り替え。ID は UUID 前提に（nanoid は移行期間の互換レイヤーが必要なら検討） | C3-2, C3-3 | 中 |
| C3-8 | 検索の切り替え | 個人: StorageAdapter.searchPages()（ローカル）。共有: apiClient.searchSharedNotes()。useGlobalSearch で両方を呼びマージ表示 | C3-2, C3-3, C1-7 | 中 |
| C3-9 | ノート一覧・ノート内ページの API 化 | ノート一覧・ノート詳細・ノート内ページはローカル DB に頼らず、API から取得。useNoteQueries の data source を apiClient に変更 | C3-3, C1-6 | 中 |
| C3-10 | 型・ID の UUID 化 | フロントの Page / Note 型で id を string（UUID）に統一。nanoid 生成箇所を uuid に変更 | C2-2 と整合 | 小〜中 |
| C3-11 | turso.ts の段階的削除 | リモート接続・sync 関連を apiClient + StorageAdapter に移行後、turso.ts はローカル用 sql.js ラッパーのみ残すか、完全に StorageAdapter に置き換えて削除 | C3-6, C3-7, C3-9 | 中 |

---

### Phase C4: Hocuspocus 永続化

| # | タスク | 内容 | 依存 | 工数目安 |
|---|--------|------|------|----------|
| C4-1 | Hocuspocus の Aurora 永続化 | onLoadDocument で page_contents から ydoc_state を取得。onStoreDocument / 定期保存・切断時保存で page_contents に書き込み | C1-1, C1-5 | 中 |
| C4-2 | Redis 連携 | マルチインスタンス時の Pub/Sub（Y.Doc 更新の中継）。ElastiCache は Terraform 済み想定 | C4-1 | 中 |
| C4-3 | 認可の統一 | Hocuspocus 接続時の JWT 検証と、ページが属するノートへの**編集権限**（ノートの editor ロール）チェック | C1-6, C1-2 | 小 |

---

### Phase C 補足: コラボ・共有ノート編集

| # | タスク | 内容 | 依存 | 工数目安 |
|---|--------|------|------|----------|
| C-Collab-1 | 共有ノート内ページの「編集」を Hocuspocus に統一 | NotePageView を閲覧専用から編集可能に。**編集可能はノートの editor ロールのメンバーのみ**（access.canEdit）。編集時は HocuspocusProvider のみ使用（y-indexeddb は使わない）。CollaborationManager の mode='collaborative' をノートコンテキストで使用 | C3-5, C4-1 | 中 |
| C-Collab-2 | 個人ページで Hocuspocus を完全に外す | PageEditorView で「自分のページ」のときは mode='local' のみ。WebSocket 接続なし | C3-5 | 小 |

---

### Phase D: Tauri Desktop（概要・主要タスク）

| # | タスク | 内容 | 依存 | 工数目安 |
|---|--------|------|------|----------|
| D1 | Tauri 2.0 プロジェクト初期化 | 既存 React を WebView に配置。ビルド・起動確認 | なし | 小 |
| D2 | TauriStorageAdapter 実装 | Rust 側で SQLite（rusqlite）+ FTS5。Tauri Commands で WebView から呼び出し。メタデータ・Y.Doc（BLOB or FS）・リンク・検索 | C3-1, D1 | 大 |
| D3 | Rust WebSocket クライアント | tokio-tungstenite + yrs + y-sync で Hocuspocus に接続。Tauri Commands: connect_hocuspocus, send_ydoc_update, get_ydoc_state。Events: ydoc-remote-update, collaboration-status | D1, C4-1 | 大 |
| D4 | 認証フロー | WebView 内で Cognito Hosted UI。コールバックをインターセプトしてトークンを Rust に渡し、tauri-plugin-store 等でセキュア保存。リフレッシュは Rust 側 | D1 | 中 |
| D5 | メディアのローカルキャッシュ | ~/.zedi/media/ にキャッシュ。media_registry。同期時に S3 アップロード。Presigned URL は API 経由 | C1-8, D2 | 中 |
| D6 | Desktop 固有機能 | グローバルホットキー、システムトレイ、自動起動（任意） | D1 | 小〜中 |

---

### Phase E: Tauri Mobile（概要）

| # | タスク | 内容 | 依存 | 工数目安 |
|---|--------|------|------|----------|
| E1 | Tauri Mobile ビルド | iOS / Android ビルド設定 | D1 相当 | 中 |
| E2 | Share Sheet 連携 | Deep Link / Intent / Share Extension | E1 | 中 |
| E3 | Mobile UI 最適化 | タッチ・ナビゲーション・FAB 等 | E1 | 中 |

---

## 3. 推奨実施順序（Web 完了まで）

1. **C1**（API 構築）→ **C2**（データ移行）は並行しにくいため、C1 を先に完了させる。
2. **C2** は C1-1（DDL）完了後、C1 の API が dev で動き始めてから実施すると安全。
3. **C3** は C1-4, C1-5, C1-6 が利用可能になってから開始。C3-1, C3-2（StorageAdapter・IndexedDB）は C1 と並行して着手可能。
4. **C4** は C3 の「個人ページを Y.Doc のみ」と「共有ノート編集を Hocuspocus に」の整理が進んでからでもよい。ただし C4-1 がないと共有ノートの永続化ができないため、共有ノート編集を本格利用する前に C4 を完了させる。
5. **C-Collab-1 / C-Collab-2** は C3-5 と C4-1 の後で一気にやるか、C3-5 で個人を local のみにしたあと C-Collab-1 で共有を Hocuspocus 編集対応する、という順が自然。

**簡易ガント目安（Web のみ）:**

- C1: 2〜3 週間  
- C2: 1〜2 週間（C1 と一部並行可）  
- C3: 3〜5 週間（C1 完了後から本格化）  
- C4: 1〜2 週間  

---

## 4. Y.Doc と Tiptap JSON について

### 4.1 Y.Doc とは

**Y.Doc** は、[Y.js](https://github.com/yjs/yjs) が提供する **CRDT（Conflict-free Replicated Data Type）** のドキュメント形式です。

- **中身**: ドキュメントの構造（テキスト・ノード）を、複数クライアント間で「誰がいつ編集しても矛盾なくマージできる」形で保持するバイナリデータです。
- **Tiptap との関係**: Tiptap の Collaboration 拡張は、エディタの内容を Y.Doc の一部（`Y.XmlFragment`）にバインドします。編集すると Y.Doc が更新され、逆に Y.Doc が更新されるとエディタに反映されます。
- **仕様で Y.Doc を採用する理由**: 個人ページの**複数デバイス同期**（オフライン編集の競合を CRDT マージで解消）と、共有ノートの**リアルタイム共同編集**を、**同じコンテンツ形式**で扱うためです。保存・取得は「Y.Doc のバイナリ（ydoc_state）」1 種類に統一できます。

### 4.2 既存の Tiptap JSON では問題があるか

**Tiptap JSON 単体**では次の点で不足があります。

- **同時編集のマージ**: 複数人が同じページを編集したとき、JSON をそのまま上書きすると片方の変更が消えます。CRDT ではないため「両方の変更を残す」マージができません。
- **オフライン競合**: オフラインで編集したあと別デバイスでも編集があると、どちらを正とするかのルール（LWW など）を自前で実装する必要があり、データ損失のリスクがあります。

**Y.Doc に統一する利点**は、個人ページの同期時も「サーバーとローカルの Y.Doc を `Y.applyUpdate` でマージする」だけで安全に競合解消できること、そして共有ノートのリアルタイム編集と**同じ基盤**で扱えることです。  
そのため、移行後は**新規作成分はすべて Y.Doc のみ**とし、Tiptap JSON 用の互換レイヤーは設けません（シンプルな実装方針）。

---

## 5. 確定した方針・回答

以下、質問への回答および「シンプルで矛盾のない設計」に基づく確定方針です。

### 5.1 データ・ID

| 項目 | 確定内容 |
|------|----------|
| **移行時の ID** | 既存データは **UUID に変換してから Aurora に投入**する。フロントは**移行後は常に UUID のみ**を扱う前提とする。 |
| **users テーブル** | 提案どおり。移行時は既存の user_id（Cognito sub）に対応する **users レコードをバッチで作成**し、pages.owner_id / notes.owner_id を **users.id (UUID)** に紐づける。 |

### 5.2 個人ページと Y.Doc

| 項目 | 確定内容 |
|------|----------|
| **個人ページの初回表示** | 「ページを開く → StorageAdapter.getYDocState(pageId) → なければ apiClient.getPageContent(pageId) → Y.applyUpdate → y-indexeddb に保存 → 表示」のフローとする。 |
| **Tiptap JSON 廃止** | 移行後は**新規作成ページは Y.Doc のみ**。Y.Doc と Tiptap JSON の両対応は設けず、互換レイヤーは持たない（シンプルに統一）。**移行時**は既存の Tiptap JSON（pages.content）を **Y.Doc に一括変換**し、page_contents として投入する。この変換はテストデータ向けの**一度だけ実行する作業**であり、本番の通常処理には含めない。 |

### 5.3 共有ノート

| 項目 | 確定内容 |
|------|----------|
| **編集権限** | 共有ノート内ページの編集は**ノートのメンバーで editor ロール**のユーザーのみ可能とする。NotePageView の編集可能判定は **access.canEdit**（ノートの editor 権限）に合わせる。 |
| **ノート内での新規ページ作成** | クライアントは「ノート内で＋ページ」で POST /api/notes/{id}/pages に `{ "title": "..." }` を送り、**返却された page を一覧に追加**する。作成直後の Y.Doc は空で、Hocuspocus のルームは初回接続時に作成される想定でよい。 |

### 5.4 検索

| 項目 | 確定内容 |
|------|----------|
| **個人ページのローカル検索** | **Y.Doc 保存時にテキストを抽出**し、IndexedDB の search_index（または同等）に持たせる。検索時はそのテキストのみを使用する。**Page 型の content は廃止**し、本文は Y.Doc / page_contents のみとする。 |

### 5.5 優先度・スコープ・運用

| 項目 | 確定内容 |
|------|----------|
| **Phase C の最小スコープ** | まず**個人ページの表示・編集・同期**を API + StorageAdapter + Y.Doc に切り替える。共有ノートのリアルタイム編集（Hocuspocus 永続化含む）は C4 / C-Collab で対応する。共有ノートは、C-Collab 完了までは「閲覧のみ、編集は /page/:id に飛ばす」現行のままでもよい。 |
| **本番 Turso の停止** | C3 の本番相当の動作確認が終わった後に Turso を廃止し、Aurora + API のみとする。**ロールバック用に Turso は読み取り専用でしばらく残す**想定とする。 |
| **PRD / 他仕様の更新** | Phase C の設計が固まった時点で、§17 に挙がっている PRD・realtime-collaboration-spec・zedi-future-considerations の**必要な箇所を一括で更新**する（シンプルに一括でよい）。 |

---

## 6. 次のアクション提案

2. **C1-2〜C1-6** を並行可能な範囲で進め、API の叩き台を用意する。  
3. **C3-1（StorageAdapter インターフェース）** を早期に定義し、C3-2（IndexedDB 実装）と C1 を並行して進められるようにする。  
4. タスクの「工数目安」はあくまで目安。実際のスプリントでは C1 / C3 をさらにストーリー単位に分解して見積もることを推奨する。

---

## 7. 関連ドキュメント

| ドキュメント | 用途 |
|-------------|------|
| docs/specs/zedi-rearchitecture-spec.md | リアーキテクチャ仕様の正本 |
| docs/specs/zedi-data-structure-spec.md | DB スキーマ・データ構造 |
| docs/plans/20260208/turso-to-aurora-migration-decisions.md | 移行で確定している方針 |
| docs/plans/20260208/phase-c-work-breakdown.md | Phase C の概要 |
| src/lib/turso.ts | 現行ローカル・同期・Turso 直結 |
| src/lib/collaboration/CollaborationManager.ts | 現行 Y.Doc・Hocuspocus 利用 |
