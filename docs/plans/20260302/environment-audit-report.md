# GitHub Environment 監査レポート

**実施日:** 2026-03-02  
**リポジトリ:** otomatty/zedi

---

## 0. 決定方針

**ワークフロー用に新規 Environment を作成する。**

- **`development`** / **`production`** を新規作成し、 deploy-dev.yml / deploy-prod.yml の Secrets と Variables を設定する
- 既存の **`Zedi / development`** / **`Zedi / production`** は **変更しない**（Railway の Deployment 表示用として維持）
- ワークフローは引き続き `environment: development` / `environment: production` を参照

---

## 1. 確認コマンド

```bash
# 環境一覧
gh api repos/otomatty/zedi/environments --jq '.environments[] | .name'

# 各環境の Secrets（名前のみ・値は取得不可）
gh api 'repos/otomatty/zedi/environments/Zedi%20%2F%20development/secrets'
gh api 'repos/otomatty/zedi/environments/Zedi%20%2F%20production/secrets'

# 各環境の Variables（名前と値）
gh api 'repos/otomatty/zedi/environments/Zedi%20%2F%20development/variables'
gh api 'repos/otomatty/zedi/environments/Zedi%20%2F%20production/variables'
```

---

## 2. 既存 Environment 一覧

| 名前                 | 作成日     | 備考       |
| -------------------- | ---------- | ---------- |
| `Zedi / development` | 2026-02-27 | develop 用 |
| `Zedi / production`  | 2026-02-27 | main 用    |

---

## 3. Zedi / development の内容

### 3.1 Environment Secrets

| Secret 名 | 備考 |
| --------- | ---- |
| （なし）  | 0 件 |

### 3.2 Environment Variables

| Variable 名 | 値  | 備考 |
| ----------- | --- | ---- |
| （なし）    | —   | 0 件 |

### 3.3 Deployment protection rules

- 0 件（Required reviewers 等なし）

---

## 4. Zedi / production の内容

### 4.1 Environment Secrets

| Secret 名      | 備考                   |
| -------------- | ---------------------- |
| `API_BASE_URL` | ※値は API では取得不可 |

### 4.2 Environment Variables

| Variable 名 | 値  | 備考 |
| ----------- | --- | ---- |
| （なし）    | —   | 0 件 |

**注意:** `API_BASE_URL` は Secrets に登録されています。現在の `deploy-prod.yml` では `vars.API_BASE_URL`（Variables）を参照しているため、**Variables として登録し直す**必要がある可能性があります。

### 4.3 Deployment protection rules

- 0 件

---

## 5. 制限事項

### 5.1 Secrets の値は取得できない

GitHub API では Secrets の**値は取得できません**（セキュリティのため暗号化されています）。名前のみ一覧取得可能です。

→ 新環境作成時は、**手動で同じ値を再入力**する必要があります。

### 5.2 Variables の値

Variables は API で値の取得が可能です。今回の環境では Variables は 0 件でした。

---

## 6. 新環境（development / production）作成時の推奨設定

ワークフロー（`deploy-dev.yml` / `deploy-prod.yml`）が参照する内容に合わせて、以下の設定を行ってください。

### 6.1 development 環境

**Environment Secrets:**

| Secret                  | 説明                                         |
| ----------------------- | -------------------------------------------- |
| `DATABASE_URL`          | Railway development の PostgreSQL 接続文字列 |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare Pages デプロイ用                  |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID                     |

**Environment Variables:**

| Variable           | 例                                            |
| ------------------ | --------------------------------------------- |
| `API_BASE_URL`     | `https://api-development-b126.up.railway.app` |
| `REALTIME_URL`     | `wss://hocuspocus-development.up.railway.app` |
| `POLAR_MONTHLY_ID` | Polar 月額商品 ID                             |
| `POLAR_YEARLY_ID`  | Polar 年額商品 ID                             |

### 6.2 production 環境

**Environment Secrets:**

| Secret                  | 説明                                        |
| ----------------------- | ------------------------------------------- |
| `DATABASE_URL`          | Railway production の PostgreSQL 接続文字列 |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare Pages デプロイ用                 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare アカウント ID                    |

**Environment Variables:**

| Variable           | 例                  |
| ------------------ | ------------------- |
| `API_BASE_URL`     | 本番 API URL        |
| `REALTIME_URL`     | 本番 Hocuspocus URL |
| `POLAR_MONTHLY_ID` | Polar 月額商品 ID   |
| `POLAR_YEARLY_ID`  | Polar 年額商品 ID   |

---

## 7. 作成手順

### 7.1 GitHub 上での作成

1. **Settings** → **Environments** → **New environment**
2. 環境名に `development` を入力して作成
3. 同様に `production` を作成
4. 各環境の **Environment secrets** と **Environment variables** に上記を登録

### 7.2 各値の取得方法

各 Secret / Variable の取得手順は **`docs/guides/environment-secrets-variables-setup.md`** にまとめています。Railway、Cloudflare、Polar の各ダッシュボードからの取得方法を参照してください。

---

## 8. Railway と GitHub Environment の関係

### 8.1 調査結果

**Railway は GitHub Environment を「デプロイメントの表示用」に使用しています。**

| 用途                         | 説明                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **デプロイメント記録**       | Railway がデプロイする際、GitHub Deployment API にステータスを送信。その際に environment 名として `Zedi / development` または `Zedi / production` を指定している |
| **PR のステータス表示**      | デプロイ完了時、PR に「Zedi - api」「Zedi - hocuspocus」のようなチェックが表示される。これは GitHub Deployments に紐づく                                         |
| **Secrets/Variables の参照** | **Railway は GitHub Environment の Secrets/Variables を参照しない**。Railway は独自の環境変数（Railway Dashboard または `railway variable set`）を使用           |

### 8.2 確認方法

```bash
# 直近の GitHub Deployments（Railway が作成）
gh api 'repos/otomatty/zedi/deployments' --jq '.[0:3] | .[] | {environment, ref, created_at}'
```

**結果例:** `"environment":"Zedi / development"` — Railway がデプロイするたびにこの environment 名で Deployment が作成される。

### 8.3 まとめ

| 項目                        | Railway                                       | GitHub Actions（当リポジトリ）                                |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| Secrets/Variables の取得元  | Railway の環境変数                            | GitHub Environment（`environment: xxx` 指定時）               |
| `Zedi / development` の使用 | ✅ Deployment 記録の environment 名として使用 | ❌ ワークフローでは `environment: development` を指定（別名） |
| `Zedi / production` の使用  | ✅ 同上                                       | ❌ 同上（`environment: production`）                          |

**結論:** Railway は `Zedi / development` と `Zedi / production` を **Deployment の表示・記録用** に使用している。Railway は GitHub の Secrets/Variables を参照しないため、`Zedi / *` 環境に Secrets がほとんどなくても Railway デプロイは問題なく動作する。

---

## 9. 既存環境（Zedi / development, Zedi / production）の扱い

### 9.1 決定済み方針

**選択肢 A を採用:** 既存を維持しつつ新規作成

| 環境                         | 用途                                 | 操作             |
| ---------------------------- | ------------------------------------ | ---------------- |
| `development`（新規）        | deploy-dev.yml の Secrets/Variables  | 新規作成して設定 |
| `production`（新規）         | deploy-prod.yml の Secrets/Variables | 新規作成して設定 |
| `Zedi / development`（既存） | Railway の Deployment 表示           | 変更なし         |
| `Zedi / production`（既存）  | Railway の Deployment 表示           | 変更なし         |

### 9.2 方針の理由

- `Zedi / *` は Railway の Integration が自動で参照するため、変更や削除をしない
- ワークフロー用の `development` / `production` は Environment 名をシンプルに保ち、ワークフローとの対応を明確にする
