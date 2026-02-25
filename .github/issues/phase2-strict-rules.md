## 親 Issue

**#69** [方針] ESLint/Prettier に基づく今後の実装方針

---

## 目的

現在 **warn** になっている厳格ルールの違反をコード側で解消したうえで、`eslint.config.js` でそれらのルールを **error** に変更する。CI でこれらを error として扱い、本番品質を上げる。

---

## 対象ルール（4つ）

| ルール                                      | 意味                     | 修正の方向性                                         |
| ------------------------------------------- | ------------------------ | ---------------------------------------------------- |
| `@typescript-eslint/no-non-null-assertion`  | `!` の使用禁止           | optional chaining / 型ガードで null/undefined を明示 |
| `@typescript-eslint/no-extraneous-class`    | 不要な class の禁止      | コンストラクタだけの class → 関数 or オブジェクト    |
| `@typescript-eslint/no-useless-constructor` | 空のコンストラクタ禁止   | 削除する                                             |
| `@typescript-eslint/no-dynamic-delete`      | 動的キーでの delete 禁止 | オブジェクトの再生成など安全な方法に変更             |

---

## 作業手順（2段階）

### Phase 2-A: コードの修正（ルールはまだ warn のまま）

1. **該当箇所の洗い出し**

   ```bash
   bun run lint 2>&1 | grep -E "no-non-null-assertion|no-extraneous-class|no-useless-constructor|no-dynamic-delete"
   ```

2. **ルールごとの修正方針**

   #### `no-non-null-assertion`（`!` の削除）
   - **悪い例:** `obj!.prop` / `arr![0]`
   - **良い例:**
     - Optional chaining: `obj?.prop`
     - 型ガード: `if (obj != null) { ... obj.prop ... }`
     - デフォルト値: `obj?.prop ?? defaultValue`
   - 参考: [no-non-null-assertion](https://typescript-eslint.io/rules/no-non-null-assertion)

   #### `no-extraneous-class`（不要な class）
   - **悪い例:** コンストラクタだけの class、またはメソッドが静的だけの class
   - **良い例:**
     - インスタンス化しないなら **オブジェクト + 関数** に変更
     - または **名前空間的な関数** を単体で export
   - 参考: [no-extraneous-class](https://typescript-eslint.io/rules/no-extraneous-class)

   #### `no-useless-constructor`（空のコンストラクタ）
   - 親 class のコンストラクタをそのまま引き継いでいるだけの空のコンストラクタは **削除** する。
   - 参考: [no-useless-constructor](https://typescript-eslint.io/rules/no-useless-constructor)

   #### `no-dynamic-delete`（動的 delete の禁止）
   - **悪い例:** `delete obj[key]`（`key` が変数の場合）
   - **良い例:** 新しいオブジェクトを組み立てる（例: `const { [key]: _, ...rest } = obj; return rest;` や lodash `omit` など）
   - 参考: [no-dynamic-delete](https://typescript-eslint.io/rules/no-dynamic-delete)

3. **修正後の確認**
   ```bash
   bun run lint
   bun run test:run
   bun run build
   ```

### Phase 2-B: eslint.config.js で error に変更

該当する **warn** が 0 になったことを確認してから実施する。

1. **編集するファイル:** `eslint.config.js`

2. **変更箇所（50行目前後）:** 次の 4 行の `"warn"` を `"error"` に変更する。

   ```js
   // 変更前
   "@typescript-eslint/no-non-null-assertion": "warn",
   "@typescript-eslint/no-extraneous-class": "warn",
   "@typescript-eslint/no-useless-constructor": "warn",
   "@typescript-eslint/no-dynamic-delete": "warn",

   // 変更後
   "@typescript-eslint/no-non-null-assertion": "error",
   "@typescript-eslint/no-extraneous-class": "error",
   "@typescript-eslint/no-useless-constructor": "error",
   "@typescript-eslint/no-dynamic-delete": "error",
   ```

3. **確認**
   ```bash
   bun run lint
   ```
   → error が 0 のままであること。1件でも error が出たら、該当コードを再修正する。

---

## ルールを 1 つずつ error にする運用（推奨）

4 つを一気に error にすると影響が大きい場合、次のように **1 ルールずつ** 進めてもよい。

1. ルール A の違反をすべて修正 → `eslint.config.js` でルール A だけ `"error"` に変更 → PR → マージ
2. 同様にルール B → ルール C → ルール D と繰り返す

---

## 完了条件の確認

- [ ] 上記 4 ルールの **warn が 0** になっている。
- [ ] `eslint.config.js` で 4 ルールが **"error"** に変更されている。
- [ ] `bun run lint` が **error 0** で完了する。
- [ ] `bun run test:run` および `bun run build` が成功する。

---

## 参照情報

| 項目                         | 場所                                                                   |
| ---------------------------- | ---------------------------------------------------------------------- |
| ルール一覧・方針             | `docs/lint-and-format.md`                                              |
| ESLint 設定                  | `eslint.config.js`（46〜54 行目付近）                                  |
| typescript-eslint ルール一覧 | [Supported Rules](https://typescript-eslint.io/rules/)                 |
| strict プリセット            | [Configs - strict](https://typescript-eslint.io/users/configs/#strict) |

---

## 注意事項

- **no-non-null-assertion** は、型が `T | null | undefined` のときに `!` で潰している箇所で多く出る。optional chaining や早期 return で null/undefined を分岐すると、型が絞られて `!` が不要になることが多い。
- テストやビルドが通ることを毎回確認し、型エラーやランタイムの挙動変更を防ぐ。
