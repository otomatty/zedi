# Phase C4 実装提案（Hocuspocus 永続化）

**作成日:** 2026-02-10  
**前提:** C1〜C3 完了（[phase-c3-work-log.md](phase-c3-work-log.md)）。  
**参照:** [rearchitecture-task-breakdown.md](rearchitecture-task-breakdown.md) § Phase C4、[zedi-rearchitecture-spec.md](../specs/zedi-rearchitecture-spec.md) §9.4

---

## 1. C4 の位置づけと目的

- **C4 の目的:** 共有ノート内ページのリアルタイム編集で使う Hocuspocus サーバーを「メモリのみ」から **Aurora 永続化 + Redis マルチインスタンス対応** にし、再接続・再起動後も編集内容が失われないようにする。
- **C3 完了後の状態:**
  - 個人ページ: `mode='local'`（y-indexeddb のみ、Hocuspocus 接続なし）。同期は `runAuroraSync` + GET/PUT `/api/pages/:id/content`。
  - 共有ノート: クライアントは `mode='collaborative'` で Hocuspocus に接続可能だが、**サーバー側は永続化未実装**のため、再起動や全員切断で内容が消える。
- **C4 完了後に実現すること:**
  - 共有ノート内ページを Hocuspocus で編集した内容が Aurora の `page_contents` に保存される。
  - ルーム起動時に Aurora から Y.Doc をロードして復元する。
  - （C4-2 完了時）複数 ECS タスク間で Redis Pub/Sub により Y.Doc 更新を共有する。
  - （C4-3 完了時）接続時に「そのページが属するノートに対する編集権限」をチェックする。

---

## 2. 現状の実装状況

| 項目 | 場所 | 状態 |
|------|------|------|
| Hocuspocus サーバー | `server/hocuspocus/src/index.ts` | 稼働中。Cognito JWT 検証あり。`onLoadDocument` / `onStoreDocument` はログのみ（TODO）。 |
| ドキュメント名 | CollaborationManager | `page-${pageId}`（`pageId` は UUID）。 |
| API ページコンテンツ | `terraform/.../handlers/pages.mjs` | GET/PUT `/api/pages/:id/content` で `page_contents` の ydoc_state（base64）, version を読み書き。**自分のページ（owner_id）のみ**許可。 |
| Aurora page_contents | C1-1, C2-5 | スキーマ済み。`page_id`, `ydoc_state` (BYTEA), `version`, `content_text`, `updated_at`。 |
| Redis | Terraform `module.cache` | ElastiCache Redis 作成済み。realtime モジュールで `REDIS_URL` を ECS に渡す設定あり。Hocuspocus は未接続。 |

---

## 3. タスク細分化（C4-1 / C4-2 / C4-3）

以下は rearchitecture-task-breakdown の C4 を、現在のコードベースに合わせて具体化したもの。

### 3.1 C4-1: Hocuspocus の Aurora 永続化（中）

**目的:** `onLoadDocument` で `page_contents` から ydoc_state を取得し、`onStoreDocument`（および定期保存・切断時保存）で `page_contents` に書き込む。

**前提:**
- documentName は `page-${pageId}`。先頭の `page-` を除いた部分が `page_id`（UUID）。
- 永続化するのは**共有ノート用**のルームのみ想定（個人ページは C3-5 で Hocuspocus に接続しない）。ただしサーバーは「個人/共有」を区別せず、`page_id` に対応する `page_contents` を読み書きする。

**成果物・作業内容:**

| # | 内容 | 詳細 |
|---|------|------|
| 1 | Hocuspocus から Aurora への接続 | Hocuspocus サーバーが Aurora（PostgreSQL）に接続する手段を用意する。Lambda は RDS Data API または VPC 内接続を使用しているため、Hocuspocus は **同一 VPC の ECS で動く** 想定なら、**pg クライアント**（`pg` または `postgres.js`）で接続する。接続情報は Secrets Manager（`zedi-dev-db-credentials` 等）または環境変数（`DATABASE_URL`）から取得。 |
| 2 | onLoadDocument の実装 | `documentName` から `page_id` を抽出。`SELECT ydoc_state, version FROM page_contents WHERE page_id = $1` を実行。1 行あれば `ydoc_state`（Buffer）を `Y.applyUpdate(doc, state)` で適用した `Y.Doc` を返す。0 行の場合は新規ルームなので空の `new Y.Doc()` を返す。 |
| 3 | onStoreDocument の実装 | `data.document`（Y.Doc）を `Y.encodeStateAsUpdate(data.document)` で Uint8Array にし、`page_contents` に UPSERT（`ON CONFLICT (page_id) DO UPDATE`）。`version` は increment。仕様 §9.4 に合わせ、**定期（30〜60 秒）** と **全員切断時** の両方で保存する。Hocuspocus の `debounce` / `maxDebounce` は既存のまま（2s / 10s）でよく、加えて `onDisconnect` で最後の接続が外れるときに `onStoreDocument` を発火させるか、`onDestroy` 相当で保存する。 |
| 4 | content_text の更新（任意） | 共有ノートのサーバー検索（GET /api/search?scope=shared）は `page_contents.content_text` を利用している。保存時に Y.Doc からプレーンテキストを抽出し、`content_text` を更新すると検索と整合する。C4-1 の範囲では「ydoc_state の永続化」を優先し、content_text は空のままでも可。別タスクで「Y.Doc → content_text 抽出」を追加するか、既存の `extract-content-text` と同様のロジックを Hocuspocus 用に Node で実装する。 |
| 5 | 新規ページ（page_contents が無い） | 共有ノート内で「＋ページ」で作成したページは、初回は `page_contents` に行が無い。`onLoadDocument` で 0 行なら空の Y.Doc を返す。初回 `onStoreDocument` で INSERT すればよい（pages には既に API で行がある想定）。 |

**技術メモ:**
- Y.Doc の保存形式は **Uint8Array（Y.encodeStateAsUpdate）** のバイナリ。Aurora の `ydoc_state` は BYTEA なのでそのまま格納可能。
- Lambda の `pages.mjs` は `decode(:ydoc_state_b64, 'base64')` で BYTEA にしている。Hocuspocus 側では Node の Buffer をそのまま `pg` の BYTEA にバインドすればよい。

**依存:** C1-1（page_contents スキーマ）、C1-5（API で page_contents 利用済み）。C2-5 でデータ投入済み。

---

### 3.2 C4-2: Redis 連携（中）

**目的:** マルチインスタンス（ECS タスク複数）時に、同一ドキュメントの更新を Redis Pub/Sub で他タスクに伝え、一貫した Y.Doc を保つ。

**成果物・作業内容:**

| # | 内容 | 詳細 |
|---|------|------|
| 1 | @hocuspocus/extension-redis の導入 | `server/hocuspocus` に `@hocuspocus/extension-redis` を追加。接続先は環境変数 `REDIS_URL`（Terraform で `redis_connection_string` が ECS に渡されている）。 |
| 2 | Hocuspocus 設定に Redis を追加 | `new Hocuspocus({ extensions: [new Redis({ redis: new IORedis(REDIS_URL, { ... }) })] })` のように拡張を登録。TLS 有効時は `rediss://` と ioredis の tls オプションを利用。 |
| 3 | 動作確認 | 同一 documentName に 2 台の Hocuspocus がいる場合、片方で受信した更新がもう片方に伝わり、クライアントがどちらのタスクに接続しても同じ内容になることを確認する。 |

**依存:** C4-1（永続化がないと Redis だけでは再起動時に復元できない）。Terraform の ElastiCache と realtime モジュールの環境変数は既存の想定。

---

### 3.3 C4-3: 認可の統一（小）

**目的:** Hocuspocus 接続時に、**そのページが属するノートに対する編集権限（ノートの editor ロール）** をチェックする。現状は Cognito JWT で「誰か」は分かるが、「この page_id を編集してよいか」は見ていない。

**仕様（§9、C-Collab）:**
- 共有ノート内ページの編集は「ノートのメンバーで editor ロール（または owner）」のユーザーのみ可能。
- 個人ページは Hocuspocus に接続しない（C3-5 済み）ので、Hocuspocus に来る接続は「共有ノート内の page_id」を編集する意図とみなしてよい。

**成果物・作業内容:**

| # | 内容 | 詳細 |
|---|------|------|
| 1 | ページがノートに属するか・編集権限の取得 | JWT の `sub`（Cognito）から `users.id`（UUID）を取得。`note_members` は `member_email` で招待しているため、`users.email` と照合する。SQL 例: その page_id が含まれるノートのうち、現在ユーザーが owner または editor であるものが少なくとも 1 つあるか確認する。 |
| 2 | onAuthenticate の拡張 | 現行は「JWT が有効か」のみ。ここに「documentName から page_id を抽出し、そのページが属するノートに対して当該ユーザーが editor（または owner）であるか」を追加。権限が無ければ `throw new Error('Forbidden')` 等で接続を拒否する。 |
| 3 | 個人ページの誤接続 | 個人ページはクライアントで mode='local' のため通常は接続しないが、不正に `page-${pageId}` に接続しようとした場合、その page の owner のみ許可する、というルールにすると「個人ページ＝自分だけ」も満たせる。つまり: page が note_pages に無い（どのノートにも属さない）→ owner_id が自分なら OK。page が note_pages にある → そのノートの editor/owner なら OK。 |

**SQL イメージ（編集可能かどうか）:**

```sql
-- page_id がノートに含まれており、かつ current user がそのノートの owner または editor である
SELECT 1
FROM note_pages np
JOIN note_members nm ON nm.note_id = np.note_id
JOIN users u ON u.email = nm.member_email
WHERE np.page_id = :page_id
  AND u.cognito_sub = :cognito_sub
  AND nm.role IN ('owner', 'editor')
LIMIT 1;
-- 0 件なら、そのページが個人ページか確認: pages.owner_id = (SELECT id FROM users WHERE cognito_sub = :cognito_sub)
```

**依存:** C1-6（note_pages, note_members）、C1-3（users）。Aurora 接続は C4-1 で Hocuspocus が持つため、同一 DB でこのクエリを実行できる。

---

## 4. 推奨実施順序

1. **C4-1** を最初に完了させる。これがないと共有ノートの編集内容が再起動で消えたままになる。
2. **C4-3** は C4-1 と並行可能。認可を先に実装すると、永続化実装中に「誰が保存できるか」が明確になる。C4-1 の「誰がこのルームに参加できるか」と C4-3 は同じ DB 接続で行えるため、C4-1 で Aurora 接続を入れた直後に C4-3 を足す形でもよい。
3. **C4-2** は、単一タスクで運用する間は必須ではない。マルチタスク（ECS で desired count > 1）にする前に完了させればよい。

**簡易スケジュール案:**
- **C4-1:** 2〜4 日（Aurora 接続・onLoad/onStore・切断時保存・必要なら content_text）。
- **C4-3:** 0.5〜1 日（認可クエリと onAuthenticate への組み込み）。
- **C4-2:** 1〜2 日（Redis 拡張の追加と結合テスト）。

---

## 5. C4 と C-Collab の関係

- **C-Collab-1**（共有ノート内ページの編集を Hocuspocus に統一）は、**C4-1 が完了していること**が前提。永続化がないと「編集可能にした」ときにデータが残らない。
- **C-Collab-2**（個人ページで Hocuspocus を完全に外す）は C3-5 でほぼ完了しており、C4 には不要。
- したがって、**C4-1 完了 → C-Collab-1 で NotePageView を編集可能にし、mode='collaborative' を渡す**、という順が自然。

---

## 6. 成果物一覧（予定）

| 種別 | パス・対象 | 備考 |
|------|------------|------|
| C4-1 | `server/hocuspocus/src/index.ts` | onLoadDocument / onStoreDocument で Aurora 読み書き。Aurora 接続モジュール（例: `server/hocuspocus/src/db.ts`）を追加しても可。 |
| C4-1 | `server/hocuspocus/package.json` | `pg` または `postgres`、および Secrets 取得用に `@aws-sdk/client-secrets-manager` 等が必要なら追加。 |
| C4-2 | `server/hocuspocus/src/index.ts` | Redis 拡張の登録。 |
| C4-2 | `server/hocuspocus/package.json` | `@hocuspocus/extension-redis`, `ioredis`。 |
| C4-3 | `server/hocuspocus/src/index.ts` または認可モジュール | onAuthenticate 内で page_id → ノート編集権限チェック。 |

---

## 7. 関連ドキュメント

| ドキュメント | 用途 |
|-------------|------|
| [rearchitecture-task-breakdown.md](rearchitecture-task-breakdown.md) | Phase C4 タスク一覧・依存 |
| [zedi-rearchitecture-spec.md](../specs/zedi-rearchitecture-spec.md) | §9 リアルタイム共同編集、§9.4 Hocuspocus 永続化 |
| [zedi-data-structure-spec.md](../specs/zedi-data-structure-spec.md) | page_contents, note_pages, note_members, users |
| [phase-c3-work-log.md](phase-c3-work-log.md) | C3-5 mode local/collaborative、C3 完了内容 |
| [phase-c1-work-log.md](phase-c1-work-log.md) | C1-5 ページ・コンテンツ API、C1-6 ノート API |
| [terraform/modules/api/lambda/handlers/pages.mjs](../../terraform/modules/api/lambda/handlers/pages.mjs) | page_contents の GET/PUT 仕様（Lambda 側） |
| [server/hocuspocus/src/index.ts](../../server/hocuspocus/src/index.ts) | 現行 Hocuspocus サーバー（永続化 TODO） |

---

**以上、Phase C4 の実装提案とする。C4-1 から着手することを推奨する。**
