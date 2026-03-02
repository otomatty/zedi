# Terraform Cloud の設定方法

**目的:** [terraform/cloudflare/](../../terraform/cloudflare/) の state を Terraform Cloud（HCP Terraform）で管理するための、Terraform Cloud 側の設定手順を解説する。

**前提:** Cloudflare API トークンと Account ID の取得が済んでいること（[terraform-cloudflare-prerequisites.md](terraform-cloudflare-prerequisites.md) 参照）。

---

## 1. 概要

このリポジトリでは **remote バックエンド** で Terraform Cloud に state を保存する。設定の流れは次のとおり。

1. Terraform Cloud にサインアップし、Organization と Workspace を作成する
2. Workspace に **Environment 変数** と **Terraform 変数** を登録する
3. ローカルの `main.tf` の backend 設定（organization / workspace 名）を、作成したものに合わせる
4. ローカルで `terraform login` してから `terraform init` を実行する

---

## 2. Terraform Cloud にサインアップ

1. [Terraform Cloud](https://app.terraform.io/)（HCP Terraform）にアクセス
2. **Sign up** でアカウントを作成（GitHub 連携も可能）
3. ログイン後、**Create an organization** を選択

**Organization 名:** あとで `main.tf` の `backend "remote"` に書く名前（このリポジトリでは `Saedgewell`）。英小文字・数字・ハイフンのみ。作成後は変更しづらいので、決めてから作成する。

---

## 3. Workspace の作成

1. 画面上部の **New** → **Workspace** をクリック
2. **CLI-driven workflow** を選択（「No VCS connection」などと表記されている場合あり）
3. **Workspace name** を入力（例: `cloudflare`）
   - この名前を `main.tf` の `workspaces { name = "cloudflare" }` に合わせる
4. **Create workspace** をクリック

作成後、Workspace の **Settings** → **General** で **Execution mode** が **Local** になっていることを確認する（CLI から `plan` / `apply` するため）。

---

## 4. 変数の登録

Workspace を開いた状態で、左メニュー **Variables** を開く。

**重要:** この設定では **Terraform variables** のみを使用する。Environment variables は使わない。Terraform Cloud 上で `plan` / `apply` が実行されるとき、Provider には Terraform 変数の値が渡される。

### 4.1 Terraform variables（必須 2 つ）

**Add variable** → **Terraform variable** で以下を登録する。

| Key                     | Value                               |      Sensitive      | 説明                  |
| ----------------------- | ----------------------------------- | :-----------------: | --------------------- |
| `cloudflare_api_token`  | Cloudflare で発行した API トークン  | ✅ チェックを入れる | Provider 認証用       |
| `cloudflare_account_id` | Cloudflare の Account ID（32 文字） |        不要         | Pages 等の account_id |

**HCL** で登録する場合の例:

```hcl
cloudflare_api_token   = "あなたのAPIトークン"   # Sensitive にチェック
cloudflare_account_id  = "あなたのAccount ID"
```

- **Sensitive** にチェックを入れた変数は画面に再表示されない。誤った場合は削除して再登録する。
- **Environment variable ではなく Terraform variable で登録すること。** `CLOUDFLARE_API_TOKEN` を Environment にだけ入れていると、Terraform Cloud の実行環境で Provider に渡らず `must provide exactly one of "api_key", "api_token"...` のエラーになる。

**注意:** `zone_domain` や `api_cname_target` などは `variables.tf` に default があるため省略可能。必要に応じてここで上書きできる。

---

## 5. ローカル設定と backend の一致

リポジトリの [terraform/cloudflare/main.tf](../../terraform/cloudflare/main.tf) には、次のように backend が書かれている。

```hcl
backend "remote" {
  organization = "Saedgewell"

  workspaces {
    name = "cloudflare"
  }
}
```

- **organization:** 手順 2 で作成した Organization 名
- **workspaces.name:** 手順 3 で作成した Workspace 名

Terraform Cloud で別名にした場合は、この 2 つを同じに編集する。

編集後、プロジェクトルートで:

```bash
cd terraform/cloudflare
terraform init
```

初回は「Migrate existing state?」と聞かれた場合、**新規の場合は No**、既にローカルに `terraform.tfstate` がある場合は Migrate するかどうか選択する。

---

## 6. ローカルでの認証（terraform login）

Terraform Cloud に state を送るには、CLI が認証している必要がある。

1. ターミナルで次を実行:
   ```bash
   terraform login
   ```
2. 表示された URL をブラウザで開く
3. Terraform Cloud にログインし、**Token** を発行する
4. 発行されたトークンをターミナルに貼り付けて完了

**注意:** トークンは `~/.terraform.d/credentials.tfrc.json` に保存される。共有マシンの場合は取り扱いに注意する。

---

## 7. 動作確認

```bash
cd terraform/cloudflare
terraform init   # 未実行なら実行
terraform plan
```

- **plan** がエラーなく実行され、Terraform Cloud の Web UI の **Runs** に run が表示されれば、Terraform Cloud の設定は問題ない。
- 既存リソースを管理する場合は、そのあと [terraform-cloudflare-import.md](terraform-cloudflare-import.md) の手順で import する。

---

## 8. 参考リンク

| 項目                | URL                                                                       |
| ------------------- | ------------------------------------------------------------------------- |
| Terraform Cloud     | https://app.terraform.io/                                                 |
| CLI-driven workflow | https://developer.hashicorp.com/terraform/cloud-docs/workspaces/run/cli   |
| Workspace variables | https://developer.hashicorp.com/terraform/cloud-docs/workspaces/variables |

---

## 9. まとめ

| ステップ | 作業内容                                                                                                                                    |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | Terraform Cloud にサインアップし、Organization を作成                                                                                       |
| 2        | CLI-driven の Workspace を 1 つ作成（例: 名前 `cloudflare`）                                                                                |
| 3        | Variables で Terraform 変数 `cloudflare_api_token`（Sensitive）と `cloudflare_account_id` を登録（Environment 変数ではなく Terraform 変数） |
| 4        | `main.tf` の `organization` と `workspaces.name` を上記と一致させる                                                                         |
| 5        | `terraform login` のあと `terraform init` と `terraform plan` で確認                                                                        |

ここまで完了すれば、Terraform の state は Terraform Cloud に保存され、複数人や CI から同じ workspace を参照できる。
