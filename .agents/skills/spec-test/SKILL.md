---
name: spec-test
description: >
  仕様駆動でテストを設計・実装し、Mutation またはアサーション強度レビューで検出力まで担保するパイプライン。
  実装コードを読まずに仕様だけからテストを書き、写し絵テストを防ぐ。未導入プロジェクトでは先に test-inventory を実行。
  Spec-driven test pipeline — spec extraction, blind test design, mutation or assertion review.
  Use for adding tests to existing code or TDD. Args - target path or feature; optional project-profile
  from test-inventory (e.g. /spec-test src/lib/foo.ts).
---

# spec-test — 仕様駆動テスト作成パイプライン

実装を知らないエージェントに仕様だけを渡してテストを書かせることで、
「実装に合わせて期待値を調整したテスト」（バグを仕様として固定化するテスト）を構造的に防ぐ。

## 前提 — 未導入プロジェクト

テスト基盤が無い・バックログが無い場合は **先に `test-inventory` を実行**する。
inventory の `project-profile` と `test-backlog` の P0 を本スキルに引き継ぐ。

## 構成エージェント

| エージェント        | プロンプト                                                             | 役割             | 実装コード   |
| ------------------- | ---------------------------------------------------------------------- | ---------------- | ------------ |
| `spec-extractor`    | [../../agents/spec-extractor.md](../../agents/spec-extractor.md)       | 仕様のみ抽出     | 読み取りのみ |
| `test-designer`     | [../../agents/test-designer.md](../../agents/test-designer.md)         | テスト設計・実装 | **禁止**     |
| `mutation-verifier` | [../../agents/mutation-verifier.md](../../agents/mutation-verifier.md) | 検出力検証       | 読み取りのみ |

Agent ツール / Task 起動時は、上記 md の全文を system 相当の指示として渡す。

## 絶対原則

1. **test-designer に実装コードを渡さない。** 仕様書・テスト規約・観点リファレンス・project-profile のみ。
   オーケストレーターも Phase 1〜3 の間は対象実装ファイルを読まない。
2. **テストが落ちても、実装に合わせて期待値を書き換えない。** 乖離は Phase 3 でトリアージ（潜在バグ候補）。
3. 観点の正: [references/test-perspectives.md](references/test-perspectives.md)。overlay があれば併用。

## ワークフロー

### Phase 0: 準備（オーケストレーター）

1. **対象とモード**
   - 実装あり → **導入モード**
   - 要件のみ（Issue 等）→ **TDD モード**
2. **project-profile を確定**（優先順）:
   - 引数 / チャットで渡された `test-inventory` 出力
   - 無ければ [../test-inventory/references/project-detection.md](../test-inventory/references/project-detection.md) で短縮検出
   - overlay: profile の `overlay` が set なら [references/overlays/](references/overlays/) 配下の `<name>.md` をマージ
3. **テスト規約**（実装本体は読まない）:
   - `test_run_command`, `coverage_command`, `test_layout`, `setup_files`
   - `example_test_paths` が空 → [references/bootstrap/](references/bootstrap/) の runner テンプレ + 「初回テストで規約確立」
   - `bootstrap_needed: true` → テンプレ提案後 **ユーザー承認** を得てから Phase 1 へ
4. **配置先**: profile + overlay の `test_placement` 規則。無ければ layout から推定（colocated → `<name>.test.<ext>`）。
5. **verification_level** を profile から読む（A / B / C）。Phase 4 で使用。

### Phase 1: 仕様抽出（spec-extractor）

[../../agents/spec-extractor.md](../../agents/spec-extractor.md) を起動。

- 導入モード: 対象ファイルパス
- TDD モード: 要件テキスト

`OPEN QUESTION` → ユーザー確認 or 未確定のまま（test-designer は該当項目をテストしない）。

### Phase 2: テスト設計・実装（test-designer）

[../../agents/test-designer.md](../../agents/test-designer.md) を起動。渡すもの:

- 仕様書全文
- `references/test-perspectives.md`（+ overlay があれば）
- project-profile の規約フィールド
- `example_test_paths`, setup, 配置先, `test_run_command`
- **読み取り禁止パス**（対象実装 + 同モジュール実装群）

成果物: ケース表 + テストファイル + `test_run_command <path>` の実行結果。

### Phase 3: トリアージ（オーケストレーター）

- 全 pass → Phase 4
- fail → `spec-extractor` に再確認:
  - 仕様書の誤り → 仕様修正 → test-designer が該当テストのみ更新
  - 実装バグの疑い → ユーザー報告。テストは仕様通り維持
- TDD モード: red が正常 → オーケストレーターが実装 → green → Phase 4

### Phase 4: 検出力検証

`verification_level` に応じて [../../agents/mutation-verifier.md](../../agents/mutation-verifier.md) を起動。

| Level | 条件                         | 目標                                                                 |
| ----- | ---------------------------- | -------------------------------------------------------------------- |
| **A** | Stryker + `mutation_command` | スコア ≥ `mutation_threshold_high`（デフォルト 85）                  |
| **B** | coverage のみ                | 対象ファイル行カバレッジ ≥ 80% + §5 弱アサーションなし               |
| **C** | runner のみ                  | `test-perspectives.md` §4–§5 チェックリスト全項目 + 意図的 fail 確認 |

不足観点 → test-designer に観点リストのみ渡して強化。**最大 2 ループ**。

### Phase 5: 報告

- テストファイル、ケース数（観点別）
- カバレッジ前後（取得可能なら）
- Mutation スコア or Level B/C レビュー結果
- 仕様と実装の乖離、OPEN QUESTION
- **test-backlog がある場合**: 次の P0/P1 項目と `spec-test` 再実行の提案

## プロジェクト overlay

リポジトリ固有の規約は `references/overlays/<name>.md` に置く。
Zedi 利用時: [references/overlays/zedi.md](references/overlays/zedi.md) を profile の `overlay: zedi` で読み込む。

## 注意事項

- 1 実行 = 1 ファイル〜 1 モジュール。大きな dir は inventory で分割してから順次実行。
- 外部 DB/API はモック境界でテスト（実結合は profile / overlay が明示しない限り書かない）。
- リポジトリの TDD 方針（例: AGENTS.md）があれば新規実装前に TDD モードを優先。
