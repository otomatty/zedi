---
name: handle-pr-review
description: >
  PR レビューコメントの取得・分析・修正・返信・再レビュー依頼をワンストップで行う。
  "レビュー対応して", "PRコメントに対応", "review PR comments",
  "レビューコメントを確認", "PRのレビューを処理" などで起動する。
---

# PR レビュー対応

PR のレビューコメントを取得し、分析・修正・返信・再レビュー依頼まで一気通貫で行う。

## Step 0: PR の特定

ユーザーが PR URL や番号を指定していない場合、ブランチから自動検出する:

```bash
gh pr list --head "$(git branch --show-current)" --json number,url,title --jq '.[0]'
```

セッション中に既に PR を扱っている場合は、その情報を再利用する。

## Step 1: 未返信コメントの取得

**返信済みのコメントを除外し、未返信のトップレベルコメントを取得する。**
新規チャットでも前回のコンテキスト不要で正しく動作する。

**注意**: この方式は「未返信」を対象とする。GitHub の `Require conversation resolution before merging` は「未解決のスレッド」をブロックするため、返信済みだが未解決のスレッドは検出されない。マージ可否の完全な判定には `gh pr view --json mergeable,reviewDecision` の確認を併用すること。コメントが 30 件超の場合は `?per_page=100` や `--paginate` でページネーションを指定すること。

```bash
gh api repos/{owner}/{repo}/pulls/{number}/comments \
  --jq '
    [.[] | select(.in_reply_to_id != null) | .in_reply_to_id] as $replied |
    [.[] | select(.in_reply_to_id == null and (.id | IN($replied[]) | not))]
    | .[] | {id, path, line, body: (.body | .[0:300]), user: .user.login, created_at}'
```

### フィルタリングの仕組み

1. 全コメントから「返信コメント」の `in_reply_to_id` を収集 → `$replied`
2. トップレベルコメント（`in_reply_to_id == null`）のうち、`$replied` に含まれないもの = 未返信
3. 「未返信」≠「未解決」。返信済みだがスレッドが未解決の場合はこの方式では検出されない
4. `body` は先頭 300 文字に切り詰め、全文が必要なら個別に読む
5. bot の自動コメント（coderabbitai の summary 等）は分析対象外

## Step 2: コメント分析

各コメントを以下の 2 択で判断する:

**対応する:**

- バグ・論理エラーの正しい指摘
- セキュリティリスク
- 型安全性・エラーハンドリングの不備
- プロジェクト規約への違反

**対応しない:**

- 技術的に誤った指摘
- 現実装で問題がない
- ESLint 等の制約で採用不可
- PR スコープ外の改善提案

分析結果をサマリーテーブルで報告する:

| #   | ファイル | 指摘 | 判断        | 理由 |
| --- | -------- | ---- | ----------- | ---- |
| 1   | ...      | ...  | 対応 / 不要 | ...  |

**ユーザーの承認を得てから Step 3 に進む。**

## Step 3: 修正の実装

承認されたコメントに対して修正を行う:

1. 対象ファイルを読み、指摘箇所を確認
2. 修正を実装
3. `bun run lint` でエラーがないか確認
4. 全修正をまとめて 1 コミット:
   ```text
   fix: address PR #{number} review comments
   ```

## Step 4: 返信の投稿

各コメントに対して返信を作成し、投稿前にテーブルで一覧表示する:

| #   | コメント要約 | 対応        | 返信内容 |
| --- | ------------ | ----------- | -------- |
| 1   | ...          | 修正 / 不要 | ...      |

**ユーザーが承認するまで投稿しない。**

承認後、replies エンドポイントで投稿:

```bash
gh api -X POST repos/{owner}/{repo}/pulls/{number}/comments/{comment_id}/replies \
  -f body="返信内容"
```

## Step 5: 再レビュー依頼

修正コミットを push し、再レビューを依頼する。

### 対象 PR が develop → main（リリース PR）の場合

**develop に直接 push できない場合は、作業ブランチを作成し develop 向け PR を出す。**

1. 修正をコミットした状態で、main や develop とは別の作業ブランチを作成する:
   ```bash
   git checkout -b fix/pr-{number}-review-comment
   ```
2. そのブランチを push し、**develop** をベースに PR を作成する:
   ```bash
   git push -u origin fix/pr-{number}-review-comment
   gh pr create --base develop --head fix/pr-{number}-review-comment --title "fix: address PR #{number} review comments" --body "..."
   ```
3. 元のリリース PR（#311 など）には「レビュー対応は別 PR で develop に出す予定です」などとコメントし、必要ならその PR の再レビュー依頼は develop にマージ後に行う。

### 通常（feature ブランチなど）の場合

```bash
git push origin HEAD

gh pr comment {number} --body "レビューコメントへの対応をコミットしました（{SHA}）。最新の変更に対する再レビューをお願いします。

@coderabbitai review
@devin
@claude"
```

## セッション内コンテキスト再利用

- PR 番号・owner/repo は一度特定したら再取得しない
- 未対応コメントの判別は「返信済み除外」方式のため、新規チャットでも正しく動作する
- セッション中に `since` を併用すれば、さらに API レスポンスを削減できる
