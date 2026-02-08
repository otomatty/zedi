# 作業ログ: 初回ログイン時の「Initial sync requested」無限表示の修正

**作業日:** 2026-02-08  
**対象:** 初めてログインするユーザーで、コンソールに `[Sync] Initial sync requested` が無限に表示される事象の調査と修正

---

## 1. サマリー

| # | 事象 | 原因 | 対応 |
|---|------|------|------|
| 1 | 初回ログイン時に `[Sync] Initial sync requested` が繰り返し表示され、同期完了後も再度表示される | `useRepository()` が複数コンポーネントから呼ばれ、各インスタンスが独自の `useRef` で「初期同期済み」を管理していたため、コンポーネント数ぶん同期がトリガーされていた。開発時の React Strict Mode による再マウントで ref がリセットされ、さらに繰り返しが発生 | モジュール直下の `Set` で「この userId で既に初期同期を依頼したか」を一元管理し、1 userId あたり 1 回だけ初期同期を実行するように変更 |

---

## 2. 処理の流れ（原因の整理）

### 2.1 なぜ複数回トリガーされるか

1. **`useRepository()` は多数のコンポーネントから利用されている**
   - `usePagesSummary()` → PageGrid・GlobalSearch
   - `useSearchPages()` → GlobalSearch
   - `useCreatePage()` → FloatingActionButton
   - その他 `usePage`, `useUpdatePage`, `useDeletePage` など

2. **React のフックの性質**
   - 同じフックを別コンポーネントで呼ぶと、**呼び出し元ごとに別のフックインスタンス**になる。
   - そのため `initialSyncDone` の `useRef` も**コンポーネントごとに別々**。

3. **初回ログイン時の動き**
   - `isLocalDbReady` が `true` になると、useRepository を使っている**すべてのコンポーネント**で「初期同期」用の `useEffect` が実行される。
   - 各コンポーネントの `initialSyncDone.current` は**自分の ref だけ**を見るため、他コンポーネントが既に同期していても関係ない。
   - 結果として、**useRepository を参照するコンポーネント数ぶん**「Initial sync requested」が出力され、`syncWithRemote` も同じ回数だけ呼ばれる（実際に同期が走るのは 1 回で、残りは "Skipped: sync already in progress"）。

4. **開発時の Strict Mode**
   - Strict Mode ではマウント → アンマウント → 再マウントが起こる。
   - 再マウントで **ref は初期値に戻る** ため、`initialSyncDone.current` が再び `false` になり、**再度「初期同期」が全コンポーネントで走る**。
   - この繰り返しで「無限に」ログが出るように見えていた。

### 2.2 ログの並びの意味

- 複数回の「Initial sync requested」→ 複数コンポーネントがそれぞれ同期を開始している。
- 「Skipped: sync already in progress」→ 2 本目以降は既に同期中なのでスキップ。
- 1 本だけ同期が完了 → 「Status -> synced」「New lastSyncTime=...」。
- その後また「Initial sync requested」→ Strict Mode の再マウントなどで、別の（または同じ）コンポーネントが再度「初期同期」を走らせている。

---

## 3. 変更したファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/hooks/usePageQueries.ts` | モジュール直下に `initialSyncRequestedForUser: Set<string>` を追加。初期同期の effect で「この userId が Set にまだ無いときだけ」`syncWithRemote` を呼び、呼んだらその userId を Set に追加。ログアウト時（`isSignedIn === false`）に Set を `clear` し、再ログイン時に再度 1 回だけ初期同期が走るようにした。同期エラー時は該当 userId を Set から削除してリトライ可能にした。 |

---

## 4. 技術メモ

### 4.1 修正のポイント

- **「初期同期は 1 userId あたり 1 回だけ」** に制限した。
- `useRef` は「コンポーネントごと」のため、複数コンポーネントで useRepository を使うと複数回トリガーされる。そこで **モジュールレベルの Set** で「この userId では既に初期同期を依頼した」を管理するようにした。
- これにより、useRepository を参照するコンポーネント数に依存せず、**「Initial sync requested」と実際の同期開始は 1 回だけ**になる。

### 4.2 ログアウト・再ログイン

- ログアウト時に `initialSyncRequestedForUser.clear()` を実行しているため、再ログイン（同一ユーザー・別ユーザー問わず）時は再度 1 回だけ初期同期が実行される。

### 4.3 エラー時のリトライ

- 初期同期でエラーが発生した場合は、該当 `userId` を Set から削除しているため、次回のマウントや再試行で再度初期同期が実行される。

---

## 5. 関連

- 同様の「1 回だけ実行」の制御は、認可コードの二重トークン交換防止（`AuthCallback.tsx` の `exchangedCodes` Set）でも行っている。
- 参照: `docs/work-logs/20260208/cognito-google-github-login-fixes.md`（Strict Mode と 1 回実行の話）
