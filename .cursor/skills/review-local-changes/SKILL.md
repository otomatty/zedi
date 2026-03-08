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

## 実行計画

```text
Phase 0 — レビュー対象の確認（AskQuestion 1回）
  └─ committed + staged + unstaged / committed のみ / staged のみ

Phase 1 — 対象特定（直列・Shell 1回）
  └─ ベースブランチ決定 → 変更ファイル一覧+統計 → スケール判定

Phase 2 — 情報収集（すべて並列、同一メッセージ内でツール発行）
  ├─ A: 差分取得 ─────────── Shell 1回（git diff -U2）
  ├─ B: 静的解析 ─────────── ReadLints + Shell（tsc, フィルタ済み）
  ├─ C: テスト検索 ─────────── Glob 1回（OR パターン）
  ├─ D: 呼び出し元検索 ───── Grep 1回（OR パターン）
  └─ E: 危険コード検出 ───── Grep 2回（セキュリティ / コード品質）

Phase 3 — 分析・レポート・事後アクション（直列）
```

### コンテキスト節約の原則

- **`--stat` で概要を先に取得** → 詳細差分は優先ファイルのみ読む
- **`-U2`** でコンテキスト行をデフォルト 3→2 に縮小
- **Shell より Cursor ツール優先**: Grep / Glob / ReadLints はキャッシュ・ファイル制限の恩恵あり
- **関連ファイルの全文読み込み禁止**: シグネチャ・該当行のみ
- **`output_mode: "files_with_matches"`** でパス一覧だけ取得し本文を読まない
- **Grep / Glob パターンを OR 結合** してツールコール数を最小化する

---

## Phase 0: レビュー対象の確認

ユーザーが明示していない場合、**AskQuestion ツール** でレビュー範囲を確認する:

| 選択肢                     | 対象                          | git diff コマンド           |
| -------------------------- | ----------------------------- | --------------------------- |
| すべての変更（デフォルト） | committed + staged + unstaged | `git diff $MERGE_BASE`      |
| コミット済みのみ           | committed                     | `git diff $MERGE_BASE HEAD` |
| ステージ済みのみ           | staged                        | `git diff --cached`         |

> ユーザーが「PR の変更をレビューして」等と言った場合は committed のみ、
> 「作業中の変更を見て」等の場合はすべての変更を選択する。
> 意図が明確な場合は AskQuestion をスキップして自動判定してよい。

---

## Phase 1: 対象の特定

### 1-1. ベースブランチの決定

優先順位: **ユーザー指定** → `develop` → `main` → `HEAD~1`

以下のロジックで決定する（シェルスクリプトではなくエージェントのロジックとして実行）:

1. ユーザーがブランチを指定していればそれを使う
2. `git branch --list develop` の結果があれば `develop` を使う
3. `git branch --list main` の結果があれば `main` を使う
4. いずれも存在しなければ `HEAD~1` を使う

```bash
git merge-base <BASE_BRANCH> HEAD
```

> **フォールバック**: `git merge-base` が失敗した場合（shallow clone, orphan branch 等）は
> `<BASE_BRANCH>` をそのまま使う。それも失敗したら `HEAD~1` に切り替える。
> いずれも失敗する場合はユーザーにベースブランチの指定を求めて終了する。

### 1-2. 変更ファイル一覧と統計の取得

**Shell 1 回** で Phase 0 の選択に応じた diff コマンドを実行する:

```bash
echo "=== changed files ==="
git diff --name-only <DIFF_ARGS> | sort -u

echo "=== diff stat ==="
git diff --stat <DIFF_ARGS>

echo "=== commits ==="
git log "$MERGE_BASE..HEAD" --format="%h %s" --reverse 2>/dev/null || echo "(no commits)"
```

`<DIFF_ARGS>` は Phase 0 の選択に基づく（例: `$MERGE_BASE` / `$MERGE_BASE HEAD` / `--cached`）。

差分がない場合はユーザーに報告して終了する。

#### 自動除外対象

取得したファイル一覧から以下をエージェント側で除外する（`grep -v` パイプではなくロジックで判定し、クロスプラットフォーム互換を保つ）。
すべての Phase でレビュー対象外:

- ロックファイル: `*.lock`, `bun.lock`, `package-lock.json`, `yarn.lock`
- 生成物: `*.generated.*`, `*.min.js`, `*.min.css`
- ディレクトリ: `dist/`, `build/`, `node_modules/`
- バイナリ・画像ファイル

### 1-3. スケール判定

`--stat` 出力の **変更行数（insertions + deletions）** でファイルを降順ソートし、スケールに応じた戦略を決定する:

| ファイル数 | 差分の読み方                         | 関連ファイル                            |
| ---------- | ------------------------------------ | --------------------------------------- |
| 1〜5       | 全ファイルの差分（`-U2`）            | 該当箇所を Read（最大 10 件）           |
| 6〜15      | 全ファイルの差分（`-U2`）            | export シグネチャ周辺のみ（最大 10 件） |
| 16+        | 変更行数上位 10 ファイルのみ差分取得 | スキップ（ファイル名のみレポート記載）  |

**例外**: セキュリティ関連ファイル（認証・API ルート・ミドルウェア等）は変更行数に関わらず優先的にレビュー対象に含める。

---

## Phase 2: 情報収集（すべて並列実行）

以下の A〜E を **同一メッセージ内でツール呼び出しを並列発行** する。

### A: 差分取得（Shell 1 回）

Phase 0 の選択に応じた **1 つの git diff コマンド** で全差分を取得する:

```bash
git diff -U2 <DIFF_ARGS>
```

- 16+ ファイルの場合は Phase 1 の stat で選定した上位 10 ファイルに `-- <files>` で限定
- `-U2` でコンテキスト行を縮小しトークン消費を削減

### B: 静的解析

**B-1. ReadLints ツール**（Shell 不要・コンテキスト最小）

変更ファイルのパス一覧を ReadLints の `paths` パラメータに渡す。
IDE が保持している lint 診断を即座に取得でき、Shell 実行コストがゼロ。

**B-2. 型チェック**（Shell — `block_until_ms: 60000`）

```bash
bunx tsc --noEmit --pretty 2>&1 | head -80
```

> **変更ファイルフィルタ**: 出力が長い場合でも、Phase 3 の分析では**変更ファイルに関連するエラーのみ**を対象とする。
> 出力に変更ファイル名が含まれないエラーは既存の問題として無視する。
> **タイムアウト**: `block_until_ms: 60000`（60 秒）を設定する。
> 60 秒以内に完了しない場合はバックグラウンドに移行するため、ターミナルファイルを確認する。
> 120 秒経過しても完了しない場合は pid を使って kill し、型チェックをスキップとしてレポートに記載する。

### C: テストファイル検索（Glob 1 回）

変更ファイルのベース名を OR パターンにまとめて **Glob ツールを 1 回** で呼び出す:

```text
glob_pattern: "**/{basename1,basename2,...}.{test,spec}.{ts,tsx}"
```

> 変更ファイルが `CreatePageDialog.tsx` と `api.ts` の場合:
> `**/{CreatePageDialog,api}.{test,spec}.{ts,tsx}`

`__tests__/` 配下も検索する場合は追加で 1 回:

```text
glob_pattern: "**/__tests__/{basename1,basename2,...}.*"
```

テストが存在しないファイルはレポートに ⚠️ として記載する。

### D: 呼び出し元検索（Grep 1 回）

変更ファイルのモジュール名を OR で結合して **Grep ツールを 1 回** で呼び出す:

```text
pattern: "from ['\"].*/(moduleA|moduleB|moduleC)['\"]"
glob: "*.{ts,tsx}"
output_mode: "files_with_matches"
```

`files_with_matches` によりファイルパスのみ返却され、コンテキスト消費を最小化する。

### E: 危険コード検出（Grep 2 回）

変更ファイルのパスを `path` に直接指定し、以下の **2 つの Grep 呼び出しを並列発行** する:

**E-1. セキュリティ（Critical）**:

```text
pattern: "(password|secret|token|api_key)\\s*[:=]\\s*['\"][^'\"]{8,}"
path: <変更ファイルの共通親ディレクトリ>
glob: "*.{ts,tsx,js,jsx}"
```

**E-2. コード品質（Warning + Info）**:

```text
pattern: "console\\.(log|debug)|(TODO|FIXME|HACK):"
path: <変更ファイルの共通親ディレクトリ>
glob: "*.{ts,tsx,js,jsx}"
```

> `.env` ファイルが変更ファイル一覧に含まれる場合は即 **Critical** として記録する（Grep 不要）。

---

## Phase 3: 分析・レポート・事後アクション

### 3-1. レビュー分析

Phase 2 で収集した情報を以下の観点で分析する。

#### レビュー観点

`AGENTS.md` の「PR レビュー観点」セクション（セキュリティ・パフォーマンス・破壊的変更・エラーハンドリング）を基本とし、以下の自動検出ルールを追加適用する:

| 検出対象                 | 重大度   | 判定基準                                   |
| ------------------------ | -------- | ------------------------------------------ |
| `any` 型の使用           | Critical | diff 内に `: any` / `as any` が存在        |
| lint エラー（ReadLints） | Critical | error レベルの診断                         |
| 型エラー（tsc）          | Critical | 変更ファイルに関連するエラー               |
| ハードコード秘密鍵       | Critical | E-1 の Grep でヒット                       |
| `.env` ファイル変更      | Critical | 変更ファイル一覧に含まれる                 |
| console.log/debug 残存   | Warning  | E-2 の Grep でヒット（変更ファイル内のみ） |
| ファイル行数超過         | Warning  | 変更後のファイルが概ね 300 行超            |
| 関数行数超過             | Warning  | 変更された関数が概ね 150 行超              |
| ネスト深度               | Warning  | 4 段超のネストが diff 内に存在             |
| TODO/FIXME/HACK          | Info     | E-2 の Grep でヒット                       |

> 上記の行数閾値は目安であり、プロジェクトの規模や慣習に応じて柔軟に判断する。

#### 重大度の定義

- **Critical**: マージ前に修正必須。セキュリティ脆弱性、データ損失リスク、`any` 使用、lint/型エラー、ハードコード秘密鍵、`.env` 変更
- **Warning**: 修正を推奨。パフォーマンス問題、行数超過、console.log 残存、可読性低下
- **Info**: 任意の改善提案。命名改善、リファクタリング、テスト追加、TODO/FIXME

### 3-2. レポート出力

`docs/reviews/` に出力する（`.gitignore` に `docs/reviews/` を追加推奨）。

#### ファイル名

`review-<branch-slug>-<YYYYMMDD>.md`

- `branch-slug`: ブランチ名の `/` を `-` に置換（例: `feature/foo` → `feature-foo`）
- 同日に同名ファイルが存在する場合は `-2`, `-3` と連番を付与

#### レポート形式の選択

| 条件                                | 形式       |
| ----------------------------------- | ---------- |
| 変更 5 ファイル以下 & Critical 0 件 | コンパクト |
| それ以外                            | フル       |

レポート生成時に **`.cursor/skills/review-local-changes/template.md` を Read ツールで読み込み**、該当する形式を使用する。再レビュー時の追加セクションもテンプレートに定義されている。

### 3-3. 事後アクション

レポート出力後、**AskQuestion ツール** で以下を確認する:

1. Critical を今すぐ修正する
2. Critical + Warning を修正する
3. すべて修正する（Critical + Warning + Info）
4. 修正不要（レポートのみ）

#### 修正フロー（選択 1〜3 の場合）

1. 指摘ごとに対象ファイルを修正
2. **ReadLints ツール** で修正ファイルの診断を再確認（変更ファイルのみ）
3. `bunx prettier --write <modified-files>` でフォーマット
4. レポートの該当指摘行に「✅ 対応済み」と追記

#### 再レビュー（修正後に再度依頼された場合）

- 前回レポートのファイル名末尾に `-rev2`, `-rev3` を付与
- 冒頭に「前回 Critical/Warning の解消状況」セクションを追加
- 前回レポート以降の差分のみを分析対象とする

---

## クロスプラットフォーム注意事項

- シェルコマンドは **git bash / bash** を前提とするが、`sed` 等の POSIX 専用コマンドへの依存を避ける
- ファイルパスのフィルタリング（除外対象の判定等）は **エージェント側のロジック** で行い、`grep -v` パイプに頼らない
- パス区切りは git の出力（常に `/`）をそのまま使い、OS 固有の変換は行わない
