# Terraform で Cloudflare を管理するために Cloudflare 側で必要な作業

**目的:** [terraform/cloudflare/](../../terraform/cloudflare/) を利用する前に、Cloudflare ダッシュボードで行う作業をまとめる。

**関連:** [terraform-cloud-setup.md](terraform-cloud-setup.md)（Terraform Cloud の設定）、[terraform-cloudflare-import.md](terraform-cloudflare-import.md)（import 手順）、[environment-secrets-variables-setup.md](environment-secrets-variables-setup.md)（GitHub 用 Secret の取得）

---

## 1. 作業一覧

| #   | 作業                               | 必須 | 説明                                    |
| --- | ---------------------------------- | :--: | --------------------------------------- |
| 1   | API トークンの作成（Terraform 用） |  ✅  | DNS 編集 + Pages 編集権限を持つトークン |
| 2   | Account ID の確認                  |  ✅  | Terraform 変数・import で使用           |
| 3   | ゾーン・Pages の有無確認           | 任意 | 既存なら import のみでよい              |

**注意:** Terraform は「既存リソースを import する」前提のため、Cloudflare 側で**新規にリソースを作成する作業は不要**。既に `zedi-note.app` の DNS と Pages プロジェクト（`zedi`, `zedi-dev`）があれば、トークンと Account ID を用意すればよい。

---

## 2. API トークンの作成（Terraform 用）

Terraform Provider が Cloudflare API を呼ぶために使用する。**GitHub Actions の Pages デプロイ用トークンと同じでもよい**が、権限が足りているか確認する。

**必要な権限:**

| リソース             | 権限                       | 用途                         |
| -------------------- | -------------------------- | ---------------------------- |
| Account              | Cloudflare Pages: **Edit** | Pages プロジェクトの読み書き |
| Zone (zedi-note.app) | Zone: **DNS: Edit**        | DNS レコードの読み書き       |

**手順:**

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. 右サイドバー下部 **My Profile** → **API Tokens**
3. **Create Token** をクリック
4. **Custom token** を選択
5. **Permissions** で以下を追加:
   - **Account** → **Cloudflare Pages** → **Edit**
   - **Zone** → **DNS** → **Edit**
6. **Zone Resources** で **Include** → **Specific zone** → **zedi-note.app** を選択
7. **Continue to summary** → **Create Token**
8. **表示されたトークンをコピー**し、Terraform Cloud の Environment Variable `CLOUDFLARE_API_TOKEN`（Sensitive）に設定する

**参考:** [Create API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)

---

## 3. Account ID の確認

Terraform の変数 `cloudflare_account_id` および Pages の import（`<account_id>/zedi` 形式）で使用する。

**手順:**

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. 任意のドメイン（例: **zedi-note.app**）をクリック
3. 右サイドバー **API** セクションに **Account ID** が表示される
4. または **Workers & Pages** を開き、URL の `dash.cloudflare.com/{ACCOUNT_ID}/workers-and-pages` から取得

**形式:** 32 文字の英数字。

取得した値を Terraform Cloud の変数 `CLOUDFLARE_ACCOUNT_ID` または `terraform.tfvars` の `cloudflare_account_id` に設定する。

---

## 4. 既存リソースの確認（任意）

Terraform で「既存の DNS と Pages を管理下に置く」場合は、以下が既に存在していることを確認する。

| 種類               | 名前 / 対象                                                          | 確認場所                           |
| ------------------ | -------------------------------------------------------------------- | ---------------------------------- |
| ゾーン             | `zedi-note.app`                                                      | **Websites** → ドメイン一覧        |
| DNS レコード       | `api`, `_railway-verify.api`, `realtime`, `_railway-verify.realtime` | ドメイン → **DNS** → **Records**   |
| Pages プロジェクト | `zedi`, `zedi-dev`                                                   | **Workers & Pages** → **Overview** |

- **すべて既にある場合:** [terraform-cloudflare-import.md](terraform-cloudflare-import.md) の手順で import するだけ。
- **Pages が無い場合:** Terraform で `cloudflare_pages_project` を定義したうえで `terraform apply` すると新規作成される（import は不要）。
- **DNS レコードが無い場合:** 同様に `terraform apply` で新規作成可能。

---

## 5. まとめ

- **必須:** (1) Terraform 用 API トークン（DNS Edit + Pages Edit）、(2) Account ID の取得と Terraform Cloud への登録。
- **任意:** 既存ゾーン・DNS・Pages の有無確認。あれば import、なければ apply で作成。

上記が済んだら、[terraform-cloud-setup.md](terraform-cloud-setup.md) で Terraform Cloud の Organization / Workspace / 変数を設定し、続けて [terraform-cloudflare-import.md](terraform-cloudflare-import.md) に従って import または `terraform plan` / `apply` を実行する。
