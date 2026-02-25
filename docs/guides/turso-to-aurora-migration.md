# Turso → dev Aurora データ移行ガイド

> **注:** 本移行は完了済みです。Turso および Clerk は廃止され、スクリプト（C2-1 の export-turso 等）は削除されています。以下は過去の手順の参照用です。

Turso に保存していたデータを dev 環境の Aurora に移行する手順です。既存の移行スクリプト（C2-1 〜 C2-5）を順に実行していました。

## 前提

- **Aurora:** dev の Terraform apply 済みで、`001_schema.sql` を適用済みであること（テーブルが存在すること）
- **Turso:** 移行元の DB の URL と AUTH TOKEN が取得できること（`.env.development` の `VITE_TURSO_*` でも可）
- **Node / Bun:** プロジェクトルートで `npm install` または `bun install` 済み
- **AWS:** `aws configure` 済み（Aurora へのインポート時に RDS Data API を使用）

## 注意: ユーザー ID と Cognito sub

- Turso の `pages.user_id` などは **Clerk の user ID** または **Cognito sub** のどちらかです。
- 変換スクリプトは、これらの値をそのまま Aurora の `users.cognito_sub` として登録します。
- **Clerk から Cognito に切り替えた場合:** 移行後、Aurora の `users` には「Clerk ID を cognito_sub に持つユーザー」が入ります。現在ログインしている Cognito の sub とは一致しないため、**自分のページが別ユーザー扱いになり一覧に出てこない**ことがあります。その場合は、移行前に `scripts/migration/update-user-ids-to-cognito.ts` で Turso 側の user_id を Cognito sub に更新してからエクスポートするか、移行後に Aurora の `users` / `pages` を手動で紐付け直す必要があります。

---

## 手順 1: Turso からエクスポート（C2-1）

プロジェクトルートで実行します。`.env.development` に `VITE_TURSO_DATABASE_URL` と `VITE_TURSO_AUTH_TOKEN` があれば自動で読みます。

```bash
# プロジェクトルート
node scripts/migration/export-turso/export-turso.mjs
```

- 出力: `scripts/migration/export-turso/output/turso-export-YYYY-MM-DDTHH-mm-ss.json`
- 別ディレクトリに出力: `node scripts/migration/export-turso/export-turso.mjs --out-dir=./my-export`

---

## 手順 2: ID 変換・users 生成（C2-2）

エクスポート JSON を Aurora 用に変換します。入力省略時は「手順 1」の出力ディレクトリ内の**最新ファイル**を使います。

```bash
node scripts/migration/transform-for-aurora/transform-id-and-users.mjs
# またはファイル指定
node scripts/migration/transform-for-aurora/transform-id-and-users.mjs path/to/turso-export-*.json
```

- 出力: `scripts/migration/transform-for-aurora/output/aurora-transform-<timestamp>.json`

---

## 手順 3: Tiptap JSON → Y.Doc（C2-3）

ページ本文（Tiptap JSON）を Y.Doc に変換し、`page_contents` 用の base64 を生成します。

```bash
bun run scripts/migration/transform-for-aurora/tiptap-to-ydoc.ts
# またはファイル指定
bun run scripts/migration/transform-for-aurora/tiptap-to-ydoc.ts path/to/aurora-transform-*.json
```

- 出力: `scripts/migration/transform-for-aurora/output/page-contents-<timestamp>.json`

---

## 手順 4: テキスト抽出・content_text（C2-4）

全文検索用の `content_text` を付与した JSON を生成します。

```bash
bun run scripts/migration/transform-for-aurora/extract-content-text.ts
# またはファイル指定
bun run scripts/migration/transform-for-aurora/extract-content-text.ts path/to/page-contents-*.json
```

- 出力: `scripts/migration/transform-for-aurora/output/page-contents-with-text-<timestamp>.json`

---

## 手順 5: Aurora へインポート（C2-5）

変換済み JSON を RDS Data API で dev Aurora に投入します。**SECRET_ARN は apply のたびに変わるため、必ず現在の値を渡します。**

```bash
# 現在の dev の Secret ARN を取得（terraform ディレクトリで）
cd terraform
terraform output -raw db_credentials_secret_arn
# 例: arn:aws:secretsmanager:ap-northeast-1:590183877893:secret:zedi-dev-db-credentials-QbCDfb
```

```bash
# プロジェクトルートに戻る
cd ..

# ドライラン（挿入件数のみ表示）
SECRET_ARN="<上で取得した ARN>" node scripts/migration/transform-for-aurora/import-to-aurora.mjs --dry-run

# 実行（入力は output/ 内の最新 aurora-transform-*.json と page-contents-with-text-*.json）
SECRET_ARN="<上で取得した ARN>" node scripts/migration/transform-for-aurora/import-to-aurora.mjs
```

- 投入順: users → pages → notes → note_pages → note_members → links → ghost_links → page_contents
- 冪等のため `ON CONFLICT DO NOTHING` / `DO UPDATE` を使用。既存データがある場合は重複分はスキップまたは更新されます。
- **注意:** `page_contents` の base64 が長いと、環境によっては AWS CLI のコマンド長制限に当たることがあります。その場合は WSL や別マシンで実行するか、スクリプト側でチャンク分割する対応を検討してください。

---

## 手順 6: 件数検証（C2-7）

変換 JSON の件数と Aurora の各テーブル件数が一致するか確認します。

```bash
SECRET_ARN="<同上>" node scripts/migration/transform-for-aurora/verify-aurora-counts.mjs
```

- すべて一致すれば exit 0、不一致なら exit 1 で終了します。

---

## 一括実行例（コピペ用）

移行元 Turso の認証情報と、**いまの dev の Secret ARN** を用意したうえで:

```bash
# 1. エクスポート（.env.development の VITE_TURSO_* を使用する場合はそのまま）
node scripts/migration/export-turso/export-turso.mjs

# 2. 変換
node scripts/migration/transform-for-aurora/transform-id-and-users.mjs

# 3. Tiptap → Y.Doc
bun run scripts/migration/transform-for-aurora/tiptap-to-ydoc.ts

# 4. content_text 抽出
bun run scripts/migration/transform-for-aurora/extract-content-text.ts

# 5. Aurora に投入（SECRET_ARN は terraform output -raw db_credentials_secret_arn で取得）
export SECRET_ARN="arn:aws:secretsmanager:ap-northeast-1:590183877893:secret:zedi-dev-db-credentials-QbCDfb"
node scripts/migration/transform-for-aurora/import-to-aurora.mjs --dry-run
node scripts/migration/transform-for-aurora/import-to-aurora.mjs

# 6. 検証
node scripts/migration/transform-for-aurora/verify-aurora-counts.mjs
```

`SECRET_ARN` は、その時点の `terraform output -raw db_credentials_secret_arn` の値に置き換えてください。

---

## 参照

- 変換・インポートの詳細: `scripts/migration/transform-for-aurora/README.md`
- Turso エクスポート形式: `scripts/migration/export-turso/EXPORT_FORMAT.md`
