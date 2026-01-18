#!/bin/bash

# developブランチのセットアップスクリプト
# このスクリプトは、mainブランチからdevelopブランチを作成し、リモートにプッシュします

set -e

echo "🚀 developブランチのセットアップを開始します..."

# 現在のブランチを確認
CURRENT_BRANCH=$(git branch --show-current)
echo "現在のブランチ: $CURRENT_BRANCH"

# mainブランチに切り替え
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "📦 mainブランチに切り替えます..."
  git checkout main
fi

# 最新の状態を取得
echo "📥 最新の状態を取得します..."
git pull origin main

# developブランチが既に存在するか確認
if git show-ref --verify --quiet refs/heads/develop; then
  echo "⚠️  developブランチは既に存在します。"
  read -p "上書きしますか？ (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ セットアップをキャンセルしました。"
    exit 1
  fi
  git branch -D develop
fi

# developブランチを作成
echo "🌿 developブランチを作成します..."
git checkout -b develop

# リモートにプッシュ
echo "📤 リモートにプッシュします..."
git push -u origin develop

echo "✅ developブランチのセットアップが完了しました！"
echo ""
echo "次のステップ:"
echo "1. GitHubでdevelopブランチの保護ルールを設定してください"
echo "   詳細: docs/guides/setup-develop-branch.md"
echo "2. チームメンバーに通知してください"
echo ""
echo "現在のブランチ: develop"
