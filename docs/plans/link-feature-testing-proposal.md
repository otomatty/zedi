# リンク機能 テスト実装案

ページ詳細のリンク一覧・Wiki リンク同期（差分更新）まわりについて、現在のテスト状況を整理し、追加すべきテスト案をまとめる。

---

## 1. 対象機能の範囲

- **表示**: ページ下部のリンク一覧（`LinkedPagesSection` / `useLinkedPages`）
- **永続化**: `links` / `ghost_links` の追加・削除（`PageRepository`、`useSyncWikiLinks`）
- **差分同期**: 保存時に「削除されったリンクの除去」と「現在コンテンツのリンクの追加」
- **保存フロー**: `useEditorAutoSave` での保存後 `syncWikiLinks` 呼び出し、保存成功時の `linkedPages` 無効化

---

## 2. 現在のテスト状況

### 2.1 既存テスト

| 対象 | ファイル | 内容 |
|------|----------|------|
| リンク計算（純粋関数） | `src/hooks/useLinkedPages.test.ts` | `pageToCard`、`calculateLinkedPages` をテスト。Tiptap コンテンツから outgoing/backlinks/ghost/2-hop の算出のみ。**リポジトリ・DB・sync は一切使わない**。 |
| リンク一覧 UI | `src/components/page/LinkedPagesSection.test.tsx` | `useLinkedPages` と `useCreatePage` をモックし、渡された `LinkedPagesData` の表示・クリック動作をテスト。**データ取得・sync はテストしない**。 |
| テスト用 DB ヘルパー | `src/test/testDatabase.ts` | `createTestClient`、`createTestRepository`、`insertTestPage`、`insertTestLink`、`insertTestGhostLink`、`clearTestDatabase`、`createWikiLinkContent` を提供。**現状、リンク用ヘルパー（insertTestLink 等）を利用しているテストはない**。 |

### 2.2 テストされていない部分

- **PageRepository のリンク／ゴースト API**
  - `addLink` / `removeLink` / `getOutgoingLinks` / `getBacklinks`
  - `addGhostLink` / `removeGhostLink` / `getGhostLinksBySourcePage`（今回追加）
  - 上記の SQL / StorageAdapter 実装の動作保証がない。

- **syncLinks（差分同期）**
  - 「保存されたコンテンツの Wiki リンク」に基づく追加・削除のロジックが未テスト。
  - 削除差分（コンテンツから消えたリンクの `removeLink` / `removeGhostLink`）が正しく動くかのテストがない。

- **useLinkedPages フック**
  - `calculateLinkedPagesOptimized` は **テストされていない**（`calculateLinkedPages` のみテストあり）。
  - フック全体（`getRepository` → `getPagesSummary` / `getBacklinks` / `getPagesByIds` を使った取得）のテストがない。

- **useEditorAutoSave と sync の連携**
  - 保存成功後に `syncWikiLinks(pageId, wikiLinks)` が正しい引数で呼ばれるかのテストがない。

- **保存成功時の UI 更新**
  - `onSaveSuccess` で `queryClient.invalidateQueries({ queryKey: [..., "linkedPages", userId, pageId] })` が呼ばれるかのテストがない。

---

## 3. テスト実装案

### 3.1 PageRepository のリンク／ゴースト（推奨: 高）

**目的**: DB 層のリンク・ゴースト操作が正しく動くこと、および新規追加した `getGhostLinksBySourcePage` の動作を保証する。

**方式**: `createTestRepository()` と `insertTestPage` / `insertTestLink` / `insertTestGhostLink` を使った **実 DB を使う単体／統合テスト**。

**新規ファイル例**: `src/lib/pageRepository/pageRepository.links.test.ts`（または `src/test/pageRepository.links.test.ts`）

**ケース例**:

1. **addLink / getOutgoingLinks / getBacklinks**
   - ページ A, B を insert → `addLink(A, B)` → `getOutgoingLinks(A)` が `[B]`、`getBacklinks(B)` が `[A]` を返す。
   - 複数リンク（A→B, A→C）で outgoing が 2 件、それぞれの backlinks が 1 件になることを確認。

2. **removeLink**
   - 上記の状態から `removeLink(A, B)` → `getOutgoingLinks(A)` に B が含まれない、`getBacklinks(B)` に A が含まれない。

3. **addGhostLink / getGhostLinksBySourcePage / removeGhostLink**
   - ページ A を insert → `addGhostLink("未作成ページ", A)` → `getGhostLinksBySourcePage(A)` が `["未作成ページ"]` を返す。
   - 複数ゴースト登録・`removeGhostLink` 後、該当 source のゴーストだけ減ることを確認。

4. **getGhostLinksBySourcePage が他ページのゴーストを返さない**
   - ページ A, B を用意し、A にだけゴーストを登録 → `getGhostLinksBySourcePage(B)` が空であることを確認。

**依存**: 既存の `testDatabase.ts` のスキーマに `ghost_links(source_page_id)` のインデックスが無くても動作するが、必要なら `idx_ghost_links_source_page_id` を testDatabase の SCHEMA_SQL に追加可能（本番 Aurora には既にある）。

---

### 3.2 syncLinks の差分同期ロジック（推奨: 高）

**目的**: 「現在コンテンツの Wiki リンク」だけを正規化して追加し、コンテンツから消えたリンク／ゴーストを削除する振る舞いを保証する。

**方式（どちらか）**:

- **A) ロジックを関数に切り出して単体テスト**  
  `usePageQueries.ts` から「repo + userId + sourcePageId + wikiLinks を受け取り、remove と add を行う」関数（例: `syncLinksWithRepo`）を切り出し、**モック repo** で呼び出し回数・引数を検証する。
- **B) 実 DB で統合テスト**  
  `createTestRepository` と `insertTestPage` / `insertTestLink` / `insertTestGhostLink` で初期状態を用意し、`useSyncWikiLinks` の `syncLinks` を実行（この場合、テスト用に `useRepository` がテスト用 repo を返すラッパーが必要）。実行後に `getOutgoingLinks` / `getGhostLinksBySourcePage` で結果を検証。

**推奨**: まず **A** を採用し、`syncLinksWithRepo` を `usePageQueries.ts` に export してテストする。repo のメソッドを vi.fn() でモックし、「削除されうるリンク／ゴースト」に対して `removeLink` / `removeGhostLink` が 1 回ずつ呼ばれ、「現在のリンク」に対して `addLink` / `addGhostLink` が期待通り呼ばれることを確認する。

**新規ファイル例**: `src/hooks/useSyncWikiLinks.test.ts`

**ケース例**:

1. **追加のみ**: 既存の outgoing/ghost が空の状態で、wikiLinks に「存在するページ」と「存在しないページ」を渡す → `addLink` と `addGhostLink` が期待通り呼ばれ、`removeLink` / `removeGhostLink` は呼ばれない（または不要な削除が無い）。
2. **削除の差分**: 事前に `getOutgoingLinks` / `getGhostLinksBySourcePage` が「古い 1 件」を返すようにモックし、wikiLinks を空または別のリンクだけに変更 → その 1 件に対して `removeLink` または `removeGhostLink` が 1 回呼ばれる。
3. **追加と削除の両方**: 古いリンク 1 件を削除し、新しいリンク 1 件を追加する wikiLinks に変更 → remove 1 回 + add 1 回が期待通り。
4. **正規化**: 同じタイトルの大文字・小文字や前後空白の違いで重複が発生しないこと（既存の `pageTitleToId` / `currentNormalizedTitles` の扱いを確認）。

---

### 3.3 calculateLinkedPagesOptimized（推奨: 中）

**目的**: 本番で使っている `calculateLinkedPagesOptimized` の結果が、`calculateLinkedPages` と整合する（または仕様どおりである）ことを保証する。

**方式**: 既存の `useLinkedPages.test.ts` に describe を追加。入力は `CalculateLinkedPagesOptimizedInput`（`currentPage`、`pageId`、`allPagesSummary`、`outgoingPages`、`backlinkPages`、`backlinkIds`）。`calculateLinkedPages` と同様のシナリオ（outgoing / backlinks / ghost / 2-hop / 制限数）で期待値を用意し、`calculateLinkedPagesOptimized` の戻り値を検証する。

**ケース例**:

- 既存の `calculateLinkedPages` の「Outgoing Links」「Backlinks」「Ghost Links」「2-hop」の代表ケースを、`PageSummary` と `Page` の役割を分けた形で `calculateLinkedPagesOptimized` 用に書き直す。
- `outgoingPages` に本文がないページは `summaryToCard` にフォールバックするため、preview が空になるケースを 1 件含める。

---

### 3.4 useEditorAutoSave と syncWikiLinks の連携（推奨: 中）

**目的**: 保存が成功したときに、**保存されたコンテンツ**から抽出した Wiki リンクで `syncWikiLinks` が 1 回呼ばれることを保証する。

**方式**: `useEditorAutoSave` を `renderHook` で使い、`syncWikiLinks` を vi.fn() でモック。`saveChanges(title, content)` に Wiki リンクを含む content を渡し、`waitFor` で保存完了後、`syncWikiLinks` が `[pageId, wikiLinks]` の形で 1 回呼ばれ、`wikiLinks` が `extractWikiLinksFromContent(content)` の結果と一致することを検証する。`debounceMs` は 0 に近い値（または 0）にするとテストが書きやすい。

**新規ファイル例**: `src/components/editor/PageEditor/useEditorAutoSave.test.ts`

**注意**: 保存が非同期かつ debounce されるため、`jest.useFakeTimers` または `vi.useFakeTimers` で時間を進めるか、`debounceMs=0` で即時実行にしてから `await waitFor(...)` で assert する。

---

### 3.5 保存成功時の linkedPages 無効化（推奨: 低）

**目的**: 保存成功時に、現在ページのリンク一覧用クエリだけが無効化され、再取得が促されることを保証する。

**方式**: `PageEditorView` をモックだらけでレンダーするか、`onSaveSuccess` を注入できるようにして、その中で `queryClient.invalidateQueries` が `queryKey: [...pageKeys.all, "linkedPages", userId, currentPageId]` で 1 回呼ばれることを検証する。実装が「保存成功コールバック内で invalidate する」だけなので、優先度は低めでよい。

---

### 3.6 useLinkedPages フック（統合）（推奨: 低〜中）

**目的**: 実際に repo から getPagesSummary / getBacklinks / getPagesByIds を叩き、`useLinkedPages(pageId)` の結果が `LinkedPagesData` として期待どおりになることを保証する。

**方式**: `useRepository` をモックし、`getRepository()` がテスト用の `PageRepository`（`createTestRepository` で作成）を返すようにする。ただし現在の `useRepository` はグローバルなストレージ/認証に依存しているため、テスト用の Provider で上書きするか、`useLinkedPages` の queryFn を直接テストする形（repo を引数で渡すファクトリを一時的に用意する）が現実的。工数が大きいため、3.1 と 3.2 で repo と sync を押さえたあと、必要に応じて追加する程度でよい。

---

## 4. 実装優先度と順序

| 優先度 | 項目 | 理由 |
|--------|------|------|
| 1 | PageRepository のリンク／ゴースト（3.1） | 今回追加した `getGhostLinksBySourcePage` を含む DB 層の土台。他のテストの前提にもなる。 |
| 2 | syncLinks の差分同期（3.2） | 保存時の挙動の要。モック repo で十分テスト可能。 |
| 3 | calculateLinkedPagesOptimized（3.3） | 既存の calculateLinkedPages テストの延長で足せる。 |
| 4 | useEditorAutoSave と sync 連携（3.4） | 保存フローと sync の接続点を保証。 |
| 5 | 保存成功時の invalidate（3.5） | 小さな仕様の明文化。 |
| 6 | useLinkedPages 統合（3.6） | 必要なら後から追加。 |

---

## 5. 既存テストへの影響

- **LinkedPagesSection.test.tsx**: 現状は `useLinkedPages` をモックしているだけなので、リンク機能の実装変更で落ちる可能性は低い。`vi.importActual` が Bun で未対応の場合は、テストランナー側の対応か、モック方法の変更（react-router をラップするコンポーネントで navigate を渡す等）で対応する。
- **useLinkedPages.test.ts**: `calculateLinkedPagesOptimized` を追加すると、既存の `calculateLinkedPages` と入力形式が違うため、describe を分けて追加する形がよい。

---

## 6. まとめ

- **必ず追加したい**: PageRepository のリンク／ゴーストのテスト（3.1）、syncLinks の差分同期のテスト（3.2）。
- **あるとよい**: calculateLinkedPagesOptimized（3.3）、useEditorAutoSave の sync 呼び出し（3.4）。
- **余裕があれば**: 保存成功時の invalidate（3.5）、useLinkedPages の repo 統合テスト（3.6）。

これに従ってテストを追加すると、今回実装した「保存時の差分リンク更新」と「ページ下部リンク一覧の更新」が regression しにくくなる。
