# リンク機能 テスト実装案

ページ詳細のリンク一覧・Wiki リンク同期（差分更新）まわりについて、現在のテスト状況を整理し、追加すべきテスト案をまとめる。

**最終更新**: 本番未使用の libSQL / PageRepository クラス削除後の状態に合わせて更新。実装・削除・未実装を区別して記載。

---

## 1. 対象機能の範囲

- **表示**: ページ下部のリンク一覧（`LinkedPagesSection` / `useLinkedPages`）
- **永続化**: `links` / `ghost_links` の追加・削除（**StorageAdapterPageRepository** 経由、`useSyncWikiLinks`）
- **差分同期**: 保存時に「削除されたリンクの除去」と「現在コンテンツのリンクの追加」
- **保存フロー**: `useEditorAutoSave` での保存後 `syncWikiLinks` 呼び出し、保存成功時の `linkedPages` 無効化

---

## 2. 現在のテスト状況

### 2.1 実装済みのテスト（変更なし）

| 対象 | ファイル | 内容 |
|------|----------|------|
| リンク計算（純粋関数） | `src/hooks/useLinkedPages.test.ts` | `pageToCard`、`calculateLinkedPages` をテスト。Tiptap コンテンツから outgoing/backlinks/ghost/2-hop の算出のみ。**リポジトリ・sync は一切使わない**。 |
| リンク一覧 UI | `src/components/page/LinkedPagesSection.test.tsx` | `useLinkedPages` と `useCreatePage` をモックし、渡された `LinkedPagesData` の表示・クリック動作をテスト。**データ取得・sync はテストしない**。 |

### 2.2 テスト用ヘルパー（削除・変更済み）

| ファイル | 変更内容 |
|----------|----------|
| `src/test/testDatabase.ts` | **libSQL 依存を削除**。`createTestClient`、`createTestRepository`、`insertTestPage`、`insertTestLink`、`insertTestGhostLink`、`clearTestDatabase`、`TestPageData` は**削除済み**。残っているのは **`createWikiLinkContent`** と **`createPlainTextContent`** のみ（`useLinkedPages.test.ts` で使用）。 |

### 2.3 削除したテスト

| テスト | ファイル | 削除理由 |
|--------|----------|----------|
| **PageRepository のリンク／ゴースト操作**（旧 3.1） | `src/test/pageRepository.links.test.ts` | 本番未使用の **PageRepository クラス（libSQL 版）** および **libSQL** をコードベースから削除したため、このテストの対象が存在しなくなった。テストファイルごと削除。 |

### 2.4 テストされていない部分（現状）

- **StorageAdapterPageRepository のリンク／ゴースト API**
  - 本番で使っている実装。`addLink` / `removeLink` / `getOutgoingLinks` / `getBacklinks` / `addGhostLink` / `removeGhostLink` / `getGhostLinksBySourcePage` の動作保証はない（テストする場合はアダプタをモックするか、テスト用アダプタが必要）。

- **syncLinks（差分同期）**
  - 「保存されたコンテンツの Wiki リンク」に基づく追加・削除のロジックが未テスト。削除差分が正しく動くかのテストがない。

- **useLinkedPages フック**
  - `calculateLinkedPagesOptimized` は **テストされていない**（`calculateLinkedPages` のみテストあり）。
  - フック全体（`getRepository` → 取得）のテストがない。

- **useEditorAutoSave と sync の連携**
  - 保存成功後に `syncWikiLinks(pageId, wikiLinks)` が正しい引数で呼ばれるかのテストがない。

- **保存成功時の UI 更新**
  - `onSaveSuccess` で `queryClient.invalidateQueries({ queryKey: [..., "linkedPages", userId, pageId] })` が呼ばれるかのテストがない。

---

## 3. テスト実装案（未実装のもの）

### 3.1 ~~PageRepository のリンク／ゴースト~~ → 削除済み・実施不可

**ステータス**: **削除済み**。本番で使うのは **StorageAdapterPageRepository** のみのため、同じ内容をテストする場合は「StorageAdapterPageRepository + モックまたはテスト用 StorageAdapter」で行う必要がある（別案として 3.6 でフック経由で検証する形がある）。

---

### 3.2 syncLinks の差分同期ロジック（推奨: 高） — **実装済み**

**目的**: 「現在コンテンツの Wiki リンク」だけを正規化して追加し、コンテンツから消えたリンク／ゴーストを削除する振る舞いを保証する。

**方式**:

- **A) ロジックを関数に切り出して単体テスト（推奨）** — **実施**  
  `src/lib/syncWikiLinks.ts` に `syncLinksWithRepo(repo, userId, sourcePageId, wikiLinks)` を切り出し、`usePageQueries.ts` の `useSyncWikiLinks` から利用。`src/hooks/useSyncWikiLinks.test.ts` で**モック repo**により呼び出し回数・引数を検証。
- **B) 実 DB で統合テスト**  
  **※ `createTestRepository` は削除済みのため、現状のコードベースでは実施不可。** 行う場合は StorageAdapter の in-memory 実装やテスト用アダプタを用意する必要がある。

**実装**: `src/lib/syncWikiLinks.ts`（syncLinksWithRepo）、`src/hooks/useSyncWikiLinks.test.ts`

**ケース例**:

1. 追加のみ: 既存の outgoing/ghost が空の状態で、wikiLinks に「存在するページ」と「存在しないページ」を渡す → `addLink` と `addGhostLink` が期待通り呼ばれ、remove は呼ばれない。
2. 削除の差分: 事前に `getOutgoingLinks` / `getGhostLinksBySourcePage` が「古い 1 件」を返すようにモックし、wikiLinks を空または別のリンクだけに変更 → その 1 件に対して `removeLink` または `removeGhostLink` が 1 回呼ばれる。
3. 追加と削除の両方: 古いリンク 1 件を削除し、新しいリンク 1 件を追加する wikiLinks に変更 → remove 1 回 + add 1 回が期待通り。
4. 正規化: 同じタイトルの大文字・小文字や前後空白の違いで重複が発生しないこと。

---

### 3.3 calculateLinkedPagesOptimized（推奨: 中） — **実装済み**

**目的**: 本番で使っている `calculateLinkedPagesOptimized` の結果が仕様どおりであることを保証する。

**方式**: 既存の `useLinkedPages.test.ts` に describe を追加。入力は `CalculateLinkedPagesOptimizedInput`。`calculateLinkedPages` と同様のシナリオで期待値を用意し、`calculateLinkedPagesOptimized` の戻り値を検証する。 — **実施済み**

**ケース例**: 既存の `calculateLinkedPages` の代表ケースを、`PageSummary` と `Page` の役割を分けた形で `calculateLinkedPagesOptimized` 用に書き直す。`outgoingPages` に本文がないページは `summaryToCard` にフォールバックするため、preview が空になるケースを 1 件含める。

---

### 3.4 useEditorAutoSave と syncWikiLinks の連携（推奨: 中） — **実装済み**

**目的**: 保存が成功したときに、保存されたコンテンツから抽出した Wiki リンクで `syncWikiLinks` が 1 回呼ばれることを保証する。

**方式**: `useEditorAutoSave` を `renderHook` で使い、`syncWikiLinks` を vi.fn() でモック。`saveChanges(title, content)` に Wiki リンクを含む content を渡し、保存完了後に `syncWikiLinks` が `[pageId, wikiLinks]` の形で 1 回呼ばれ、`wikiLinks` が `extractWikiLinksFromContent(content)` の結果と一致することを検証する。`debounceMs` は 0 に近い値にするとテストが書きやすい。 — **実施済み**

**実装**: `src/components/editor/PageEditor/useEditorAutoSave.test.ts`

---

### 3.5 保存成功時の linkedPages 無効化（推奨: 低） — **実装済み**

**目的**: 保存成功時に、現在ページのリンク一覧用クエリだけが無効化され、再取得が促されることを保証する。

**方式**: `PageEditorView` をモックでレンダーするか、`onSaveSuccess` を注入できるようにして、`queryClient.invalidateQueries` が `queryKey: [...pageKeys.all, "linkedPages", userId, currentPageId]` で 1 回呼ばれることを検証する。 — **実施済み**（`useEditorAutoSave.test.ts` で onSaveSuccess 内の invalidateQueries を QueryClientProvider + spy で検証）

---

### 3.6 useLinkedPages フック（統合）（推奨: 低〜中） — **未実装**

**目的**: repo から getPagesSummary / getBacklinks / getPagesByIds を叩いたとき、`useLinkedPages(pageId)` の結果が `LinkedPagesData` として期待どおりになることを保証する。

**方式**: `useRepository` をモックし、`getRepository()` が **IPageRepository を満たすモック**（vi.fn() で getPagesSummary / getBacklinks / getPagesByIds 等を返す）を返すようにする。テスト用の Provider で上書きするか、`useLinkedPages` の queryFn を直接テストする形が現実的。**※ `createTestRepository` は削除済みのため、モック repo のみで実施。**

---

## 4. 実装状況サマリ

| 項目 | ステータス | 備考 |
|------|------------|------|
| **3.1 PageRepository のリンク／ゴースト** | **削除済み** | テストファイル `pageRepository.links.test.ts` を削除。対象の PageRepository クラスはコードベースから削除済み。 |
| **3.2 syncLinks の差分同期** | **実装済み** | `src/lib/syncWikiLinks.ts` + `src/hooks/useSyncWikiLinks.test.ts`。 |
| **3.3 calculateLinkedPagesOptimized** | **実装済み** | `useLinkedPages.test.ts` に describe 追加。 |
| **3.4 useEditorAutoSave と sync 連携** | **実装済み** | `src/components/editor/PageEditor/useEditorAutoSave.test.ts`。 |
| **3.5 保存成功時の invalidate** | **実装済み** | useEditorAutoSave.test.ts で onSaveSuccess 内の invalidateQueries を検証。 |
| **3.6 useLinkedPages 統合** | **未実装** | モック repo で実施可能（createTestRepository は利用不可）。 |

---

## 5. 実装優先度と順序（今後の作業用）

| 優先度 | 項目 | 理由 |
|--------|------|------|
| 1 | syncLinks の差分同期（3.2） | 保存時の挙動の要。モック repo で十分テスト可能。 |
| 2 | calculateLinkedPagesOptimized（3.3） | 既存の useLinkedPages.test.ts の延長で足せる。 |
| 3 | useEditorAutoSave と sync 連携（3.4） | 保存フローと sync の接続点を保証。 |
| 4 | 保存成功時の invalidate（3.5） | 小さな仕様の明文化。 |
| 5 | useLinkedPages 統合（3.6） | 必要なら後から追加。 |

---

## 6. 既存テストへの影響

- **LinkedPagesSection.test.tsx**: `useLinkedPages` をモックしているだけなので、リンク機能の実装変更で落ちる可能性は低い。
- **useLinkedPages.test.ts**: `calculateLinkedPagesOptimized` を追加する場合は、既存の `calculateLinkedPages` と入力形式が違うため、describe を分けて追加する形がよい。

---

## 7. まとめ

- **削除したテスト**: PageRepository（libSQL 版）のリンク／ゴースト操作のテスト（旧 3.1）。対象クラス・libSQL 削除に伴い削除。
- **実装済み**: 3.2（syncLinks 差分）、3.3（calculateLinkedPagesOptimized）、3.4（useEditorAutoSave + sync）、3.5（保存成功時の invalidate）。
- **未実装で実施可能なもの**: 3.6（useLinkedPages 統合・モック repo 使用）。
- **実施不可（案としてのみ残す）**: 旧 3.1 の「実 DB を使った PageRepository テスト」は、本番で使わないクラスを削除したため実施不可。同様の保証が必要な場合は StorageAdapterPageRepository + モック／テスト用アダプタで検討する。

これに従って 3.2 以降のテストを追加すると、「保存時の差分リンク更新」と「ページ下部リンク一覧の更新」が regression しにくくなる。
