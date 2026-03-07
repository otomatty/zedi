---
agent: "agent"
description: "PR に再レビューを依頼するコメントを投稿する"
argument-hint: "PR URL、番号、または空欄（ブランチから自動検出）"
---

# PR 再レビュー依頼

対象 PR: $ARGUMENTS

## 手順

1. **PR の特定**
   引数が空の場合、ブランチから自動検出する:

   ```bash
   gh pr list --head "$(git branch --show-current)" --json number,url --jq '.[0]'
   ```

2. **最新コミットの確認**

   ```bash
   git log --oneline -1
   ```

3. **再レビュー依頼の投稿**

   ```bash
   gh pr comment <番号> --body "レビューコメントへの対応をコミットしました（<SHA>）。最新の変更に対する再レビューをお願いします。

   @coderabbitai review
   ```
