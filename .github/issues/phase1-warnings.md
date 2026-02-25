## 親 Issue

**#69** [方針] ESLint/Prettier に基づく今後の実装方針

---

## 目的

ESLint の「未使用コード」「本番に残すべきでないコード」に関する警告を解消し、コードベースをクリーンに保つ。作業者が迷わないよう、手順・参照情報をまとめる。

---

## 対象ルールと対象範囲

| ルール                              | 対象              | 対応方法                                                                         |
| ----------------------------------- | ----------------- | -------------------------------------------------------------------------------- |
| `unused-imports/no-unused-imports`  | 全 `.ts` / `.tsx` | **自動修正可**（下記コマンドで一括）                                             |
| `@typescript-eslint/no-unused-vars` | 未使用変数・引数  | 削除するか、意図的に未使用なら `_` プレフィックス                                |
| `no-console`                        | **src/** 配下のみ | `console.log` / `console.info` / `console.debug` を削除 or `warn`/`error` へ変更 |

※ `scripts/` `e2e/` `server/` `terraform/` は `no-console` の対象外（CLI・スクリプトのため）。

---

## 作業手順

### Step 1: 未使用 import の一括削除（自動）

```bash
bun run lint -- --fix
```

- **--fix** で `unused-imports/no-unused-imports` に該当する未使用 import が自動削除される。
- 修正後は必ず `bun run lint` で error が 0 のままであることを確認する。
- 変更が多くなるため、この Step だけの PR にするとレビューしやすい。

### Step 2: 未使用変数・引数の解消（手動）

1. 警告一覧を確認する:
   ```bash
   bun run lint 2>&1 | grep "no-unused-vars"
   ```
2. 各ファイルで以下のいずれかで対応する:
   - **使用する**: 変数・引数を実際に使うようにコードを修正する。
   - **削除する**: 不要なら変数宣言や引数を削除する。
   - **意図的に未使用**: インターフェース上必要ながら使わない引数（例: コールバックの第2引数）は、名前を **`_` で始める**（例: `_event`, `_page`）。  
     → ESLint の `argsIgnorePattern: "^_"` / `varsIgnorePattern: "^_"` で無視される。

**例（引数を意図的に未使用にする）:**

```ts
// Before: 'page' is defined but never used
test("foo", async ({ page }) => { ... });

// After
test("foo", async ({ page: _page }) => { ... });
// または
test("foo", async ({ page }) => { ... }); // 実際に page を使う
```

### Step 3: src 配下の console.log 削減（手動）

1. **対象ファイルの確認:**

   ```bash
   bun run lint 2>&1 | grep "no-console"
   ```

   → 表示されるのは **src/** 配下のファイルのみ（設定で `scripts`/`e2e`/`server`/`terraform` は除外済み）。

2. 各出現箇所で以下のいずれかで対応する:
   - **デバッグ用**: 削除する。
   - **本番でも残したいログ**: `console.warn` または `console.error` に変更する（これらはルールで許可）。
   - **将来的にロガーに移行する**: 一旦 `console.warn` にし、別 Issue でロガー導入を検討する。

**許可される console メソッド:** `console.warn`, `console.error`  
**警告対象:** `console.log`, `console.info`, `console.debug` など

---

## 完了条件の確認

- [ ] `bun run lint` が **error 0** で完了する。
- [ ] Phase 1 に関連する **warn**（未使用 import / 未使用変数 / src の no-console）が解消されている（可能な範囲で）。
- [ ] `bun run format:check` が通っている（必要に応じて `bun run format` を実行）。

---

## 参照情報

| 項目                              | 場所                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| ルール一覧・方針                  | `docs/lint-and-format.md`                                                                                        |
| ESLint 設定（対象パス・ルール値） | `eslint.config.js`（特に `rules` と `files: ["src/**/*.{ts,tsx}"]` の override）                                 |
| 未使用 import プラグイン          | [eslint-plugin-unused-imports](https://github.com/sweepline/eslint-plugin-unused-imports)                        |
| no-unused-vars オプション         | [@typescript-eslint/no-unused-vars](https://typescript-eslint.io/rules/no-unused-vars)（`argsIgnorePattern` 等） |

---

## 注意事項

- **変更は小さな単位で PR に分ける**とレビューしやすい（例: 未使用 import のみ / 未使用変数のみ / console のみ）。
- **テスト・ビルド**を PR 前に実行し、挙動が変わっていないことを確認する: `bun run test:run` / `bun run build`。
- 他フェーズ（Phase 2〜4）の作業と同時に行う場合は、コンフリクトに注意する。
