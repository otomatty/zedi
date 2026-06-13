---
name: test-inventory
description: >
  テスト未導入・薄いプロジェクト向けに、テスト基盤の検出・ギャップ分析・優先順位付けバックログを生成する。
  成果物は project-profile と test-backlog。次の spec-test 実行対象を決める入口スキル。
  Analyze untested or lightly tested repos — detect test stack, map gaps, produce prioritized backlog
  for spec-test. Use when starting test adoption, improving coverage strategy, or before /spec-test
  on a new project. Args - repo root or target directory (optional scope, e.g. src/ or server/api/).
---

# test-inventory — テストギャップ分析

**テストは書かない。** プロジェクトを走査し、`project-profile` と `test-backlog` を生成する。
未導入プロジェクトでは **本スキルを先に実行**し、バックログの P0 から `spec-test` を回す。

## 絶対原則

1. **浅い走査に留める。** export 名・パス・import 先・package スクリプト程度。実装の深読みは `spec-extractor` の仕事。
2. **推測は `OPEN QUESTION` と明記。** 不確かな runner や配置規約はユーザー確認候補にする。
3. **レイヤー語彙は** [references/layer-classification.md](references/layer-classification.md) **と** `spec-test/references/test-perspectives.md` §7 **に合わせる。**

## 参照ファイル

| ファイル                                                                 | 用途                                                                              |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [references/project-detection.md](references/project-detection.md)       | runner / coverage / mutation / 配置の検出                                         |
| [references/risk-heuristics.md](references/risk-heuristics.md)           | リスク・容易さスコア                                                              |
| [references/layer-classification.md](references/layer-classification.md) | レイヤー分類                                                                      |
| [references/backlog-template.md](references/backlog-template.md)         | 出力フォーマット                                                                  |
| `../spec-test/references/overlays/<name>.md`                             | プロジェクト固有 overlay（正本: `.agents/skills/spec-test/references/overlays/`） |

## ワークフロー

### Phase 0: スコープ

1. 引数から分析ルートを決める（省略時はリポジトリルート）。
2. `.gitignore` を尊重し、`node_modules` / `dist` / `target` / `.venv` 等は走査しない。
3. プロジェクト overlay を探す: `.agents/skills/spec-test/references/overlays/*.md` およびリポジトリの `AGENTS.md` / `CONTRIBUTING.md` からテスト規約の記述のみ拾う（全文読み込みは不要）。

### Phase 1: テスト基盤検出

[references/project-detection.md](references/project-detection.md) に従い以下を確定または推定:

- `test_runner`（vitest / jest / mocha / pytest / go test / cargo test / その他）
- `package_manager`（npm / yarn / pnpm / bun / pip / cargo / go）
- `test_run_command` / `coverage_command`（package.json scripts 等から）
- `test_layout`（colocated / `__tests__` / `tests/` / mixed / unknown）
- `setup_files`（vitest.setup.ts, jest.setup.js 等）
- `example_test_paths`（0〜3 件。無ければ `none`）
- `mutation`（stryker / mutmut / none）と `mutation_command`（あれば）
- `e2e_runner`（playwright / cypress / none）
- `bootstrap_needed`（runner 未設定 or テスト script 無し → true）

`bootstrap_needed: true` の場合、Phase 5 で [../spec-test/references/bootstrap/](../spec-test/references/bootstrap/) の該当テンプレを提案する。**ユーザー承認なしに config ファイルを作成しない。**

### Phase 2: ソース inventory

スコープ内のソースを列挙（深読みしない）:

- パス、推定レイヤー（layer-classification）、公開 export の有無（grep / AST 浅解析）
- 対応するテストファイルの有無（命名規則: `*.test.*`, `*.spec.*`, `*_test.go`, `test_*.py` 等）
- 外部境界（HTTP / DB / FS / 時計）への import キーワードの有無

### Phase 3: ギャップマップ

- **coverage あり**: 最新レポートから未カバーが大きいファイルを優先候補に（取得不能なら Phase 2 の「テスト無し」で代替）。
- **coverage なし**: テストファイルが無い export 付きモジュールをギャップとして列挙。
- 同一観点の重複テスト（E2E と unit で同じバリデーション）があれば `dedupe_note` に記載。

### Phase 4: スコアリング → バックログ

[references/risk-heuristics.md](references/risk-heuristics.md) で各候補に `risk` / `ease` / `priority`（P0–P3）を付与。

**未導入プロジェクトの P0 ルール（デフォルト）:**

1. 純関数・バリデーション・パーサ（外部 I/O 最小）
2. ドメイン service（モック境界が明確）
3. hooks / コンポーネント（既存 Testing Library がある場合）
4. E2E（クリティカルジャーニー 1 本が unit で通った後）

1 回の inventory でバックログ上限は **20 件**（P0–P1 を厚く、P2–P3 は概要のみ）。

### Phase 5: 成果物出力

[references/backlog-template.md](references/backlog-template.md) の形式で 2 ファイル分の内容を出力（ファイル保存はユーザー指示があれば。通常はチャットに貼る）:

1. **`project-profile`** — `spec-test` Phase 0 がそのまま読める YAML 風ブロック
2. **`test-backlog`** — 優先順位表 + 各項目の `suggested_first_cases`

末尾に **Next steps** を必ず含める:

```
1. bootstrap_needed なら → ユーザー承認後に bootstrap テンプレ適用
2. test-backlog の P0 1 件を選び → spec-test を実行（project-profile を引き継ぐ）
3. P0 完了後 → 同じ backlog の次項目
```

## 注意事項

- inventory だけでは Mutation は実行しない。
- 巨大モノリスはスコープ引数で分割（例: `src/lib/` のみ）。
- overlay があるリポジトリ（例: Zedi）は overlay の配置規約を profile にマージする。
