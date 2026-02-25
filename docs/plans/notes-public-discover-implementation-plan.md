# 実装計画書: ノート公開・Discover・権限分離

本ドキュメントは、以下の仕様を現行の実装に対してどのように実装するかをまとめた計画書です。

**対象仕様書**:

- [note-permissions-design.md](../specs/note-permissions-design.md) — 閲覧権限と編集権限の分離
- [notes-list-and-discover.md](../specs/notes-list-and-discover.md) — /notes タブ・Discover・公式・人気

**確定方針**:

- public / unlisted は**未ログインでも閲覧可**。投稿はログイン必須。
- `any_logged_in` で非メンバーが投稿したページの `owner_id` = **投稿者本人**。
- モデレーションは初期リリースでは**オーナー手動削除のみ**。
- Discover の検索は初期リリースでは**なし**（あとから追加）。

---

## 現行実装の概要

### データベース（Aurora PostgreSQL）

- `notes`: id, owner_id, title, visibility, created_at, updated_at, is_deleted
- `note_pages`: note_id, page_id, added_by_user_id, sort_order, ...
- `note_members`: note_id, member_email, role, invited_by_user_id, ...
- スキーマ: `db/aurora/001_schema.sql`

### バックエンド API（Lambda）

- ルーター: `terraform/modules/api/lambda/router.mjs` — `/api/health` のみ認証なし、それ以外はすべて JWT 必須
- ハンドラ: `terraform/modules/api/lambda/handlers/notes.mjs` — CRUD + ページ追加/削除 + メンバー管理
- 権限チェック: `canAccessNote`（owner or member のみ）、`canEditNote`（owner or editor member のみ）
- 新規ページ作成（`addNotePage` に `{ title }` を送る場合）: `owner_id = notes.owner_id`（固定）

### Hocuspocus（リアルタイム共同編集サーバー）

- `server/hocuspocus/src/index.ts` — `canEditNotePage` で owner or editor member を確認

### フロントエンド — 認証とローカルファースト

**未ログインでもアプリが使える仕組みが実装済み**:

- `/home` と `/page/:id` は **ProtectedRoute を解除済み**（未ログインでもアクセス可能）。
- 未ログインユーザーは `LOCAL_USER_ID = "local-user"` で IndexedDB（`zedi-storage-local-user`）を使用。
- ページの作成・編集・削除・検索はすべて**ローカルで完結**し、API を呼ばない。
- 同期（`syncWithApi`）は `isSignedIn` のときのみ実行。
- サインインページに「ログインせずに使う」ボタンがある（`/home` に遷移）。
- ヘッダーに未ログイン時「ログインしてクラウド同期を有効にする」のメッセージを表示。

### フロントエンド — ノート関連

- 型: `src/types/note.ts` — NoteVisibility, NoteMemberRole, NoteAccessRole, Note, NoteAccess 等
- Hooks: `src/hooks/useNoteQueries.ts` — useNote, useNotes, useNotePages 等。**isSignedIn のときのみ enabled**。
- ページ:
  - `src/pages/Notes.tsx` — ノート一覧（参加中のみ）。**ProtectedRoute（ログイン必須）**。
  - `src/pages/NoteView.tsx` — ノート詳細。Public Route だが **API が認証必須なので実質ログイン時のみ表示可能**。
  - `src/pages/NoteSettings.tsx` — 設定。visibility の変更。
  - `src/pages/NoteMembers.tsx` — メンバー管理。
  - `src/pages/NotePageView.tsx` — ノート内ページ表示。
- API クライアント: `src/lib/api/apiClient.ts` — すべて JWT 必須の `request()` 経由。`getToken()` が null なら `ApiError(401)` をスロー。
- ルート: `src/App.tsx`:
  - Public: `/home`, `/page/:id`, `/note/:noteId`, `/note/:noteId/*`
  - Protected: `/notes`, `/settings/*`, `/pricing`, `/donate`, `/onboarding`

---

## フェーズ分け

大きな機能を段階的に実装し、各フェーズ終了時に動作確認できる形にします。

### フェーズ 1: DB マイグレーション + 型定義

**目的**: データベースに新カラムを追加し、フロント・API で使う型を揃える。

#### 1-1. DB マイグレーション適用

| ファイル                                          | 内容                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `db/aurora/006_notes_edit_permission.sql`         | `notes.edit_permission` (TEXT, DEFAULT 'owner_only', CHECK制約) + インデックス                        |
| `db/aurora/007_notes_official_and_view_count.sql` | `notes.is_official` (BOOLEAN, DEFAULT FALSE) + `notes.view_count` (INTEGER, DEFAULT 0) + インデックス |

適用方法: `db/aurora/apply-data-api.mjs` または `db/aurora/apply.sh` で開発 Aurora に適用。

#### 1-2. フロント型定義の更新

**ファイル**: `src/types/note.ts`

```ts
// 新規追加
export type NoteEditPermission = "owner_only" | "members_editors" | "any_logged_in";

// Note インターフェースに追加
export interface Note {
  // ... 既存フィールド
  editPermission: NoteEditPermission; // 新規
  isOfficial: boolean; // 新規
  viewCount: number; // 新規
}

// NoteAccess に canAddPage を追加（canEdit と分離して「ページ追加のみ可」を表現）
export interface NoteAccess {
  role: NoteAccessRole;
  visibility: NoteVisibility;
  editPermission: NoteEditPermission; // 新規
  canView: boolean;
  canEdit: boolean;
  canAddPage: boolean; // 新規: ページ追加のみ可（any_logged_in 用）
  canManageMembers: boolean;
  canDeletePage: (addedByUserId: string) => boolean; // 新規: ページ削除判定
}
```

#### 1-3. API レスポンス型の更新

**ファイル**: `src/lib/api/types.ts`

- `NoteListItem` に `edit_permission`, `is_official`, `view_count` を追加。
- `GetNoteResponse` に同上を追加。

**確認ポイント**: マイグレーション適用後、既存ノートの `edit_permission` = `'owner_only'`, `is_official` = `false`, `view_count` = `0` であることを確認。

---

### フェーズ 2: バックエンド API の変更

**目的**: 権限ロジック・Discover 用エンドポイント・閲覧数カウント・公式フラグを API に反映。

#### 2-1. ルーターに「認証オプション」ルートを追加

**ファイル**: `terraform/modules/api/lambda/router.mjs`

現行: `/api/health` のみ認証なし。それ以外は `ctx.claims?.sub` がないと 401。

変更:

- 以下のルートは **認証をオプション** にする（JWT があれば使う、なければゲスト扱い）:
  - `GET /api/notes/discover` — 公開ノート一覧（ゲスト可）
  - `GET /api/notes/:id` — public/unlisted のノート閲覧（ゲスト可）

実装方針: ルーターで特定パスの GET リクエストは `claims` が null でも handler に渡す。handler 側で public/unlisted チェックを行う。

```js
// router.mjs — 認証チェックの前に、認証オプションルートを判定
const optionalAuthRoutes = [
  { method: "GET", pattern: /^notes\/discover$/ },
  { method: "GET", pattern: /^notes\/[^/]+$/ },
];
const isOptionalAuth = optionalAuthRoutes.some((r) => r.method === method && r.pattern.test(path));
if (!isOptionalAuth && !ctx.claims?.sub) {
  return res.unauthorized("Missing or invalid token");
}
```

**注意**: `GET /api/notes/discover` は `GET /api/notes/:id` よりも先にルーターでマッチさせる（"discover" がノート ID として解釈されないようにする）。

#### 2-2. notes ハンドラの変更

**ファイル**: `terraform/modules/api/lambda/handlers/notes.mjs`

##### (A) SQL クエリの追加・変更

```sql
-- 公開ノート取得（認証不要）: visibility が public/unlisted のとき、誰でも取得可
-- canAccessNote を拡張するか、別関数にする
const CAN_VIEW_NOTE_SQL = `
SELECT n.owner_id, n.visibility, n.edit_permission FROM notes n
LEFT JOIN note_members nm ON nm.note_id = n.id AND nm.member_email = :user_email AND nm.is_deleted = FALSE
WHERE n.id = :note_id AND n.is_deleted = FALSE
  AND (
    n.owner_id = :owner_id
    OR nm.note_id IS NOT NULL
    OR n.visibility IN ('public', 'unlisted')
  )
`;

-- Discover 用: 公開ノート一覧（公式 / 通常、更新順・人気順）
const LIST_PUBLIC_NOTES_SQL = `
SELECT n.id, n.owner_id, n.title, n.visibility, n.edit_permission,
       n.is_official, n.view_count, n.created_at, n.updated_at,
       u.display_name AS owner_display_name,
       (SELECT COUNT(*)::int FROM note_pages np WHERE np.note_id = n.id AND np.is_deleted = FALSE) AS page_count
FROM notes n
JOIN users u ON u.id = n.owner_id
WHERE n.visibility = 'public' AND n.is_deleted = FALSE
ORDER BY n.updated_at DESC
`;

-- 閲覧数インクリメント
const INCREMENT_VIEW_COUNT_SQL = `
UPDATE notes SET view_count = view_count + 1
WHERE id = :id AND is_deleted = FALSE
`;

-- ページ追加の権限チェック拡張（edit_permission 考慮）
const CAN_ADD_PAGE_SQL = `
SELECT 1 FROM notes n
LEFT JOIN note_members nm ON nm.note_id = n.id AND nm.member_email = :user_email AND nm.is_deleted = FALSE
WHERE n.id = :note_id AND n.is_deleted = FALSE
  AND (
    n.owner_id = :owner_id
    OR (nm.role = 'editor')
    OR (n.edit_permission = 'any_logged_in' AND n.visibility IN ('public', 'unlisted'))
  )
`;

-- ページ削除の権限チェック（オーナーは全て可、メンバーは自分が追加したもののみ）
const CAN_DELETE_NOTE_PAGE_SQL = `
SELECT np.added_by_user_id, n.owner_id
FROM note_pages np
JOIN notes n ON n.id = np.note_id
WHERE np.note_id = :note_id AND np.page_id = :page_id AND np.is_deleted = FALSE AND n.is_deleted = FALSE
`;
```

##### (B) getNote の変更

- `getCurrentUser(claims)` で user が null の場合（ゲスト）でも、visibility が public/unlisted なら閲覧を許可。
- ゲストの場合: `user_email` と `owner_id` をダミー値で `CAN_VIEW_NOTE_SQL` に渡し、`visibility IN ('public', 'unlisted')` の条件でヒットさせる。
- `current_user_role` はゲストの場合 `'guest'` を返す。
- 閲覧時に `view_count` をインクリメントする（public/unlisted のとき）。
- レスポンスに `edit_permission`, `is_official`, `view_count` を含める。

##### (C) 新規エンドポイント: GET /api/notes/discover

- 認証オプション（ゲスト可）。
- `LIST_PUBLIC_NOTES_SQL` で public ノートを取得。
- レスポンス構造:

```json
{
  "official": [ ... ],
  "notes": [ ... ]
}
```

- `official` = `is_official = true` のノート（更新順）。
- `notes` = `is_official = false` のノート（更新順）。
- クエリパラメータ `sort=popular` で人気順に切り替え可能（`ORDER BY view_count DESC`）。
- ページネーション: `limit` + `offset` (初期は 20 件ずつなど)。

##### (D) addNotePage の変更

- `canEditNote` → `canAddPage` に差し替え。`edit_permission = 'any_logged_in'` かつ public/unlisted のときは非メンバーでも追加を許可。
- **ページの owner_id のルール**:
  - 非メンバー（any_logged_in で投稿）: `owner_id = 投稿者本人`（`user.ownerId`）。
  - メンバー（editor）: `owner_id = notes.owner_id`（従来どおり）。
- 判定: user がメンバーかどうかを確認し、メンバーなら note owner、メンバーでなければ user 自身を owner にする。

##### (E) removeNotePage の変更

- オーナーは全ページ削除可。
- メンバー（editor）は `note_pages.added_by_user_id = 自分` のみ。
- 非メンバーは削除不可。

##### (F) createNote / updateNote の変更

- `createNote`: リクエストボディに `edit_permission` を受け付ける。デフォルト `'owner_only'`。
- `updateNote`: `edit_permission` の変更を受け付ける（オーナーのみ）。
- レスポンスに `edit_permission`, `is_official`, `view_count` を含める。

##### (G) listNotes の変更

- 既存の一覧クエリのレスポンスに `edit_permission`, `is_official`, `view_count` を追加。

#### 2-3. Hocuspocus の変更

**ファイル**: `server/hocuspocus/src/index.ts`

- `canEditNotePage` で `edit_permission = 'any_logged_in'` を考慮。
  - 現行: owner or editor member → true。
  - 追加: `n.edit_permission = 'any_logged_in' AND n.visibility IN ('public', 'unlisted')` のとき、ログイン済みユーザーなら true。

**確認ポイント**: 各 API エンドポイントを手動またはテストで確認。特にゲスト閲覧、非メンバーの投稿、削除権限の動作。

---

### フェーズ 3: フロント — API クライアント・権限ロジック・ノート作成/設定の2軸化

**目的**: API クライアントに認証オプションモードを追加し、既存画面にノートの閲覧権限＋編集権限の2軸を反映。

#### 3-1. API クライアントの更新

**ファイル**: `src/lib/api/apiClient.ts`

現行: `request()` は `getToken()` が null なら `ApiError(401)` をスロー。

変更:

- **認証オプションの `requestOptionalAuth()` を追加**。JWT がない場合でも `Authorization` ヘッダーなしで fetch を実行し、public/unlisted ノートのレスポンスを取得できるようにする。

```ts
async function requestOptionalAuth<T>(
  method: string,
  path: string,
  baseUrl: string,
  getToken: () => Promise<string | null>,
  options?: { body?: unknown; query?: Record<string, string> },
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  // ... fetch と同じ処理
}
```

- 新規メソッド:
  - `getPublicNotes(options?)` — `GET /api/notes/discover`（認証オプション）
  - `getNote` を認証オプションに変更（public/unlisted の場合ゲストでも取得可能に）

```ts
/** GET /api/notes/discover — public note list (auth optional). */
async getPublicNotes(options?: { sort?: string; limit?: number; offset?: number }) {
  return reqOptionalAuth<DiscoverResponse>("GET", "/api/notes/discover", {
    query: {
      sort: options?.sort ?? "updated",
      limit: String(options?.limit ?? 20),
      offset: String(options?.offset ?? 0),
    },
  });
},
```

#### 3-2. useNoteQueries の更新

**ファイル**: `src/hooks/useNoteQueries.ts`

- `useNote`: `enabled` の条件から `isSignedIn` を外す。未ログインでも public/unlisted のノート取得を試みる。API が 401 を返した場合は「ノートが見つからない」として処理。

```ts
// 変更前
enabled: isLoaded && isSignedIn && !!noteId,

// 変更後
enabled: isLoaded && !!noteId,
```

- `buildAccessFromApi` を2軸対応に更新:

```ts
function buildAccessFromApi(note: Note, currentUserRole: string, userId?: string): NoteAccess {
  const isOwner = currentUserRole === "owner";
  const isEditor = currentUserRole === "editor";
  const isViewer = currentUserRole === "viewer";
  const isGuest = currentUserRole === "guest";
  const canView = isOwner || isEditor || isViewer || isGuest;
  const canEdit = isOwner || isEditor;
  const canAddPage = canEdit || (note.editPermission === "any_logged_in" && canView && !!userId);
  const canManageMembers = isOwner;
  const canDeletePage = (addedByUserId: string) => {
    if (isOwner) return true;
    if (isEditor && userId && addedByUserId === userId) return true;
    return false;
  };
  return {
    role: currentUserRole as NoteAccessRole,
    visibility: note.visibility,
    editPermission: note.editPermission,
    canView,
    canEdit,
    canAddPage,
    canManageMembers,
    canDeletePage,
  };
}
```

- 新規フック:
  - `usePublicNotes(sort, limit, offset)` — Discover 用の公開ノート一覧。`isSignedIn` に関わらず常に有効。

#### 3-3. ノート作成ダイアログの更新

**ファイル**: `src/pages/Notes.tsx`

現行: title + visibility の2項目。

変更:

- **「誰がこのノートを見られますか？」** — visibility の選択（private / restricted / unlisted / public）。
- **「誰がこのノートに投稿できますか？」** — edit_permission の選択（owner_only / members_editors / any_logged_in）。
- 組み合わせ制約:
  - visibility = private → edit_permission = owner_only のみ。
  - visibility = restricted → owner_only / members_editors のみ。
  - visibility = unlisted / public → すべて選択可能。
  - UI でグレーアウトまたは非表示。
- `useCreateNote` の mutationFn に `editPermission` を追加。

#### 3-4. ノート設定ページの更新

**ファイル**: `src/pages/NoteSettings.tsx`

現行: title + visibility の変更。

変更:

- edit_permission の変更 UI を追加（visibility と同様のセレクト）。
- 組み合わせ制約を NoteSettings でも効かせる。
- `useUpdateNote` の mutationFn に `editPermission` を追加。

#### 3-5. NoteView（ノート詳細）の更新

**ファイル**: `src/pages/NoteView.tsx`

変更:

- 「ページを追加」ボタンの表示条件: `canEdit || canAddPage`。
  - 未ログイン時は非表示（`canAddPage` は `!!userId` を条件に含むため false になる）。
- 「ページを削除」ボタンの表示条件: `canDeletePage(page.addedByUserId)`。
- **「このノートにページを追加」UI の追加**: 既存ページを選ぶ UI に加え、「タイトルで新規ページを追加」ができるフォームを追加（API `POST /api/notes/:id/pages` の `{ title }` を使用）。非メンバーの `any_logged_in` ユーザーは「タイトルで新規ページを追加」のみを使う形になる。
- 公式バッジの表示（`note.isOfficial` のとき）。
- 未ログイン時は「ログインして投稿」の案内を表示。

**確認ポイント**: ノート作成・設定で2軸が正しく保存・表示されること。権限に応じたボタンの表示/非表示。未ログインで public/unlisted ノートが閲覧できること。

---

### フェーズ 4: フロント — /notes タブ + Discover ページ

**目的**: /notes にタブを追加し、公開ノート一覧（Discover）を実装。

#### 4-1. ルート追加

**ファイル**: `src/App.tsx`

```tsx
{
  /* /notes/discover は Public Route（未ログインでも閲覧可） */
}
<Route path="/notes/discover" element={<NotesDiscover />} />;

{
  /* /notes は従来どおり ProtectedRoute */
}
<Route
  path="/notes"
  element={
    <ProtectedRoute>
      <Notes />
    </ProtectedRoute>
  }
/>;
```

注意: `/notes/discover` は `/notes` よりも前に定義し、`ProtectedRoute` をかけない（未ログインでも閲覧可能）。

#### 4-2. 共通タブレイアウトの抽出

**新規ファイル**: `src/components/note/NotesLayout.tsx`

- Header + Container + タブヘッダー を共通化。
- `Notes.tsx` と `NotesDiscover.tsx` の両方で使用。
- タブ:
  - **「参加中のノート」** → `/notes`（アクティブ: パスが `/notes` のとき）
  - **「公開ノート」** → `/notes/discover`（アクティブ: パスが `/notes/discover` のとき）
- タブの実装: `react-router-dom` の `Link` + パスに応じた active 状態。
- **未ログインの場合**: 「参加中のノート」タブをクリックすると `/sign-in` に遷移（または「ログインが必要です」と案内）。

#### 4-3. Notes ページにタブを追加

**ファイル**: `src/pages/Notes.tsx`

- `NotesLayout` を使用してタブ付きレイアウトに変更。
- 参加中のノート部分は現行のままキープ。
- ノート作成ボタン・ダイアログはこのタブで表示。

#### 4-4. NotesDiscover ページの新規作成

**新規ファイル**: `src/pages/NotesDiscover.tsx`

- `NotesLayout` を使用してタブ付きレイアウト。
- `usePublicNotes('updated')` でデータ取得。
- **公式ノートセクション**: `official` 配列を `NoteCard` で表示。公式バッジ付き。
- **公開ノートセクション**: `notes` 配列を表示。
  - 並び替え: 「更新順」「人気順」の切り替え（ミニタブまたはセグメントコントロール）。
  - 「人気順」選択時は `usePublicNotes('popular')` で再取得。
- **未ログインでもアクセス可能**。投稿系のアクションは非表示。

#### 4-5. NoteCard に公式バッジを追加

**ファイル**: `src/components/note/NoteCard.tsx`

- `note.isOfficial` が true のとき、公式バッジを表示（例: `<Badge variant="default">公式</Badge>`）。

**確認ポイント**:

- タブ切り替えが動作すること。
- 公開ノート・公式ノートが正しいセクションに表示されること。
- **未ログインで `/notes/discover` にアクセスでき、公開ノートが表示されること**。
- 未ログインで「参加中のノート」タブに行くとログインが要求されること。

---

### フェーズ 5: 閲覧数カウント

**目的**: ノート閲覧時に view_count をインクリメントし、人気順表示に利用。

#### 5-1. API: getNote で view_count をインクリメント

**ファイル**: `terraform/modules/api/lambda/handlers/notes.mjs`

- `getNote` のレスポンス返却前に `INCREMENT_VIEW_COUNT_SQL` を実行。
- 対象: visibility が public/unlisted のノートのみ（private/restricted はカウント不要）。
- 同一ユーザーの連続アクセスでカウントが膨れすぎないよう、将来的にはレートリミットやユニークカウントを検討。初期は単純インクリメントで十分。

#### 5-2. Discover の人気順ソート

- `GET /api/notes/discover?sort=popular` のとき、`ORDER BY n.view_count DESC, n.updated_at DESC`。
- フロントの並び替え切り替えで `sort` パラメータを変更。

**確認ポイント**: ノート閲覧ごとに view_count が増えること。人気順で閲覧数の多いノートが上に来ること。

---

### フェーズ 6: i18n・バッジ・仕上げ

**目的**: 翻訳キーの追加、公式バッジ、UI の仕上げ。

#### 6-1. 翻訳キーの追加

**ファイル**: `src/i18n/locales/en/notes.json`（＋日本語版 `ja/notes.json`）

追加するキーの例:

```json
{
  "editPermission": "Who can post to this note?",
  "editPermissionOwnerOnly": "Only you (owner)",
  "editPermissionMembersEditors": "You and editor members",
  "editPermissionAnyLoggedIn": "Any logged-in user",
  "tabMyNotes": "My Notes",
  "tabDiscover": "Discover",
  "officialBadge": "Official",
  "sortUpdated": "Recently Updated",
  "sortPopular": "Popular",
  "sectionOfficial": "Official Notes",
  "sectionPublicNotes": "Public Notes",
  "loginToPost": "Sign in to post",
  "loginToViewMyNotes": "Sign in to view your notes",
  "addNewPageToNote": "Add new page",
  "newPageTitle": "Page title",
  "viewCount": "{{count}} views"
}
```

#### 6-2. NoteVisibilityBadge の i18n 化

**ファイル**: `src/components/note/NoteVisibilityBadge.tsx`

現行: ハードコードされた日本語ラベル。  
変更: `useTranslation()` で翻訳キーを使う。

#### 6-3. 編集権限バッジの追加

- NoteCard 等で `editPermission` に応じたラベル/アイコンを表示（例: 「誰でも投稿可」のアイコン）。
- 必要に応じて `NoteEditPermissionBadge` コンポーネントを作成。

---

## 実装順序のまとめ

```
フェーズ 1: DB マイグレーション + 型定義
    ↓
フェーズ 2: バックエンド API の変更
    ↓
フェーズ 3: フロント — API クライアント・権限ロジック・ノート作成/設定の2軸化
    ↓
フェーズ 4: フロント — /notes タブ + Discover ページ（/notes/discover は Public）
    ↓
フェーズ 5: 閲覧数カウント
    ↓
フェーズ 6: i18n・バッジ・仕上げ
```

各フェーズは前のフェーズが完了してから着手する。フェーズ内のタスクは並行可能なものもある（例: フェーズ 2 の API 変更と SQL 追加は同時に進められる）。

---

## 変更対象ファイル一覧

### データベース

| ファイル                                          | 変更内容             |
| ------------------------------------------------- | -------------------- |
| `db/aurora/006_notes_edit_permission.sql`         | 作成済み。適用する。 |
| `db/aurora/007_notes_official_and_view_count.sql` | 作成済み。適用する。 |

### バックエンド

| ファイル                                          | 変更内容                                                                                                                                |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `terraform/modules/api/lambda/router.mjs`         | 認証オプションルート追加（`GET /api/notes/discover`, `GET /api/notes/:id`）                                                             |
| `terraform/modules/api/lambda/handlers/notes.mjs` | 権限チェック変更、Discover エンドポイント追加、閲覧数、レスポンスフィールド追加、ページ追加の owner_id ルール、ページ削除の権限チェック |
| `server/hocuspocus/src/index.ts`                  | `canEditNotePage` に any_logged_in 対応                                                                                                 |

### フロント — 型・API

| ファイル                   | 変更内容                                                                          |
| -------------------------- | --------------------------------------------------------------------------------- |
| `src/types/note.ts`        | NoteEditPermission 追加、Note / NoteAccess 拡張                                   |
| `src/lib/api/types.ts`     | API レスポンス型に edit_permission 等追加                                         |
| `src/lib/api/apiClient.ts` | `requestOptionalAuth()` 追加、`getPublicNotes` 追加、`getNote` を認証オプション化 |

### フロント — Hooks

| ファイル                      | 変更内容                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/hooks/useNoteQueries.ts` | `useNote` の enabled 変更（isSignedIn 不要に）、`buildAccessFromApi` の2軸化、`usePublicNotes` 追加 |

### フロント — ページ

| ファイル                      | 変更内容                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `src/App.tsx`                 | `/notes/discover` ルート追加（**Public Route**、`/notes` よりも前に定義）                  |
| `src/pages/Notes.tsx`         | `NotesLayout` 使用、ノート作成ダイアログに editPermission 追加                             |
| `src/pages/NotesDiscover.tsx` | **新規作成** — 公開ノート一覧（公式セクション + 通常セクション）。**未ログインでも閲覧可** |
| `src/pages/NoteView.tsx`      | canAddPage / canDeletePage 対応、新規ページ追加 UI、公式バッジ、未ログインへの案内         |
| `src/pages/NoteSettings.tsx`  | editPermission の変更 UI 追加                                                              |
| `src/pages/NotePageView.tsx`  | canAddPage 対応（非メンバーの編集権限）                                                    |

### フロント — コンポーネント

| ファイル                                      | 変更内容                                                        |
| --------------------------------------------- | --------------------------------------------------------------- |
| `src/components/note/NotesLayout.tsx`         | **新規作成** — タブ付き共通レイアウト（未ログインでも表示可能） |
| `src/components/note/NoteCard.tsx`            | 公式バッジ追加                                                  |
| `src/components/note/NoteVisibilityBadge.tsx` | i18n 化                                                         |

### フロント — i18n

| ファイル                         | 変更内容         |
| -------------------------------- | ---------------- |
| `src/i18n/locales/en/notes.json` | 新規翻訳キー追加 |
| `src/i18n/locales/ja/notes.json` | 同上（日本語）   |
