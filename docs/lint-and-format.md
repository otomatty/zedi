# ESLint / Prettier ルールと改善ガイド

複数コントリビューターでの一貫した実装のため、ESLint と Prettier のルール方針と、今後の改善ポイントをまとめています。

## ルールの方向性

- **パフォーマンス**: 無駄な処理・未使用コードの検出、React Hooks の依存配列の正しさ
- **YAGNI・クリーン**: 未使用変数/import の禁止、`debugger` 禁止、複雑度・ネスト深度の制限
- **可読性**: `console.log` の制限、行数制限、簡略化より読みやすさを優先

---

## 現在の ESLint 設定

### ベース

- **@eslint/js** recommended
- **typescript-eslint** `recommended` + `strict`（厳格ルールを追加）
- **react-hooks** / **react-refresh** 推奨ルール
- **eslint-plugin-unused-imports** で未使用 import を検出（`--fix` で自動削除可能）

### 主なルール

| カテゴリ | ルール                                                                 | 設定                                      | 目的                              |
| -------- | ---------------------------------------------------------------------- | ----------------------------------------- | --------------------------------- |
| 未使用   | `@typescript-eslint/no-unused-vars`                                    | warn（`_` 始まりは除外）                  | 未使用変数・引数の削除            |
| 未使用   | `unused-imports/no-unused-imports`                                     | warn                                      | 未使用 import の削除（YAGNI）     |
| 本番     | `no-debugger`                                                          | error                                     | 本番に `debugger` を残さない      |
| 本番     | `no-console`                                                           | **src/** のみ warn、`warn`/`error` は許可 | デバッグ用 `console.log` を減らす |
| 厳格     | `@typescript-eslint/no-non-null-assertion`                             | warn                                      | `!` の段階的削減                  |
| 厳格     | `no-extraneous-class` / `no-useless-constructor` / `no-dynamic-delete` | warn                                      | 不要な class・動的 delete の削減  |
| 可読性   | `complexity`                                                           | warn（max: 20）                           | 複雑な関数の分割                  |
| 可読性   | `max-depth`                                                            | warn（max: 4、scripts 等は 5）            | 深いネストの抑制                  |
| 可読性   | `max-lines-per-function`                                               | warn（max: 150 行）                       | 長大な関数の分割                  |

### 対象ごとのオーバーライド

- **src/**
  - `no-console`: warn（`console.warn` / `console.error` は可）
- **scripts / e2e / server / terraform**
  - `no-console`: off（CLI・スクリプトでは `console` 使用を許可）
  - `max-lines-per-function`: off
  - `max-depth`: max 5

---

## 今後の改善提案

### 1. 段階的に error に上げる

次のルールは現在 **warn** です。修正が進んだら **error** にすると、本番品質をさらに上げられます。

- `@typescript-eslint/no-non-null-assertion`
  - `!` を避け、optional chaining や型ガードで null/undefined を明示する。
- `@typescript-eslint/no-extraneous-class`
  - コンストラクタだけの class は通常の関数やオブジェクトに置き換える。
- `@typescript-eslint/no-useless-constructor`
  - 空のコンストラクタを削除する。
- `@typescript-eslint/no-dynamic-delete`
  - 動的キーの削除は、別オブジェクトを組み立てるなど安全な方法に変更する。

### 2. 未使用コードの解消

- `bun run lint -- --fix` で **未使用 import** の多くは自動削除できます。
- 未使用変数は `_` プレフィックスで「意図的に未使用」と示すか、削除してください。

### 3. TypeScript の厳格化（任意）

`tsconfig.app.json` で以下を有効にすると、型の品質と ESLint の型ベースルールが効きやすくなります。

- `strict: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`

有効化時は、既存コードの型エラーを少しずつ潰していく運用が現実的です。

### 4. パフォーマンス・React の習慣

- **react-hooks/exhaustive-deps** はすでに有効です。依存配列は正確に指定し、不要な再実行を防いでください。
- 重い計算は `useMemo`、コールバックの安定化は `useCallback` を検討（Vercel React Best Practices の `rerender-*` なども参照可）。

---

## Prettier

- 設定は `.prettierrc` のとおり（セミコロンあり、ダブルクォート、100 文字折り返し、末尾カンマ、Tailwind プラグイン）。
- 保存時・コミット前（lint-staged）で `prettier --write` がかかる想定です。
- フォーマットのみ確認する場合は `bun run format:check` を使用してください。

---

## コマンド一覧

```bash
bun run lint          # ESLint（error が 0 でないと失敗）
bun run lint -- --fix # 自動修正可能なものを一括修正
bun run format        # Prettier でフォーマット
bun run format:check  # フォーマットチェックのみ
```

---

## 参考

- [typescript-eslint Configs (strict)](https://typescript-eslint.io/users/configs/#strict)
- [eslint-plugin-unused-imports](https://github.com/sweepline/eslint-plugin-unused-imports)
- プロジェクト内: Vercel React Best Practices（パフォーマンス・バンドル・レンダリングの指針）
