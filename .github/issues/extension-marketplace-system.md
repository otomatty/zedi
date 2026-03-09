# 拡張機能マーケットプレイスシステム

## ラベル

- `enhancement`
- `feature:extensions`
- `priority:high`

## ステータス

- 要件定義中

## 概要

Zedi に拡張機能マーケットプレイスを導入し、ユーザーがブラウザ上でプラグインを検索・インストール・管理できる仕組みを構築する。VSCode の Extension Marketplace や Obsidian の Community Plugins に類似した体験を提供する。

## 動機

現在の Zedi はエディター拡張をコアバンドルとして提供しており、ユーザーが個別に機能を追加・削除する手段がない。日記自動作成機能や GitHub コントリビューション連携など、コアの知識管理機能とは独立した機能が拡張機能として求められている。

## 実装スコープ

### Phase 1: 拡張機能基盤（MVP）

- [ ] Extension Manager の実装（フロントエンド）
- [ ] Extension Runtime の実装（ローカル実行環境）
- [ ] ファーストパーティ拡張のハードコード登録
- [ ] 設定画面への「拡張機能」タブ追加
- [ ] インストール/アンインストール UI
- [ ] Extension API の定義（pages, notes, editor, ui, scheduler, storage）
- [ ] 権限システムの実装

### Phase 2: サーバーサイド拡張カタログ

- [ ] データベーススキーマ追加（extensions, extension_versions, user_extensions）
- [ ] Extension Catalog API の実装
- [ ] マーケットプレイス UI（検索・フィルター）
- [ ] 拡張機能のバージョン管理

### Phase 3: サードパーティ対応

- [ ] Extension SDK（開発者向け）
- [ ] サンドボックス実行環境
- [ ] レビュー・承認プロセス
- [ ] 拡張機能の公開フロー

## 仕様書

- [拡張機能マーケットプレイスシステム仕様書](../../docs/specs/extension-marketplace-spec.md)

## 子 Issue

- 日記自動作成拡張機能
- GitHub コントリビューションコンポーネント拡張機能
