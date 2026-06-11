---
name: spec-test
description: 仕様駆動でテストを設計・実装し、Mutation テストで検出力まで担保するパイプライン。実装コードを読まずに仕様だけからテストを書くことで、実装の写し絵テストを防ぐ。既存コードへのテスト導入（カバレッジ改善）と新規開発の TDD の両方に使う。Spec-driven test creation pipeline - extracts a spec from code, designs tests without reading the implementation, then verifies test strength with mutation testing. Use for adding tests to existing code or test-first development. Args - target file/directory or feature description (e.g. /spec-test server/api/src/services/aiTitleExtractor.ts)
---

# spec-test — 仕様駆動テスト作成パイプライン

実装を知らないエージェントに仕様だけを渡してテストを書かせることで、
「実装に合わせて期待値を調整したテスト」（バグを仕様として固定化するテスト）を構造的に防ぐ。

## 構成エージェント

| エージェント | 役割 | 実装コードへのアクセス |
| --- | --- | --- |
| `spec-extractor` | 実装を読み、**仕様のみ**を抽出して返す | 読み取りのみ |
| `test-designer` | 仕様と観点リファレンスからテストを設計・実装する | **禁止** |
| `mutation-verifier` | Mutation テストでテストの検出力を検証し、不足観点を報告する | 読み取りのみ |

## 絶対原則

1. **test-designer に実装コードを渡さない。** プロンプトに含めてよいのは仕様書・テスト規約・観点リファレンスのみ。
   オーケストレーター（メインエージェント）自身も Phase 1〜3 の間は対象実装ファイルを読まない（バイアス混入を防ぐ）。
2. **テストが落ちても、実装に合わせて期待値を書き換えない。** 仕様と実装の乖離として Phase 3 でトリアージする。
   乖離は本パイプラインの成果物（潜在バグの発見）であり、失敗ではない。
3. テスト観点は [references/test-perspectives.md](references/test-perspectives.md) を正とする。各エージェントにこのパスを伝える。

## ワークフロー

### Phase 0: 準備（オーケストレーター）

1. 引数から対象とモードを決める:
   - 対象の実装が存在する → **導入モード**（既存コードへのテスト追加）
   - 実装がまだ無い（Issue・要件記述のみ）→ **TDD モード**
2. 対象のワークスペースを特定し、以下を控える（実装ファイルの中身は読まない）:
   - テスト実行コマンド（下の早見表）
   - テスト規約の見本: 対象に最も近い既存テストファイル 1〜2 個のパス、setup ファイルのパス
3. テストファイルの配置先を決める（既存の慣習に従う。例: `server/api` は `src/__tests__/` 配下、フロントは実装と同階層）。

### Phase 1: 仕様抽出（spec-extractor）

Agent ツールで `spec-extractor` を起動し、対象ファイルパスを渡す。
TDD モードでは実装の代わりに要件テキスト（Issue 本文など）を渡し、テスト可能な仕様書に構造化させる。

- 返ってきた仕様書に `OPEN QUESTION` がある場合: ユーザーに確認するか、確認できない場合は仕様書に未確定と明記したまま進む（test-designer はその項目をテストしない）。

### Phase 2: テスト設計・実装（test-designer）

Agent ツールで `test-designer` を起動。プロンプトに含めるもの:

- 仕様書全文（Phase 1 の出力）
- 観点リファレンスのパス: `.claude/skills/spec-test/references/test-perspectives.md`
- テスト規約情報: 見本テストのパス、setup ファイルのパス、テスト実行コマンド、テストファイルの配置先
- **読み取り禁止パスのリスト**（対象の実装ファイル・同モジュールの実装群）

成果物: ケース表＋テストファイル＋実行結果。

### Phase 3: トリアージ（オーケストレーター）

- 全テスト pass → Phase 4 へ。
- fail がある場合、fail したケースごとに `spec-extractor` へ「この入力に対する実際の振る舞いの再確認」を依頼:
  - **仕様書の誤り**（抽出ミス）→ 仕様書を修正し、差分を test-designer に渡して該当テストのみ更新
  - **実装バグの疑い**（仕様書は要件として妥当だが実装が異なる）→ ユーザーに報告して判断を仰ぐ。
    テストは仕様通りのまま残すのが原則（黙って実装に合わせない）。
- TDD モードでは fail（red）が正常。ここでメインエージェントが実装を書き、green にしてから Phase 4 へ。

### Phase 4: Mutation 検証（mutation-verifier）

Agent ツールで `mutation-verifier` を起動し、対象ファイルと作成したテストファイルのパスを渡す。

- 生存ミュータント（または弱いアサーション）が「不足観点」として報告されたら、その観点リストだけを test-designer に渡してテストを強化させる。
- 強化 → 再検証のループは**最大 2 回**。それでも残る生存ミュータントは報告に含めて終了（等価ミュータントの可能性もある）。
- 目標: Mutation スコア 85 以上（`stryker.config.mjs` の thresholds.high）。

### Phase 5: 報告（オーケストレーター）

最終報告に含めるもの:

- 作成したテストファイルと、テストケース数（観点別の内訳）
- 対象ファイルのカバレッジ前後（Phase 0 で取得していなければ後のみでよい）
- Mutation スコア（対象外ワークスペースの場合はアサーション強度レビューの結果）
- **発見した仕様と実装の乖離**（潜在バグ候補）と未解決の OPEN QUESTION

## テスト実行コマンド早見表

| ワークスペース | テスト実行 | カバレッジ |
| --- | --- | --- |
| フロントエンド `src/` | `bunx vitest run <path>` | `bun run test:coverage` |
| `server/api` | `cd server/api && bunx vitest run <path>` | 同左に `--coverage` |
| `server/hocuspocus` / `server/mcp` / `admin` / `packages/*` | `bunx vitest run --config <ws>/vitest.config.ts` | 同左に `--coverage` |
| E2E | `bunx playwright test <spec>` | — |

Mutation テストは `bun run test:mutation:changed`（git 変更ファイルのうち `src/` 配下のみ対象。
スコープ確認は `node scripts/stryker-mutate-changed.mjs --list`）。

## 注意事項

- 本リポジトリは TDD を原則とする（AGENTS.md）。新規実装の依頼を受けたら、実装前にこのスキルの TDD モードを使う。
- DB スキーマや外部 API 仕様に触れる場合も、テストはモック境界で書く（実 DB 結合テストの基盤は現状ない）。
- 1 回の実行対象は 1 ファイル〜 1 モジュール程度に保つ。大きなディレクトリはファイル単位に分割して順に回す。
