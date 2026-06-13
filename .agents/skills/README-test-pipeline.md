# テストスキル群 / Test Skills

仕様駆動テスト導入の 2 段パイプライン。他リポジトリへ `.agents/skills/` ごとコピーし、`setup:agent-mirrors` で各ツールへリンクして利用可能。

## フロー

```
未導入 / 薄いテスト
    │
    ▼
test-inventory  →  project-profile + test-backlog
    │
    ├─ bootstrap_needed → bootstrap テンプレ + ユーザー承認
    │
    ▼
spec-test（P0 から 1 モジュールずつ）
    │
    ▼
次の backlog 項目
```

## スキル

| スキル                                             | 用途                                           |
| -------------------------------------------------- | ---------------------------------------------- |
| [test-inventory/SKILL.md](test-inventory/SKILL.md) | ギャップ分析・優先順位付け（テストは書かない） |
| [spec-test/SKILL.md](spec-test/SKILL.md)           | 仕様抽出 → 盲テスト設計 → 検出力検証           |

## プロジェクト固有規約

`spec-test/references/overlays/<name>.md` を追加し、inventory / spec-test の profile に `overlay: <name>` を設定する。

Zedi: `overlay: zedi` → [spec-test/references/overlays/zedi.md](spec-test/references/overlays/zedi.md)

## 使い方（例）

```
/test-inventory src/
# → project-profile と test-backlog を得る

/spec-test src/lib/validateEmail.ts
# → profile をチャットに貼り付けた状態で P0 を実行
```
