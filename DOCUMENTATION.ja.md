> **言語:** [English](DOCUMENTATION.md) | 日本語

# 公開ドキュメント方針

本リポジトリでは、**GitHub 上のユーザー向け入口ドキュメント**を英語（正本）と **日本語完全版**（`.ja.md` ペア）で管理する。これは [SPECIFICATION_POLICY.md](SPECIFICATION_POLICY.md) とは別物である。API 契約や振る舞いの正は **TSDoc/JSDoc とテスト** にあり、Markdown ツリーには書かない。

## 対象

| 英語（デフォルト）                                               | 日本語ペア                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [README.md](README.md)                                           | [README.ja.md](README.ja.md)                                           |
| [CONTRIBUTING.md](CONTRIBUTING.md)                               | [CONTRIBUTING.ja.md](CONTRIBUTING.ja.md)                               |
| [SECURITY.md](SECURITY.md)                                       | [SECURITY.ja.md](SECURITY.ja.md)                                       |
| [DOCUMENTATION.md](DOCUMENTATION.md)                             | [DOCUMENTATION.ja.md](DOCUMENTATION.ja.md)                             |
| [extension/README.md](extension/README.md)                       | [extension/README.ja.md](extension/README.ja.md)                       |
| [server/mcp/README.md](server/mcp/README.md)                     | [server/mcp/README.ja.md](server/mcp/README.ja.md)                     |
| [admin/README.md](admin/README.md)                               | [admin/README.ja.md](admin/README.ja.md)                               |
| [terraform/cloudflare/README.md](terraform/cloudflare/README.md) | [terraform/cloudflare/README.ja.md](terraform/cloudflare/README.ja.md) |

**対象外:** [AGENTS.md](AGENTS.md)、[SPECIFICATION_POLICY.md](SPECIFICATION_POLICY.md)、[CLAUDE.md](CLAUDE.md)、[CHANGELOG.md](CHANGELOG.md)、Git 追跡外のローカル `docs/`。

## 命名規則

- GitHub が自動表示するのは `README.md` など英語ファイル。
- 日本語完全版は同じベース名 + `.ja.md`（例: `README.ja.md`）。

## 言語バナー（必須）

各ファイルの先頭:

**英語:**

```markdown
> **Language:** English | [日本語](README.ja.md)
```

**日本語:**

```markdown
> **言語:** [English](README.md) | 日本語
```

ペアファイルへの相対リンクを使う。サブディレクトリでは同じフォルダ内のペアを指す。

## 更新手順

1. **英語が正本** — 新規・変更は英語を先に書く。
2. **同一 PR** — `.ja.md` ペアも同じ Pull Request で更新する（完全版ペア）。
3. ドキュメントのみの大きな PR では、本文に `Doc parity: EN updated, JA follows in this PR` と記載する。

## 公開ドキュメントに書く内容

- プロジェクト概要、セットアップ、コントリビューション、セキュリティ報告
- 詳細な契約は TSDoc / テストを参照する旨の誘導

## 書かない内容

- モジュールの受入条件・非目標（→ TSDoc）
- 振る舞いの詳細仕様（→ テスト）
- 長文の下書き（→ ローカル専用の gitignored `docs/` のみ）

## CI チェック

```bash
bun run docs:check-pairs
```

ペアファイルの存在と言語バナーを検証する。
