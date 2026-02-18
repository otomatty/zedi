# Cognito sub → users.id 解決の共通化 — 実装計画書

## 1. 目的

- **問題**: AI Lambda が Cognito `sub` をそのまま `user_id` として DB に渡しており、`ai_usage_logs.user_id` の FK（`users(id)`）制約違反が発生している。また、API Lambda 各ハンドラで「cognito_sub → users.id」解決が重複実装されている。
- **方針**: 「Cognito sub を users.id に解決する」処理を**仕様とコードの両方で共通化**し、全モジュールで `users.id` のみを DB の user 識別子として使うようにする。後方互換は考慮せず、クリーンな実装に寄せる。

## 2. 現状整理

| モジュール | 言語/形式 | 解決の有無 | 取得内容 | DB アクセス |
|------------|------------|------------|----------|-------------|
| **API Lambda** (pages, syncPages, media) | .mjs (ESM) | あり（各ハンドラ内） | `id` のみ (`getOwnerId`) | RDS Data API `execute(sql, params)` |
| **API Lambda** (notes, search) | .mjs (ESM) | あり（各ハンドラ内） | `id` + `email` (`getCurrentUser`) | 同上 |
| **API Lambda** (users) | .mjs (ESM) | upsert のみ（解決ではない） | 行全体 | 同上 |
| **AI Lambda** | TypeScript | **なし**（sub をそのまま使用） | — | RDS Data API `execute(sql, params, env)` |
| **Hocuspocus** | TypeScript | あり（自前） | `id` + `email` (`getCurrentUserBySub`) | pg `client.query($1, [cognitoSub])` |

- **API Lambda**: 各ハンドラで `GET_USER_ID_SQL` / `GET_USER_SQL` と `getOwnerId(claims)` / `getCurrentUser(claims)` が重複。
- **AI Lambda**: `verifyToken` が返す Cognito `sub` をそのまま usage/subscription/rate-limit に渡しており、`ai_usage_logs` / `ai_monthly_usage` の FK 違反の原因になっている。
- **Hocuspocus**: pg のためプレースホルダが `$1`。RDS Data API とは SQL 実行インターフェースが異なる。

## 3. 共通化の範囲と方針

### 3.1 共通化するもの

- **契約（仕様）**
  - 認証後に DB の user 識別子として使う値は **`users.id`（UUID）のみ**とする。
  - Cognito `sub` は「認証識別子」であり、DB の FK には **必ず `users.id` に変換してから** 使う。
- **実装（コード）**
  - **RDS Data API を使う 2 つの Lambda（API Lambda・AI Lambda）** では、同じ「cognito_sub → users.id（および必要なら id+email）」解決ロジックを **共有パッケージ** で持つ。
  - **Hocuspocus** は pg 専用のため、共有パッケージには含めず、**同一契約（同じ SQL の意味）を実装した自前関数** のままとする（必要ならコメントで契約を参照）。

### 3.2 共有パッケージのインターフェース

- **実行抽象**: RDS Data API は `execute(sql, params)` で名前付きパラメータ（`:cognito_sub`）を使う。共有コードは **「SQL とパラメータを渡して行リストを受け取る関数」** に依存するだけにし、各 Lambda の `execute` をそのまま渡せるようにする。
- **提供する API（案）**
  - `resolveUserId(cognitoSub: string | undefined, execute: ExecuteFn): Promise<string | null>`
    - `SELECT id FROM users WHERE cognito_sub = :cognito_sub` を実行し、先頭行の `id` を返す。無い場合は `null`。
  - `resolveUser(cognitoSub: string | undefined, execute: ExecuteFn): Promise<{ id: string; email: string } | null>`
    - `SELECT id, email FROM users WHERE cognito_sub = :cognito_sub` を実行し、先頭行を返す。無い場合は `null`。
- **ExecuteFn の型（RDS Data API 互換）**
  - `(sql: string, params: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>`
  - AI Lambda の `execute(sql, params, env)` は、ラッパー `(sql, params) => execute(sql, params, env)` で渡す。

### 3.3 ユーザーが存在しない場合の扱い

- **API Lambda**
  - 現状どおり「未存在なら null を返し、呼び出し側で 401 等」でよい。必要に応じて `users` の upsert は既存の `users.mjs` の upsert に任せる（初回は別エンドポイントで upsert される想定）。
- **AI Lambda**
  - **方針**: `resolveUserId` が `null` の場合は **401 Unauthorized** とする（「users に存在しない認証ユーザーは AI 利用不可」）。ユーザー作成は既存の API（例: POST /api/users/upsert）に任せ、AI 側では upsert しない。
  - これにより、既存の「sub をそのまま渡す」挙動は廃止し、常に `users.id` のみを渡すクリーンな形にする。

## 4. 実装計画

### Phase 1: 共有パッケージの追加

| # | 作業内容 | 詳細 |
|---|----------|------|
| 1.1 | パッケージ配置 | リポジトリルートに `packages/zedi-auth-db`（または `libs/zedi-auth-db`）を新規作成。 |
| 1.2 | パッケージ内容 | (1) **SQL 定数**: `RESOLVE_USER_ID_SQL`, `RESOLVE_USER_SQL`（`:cognito_sub` 使用）。(2) **関数**: `resolveUserId(cognitoSub, execute)`, `resolveUser(cognitoSub, execute)`。依存は極力なし（型のみ `Record` 等）。 |
| 1.3 | ビルド・出力 | TypeScript で書き、ESM を出力。API Lambda は ESM、AI Lambda は TS から参照するため、`package.json` の `main`/`exports` で ESM を指定。 |
| 1.4 | リポジトリ内参照 | API Lambda・AI Lambda の `package.json` に `"zedi-auth-db": "file:../../../../packages/zedi-auth-db"` のようなローカル依存を追加（パスは構成に合わせて調整）。 |

- **ExecuteFn**: 上記のとおり `(sql, params) => Promise<Record<string, unknown>[]>` とし、各 Lambda の既存 `execute` をそのまま（または薄いラッパーで）渡す。

### Phase 2: API Lambda の置き換え

| # | 作業内容 | 詳細 |
|---|----------|------|
| 2.1 | 共通モジュール利用 | `handlers/pages.mjs`, `handlers/syncPages.mjs`, `handlers/media.mjs` で、`GET_USER_ID_SQL` + `getOwnerId(claims)` を削除し、`resolveUserId(claims?.sub, execute)` に置き換え。 |
| 2.2 | id+email 利用箇所 | `handlers/notes.mjs`, `handlers/search.mjs` で、`GET_USER_SQL` + `getCurrentUser(claims)` を削除し、`resolveUser(claims?.sub, execute)` に置き換え。返り値は `{ id, email }` なので、既存の `ownerId` / `user.email` は `id` / `email` に読み替え。 |
| 2.3 | users.mjs | upsert はそのまま。cognito_sub → users.id の「解決だけ」は行っていないため、このモジュールでは共通化対象外（必要なら呼び出し元で resolve を使う程度）。 |
| 2.4 | 重複 SQL 削除 | 上記ハンドラから `GET_USER_ID_SQL` / `GET_USER_SQL` 定義を削除し、一箇所の実装（共有パッケージ）に寄せる。 |

### Phase 3: AI Lambda の修正（FK 違反解消＋共通化）

| # | 作業内容 | 詳細 |
|---|----------|------|
| 3.1 | 認証後の解決レイヤー追加 | `verifyToken` / `verifyTokenString` で得た Cognito `sub` を、DB に渡す直前に `resolveUserId(sub, (sql, params) => execute(sql, params, env))` で `users.id` に変換する。 |
| 3.2 | 解決結果が null のとき | 401 を返す（または既存の UNAUTHORIZED と同じ扱い）。メッセージは「User not found」等でよい。 |
| 3.3 | 渡す値の統一 | `handleChat`, `handleChatStreaming`, `handleGetUsage`, `handleGetSubscription`, `checkRateLimit` など、これまで `userId`（= sub）を渡していた箇所には、すべて **解決後の `users.id`** を渡す。 |
| 3.4 | 依存追加 | AI Lambda の `package.json` に `zedi-auth-db` を追加し、`resolveUserId` を import。 |

- **注意**: WebSocket 経路でも同様に、メッセージから取り出した JWT を検証して得た `sub` を `resolveUserId` で解決し、その `users.id` を以降の処理に渡す。

### Phase 4: Hocuspocus の扱い

| # | 作業内容 | 詳細 |
|---|----------|------|
| 4.1 | コード共通化は行わない | pg は `$1` プレースホルダかつ `client.query` のため、RDS Data API 用の共有パッケージとはインターフェースが異なる。現状の `getCurrentUserBySub(client, cognitoSub)` を維持する。 |
| 4.2 | 契約の明示 | 関数上またはモジュール先頭にコメントを追加し、「Cognito sub → users.id（および email）の解決。契約は docs/... または packages/zedi-auth-db の resolveUser と同一」と記載する。 |

### Phase 5: ドキュメント・テスト

| # | 作業内容 | 詳細 |
|---|----------|------|
| 5.1 | 仕様ドキュメント | 「認証後の DB 用 user 識別子は必ず users.id に解決する」ことを、既存の調査メモ（ai-usage-logs-fk-investigation.md）や API 設計ドキュメントに追記する。 |
| 5.2 | 動作確認 | API Lambda: 既存の pages/notes/sync/media/search が、認証ユーザーで従来どおり動作することを確認。AI Lambda: Wiki 生成等で ai_usage_logs に正常に INSERT され、FK エラーが出ないことを確認。 |

## 5. ディレクトリ・ファイル構成（案）

```
zedi/
├── packages/
│   └── zedi-auth-db/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   └── index.ts   # resolveUserId, resolveUser, SQL 定数
│       └── dist/         # または build/（ESM 出力）
├── terraform/modules/
│   ├── api/lambda/
│   │   ├── package.json   # zedi-auth-db を file: 参照
│   │   ├── handlers/
│   │   │   ├── pages.mjs      # resolveUserId 使用
│   │   │   ├── syncPages.mjs  # resolveUserId 使用
│   │   │   ├── media.mjs      # resolveUserId 使用
│   │   │   ├── notes.mjs      # resolveUser 使用
│   │   │   └── search.mjs     # resolveUser 使用
│   │   └── lib/
│   │       └── db.mjs         # 変更なし
│   └── ai-api/lambda/
│       ├── package.json   # zedi-auth-db を file: 参照
│       ├── src/
│       │   ├── index.ts           # 認証後に resolveUserId を呼ぶ
│       │   ├── middleware/auth.ts # 変更なし（sub を返す）
│       │   └── lib/
│       │       └── db.ts          # 変更なし
│       └── ...
└── server/hocuspocus/
    └── src/index.ts   # getCurrentUserBySub はそのまま＋契約コメント
```

## 6. リスクと注意点

- **パス解決**: 各 Lambda のデプロイ方法（zip に node_modules を含める等）に合わせ、`zedi-auth-db` がバンドルまたは node_modules に含まれるようにする。`file:` 依存の場合は、デプロイスクリプトまたは Terraform のビルドステップで `packages/zedi-auth-db` をビルドし、Lambda の node_modules に配置する必要がある。
- **API Lambda の実行環境**: 現行が ESM のため、共有パッケージも ESM 出力にするとそのまま import できる。CommonJS が必要な場合はビルドを dual にする。
- **後方互換**: 今回の要件どおり「気にしない」ため、AI Lambda で「sub のまま DB に書く」旧挙動は完全に廃止する。

## 7. この方針で問題ないかのチェック

- **共通化の単位**: RDS Data API を使う 2 Lambda に限定し、同じ SQL・同じ意味の関数を 1 パッケージにまとめる → **問題なし**。
- **Hocuspocus をパッケージに含めない**: pg はインターフェースが違うため、契約だけ揃えコードは別でよい → **問題なし**。
- **ユーザー未存在で 401**: AI のみで users 未作成の場合は 401 とする方針で、ユーザー作成は既存 API に委ねる → **問題なし**。
- **後方互換を気にしない**: 既存の「sub を user_id に使う」実装は削除してよい → **問題なし**。

以上を前提に、Phase 1 から順に実装すれば、Cognito sub → users.id の共通化と AI Lambda の FK 違反解消を両立できる。
