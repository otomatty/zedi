## 親 Issue

**#69** [方針] ESLint/Prettier に基づく今後の実装方針

---

## 目的

`tsconfig.app.json` で TypeScript の **strict モード** および **未使用ローカル/引数の検出** を有効化し、型の品質と ESLint の型関連ルールを揃える。作業者が迷わないよう、手順・影響・参照をまとめる。

---

## 前提（現状）

- **対象ファイル:** `tsconfig.app.json`（`include` は `["src"]` のみ）
- **現状の設定（抜粋）:**
  - `strict: false`
  - `noUnusedLocals: false`
  - `noUnusedParameters: false`
  - `noImplicitAny: false`

有効化すると **src 配下** で型エラー・未使用エラーが大量に出る可能性があるため、**段階的** に有効化する運用を推奨する。

---

## strict と各オプションの意味

| オプション           | 意味                                | 有効化時の主な影響                          |
| -------------------- | ----------------------------------- | ------------------------------------------- |
| `strict: true`       | 複数の厳格オプションを一括で on     | 下記の多くがまとめて有効になる              |
| `strictNullChecks`   | null/undefined を型に含めてチェック | `string` と `string \| null` の区別が厳密に |
| `noImplicitAny`      | 暗黙の `any` を禁止                 | 型注釈の不足でエラー                        |
| `noUnusedLocals`     | 未使用のローカル変数をエラーに      | ESLint の no-unused-vars と重複気味         |
| `noUnusedParameters` | 未使用の引数をエラーに              | 同上                                        |

※ `strict: true` は [TypeScript - Strict Mode](https://www.typescriptlang.org/tsconfig#strict) を参照。

---

## 推奨: 段階的な有効化手順

### 方針

1. **1 オプションずつ** 有効化する。
2. 有効化ごとに **型エラーを解消** してから次に進む。
3. 解消量が多すぎる場合は、**一部のディレクトリだけ** 先に有効化する運用も可（`include` を分割するなど）。

### Step 1: 作業用ブランチと現状確認

```bash
git checkout -b chore/tsconfig-strict-phase4
bun run build
```

- 現時点で **ビルドが通ること** を確認する。

### Step 2: noUnusedLocals / noUnusedParameters から（影響が比較的少ない場合）

1. **編集ファイル:** `tsconfig.app.json`
2. **変更例:**
   ```json
   "noUnusedLocals": true,
   "noUnusedParameters": true,
   ```
3. **ビルドでエラー確認:**
   ```bash
   bun run build
   ```
4. 出たエラーを **1 ファイルずつ** 解消する:
   - 未使用変数・引数は **削除** するか、**使用する** か、意図的に未使用なら **`_` プレフィックス**（ESLint と同様）。

**注意:** ESLint の `@typescript-eslint/no-unused-vars` と役割が重なる。TypeScript 側を有効にした場合、ESLint 側で同じ変数を「未使用」で指摘することは減る。

### Step 3: noImplicitAny の有効化（任意の順番）

1. `tsconfig.app.json` に `"noImplicitAny": true` を追加。
2. `bun run build` でエラーを確認。
3. エラー箇所に **型注釈を付与**（例: 関数引数、戻り値、変数）。
   - 型が複雑な場合は `// @ts-expect-error` は極力避け、きちんと型を付ける。

### Step 4: strict の有効化（最大の影響）

1. **編集:** `tsconfig.app.json` で `"strict": true` を設定。
2. **意味:** 以下がまとめて有効になる（[公式](https://www.typescriptlang.org/tsconfig#strict) 参照）:
   - strictNullChecks
   - strictFunctionTypes
   - strictBindCallApply
   - strictPropertyInitialization
   - noImplicitAny
   - useUnknownInCatchVariables
   - など
3. **ビルド:**
   ```bash
   bun run build
   ```
4. 出た **型エラーを優先度・影響の小ささ** で順に解消する:
   - **null/undefined:** optional chaining（`?.`）、nullish coalescing（`??`）、型ガード（`if (x != null)`）で対処。
   - **関数の型:** 引数・戻り値の型を明示する。
   - **クラス:** プロパティ初期化や `readonly` の扱いを確認する。

**strict を一気に有効にするとエラーが多すぎる場合:**

- まず **strictNullChecks だけ** を `true` にし、null/undefined 関連だけ先に潰す。
- その後、`strict: true` にすると残りのエラーが少なくなる。

---

## 完了条件の確認

- [ ] `tsconfig.app.json` に、少なくとも **noUnusedLocals** / **noUnusedParameters** が有効になっている（任意で noImplicitAny / strict も）。
- [ ] `bun run build` が **成功** する。
- [ ] `bun run test:run` が **成功** する。
- [ ] `bun run lint` が **error 0** のままである。

---

## 参照情報

| 項目              | 場所                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------- |
| ルール・方針      | `docs/lint-and-format.md`（「TypeScript の厳格化」）                                    |
| 対象 tsconfig     | `tsconfig.app.json`（ルートの `tsconfig.json` は `references` でこれを参照）            |
| TypeScript Strict | [tsconfig - strict](https://www.typescriptlang.org/tsconfig#strict)                     |
| strictNullChecks  | [tsconfig - strictNullChecks](https://www.typescriptlang.org/tsconfig#strictNullChecks) |
| 未使用の扱い      | ESLint: `argsIgnorePattern: "^_"`（`eslint.config.js`）                                 |

---

## 注意事項

- **Phase 4 は任意**。プロジェクトの型品質を上げたいタイミングで実施すればよい。
- 有効化後は **新規コード** から strict に合わせると、既存コードの修正量を抑えられる。
- **型アサーション（`as`）の乱用** は避け、できるだけ正しい型定義・型ガードで解消する。
- テストや E2E も実行し、型だけではなく **実行時挙動** が変わっていないことを確認する。
