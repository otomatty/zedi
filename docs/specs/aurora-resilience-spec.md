# Aurora 自動ポーズ耐性 & 衝突解消ロジック 仕様書

## 1. 概要

Aurora Serverless v2 の自動ポーズ（`aurora_seconds_until_auto_pause = 600`）により、
アイドル状態が10分続くとDBが停止する。復帰には15〜30秒かかり、その間のAPIリクエストは
`DatabaseResumingException` で500エラーとなる。

本仕様では以下の3点を実装する:

1. **Lambda**: `DatabaseResumingException` を検知し、503 + `Retry-After` で応答
2. **フロントエンド**: 503応答時の自動リトライとUI通知
3. **同期ロジック**: PULL時のLWWチェック追加（ローカル編集の保護）

---

## 2. 現在の実装（Before）

### 2.1 Lambda 側

#### `terraform/modules/api/lambda/src/middleware/db.ts`
```typescript
// 現在: DB クライアントを Context にセットするだけ
export const dbMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  c.set('db', getDb());
  await next();
});
```
- **問題**: DB操作で `DatabaseResumingException` が発生しても、エラーハンドラーが一律 500 を返す
- エラーハンドラー (`middleware/errorHandler.ts`) にも Aurora 固有のエラー判定はない

#### `terraform/modules/api/lambda/src/middleware/errorHandler.ts`
```typescript
// 現在: HTTPException以外は message ベースの statusMap か 500
const statusMap: Record<string, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  // ... DatabaseResumingException の判定なし
};
const status = statusMap[message] ?? 500;
```

#### `terraform/modules/api/lambda/src/routes/users.ts` (POST /upsert)
- `authRequired` を使わず JWT claims から `sub` と `email` を直接読み取る
- DB 操作（INSERT ... ON CONFLICT DO UPDATE）で `DatabaseResumingException` が発生 → 500エラー

#### `terraform/modules/api/lambda/src/routes/syncPages.ts`
- GET: `authRequired` → DB から `pages`, `links`, `ghost_links` を取得
- POST: `authRequired` → LWW でページを同期
- いずれも DB 操作で `DatabaseResumingException` → 500エラー

### 2.2 フロントエンド側

#### `src/lib/api/apiClient.ts` — `request()` 関数
```typescript
// 現在: !res.ok なら ApiError をスロー。503の特別処理なし
if (!res.ok) {
  throw new ApiError(msg, res.status, code);
}
```
- 503 (Service Unavailable) も他のエラーと同様に即座に失敗

#### `src/hooks/usePageQueries.ts` — `useRepository()` 初回同期
```typescript
// 現在のフロー:
// 1. upsertMe() を呼ぶ（失敗しても warn で続行）
// 2. runAuroraSync() を呼ぶ（失敗したら error をログ、リトライなし）
// 3. initialSyncRequestedForUser に登録（失敗しても削除しない = 再実行されない）
```
- **問題**: upsertMe も sync も失敗した場合、手動同期（SyncIndicator）以外では再試行されない
- Aurora 復帰後も自動では再実行されない

#### `src/hooks/useProfile.ts`
```typescript
// 現在: upsertMe({}) を呼んでプロフィール取得。失敗時は warn でキャッシュのまま
const result = await api.upsertMe({});
```

#### `src/lib/sync/syncWithApi.ts` — PULL ロジック
```typescript
// 現在: サーバーのデータを無条件で IndexedDB に upsert
const res = normalizeSyncResponse(await api.getSyncPages(since));
for (const row of res.pages) {
  const meta = syncPageToMetadata(row);
  await adapter.upsertPage(meta);  // ← LWW チェックなし、無条件上書き
}
```
- **問題**: Aurora 停止中にローカルで編集したページが、PULL で古いサーバーデータに上書きされる可能性がある
- PUSH では `updatedAt > lastSync` で差分検出するが、PULL で先にローカルが上書きされると差分がなくなる

#### `src/lib/sync/syncWithApi.ts` — PUSH ロジック（LWW 実装済み）
```typescript
// フロントエンド側: ローカルで lastSync 以降に変更されたページのみ PUSH
const pagesForPush = lastSync
  ? allLocalPages.filter(
      (p) => p.updatedAt > lastSync && !pulledPageIds.has(p.id)
    )
  : allLocalPages;
```

#### `terraform/modules/api/lambda/src/routes/syncPages.ts` — サーバー側 LWW（実装済み）
```typescript
// サーバー側: client の updated_at > server の updated_at なら更新
if (existing.length === 0) {
  // INSERT
} else if (clientTime > existing[0]!.updatedAt) {
  // UPDATE（クライアントが新しい）
} else {
  // SKIP（サーバーが新しい）
}
```

### 2.3 現在のデータフロー図

```
[アプリ起動]
    │
    ▼
[IndexedDB 初期化] ─→ [ローカルデータ表示] ✅ Aurora 不要
    │
    ▼
[upsertMe()] ─────→ [Lambda] ─→ [Aurora] ──→ DatabaseResumingException
    │                                           │
    │ ← 500 Error ◄─────────────────────────────┘
    │
    ▼ (warn で続行)
[runAuroraSync()] ─→ [Lambda] ─→ [Aurora] ──→ DatabaseResumingException
    │                                           │
    │ ← 500 Error ◄─────────────────────────────┘
    │
    ▼ (error ログ、リトライなし)
[initialSyncRequestedForUser.add()] ← 再実行されない
    │
    ▼
[ユーザー操作] → [IndexedDB に保存] ← ローカルでは動作する
    │
    ▼
[Aurora 復帰] ← フロントエンドに通知なし、手動同期のみ
```

---

## 3. 修正後の実装（After）

### 3.1 Lambda: `DatabaseResumingException` → 503 + Retry-After 応答

#### 変更ファイル: `terraform/modules/api/lambda/src/middleware/errorHandler.ts`

```typescript
// After: DatabaseResumingException を検知して 503 を返す

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  // ── Aurora auto-pause 復帰中の検知 ──
  if (isDatabaseResumingError(err)) {
    console.warn(`[api] ${c.req.method} ${c.req.path} → 503 Aurora resuming`);
    c.header('Retry-After', '10');
    return c.json(
      { error: 'Database is resuming', code: 'DATABASE_RESUMING' },
      503
    );
  }

  // 既存のエラーハンドリング（変更なし）
  if (err instanceof HTTPException) { ... }
  ...
};

/**
 * DatabaseResumingException をエラーチェーンから検知する。
 * RDS Data API SDK が返すエラーは cause チェーンに埋まっている場合がある。
 */
function isDatabaseResumingError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5; depth++) {
    if (!current || typeof current !== 'object') return false;
    const name = (current as { name?: string }).name ?? '';
    const message = (current as { message?: string }).message ?? '';
    if (
      name === 'DatabaseResumingException' ||
      message.includes('is resuming after being auto-paused')
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
```

**変更理由**:
- Lambda の実行時間を最小化（リトライを Lambda 内で行わない）
- `Retry-After: 10` ヘッダーでクライアントに適切な待機時間を通知
- `code: 'DATABASE_RESUMING'` でフロントエンドが種別を判定可能

### 3.2 フロントエンド: 503 時の自動リトライ

#### 変更ファイル: `src/lib/api/apiClient.ts` — `request()` 関数

```typescript
// After: 503 + Retry-After 時に自動リトライ

async function request<T>(
  method: string,
  path: string,
  getToken: () => Promise<string | null>,
  baseUrl: string,
  options: { body?: unknown; query?: Record<string, string> } = {}
): Promise<T> {
  const MAX_DB_RESUMING_RETRIES = 4;   // 最大4回リトライ
  const DEFAULT_RETRY_AFTER = 10_000;  // デフォルト10秒

  for (let attempt = 0; attempt <= MAX_DB_RESUMING_RETRIES; attempt++) {
    // ... 既存の fetch ロジック ...

    let res: Response;
    try {
      res = await fetch(url.toString(), init);
    } catch (networkError) {
      throw new ApiError(...);
    }

    // ── 503 + DATABASE_RESUMING → リトライ ──
    if (res.status === 503 && attempt < MAX_DB_RESUMING_RETRIES) {
      const retryAfterSec = parseInt(res.headers.get('Retry-After') ?? '', 10);
      const waitMs = (retryAfterSec > 0 ? retryAfterSec * 1000 : DEFAULT_RETRY_AFTER);
      console.log(
        `[API] 503 Database resuming (attempt ${attempt + 1}/${MAX_DB_RESUMING_RETRIES}), ` +
        `retrying in ${waitMs / 1000}s...`
      );

      // ── UI 通知イベント発火 ──
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('zedi:db-resuming', {
            detail: { attempt: attempt + 1, retryAfterMs: waitMs }
          })
        );
      }

      await new Promise(resolve => setTimeout(resolve, waitMs));
      continue; // リトライ
    }

    // 503 でない場合、または最終リトライの場合は通常のエラー処理
    // ... 既存の JSON パース・エラーハンドリング ...
  }
}
```

**変更理由**:
- `Retry-After` ヘッダーに準拠した待機（Aurora 復帰を待つ）
- 最大4回 × 10秒 = 最大40秒で Aurora 復帰をカバー（通常15〜30秒で復帰）
- `CustomEvent` でUI通知を可能に（後述の SyncStatus 連携）

### 3.3 フロントエンド: DB 起動中の UI 表示

#### 変更ファイル: `src/lib/sync/syncWithApi.ts`

`SyncStatus` 型を拡張:

```typescript
// Before:
export type SyncStatus = "idle" | "syncing" | "synced" | "error";

// After:
export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "db-resuming";
```

#### 変更ファイル: `src/hooks/usePageQueries.ts` — `useRepository()` 初回同期

```typescript
// After: Aurora 復帰待ちの自動リトライ付き初回同期

useEffect(() => {
  if (!isSignedIn || !userId || !isAdapterReady) return;
  if (initialSyncRequestedForUser.has(userId)) return;
  initialSyncRequestedForUser.add(userId);

  (async () => {
    try {
      console.log("[Sync] Initial sync requested", { userId });
      const api = apiRef.current;

      // upsertMe: 503自動リトライは apiClient.ts 側で処理される
      if (api) {
        try {
          await api.upsertMe();
        } catch (e) {
          console.warn("[Sync] upsertMe failed (will still try sync):", e);
        }
      }

      await runAuroraSync(userId, getToken);
      queryClient.invalidateQueries({ queryKey: pageKeys.all });
    } catch (error) {
      console.error("Initial sync failed:", error);
      queryClient.invalidateQueries({ queryKey: pageKeys.all });

      // ── 新規追加: 503 (DB resuming) での失敗時は遅延リトライ ──
      if (error instanceof ApiError && error.status === 503) {
        console.log("[Sync] DB was resuming, scheduling delayed retry in 15s");
        initialSyncRequestedForUser.delete(userId); // ガードを解除
        setTimeout(() => {
          // 次のレンダリングサイクルで再実行される
          initialSyncRequestedForUser.delete(userId);
          queryClient.invalidateQueries({ queryKey: pageKeys.all });
        }, 15_000);
      }
    }
  })();
}, [isSignedIn, userId, isAdapterReady, getToken, queryClient]);
```

**変更理由**:
- apiClient.ts の 503 リトライ（最大40秒）で大半はカバーされる
- それでも失敗した場合のフォールバックとして15秒後に再試行
- `initialSyncRequestedForUser` のガードを解除することで再実行を許可

### 3.4 PULL 時の LWW チェック追加（衝突解消）

#### 変更ファイル: `src/lib/sync/syncWithApi.ts` — PULL ロジック

```typescript
// Before: サーバーデータで無条件上書き
for (const row of res.pages) {
  const meta = syncPageToMetadata(row);
  await adapter.upsertPage(meta);
}

// After: ローカルの方が新しければスキップ（LWW）
for (const row of res.pages) {
  const meta = syncPageToMetadata(row);
  const local = await adapter.getPage(meta.id);

  // ローカルにデータがあり、かつローカルの方が新しい場合はスキップ
  // （ローカル変更は後の PUSH で サーバーに反映される）
  if (local && local.updatedAt > meta.updatedAt) {
    console.log(
      `[Sync/API] Pull skip (local newer): ${meta.id} ` +
      `local=${new Date(local.updatedAt).toISOString()} > ` +
      `server=${new Date(meta.updatedAt).toISOString()}`
    );
    continue;
  }

  await adapter.upsertPage(meta);
}
```

**変更理由**:

現在の問題を以下のシナリオで説明する:

```
時刻   サーバー(Aurora)     ローカル(IndexedDB)
────   ─────────────────   ──────────────────────
T0     pageA.updatedAt=T0  pageA.updatedAt=T0     (同期済み)
T1     Aurora 停止          ─
T2     ─                   pageA を編集 → updatedAt=T2
T3     Aurora 復帰          ─

[初回同期実行]
PULL: サーバーから pageA (updatedAt=T0) を取得
  Before: adapter.upsertPage(T0) → ローカル T2 が T0 で上書き ⚠️
  After:  local.updatedAt(T2) > server.updatedAt(T0) → SKIP ✅

PUSH: ローカル pageA (updatedAt=T2) をサーバーに送信
  サーバー LWW: T2 > T0 → UPDATE ✅
```

### 3.5 DB 起動中のステータス通知（オプション: UI 表示用）

#### 変更ファイル: `src/lib/sync/syncWithApi.ts`

```typescript
// db-resuming イベントを検知して SyncStatus を更新
if (typeof window !== 'undefined') {
  window.addEventListener('zedi:db-resuming', () => {
    setSyncStatus('db-resuming');
  });
}
```

これにより `useSyncStatus()` を使用している UI コンポーネント（SyncIndicator等）で
「データベース起動中...」のような表示が可能になる。

---

## 4. 修正後のデータフロー図

```
[アプリ起動]
    │
    ▼
[IndexedDB 初期化] ─→ [ローカルデータ表示] ✅ Aurora 不要
    │
    ▼
[upsertMe()] ──────→ [Lambda] ─→ [Aurora]
    │                     │           │
    │                     │     DatabaseResumingException
    │                     │           │
    │                     ▼           │
    │               503 + Retry-After:10
    │               + code: DATABASE_RESUMING
    │ ◄───────────────────┘
    │
    ▼ (apiClient.ts: 503 検知)
[CustomEvent: zedi:db-resuming] ─→ [SyncStatus="db-resuming"]
    │                                    │
    │                                    ▼
    │                            [UI: "DB起動中..."]
    │
    ▼ (10秒待機)
[upsertMe() リトライ] ─→ [Lambda] ─→ [Aurora ✅ 復帰済み]
    │                                       │
    │ ← 200 OK ◄───────────────────────────┘
    │
    ▼
[runAuroraSync()]
    │
    ├── PULL: GET /api/sync/pages
    │     ├─ サーバーのページを取得
    │     └─ 各ページに対して LWW チェック:
    │         ├─ local.updatedAt > server.updatedAt → SKIP (ローカル保護)
    │         └─ local.updatedAt <= server.updatedAt → upsertPage (サーバー反映)
    │
    └── PUSH: POST /api/sync/pages
          ├─ lastSync 以降に変更されたローカルページを送信
          └─ サーバー側 LWW で新しい方を採用 (既存ロジック)
```

---

## 5. 変更ファイル一覧

| # | ファイルパス | 変更内容 |
|---|---|---|
| 1 | `terraform/modules/api/lambda/src/middleware/errorHandler.ts` | `isDatabaseResumingError()` 追加、503 + Retry-After 返却 |
| 2 | `src/lib/api/apiClient.ts` | `request()` に 503 自動リトライ + CustomEvent 発火 |
| 3 | `src/lib/sync/syncWithApi.ts` | PULL 時の LWW チェック追加、`SyncStatus` に `"db-resuming"` 追加 |
| 4 | `src/hooks/usePageQueries.ts` | 503 失敗時の遅延リトライ（フォールバック） |

---

## 6. テスト観点

### 6.1 Lambda 側
- [ ] `DatabaseResumingException` が cause チェーンに含まれるエラーで 503 が返ること
- [ ] `Retry-After` ヘッダーが設定されること
- [ ] Aurora 復帰後は通常の 200 レスポンスが返ること
- [ ] 他のエラー（400, 401, 500 等）には影響しないこと

### 6.2 フロントエンド: apiClient
- [ ] 503 + Retry-After 受信時にリトライされること
- [ ] MAX_DB_RESUMING_RETRIES 超過で ApiError がスローされること
- [ ] `zedi:db-resuming` CustomEvent が発火されること
- [ ] 503 以外のエラーではリトライされないこと

### 6.3 フロントエンド: PULL LWW
- [ ] ローカルが新しいページは PULL でスキップされること
- [ ] サーバーが新しいページは PULL で上書きされること
- [ ] ローカルにないページは新規作成されること
- [ ] PULL でスキップされたページが PUSH で正しくサーバーに送信されること

### 6.4 E2E シナリオ
- [ ] Aurora 停止中にアプリ起動 → ローカルデータ表示 → Aurora 復帰 → 自動同期成功
- [ ] Aurora 停止中にページ編集 → Aurora 復帰 → 同期でローカル変更が保持されること
- [ ] 初回同期失敗 → 15秒後の自動リトライで成功すること

---

## 7. コスト影響

| 項目 | Before | After |
|---|---|---|
| Lambda 実行時間 (Aurora 停止時) | 最大30秒（タイムアウトまでハング） | 数百ms（即座に503返却） |
| Lambda 課金 | 30秒 × $0.0000166667/GB秒 | ~0.5秒 × N回 |
| Aurora | 変更なし（auto-pause 維持） | 変更なし |
| API Gateway | 変更なし | 503 応答も課金対象だが微小 |

---

## 8. 将来の拡張

- **Warm-up Lambda**: EventBridge スケジュールで定期的に `/api/health` を呼び、Aurora のオートポーズを遅延させる（ユーザーが多い時間帯に有効）
- **WebSocket 通知**: Aurora 復帰を RDS Event → EventBridge → WebSocket API → フロントエンドで即時通知（ポーリング不要）
- **Y.Doc コンテンツの LWW**: 現在はメタデータのみ LWW。Y.Doc はCRDT ベースで別途マージが必要
