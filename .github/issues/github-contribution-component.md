# GitHub コントリビューションコンポーネント拡張機能

## ラベル

- `enhancement`
- `feature:extensions`
- `feature:github-integration`
- `priority:high`

## ステータス

- 要件定義中

## 概要

Zedi のエディター拡張として GitHub コントリビューションコンポーネントを提供する。ユーザーの GitHub アカウントから活動データ（コミット数、プッシュ数、PR 数等）を取得し、エディター内にインタラクティブなコンポーネントとして埋め込む。`/github` スラッシュコマンドで挿入する。

## 動機

日記やワークログに GitHub の活動状況を記録する際、手動でデータを入力するのは非効率。GitHub API から自動的にデータを取得してエディターに表示できれば、開発者の日常的なログ記録を大幅に効率化できる。

## 主要機能

- [ ] コントリビューショングラフ（草ヒートマップ）表示
- [ ] 今日のコントリビューション統計カード
- [ ] リポジトリ別コントリビューション統計
- [ ] `/github` スラッシュコマンドでのコンポーネント挿入
- [ ] GitHub アカウント連携（Personal Access Token）
- [ ] データキャッシュ（IndexedDB）
- [ ] テーマ対応（ライト/ダーク）
- [ ] レスポンシブ対応

## 実装フェーズ

### Phase 1（MVP）: コントリビューショングラフ

- [ ] Tiptap カスタムノード（`githubContribution`）定義
- [ ] React Node View（コントリビューショングラフ）
- [ ] `/github` スラッシュコマンド
- [ ] GitHub GraphQL API 連携（contributionCalendar）
- [ ] GitHub PAT 設定 UI
- [ ] データキャッシュ（IndexedDB、TTL: 30 分）
- [ ] テーマ対応（ライト/ダーク）
- [ ] `contentUtils.ts` の `SUPPORTED_NODE_TYPES` 更新

### Phase 2: 統計カード + サーバーサイドプロキシ

- [ ] 今日の統計カードコンポーネント
- [ ] リポジトリ別統計コンポーネント
- [ ] サーバーサイド GitHub API プロキシ
- [ ] サーバーキャッシュ

### Phase 3: OAuth + スナップショット

- [ ] GitHub OAuth App 認証
- [ ] データスナップショット保存（変化追跡）
- [ ] コンポーネント印刷/エクスポート対応

### Phase 4: マルチプラットフォーム対応（オプション）

- [ ] GitLab 連携
- [ ] Bitbucket 連携

## 技術ポイント

- **Tiptap Node View**: `atom: true`（ブロック要素）、React で描画、ドラッグ可能
- **GitHub GraphQL API**: `contributionsCollection` でコントリビューションデータを一括取得
- **キャッシュ**: ノード属性にデータを埋め込まず、キャッシュレイヤーに分離（ページ JSON 肥大化防止）
- **セキュリティ**: PAT はローカル（IndexedDB）に保存、ページ JSON には含めない

## 仕様書

- [GitHub コントリビューションコンポーネント仕様書](../../docs/specs/github-contribution-component-spec.md)

## 親 Issue

- 拡張機能マーケットプレイスシステム
