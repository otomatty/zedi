# 作業ログ: ノート公開・Discover・権限分離 実装

**日付**: 2026-02-18  
**参照**: [実装計画書](../../plans/notes-public-discover-implementation-plan.md), [権限設計](../../specs/note-permissions-design.md), [Discover 仕様](../../specs/notes-list-and-discover.md)

---

## 概要

ノートの「閲覧権限」と「編集権限」の2軸化、公開ノート一覧（Discover）、未ログインでの public/unlisted 閲覧、any_logged_in での投稿、閲覧数・公式ノート対応を実装した。DB マイグレーションも開発 Aurora に適用済み。

---

## 1. DB マイグレーション実施

### 実行コマンド

```bash
cd db/aurora
SCHEMA_FILE=006_notes_edit_permission.sql node apply-data-api.mjs
SCHEMA_FILE=007_notes_official_and_view_count.sql node apply-data-api.mjs
```

### 006_notes_edit_permission.sql

- `notes.edit_permission` カラム追加（TEXT, NOT NULL, DEFAULT 'owner_only', CHECK: owner_only / members_editors / any_logged_in）
- `idx_notes_edit_permission` インデックス作成
- **結果**: 2 文 OK

### 007_notes_official_and_view_count.sql

- `notes.is_official` カラム追加（BOOLEAN, NOT NULL, DEFAULT FALSE）
- `notes.view_count` カラム追加（INTEGER, NOT NULL, DEFAULT 0）
- `idx_notes_is_official` インデックス作成
- **結果**: 3 文 OK

---

## 2. フェーズ別 変更ファイル一覧

### Phase 1: 型定義

| ファイル                      | 変更内容                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types/note.ts`           | `NoteEditPermission` 追加。`Note` に `editPermission`, `isOfficial`, `viewCount`。`NoteAccess` に `editPermission`, `canAddPage`, `canDeletePage(addedByUserId)`。                    |
| `src/lib/api/types.ts`        | `NoteListItem` / `GetNoteResponse` に `edit_permission`, `is_official`, `view_count`。`GetNoteResponse.current_user_role` に `"guest"`。`DiscoverResponse`, `DiscoverNoteItem` 追加。 |
| `src/lib/noteRepository.ts`   | `rowToNote` に新カラム反映。`buildAccess` に `canAddPage`, `canDeletePage`, `editPermission`。                                                                                        |
| `src/hooks/useNoteQueries.ts` | `apiNoteToNote` / `apiNoteToNoteSummary` に新フィールド。`buildAccessFromApi` を guest・canAddPage・canDeletePage 対応に。                                                            |

### Phase 2: バックエンド API

| ファイル                                          | 変更内容                                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `terraform/modules/api/lambda/router.mjs`         | 認証オプションルート（GET notes/discover, GET notes/:id）。`getDiscover` を discover 用に先マッチ。                                                                                                                                                                       |
| `terraform/modules/api/lambda/handlers/notes.mjs` | ゲスト閲覧（public/unlisted）、view_count インクリメント、`getDiscover`、`canAddPage`・ページ追加時の owner_id 分岐、`removeNotePage` の削除権限（オーナー全削除可・editor は自分追加分のみ）、createNote/updateNote の edit_permission、listNotes の返却フィールド追加。 |
| `server/hocuspocus/src/index.ts`                  | `canEditNotePage` に `edit_permission = 'any_logged_in'` かつ public/unlisted のときログイン済みを編集可に。                                                                                                                                                              |

### Phase 3: フロント API クライアント・権限・2軸 UI

| ファイル                      | 変更内容                                                                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/api/apiClient.ts`    | `requestOptionalAuth`、`getPublicNotes` 追加。`getNote` を認証オプションに。createNote/updateNote の body に `edit_permission`。                                                                                                                        |
| `src/hooks/useNoteQueries.ts` | `useNote` の enabled から isSignedIn 削除。`usePublicNotes`、`mapDiscoverItemToNoteSummary` 追加。`useCreateNote`/`useUpdateNote` に editPermission。`useAddPageToNote` に title。`useNotePages` の戻りを `NotePageSummary[]`（addedByUserId 付き）に。 |
| `src/pages/Notes.tsx`         | 作成ダイアログに edit_permission と visibility の組み合わせ制約。                                                                                                                                                                                       |
| `src/pages/NoteSettings.tsx`  | edit_permission の変更 UI と組み合わせ制約。                                                                                                                                                                                                            |
| `src/pages/NoteView.tsx`      | ページ追加を canEdit \|\| canAddPage で表示。削除を canDeletePage(page.addedByUserId) で表示。新規ページ追加（title）フォーム、公式バッジ、未ログイン時「ログインして投稿」。                                                                           |

### Phase 4: /notes タブ + Discover

| ファイル                              | 変更内容                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/App.tsx`                         | `/notes/discover` を Public ルートで追加（/notes より前）。                                              |
| `src/components/note/NotesLayout.tsx` | **新規**。タブ「参加中のノート」「公開ノート」。未ログインで「参加中のノート」クリック時は /sign-in へ。 |
| `src/pages/Notes.tsx`                 | `NotesLayout` でラップ。参加中ノートのみ表示。                                                           |
| `src/pages/NotesDiscover.tsx`         | **新規**。公式セクション + 公開ノート（更新順/人気順）。                                                 |
| `src/components/note/NoteCard.tsx`    | `note.isOfficial` のとき公式バッジ表示。                                                                 |

### Phase 6: i18n・バッジ

| ファイル                                      | 変更内容                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/i18n/locales/en/notes.json`              | editPermission, tabMyNotes, tabDiscover, officialBadge, sortUpdated, sortPopular, sectionOfficial, sectionPublicNotes, loginToPost, loginToViewMyNotes, addNewPageToNote, newPageTitle, viewCount を追加。 |
| `src/i18n/locales/ja/notes.json`              | 上記キーの日本語を追加。                                                                                                                                                                                   |
| `src/components/note/NoteVisibilityBadge.tsx` | ラベルを useTranslation のキーに変更。                                                                                                                                                                     |

---

## 3. 動作確認のポイント

- 未ログインで `/notes/discover` にアクセスできること。
- 未ログインで public/unlisted のノート詳細（`/note/:id`）が閲覧できること。
- ノート作成・設定で「誰が投稿できるか」が保存・表示されること。
- any_logged_in のノートで、非メンバーのログインユーザーが「タイトルで新規ページを追加」できること。
- オーナーは全ページをノートから削除可能、editor は自分が追加したページのみ削除可能であること。
- Discover で公式セクション・公開ノート・更新順/人気順の切り替えができること。
- `npm run build` が成功すること（確認済み）。

---

## 4. 今後の注意

- 本番 Aurora へマイグレーションを適用する場合は、006 → 007 の順で同様に実行する。
- 公式ノート（is_official = true）の設定は、現状は管理側の DB 操作または将来の管理 API で行う想定。一般ユーザーは変更不可。
