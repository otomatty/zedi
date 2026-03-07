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
   gh pr list --head "$(git branch --show-current)" --json number,url,title,baseRefName --jq '.[0]'
   ```

2. **コメントの取得**
   未返信のトップレベルコメントのみ、最小フィールドで取得する:

   ```bash
   gh api repos/<owner>/<repo>/pulls/<番号>/comments \
     --jq '[.[] | select(.in_reply_to_id == null)] | .[] | {id, path, line, body: (.body | .[0:300]), user: .user.login, created_at}'
   ```

   セッション中に前回の対応時刻がわかっている場合は `since` で絞り込む:

   ```bash
   gh api repos/<owner>/<repo>/pulls/<番号>/comments \
     --method GET -f since="<前回のISO8601タイムスタンプ>" \
     --jq '[.[] | select(.in_reply_to_id == null)] | .[] | {id, path, line, body: (.body | .[0:300]), user: .user.login, created_at}'
   ```

3. **結果の表示**
   コメントをテーブル形式で一覧表示する:

   | #   | 投稿者 | ファイル | 行  | 指摘（要約） |
   | --- | ------ | -------- | --- | ------------ |
   | 1   | ...    | ...      | ..  | ...          |
