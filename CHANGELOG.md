# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

Zedi の初回リリース（Phase A Web App）。ナレッジをリンクで繋ぎ、AI で足場を生成するノート／ウィキアプリのコア機能を提供します。

### コア体験

- **ページエディタ** — Tiptap ベースのリッチエディタ。Markdown ショートカット、見出し・リスト・コードブロック・画像対応
- **WikiLink** — `[[ページ名]]` による相互リンク、オートコンプリート、Ghost Link（未作成リンクの自動ページ生成）
- **ノート（ノートブック）** — ページのまとまり。公開/非公開、メンバー招待・権限、ノート単位の設定

### AI 機能

- **Wiki Generate** — キーワードから解説と関連リンク付きテキストを生成
- **AI チャット** — ページ文脈を踏まえたチャット、複数プロバイダー（OpenAI / Anthropic / Google）と自前 API キー対応

### 同期・協調・ストレージ

- **リアルタイム同期** — Hocuspocus + Yjs による複数クライアントの同時編集
- **画像ストレージ** — S3 互換・Google Drive・GitHub を選択可能（設定画面で構成）
- **認証** — better-auth によるサインイン（メール・OAuth 等）、オンボーディング・クイックツアー

### その他

- **グローバル検索** — ページ・ノートの全文検索
- **Web クリッピング** — ブラウザ拡張や URL から記事をページとして取り込み（Readability）
- **サブスク・寄付** — Polar による Pro プラン・寄付、一般/AI/ストレージ設定
- **多言語** — 日本語・英語の UI
