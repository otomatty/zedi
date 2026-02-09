# Phase C2 作業ログ（Turso → Aurora データ移行）

**作業期間:** 2026-02-09 〜 2026-02-10  
**対象:** C2-1 〜 C2-8（Turso エクスポート、ID 変換・users 生成、Tiptap→Y.Doc、content_text 抽出、Aurora インポート、整合性検証、ロールバック手順書）  
**前提ドキュメント:** [タスク細分化](rearchitecture-task-breakdown.md) / [リアーキテクチャ仕様書](../specs/zedi-rearchitecture-spec.md) / [データ構造仕様書](../specs/zedi-data-structure-spec.md) / [Turso→Aurora 移行の決定事項](20260208/turso-to-aurora-migration-decisions.md)

---

## 1. 作業サマリー

| タスク | 内容 | 状態 |
|--------|------|------|
| **C2-1** | Turso エクスポート（全テーブル → 単一 JSON） | 完了 |
| **C2-2** | ID 変換・users 生成（nanoid→UUID、Aurora 用変換） | 完了 |
| **C2-3** | Tiptap JSON → Y.Doc（page_contents 用 ydoc_state） | 完了 |
| **C2-4** | content_text 抽出（全文検索用） | 完了 |
| **C2-5** | Aurora インポート（RDS Data API） | 完了・本番実行済み |
| **C2-6** | ghost_links 拡張 | 完了 |
| **C2-7** | 整合性検証（件数比較） | 完了 |
| **C2-8** | ロールバック手順書 | 完了 |

---

## 2. 実施内容の詳細

### 2.1 C2-1: Turso エクスポート

- **目的**  
  Phase C2 データ移行のため、Turso の全テーブルを 1 つの JSON にエクスポートする。
- **成果物**
  - **形式定義:** `scripts/migration/export-turso/EXPORT_FORMAT.md` … エクスポート JSON のテーブル・フィールド定義
  - **スクリプト:** `scripts/migration/export-turso/export-turso.mjs` … Node で Turso（@libsql/client）に接続し、6 テーブル（pages, links, ghost_links, notes, note_pages, note_members）を 1 つの JSON に出力
  - **説明:** `scripts/migration/export-turso/README.md` … 実行方法・前提・次ステップ
- **環境変数**  
  `.env.development` / `.env` を読み込み、`VITE_TURSO_*` を `TURSO_*` にマッピング。未設定時は `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` をそのまま使用。
- **出力**  
  `scripts/migration/export-turso/output/turso-export-<timestamp>.json`。`.gitignore` に `scripts/migration/export-turso/output/` を追加済み。
- **実行例**  
  `node scripts/migration/export-turso/export-turso.mjs`（実行結果例: 1331 pages, 3 notes 等）

### 2.2 C2-2: ID 変換・users 生成

- **目的**  
  Turso の nanoid 等を UUID に変換し、Aurora 用の users を生成。参照をすべて新 ID に差し替える。
- **成果物**
  - **スクリプト:** `scripts/migration/transform-for-aurora/transform-id-and-users.mjs` … C2-1 出力を読み、users 生成・全 ID を UUID に変換。`pages.content` は C2-3 用に保持（Aurora の pages には投入しない）
  - **説明:** `scripts/migration/transform-for-aurora/README.md` … 実行方法・出力形式・C2-3 以降の手順
- **処理内容**
  - **users:** 登場するすべての user 識別子（Cognito sub）ごとに UUID を発行。`email` は NOT NULL のためプレースホルダー（`migration+...@zedi.invalid`）を設定
  - **ID マッピング:** ページ ID・ノート ID をすべて新 UUID に変換。参照（owner_id, source_page_id, note_id, page_id 等）を新 ID に差し替え
  - **型変換:** タイムスタンプを INTEGER (ms) → ISO8601 文字列、is_deleted を 0/1 → boolean。ghost_links に `original_target_page_id` / `original_note_id` を NULL で追加
- **出力**  
  `scripts/migration/transform-for-aurora/output/aurora-transform-<timestamp>.json`。`.gitignore` に同 `output/` を追加済み。
- **実行例**  
  `node scripts/migration/transform-for-aurora/transform-id-and-users.mjs`（入力省略時は C2-1 の最新エクスポートを使用）

### 2.3 C2-3: Tiptap JSON → Y.Doc

- **目的**  
  各ページの Tiptap（ProseMirror）JSON を Y.Doc に変換し、page_contents 用の ydoc_state（base64）を生成する。
- **成果物**
  - **スクリプト:** `scripts/migration/transform-for-aurora/tiptap-to-ydoc.ts` … C2-2 出力の `pages[].content` を `prosemirrorJSONToYDoc` で Y.Doc に変換。ydoc_state を base64 で出力
  - **スキーマ:** StarterKit + Link + Image + Placeholder + Typography に加え、wikiLink / unilink / pageLink / pageLinkMark / mermaid のスタブを追加（本番エディタと同等）
  - **空テキスト:** 空の text ノードは変換前に `\u00A0` に置換
- **出力**  
  `output/page-contents-<timestamp>.json`（page_id, ydoc_state_base64, version: 1）
- **実行例**  
  `bun run scripts/migration/transform-for-aurora/tiptap-to-ydoc.ts`（実行結果例: 1331 件すべて変換成功）

### 2.4 C2-4: content_text 抽出

- **目的**  
  page_contents の Y.Doc からプレーンテキストを抽出し、Aurora の `page_contents.content_text`（pg_bigm 全文検索用）を付与する。
- **成果物**
  - **スクリプト:** `scripts/migration/transform-for-aurora/extract-content-text.ts` … C2-3 の page-contents-*.json を読み、Y.Doc → yXmlFragmentToProsemirrorJSON で JSON に戻し、全 text ノードを連結して content_text を生成
- **出力**  
  `output/page-contents-with-text-<timestamp>.json`（各 page_content に content_text 追加）。C2-5 ではこのファイルの page_contents を使用
- **実行例**  
  `bun run scripts/migration/transform-for-aurora/extract-content-text.ts`（実行結果例: 1331 件中 1244 件が非空の content_text）

### 2.5 C2-5: Aurora インポート

- **目的**  
  変換済みデータを RDS Data API で Aurora に投入する。
- **成果物**
  - **スクリプト:** `scripts/migration/transform-for-aurora/import-to-aurora.mjs` … 最新の `aurora-transform-*.json` と `page-contents-with-text-*.json` を読み、`@aws-sdk/client-rds-data`（ExecuteStatementCommand）で順に投入
- **投入順**  
  users → pages → notes → note_pages → note_members → links → ghost_links → page_contents
- **冪等**  
  INSERT ... ON CONFLICT DO NOTHING（page_contents は ON CONFLICT DO UPDATE）。UUID・timestamp は SQL 内で `CAST(:param AS uuid)` / `CAST(:param AS timestamptz)` を指定
- **環境変数**  
  CLUSTER_ARN / SECRET_ARN / DATABASE。未設定時は dev 用既定値（db/aurora 等を参照）
- **オプション**  
  `--dry-run` で挿入件数のみ表示。`--transform=`, `--page-contents=` で入力ファイルを指定可能
- **本番インポート実行（2026-02-09）**  
  `node scripts/migration/transform-for-aurora/import-to-aurora.mjs` で dev Aurora へ投入。結果: users 1 ok, pages 1331 ok, notes 3 ok, note_pages 0, note_members 0, links 1 ok, ghost_links 0, page_contents 1331 ok。所要約 3 分。

### 2.6 C2-6: ghost_links 拡張

- **目的**  
  ghost_links に `original_target_page_id` / `original_note_id`（UUID NULL）を追加し、共有ノート由来のゴーストの元参照先を保持できるようにする。既存データは両方 NULL のまま投入する（タスク細分化の「スキーマのみ対応」）。
- **対応内容（新規スクリプトなし）**
  - **スキーマ:** C1-1 の Aurora DDL（`db/aurora/001_schema.sql`）で `ghost_links` に `original_target_page_id`, `original_note_id`（UUID NULL、REFERENCES）を定義済み。
  - **変換:** C2-2（`transform-id-and-users.mjs`）で Turso 由来の ghost_links に `original_target_page_id: null`, `original_note_id: null` を付与済み。
  - **インポート:** C2-5（`import-to-aurora.mjs`）で上記 2 カラムを INSERT 済み。
  - **API:** 同期 API（`terraform/modules/api/lambda/handlers/syncPages.mjs`）で GET/POST ともに `original_target_page_id`, `original_note_id` を取得・保存対象に含む。
- **結論**  
  C2-6 は C1-1 / C2-2 / C2-5 および API で対応済みのため、本タスクを完了とする。

### 2.7 C2-7: 整合性検証（件数比較）

- **目的**  
  変換済み JSON の件数と Aurora の各テーブルの COUNT を比較し、移行の整合性を検証する。
- **成果物**
  - **スクリプト:** `scripts/migration/transform-for-aurora/verify-aurora-counts.mjs` … 最新の `aurora-transform-*.json` と `page-contents-with-text-*.json` を読み、期待件数を算出。RDS Data API で各テーブル `SELECT COUNT(*)` を実行し、一致するか比較。すべて一致で exit 0、不一致で exit 1。
- **実行例**  
  `node scripts/migration/transform-for-aurora/verify-aurora-counts.mjs`（`--transform=`, `--page-contents=` で入力ファイル指定可能）
- **環境変数**  
  import-to-aurora と同様（CLUSTER_ARN / SECRET_ARN / DATABASE）

### 2.8 C2-8: ロールバック手順書

- **目的**  
  Turso を読み取り専用で残し、Aurora 不具合時に切り戻す手順を文書化する。
- **成果物**
  - **手順書:** `docs/plans/20260209/phase-c2-rollback-procedure.md` … 方針（Turso は切り戻しまで残す）、ロールバックのトリガー、クライアントを Turso に戻す手順、再移行の考慮、関連ドキュメント

---

## 3. 成果物一覧（パス）

| 種別 | パス | 備考 |
|------|------|------|
| C2-1 形式定義 | `scripts/migration/export-turso/EXPORT_FORMAT.md` | エクスポート JSON の定義 |
| C2-1 スクリプト | `scripts/migration/export-turso/export-turso.mjs` | Turso → 単一 JSON |
| C2-1 説明 | `scripts/migration/export-turso/README.md` | 実行方法・前提 |
| C2-2 スクリプト | `scripts/migration/transform-for-aurora/transform-id-and-users.mjs` | ID 変換・users 生成 |
| C2-3 スクリプト | `scripts/migration/transform-for-aurora/tiptap-to-ydoc.ts` | Tiptap JSON → Y.Doc |
| C2-4 スクリプト | `scripts/migration/transform-for-aurora/extract-content-text.ts` | content_text 抽出 |
| C2-5 スクリプト | `scripts/migration/transform-for-aurora/import-to-aurora.mjs` | Aurora インポート |
| C2-6 ghost_links 拡張 | （スキーマ C1-1・変換 C2-2・インポート C2-5・API で対応済み。新規成果物なし） | - |
| C2-7 スクリプト | `scripts/migration/transform-for-aurora/verify-aurora-counts.mjs` | 整合性検証（件数比較） |
| C2-8 手順書 | `docs/plans/20260209/phase-c2-rollback-procedure.md` | ロールバック手順 |
| 説明（C2-2〜C2-7） | `scripts/migration/transform-for-aurora/README.md` | 実行方法・出力形式 |

**出力ディレクトリ（gitignore 済み）**  
- `scripts/migration/export-turso/output/` … Turso エクスポート JSON  
- `scripts/migration/transform-for-aurora/output/` … aurora-transform-*.json, page-contents-*.json, page-contents-with-text-*.json  

---

## 4. 本番インポート結果（2026-02-09）

| テーブル | 件数 | 失敗 |
|----------|------|------|
| users | 1 | 0 |
| pages | 1331 | 0 |
| notes | 3 | 0 |
| note_pages | 0 | 0 |
| note_members | 0 | 0 |
| links | 1 | 0 |
| ghost_links | 0 | 0 |
| page_contents | 1331 | 0 |

- **環境:** dev Aurora（CLUSTER_ARN / SECRET_ARN / DATABASE は環境変数または既定値）
- **所要時間:** 約 3 分（約 2600+ API 呼び出し）

---

## 5. 今後の作業（タスク細分化に沿った順序）

- **Phase C3:** クライアント移行（Web）（StorageAdapter、API クライアント、同期・検索の差し替え等）→ [Phase C3 作業ログ](phase-c3-work-log.md)

---

## 6. 関連ドキュメント

| ドキュメント | 用途 |
|-------------|------|
| [rearchitecture-task-breakdown.md](rearchitecture-task-breakdown.md) | タスク細分化・Phase C/D/E 一覧 |
| [zedi-rearchitecture-spec.md](../specs/zedi-rearchitecture-spec.md) | リアーキテクチャ仕様（§16 移行計画） |
| [zedi-data-structure-spec.md](../specs/zedi-data-structure-spec.md) | DB スキーマ・エンティティ定義 |
| [turso-to-aurora-migration-decisions.md](20260208/turso-to-aurora-migration-decisions.md) | Turso → Aurora 移行の決定事項 |
| [db/aurora/README.md](../../db/aurora/README.md) | Aurora DDL の適用手順 |
| [phase-c1-work-log.md](phase-c1-work-log.md) | Phase C1 作業ログ（Aurora DDL・REST API） |
| [phase-c2-rollback-procedure.md](phase-c2-rollback-procedure.md) | C2-8 ロールバック手順書 |

---

## 7. 作業履歴（実施日・内容）

| 日付 | 実施内容 |
|------|----------|
| **2026-02-09** | **C2-1〜C2-5 実施** — Turso エクスポート、ID 変換・users 生成、Tiptap→Y.Doc 変換、content_text 抽出、Aurora インポートを実施。dev Aurora へ本番インポート実行（users 1, pages 1331, notes 3, links 1, page_contents 1331 等。所要約 3 分）。 |
| **2026-02-10** | **作業計画書との照合・C2-6〜C2-8 対応** — ① 計画書（phase-c2-work-log）と実装の照合で C2-1〜C2-5 完了を確認。② **C2-7** 整合性検証スクリプト `verify-aurora-counts.mjs` を新規作成（変換 JSON 件数と Aurora COUNT の比較）。③ **C2-8** ロールバック手順書 `phase-c2-rollback-procedure.md` を新規作成。④ **C2-6** ghost_links 拡張を、スキーマ（C1-1）・変換（C2-2）・インポート（C2-5）・API で対応済みと確認し完了扱いに。⑤ `transform-for-aurora/README.md` に C2-7 の実行方法を追記。⑥ 本作業ログに C2-6〜C2-8 の実施内容（§2.6〜2.8）、成果物一覧への追記、今後の作業の更新、作業履歴（本セクション）を反映。 |

---

**以上、Phase C2 の C2-1〜C2-8 の作業ログとする。Turso からのエクスポート〜変換〜Aurora への本番インポートまで実施済み。ghost_links 拡張（C2-6）はスキーマ・変換・インポート・API で対応済み。整合性検証スクリプト（C2-7）とロールバック手順書（C2-8）を追加済み。**
