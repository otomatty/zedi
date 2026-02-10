# /home からノート関連UI削除 — 仕様調査・確認メモ

## 1. 現在の実装状況

### 1.1 /home の構成 (`src/pages/Home.tsx`)

| 順序 | コンポーネント | 役割 |
|------|----------------|------|
| 1 | `Header` | ロゴ、月ナビ、同期インジケータ、ショートカット、認証メニュー |
| 2 | **`NotesSection`** | **「公開ノート」セクション（一覧 + 新規ノート作成）** ← 削除対象 |
| 3 | `PageGrid` | 自分自身のページ一覧（カードグリッド） |
| 4 | `FloatingActionButton` | 新規ページ作成（空白/URL/画像など） |
| 5 | `WelcomeModal` | 初回ウェルカムモーダル |

### 1.2 NotesSection の役割 (`src/components/note/NotesSection.tsx`)

- **表示条件**: ログイン時のみ（`useNoteApi().isSignedIn` が false なら `return null`）
- **表示内容**:
  - 見出し: 「公開ノート」
  - ボタン: 「新規ノート」→ ダイアログでタイトル・公開範囲を入力してノート作成 → 作成後 `/note/:newNoteId` に遷移
  - 一覧: `useNotes()` で取得したノートを更新日時降順で表示（`NoteCard`）
- **データ**: `useNoteQueries` の `useNotes()` → API 経由で「自分がオーナーまたはメンバーのノート」一覧を取得

### 1.3 PageGrid（残す部分）

- **データ**: `usePagesSummary()` → `useRepository().getRepository().getPagesSummary(userId)`  
  - StorageAdapter（IndexedDB + 同期）経由で **自分自身のページ（`/page/:id` のもの）のみ** を取得
- ノート内ページ（`/note/:noteId/page/:pageId`）は別API・別クエリで取得しており、ここには含まれない  
→ **すでに「自分自身のページのみ」に集中したデータになっている**

### 1.4 ノート機能の他の入口

- **ノート一覧・新規ノート**: 現状は **/home の NotesSection のみ**
- **既存ノートの閲覧・編集**:  
  - URL を直接開く: `/note/:noteId`, `/note/:noteId/page/:pageId`, `/note/:noteId/settings`, `/note/:noteId/members`  
  - **GlobalSearch**: 検索結果に「共有ノート内のページ」が含まれており、選択で `/note/:noteId/page/:pageId` に遷移可能
- **Header / FAB**: ノート作成・ノート一覧へのリンクはなし（ページ用のみ）

---

## 2. 削除対象の明確化

- **削除するもの**
  - `Home.tsx` 内の `<NotesSection />` の表示および `NotesSection` の import
- **残すもの**
  - `/home` のルート、`Header`、`PageGrid`、`FloatingActionButton`、`WelcomeModal`
  - ノート用ルート（`/note/:noteId` 等）と NoteView / NotePageView / NoteSettings / NoteMembers 等のページコンポーネント
  - GlobalSearch の「共有ノート内ページ」検索
  - `NotesSection` コンポーネント自体は **削除するか残すか** は仕様次第（下記「確認事項」参照）

---

## 3. 確認したい点・提案

### Q1. ノート機能の扱い

- **A) ノート機能は維持するが、/home からだけ外す**  
  - ノート一覧・新規ノートの入口を **別ルートに移す** かどうか決めたいです。
  - 例: `/notes` を新設し、「ノート一覧 + 新規ノート」をそこに集約する。
  - この場合、`NotesSection` は `/notes` 用に流用するか、似たUIを `/notes` で再実装する形になります。
- **B) ノート機能自体をアプリから廃止する**  
  - その場合は NotesSection 削除に加え、`/note/*` ルート・NoteView 等・useNoteQueries の利用箇所の整理・削除範囲の検討が必要です。

どちらに近い想定でしょうか？（「とりあえず /home からだけ外す」なら A として、別ルートは後決めでも可です。）

### Q2. 「新規ノート」の入口

- 現状、**新規ノートを作成できるUIは /home の NotesSection 内の「新規ノート」ボタンのみ**です。
- NotesSection を /home から外す場合:
  - **別画面でノート一覧・新規ノートを用意する**（上記 `/notes` など）なら、そこで「新規ノート」を配置する形で問題ありません。
  - **いったんノート作成の入口は設けない**（既存ノートはURLや検索でのみアクセス）という方針でも実装可能です。

どちらにしますか？

### Q3. ヘッダーなど他UIの変更

- 「/home は自分自身のページのみに集中」という目的であれば、**Header や FAB にノート用リンクを追加する必要はなさそう**です（現状もノート用リンクはありません）。
- ノート一覧を別ルート（例: `/notes`）に移す場合、**ヘッダーに「ノート」ナビリンクを追加するか**は別途検討事項として挙げておきます。

### Q4. NotesSection コンポーネントの扱い

- **/home からだけ削除し、ノート一覧は別ルートに移す場合**:  
  - `NotesSection` をそのまま `/notes` 用に使うか、`/notes` 用の新コンポーネントに切り出してから `NotesSection` を廃止するか、どちらでも対応可能です。
- **ノート一覧をどこにも表示しない場合**:  
  - `NotesSection` は未使用になるため、削除してよいです。

---

## 4. 実装ステップ案（/home からだけ外す場合）

1. **Phase 1 — /home の整理**
   - `Home.tsx` から `NotesSection` の import と `<NotesSection />` を削除する。
   - これだけで「/home は自分自身のページのみに集中」する状態は達成されます。

2. **Phase 2 — ノート入口の扱い（方針が決まり次第）**
   - ノート一覧・新規ノートを別ルートに移す: 例として `/notes` ページを追加し、そこに `NotesSection` 相当を配置。必要ならヘッダーに「ノート」リンクを追加。
   - もしくは、ノート作成入口をいったん廃止し、既存ノートはURL・GlobalSearch のみとし、`NotesSection` は削除。

3. **Phase 3 — 不要コードの整理（任意）**
   - `NotesSection` を別ルートに移した場合、重複や未使用 export の整理。
   - ノート機能を廃止する場合は、ルート・ページ・フック・API 呼び出しの削除範囲をリストアップしてから実施。

---

## 5. まとめ

- **現状**: /home の上部に「公開ノート」セクション（NotesSection）があり、その下に自分用ページ一覧（PageGrid）がある。PageGrid のデータはもともと「自分自身のページ」のみ。
- **削除対象**: /home 上の NotesSection の表示（および方針に応じてコンポーネント自体の削除または移設）。
- **仕様として決めたいこと**:
  - ノート機能は維持するか、廃止するか（Q1）
  - 新規ノートの入口をどこに置くか、あるいは置かないか（Q2）
  - ノート一覧を別ルートに移す場合、ヘッダーにリンクを出すか（Q3）
  - NotesSection コンポーネントは移設するか削除するか（Q4）

上記が決まれば、Phase 1 はそのまま実装可能で、Phase 2 以降は方針に合わせて進められます。

---

## 6. 実装済み（2026-02-10）

- **方針**: ノート機能は維持し、/notes ページを新設して集約。新規ノートも /notes に移動。NotesSection は削除。
- **対応内容**:
  1. **Home.tsx**: `NotesSection` の import と表示を削除。/home は PageGrid（自分用ページ）のみに集中。
  2. **/notes ページ**: `src/pages/Notes.tsx` を新規作成。
     - タイトル「ノート」＋「新規ノート」ボタン（ダイアログでタイトル・公開範囲を入力し作成後 `/note/:id` に遷移）。
     - 「参加しているノート」: `useNotes()` + `NoteCard` で一覧表示。
     - 「みんなのノート」: 誰でも参加できるノート等のUIは仕様検討後に実装する旨のプレースホルダーを表示。
  3. **App.tsx**: `/notes` ルートを追加（`ProtectedRoute` で保護）。
  4. **Header**: ログイン時のみ、Chrome のアプリランチャー風のメニューを追加。
     - ロゴ右にグリッドアイコン（`LayoutGrid`）。クリックでドロップダウンを表示。
     - ドロップダウン内はグリッドレイアウトで「ホーム」（/home）「ノート」（/notes）を配置。今後ほかの機能・拡張の入口を追加しやすい構成。
  5. **NotesSection.tsx**: 削除（/notes で一から組み直すため）。
