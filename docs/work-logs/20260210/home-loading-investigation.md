# /home ページ一覧がずっとローディングになる問題の調査（2026-02-10）

## 概要

`/home` でページ一覧を取得する際、すでにコンテンツが取得できているはずなのにローディング表示が続く問題について、ヘッダーのローディング関連コンポーネントから処理をたどり、関連ファイルと原因候補を整理する。

---

## 1. ローディング表示がどこで出ているか

### 1.1 ヘッダー（SyncIndicator）

- **ファイル**: `src/components/layout/Header.tsx`
- **関連**: ヘッダー内で `<SyncIndicator />` を表示（124行目）
- **SyncIndicator**: `src/components/layout/SyncIndicator.tsx`
  - `useSyncStatus()` で `syncStatus` を購読
  - `syncStatus === "syncing"` のとき **Loader2 アイコン（アニメーション）** と「同期中...」を表示
  - いわゆる「ヘッダーのローディング」はこの **同期中インジケーター** の可能性が高い

### 1.2 メインコンテンツ（PageGrid スケルトン）

- **ファイル**: `src/pages/Home.tsx` → `<PageGrid isSeeding={isSeeding} />`
- **PageGrid**: `src/components/page/PageGrid.tsx`
  - ページ一覧の **スケルトン（ローディング）** 表示条件（56–62行目）:
    - `shouldShowSkeleton = !hasPages && (isLoading || syncStatus === "syncing" || isInitialSyncPending || isSeeding)`
  - つまり「ページが0件」かつ「以下いずれか」のときにスケルトン表示:
    - `isLoading`: `usePagesSummary()` の読み込み中
    - `syncStatus === "syncing"`: 同期中
    - `isInitialSyncPending`: サインイン済みで「まだ一度も同期が完了していない」かつエラーでない
    - `isSeeding`: チュートリアル用シード作成中

---

## 2. 処理の流れ（関連ファイル）

### 2.1 同期状態（syncStatus）

| 役割 | ファイル | 内容 |
|------|----------|------|
| 状態の保持・購読 | `src/lib/sync/syncWithApi.ts` | `syncStatus`（idle / syncing / synced / error）、`hasCompletedFirstSync`、`subscribeSyncStatus` |
| フック | `src/hooks/usePageQueries.ts` | `useSyncStatus()` → `getSyncStatus()` と `subscribeSyncStatus(setStatus)` |
| 同期実行 | `src/lib/sync/syncWithApi.ts` | `syncWithApi()` 開始時に `setSyncStatus("syncing")`、成功で `"synced"`、失敗で `"error"`。**finally** で `hasCompletedFirstSync = true` |

- **重要**: `hasNeverSynced()` は `!hasCompletedFirstSync`。同期が **成功でも失敗でも** 一度 `syncWithApi` が終われば `hasCompletedFirstSync` が true になり、`hasNeverSynced()` は false になる。

### 2.2 ページ一覧データ（usePagesSummary）

| 役割 | ファイル | 内容 |
|------|----------|------|
| リポジトリ取得 | `src/hooks/usePageQueries.ts` | `useRepository()` → `isLoaded = isLoaded(auth) && isAdapterReady`。adapter は `createStorageAdapter()`（IndexedDB） |
| 一覧取得 | 同上 | `usePagesSummary()` → queryKey: `pageKeys.summary(userId)`、queryFn: `getRepository()` → `repo.getPagesSummary(userId)` |
| 実体 | `src/lib/pageRepository/StorageAdapterPageRepository.ts` | `getPagesSummary()` は `adapter.getAllPages()` を呼ぶだけ |
| ストレージ | `src/lib/storageAdapter/IndexedDBStorageAdapter.ts` | `getAllPages()` は IndexedDB の `my_pages` から取得 |

- **isLoading**: `usePagesSummary()` では `isLoading = query.isLoading || !isLoaded`。つまり **adapter が準備できるまで** および **初回クエリが終わるまで** true。

### 2.3 初期同期（Initial Sync）のタイミング

| 場所 | ファイル | 処理 |
|------|----------|------|
| トリガー | `src/hooks/usePageQueries.ts`（useRepository） | `isSignedIn && userId && isAdapterReady` のとき、**1回だけ**（`initialSyncRequestedForUser` でガード）`runAuroraSync(userId, getToken)` を **fire-and-forget**（await しない）で実行 |
| 実行 | `src/lib/sync/syncWithApi.ts` | `runAuroraSync()` → 別途 `createStorageAdapter()` と `createApiClient()` で adapter/api を生成 → `syncWithApi(adapter, api, userId)` |
| API | `src/lib/api/apiClient.ts` | `getSyncPages(since?)` → GET `/api/sync/pages?since=...` |
| バックエンド | `terraform/modules/api/lambda/handlers/syncPages.mjs` | `getSyncPages(claims, query)`。Aurora から pages / links / ghost_links を取得して返す |

- **注意**: `runAuroraSync` は **await されていない** ため、初期同期が完了する前に `usePagesSummary` の queryFn が走り、その時点では IndexedDB にまだ PULL 結果が入っておらず **空配列** が返る可能性がある。

### 2.4 同期完了後のキャッシュ

- **手動同期**（SyncIndicator のボタン）: `useSync()` 内で `queryClient.invalidateQueries({ queryKey: pageKeys.all })` を実行 → 一覧が再取得される。
- **初期同期**（useRepository の useEffect 内の runAuroraSync）: **invalidate は呼ばれていない**。  
  → 初期同期完了後も React Query の `pageKeys.summary(userId)` は再 fetch されず、**初回に空で返した結果がキャッシュに残り続ける**可能性がある（ただしこの場合、スケルトンではなく「0件の EmptyState」になる）。

---

## 3. 「ずっとローディング」になりうる原因

`shouldShowSkeleton` が true のままになるのは、

- `hasPages === false`（ページ0件）
- かつ 次のいずれかが true:
  - `isLoading`
  - `syncStatus === "syncing"`
  - `isInitialSyncPending`
  - `isSeeding`

のとき。

### 原因候補 A: ヘッダーが「同期中」のまま（syncStatus === "syncing"）

- **runAuroraSync**（= `syncWithApi`）が **完了していない** と、`syncStatus` は "syncing" のまま。
- 考えられる要因:
  1. **GET /api/sync/pages** がレスポンスを返さない  
     - Lambda タイムアウト（terraform: `timeout = 30` 秒）、Aurora の復帰遅延、ネットワークエラーなど。
  2. **POST /api/sync/pages**（PUSH）が重い  
     - ページ数が多いと chunk 送信で時間がかかり、Lambda 30秒で打ち切られる可能性。
  3. **syncWithApi 内のどこかで例外**  
     - catch される前に別の理由でハングしている、など。

この場合、**ヘッダーの SyncIndicator が「同期中」のまま**になり、PageGrid も「ページ0件かつ同期中」でスケルトンが続く。

### 原因候補 B: usePagesSummary の isLoading が true のまま

- `isLoaded` が false の間は常に `isLoading === true`。
- `isLoaded` は `useRepository()` の `isLoaded && isAdapterReady`。adapter の `initialize(userId)` が完了しないと `isAdapterReady` が true にならない。
- あるいは queryFn（`getRepository()` → `getPagesSummary()`）が **ハング** している場合も、クエリが完了せず isLoading が true のまま。

### 原因候補 C: isInitialSyncPending が true のまま

- `isInitialSyncPending = isSignedIn && hasNeverSynced() && syncStatus !== "error"`。
- `hasNeverSynced()` は **一度でも** `syncWithApi` の finally が実行されれば false になる。
- したがって、**同期が一度も完了していない**（runAuroraSync が resolve/reject していない）場合に、isInitialSyncPending が true のまま。  
  → 実質「同期が終わっていない」のと同じで、A と重なる。

### 原因候補 D: isSeeding が true のまま

- `useSeedData()` は **未サインイン** かつ `usePagesSummary` の `isSuccess` かつ `pages.length === 0` のときにチュートリアルページを作成し、その間 `isSeeding === true`。
- サインイン済みの場合は isSeeding は使われない。未サインインで「0件のままシードが完了しない」場合にのみ影響。

---

## 4. インフラ（Terraform / AWS）の関連箇所

| 役割 | 場所 | 内容 |
|------|------|------|
| Lambda タイムアウト | `terraform/modules/api/main.tf` | `timeout = 30`（秒） |
| Sync API | `terraform/modules/api/lambda/router.mjs` | GET/POST `/api/sync/pages` → `handlers/syncPages.mjs` の `getSyncPages` / `postSyncPages` |
| DB アクセス | `terraform/modules/api/lambda/handlers/syncPages.mjs` | `execute()` で Aurora（RDS Data API）にクエリ |
| DB ラッパー | `terraform/modules/api/lambda/lib/db.mjs` | RDS Data API。`DatabaseResumingException` 時に最大4回リトライ（1秒刻みのディレイ） |

- 同期が 30 秒を超えると Lambda がタイムアウトし、クライアントにはエラーが返る。その場合 `syncWithApi` は catch で `setSyncStatus("error")` し、finally で `hasCompletedFirstSync = true` になるため、**ローディングではなく「同期エラー」表示**になる想定。
- 「ずっとローディング」になるのは、**レスポンスが返ってこない**（タイムアウトも含めてクライアントに結果が届かない）か、**syncWithApi の try 内のどこかでハングしている**可能性が高い。

---

## 5. 修正の方向性（推奨）

1. **同期完了後に一覧を再取得する**  
   - 初期同期（runAuroraSync）完了後に、手動 sync と同様に `queryClient.invalidateQueries({ queryKey: pageKeys.all })`（または少なくとも `pageKeys.summaries()`）を実行する。  
   - これにより、初回に空で返したあとでも、同期で IndexedDB にデータが入った時点で一覧が再表示される（EmptyState から一覧表示に変わる）。  
   - ただし「ずっとローディング」の主因が「同期が終わらない」ことなら、invalidate だけでは解消しない。

2. **syncStatus が "syncing" のままになる原因の切り分け**  
   - ブラウザの開発者ツールで Network タブ: GET `/api/sync/pages` が pending のままか、エラーか、遅延か確認。  
   - Console: `[Sync] Initial sync requested` のあと、`[Sync/API] Completed` や `[Sync/API] Failed` が出ているか確認。  
   - Lambda / API Gateway のログでタイムアウトや 5xx の有無を確認。

3. **ローディング条件の見直し（オプション）**  
   - 「ローカルにすでにページがあるなら、同期中でも一覧を表示する」ようにする場合:  
     `shouldShowSkeleton` を「`!hasPages` かつ …」のままにしつつ、**hasPages を「usePagesSummary の data」だけでなく「adapter にデータがあるか」も考慮する**のは複雑になるため、まずは **同期完了後の invalidate** と **同期が完了しない原因の特定** を優先するのがよい。

---

## 6. ネットワークタブの所見（追記）

- `GET /api/sync/pages?since=2026-02-10T05:03:30.419Z` は **200、約 12.72 秒** で完了している → 同期は正常終了している。
- この場合、`syncStatus` は "synced" になり `hasCompletedFirstSync` も true になるが、**初期同期後に React Query の summary を invalidate していなかった**ため、初回に空で返した `usePagesSummary` のキャッシュがそのままになり、一覧が空のまま or 表示が更新されない状態になっていた可能性が高い。
- 複数回の `pages`（9.8 KB、6–7 秒）は、`GET /api/pages/:id/content` など別エンドポイントの可能性あり。DevTools で URL を確認するとよい。

**対応1**: 初期同期の完了後（成功・失敗どちらでも）に `queryClient.invalidateQueries({ queryKey: pageKeys.all })` を実行するよう `useRepository` を修正した（`src/hooks/usePageQueries.ts`）。

### 根本原因: PUSH が毎回全ページを送っている

さらに調査すると、**PUSH フェーズが毎回全件送信していた**ことが判明。

- PULL: `GET /api/sync/pages?since=...` → 差分のみ（1.0 KB）✓ 正しい
- PUSH: `POST /api/sync/pages` → **全ページ送信** ✗ 差分ではない
  - `PAGE_PUSH_CHUNK_SIZE = 100` でチャンク分割 → 900件なら10回のPOST
  - 各POSTはLambdaで1件ずつ RDS Data API でINSERT/UPDATEするため6-7秒/チャンク
  - 合計 ~70秒のローディング

差分 sync のはずが、PUSH は毎回全件をサーバーに送り直していた。

**対応2**: `src/lib/sync/syncWithApi.ts` のPUSHフェーズを修正。
- `lastSync` がある（delta sync の）場合、`updatedAt > lastSync` かつ今回 PULL で受け取っていないページだけを PUSH 対象にフィルタ
- ローカルに変更がなければ PUSH を完全にスキップ（POST リクエスト 0 回）
- links / ghost_links も PUSH 対象ページ分だけ収集するよう変更

---

## 7. 関連ファイル一覧

- ヘッダー・同期 UI: `src/components/layout/Header.tsx`, `src/components/layout/SyncIndicator.tsx`
- ホーム・一覧: `src/pages/Home.tsx`, `src/components/page/PageGrid.tsx`
- フック: `src/hooks/usePageQueries.ts`（useSyncStatus, useRepository, usePagesSummary）, `src/hooks/useSeedData.ts`
- 同期ロジック: `src/lib/sync/syncWithApi.ts`, `src/lib/sync/index.ts`
- リポジトリ・ストレージ: `src/lib/pageRepository/StorageAdapterPageRepository.ts`, `src/lib/storageAdapter/IndexedDBStorageAdapter.ts`, `src/lib/storageAdapter/createStorageAdapter.ts`
- API: `src/lib/api/apiClient.ts`
- バックエンド: `terraform/modules/api/lambda/handlers/syncPages.mjs`, `terraform/modules/api/lambda/router.mjs`, `terraform/modules/api/lambda/lib/db.mjs`, `terraform/modules/api/main.tf`
