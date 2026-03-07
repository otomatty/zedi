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

## Step 1: 未対応コメントのみ取得

**返信済みのコメントを除外し、未対応のものだけを最小フィールドで取得する。**
新規チャットでも前回のコンテキスト不要で正しく動作する。

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
3. `body` は先頭 300 文字に切り詰め、全文が必要なら個別に読む
4. bot の自動コメント（coderabbitai の summary 等）は分析対象外

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
   ```
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

修正コミットを push し、再レビューを依頼:

```bash
git push origin HEAD

gh pr comment {number} --body "レビューコメントへの対応をコミットしました（{SHA}）。最新の変更に対する再レビューをお願いします。

@claude /review
@coderabbitai review
@copilot 再レビューをお願いします。"
```

## セッション内コンテキスト再利用

- PR 番号・owner/repo は一度特定したら再取得しない
- 未対応コメントの判別は「返信済み除外」方式のため、新規チャットでも正しく動作する
- セッション中に `since` を併用すれば、さらに API レスポンスを削減できる
