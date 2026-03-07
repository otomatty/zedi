---
agent: "agent"
description: "PR の新規レビューコメントだけを取得・表示する"
argument-hint: "PR URL、番号、または空欄（ブランチから自動検出）"
---

# PR レビューコメントの取得

対象 PR: $ARGUMENTS

## 手順

1. **PR の特定**
   引数が空の場合、ブランチから自動検出する:

   ```bash
   REPO_FULL_NAME="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
   PR_NUMBER="$(gh pr list --head "$(git branch --show-current)" --json number --jq '.[0].number')"

   if [ -n "$ARGUMENTS" ]; then
     PR_NUMBER="$(gh pr view "$ARGUMENTS" --json number --jq '.number')"
   fi
   ```

2. **未対応コメントの取得**
   返信済みコメントを除外し、未対応のものだけを最小フィールドで取得する:

   ```bash
   gh api "repos/$REPO_FULL_NAME/pulls/$PR_NUMBER/comments" \
     --jq '
       [.[] | select(.in_reply_to_id != null) | .in_reply_to_id] as $replied |
       [.[] | select(.in_reply_to_id == null and (.id | IN($replied[]) | not))]
       | .[] | {id, path, line, body: (.body | .[0:300]), user: .user.login, created_at}'
   ```

   新規チャットでも前回のコンテキスト不要で正しく未対応コメントだけが返る。

3. **結果の表示**
   コメントをテーブル形式で一覧表示する:

   | #   | 投稿者 | ファイル | 行  | 指摘（要約） |
   | --- | ------ | -------- | --- | ------------ |
   | 1   | ...    | ...      | ..  | ...          |
