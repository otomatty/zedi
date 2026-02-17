# ノート権限設計：閲覧権限と編集権限の分離

ノートの「誰が見られるか」と「誰が編集（投稿）できるか」を**2軸で独立して設定**する設計です。ユーザーにとって分かりやすく、運用の組み合わせも広がります。

---

## 1. 概要

| 軸 | 役割 | 設定項目（例） |
|----|------|----------------|
| **閲覧権限** | 誰がノートを**見られるか** | 「誰がこのノートを見られますか？」 |
| **編集権限** | 誰がノートに**ページを追加・編集できるか** | 「誰がこのノートに投稿できますか？」 |

- **メンバー（招待された人）**は、上記設定とは別に、**メンバーとして付与した役割（viewer / editor）**でアクセスします。  
  メンバーには常に「閲覧」が許可され、editor なら「編集」も許可されます。
- 以下で述べる閲覧・編集権限は、**オーナーおよびメンバー以外**のユーザーに対するルールです。

---

## 2. 閲覧権限（View Permission）

「誰がこのノートを見られますか？」に対応する設定。既存の **visibility** を閲覧専用として用います。

| 値 | 表示ラベル（例） | 意味 | 対象 |
|----|-------------------|------|------|
| `private` | 自分だけ | オーナーのみ閲覧可能。メンバーがいればメンバーも閲覧可。 | ノート一覧（/notes）には「自分のノート」としてのみ表示。公開一覧には出さない。 |
| `restricted` | 招待したメンバーだけ | オーナー＋招待されたメンバーのみ閲覧可能。リンクを知っていてもメンバーでなければ閲覧不可。 | 公開一覧には出さない。 |
| `unlisted` | リンクを知っている人 | URL を知っている人なら誰でも閲覧可能（未ログイン可とするかは実装方針による）。一覧には出さない。 | 公開ノート一覧（/notes の「公開」など）には**出さない**。 |
| `public` | 誰でも | 誰でも閲覧可能。公開ノート一覧に表示する。 | 一覧に表示し、検索・ソートの対象とする。 |

### 閲覧可否の判定（非メンバー）

| visibility | 未ログイン | ログイン済み（オーナー/メンバー以外） |
|------------|------------|----------------------------------------|
| private | ❌ | ❌ |
| restricted | ❌ | ❌ |
| unlisted | ✅ 閲覧のみ | ✅ |
| public | ✅ 閲覧のみ | ✅ |

※ オーナーおよびメンバーは、常に閲覧可能。  
※ **確定方針**: public / unlisted は**未ログインでも閲覧を許可**する。投稿はログイン必須。

---

## 3. 編集権限（Edit Permission）

「誰がこのノートに投稿（ページの追加・編集）できますか？」に対応する設定。**新規カラム `edit_permission`** を notes に持ちます。

| 値 | 表示ラベル（例） | 意味 |
|----|-------------------|------|
| `owner_only` | 自分（オーナー）だけ | オーナーのみがページの追加・編集・削除が可能。メンバーは「閲覧のみ」の役割のみ有効（editor メンバーを付けても、ノート側が owner_only なら編集不可、とするか、メンバーは例外で編集可とするかはポリシー次第。推奨: **メンバーの editor は編集可のまま**にして、edit_permission は「メンバー以外」の制御に使う）。 |
| `members_editors` | オーナーと編集メンバー | オーナーおよび、メンバーかつ role=editor のユーザーがページの追加・編集・削除が可能。 |
| `any_logged_in` | ログインしている人なら誰でも | ログイン済みユーザーなら、メンバーでなくてもページの追加が可能。既存ページの編集・削除はオーナー（および必要に応じてメンバー editor）のみ、とすることを推奨（スパム・荒らし対策）。 |

### 編集可否の判定（簡易ルール）

1. **オーナー**: 常に編集可（ページ追加・削除・ノート設定・メンバー管理）。
2. **メンバー（role = editor）**: 常に編集可（ページ追加・削除。ノート設定はオーナーのみの想定）。
3. **メンバー（role = viewer）**: 編集不可。
4. **上記以外のログインユーザー**:
   - `edit_permission = any_logged_in` かつ、閲覧権限でそのノートを見られる場合 → **ページの追加のみ可**（推奨）。既存ページの編集・削除は不可。
   - それ以外 → 編集不可。

※ 「ログインしていれば誰でも」で追加を許可する場合、既存ページの編集はオーナー（とメンバー editor）に限定すると安全です。

---

## 4. 閲覧権限と編集権限の組み合わせ

論理的に無効な組み合わせは禁止または UI で選べなくします。

| 閲覧権限 | 利用可能な編集権限 | 備考 |
|----------|--------------------|------|
| private | owner_only のみ | 「自分だけ見る」なら編集も自分だけ。 |
| restricted | owner_only / members_editors | 「招待した人だけ見る」なら、「誰でも編集」は選べない。 |
| unlisted | すべて可 | リンク知っていれば閲覧可なので、編集は owner_only / members_editors / any_logged_in のいずれも選択可能。 |
| public | すべて可 | 誰でも見られるので、編集も三択から選択可能。 |

---

## 5. データベース

### 5.1 既存カラム（変更なし）

- **notes.visibility**  
  - 閲覧権限として使用。`'private' | 'public' | 'unlisted' | 'restricted'`。

### 5.2 新規カラム

- **notes.edit_permission**  
  - 編集権限。`'owner_only' | 'members_editors' | 'any_logged_in'`。  
  - デフォルト: `'owner_only'`（既存ノートも互換のため同じ扱い）。  
  - NOT NULL。

### 5.3 マイグレーション（Aurora PostgreSQL）

マイグレーションファイル: `db/aurora/006_notes_edit_permission.sql`

```sql
ALTER TABLE notes
  ADD COLUMN edit_permission TEXT NOT NULL DEFAULT 'owner_only'
  CHECK (edit_permission IN ('owner_only', 'members_editors', 'any_logged_in'));

CREATE INDEX idx_notes_edit_permission ON notes(edit_permission);
```

---

## 6. 型定義（フロント・API）

### 6.1 閲覧権限（既存）

```ts
export type NoteVisibility = "private" | "public" | "unlisted" | "restricted";
```

### 6.2 編集権限（新規）

```ts
export type NoteEditPermission = "owner_only" | "members_editors" | "any_logged_in";
```

### 6.3 Note 型の拡張

```ts
export interface Note {
  id: string;
  ownerUserId: string;
  title: string;
  visibility: NoteVisibility;        // 閲覧権限
  editPermission: NoteEditPermission; // 編集権限（新規）
  createdAt: number;
  updatedAt: number;
  isDeleted: boolean;
}
```

---

## 7. アクセス判定の疑似コード

### 7.1 閲覧可否（canView）

```
if 自分がオーナー or メンバー then true
else
  if visibility === 'private' or 'restricted' then false
  if visibility === 'unlisted' or 'public' then true  // 未ログインでも閲覧可
```

### 7.2 編集可否（canEdit）— ページの追加

```
if 自分がオーナー then true
if 自分がメンバー and role === 'editor' then true
if 自分がメンバー and role === 'viewer' then false
if edit_permission === 'owner_only' then false
if edit_permission === 'members_editors' then false
if edit_permission === 'any_logged_in' and canView then true  // ページ追加のみ可とする場合
else false
```

### 7.3 既存ページの編集・削除

- **確定方針**: **any_logged_in** のとき、非メンバーの「ログイン誰でも」ができるのは**ページの追加のみ**。  
  既存ページの編集・削除は **オーナー ＋ メンバー(editor)** のみ。

### 7.4 any_logged_in で投稿されたページの所有者（owner_id）

- **確定方針**: `edit_permission = any_logged_in` のときに非メンバーが新規ページを追加した場合、`pages.owner_id = 投稿者本人` とする。
  - 投稿者が「自分のページ」一覧で自分の投稿を確認・編集できる。
  - ノートオーナーは note_pages の削除（ノートからページを外す）で不適切な投稿を排除可能。
- メンバー（editor）がノート内で新規ページを作成した場合は、従来どおり `pages.owner_id = ノートオーナー`（方針B: 機密性の確保）。

| 投稿者 | 新規ページの owner_id | 理由 |
|--------|------------------------|------|
| メンバー（editor） | ノートオーナー | 招待制＝チーム/組織向け。コンテンツはノートオーナーの管理下。 |
| 非メンバー（any_logged_in） | 投稿者本人 | コミュニティ型。投稿者が自分のコンテンツを所有。 |

---

## 8. UI での聞き方（ノート作成・設定）

- **「誰がこのノートを見られますか？」**  
  → 単一選択: 自分だけ / 招待したメンバーだけ / リンクを知っている人 / 誰でも  
  → 対応する値: private / restricted / unlisted / public

- **「誰がこのノートに投稿できますか？」**  
  → 単一選択: 自分だけ / オーナーと編集メンバー / ログインしている人なら誰でも  
  → 対応する値: owner_only / members_editors / any_logged_in  
  → 閲覧が private のときは「自分だけ」のみ選択可能など、組み合わせ制約を効かせる。

---

## 9. メンバーロールとの関係

| 対象 | 閲覧 | 編集（ページ追加・削除） |
|------|------|--------------------------|
| オーナー | ✅ | ✅（＋ノート設定・メンバー管理） |
| メンバー viewer | ✅ | ❌ |
| メンバー editor | ✅ | ✅ |
| 非メンバー（ログイン済み） | visibility に従う | edit_permission に従う（any_logged_in のときは追加のみ推奨） |
| 未ログイン | public/unlisted で閲覧可 | ❌ |

この設計により、**閲覧権限**と**編集権限**を分けたまま、既存のメンバー（viewer/editor）とも矛盾なく組み合わせられます。

---

## 10. ノート内ページの削除権限

ノートから「ページを外す」（ノート内ページの削除）について、追加・編集権限とは別に次のルールとする。

| 対象 | 削除できるページ |
|------|------------------|
| **オーナー** | ノート内の**すべてのページ**を削除可能。 |
| **メンバー（viewer）** | 削除不可（閲覧のみのため）。 |
| **メンバー（editor）** | **自分が追加したページのみ**削除可能。`note_pages.added_by_user_id` が自分であるページに限定する。 |
| **非メンバー**（edit_permission = any_logged_in で投稿した場合） | ページの削除は不可（追加のみ可とする想定）。 |

### 判定

- **オーナー**: 常に当該ノートの任意の note_pages を削除可能。
- **メンバー editor**: `note_pages.added_by_user_id = 自分の user_id` のときのみ、そのページをノートから削除可能。
- **メンバー viewer / 非メンバー**: ノートからページを削除する操作は不可。

※ ページそのものの削除（pages の論理削除）は別ポリシーとする。ここでは「ノートとページの紐付け（note_pages）の削除」＝ノートからページを外す権限とする。
