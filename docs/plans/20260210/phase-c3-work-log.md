# Phase C3 作業ログ（クライアント移行 Web）

**作業期間:** 2026-02-10 〜  
**対象:** C3-1 〜 C3-11（StorageAdapter、API クライアント、同期・検索の差し替え等）  
**前提ドキュメント:** [タスク細分化](rearchitecture-task-breakdown.md) / [リアーキテクチャ仕様書](../specs/zedi-rearchitecture-spec.md) / [データ構造仕様書](../specs/zedi-data-structure-spec.md) / [Phase C2 作業ログ](phase-c2-work-log.md)

---

## 1. 作業サマリー

| タスク | 内容 | 状態 |
|--------|------|------|
| **C3-1** | StorageAdapter インターフェース定義 | 完了 |
| **C3-2** | IndexedDBStorageAdapter 実装 | 完了 |
| **C3-3** | API クライアント実装 | 完了 |
| **C3-4** | ストレージ選択ロジック（createStorageAdapter） | 完了 |
| **C3-5** | 個人ページを「Y.Doc のみ」に統一 | 完了 |
| **C3-6** | 同期ロジックの差し替え | 完了 |
| **C3-7** | PageRepository の抽象化 | 完了 |
| **C3-8** | 検索の切り替え | 完了 |
| **C3-9** | ノート一覧・ノート内ページの API 化 | 完了 |
| **C3-10** | 型・ID の UUID 化 | 完了 |
| **C3-11** | turso.ts の段階的削除 | 完了 |

---

## 2. 実施内容の詳細

### 2.1 C3-1: StorageAdapter インターフェース定義

- **目的**  
  仕様 §6.1 に基づき、プラットフォーム抽象化レイヤー用の `StorageAdapter` を TypeScript で定義する。
- **成果物**
  - **型:** `src/lib/storageAdapter/types.ts`  
    `PageMetadata`, `Link`, `GhostLink`, `SearchResult`（ID は UUID、タイムスタンプは number (ms)）
  - **インターフェース:** `src/lib/storageAdapter/StorageAdapter.ts`  
    getAllPages, getPage, upsertPage, deletePage / getYDocState, saveYDocState, getYDocVersion / getLinks, getBacklinks, saveLinks / getGhostLinks, saveGhostLinks / searchPages, updateSearchIndex / getLastSyncTime, setLastSyncTime / initialize(userId), close()
- **参照**  
  zedi-rearchitecture-spec.md §6.1

### 2.2 C3-2: IndexedDBStorageAdapter 実装

- **目的**  
  メタデータは IndexedDB（my_pages）、Y.Doc は y-indexeddb、リンクは my_links / my_ghost_links、検索は IndexedDB 上のテキストで JS フィルタ（将来 MiniSearch 検討）。
- **成果物**
  - **実装:** `src/lib/storageAdapter/IndexedDBStorageAdapter.ts`  
    全メソッドを実装。DB 名は `zedi-storage-${userId}`（initialize(userId) でオープン）。モジュールレベルの単一 DB インスタンスを共有（createStorageAdapter で 1 インスタンス想定）。
  - **IndexedDB スキーマ（version 1）**  
    - **my_pages** — keyPath: id。インデックス: updated_at, created_at。値は PageMetadata 相当（camelCase）。
    - **my_links** — keyPath: [sourceId, targetId]。インデックス: by_source, by_target。
    - **my_ghost_links** — keyPath: [linkText, sourcePageId]。インデックス: by_source。
    - **search_index** — keyPath: pageId。値: { pageId, text }。
    - **meta** — keyPath: key。lastSyncTime は key="lastSyncTime", value=number。
    - **ydoc_versions** — keyPath: pageId。saveYDocState 時に version を保存、getYDocVersion で参照。
  - **Y.Doc**  
    ドキュメント名は CollaborationManager と同一の `zedi-doc-${pageId}`。getYDocState は一時 Y.Doc + IndexeddbPersistence でロードし、Y.encodeStateAsUpdate で返して破棄。saveYDocState は Y.applyUpdate 後に IndexeddbPersistence で永続化し、ydoc_versions に version を保存。
  - **検索**  
    search_index を getAll し、クエリ文字列をテキストに含むものをフィルタ。該当 pageId の title を my_pages から取得して SearchResult を返す。
- **依存**  
  yjs, y-indexeddb。既存 package.json に含まれる。

### 2.3 C3-3: API クライアント実装

- **目的**  
  REST API（C1-4, C1-5, C1-6, C1-7）を呼ぶクライアント。Cognito id_token を `Authorization: Bearer` で付与する。
- **成果物**
  - **型:** `src/lib/api/types.ts`  
    SyncPagesResponse, PostSyncPagesBody/Response, PageContentResponse, PutPageContentBody, CreatePageBody/Response, SearchSharedResponse 等（API の snake_case をそのまま定義）
  - **クライアント:** `src/lib/api/apiClient.ts`  
    `createApiClient(options?)` — options: `getToken?: () => Promise<string | null>`, `baseUrl?: string`
  - **提供メソッド**  
    getSyncPages(since?), postSyncPages(body), getPageContent(pageId), putPageContent(pageId, body), createPage(body?), deletePage(pageId), getNotes(), getNote(noteId), searchSharedNotes(q)
  - **エラー:** `ApiError`（message, status, code）。401 は未認証。
- **環境変数**  
  `VITE_ZEDI_API_BASE_URL`（未設定時は空＝同一オリジン想定）。`src/vite-env.d.ts` に型を追加済み。
- **利用例**  
  `createApiClient({ getToken: () => getIdToken() })` で Cognito トークンを渡す。

### 2.4 C3-4: ストレージ選択ロジック

- **目的**  
  `createStorageAdapter()` で `isTauri()` のときは TauriStorageAdapter（Phase D）、それ以外は IndexedDBStorageAdapter を返す。
- **成果物**
  - **ファクトリ:** `src/lib/storageAdapter/createStorageAdapter.ts`  
    `isTauri()` は `'__TAURI_INTERNALS__' in window` で判定。Web では `new IndexedDBStorageAdapter()` を返す。Tauri 時は現時点で throw（Phase D で実装）。
  - **エクスポート:** `src/lib/storageAdapter/index.ts` から createStorageAdapter と型を re-export。

### 2.5 C3-5: 個人ページを「Y.Doc のみ」に統一

- **目的**  
  個人ページでは Hocuspocus を無効化し、Y.Doc + y-indexeddb のみで編集。同期は手動/起動時のみ API 経由（C3-6 で差し替え）。
- **成果物**
  - **CollaborationManager:** `src/lib/collaboration/CollaborationManager.ts`  
    コンストラクタに `options?: { mode?: 'local' | 'collaborative' }` を追加。`mode === 'local'` のときは `idbProvider.on('synced')` で WebSocket に接続せず、`updateState({ status: 'connected', isSynced: true })` のみ。`mode === 'collaborative'` のときは従来どおり `connectWebSocket()` を呼ぶ。
  - **型:** `src/lib/collaboration/types.ts` に `CollaborationMode = 'local' | 'collaborative'` を追加。`UseCollaborationOptions` に `mode?: CollaborationMode` を追加。
  - **useCollaboration:** `src/hooks/useCollaboration.ts` で `mode` をオプションに追加。デフォルトは `'local'`。CollaborationManager に `{ mode }` を渡す。
  - **PageEditorView:** `/page/:id` は個人ページのため、useCollaboration のデフォルト `mode: 'local'` のまま変更なし。共有ノート内編集（C-Collab）では `mode: 'collaborative'` を渡す想定。
- **結果**  
  個人ページを開いても Hocuspocus への WebSocket 接続は行われず、Y.Doc は y-indexeddb のみで永続化される。

### 2.6 C3-6: 同期ロジックの差し替え

- **目的**  
  turso.ts の syncWithRemote の代わりに、GET/POST /api/sync/pages および lastSyncTime を StorageAdapter で保持する API 同期を実装する。Y.Doc の GET/PUT /api/pages/:id/content はページ開閉時のオンデマンドで行う想定（本タスクではメタデータ同期のみ）。
- **成果物**
  - **syncWithApi:** `src/lib/sync/syncWithApi.ts`  
    `syncWithApi(adapter, api, userId, options?)` — adapter.getLastSyncTime() で since を取得。api.getSyncPages(since) で PULL。レスポンスの pages/links/ghost_links を adapter に適用（upsertPage, saveLinks/saveGhostLinks を source 単位で集約）。PUSH: adapter.getAllPages() と全 page の getLinks/getGhostLinks で収集し、api.postSyncPages(body) で送信。adapter.setLastSyncTime(server_time) で更新。options.forceFullSyncWhenLocalEmpty でローカル 0 件時は since 省略。
  - **runAuroraSync:** 同ファイル。`runAuroraSync(userId, getToken, options?)` — createStorageAdapter() と createApiClient({ getToken }) を組み立て、adapter.initialize(userId) のうえで syncWithApi を実行。C3-7 で usePageQueries から runAuroraSync を呼び、読み取りを StorageAdapter に切り替える想定。
  - **index:** `src/lib/sync/index.ts` で syncWithApi, runAuroraSync, isSyncInProgress, SyncWithApiOptions を export。
- **呼び出し**  
  現時点では usePageQueries は従来どおり syncWithRemote（Turso）を呼ぶ。C3-7 で PageRepository を StorageAdapter + apiClient に差し替え、同期を runAuroraSync に切り替える。

### 2.7 C3-7: PageRepository の抽象化

- **目的**  
  PageRepository が Turso Client に依存している部分を StorageAdapter + apiClient に切り替え、usePageQueries から runAuroraSync を呼ぶようにする。
- **成果物**
  - **IPageRepository:** `src/lib/pageRepository.ts` に共通インターフェースを追加。createPage, getPage, getPages, getPagesSummary, getPagesByIds, getPageByTitle, checkDuplicateTitle, updatePage, deletePage, searchPages, addLink, removeLink, getOutgoingLinks, getBacklinks, getLinks, addGhostLink, removeGhostLink, getGhostLinkSources, getGhostLinks, promoteGhostLink。
  - **StorageAdapterPageRepository:** `src/lib/pageRepository/StorageAdapterPageRepository.ts` を新規作成。adapter + api + userId で上記メソッドを実装。getPage/getPages 等は content を "" で返す（本文は Y.Doc）。createPage は api.createPage 後に adapter.upsertPage。deletePage は adapter.deletePage + api.deletePage。同期は runAuroraSync に集約。
  - **useRepository:** `src/hooks/usePageQueries.ts` を変更。createStorageAdapter() と createApiClient({ getToken }) を ref で保持し、effectiveUserId で adapter.initialize()。getRepository は StorageAdapterPageRepository(adapter, api, effectiveUserId) を返す。戻り型は IPageRepository。
  - **初期同期・手動同期:** 初期同期と useSync の sync で runAuroraSync(userId, getToken) を呼ぶ。sync 状態は getSyncStatus / subscribeSyncStatus を syncWithApi 側で実装し、useSyncStatus は @/lib/sync から取得。
- **結果**  
  ページ一覧・詳細・作成・更新・削除・検索・リンク・ゴーストリンクはすべて StorageAdapter + API 経由。Turso と sql.js は usePageQueries からは使用されない（turso.ts は他で参照されている場合は C3-11 で整理）。

### 2.8 C3-8: 検索の切り替え

- **目的**  
  useGlobalSearch で個人は StorageAdapter.searchPages（ローカル）、共有は apiClient.searchSharedNotes（API）を呼び、結果をマージして表示する。
- **成果物**
  - **API 拡張:** `terraform/modules/api/lambda/handlers/search.mjs` のレスポンスに `note_id` を追加。共有結果から `/note/:noteId/page/:pageId` へ遷移するため。
  - **型:** `src/lib/api/types.ts` の SearchSharedResponse.results に `note_id: string` を追加。
  - **フック:** `src/hooks/usePageQueries.ts` に `useSearchSharedNotes(query)` を追加。createApiClient({ getToken }) で GET /api/search?q=&scope=shared を呼ぶ。queryKey: pageKeys.searchShared(query)、enabled: isSignedIn && query.trim().length > 0。
  - **useGlobalSearch:** `src/hooks/useGlobalSearch.ts` で useSearchPages（個人）と useSearchSharedNotes（共有）の両方を利用。結果を `GlobalSearchResultItem[]`（pageId, noteId?, title, highlightedText, matchType）に正規化し、スコアでソートして最大 10 件を返す。
  - **GlobalSearch:** `src/components/search/GlobalSearch.tsx` で handleSelect(pageId, noteId?) を実装。noteId ありなら `/note/${noteId}/page/${pageId}`、なしなら `/page/${pageId}` へ遷移。検索結果リストは GlobalSearchResultItem の pageId / noteId / title / highlightedText / matchType / sourceUrl を表示。
- **結果**  
  グローバル検索で個人ページ（IndexedDB）と共有ノート内ページ（API）の両方がマージ表示され、選択時に適切なルートへ遷移する。

### 2.9 C3-9: ノート一覧・ノート内ページの API 化

- **目的**  
  ノート一覧・ノート詳細・ノート内ページはローカル DB（Turso/sql.js）に頼らず API から取得。useNoteQueries のデータソースを apiClient に変更する。
- **成果物（バックエンド）**
  - **listNotes:** `LIST_NOTES_SQL` に member_role（owner / nm.role）、page_count、member_count を追加。レスポンスを `rowToNoteListItem` で返す（C3-9 互換）。
  - **getNote:** `GET_CURRENT_USER_ROLE_SQL` で current_user_role を取得し、レスポンスに `current_user_role` を追加。
  - **updateNoteMember:** PUT /api/notes/:id/members/:email（body: { role }）を追加。`UPDATE_NOTE_MEMBER_ROLE_SQL` と router に PUT ルートを追加。
- **成果物（フロント）**
  - **型:** `src/lib/api/types.ts` に NoteListItem（role, page_count, member_count  optional）、GetNoteResponse（current_user_role, pages）、NoteMemberItem を追加。
  - **apiClient:** getNoteMembers、createNote、updateNote、deleteNote、addNotePage、removeNotePage、addNoteMember、removeNoteMember、updateNoteMember を追加。getNotes / getNote の戻り型を上記型に合わせる。
  - **useNoteQueries:** Turso と useNoteRepository を廃止。useNoteApi() で createApiClient({ getToken }) と userId / userEmail / isLoaded / isSignedIn を提供。useNotes → api.getNotes() を NoteSummary[] にマップ。useNote → api.getNote() を NoteWithAccess にマップ（current_user_role で buildAccessFromApi）。useNotePages → api.getNote().pages を PageSummary[] に。useNotePage → api.getNote().pages から該当ページを Page に。useNoteMembers → api.getNoteMembers() を NoteMember[] に。全 mutation を api.* に差し替え。
  - **NotesSection:** useNoteRepository を useNoteApi に変更。
- **結果**  
  ノート一覧・詳細・ページ一覧・メンバー一覧および作成・更新・削除・ページ追加削除・メンバー招待・ロール変更・メンバー削除はすべて API 経由。useNoteQueries から Turso と useTurso は参照されない。

### 2.10 C3-10: 型・ID の UUID 化

- **目的**  
  フロントの Page / Note 型で id を string（UUID）に統一。nanoid 生成箇所を uuid（v4）に変更。C2-2（Aurora UUID）と整合させる。
- **成果物**
  - **依存:** `uuid`（^13.0.0）を追加。`nanoid` を削除。
  - **pageRepository.ts:** `nanoid()` を `uuidv4()` に変更（PageRepository.createPage）。Turso 用クラスだがテスト・残存参照用に UUID 化。
  - **noteRepository.ts:** `nanoid()` を `uuidv4()` に変更（NoteRepository.createNote）。
  - **pageStore.ts:** `nanoid()` を `uuidv4()` に変更（createPage）。
- **結果**  
  新規作成されるページ・ノートの ID はすべて UUID v4。型は従来どおり `id: string`（UUID 形式を前提）。

### 2.11 C3-11: turso.ts の段階的削除

- **目的**  
  リモート接続・同期は apiClient + StorageAdapter（runAuroraSync）に移行済みのため、turso.ts を削除する。
- **成果物**
  - **sync:** `src/lib/sync/syncWithApi.ts` に `hasCompletedFirstSync` フラグを追加。初回 sync 完了（成功・失敗問わず）で true にし、`hasNeverSynced()` を export。`src/lib/sync/index.ts` から re-export。
  - **PageGrid:** `src/components/page/PageGrid.tsx` の `hasNeverSynced` を `@/lib/sync` から取得するよう変更。
  - **削除:** `src/lib/turso.ts`、`src/hooks/useTurso.ts`、`src/lib/localDatabase.ts` を削除。useNoteQueries / usePageQueries は既に API および StorageAdapter 利用のため参照なし。
- **結果**  
  ページ・ノートの読み書きと同期はすべて StorageAdapter + apiClient 経由。Turso および sql.js ラッパー（turso.ts）はクライアントから削除済み。テスト用の PageRepository / createTestClient は `@libsql/client` の in-memory クライアントを引き続き使用。

---

## 3. 成果物一覧（パス）

| 種別 | パス | 備考 |
|------|------|------|
| C3-1 型 | `src/lib/storageAdapter/types.ts` | PageMetadata, Link, GhostLink, SearchResult |
| C3-1 インターフェース | `src/lib/storageAdapter/StorageAdapter.ts` | StorageAdapter |
| C3-2 実装 | `src/lib/storageAdapter/IndexedDBStorageAdapter.ts` | 全メソッド実装済み（IndexedDB + y-indexeddb） |
| C3-3 型 | `src/lib/api/types.ts` | API リクエスト/レスポンス型 |
| C3-3 クライアント | `src/lib/api/apiClient.ts` | createApiClient, ApiError |
| C3-3 エントリ | `src/lib/api/index.ts` | re-export |
| C3-4 ファクトリ | `src/lib/storageAdapter/createStorageAdapter.ts` | createStorageAdapter, isTauri |
| C3-4 エントリ | `src/lib/storageAdapter/index.ts` | re-export |
| 環境変数型 | `src/vite-env.d.ts` | VITE_ZEDI_API_BASE_URL 追加 |
| C3-5 CollaborationManager | `src/lib/collaboration/CollaborationManager.ts` | mode: local \| collaborative |
| C3-5 型 | `src/lib/collaboration/types.ts` | CollaborationMode, UseCollaborationOptions.mode |
| C3-5 フック | `src/hooks/useCollaboration.ts` | mode オプション（デフォルト local） |
| C3-6 sync | `src/lib/sync/syncWithApi.ts` | syncWithApi, runAuroraSync |
| C3-6 エントリ | `src/lib/sync/index.ts` | re-export |
| C3-7 インターフェース | `src/lib/pageRepository.ts` | IPageRepository 追加 |
| C3-7 実装 | `src/lib/pageRepository/StorageAdapterPageRepository.ts` | adapter + api |
| C3-7 フック | `src/hooks/usePageQueries.ts` | useRepository, useSync 差し替え |
| C3-8 API | `terraform/.../handlers/search.mjs` | レスポンスに note_id 追加 |
| C3-8 型 | `src/lib/api/types.ts` | SearchSharedResponse.results.note_id |
| C3-8 フック | `src/hooks/usePageQueries.ts` | useSearchSharedNotes |
| C3-8 フック | `src/hooks/useGlobalSearch.ts` | 個人+共有マージ、GlobalSearchResultItem |
| C3-8 UI | `src/components/search/GlobalSearch.tsx` | handleSelect(pageId, noteId?) |
| C3-9 API listNotes | `terraform/.../handlers/notes.mjs` | role, page_count, member_count |
| C3-9 API getNote | `terraform/.../handlers/notes.mjs` | current_user_role |
| C3-9 API updateNoteMember | `terraform/.../handlers/notes.mjs`, router.mjs | PUT /api/notes/:id/members/:email |
| C3-9 型 | `src/lib/api/types.ts` | NoteListItem, GetNoteResponse, NoteMemberItem |
| C3-9 apiClient | `src/lib/api/apiClient.ts` | getNoteMembers, createNote, updateNote, deleteNote, addNotePage, removeNotePage, addNoteMember, removeNoteMember, updateNoteMember |
| C3-9 フック | `src/hooks/useNoteQueries.ts` | useNoteApi, API ベースの useNotes / useNote / useNotePages / useNotePage / useNoteMembers と全 mutation |
| C3-9 UI | `src/components/note/NotesSection.tsx` | useNoteApi |
| C3-10 依存 | package.json | uuid 追加、nanoid 削除 |
| C3-10 ID 生成 | pageRepository.ts, noteRepository.ts, pageStore.ts | nanoid → uuid v4 |
| C3-11 sync | src/lib/sync/syncWithApi.ts, index.ts | hasNeverSynced 追加 |
| C3-11 UI | src/components/page/PageGrid.tsx | hasNeverSynced を @/lib/sync から取得 |
| C3-11 削除 | turso.ts, useTurso.ts, localDatabase.ts | 削除 |

---

## 4. 今後の作業（推奨順）

1. ~~**C3-8** useGlobalSearch で個人は StorageAdapter.searchPages、共有は apiClient.searchSharedNotes をマージ~~ 完了
2. ~~**C3-9** useNoteQueries のデータソースを apiClient（getNotes, getNote）に変更~~ 完了
3. ~~**C3-10** Page / Note の id を UUID に統一、nanoid 生成箇所を uuid に変更~~ 完了
4. ~~**C3-11** turso.ts のリモート・同期を廃止し、StorageAdapter + runAuroraSync に集約後、turso.ts を削除~~ 完了

---

## 5. 関連ドキュメント

| ドキュメント | 用途 |
|-------------|------|
| [rearchitecture-task-breakdown.md](rearchitecture-task-breakdown.md) | タスク細分化・Phase C3 一覧 |
| [zedi-rearchitecture-spec.md](../specs/zedi-rearchitecture-spec.md) | 仕様 §6 ストレージ、§13 API |
| [zedi-data-structure-spec.md](../specs/zedi-data-structure-spec.md) | DB スキーマ・エンティティ |
| [phase-c1-work-log.md](phase-c1-work-log.md) | C1 API エンドポイント・ハンドラー |
| [phase-c2-work-log.md](phase-c2-work-log.md) | C2 データ移行完了・Aurora 投入済み |

---

## 6. 作業履歴（実施日・内容）

| 日付 | 実施内容 |
|------|----------|
| **2026-02-10** | **C3-1, C3-3, C3-4 実施** — ① StorageAdapter インターフェースと型（types.ts, StorageAdapter.ts）を定義。② IndexedDBStorageAdapter をスタブで追加し、createStorageAdapter() で Web 時はこれを返すよう実装。③ API クライアント（apiClient.ts, types.ts）を新規作成。getSyncPages, postSyncPages, getPageContent, putPageContent, createPage, deletePage, getNotes, getNote, searchSharedNotes を実装。Cognito トークンは getToken で注入。VITE_ZEDI_API_BASE_URL を vite-env.d.ts に追加。④ Phase C3 作業ログ（本ドキュメント）を新規作成。 |
| **2026-02-10** | **C3-2 実施** — IndexedDBStorageAdapter をフル実装。IndexedDB に my_pages / my_links / my_ghost_links / search_index / meta / ydoc_versions を定義。Y.Doc は y-indexeddb（zedi-doc-{pageId}）で getYDocState / saveYDocState を実装。検索は search_index のテキストを JS でフィルタし my_pages から title を取得。lastSyncTime は meta ストアに保存。 |
| **2026-02-10** | **C3-5 実施** — CollaborationManager に mode: 'local' \| 'collaborative' を導入。local 時は idb synced 後に WebSocket に接続せず status='connected', isSynced=true のみ設定。useCollaboration に mode オプションを追加（デフォルト 'local'）。PageEditorView は従来どおり useCollaboration を利用し、個人ページでは Hocuspocus 接続なしに。types に CollaborationMode を追加、index から export。 |
| **2026-02-10** | **C3-6 実施** — API 同期モジュールを新設。syncWithApi(adapter, api, userId) で GET /api/sync/pages?since= の PULL と adapter への適用、adapter からの収集と POST /api/sync/pages の PUSH、lastSyncTime の adapter での保持を実装。runAuroraSync(userId, getToken) で createStorageAdapter + createApiClient を組み合わせて実行。src/lib/sync/syncWithApi.ts と index.ts を追加。呼び出しの切り替え（usePageQueries → runAuroraSync）は C3-7 で実施予定。 |
| **2026-02-10** | **C3-7 実施** — PageRepository を抽象化。IPageRepository を pageRepository.ts に追加。StorageAdapterPageRepository を pageRepository/StorageAdapterPageRepository.ts に実装（adapter + api + userId）。useRepository を StorageAdapter + createApiClient で初期化し、getRepository で StorageAdapterPageRepository を返すように変更。初期同期・手動同期を runAuroraSync に統一。useSyncStatus は @/lib/sync の getSyncStatus / subscribeSyncStatus を使用。syncWithApi に SyncStatus と setSyncStatus を追加。 |
| **2026-02-10** | **C3-8 実施** — 検索の切り替え。検索 API レスポンスに note_id を追加（search.mjs, types.ts）。useSearchSharedNotes を usePageQueries に追加。useGlobalSearch で useSearchPages（個人）と useSearchSharedNotes（共有）をマージし、GlobalSearchResultItem[] で返す。GlobalSearch で handleSelect(pageId, noteId?) により共有は /note/:noteId/page/:pageId、個人は /page/:pageId へ遷移。 |
| **2026-02-10** | **C3-9 実施** — ノート一覧・ノート内ページの API 化。listNotes に role / page_count / member_count を追加。getNote に current_user_role を追加。PUT /api/notes/:id/members/:email（updateNoteMember）を追加。apiClient に getNoteMembers と全ノート mutation を追加。useNoteQueries を Turso 廃止し useNoteApi + api ベースに全面変更。NotesSection を useNoteApi に変更。 |
| **2026-02-10** | **C3-10 実施** — 型・ID の UUID 化。uuid パッケージを追加し、pageRepository / noteRepository / pageStore の ID 生成を nanoid から uuid v4 に変更。nanoid 依存を削除。 |
| **2026-02-10** | **C3-11 実施** — turso.ts の段階的削除。sync に hasNeverSynced を追加し PageGrid を @/lib/sync に切り替え。turso.ts / useTurso.ts / localDatabase.ts を削除。 |

---

**以上、Phase C3 の C3-1 〜 C3-11 の作業ログとする。Phase C3 は完了。**
