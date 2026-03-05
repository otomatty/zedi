---
agent: "agent"
description: "現在のブランチの変更内容から PR を作成"
argument-hint: "関連イシュー番号（任意）"
---

# Pull Request を作成する

関連情報: $ARGUMENTS

## 手順

1. **変更内容の確認**
   - `git status` で未コミットの変更がないか確認
   - `git log main...HEAD` で全コミットを確認
   - `git diff main...HEAD` で差分を確認

2. **事前チェック**
   - `bun run lint` を実行
   - `bun run test:run` でテスト実行
   - エラーがあれば修正してコミット

3. **PR の作成**
   - `.github/PULL_REQUEST_TEMPLATE.md` のテンプレートに従う
   - タイトルは変更内容を端的に表す日本語
   - 関連 Issue があれば `Closes #番号` で紐付け
   - `gh pr create` で作成
