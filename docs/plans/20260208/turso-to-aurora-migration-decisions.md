# Turso → Aurora DB 移行：現時点で決まっていること

**作成日:** 2026-02-08  
**最終更新:** 2026-02-08（会話で確定した方針を反映）  
**目的:** DB 移行（Phase C3）を進める前に、すでに決まっている方針・前提を一覧にし、未決定事項を明確にする。

---

## 0. 会話で確定した方針（要約）

| 項目 | 確定内容 |
|------|----------|
| **移行先スキーマ** | **zedi-data-structure-spec.md** の新設計。pages/notes テーブル名維持、**ID はすべて UUID**、**users 新設**、ghost_links に **original_target_page_id / original_note_id** 追加。 |
| **ローカルストア** | **自分のページのみ**ローカルに保存。共有ノートはローカルに保存せず、ノート一覧・`/notes/[id]` は **API から都度取得**。自分のページは**表示速度優先**・リアルタイム不要。 |
| **リアルタイム** | Hocuspocus は**共有ノート内のページ**を編集するときのみ使用。自分のページでは使わない。 |
| **共有ノートからコピー** | コピーしたページ内の「同じノート内の他ページへのリンク」は**ゴーストリンクに変換**。元参照先は ghost_links の original_* に保持。クリック時に「自分のオリジナルページとして作成」か「元の共有ノートのページをコピー」を選択する UX（§3.4）。 |
| **接続** | アプリは Aurora に直結せず **API 経由**。クライアントは API クライアントに差し替える。 |

---

## 1. 決まっていること

### 1.1 移行先インフラ

| 項目 | 内容 |
|------|------|
| **移行先** | **Aurora Serverless v2**（PostgreSQL） |
| **Terraform** | `terraform/modules/database` でモジュール定義済み。開発環境（dev）では **すでにクラスターがデプロイ済み**。 |
| **既存リソース（dev）** | クラスター `zedi-dev-cluster`、インスタンス `zedi-dev-instance-1`、DB 名 `zedi`、PostgreSQL 15.8、0.5–4 ACU。 |
| **認証・シークレット** | DB 認証情報は Secrets Manager（`zedi-dev-db-credentials`）に保存。IAM 認証・Data API 有効。 |
| **本番** | 本番用は `prod` workspace で同じ database モジュールを apply する想定（未実施）。削除保護・ファイナルスナップショットは prod 時有効。 |

参照: `docs/work-logs/20260131/aws-infrastructure-phase3-database.md`, `docs/specs/aws-terraform-implementation-plan.md` §3.2

---

### 1.2 アプリ側の接続方針

| 項目 | 内容 |
|------|------|
| **接続方法** | **Aurora にはブラウザから直結しない**。接続は **API 経由**（例: Lambda + API Gateway）に切り替える方針。 |
| **コード上の記載** | `src/lib/turso.ts` 冒頭コメントに「After AWS migration (Phase C3), connection will switch to **Aurora Serverless v2 via API**; this file's remote sync will be replaced」と記載済み。 |
| **環境変数** | 現行の `VITE_TURSO_DATABASE_URL` / `VITE_TURSO_AUTH_TOKEN` は、移行後は **Aurora の接続情報をフロントに直書きしない**。API のエンドポイントと認証（Cognito ID Token 等）に置き換える想定。 |

参照: `docs/plans/20260208/phase-c-work-breakdown.md` C3, `docs/plans/20260203/clerk-to-cognito-migration-investigation.md`（Aurora 移行後の認可は Cognito JWT で API 認証）

---

### 1.3 データ・スキーマの性質

| 項目 | 内容 |
|------|------|
| **現行 DB** | Turso（LibSQL / **SQLite 互換**）。型は TEXT, INTEGER（タイムスタンプ）など。 |
| **移行先スキーマ** | **zedi-data-structure-spec.md の新設計に確定**。PostgreSQL。**ID はすべて UUID**。users テーブルを新設、pages.owner_id / source_page_id、ghost_links.original_target_page_id / original_note_id 等（§1.6 参照）。 |
| **データの流れ** | Turso からエクスポート → PostgreSQL 用に変換（型・UUID 変換含む）→ Aurora にインポート。手順は別計画で文書化してから実施する推奨。 |
| **ローカル（IndexedDB）** | **自分のページのみ**をローカルに保存。共有ノートはローカルに保存せず、ノート画面（例: `/notes/[id]`）で API から都度取得。ローカルは「自分のページ」用の最小スキーマ（表示速度優先）。移行後も「リモート: Aurora（API 経由）」と整合させる。 |

参照: `docs/plans/20260208/phase-c-work-breakdown.md` C3, `docs/specs/zedi-data-structure-spec.md`, `docs/specs/zedi-future-considerations-options.md`

---

### 1.4 現行 Turso で使っているテーブル（移行元の把握）

アプリが参照しているテーブルは以下のとおり（`src/lib/turso.ts` の SCHEMA_SQL 等より）。**現行** Turso には users テーブルはなく、ghost_links に original_* はない。

| テーブル | 主なカラム（現行） | 備考 |
|----------|--------------------|------|
| **pages** | id, user_id, title, content, content_preview, thumbnail_url, source_url, vector_embedding, created_at, updated_at, is_deleted | ページ（情報の最小単位） |
| **links** | source_id, target_id, created_at | ページ間リンク |
| **ghost_links** | link_text, source_page_id, created_at | 未作成リンクのトラッキング。移行先で original_target_page_id, original_note_id を追加（§1.6）。 |
| **notes** | id, owner_user_id, title, visibility, created_at, updated_at, is_deleted | ノート（コンテナ） |
| **note_pages** | note_id, page_id, added_by_user_id, created_at, updated_at, is_deleted | ノート‐ページ紐付け |
| **note_members** | note_id, member_email, role, invited_by_user_id, created_at, updated_at, is_deleted | ノートメンバー |

**user_id 系:** すでに Phase B で Clerk userId → Cognito `sub` に更新済み。移行先では users テーブルを設け、pages.owner_id / notes.owner_id 等は users.id (UUID) を参照する想定。

参照: `docs/work-logs/20260208/phase-b-implementation-status.md`, `src/lib/turso.ts`

---

### 1.6 移行先スキーマ（会話で確定した新設計）

移行先の Aurora スキーマは **docs/specs/zedi-data-structure-spec.md** に定義する新設計に合わせる。以下はその要約。

| 項目 | 内容 |
|------|------|
| **テーブル名** | pages, notes を維持（documents 等へのリネームはしない）。 |
| **ID** | すべて **UUID**。 |
| **新規テーブル** | **users**（id UUID, cognito_sub, email, display_name, avatar_url, created_at, updated_at）。pages / notes の owner は users.id を参照。 |
| **pages** | id UUID, owner_id (users.id), source_page_id (NULL 許容・コピー元), title, content_preview, thumbnail_url, source_url, created_at, updated_at, is_deleted。本文は Y.Doc で別管理（page_contents 等）。 |
| **notes** | id UUID, owner_id (users.id), title, visibility, created_at, updated_at, is_deleted。 |
| **note_pages / note_members** | 同様の役割。ID は UUID。 |
| **links** | source_id, target_id（いずれも pages.id UUID）。 |
| **ghost_links** | link_text, source_page_id (UUID), created_at に加え、**original_target_page_id (UUID NULL)**, **original_note_id (UUID NULL)** を追加。共有ノートからコピーしたページ内のゴーストのみ両方を設定。クリック時に「新規作成」か「元の共有ノートのページをコピー」を選ぶ UX で利用（zedi-data-structure-spec §3.4）。 |

**ローカルストア:** 自分のページのみローカルに保存。共有ノートはローカルに保存せず、ノート一覧・`/notes/[id]` は API 取得。自分のページは表示速度優先・リアルタイム不要。リアルタイム（Hocuspocus）は共有ノート内のページを編集するときのみ使用。

参照: `docs/specs/zedi-data-structure-spec.md` 全体, `docs/specs/zedi-future-considerations-options.md`

---

### 1.5 進め方の推奨（計画書での合意）

- **規模:** 大。**別計画**として「スキーマ設計・データ移行手順・ロールバック手順」を文書化してから実施することを推奨。
- **旧 Turso:** 移行完了まで読み取り専用で維持する方針が application-implementation-plan に記載されている。

参照: `docs/plans/20260208/phase-c-work-breakdown.md` C3, `docs/specs/application-implementation-plan.md`（移行・旧環境停止）

---

## 2. 移行先スキーマの選択（確定済み）

- **realtime-collaboration-specification.md** の「4.1 Aurora PostgreSQL スキーマ」では、`users`, `documents`（Y.Doc 状態・検索ベクトル含む）, `links`, `ghost_links`, `document_shares` など、**リアルタイム共同編集仕様用のスキーマ**が定義されている。テーブル名は documents で、現行アプリの pages / notes とは異なる。
- **結論（会話で確定）:** 移行先は **「現行の pages / notes を維持しつつ、zedi-data-structure-spec.md の新設計に合わせる」**。documents へのリネームはせず、**pages / notes のまま**。**users を新設**し、**ID は UUID**、**ghost_links に original_target_page_id / original_note_id を追加**する。本文は Y.Doc で別管理（page_contents 等）。  
- realtime 仕様の「documents」スキーマは、リアルタイム編集の別文脈での例として参照するにとどめ、**Aurora の本番スキーマは zedi-data-structure-spec を正とする**。

---

## 3. 未決定・これから決めること

以下は **会話で確定したこと** を除いた、残りの未決定事項。

| 項目 | 説明 |
|------|------|
| **接続レイヤー（API）** | API（Lambda + API Gateway）の具体的な設計（エンドポイント、認可、「自分のページ」のメタデータ同期 API、Y.Doc 保存／取得 API 等）。 |
| **データ移行スクリプト** | Turso エクスポート → 型変換（TEXT→UUID 等）・users 生成・ghost_links の original_* は移行時 NULL でよい等 → Aurora インポート。対象テーブル・順序・冪等性・ロールバック手順を文書化する。 |
| **本番 Aurora** | 本番用クラスターを新規に Terraform で作成するか、既存の database モジュールで `prod` 用に apply するか（いずれも「本番用」としてのパラメータは未実施）。 |

---

## 4. 次のアクション（推奨）

1. ~~**スキーマ方針の決定**~~ → **済。** zedi-data-structure-spec の新設計に確定（§1.6, §2）。
2. **Aurora 用 DDL の作成**  
   zedi-data-structure-spec §2 に基づき、users / pages / notes / note_pages / note_members / links / ghost_links の PostgreSQL 用 CREATE TABLE / インデックスを定義する。ID は UUID、ghost_links に original_target_page_id, original_note_id (NULL 許容) を含める。
3. **API 設計**  
   ブラウザからは Turso 直結をやめ、Lambda + API Gateway で「自分のページ」のメタデータ同期・Y.Doc 保存／取得、ノート一覧・共有ノート取得等を提供する形にし、認可は Cognito JWT で行う方針を具体化する。
4. **データ移行手順書の作成**  
   エクスポート（Turso）→ 変換（ID を UUID 化、users の生成、既存 ghost_links の original_* は NULL のまま等）→ インポート（Aurora）の手順と、ロールバック手順を文書化する。
5. **クライアント修正**  
   `turso.ts` のリモート同期部分を、新しい API を呼ぶ実装に差し替える。ローカルストアは「自分のページ」のみとし、zedi-data-structure-spec §4 および zedi-future-considerations-options の推奨（IndexedDB 直接で表示速度優先等）に合わせる。

---

## 5. 関連ドキュメント

| ドキュメント | 用途 |
|-------------|------|
| **docs/specs/zedi-data-structure-spec.md** | **移行先スキーマの正本。** pages/notes 維持・UUID・users・ghost_links 拡張・ローカルは自分のページのみ・共有ノートは API 取得・コピー時のリンク／ゴーストの扱い（§3.3, §3.4）。 |
| **docs/specs/zedi-future-considerations-options.md** | ローカルストア（IndexedDB 直接推奨）、同期 API（差分同期）、競合・永続化・users・member_email の選択肢と推奨。 |
| `docs/plans/20260208/phase-c-work-breakdown.md` | C3 DB 移行の概要・規模・推奨 |
| `docs/plans/20260123/implementation-status-and-roadmap.md` | AWS 移行全体・DB 移行の位置づけ |
| `docs/work-logs/20260131/aws-infrastructure-phase3-database.md` | 既存 Aurora（dev）の構成・出力値 |
| `docs/specs/aws-terraform-implementation-plan.md` | database モジュール（Aurora）の Terraform 定義 |
| `docs/specs/realtime-collaboration-specification.md` §4.1 | リアルタイム仕様用スキーマ例（documents 系）。本移行の正本は zedi-data-structure-spec。 |
| `docs/specs/application-implementation-plan.md` | 移行フェーズ・移行スクリプト例・旧環境停止 |
| `src/lib/turso.ts` | 現行テーブル定義・同期ロジック・Phase C3 コメント |
