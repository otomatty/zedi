# Phase C（Phase 3）作業内容の詳細解説

**作成日:** 2026-02-08  
**前提:** Phase A・Phase B 完了（Clerk 削除済み、既存ユーザー Cognito sub へ移行済み）

Phase C は「本番準備および今後のライン」であり、**C1〜C4 のいずれか／複数を選択**して進めます。推奨はまず **C1（本番デプロイ）** を実施し、本番で Cognito 認証＋Turso のまま運用を開始することです。

---

## 全体マップ

| タスク | 内容 | 工数目安 | 依存 |
|--------|------|----------|------|
| **C1** | 本番環境変数・Terraform（Cognito 本番・アプリデプロイ） | 小〜中 | なし |
| **C2** | Phase 6（CDN: CloudFront + S3） | 中 | 本番 URL が決まっているとよい |
| **C3** | DB 移行（Turso → Aurora Serverless v2） | 大 | 別計画。アプリ・データ移行が必要 |
| **C4** | Hocuspocus 永続化（Redis / Aurora） | 中〜大 | 将来対応でよい |

---

## C1: 本番環境変数・Terraform とアプリデプロイ

**目的:** 本番環境で Cognito（Google/GitHub）サインインを有効にし、アプリを本番 URL（例: https://zedi-note.app）でデプロイする。

### C1 で行う作業（詳細）

#### 1. 本番用 Cognito のコールバック／ログアウト URL の確認

- **現状:** `terraform/environments/prod.tfvars` に以下が設定済みです。
  - `cognito_callback_urls = ["https://zedi-note.app/auth/callback"]`
  - `cognito_logout_urls   = ["https://zedi-note.app"]`
- **やること:** 実際の本番ドメインが `zedi-note.app` でない場合は、上記を本番の URL に合わせて修正する。

#### 2. 本番用 IdP（Google / GitHub）の準備

本番でも「Google でサインイン」「GitHub でサインイン」を使う場合、**本番用の OAuth クライアント**を用意します。

| IdP | 作業内容 | 参照 |
|-----|----------|------|
| **Google** | Google Cloud Console で**本番用** OAuth クライアントを作成し、「承認済みのリダイレクト URI」に**本番 Cognito の IdP 用 URL**（`https://<本番 Cognito ドメイン>/oauth2/idpresponse`）を 1 件追加する。 | `docs/guides/cognito-google-github-idp-setup.md` §1 |
| **GitHub** | GitHub で**本番用** OAuth アプリを作成し、Authorization callback URL に上記と同じ本番 Cognito の IdP 用 URL を登録する。 | 同 §2 |

**注意:** 開発用と本番用で**別の OAuth クライアント／アプリ**に分けることを推奨（開発用の Client ID/Secret を本番に流用しない）。

#### 3. prod.tfvars に IdP を設定

- **prod.tfvars** に本番用の IdP を追加します（現在はコールバック URL のみで、IdP 変数は未設定の想定）。
  - `google_oauth_client_id` … 本番用 Google クライアント ID
  - `github_oauth_client_id` … 本番用 GitHub OAuth アプリの Client ID
  - `enable_github_idp = true` … GitHub サインインを使う場合
- **シークレット**（`google_oauth_client_secret`, `github_oauth_client_secret`）は **prod.tfvars に書かず**、環境変数で渡します。
  - 例: `terraform/environments/prod.secret.env` を用意（要 `.gitignore`）し、`TF_VAR_google_oauth_client_secret`, `TF_VAR_github_oauth_client_secret` を設定。
  - apply 前に `source terraform/environments/prod.secret.env` などで読み込む。

**prod.tfvars に追加する例（IdP 部分）:**

```hcl
# Security (Cognito) - 既存
cognito_callback_urls = ["https://zedi-note.app/auth/callback"]
cognito_logout_urls   = ["https://zedi-note.app"]

# 本番用 IdP（シークレットは TF_VAR_* で渡す）
google_oauth_client_id  = "本番用-xxxx.apps.googleusercontent.com"
github_oauth_client_id  = "本番用-GitHub-Client-ID"
enable_github_idp       = true
```

#### 4. 本番で Terraform を実行

- 本番用の Terraform 作業ディレクトリ・バックエンド（state）を用意（未作成なら）。
- 本番用 tfvars を指定して plan → apply する。
  - 例: `terraform plan -var-file=environments/prod.tfvars`  
        `terraform apply -var-file=environments/prod.tfvars`
- apply 後、以下を取得する。
  - Cognito Hosted UI ドメイン（`https://` を除いたもの）→ **VITE_COGNITO_DOMAIN**
  - Cognito クライアント ID → **VITE_COGNITO_CLIENT_ID**
  - WebSocket URL（Hocuspocus）→ **VITE_REALTIME_URL**（本番では `wss://` 化されている場合あり）

#### 5. 本番用アプリの環境変数

デプロイ先（Vercel / Netlify / 自前サーバー等）の環境変数に、以下を設定する。

| 変数名 | 値 | 備考 |
|--------|-----|------|
| **VITE_COGNITO_DOMAIN** | 本番 Cognito のホスト（`https://` なし） | `terraform output -raw cognito_hosted_ui_url` から取得し `https://` を除く |
| **VITE_COGNITO_CLIENT_ID** | 本番 Cognito アプリクライアント ID | `terraform output -raw cognito_client_id` |
| **VITE_COGNITO_REDIRECT_URI** | `https://zedi-note.app/auth/callback` | 本番 URL に合わせる |
| **VITE_COGNITO_LOGOUT_REDIRECT_URI** | `https://zedi-note.app` | 同上 |
| **VITE_TURSO_DATABASE_URL** | 本番用 Turso URL（現状 DB は Turso のまま） | 既存の本番 Turso |
| **VITE_TURSO_AUTH_TOKEN** | 本番用 Turso トークン | 同上 |
| **VITE_REALTIME_URL** | 本番 Hocuspocus の WebSocket URL | `terraform output -raw websocket_url`。HTTPS サイトなら `wss://` が必要な場合あり |

詳細は `docs/guides/env-variables-guide.md` の「本番用の目安」を参照。

#### 6. アプリのビルドとデプロイ

- `npm run build`（または `pnpm run build`）で本番ビルド。
- デプロイ先の手順に従い、上記環境変数を注入したうえでデプロイする。

#### 7. 動作確認

- 本番 URL にアクセスし、`/sign-in` から Google または GitHub でサインインできること。
- コールバック後、`/home` に遷移し、ページ一覧・ノートが表示されること（本番 Turso にデータがある場合）。
- 既存ユーザーが本番でサインインする場合は、**Phase B と同様に本番 Turso の user_id を Cognito sub に移行済み**である必要がある。未実施なら本番でも B1〜B5 の流れでマッピング取得・DB 更新を行う。

### C1 の成果物・チェックリスト

- [ ] prod.tfvars のコールバック／ログアウト URL が本番ドメインと一致
- [ ] 本番用 Google / GitHub OAuth クライアント作成済み（IdP 用リダイレクト URI 登録済み）
- [ ] prod.tfvars に IdP の Client ID を記載（シークレットは環境変数）
- [ ] 本番で `terraform apply` 成功
- [ ] 本番アプリの環境変数に Cognito / Turso / Realtime を設定
- [ ] 本番でサインイン〜ページ表示まで確認

---

## C2: Phase 6（CDN: CloudFront + S3）

**目的:** フロントエンドを CloudFront + S3 で配信し、キャッシュ・HTTPS・低レイテンシを実現する。

### C2 で行う作業（概要）

- **Terraform:** `docs/specs/aws-terraform-implementation-plan.md` の cdn モジュール（CloudFront + S3）に沿って、モジュールを追加する。
- **S3:** ビルド成果物（`dist/` など）をアップロードするバケットを作成。静的サイトホスティングまたは CloudFront オリジン用に設定。
- **CloudFront:** オリジンを S3 にし、カスタムドメイン（例: zedi-note.app）を割り当てる場合は ACM 証明書と Route53（または DNS の CNAME）を設定。
- **CI/CD:** ビルド後に S3 へアップロードし、CloudFront の invalidation を行うパイプラインを用意する（任意だが推奨）。

**注意:** 現状の Terraform には cdn モジュールが**未実装**のため、仕様書を参照しつつ新規にモジュールを追加する作業になります。本番デプロイ（C1）を Vercel 等で行う場合は、C2 は「AWS でフロントを配信する場合の次の一手」として後回しにできます。

---

## C3: DB 移行（Turso → Aurora Serverless v2）

**目的:** アプリのメイン DB を Turso（LibSQL）から Aurora Serverless v2（PostgreSQL）に切り替える。

### C3 で行う作業（概要）

1. **スキーマ・データの移行**
   - Turso は SQLite 互換、Aurora は PostgreSQL のため、スキーマの差分（型・DDL）を吸収する移行スクリプトが必要。
   - 既存データをエクスポート（Turso）し、PostgreSQL 用に変換して Aurora にインポートする手順を用意する。

2. **アプリの接続先切り替え**
   - `src/lib/turso.ts` は現在、Turso（LibSQL）用のクライアントで書かれている。Aurora に移行する場合は、**PostgreSQL 用のクライアント**（例: `pg` / Drizzle / Prisma 等）に差し替え、または Turso と同様のインターフェースを PostgreSQL で実装するラッパーを用意する。
   - 環境変数は `VITE_TURSO_*` に代えて、Aurora の接続情報（ホスト・ポート・DB 名・認証）を渡す方式に変更する（Vite で DB 直結する場合は接続情報の扱いに注意）。

3. **LocalDB とリモートの役割**
   - 現状は「ローカル: IndexedDB（SQLite WASM）」「リモート: Turso」で同期している。Aurora 移行後は「リモート: Aurora」になり、ローカル側の実装（IndexedDB のスキーマや同期ロジック）が Aurora のスキーマと整合するよう調整する必要がある。

**規模:** 大。別計画としてスキーマ設計・データ移行手順・ロールバック手順を文書化してから実施することを推奨。`src/lib/turso.ts` には Phase C3 の方針を記載したコメントが既にあります。

---

## C4: Hocuspocus 永続化（Redis / Aurora）

**目的:** リアルタイム編集サーバー（Hocuspocus）の状態をメモリだけでなく Redis（マルチインスタンス同期）および Aurora（永続化）に保存する。

### C4 で行う作業（概要）

- **Redis:** 既に Terraform で ElastiCache Redis は作成済み。Hocuspocus の拡張（または @hocuspocus/extension-redis 等）で、複数 ECS タスク間で Y.js ドキュメントの同期を行う。
- **Aurora:** ドキュメントのスナップショットや変更ログを Aurora に書き込み、再起動時や新規インスタンス立ち上げ時に復元できるようにする。

**優先度:** 現状は「メモリのみ」でも開発・小規模本番は運用可能。マルチインスタンス化や再起動時の復元が要件になってから対応でよい、と計画書に記載されています。

---

## 推奨の進め方

1. **まず C1（本番デプロイ）を完了させる**
   - 本番用 Cognito（IdP 含む）とアプリの環境変数を設定し、本番 URL でサインイン〜Turso データの表示まで確認する。
2. **C2（CDN）**
   - AWS でフロントを配信する方針が決まったら、Terraform の cdn モジュールを実装し、S3/CloudFront を導入する。
3. **C3（DB 移行）**
   - 別計画としてスキーマ・データ移行とアプリの接続層変更を設計し、メンテナンスウィンドウを設けて実施する。
4. **C4（Hocuspocus 永続化）**
   - マルチインスタンス・永続化の要件が明確になってから着手する。

---

## 参照ドキュメント

| ドキュメント | パス | 用途 |
|-------------|------|------|
| 次のステップ 作業計画書 | `docs/plans/20260208/next-steps-work-plan.md` | Phase A/B/C の全体と進捗 |
| 実装計画・現状サマリー | `docs/plans/20260123/implementation-status-and-roadmap.md` | AWS 移行の全体像 |
| 環境変数ガイド | `docs/guides/env-variables-guide.md` | 本番用 VITE_* の設定 |
| Cognito IdP 設定ガイド | `docs/guides/cognito-google-github-idp-setup.md` | Google/GitHub の本番用 OAuth 設定 |
| AWS Terraform 実装計画 | `docs/specs/aws-terraform-implementation-plan.md` | Phase 6（CDN）モジュール設計 |
