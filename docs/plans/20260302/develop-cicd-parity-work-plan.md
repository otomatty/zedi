# develop ブランチ CI/CD 同等化 作業計画書

**作成日:** 2026-03-02  
**目的:** develop ブランチへのマージ時にも main と同等の CI/CD（Railway API デプロイ + Cloudflare Pages フロントデプロイ）を行うための作業計画

---

## 1. 概要とゴール

### 1.1 背景

| 項目             | main ブランチ                                       | develop ブランチ（作業前）             |
| ---------------- | --------------------------------------------------- | -------------------------------------- |
| CI（PR 時）      | Lint, Type Check, Unit Tests, Build, API Type Check | 同上                                   |
| Railway デプロイ | migrate → API → Hocuspocus                          | migrate → API → Hocuspocus（設定済み） |
| Cloudflare Pages | デプロイあり（zedi）                                | **なし**                               |
| トリガー         | `push` to main                                      | `push` to develop                      |

### 1.2 ゴール

1. **CI API Type Check の修正** — server/api の依存関係が CI で解決されるようにする
2. **develop 向け Cloudflare Pages デプロイの追加** — main と同様にフロントエンドを開発環境にデプロイする
3. **Railway API デプロイの確実な実行** — develop にマージされた際に API/Hocuspocus がデプロイされることを保証する

### 1.3 作業後の develop フロー

```
develop に push
    ↓
migrate (development 環境の secrets.DATABASE_URL)
    ↓
deploy-frontend (Cloudflare Pages zedi-dev)
    ↓
Railway が GitHub 連携で api / hocuspocus をデプロイ（Dashboard で設定）
```

### 1.4 GitHub Environment 方針

**ワークフロー用に新規 Environment を作成する**（決定済み）。詳細は `docs/plans/20260302/environment-audit-report.md` §0, §9 を参照。

---

## 2. 作業 Phase 一覧

| Phase     | 内容                                                   | 状態                |
| --------- | ------------------------------------------------------ | ------------------- |
| Phase 1   | CI API Type Check 修正                                 | **完了**（PR #164） |
| Phase 2   | deploy-dev.yml に Cloudflare Pages 追加                | **完了**            |
| Phase 2.5 | GitHub Environments への移行                           | **完了**            |
| Phase 3   | GitHub Environments・Cloudflare プロジェクトの事前設定 | 要実施              |
| Phase 4   | Run Database Migrations 失敗の解消                     | 要実施              |
| Phase 5   | 動作確認・検証                                         | 要実施              |

---

## 3. Phase 1: CI API Type Check 修正

### 3.1 目的

CI の API Type Check で TS2307（モジュール未解決）が発生していた問題を修正する。

### 3.2 実施内容

| #   | タスク                                     | 内容                                                                                                                    | 成果物                     |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 1.1 | server/api の依存関係インストール追加      | `ci.yml` の api-typecheck ジョブで、`bunx tsc --noEmit` 実行前に `server/api` で `bun install --frozen-lockfile` を実行 | `.github/workflows/ci.yml` |
| 1.2 | Bun ワークスペース未使用の理由をコメント化 | Railway ビルド制約によりワークスペースを使用していない旨を記録                                                          | 同上                       |

### 3.3 完了条件

- [ ] PR #164 が develop にマージされている
- [ ] develop 向け PR で API Type Check が成功する

### 3.4 参照

- PR: https://github.com/otomatty/zedi/pull/164

---

## 4. Phase 2: deploy-dev.yml に Cloudflare Pages 追加

### 4.1 目的

develop への push 時に、Railway デプロイ完了後に Cloudflare Pages へフロントエンドをデプロイする。

### 4.2 実施内容

| #   | タスク                          | 内容                                                              | 成果物                             |
| --- | ------------------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| 2.1 | deploy-frontend ジョブ追加      | deploy-prod.yml と同様の deploy-frontend を deploy-dev.yml に追加 | `.github/workflows/deploy-dev.yml` |
| 2.2 | 開発用環境変数でビルド          | `DEV_API_BASE_URL`, `DEV_REALTIME_URL` で Vite ビルド             | 同上                               |
| 2.3 | zedi-dev プロジェクトへデプロイ | `pages deploy dist --project-name=zedi-dev` を実行                | 同上                               |

### 4.3 ジョブ依存関係

```
migrate
  ├─ deploy-api (needs: migrate)
  └─ deploy-hocuspocus (needs: migrate)

deploy-frontend (needs: deploy-api, deploy-hocuspocus)
```

### 4.4 完了条件

- [ ] deploy-dev.yml に deploy-frontend ジョブが存在する
- [ ] Phase 3 の事前設定が完了していれば、develop push でフロントデプロイが成功する

---

## 4.5 Phase 2.5: GitHub Environments への移行

### 目的

Secrets と Variables を Environment 単位で管理し、development / production を明確に分離する。

### 実施内容

| ワークフロー    | 変更内容                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| deploy-dev.yml  | 全ジョブに `environment: development` を追加。`secrets.DEV_DATABASE_URL` → `secrets.DATABASE_URL`、`vars.DEV_*` → `vars.API_BASE_URL` / `vars.REALTIME_URL`  |
| deploy-prod.yml | 全ジョブに `environment: production` を追加。`secrets.PROD_DATABASE_URL` → `secrets.DATABASE_URL`、`vars.PROD_*` → `vars.API_BASE_URL` / `vars.REALTIME_URL` |

### 移行時の注意

既に Repository の Secrets/Variables に値を設定している場合は、**各 Environment に同じ内容を再設定**する必要があります。Repository の Secrets は Environment 指定ジョブでは参照されません。

---

## 5. Phase 3: 事前設定（GitHub Environments・Cloudflare）

### 5.1 目的

deploy-dev.yml / deploy-prod.yml が成功するために必要な設定を行う。**ワークフロー用に新規 Environment を作成する**方針（既存の `Zedi / *` は Railway 用のため変更しない）。

### 5.2 GitHub Environments の作成

**設定場所:** GitHub リポジトリ → Settings → Environments

1. **development** 環境を新規作成（ワークフロー用）
2. **production** 環境を新規作成（ワークフロー用。オプション: デプロイ前に承認を必須にする場合、「Required reviewers」を設定）

**注意:** 既存の `Zedi / development` と `Zedi / production` は Railway の Deployment 表示用のため、触らない。

### 5.3 Environment Secrets（各環境に設定）

| Secret                  | 用途                            | development         | production     |
| ----------------------- | ------------------------------- | ------------------- | -------------- |
| `DATABASE_URL`          | DB マイグレーション用接続文字列 | 開発 DB の URL      | 本番 DB の URL |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare Pages デプロイ       | Cloudflare トークン | 同上           |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID        | アカウント ID       | 同上           |

**注:** `RAILWAY_TOKEN` は不要（Railway の GitHub 連携でデプロイするため）

**設定手順:** 各 Environment（development / production）を開き → 「Environment secrets」→「Add secret」

### 5.4 Environment Variables（各環境に設定）

| Variable           | 説明                     | development の例                              | production の例                |
| ------------------ | ------------------------ | --------------------------------------------- | ------------------------------ |
| `API_BASE_URL`     | API の URL               | `https://api-development-b126.up.railway.app` | `https://api.zedi-note.app`    |
| `REALTIME_URL`     | Hocuspocus WebSocket URL | `wss://hocuspocus-development.up.railway.app` | `wss://realtime.zedi-note.app` |
| `POLAR_MONTHLY_ID` | Polar Pro 月額商品 ID    | 本番と同一、または開発用 ID                   | 本番用 ID                      |
| `POLAR_YEARLY_ID`  | Polar Pro 年額商品 ID    | 本番と同一、または開発用 ID                   | 本番用 ID                      |

**設定手順:** 各 Environment を開き → 「Environment variables」→「Add variable」

### 5.5 Cloudflare Pages プロジェクト作成

**重要:** `wrangler pages deploy --project-name=zedi-dev` は、プロジェクトが事前に存在する必要があります。

**手順:**

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. Workers & Pages を開く
3. **Create application** → **Pages** → **Create a project** を選択
4. **Direct Upload** を選択（Git 接続は不要）
5. プロジェクト名に `zedi-dev` を入力して作成

### 5.6 完了条件

- [ ] GitHub Environments に `development` / `production` が作成されている
- [ ] 各 Environment に Secrets と Variables が設定されている
- [ ] Cloudflare Pages に `zedi-dev` プロジェクトが作成されている
- [ ] Railway development 環境の API / Hocuspocus の URL が確定している

### 5.7 補足: dev の Cloudflare Pages デプロイの流れ

**ワークフロー側の実装は済んでいる。** `deploy-dev.yml` では develop への push 時に以下が実行される。

```
develop に push
  → migrate（development の DATABASE_URL）
  → deploy-frontend（environment: development）
      - ビルド: vars.API_BASE_URL, REALTIME_URL, POLAR_* を Vite に渡す
      - デプロイ: secrets.CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID で wrangler pages deploy --project-name=zedi-dev
```

**動かすために必要なのは Phase 3 の事前設定のみ。** 上記 5.2〜5.5 のとおり、GitHub に `development` 環境を作成し、Secrets・Variables を設定し、Cloudflare に `zedi-dev` プロジェクトがあれば（Terraform で作成済みなら不要）、develop に push するだけでフロントが zedi-dev にデプロイされる。

---

## 6. Phase 4: Run Database Migrations 失敗の解消

### 6.1 目的

develop への push 時に「Deploy Development / Run Database Migrations」が失敗している場合、後続の deploy-frontend がスキップされる。この失敗を解消する。

### 6.2 想定原因

| 原因                         | 確認方法                                      | 対応                                           |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------- |
| `DATABASE_URL` 未設定        | development 環境の Environment secrets を確認 | 設定を追加                                     |
| `DATABASE_URL` の形式誤り    | Railway development の DB 接続文字列を確認    | 正しい URL に修正                              |
| DB が存在しない・接続不可    | Railway 上で PostgreSQL が起動しているか確認  | Railway で DB をプロビジョニング               |
| drizzle-kit migrate のエラー | Actions ログで詳細を確認                      | マイグレーションスクリプトや DB スキーマを修正 |

### 6.3 実施手順

1. GitHub Actions の「Deploy Development / Run Database Migrations」ログを開き、エラーメッセージを確認
2. **development** 環境の `DATABASE_URL` が Railway development 環境の PostgreSQL 接続文字列と一致するか確認
3. 必要に応じて Railway ダッシュボードで DB の接続情報を取得し、development 環境の Secret を更新
4. 再度 develop に push してジョブの成否を確認

### 6.4 完了条件

- [ ] Run Database Migrations が成功する
- [ ] その結果、deploy-frontend が実行される（Railway は GitHub 連携で別途デプロイ）

---

## 7. Phase 5: 動作確認・検証

### 7.1 検証チェックリスト

| #   | 確認項目           | 手順                       | 期待結果                                                         |
| --- | ------------------ | -------------------------- | ---------------------------------------------------------------- |
| 5.1 | CI（PR 時）        | develop 向け PR を作成     | Lint, Type Check, Unit Tests, Build, API Type Check がすべて成功 |
| 5.2 | migrate            | develop に push            | Run Database Migrations が成功                                   |
| 5.3 | Railway API        | Railway Dashboard で確認   | develop push 後、Railway が API をデプロイ                       |
| 5.4 | Railway Hocuspocus | 同上                       | develop push 後、Railway が Hocuspocus をデプロイ                |
| 5.5 | Cloudflare Pages   | develop に push            | deploy-frontend が成功、zedi-dev にフロントがデプロイされる      |
| 5.6 | 開発環境動作       | zedi-dev の URL にアクセス | API / Hocuspocus と接続し、アプリが正常に動作する                |

### 7.2 推奨検証フロー

1. Phase 3 の事前設定を完了する
2. Phase 4 で migrate 失敗を解消する（該当する場合）
3. develop に空コミットまたは小さな変更を push する
4. GitHub Actions で Deploy Development ワークフローが全て成功することを確認
5. Cloudflare Pages の zedi-dev プロジェクトの URL にアクセスし、アプリの動作を確認

---

## 8. 環境変数・設定一覧（Environment ベース）

### 8.1 development 環境

| 種類       | 名前                    | 値の例                                        |
| ---------- | ----------------------- | --------------------------------------------- |
| Secret     | `DATABASE_URL`          | `postgresql://...`（Railway development DB）  |
| Secret     | `CLOUDFLARE_API_TOKEN`  | Cloudflare API トークン                       |
| Secret     | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID                      |
| Variable   | `API_BASE_URL`          | `https://api-development-b126.up.railway.app` |
| Variable   | `REALTIME_URL`          | `wss://hocuspocus-development.up.railway.app` |
| Variable   | `POLAR_MONTHLY_ID`      | Polar 月額商品 ID                             |
| Variable   | `POLAR_YEARLY_ID`       | Polar 年額商品 ID                             |
| Cloudflare | プロジェクト名          | `zedi-dev`                                    |

### 8.2 production 環境

| 種類       | 名前                    | 用途                      |
| ---------- | ----------------------- | ------------------------- |
| Secret     | `DATABASE_URL`          | 本番 DB 接続文字列        |
| Secret     | `CLOUDFLARE_API_TOKEN`  | Cloudflare Pages デプロイ |
| Secret     | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント     |
| Variable   | `API_BASE_URL`          | 本番 API URL              |
| Variable   | `REALTIME_URL`          | 本番 Hocuspocus URL       |
| Variable   | `POLAR_MONTHLY_ID`      | Polar 月額                |
| Variable   | `POLAR_YEARLY_ID`       | Polar 年額                |
| Cloudflare | プロジェクト名          | `zedi`                    |

---

## 9. 関連ドキュメント

| ドキュメント                 | パス                                                 |
| ---------------------------- | ---------------------------------------------------- |
| **Environment 監査・方針**   | `docs/plans/20260302/environment-audit-report.md`    |
| **各値の取得方法**           | `docs/guides/environment-secrets-variables-setup.md` |
| Railway 開発環境セットアップ | `docs/specs/railway-dev-setup.md`                    |
| develop ブランチセットアップ | `docs/guides/setup-develop-branch.md`                |
| ブランチ戦略                 | `docs/guides/branch-strategy.md`                     |
| CI ワークフロー              | `.github/workflows/ci.yml`                           |
| Deploy Development           | `.github/workflows/deploy-dev.yml`                   |
| Deploy Production            | `.github/workflows/deploy-prod.yml`                  |

---

## 10. 備考

### 10.1 Bun ワークスペースについて

Bun ワークスペースは Railway のビルド都合上使用していません。Railway で Bun ワークスペースがサポートされた場合は、今後の対応を検討する可能性があります。

### 10.2 deploy-dev と deploy-prod の差分

| 項目                    | deploy-prod (main)      | deploy-dev (develop)     |
| ----------------------- | ----------------------- | ------------------------ |
| GitHub Environment      | production              | development              |
| Secrets/Variables       | production 環境から取得 | development 環境から取得 |
| Railway 環境            | production              | development              |
| Cloudflare プロジェクト | zedi                    | zedi-dev                 |

---

## 11. 進捗メモ

| Phase   | 状態   | メモ                                                                                                             |
| ------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| Phase 1 | 完了   | PR #164 作成済み。develop マージ待ち                                                                             |
| Phase 2 | 完了   | deploy-dev.yml に deploy-frontend 追加済み                                                                       |
| Phase 3 | 要実施 | 新規 Environment（development / production）の作成、Secrets/Variables 設定、Cloudflare zedi-dev プロジェクト作成 |
| Phase 4 | 要実施 | Run Database Migrations の失敗解消（該当時）                                                                     |
| Phase 5 | 要実施 | 全 Phase 完了後に検証                                                                                            |
