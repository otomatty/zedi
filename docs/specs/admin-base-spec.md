# 管理者基盤・サブドメイン仕様

**作成日:** 2026-03-06  
**目的:** 管理者用サブドメイン（admin.zedi-note.app）と認証基盤の要件・推奨を定義する。

---

## 1. 概要

- **本番URL:** `https://admin.zedi-note.app`
- **開発:** 管理者＝開発者のため dev 用サブドメインは設けない。ローカルは `http://localhost:30001` 等で起動。
- **配置:** リポジトリルート直下の `admin/` に管理者用 SPA（Vite + React）を配置。通常アプリ（`src/`）とは別アプリとしてビルド・デプロイする。

---

## 2. デプロイ（Cloudflare Pages）

**推奨: 管理者用に別の Cloudflare Pages プロジェクトを作成し、Terraform で管理、GitHub Actions からデプロイする。**

| 観点         | 説明                                                                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ビルド       | 通常アプリは `npm run build`（ルート）、管理者は `admin/` で別ビルド。出力ディレクトリが異なるため、同一プロジェクトで両方を配信するには設定が複雑になる。 |
| サブドメイン | `admin.zedi-note.app` を別プロジェクトにマッピングするだけでよい。                                                                                         |
| 権限・監査   | 管理者用プロジェクトのデプロイ権限を本番アプリと分離しやすい。                                                                                             |
| 環境変数     | 管理者用の `VITE_API_BASE_URL` 等を本番 API 向けにだけ設定すればよい。                                                                                     |

**実装イメージ:**

1. `terraform/cloudflare/` に `cloudflare_pages_project` / `cloudflare_pages_domain` / DNS レコードを追加し、`zedi-admin` と `admin.zedi-note.app` を Terraform 管理に置く。
2. GitHub Actions の production デプロイで、先に `terraform/cloudflare/` を apply して `zedi-admin` と `admin.zedi-note.app` を同期し、その後 `cd admin && npm install && npm run build` を実行して `admin/dist` を `wrangler pages deploy --project-name=zedi-admin` でデプロイする。
3. GitHub Actions の environment variables / secrets は既存の Cloudflare 用設定を再利用し、Terraform Cloud 認証用に `TF_API_TOKEN` を追加、`VITE_API_BASE_URL` には本番 API を渡す。

---

## 3. 認証・認可（堅牢な方針）

### 3.1 方針

- **同一 Better Auth セッションを利用する**  
  管理者も通常アプリと同じ Google/GitHub でサインインし、Cookie でセッションを共有する。管理者アプリと本番アプリは同じ `BETTER_AUTH_URL`（本番 API の URL）を向ける。
- **管理者の判定:** データベースの `user.role` で行う（後述）。
- **管理者 API は「セッション + 管理者ロール」の両方を検証する**  
  ヘッダー秘密鍵のみのエンドポイント（例: sync-models）は、CI/スクリプト用に残しつつ、管理者 UI からは「ログイン済みかつ admin」で呼び出す想定。

### 3.2 実装案

1. **ユーザースキーマ拡張（Better Auth + Drizzle）**
   - `user` テーブルに `role` を追加（例: `'user' | 'admin'`、デフォルト `'user'`）。
   - Better Auth の `user.additionalFields` に `role` を定義し、型とレスポンスに含める。
   - 管理者の付与は DB の更新または運用スクリプトで行い、一般ユーザーが自分で `role` を変更できないようにする（`input: false` 等）。

2. **管理者専用ミドルウェア（API）**
   - 既存の `authRequired` の後に「現在ユーザーの `role === 'admin'` か」をチェックする `adminRequired` を用意。
   - `GET /api/admin/*` および管理者向けの `PATCH` 等はすべてこのミドルウェアを通す。

3. **CORS**
   - 本番 API の `CORS_ORIGIN` に `https://admin.zedi-note.app` を追加する。
   - ローカル開発時は `http://localhost:30001`（管理者アプリのポート）も含めてもよい（開発用に別変数でも可）。

4. **Cookie / 同一サイト**
   - メインアプリが `zedi-note.app`、管理者が `admin.zedi-note.app` の場合、同一サイト（same-site）として扱われるため、Cookie は共有可能。Better Auth の `baseURL` を本番 API（例: `https://api.zedi-note.app`）に合わせ、`trustedOrigins` に `https://admin.zedi-note.app` と `https://zedi-note.app` の両方を入れる。

5. **sync-models の二重保護（任意）**
   - `POST /api/ai/admin/sync-models`: 現状の `X-Sync-Secret` に加え、「セッションありかつ admin」でも実行可能にすると、管理画面からワンクリック同期できる。
   - CI/外部からのみ叩く場合は従来どおり `X-Sync-Secret` のみでよい。

### 3.3 マイグレーション（user.role 追加）

- マイグレーション `server/api/drizzle/0003_add_user_role.sql` を適用する（`ALTER TABLE "user" ADD COLUMN "role" ...`）。
- 本番・開発 DB で `cd server/api && npm run drizzle:migrate` を実行する。
- 既存ユーザーは `role = 'user'` のまま。最初の管理者は DB で該当ユーザーの `role` を `'admin'` に更新する。

### 3.4 初回管理者の設定

- マイグレーションで `role` カラム追加後、最初の管理者は手動で DB を更新するか、環境変数 `ADMIN_EMAILS`（カンマ区切り）を読み、該当ユーザーの `role` を `admin` に更新する一時スクリプトを実行する方法が考えられる。
- または、`ADMIN_EMAILS` を「ロール未実装時のフォールバック」としてミドルウェアで参照し、該当メールのユーザーを admin とみなすことも可能（本番では `role` に統一することを推奨）。

---

## 4. 共通化（コンポーネント・API）

- 現時点では **管理者は `admin/` 内で独自にコンポーネントと API クライアントを実装**する想定。
- 将来的に共有したい場合の選択肢:
  - **npm workspaces:** ルートに `packages/shared` を追加し、型定義や API の型・ベース URL だけ共有する。
  - **同一リポジトリ内の参照:** `admin/` から `../src/lib/api/types.ts` などを相対で import する（ビルド設定で含める）。シンプルだが結合が強くなる。
- 最初のリリースでは共通化せず、必要になったタイミングで `packages/shared` を検討するので十分。

---

## 5. ディレクトリ構造（admin/）

```
admin/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── tailwind.config.js
├── postcss.config.js
├── .env.example
├── README.md
├── public/
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css
    ├── api/           # 管理者用 API クライアント
    ├── components/
    ├── pages/
    │   ├── Login.tsx
    │   ├── Layout.tsx
    │   └── ai-models/ # Issue #141: AI モデル管理
    ├── hooks/
    └── lib/
```

- ルートの `package.json` に `"dev:admin": "cd admin && npm run dev"` 等のスクリプトを追加すると運用しやすい。

---

## 6. API ルート構成（管理者）

| パス                              | 認可                                      | 用途                   |
| --------------------------------- | ----------------------------------------- | ---------------------- |
| `GET /api/admin/me`               | セッション + admin                        | 管理者情報・ロール確認 |
| `GET /api/ai/admin/models`        | セッション + admin                        | 全モデル一覧（#141）   |
| `PATCH /api/ai/admin/models/:id`  | セッション + admin                        | モデル個別更新（#141） |
| `PATCH /api/ai/admin/models/bulk` | セッション + admin                        | 一括更新（#141）       |
| `POST /api/ai/admin/sync-models`  | セッション+admin **または** X-Sync-Secret | 同期（#141・CI 兼用）  |

既存の `POST /api/ai/admin/sync-models` はそのまま残し、新たに「admin ロールでセッションあり」でも実行可能にするとよい。

---

## 7. CORS 設定

- 本番 API の `CORS_ORIGIN` に管理者オリジンを追加する必要がある。
- 例: `CORS_ORIGIN=https://zedi-note.app,https://admin.zedi-note.app`
- Better Auth の `trustedOrigins` は現在 `CORS_ORIGIN` から読みているため、上記に含めれば管理者ドメインも信頼される。

## 8. 環境変数（整理）

| 対象                | 変数                             | 説明                                                                             |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------------- |
| API（本番）         | `CORS_ORIGIN`                    | `https://zedi-note.app,https://admin.zedi-note.app` のように管理者オリジンを追加 |
| API（本番）         | `BETTER_AUTH_URL`                | 本番 API の URL（Cookie のドメインは API ではなくフロントのドメインと協調）      |
| Better Auth         | `trustedOrigins`                 | 本番では `zedi-note.app` と `admin.zedi-note.app` を含める                       |
| Admin（Cloudflare） | `VITE_API_BASE_URL`              | 本番 API の URL（例: `https://api.zedi-note.app`）                               |
| Admin（ローカル）   | `VITE_API_BASE_URL` または proxy | ローカル API または `ZEDI_API_PROXY_TARGET` 相当でプロキシ                       |

---

## 9. 最初のリリースで含めるもの

1. **ディレクトリ構造** … `admin/` の作成（本ドキュメントの構造に沿う）
2. **認証基盤** … `user.role` 追加、Better Auth 設定、`adminRequired` ミドルウェア、`GET /api/admin/me`
3. **AI モデル管理** … Issue #141 に沿った管理者用 API と管理画面（一覧・トグル・同期等）

Railway インフラ管理・ユーザー管理は今回のスコープ外とする。

---

## 10. 関連

- [Issue #141 — AIモデル管理画面の実装](https://github.com/otomatty/zedi/issues/141)
- 同期仕様: `docs/specs/ai-models-sync.md`
- 管理 API ルート: `server/api/src/routes/ai/admin.ts`
