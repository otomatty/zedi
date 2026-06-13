# `.agents/` — Skills & Subagents（正本）

Claude Code / Cursor 共通の **Agent Skills** と **サブエージェント定義** の正本。
アプリコードではない。編集は **このディレクトリのみ** 行い、ミラーは再生成する。

## 構成

```
.agents/
├── README.md
├── skills/          # Agent Skills（SKILL.md + references/）
│   ├── spec-test/
│   ├── test-inventory/
│   └── …
└── agents/          # サブエージェント（spec-extractor 等）
```

## ミラー（ツールが読むパス）

| ミラー            | 正本                                                       |
| ----------------- | ---------------------------------------------------------- |
| `.claude/skills/` | `.agents/skills/`（**Git 非追跡**。`bun run init` で生成） |
| `.claude/agents/` | `.agents/agents/`（同上）                                  |
| `.cursor/skills/` | `.agents/skills/`                                          |
| `.cursor/agents/` | `.agents/agents/`                                          |

クローン直後はミラーが無い場合がある。リポジトリルートで:

```bash
bun run init
```

（`init` に含まれる。ミラーだけ再生成する場合は `bun run setup:agent-mirrors`）

## テスト導入パイプライン

```
test-inventory  →  project-profile + test-backlog
       ↓
spec-test（P0 から 1 モジュールずつ）
```

詳細: [skills/README-test-pipeline.md](skills/README-test-pipeline.md)

## Windows 注意

ミラーは **junction**（Windows）または **symlink**（macOS/Linux）で作成する。
Developer Mode 無しでも junction は通常利用可能。失敗時は README の手動 `mklink` を参照。

## 他リポジトリへ持ち出す

`.agents/` をコピーし、`setup:agent-mirrors` 相当で各ツールの探索パスへリンクする。
プロジェクト固有規約は `skills/spec-test/references/overlays/<name>.md` に追加。
