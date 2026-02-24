---
name: Lint/Format 実装方針
about: ESLint・Prettier に基づく今後の実装方針の追跡用
title: "[方針] ESLint/Prettier に基づく今後の実装方針"
labels: documentation, enhancement, good first issue
assignees: ""
---

## 概要

複数コントリビューターでの一貫した実装のため、ESLint と Prettier のルールを強化しました。本 Issue は、そのルールに沿った**今後の実装方針**と、段階的に取り組むタスクを記述するものです。

詳細は `docs/lint-and-format.md` を参照してください。

---

## ルールの方向性（合意済み）

- **パフォーマンス**: 無駄な処理・未使用コードの削除、React Hooks の依存配列の正確さ
- **YAGNI・クリーン**: 未使用変数/import の禁止、`debugger` 禁止、複雑度・ネスト深度の制限
- **可読性**: `console.log` の制限、行数制限、**簡略化より可読性を優先**

---

## 今後の実装方針（タスク）

### Phase 1: 警告の解消（優先）

- [ ] **未使用 import の一括削除**  
       `bun run lint -- --fix` で自動修正可能（約 36 件）。定期的に実行し、PR 単位でも `--fix` を習慣化する。
- [ ] **未使用変数・引数の解消**  
       使用するか、意図的に未使用なら `_` プレフィックス（例: `_unused`）を付与する。
- [ ] **src 配下の `console.log` 削減**  
       デバッグ用は削除するか、`console.warn` / `console.error` に置き換える。必要なログは適切なロガーやモニタリングに委譲する。

### Phase 2: 厳格ルールの error 化（段階的）

以下のルールは現在 **warn**。該当箇所を修正したうえで、`eslint.config.js` で **error** に変更する。

- [ ] `@typescript-eslint/no-non-null-assertion`  
       `!` を避け、optional chaining や型ガードで null/undefined を明示する。
- [ ] `@typescript-eslint/no-extraneous-class`  
       コンストラクタだけの class は関数やオブジェクトに置き換える。
- [ ] `@typescript-eslint/no-useless-constructor`  
       空のコンストラクタを削除する。
- [ ] `@typescript-eslint/no-dynamic-delete`  
       動的キー削除を、オブジェクトの再生成など安全な方法に変更する。

### Phase 3: 複雑度・可読性の改善（中長期）

- [ ] **長大な関数の分割**  
       `max-lines-per-function`（150 行）や `complexity`（20）の警告が出ている関数を、責務ごとに分割する。
- [ ] **ネスト深度の削減**  
       `max-depth`（4）に違反しているブロックを、早期 return やヘルパー関数へリファクタする。

### Phase 4: TypeScript の厳格化（任意）

- [ ] `tsconfig.app.json` で `strict: true` を有効化する。
- [ ] `noUnusedLocals` / `noUnusedParameters` を有効化し、型と ESLint の未使用検出を揃える。
- [ ] 有効化時に出る型エラーは、影響範囲の小さいものから順に修正する。

### 運用ルール（常に適用）

- 新規コードは **ESLint error 0・Prettier 準拠** でマージする。
- PR では `bun run lint` と `bun run format:check`（または `format`）が通っていることを確認する。
- 既存の warn を増やさないことを推奨し、可能な範囲で warn 解消に寄せる。

---

## 参照

- ルール一覧・コマンド: `docs/lint-and-format.md`
- 設定ファイル: `eslint.config.js`, `.prettierrc`
