# libSQL 利用状況の調査結果

**更新**: 本番で使われていない libSQL 関連をすべて削除済み（NoteRepository 削除、PageRepository クラス削除、testDatabase の libsql 依存削除、mocks の createMockRepositoryHook 削除、@libsql/client パッケージ削除）。

---

本番では **libSQL は使われていません**。データの永続化は **StorageAdapter（IndexedDB）＋ API（Aurora）** のみです。以下は削除前の状況の記録です。

---

## 1. 本番のデータフロー（libSQL なし）

- **useRepository()**（`src/hooks/usePageQueries.ts`）の **getRepository()** は常に **StorageAdapterPageRepository** を返す。
- StorageAdapterPageRepository は **createStorageAdapter()**（IndexedDB）と **createApiClient()**（Aurora API）だけを使う。
- したがって **本番で PageRepository（libsql 版）や NoteRepository（libsql 版）は一度もインスタンス化されない**。

```
本番:  useRepository() → StorageAdapterPageRepository(adapter, api, userId)
       → IndexedDBStorageAdapter + Aurora API
```

---

## 2. libSQL が登場する箇所（すべてコード参照）

### 2.1 ソースコード（型・実装）

| ファイル | 内容 |
|----------|------|
| **src/lib/pageRepository.ts** | 先頭で `import type { Client } from "@libsql/client"`。**PageRepository** クラスが `constructor(private client: Client, ...)` で libsql の Client を受け取る。コメントに「libsql local/test」とある。このクラスは **本番では new されず、テストでだけ** 使われる。 |
| **src/lib/noteRepository.ts** | 先頭で `import type { Client } from "@libsql/client"`。**NoteRepository** クラスが `constructor(private client: Client, ...)` で Client を受け取る。**このクラスを new している箇所はプロジェクト内に存在しない**（ノートは useNoteQueries 経由で API のみ）。 |

### 2.2 テスト・モック

| ファイル | 内容 |
|----------|------|
| **src/test/testDatabase.ts** | `import { createClient, type Client } from "@libsql/client/web"`。`createTestClient()` で `createClient({ url: ":memory:" })` を呼ぶ。`createTestRepository()` で `new PageRepository(client)` を返す。**テスト用の in-memory DB としてのみ使用**。なお `@libsql/client/web` はブラウザ向けで `:memory:` をサポートしないため、Bun/Node でテストすると URL_SCHEME_NOT_SUPPORTED になる。 |
| **src/test/mocks.ts** | `import type { Client } from "@libsql/client/web"`。`createMockRepositoryHook(client: Client)` 内で `new PageRepository(client)` を呼ぶ。テストで useRepository をモックするためのヘルパー。 |

### 2.3 依存関係

| ファイル | 内容 |
|----------|------|
| **package.json** | `"@libsql/client": "^0.15.15"` が dependencies に含まれる。 |

### 2.4 型・コメントのみ（実実行には影響しない）

| ファイル | 内容 |
|----------|------|
| **src/types/page.ts** | PageSummary の JSDoc に「reduce Turso Rows Read」とある。Turso/libSQL 時代の名残。 |

---

## 3. まとめ一覧

| 種別 | 使っているか | 備考 |
|------|--------------|------|
| **本番のページ永続化** | ❌ 使っていない | StorageAdapterPageRepository（IndexedDB + API）のみ。 |
| **本番のノート** | ❌ 使っていない | useNoteQueries は API のみ。NoteRepository（libsql 版）は未使用。 |
| **PageRepository クラス（pageRepository.ts）** | テストのみ | testDatabase.ts と mocks.ts で `new PageRepository(client)` として使用。 |
| **NoteRepository クラス（noteRepository.ts）** | どこからも使われていない | 削除候補。 |
| **testDatabase.ts の createClient** | テストのみ | libsql の in-memory で PageRepository を動かすため。環境によっては `:memory:` が使えず失敗する。 |
| **@libsql/client パッケージ** | テスト＋型 | 上記テストと PageRepository/NoteRepository の Client 型で参照。 |

---

## 4. 今後の選択肢

1. **テストだけ libSQL のまま使う**  
   - testDatabase を **Node 用クライアント**（`@libsql/client` のデフォルト import。Bun/Node では `:memory:` が使える）に切り替える。  
   - 本番コードは一切触らず、テストの実行環境だけ合わせる。

2. **libSQL をやめてテストをモック／別実装にする**  
   - PageRepository（SQL 実装）をテストで使わず、**IPageRepository のモック**だけにする。  
   - または **StorageAdapter の in-memory 実装**など、libsql に依存しないテスト用リポジトリを用意する。  
   - そのうえで `@libsql/client` を削除し、**pageRepository.ts の PageRepository クラス**と **noteRepository.ts の NoteRepository クラス**（未使用）を削除または別パッケージに分離する。

3. **コメント・型の整理だけ行う**  
   - `src/types/page.ts` の「Turso Rows Read」を「Aurora/API」など現状に合わせて修正。  
   - 残すとしても「テスト用」と明記する。

以上が、libSQL に関連する処理の全体像です。
