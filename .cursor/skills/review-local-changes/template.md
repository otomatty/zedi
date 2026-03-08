# レビューレポートテンプレート

レポート生成時に本ファイルを Read ツールで読み込み、適切な形式を使用する。

---

## フルレポート

変更 6 ファイル以上、または Critical 1 件以上の場合に使用する。

```markdown
# セルフレビュー: <ブランチ名>

**日時**: YYYY-MM-DD HH:MM
**ベース**: <base-branch> (`<merge-base-short-hash>`)
**変更**: N files（除外: E files）
**レビュー範囲**: すべての変更 / コミット済みのみ / ステージ済みのみ

## サマリー

変更の全体像を 2-3 文で説明。

## 指摘事項

### 🔴 Critical

- **C-1** `path/to/file.ts:42` — 指摘内容
  → 推奨修正の具体的な説明

- **C-2** `path/to/file.ts:58` — 指摘内容
  → 推奨修正の具体的な説明

### 🟡 Warning

- **W-1** `path/to/file.ts:30` — 指摘内容
  → 推奨修正の具体的な説明

### 🟢 Info

- **I-1** `path/to/file.ts:15` — 指摘内容
  → 改善案

（指摘が 0 件のセクションは省略）

## テストカバレッジ

| 変更ファイル | テストファイル | 状態 |
| ------------ | -------------- | ---- |

## 静的解析

- **Lint**: N errors / M warnings（ReadLints）
- **型チェック**: Pass / N errors（tsc --noEmit, 変更ファイルのみ）
- **Prettier**: Pass / N files unformatted

## 統計

- Critical: N 件 / Warning: N 件 / Info: N 件
```

---

## コンパクトレポート

変更 5 ファイル以下 & Critical 0 件の場合に使用する。

```markdown
# セルフレビュー: <ブランチ名>

**日時**: YYYY-MM-DD HH:MM | **ベース**: <base-branch> | **変更**: N files

## サマリー

1 文で変更内容を説明。

## 指摘事項

- 🟡 `path/to/file.ts:42` — 指摘内容 → 推奨修正
- 🟢 `path/to/file.ts:15` — 指摘内容 → 改善案

（指摘なしの場合: ✅ 指摘なし）

**静的解析**: Lint ✅ / tsc ✅ / Prettier ✅
**統計**: Critical: 0 / Warning: N / Info: N
```

---

## 再レビューレポート（追加セクション）

再レビュー時はフル/コンパクトいずれかの冒頭（サマリーの前）に以下のセクションを追加する。

```markdown
## 前回指摘の解消状況

| #   | 重大度      | 指摘内容 | 状態                |
| --- | ----------- | -------- | ------------------- |
| C-1 | 🔴 Critical | ...      | ✅ 解消 / ❌ 未解消 |
| W-1 | 🟡 Warning  | ...      | ✅ 解消 / ❌ 未解消 |
```
