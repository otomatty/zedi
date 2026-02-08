# デプロイ状況の調査結果

**調査日:** 2026-02-08  
**目的:** 本番（zedi-note.app）および AWS のデプロイ有無を確認する

---

## 1. 結論サマリー

| 対象 | デプロイ状況 | 備考 |prod
|------|--------------|------|
| **AWS（Terraform）** | **dev のみ** | 本番（prod）は未 apply。state は dev 環境のリソースのみ。 |
| **フロントエンド（Vite/React）** | **リポジトリ内に自動デプロイなし** | CI はビルドまで。zedi-note.app の配信元は本リポジトリの workflow では未定義。 |
| **Cloudflare Workers（AI / サムネイル API）** | **本番デプロイあり** | main ブランチ push 時などに `deploy-workers.yml` で `--env production` デプロイ。 |

---

## 2. Terraform（AWS インフラ）

### 2.1 確認方法

- バックエンド: S3 `zedi-terraform-state-590183877893`、key `zedi/terraform.tfstate`（環境別の state 分離なし）
- `terraform output -json` で現在の state を取得

### 2.2 結果

- **environment:** `dev`
- 出力されたリソースはすべて **zedi-dev-** プレフィックス:
  - ALB: `zedi-dev-alb-1515915657.ap-northeast-1.elb.amazonaws.com`
  - Cognito: `zedi-dev-590183877893.auth.ap-northeast-1.amazoncognito.com`
  - ECS: `zedi-dev-cluster`, `zedi-dev-hocuspocus`
  - Aurora: `zedi-dev-cluster.cluster-...`
  - Redis: `zedi-dev-redis`
  - ECR: `zedi-dev-hocuspocus`

**結論:** 本番用の `-var-file=environments/prod.tfvars` での apply は**未実施**。本番用 Cognito（zedi-prod-*）や本番用 ECS/ALB は存在しない。

---

## 3. フロントエンド（Vite アプリ）

### 3.1 リポジトリ内の設定

- **CI（.github/workflows/ci.yml）:** PR / push で lint, type-check, test, **build** まで。デプロイステップはなし。
- **Vercel / Netlify:** `vercel.json` / `netlify.toml` 等の設定ファイルは**存在しない**。
- **public/_redirects, _headers:** SPA 用の設定（`/* /index.html 200`）があり、Netlify または Cloudflare Pages で使う形式。どちらで配信しているかはリポジトリからは不明。

### 3.2 解釈

- **zedi-note.app** はドキュメント上は本番 URL として記載されているが、**このリポジトリの GitHub Actions ではフロントのデプロイは行っていない**。
- フロントは別の手段（手動デプロイ、別 CI、Vercel/Netlify/Cloudflare Pages のダッシュボード連携など）で zedi-note.app に配信されている可能性がある。配信元の確認は、DNS や各サービスのダッシュボードで行う必要あり。

---

## 4. Cloudflare Workers

- **.github/workflows/deploy-workers.yml:** `main` への push（`workers/**` または当該 workflow の変更時）で実行。
- **内容:** `workers/ai-api` と `workers/thumbnail-api` を `npx wrangler deploy --env production` で本番にデプロイ。
- **wrangler.toml:** `[env.production]` で `CORS_ORIGIN = "https://zedi-note.app/"` を指定。

**結論:** AI API とサムネイル API は **本番（production）環境にデプロイされる設定** になっている。main で該当 path を変更していれば本番に反映済みの可能性が高い。

---

## 5. 本番 IdP のリダイレクト URI について

- 本番用 Cognito は **まだ存在しない**（prod の Terraform 未 apply のため）。
- 本番用の Google / GitHub の「承認済みリダイレクト URI」は、**本番で Terraform apply を実行したあと**にできる Cognito ドメイン（`zedi-prod-590183877893.auth.ap-northeast-1.amazoncognito.com`）に基づく URL になる。
- 先に IdP 側だけ登録する場合は、  
  `https://zedi-prod-590183877893.auth.ap-northeast-1.amazoncognito.com/oauth2/idpresponse`  
  を登録すればよい（AWS アカウント ID は state から 590183877893 と確認済み）。

---

## 6. アプリ（フロント）のデプロイ先の想定

**結論: リポジトリ内では「どこにデプロイするか」は特定されていない。**

| 項目 | 内容 |
|------|------|
| **本番 URL** | ドキュメント・Cognito コールバック・Workers CORS で **zedi-note.app** を想定。 |
| **配信元** | **未定義**。`vercel.json` / `netlify.toml` / Cloudflare Pages 用の設定ファイルは存在しない。CI にデプロイステップもない。 |
| **想定されうる選択肢** | ・**Vercel** … Phase C ドキュメントで「C1 を Vercel 等で行う場合」と記載あり。<br>・**Netlify / Cloudflare Pages** … `public/_redirects`・`_headers` が SPA 用の形式で、これらのサービスでそのまま使える。<br>・**AWS（C2）** … 将来、Phase 6 として CloudFront + S3 で配信する計画（Terraform cdn モジュールは未実装）。 |
| **環境変数の渡し方** | どのサービスでも、ビルド時に `VITE_*` を設定し、本番用 Cognito / Turso / Realtime の値を注入してビルド・デプロイすればよい。 |

実際に zedi-note.app をどこでホストしているかは、DNS の向き先や利用中のホスティングのダッシュボードで確認する必要がある。

---

## 7. 次のアクション（Phase C1 に向けて）

1. **本番 Terraform の適用**  
   - IdP の Client ID/Secret を準備し、`prod.tfvars` を設定したうえで、本番用に `terraform apply -var-file=environments/prod.tfvars` を実行する。
2. **フロントの本番デプロイ**  
   - 現状の配信手段（Vercel / Netlify / Cloudflare Pages 等）を確認し、本番用環境変数（VITE_COGNITO_DOMAIN, VITE_COGNITO_CLIENT_ID 等）を設定してビルド・デプロイする。リポジトリにフロント用の deploy workflow を追加するかは任意。
3. **本番 Turso**  
   - 本番 DB が Turso のままの場合、Phase B と同様に本番 Turso の user_id を Cognito sub に移行する必要がある。
