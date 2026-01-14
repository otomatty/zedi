# GitHub Copilot → Zedi 自動同期

GitHub Copilot Chat での会話を自動的に作業ログとして整理し、Zediにインポートできるようにする仕組みです。

## 概要

この仕組みは [Claude Codeとの会話を自動でObsidianに記録する仕組み](https://zenn.dev/pepabo/articles/ffb79b5279f6ee) を参考にして作成されました。

```
GitHub Copilot Chat (VS Code)
    ↓ (JSONファイルに記録)
~/Library/Application Support/Code/User/workspaceStorage/*/chatSessions/*.json
    ↓ (5秒ごとに監視)
watch-copilot.sh または sync-with-summary.ts
    ↓ (変更検知時に抽出・要約)
~/zedi-copilot-logs/
    ↓ (手動またはAPIでインポート)
Zedi → Turso（クラウド同期）
```

## 🔒 セキュリティについて

**すべての処理はローカルで完結します。外部ネットワークへのデータ送信は一切行いません。**

| スクリプト | ネットワーク | 説明 |
|-----------|-------------|------|
| `watch-copilot.sh` | ❌ 不要 | ファイル監視・Markdown変換のみ |
| `sync-with-summary.ts` | ⚠️ localhost のみ | Ollamaローカルサーバーに接続 |

社内のセキュリティポリシーに準拠した形で使用できます。

---

## 必要条件

### 最小要件（AI要約なし）
- macOS
- VS Code + GitHub Copilot Chat 拡張機能
- jq (`brew install jq`)

### AI要約を使用する場合（推奨）
- [Ollama](https://ollama.ai) + 任意のモデル
- Node.js 18+ または Bun
- ※ 完全ローカル処理、外部APIは使用しません

---

## インストール

```bash
# このディレクトリに移動
cd scripts/copilot-sync

# セットアップスクリプトを実行
./setup.sh install
```

これにより以下が行われます：

1. `~/.zedi/scripts/watch-copilot.sh` にスクリプトをインストール
2. LaunchAgent を設定してバックグラウンドで自動実行
3. `~/zedi-copilot-logs/` に出力ディレクトリを作成

## アンインストール

```bash
./setup.sh uninstall
```

---

## 使い方

### 方法1: シェルスクリプト（AI要約なし）

```bash
# 一度だけ同期（最近60分）
~/.zedi/scripts/watch-copilot.sh sync

# 全セッションを同期
~/.zedi/scripts/watch-copilot.sh sync-all

# 監視モードで実行（バックグラウンド）
~/.zedi/scripts/watch-copilot.sh watch
```

### 方法2: TypeScriptスクリプト（AI要約あり・推奨）

```bash
# Ollamaのセットアップ
brew install ollama
ollama serve
ollama pull qwen2.5:7b  # または他のモデル

# 同期を実行
npx tsx sync-with-summary.ts sync-all

# 監視モードで実行
npx tsx sync-with-summary.ts watch
```

---

## 設定

### 環境変数

| 変数 | デフォルト値 | 説明 |
|------|-------------|------|
| `ZEDI_OUTPUT_DIR` | `~/zedi-copilot-logs` | 出力ディレクトリ |
| `POLL_INTERVAL` | `5` | ファイル監視の間隔（秒） |
| `OLLAMA_ENDPOINT` | `http://localhost:11434` | Ollamaサーバーの URL |
| `OLLAMA_MODEL` | `qwen2.5:7b` | 使用するOllamaモデル |

### カスタマイズ例

```bash
# 別のモデルを使用
OLLAMA_MODEL=llama3.2:latest npx tsx sync-with-summary.ts sync

# 出力先を変更
ZEDI_OUTPUT_DIR=~/Documents/worklogs npx tsx sync-with-summary.ts sync
```

---

## 出力形式

### 生のMarkdown（watch-copilot.sh）

```markdown
# 2025年1月15日 GitHub Copilot との会話

## プロジェクト: my-project

---

### 💬 ユーザー

このファイルを日本語に翻訳してください。

### 🤖 GitHub Copilot

承知しました。ファイルを日本語に翻訳します。

---
```

### 要約済みMarkdown（sync-with-summary.ts）

```markdown
# 作業ログ: 2025年1月15日

## プロジェクト: my-project

**タグ**: [[TypeScript]] [[翻訳]] [[GitHub Copilot]] [[作業ログ]]

## 概要

ファイルの日本語翻訳とCIエラーの修正を行った。

## 重要なポイント

- 国際化対応のためのファイル翻訳を実施
- CIパイプラインのエラーを解消

## 実装内容

- i18nファイルの日本語翻訳
- prettierの設定修正

## TODO

- [ ] 残りのファイルの翻訳
- [ ] ドキュメントの更新
```

---

## Zediへのインポート

### 方法1: 手動コピー＆ペースト

1. `~/zedi-copilot-logs/summary/` からMarkdownファイルを開く
2. Zediで新規ページを作成
3. 内容をコピー＆ペースト

### 方法2: Tiptap JSONを使用

`sync-with-summary.ts` は `.json` ファイルも生成します。これはZediのエディタ形式（Tiptap）に対応しており、将来的にAPIインポートが可能です。

---

## PCスペックに応じたモデル選択

| カテゴリ | モデル | RAM | 特徴 |
|---------|--------|-----|------|
| 軽量 | `llama3.2:3b` | 4-6GB | 高速、基本的な要約 |
| 軽量 | `qwen2.5:3b` | 4-6GB | 日本語対応良好 |
| バランス | `qwen2.5:7b` | 8-16GB | **推奨**、日本語性能高い |
| バランス | `gemma2:9b` | 8-16GB | 高品質な出力 |
| 高性能 | `qwen2.5:32b` | 24-32GB | 詳細な要約 |
| 高性能 | `llama3.3:70b` | 48-64GB | 最高性能 |

```bash
# モデルのダウンロード例
ollama pull qwen2.5:7b
```

---

## トラブルシューティング

### サービスが動作しているか確認

```bash
launchctl list | grep copilot-sync
```

### ログを確認

```bash
# 標準出力
tail -f /tmp/zedi-copilot-sync.log

# エラー出力
tail -f /tmp/zedi-copilot-sync-error.log
```

### サービスを再起動

```bash
launchctl unload ~/Library/LaunchAgents/com.zedi.copilot-sync.plist
launchctl load ~/Library/LaunchAgents/com.zedi.copilot-sync.plist
```

### Ollamaの確認

```bash
# サーバーが起動しているか
curl http://localhost:11434/api/version

# インストール済みモデル一覧
ollama list
```

### セッションファイルが見つからない

```bash
# セッションファイルの確認
find ~/Library/Application\ Support/Code/User/workspaceStorage \
  -name "*.json" -path "*/chatSessions/*"
```

---

## スクリプト一覧

| スクリプト | 用途 | AI必要 |
|-----------|------|--------|
| `watch-copilot.sh` | 会話ログの収集・Markdown変換 | ❌ |
| `sync-with-summary.ts` | AI要約付き同期（推奨） | ✅ |
| `setup.sh` | インストール/アンインストール | ❌ |

---

## ライセンス

MIT License - Zediプロジェクトと同じライセンスです。

## 参考

- [Claude Codeとの会話を自動でObsidianに記録する仕組みを作った](https://zenn.dev/pepabo/articles/ffb79b5279f6ee)
- [Ollama](https://ollama.ai)