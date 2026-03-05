---
agent: "agent"
description: "GitHub Issue を調査・修正・テスト・PR作成まで行う"
argument-hint: "イシュー番号または .github/issues/ のファイル名"
---

# GitHub Issue を修正する

対象: $ARGUMENTS

## 手順

1. **イシューの確認**
   - `gh issue view` でイシュー内容を取得
   - 再現手順、期待動作、実際の動作を把握する

2. **コードの調査**
   - イシューに記載された関連ファイルを確認
   - 関連するテストファイルがあれば確認
   - 原因の仮説を立てる

3. **修正の実装**
   - 最小限の変更で修正する
   - 既存のコーディングスタイルに従う（TypeScript strict, ESLint ルール準拠）
   - 必要に応じてテストを追加・修正

4. **検証**
   - `bun run lint` で Lint エラーがないことを確認
   - `bun run test:run` で既存テストがパスすることを確認

5. **コミットとPR**
   - Conventional Commits 形式でコミット（例: `fix: ページ再表示時のコンテンツ複製を修正`）
   - `.github/PULL_REQUEST_TEMPLATE.md` に従って PR を作成
