# ai_usage_logs 外部キー制約違反の調査

## 現象

Wiki 生成など AI 利用後に以下のエラーが発生する。

```
ERROR: insert or update on table "ai_usage_logs" violates foreign key constraint "ai_usage_logs_user_id_fkey"; SQLState: 23503
```

## 結論（原因）

**AI Lambda が「ユーザー識別子」として Cognito の `sub` をそのまま使っている一方で、DB の `ai_usage_logs.user_id` は `users(id)` を参照している。`sub` と `users.id` は別物のため、INSERT 時に FK 違反が起きている。**

- **Cognito `sub`**: JWT の subject クレーム。Cognito が発行する一意の文字列（UUID 形式だがアプリが払い出した値ではない）。
- **`users.id`**: アプリの `users` テーブルの主キー。`gen_random_uuid()` または `INSERT ... RETURNING id` で決まる。
- スキーマ上 `ai_usage_logs.user_id` は `REFERENCES users(id)` のため、挿入する値は **`users.id` でなければならない**。

## 根拠

### 1. スキーマ

- **001_schema.sql**
  - `users`: `id UUID PRIMARY KEY`, `cognito_sub TEXT NOT NULL UNIQUE`
  - `id` と `cognito_sub` は別カラムで、値も別（id は DB で生成）。
- **002_ai_platform.sql**
  - `ai_usage_logs.user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - 許容されるのは `users.id` のみ。

### 2. AI Lambda で渡している「userId」の正体

- **terraform/modules/ai-api/lambda/src/middleware/auth.ts**
  - `verifyToken` / `verifyTokenString` は JWT 検証後に **Cognito の `payload.sub` をそのまま返している**（コメントにも "Returns the Cognito sub claim (user ID)" とある）。
- **terraform/modules/ai-api/lambda/src/index.ts**
  - HTTP/WebSocket とも `const userId = await verifyToken(event, env)`（または `verifyTokenString`）で取得した値をそのまま `handleChat`, `handleChatStreaming`, `handleGetUsage`, `handleGetSubscription`, `checkRateLimit` などに渡している。
- **terraform/modules/ai-api/lambda/src/services/usageService.ts**
  - `recordUsage({ userId, ... })` 内で  
     `INSERT INTO ai_usage_logs (user_id, ...) VALUES (CAST(:userId AS uuid), ...)`  
    としている。ここに渡っている `userId` は上記の **Cognito sub**。

つまり、**Cognito sub を UUID として `ai_usage_logs.user_id` に挿入している**が、その値は `users.id` ではないため FK 制約に違反する。

### 3. 他 API との比較（正しい扱い）

他のモジュールでは **Cognito sub → `users.id` に変換してから** FK カラムを使っている。

| 場所                                                    | 処理                                                                                                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **terraform/modules/api/lambda/handlers/notes.mjs**     | `getCurrentUser(claims)` で `SELECT id, email FROM users WHERE cognito_sub = :sub` を実行し、`ownerId: r.id`（= `users.id`）を返して利用。 |
| **terraform/modules/api/lambda/handlers/pages.mjs**     | JWT の `sub` から `SELECT id FROM users WHERE cognito_sub = :cognito_sub` で **users.id** を取得し、それを owner_id として使用。           |
| **terraform/modules/api/lambda/handlers/syncPages.mjs** | 同様に `sub` → `users.id` を取得して使用。                                                                                                 |
| **terraform/modules/api/lambda/handlers/media.mjs**     | 同様に `sub` → `users.id` を取得。                                                                                                         |
| **server/hocuspocus/src/index.ts**                      | `getCurrentUserBySub(cognitoSub)` で `SELECT id, email FROM users WHERE cognito_sub = $1` を実行し、得た **users.id** で権限チェック。     |

AI Lambda だけが **この変換を行わずに `sub` をそのまま DB の user_id として使っている**。

### 4. subscriptionService との関係

- **subscriptionService.ts**: `getSubscription(userId, env)` は `WHERE user_id = CAST(:userId AS uuid)` で検索している。
- ここに渡る `userId` も Cognito sub のため、`subscriptions.user_id`（= `users.id`）と一致せず、実質常に「該当なし」となり `subscription` は null、tier は "free" になる。
- 一方、**INSERT のとき**は `ai_usage_logs.user_id` に sub を入れるため、`users.id` に存在しない値で FK エラーになる。

## 影響範囲

- **ai_usage_logs**: `recordUsage()` の INSERT で FK 違反が発生（今回のエラー）。
- **ai_monthly_usage**: 同じ `userId`（Cognito sub）で upsert しているため、ここでも `users.id` を期待しているなら理論上は FK 違反の可能性がある（`ai_monthly_usage.user_id` も `REFERENCES users(id)`）。
- **subscriptions**: SELECT のみで、`userId` が sub のためマッチする行がなく tier は常に "free" になる（エラーにはならないが仕様ずれ）。
- **checkUsage / validateModelAccess**: 上記の通り subscription が取れず、実質 free として扱われている。

## 仕様・実装の整理（見直しの方向性）

1. **一貫した「ユーザー識別子」の定義**
   - DB の FK が参照するのは **`users.id`** のみとする。
   - Cognito `sub` は「認証識別子」であり、DB の user 主キーとは別。API 境界で `sub` → `users.id` に変換する責務を明示する。

2. **AI Lambda での解決方法**
   - 認証後に **Cognito sub → `users.id` を 1 回解決**するレイヤーを入れる。
   - 例: `resolveUserIdFromCognitoSub(sub, env): Promise<string | null>` で  
     `SELECT id FROM users WHERE cognito_sub = :cognito_sub` を実行し、得た `users.id` を以降の `handleChat` / `handleGetUsage` / `recordUsage` などに渡す。
   - 行が存在しない場合の扱い（例: 初回は users に upsert してから id を返す、または 401 にする）は仕様で決める。

3. **既存 API との揃え方**
   - notes/pages/syncPages/media と同様に「JWT sub → users.id 解決」を AI Lambda にも持たせると、subscription・usage・tier が正しい user に紐づき、FK 違反も解消する。

4. **ドキュメント**
   - 「認証後は必ず `users.id` を解決してから DB に書く」ことを仕様・Runbook に書いておくと、今後のテーブル追加時も同じミスを防げる。

## 対応実施（2026-02-18）

- Cognito sub → users.id の共通化を実施。詳細は `cognito-sub-to-user-id-commonization-plan.md` を参照。
- 共有パッケージ `packages/zedi-auth-db` を追加し、API Lambda・AI Lambda で利用。AI Lambda は認証後に必ず `requireResolvedUserId` で users.id を取得し、未存在時は 401 を返すように変更済み。
