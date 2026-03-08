---
name: review-local-changes
description: >
  手元の実装変更を関連コード（テスト・依存先・呼び出し元）も含めて AI レビューし、
  結果をマークダウンファイルに出力する。
  "レビューして", "実装をレビュー", "変更をチェック", "review my changes",
  "self review", "セルフレビュー" などで起動する。
---

# ローカル変更のセルフレビュー

手元の未 push な変更を、関連テスト・依存ファイルも含めて多角的にレビューし、
結果をマークダウンファイルとして出力する。

## Step 0: 対象の特定

ユーザーがベースブランチを指定しない場合は `develop` を使う。
共通祖先（merge-base）を基準にし、**コミット済み＋ステージ済み＋未ステージ**の変更をまとめて対象にする。

```bash
BASE_BRANCH="develop"
CURRENT=$(git branch --show-current)
MERGE_BASE=$(git merge-base ${BASE_BRANCH} HEAD)

# ステージ済み + 未ステージの変更があるか確認
git status --short

# 変更ファイル一覧（merge-base からの差分＝コミット済み＋index＋working tree）
git diff --name-only ${MERGE_BASE}

# コミット一覧（このブランチで追加されたコミット）
git log ${MERGE_BASE}..HEAD --format="%h %s" --reverse
```

差分がない場合はユーザーに報告して終了する。

## Step 1: 関連ファイルの収集

変更ファイルごとに以下の関連ファイルを特定し、読み込む。

### 1a. 変更ファイル本体

```bash
# merge-base から現在（index + working tree）までの差分
git diff ${MERGE_BASE} -- <file>
```

### 1b. 関連テストファイル

変更ファイルに対応するテストを探す:

- `src/foo.ts` → `src/foo.test.ts`, `src/__tests__/foo.test.ts`
- `src/components/Bar.tsx` → `src/components/Bar.test.tsx`
- `server/api/routes/baz.ts` → `server/api/routes/baz.test.ts`
- `src/components/editor/X.tsx` → `e2e/x.spec.ts`（E2E テスト）

テストファイルが変更に含まれていない場合も、既存テストがあれば読み込む。

### 1c. 依存先・呼び出し元

変更ファイルの `import` を解析し、プロジェクト内の依存先を特定する。
また、変更ファイルを `import` している側（呼び出し元）も Grep で検索する:

```bash
# 呼び出し元の検索例
rg "from ['\"].*/<changed-module>['\"]" --type ts --type tsx -l
```

**収集の上限**: 関連ファイルは最大 20 ファイルまでとし、超える場合は変更の影響が
大きいファイルを優先する。

## Step 2: レビュー分析

収集したコードを以下の 5 観点で分析する。

### セキュリティ

- XSS、インジェクション、認証・認可の漏れ
- ユーザー入力のバリデーション不足
- 機密情報のハードコードやログ出力

### パフォーマンス

- 不要な再レンダリング（React コンポーネント）
- N+1 クエリ、重い処理のホットパス配置
- メモ化の欠如、不要な依存配列

### 可読性・保守性

- **ファイル行数**: 250 行超 → Warning（分割を推奨）、400 行超 → Critical
- **関数行数**: 150 行超 → Warning（ESLint `max-lines-per-function` と一致）
- **循環的複雑度**: 20 超 → Warning（ESLint `complexity` と一致）
- **ネスト深度**: 4 超 → Warning（ESLint `max-depth` と一致）
- 命名の明瞭さ（変数名、関数名、型名）
- マジックナンバーや意味不明な文字列定数

### アーキテクチャ・設計

- 責務の分離（コンポーネント、hooks、ユーティリティ）
- 公開 API や型の破壊的変更
- エラーハンドリングとログの適切さ

### プロジェクト規約準拠

- TypeScript strict、`any` 不使用
- ESLint / Prettier ルールへの準拠
- 既存のディレクトリ構成・命名規則との一貫性
- 日本語・英語のコメントがプロジェクトのトーンに合っているか

### 推奨分割パターン（コード量が多いファイル向け）

ファイルが 250 行超や関数が 150 行超の場合、以下のパターンで切り分けを推奨する（`src/components/editor/TiptapEditor/` の分割実績に準拠）。

- **Hooks** (`use*.ts`): ロジックの責務ごとに 1 ファイル 1 hook
- **Components** (`*.tsx`): 1 ファイル 1 UI 責務（ダイアログ、メニュー、レイヤーなど）
- **Helpers** (`*Helpers.ts`): hook から切り出した純粋ロジック（テスト容易性向上）
- **Types** (`types.ts`): 共有型定義を集約
- **Config/Data** (`*Config.ts`, `*Items.ts`): 定数・設定オブジェクト

## Step 3: レビューレポート出力

レビュー結果を `docs/reviews/` に以下の形式で出力する。

**ファイル名**: `review-<branch-slug>-<YYYYMMDD-num>.md`

- **branch-slug**: ブランチ名をファイル名に使う場合は、`/` などパス区切りやファイルシステムで問題になる文字を置換した slug にする（例: `/` → `-`）。例: `feature/wiki-link-create-dialog-and-tests` → `feature-wiki-link-create-dialog-and-tests`

### レポートテンプレート

```markdown
# セルフレビュー: <ブランチ名>

**日時**: YYYY-MM-DD HH:MM
**ベース**: <base-branch>
**変更ファイル数**: N files
**関連ファイル数**: M files

## サマリー

変更の全体像を 2-3 文で説明。

## ファイルサイズ

| ファイル               | 行数 | 判定                           |
| ---------------------- | ---- | ------------------------------ |
| src/components/Foo.tsx | 312  | Warning: 250行超（分割を推奨） |
| src/hooks/useBar.ts    | 142  | OK                             |

## 指摘事項

### 🔴 Critical（マージ前に修正必須）

| #   | ファイル | 行  | 観点 | 指摘内容 | 推奨修正 |
| --- | -------- | --- | ---- | -------- | -------- |
| 1   | ...      | ... | ...  | ...      | ...      |

### 🟡 Warning（修正を推奨）

| #   | ファイル | 行  | 観点 | 指摘内容 | 推奨修正 |
| --- | -------- | --- | ---- | -------- | -------- |
| 1   | ...      | ... | ...  | ...      | ...      |

### 🟢 Info（任意の改善提案）

| #   | ファイル | 行  | 観点 | 指摘内容 | 推奨修正 |
| --- | -------- | --- | ---- | -------- | -------- |
| 1   | ...      | ... | ...  | ...      | ...      |

## テストカバレッジ

| 変更ファイル | テストファイル  | 状態              |
| ------------ | --------------- | ----------------- |
| src/foo.ts   | src/foo.test.ts | ✅ 既存テストあり |
| src/bar.ts   | -               | ⚠️ テスト未作成   |

## Lint / Format チェック

`bun run lint` と `bun run format:check` の結果を記載。

## 統計

- Critical: N 件
- Warning: N 件
- Info: N 件
```

## Step 4: 事後アクション

レポート出力後、ユーザーに以下を確認する:

1. Critical の指摘を今すぐ修正するか
2. Warning の指摘も併せて修正するか

修正する場合は、対象ファイルを修正し `bun run lint` で確認する。

## 判断基準

| 状況                       | アクション                                         |
| -------------------------- | -------------------------------------------------- |
| 差分なし                   | ユーザーに報告して終了                             |
| 関連ファイルが 20 を超える | 影響の大きいものを優先、残りはスキップと報告       |
| テストファイルが存在しない | ⚠️ としてレポートに記載                            |
| lint / format エラーあり   | Critical として報告                                |
| `any` 型の使用             | Critical として報告                                |
| ファイルが 250 行超        | Warning として分割推奨を報告（推奨パターンを提示） |
| ファイルが 400 行超        | Critical として報告                                |
| 関数が 150 行超            | Warning として報告（ESLint ルールと同等）          |
| 指摘が 0 件                | 「指摘なし」のレポートを生成                       |
