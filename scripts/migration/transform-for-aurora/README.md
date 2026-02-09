# C2-2: ID 変換・users 生成

C2-1 の Turso エクスポート JSON を読み、以下を行います。

- **users 生成:** 登場するすべての user 識別子（`user_id` / `owner_user_id` / `added_by_user_id` / `invited_by_user_id` = Cognito sub）ごとに UUID を発行し、users レコードを生成。`email` は NOT NULL のためプレースホルダー（`migration+...@zedi.invalid`）を設定。初回ログイン時に API の `POST /api/users/upsert` で実メールに更新可能。
- **ID マッピング:** ページ ID・ノート ID をすべて新 UUID に変換。参照（owner_id, source_page_id, note_id, page_id 等）を新 ID に差し替え。
- **型変換:** タイムスタンプを INTEGER (ms) → ISO8601 文字列、is_deleted を 0/1 → boolean。ghost_links に `original_target_page_id` / `original_note_id` を NULL で追加。
- **pages.content:** C2-3（Tiptap → Y.Doc）用にそのまま保持。Aurora の pages テーブルには投入せず、C2-3 で page_contents を生成する。

## 実行方法

```bash
# プロジェクトルートから。入力省略時は export-turso/output/ の最新 JSON を使用
node scripts/migration/transform-for-aurora/transform-id-and-users.mjs

# 入力ファイルを指定する場合
node scripts/migration/transform-for-aurora/transform-id-and-users.mjs path/to/turso-export-*.json
```

出力は `scripts/migration/transform-for-aurora/output/aurora-transform-<timestamp>.json` に作成されます。

## 出力形式

- `users`: Aurora users テーブル用（id, cognito_sub, email, display_name, avatar_url, created_at, updated_at）
- `pages`: Aurora pages 用（id, owner_id, source_page_id, title, content_preview, ...）＋ **content**（C2-3 用、Aurora には投入しない）
- `links`, `ghost_links`, `notes`, `note_pages`, `note_members`: すべて新 UUID 参照に変換済み

## C2-3: Tiptap JSON → Y.Doc（page_contents）

`aurora-transform-*.json` の `pages[].content`（Tiptap JSON）を Y.Doc に変換し、`page_contents` 用の ydoc_state（base64）を生成します。

```bash
bun run scripts/migration/transform-for-aurora/tiptap-to-ydoc.ts
# または
bun run scripts/migration/transform-for-aurora/tiptap-to-ydoc.ts path/to/aurora-transform-*.json
```

出力: `output/page-contents-<timestamp>.json`（`page_contents` 配列: page_id, ydoc_state_base64, version: 1）。  
本番エディタと同等のスキーマのため、StarterKit + Link + Image + Placeholder + Typography に加え、wikiLink / unilink / pageLink / pageLinkMark / mermaid のスタブを追加しています。空の text ノードは変換前に `\u00A0` に置換しています。

## C2-4: テキスト抽出・content_text

C2-3 の `page-contents-*.json` を読み、各 Y.Doc を ProseMirror JSON に戻してからプレーンテキストを抽出し、`content_text` を付与した JSON を出力します（pg_bigm 全文検索用）。

```bash
bun run scripts/migration/transform-for-aurora/extract-content-text.ts
# または
bun run scripts/migration/transform-for-aurora/extract-content-text.ts path/to/page-contents-*.json
```

出力: `output/page-contents-with-text-<timestamp>.json`（各 `page_contents` に `content_text` が追加された形式）。C2-5 の Aurora インポートではこのファイルの page_contents を使用します。

## C2-5: Aurora インポート

変換済みデータを RDS Data API で Aurora に投入します。AWS CLI が利用可能であることと、CLUSTER_ARN / SECRET_ARN / DATABASE が設定されていることが前提です（未設定時は db/aurora の dev 既定値を使用）。

```bash
# ドライラン（挿入件数のみ表示）
node scripts/migration/transform-for-aurora/import-to-aurora.mjs --dry-run

# 実行（入力は output/ 内の最新 aurora-transform-*.json と page-contents-with-text-*.json）
node scripts/migration/transform-for-aurora/import-to-aurora.mjs

# ファイルを指定する場合
node scripts/migration/transform-for-aurora/import-to-aurora.mjs --transform=path/to/aurora-transform.json --page-contents=path/to/page-contents-with-text.json
```

投入順: users → pages → notes → note_pages → note_members → links → ghost_links → page_contents。冪等のため INSERT ... ON CONFLICT DO NOTHING（page_contents は ON CONFLICT DO UPDATE）を使用。  
**注意:** page_contents の ydoc_state_base64 は長いため、環境によっては AWS CLI のコマンドライン長制限に達する場合があります。その場合は WSL や別環境での実行を検討してください。

## C2-7: 整合性検証（件数比較）

変換済み JSON の件数と Aurora の各テーブルの COUNT を比較し、一致するか検証します。

```bash
node scripts/migration/transform-for-aurora/verify-aurora-counts.mjs
# または
node scripts/migration/transform-for-aurora/verify-aurora-counts.mjs --transform=path/to/aurora-transform.json --page-contents=path/to/page-contents-with-text.json
```

期待値は `aurora-transform-*.json` と `page-contents-with-text-*.json` の件数。Aurora は RDS Data API で `SELECT COUNT(*)` を実行して比較。すべて一致すれば exit 0、不一致があれば exit 1。
