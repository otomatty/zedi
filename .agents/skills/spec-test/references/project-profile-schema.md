# project-profile スキーマ

`test-inventory` が出力し、`spec-test` Phase 0 が消費するフィールド定義。
[../../test-inventory/references/project-detection.md](../../test-inventory/references/project-detection.md) §9 と同期。

## 必須フィールド

| フィールド           | 型          | 説明                                                |
| -------------------- | ----------- | --------------------------------------------------- |
| `repo_root`          | string      | リポジトリルート（`.` 可）                          |
| `scope`              | string      | 分析・テスト対象のパス                              |
| `test_runner`        | enum        | vitest / jest / mocha / pytest / go / cargo / other |
| `test_run_command`   | string      | 単体テスト実行（`<path>` プレースホルダ可）         |
| `test_layout`        | enum        | colocated / `__tests__` / tests / mixed / unknown   |
| `bootstrap_needed`   | boolean     | 基盤セットアップ要否                                |
| `verification_level` | A \| B \| C | Phase 4 のモード                                    |

## 推奨フィールド

| フィールド                | 型             | 説明                                       |
| ------------------------- | -------------- | ------------------------------------------ |
| `package_manager`         | string         | bun / npm / pnpm / yarn / pip / cargo / go |
| `coverage_command`        | string         | カバレッジ取得                             |
| `setup_files`             | string[]       | vitest.setup.ts 等                         |
| `example_test_paths`      | string[]       | 規約見本（0 件可）                         |
| `mutation`                | string         | stryker / mutmut / none                    |
| `mutation_command`        | string         | Level A 用                                 |
| `mutation_threshold_high` | number         | デフォルト 85                              |
| `e2e_runner`              | string         | playwright / cypress / none                |
| `overlay`                 | string \| null | overlays ファイル名（拡張子なし）          |
| `open_questions`          | string[]       | 未確定事項                                 |

## overlay マージ

1. 短縮検出で profile 生成
2. `overlay` が set なら `references/overlays/<overlay>.md` のコマンド・test_placement で**未設定フィールドのみ**上書き
3. 衝突時は overlay 優先（リポジトリ明示規約）

## spec-test 引数例

```
/spec-test src/lib/validateEmail.ts
# profile をチャットに貼り付けたうえで:
/spec-test server/api/src/services/foo.ts
```

profile 無し + 未知リポジトリ → Phase 0 で短縮検出を実行し、不確実ならユーザーに確認。
