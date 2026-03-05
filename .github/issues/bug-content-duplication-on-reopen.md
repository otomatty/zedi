# ページ再表示時にコンテンツが複製される

**Labels:** bug  
**Status:** 調査済み・要修正

---

## 概要

ホームに戻って保存し、再度そのページを開くと、これまで書いた内容の下に同じ内容が複製されて表示される。

## 再現手順

1. アプリでページを開き、エディタに内容を入力する
2. ホームに戻る（保存は自動または離脱時に実行される）
3. 同じページを再度開く
4. **実際:** 入力した内容が2回分表示される（元の内容の下に同じ内容が重複）
5. **期待:** 保存した内容が1回分だけ表示される

## 環境

- ログイン済み・未ログインのいずれでも発生しうる（Y.Doc + IndexedDB / API の経路による）

---

## 調査結果（関連ファイルと原因候補）

### 関連ファイル

| 役割                             | ファイル                                                    |
| -------------------------------- | ----------------------------------------------------------- |
| Y.Doc のロード・保存・API マージ | `src/lib/collaboration/CollaborationManager.ts`             |
| ページコンテンツ API（GET/PUT）  | `server/api/src/routes/pages.ts`                            |
| エディタ状態の初期化             | `src/components/editor/PageEditor/usePageEditorState.ts`    |
| 離脱時の保存（React）            | `src/components/editor/PageEditor/useEditorAutoSave.ts`     |
| エディタへの content 反映        | `src/components/editor/TiptapEditor/useContentSanitizer.ts` |
| エディタの initialContent 適用   | `src/components/editor/TiptapEditor/useEditorLifecycle.ts`  |

### 保存まわりの流れ

- **ローカル（Y.Doc）:** `CollaborationManager` が IndexedDB（y-indexeddb）と REST `PUT /api/pages/:id/content` の両方を使う。
- **初回ロード:**
  1. 空の `Y.Doc` を作成
  2. `IndexeddbPersistence` が IndexedDB から既存状態を同じ `ydoc` に適用
  3. `idbProvider.on("synced")` で `fetchAndMergeFromApi()` を実行
  4. **API から取得した Y.Doc 状態を `Y.applyUpdate(this.ydoc, binary)` で同じ `ydoc` にマージ**

### 原因候補（保存・ロードの二重適用）

**仮説:** 同じ論理内容が「IndexedDB 由来」と「API 由来」の 2 つの Y.Doc 更新として別々に適用されているため、Y.js のマージ結果として同じテキストが 2 回現れている。

- `fetchAndMergeFromApi()`（`CollaborationManager.ts` 73–116 行付近）では、**IndexedDB の synced 後に** API の `ydoc_state` を取得し、`Y.applyUpdate(this.ydoc, binary)` でマージしている。
- このとき、IndexedDB にすでに「保存済みのページ内容」が入っており、API にも同じページの内容が入っている。
- 両方とも「同じ見た目」でも、異なるクライアント/操作として記録されていると、CRDT のマージで同一内容が重複して表示される可能性がある。

そのため、「保存処理に問題がある」というよりは、**「再オープン時のロードで、IndexedDB と API の両方の状態を無条件にマージしていること」**が複製の原因である可能性が高い。

---

## 修正の方向性（提案）

1. **ロード時の単一ソースにする**
   - ログイン済みなら **API を正とする**: IndexedDB の synced 後に API を取得し、**マージせずに** API の状態で `ydoc` を置き換える（例: 新規 `Y.Doc` に API の update だけを適用し、それを採用する）。
   - または、API 取得成功時は IndexedDB の適用結果を捨て、API の状態のみで初期化する。

2. **API をマージしない**
   - ローカル専用ページでは「API にコンテンツがない or 404」のときだけ API を使い、すでに IndexedDB に状態がある場合は `fetchAndMergeFromApi()` で `Y.applyUpdate` しない、など条件を分ける。

3. **Y.Doc の「置換」APIを検討**
   - 初回ロード時に「API の状態で上書き」するパスを用意し、`applyUpdate` によるマージは行わない。

上記のいずれかを採用し、**「同じ内容が IndexedDB と API の両方から 1 回ずつ効いて二重表示になる」** 経路を断つ必要がある。

---

## 追加情報

- ノート内ページ（`NotePageView`）では `useNotePage` → `apiPageToPage` により `content` が常に `""` になっている（`src/hooks/useNoteQueries.ts`）。表示はコラボの Y.Doc に依存しているため、同じ「IndexedDB + API マージ」の影響を受けうる。
- メインの PageEditor では `usePage` → `getPage` の `Page` も `content: ""`（`StorageAdapterPageRepository` の `metadataToPage`）で、実体は Y.Doc のみ。よって複製の原因は Y.Doc のロード/マージ側とみなしてよい。
