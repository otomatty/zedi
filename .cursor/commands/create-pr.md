---
agent: "agent"
description: "develop から新規ブランチを作成し、PR まで一括で実行"
argument-hint: "ブランチ名（例: feature/add-login）またはイシュー番号（例: 123 → feature/123）"
---

# Pull Request を作成する

関連情報: $ARGUMENTS

## 手順

1. **develop ブランチの準備**
   - `git status` で現在の状態を確認
   - `git checkout develop` で develop に切り替え（未コミットの変更があればそのまま）
   - `git pull origin develop` で最新を取得

2. **新規ブランチの作成**
   - 引数からブランチ名を決定（イシュー番号のみの場合は `feature/123` 形式）
   - `git checkout -b <ブランチ名>` で develop から新規ブランチを作成

3. **変更内容の確認・コミット**
   - 未コミットの変更があれば適切なコミットメッセージでコミット
   - `git log develop...HEAD` でコミットを確認
   - `git diff develop...HEAD` で差分を確認

4. **事前チェック**
   - `bun run lint` を実行
   - `bun run test:run` でテスト実行
   - エラーがあれば修正してコミット

5. **ブランチのプッシュ**
   - `git push -u origin <ブランチ名>` でリモートにプッシュ

6. **PR の作成**
   - `.github/PULL_REQUEST_TEMPLATE.md` のテンプレートに従う
   - タイトルは変更内容を端的に表す日本語
   - 関連 Issue があれば `Closes #番号` で紐付け
   - `gh pr create --base develop` で develop 向けに PR を作成
