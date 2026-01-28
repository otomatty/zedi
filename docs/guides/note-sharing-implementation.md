# 公開ノート機能の実装ガイド

このドキュメントでは、Zediの公開ノート（ページ共有）機能の実装内容とセットアップ手順を説明します。

## 概要

公開ノート機能により、ユーザーは自分のページを「ノート」という単位でまとめて公開・共有できます。

### 公開範囲（Visibility）

| 値 | 説明 |
|---|---|
| `private` | 非公開（所有者のみアクセス可能） |
| `public` | 公開（誰でも閲覧可能） |
| `unlisted` | 限定公開（URLを知っていれば誰でも閲覧可能） |
| `restricted` | 限定公開（招待されたメンバーのみ閲覧可能） |

### メンバーロール

| 値 | 説明 |
|---|---|
| `viewer` | 閲覧のみ |
| `editor` | ページの追加・削除が可能 |

### URL構成

| パス | 説明 |
|---|---|
| `/note/:noteId` | ノート内ページ一覧 |
| `/note/:noteId/page/:pageId` | ノート内の個別ページ（読み取り専用） |
| `/note/:noteId/settings` | ノート設定（タイトル・公開範囲） |
| `/note/:noteId/members` | メンバー管理（招待・権限変更・削除） |

---

## データベーススキーマ

### 新規テーブル

#### `notes` - 公開ノート

```sql
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    title TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_notes_owner ON notes(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_notes_visibility ON notes(visibility);
```

#### `note_pages` - ノート内ページ

```sql
CREATE TABLE IF NOT EXISTS note_pages (
    note_id TEXT NOT NULL,
    page_id TEXT NOT NULL,
    added_by_user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    PRIMARY KEY (note_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_note_pages_note ON note_pages(note_id);
CREATE INDEX IF NOT EXISTS idx_note_pages_page ON note_pages(page_id);
```

#### `note_members` - ノートメンバー

```sql
CREATE TABLE IF NOT EXISTS note_members (
    note_id TEXT NOT NULL,
    member_email TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    invited_by_user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER DEFAULT 0,
    PRIMARY KEY (note_id, member_email)
);

CREATE INDEX IF NOT EXISTS idx_note_members_note ON note_members(note_id);
CREATE INDEX IF NOT EXISTS idx_note_members_email ON note_members(member_email);
```

---

## マイグレーション手順

### 前提条件

- Tursoアカウントとデータベースが作成済み
- Tursoダッシュボード（https://turso.tech/app）にアクセス可能

### 手順

1. **Tursoダッシュボードにアクセス**
   - https://turso.tech/app

2. **対象のデータベースを選択**
   - 開発用: `zedi-dev`
   - 本番用: `zedi` (または該当するDB名)

3. **「Shell」タブをクリック**

4. **以下のSQLを順番に実行**

   > **注意**: Tursoダッシュボードでは複数のSQL文を一度に実行できない場合があります。各ステートメントを個別に実行してください。

   ```sql
   -- 1. notesテーブル
   CREATE TABLE IF NOT EXISTS notes (
       id TEXT PRIMARY KEY,
       owner_user_id TEXT NOT NULL,
       title TEXT,
       visibility TEXT NOT NULL DEFAULT 'private',
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL,
       is_deleted INTEGER DEFAULT 0
   );
   ```

   ```sql
   CREATE INDEX IF NOT EXISTS idx_notes_owner ON notes(owner_user_id);
   ```

   ```sql
   CREATE INDEX IF NOT EXISTS idx_notes_visibility ON notes(visibility);
   ```

   ```sql
   -- 2. note_pagesテーブル
   CREATE TABLE IF NOT EXISTS note_pages (
       note_id TEXT NOT NULL,
       page_id TEXT NOT NULL,
       added_by_user_id TEXT NOT NULL,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL,
       is_deleted INTEGER DEFAULT 0,
       PRIMARY KEY (note_id, page_id)
   );
   ```

   ```sql
   CREATE INDEX IF NOT EXISTS idx_note_pages_note ON note_pages(note_id);
   ```

   ```sql
   CREATE INDEX IF NOT EXISTS idx_note_pages_page ON note_pages(page_id);
   ```

   ```sql
   -- 3. note_membersテーブル
   CREATE TABLE IF NOT EXISTS note_members (
       note_id TEXT NOT NULL,
       member_email TEXT NOT NULL,
       role TEXT NOT NULL DEFAULT 'viewer',
       invited_by_user_id TEXT NOT NULL,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL,
       is_deleted INTEGER DEFAULT 0,
       PRIMARY KEY (note_id, member_email)
   );
   ```

   ```sql
   CREATE INDEX IF NOT EXISTS idx_note_members_note ON note_members(note_id);
   ```

   ```sql
   CREATE INDEX IF NOT EXISTS idx_note_members_email ON note_members(member_email);
   ```

5. **テーブルが作成されたことを確認**

   ```sql
   SELECT name FROM sqlite_master WHERE type='table';
   ```

   期待される結果:
   ```json
   [
     {"name":"pages"},
     {"name":"links"},
     {"name":"ghost_links"},
     {"name":"notes"},
     {"name":"note_pages"},
     {"name":"note_members"}
   ]
   ```

---

## 関連ファイル一覧

### 型定義

| ファイル | 説明 |
|---|---|
| `src/types/note.ts` | ノート関連の型定義 |
| `src/types/page.ts` | ページ型に`ownerUserId`を追加 |

### リポジトリ

| ファイル | 説明 |
|---|---|
| `src/lib/noteRepository.ts` | ノートのCRUD操作 |

### React Hooks

| ファイル | 説明 |
|---|---|
| `src/hooks/useNoteQueries.ts` | ノート関連のReact Queryフック |

### ページコンポーネント

| ファイル | 説明 |
|---|---|
| `src/pages/NoteView.tsx` | ノート内ページ一覧 |
| `src/pages/NotePageView.tsx` | ノート内ページの読み取り専用ビュー |
| `src/pages/NoteSettings.tsx` | ノート設定ページ |
| `src/pages/NoteMembers.tsx` | メンバー管理ページ |

### UIコンポーネント

| ファイル | 説明 |
|---|---|
| `src/components/note/NoteCard.tsx` | ノートカード（ホーム画面用） |
| `src/components/note/NotePageCard.tsx` | ノート内ページカード |
| `src/components/note/NotesSection.tsx` | ホーム画面のノートセクション |
| `src/components/note/NoteVisibilityBadge.tsx` | 公開範囲バッジ |

### 同期処理

| ファイル | 説明 |
|---|---|
| `src/lib/turso.ts` | ノート関連テーブルの同期処理を追加 |

### ルーティング

| ファイル | 説明 |
|---|---|
| `src/App.tsx` | ノート関連のルートを追加 |

### マイグレーション

| ファイル | 説明 |
|---|---|
| `db/schema.sql` | 完全なスキーマ定義（参照用） |
| `db/migrations/001_add_notes_tables.sql` | ノートテーブルのマイグレーションSQL |

---

## アーキテクチャ

### Local-First設計

- **書き込み**: すべてローカルDB（IndexedDB + sql.js）に保存
- **同期**: 初回ロード時と手動同期時にリモート（Turso）と同期
- **公開ノートの閲覧**: ローカルにない場合はリモートから直接取得

### 権限チェックの流れ

1. `useNote()` でノート情報とアクセス権を取得
2. ローカルDBにない場合はリモートDBから取得（`allowRemote: true`）
3. `NoteAccess` オブジェクトで `canView`, `canEdit`, `canManageMembers` を判定
4. UIで権限に応じた表示/操作を制御

---

## 今後の開発で注意すべき点

1. **スキーマ変更時はリモートDBにも適用が必要**
   - ローカルDBは自動適用されるが、リモートは手動マイグレーションが必要

2. **ノート作成時に作成者をメンバー登録**
   - `createNote()` で `ownerEmail` を渡すと自動的に `note_members` に登録される

3. **公開ノートのURLは認証不要**
   - `/note/:noteId` はPublic Routeとして設定されている
   - 権限チェックはページコンポーネント内で行う

4. **ページ本文の編集権限**
   - 現在の実装では、ページ本文の編集はページ所有者のみ
   - ノートの編集権限はページの追加/削除/ノート設定の変更に適用
