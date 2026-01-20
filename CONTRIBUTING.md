# Contributing to Zedi

Zedi へのコントリビューションに興味を持っていただきありがとうございます！

このガイドでは、プロジェクトへの貢献方法について説明します。

## 📋 Table of Contents

- [Contributing to Zedi](#contributing-to-zedi)
  - [📋 Table of Contents](#-table-of-contents)
  - [Code of Conduct](#code-of-conduct)
  - [Getting Started](#getting-started)
    - [1. リポジトリをフォーク](#1-リポジトリをフォーク)
    - [2. ローカルにクローン](#2-ローカルにクローン)
    - [3. 依存関係をインストール](#3-依存関係をインストール)
    - [4. 開発サーバーを起動](#4-開発サーバーを起動)
    - [5. upstream を設定](#5-upstream-を設定)
  - [Development Workflow](#development-workflow)
    - [ブランチ命名規則](#ブランチ命名規則)
    - [開発フロー](#開発フロー)
  - [Pull Request Process](#pull-request-process)
    - [PR を作成する前に](#pr-を作成する前に)
    - [PR テンプレート](#pr-テンプレート)
    - [レビュープロセス](#レビュープロセス)
  - [Coding Standards](#coding-standards)
    - [TypeScript](#typescript)
    - [React](#react)
    - [ファイル構成](#ファイル構成)
    - [スタイリング](#スタイリング)
  - [Commit Message Guidelines](#commit-message-guidelines)
    - [フォーマット](#フォーマット)
    - [Type](#type)
    - [例](#例)
  - [Reporting Bugs](#reporting-bugs)
    - [Issue に含める情報](#issue-に含める情報)
    - [テンプレート](#テンプレート)
  - [Suggesting Features](#suggesting-features)
    - [提案に含める情報](#提案に含める情報)
  - [Questions?](#questions)

---

## Code of Conduct

このプロジェクトでは、すべての参加者に対して敬意を持ち、インクルーシブな環境を維持することを求めています。ハラスメントや差別的な行為は許容されません。

---

## Getting Started

### 1. リポジトリをフォーク

GitHub 上でこのリポジトリをフォークしてください。

### 2. ローカルにクローン

```bash
git clone https://github.com/your-username/zedi.git
cd zedi
```

### 3. 依存関係をインストール

```bash
bun install
```

### 4. 開発サーバーを起動

```bash
bun run dev
```

### 5. upstream を設定

```bash
git remote add upstream https://github.com/original-owner/zedi.git
```

---

## Development Workflow

### ブランチ命名規則

| Type | Format | Example |
|------|--------|---------|
| Feature | `feature/description` | `feature/add-backlinks` |
| Bug Fix | `fix/description` | `fix/search-crash` |
| Refactor | `refactor/description` | `refactor/editor-hooks` |
| Documentation | `docs/description` | `docs/update-readme` |

### 開発フロー

> 📖 **詳細なブランチ戦略**: [ブランチ戦略ガイド](../docs/guides/branch-strategy.md) を参照してください。

1. **develop ブランチから最新を取得**
   ```bash
   git fetch origin
   git checkout develop
   git pull origin develop
   ```

2. **機能ブランチを作成**
   ```bash
   git checkout -b feature/your-feature
   ```

3. **変更を実装**
   - コードを書く
   - テストを追加
   - ドキュメントを更新

4. **テストを実行**
   ```bash
   # ユニットテスト
   bun run test

   # E2E テスト
   bun run test:e2e

   # Lint
   bun run lint
   ```

5. **コミットしてプッシュ**
   ```bash
   git add .
   git commit -m "feat: add backlinks feature"
   git push origin feature/your-feature
   ```

6. **Pull Request を作成**
   - ベースブランチ: `develop`
   - CIが自動的に実行され、すべてのチェックが通ることを確認

---

## Pull Request Process

### PR を作成する前に

- [ ] テストがすべてパスすることを確認
- [ ] Lint エラーがないことを確認
- [ ] 関連する Issue があればリンク
- [ ] 必要に応じてドキュメントを更新

### PR テンプレート

```markdown
## 概要
変更内容の簡単な説明

## 変更点
- 変更点 1
- 変更点 2

## テスト方法
この変更をテストする手順

## スクリーンショット（UI 変更がある場合）

## 関連 Issue
Closes #123
```

### レビュープロセス

1. PR を作成すると、メンテナーがレビューします
2. フィードバックがあれば対応してください
3. 承認されたらマージされます

---

## Coding Standards

### TypeScript

- 型定義を明示的に行う
- `any` の使用は避ける
- 関数には戻り値の型を指定

```typescript
// ✅ Good
function getPage(id: string): Page | undefined {
  return pages.find(p => p.id === id);
}

// ❌ Bad
function getPage(id) {
  return pages.find(p => p.id === id);
}
```

### React

- 関数コンポーネントを使用
- カスタムフックで ロジックを分離
- Props には明示的な型定義

```typescript
// ✅ Good
interface PageCardProps {
  page: Page;
  onClick: (id: string) => void;
}

export function PageCard({ page, onClick }: PageCardProps) {
  return <div onClick={() => onClick(page.id)}>{page.title}</div>;
}
```

### ファイル構成

```
src/
├── components/
│   └── feature/
│       ├── FeatureComponent.tsx
│       └── FeatureComponent.test.tsx
├── hooks/
│   └── useFeature.ts
└── lib/
    └── featureUtils.ts
```

### スタイリング

- Tailwind CSS を使用
- shadcn/ui コンポーネントを活用
- カスタムスタイルは最小限に

---

## Commit Message Guidelines

[Conventional Commits](https://www.conventionalcommits.org/) に従います。

### フォーマット

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Type

| Type | Description |
|------|-------------|
| `feat` | 新機能 |
| `fix` | バグ修正 |
| `docs` | ドキュメントのみの変更 |
| `style` | コードの意味に影響しない変更（空白、フォーマット等） |
| `refactor` | バグ修正でも機能追加でもないコード変更 |
| `perf` | パフォーマンス改善 |
| `test` | テストの追加・修正 |
| `chore` | ビルドプロセスやツールの変更 |

### 例

```bash
feat(editor): add WikiLink autocomplete
fix(search): resolve crash on empty query
docs(readme): update installation instructions
refactor(hooks): simplify usePageQueries
```

---

## Reporting Bugs

バグを見つけた場合は、Issue を作成してください。

### Issue に含める情報

1. **概要** — 何が問題か
2. **再現手順** — 問題を再現する方法
3. **期待する動作** — どう動作すべきか
4. **実際の動作** — 実際に何が起きたか
5. **環境**
   - OS とバージョン
   - ブラウザとバージョン
   - Zedi のバージョン
6. **スクリーンショット** — 可能であれば

### テンプレート

```markdown
## バグの概要
検索結果をクリックしてもページが開かない

## 再現手順
1. Cmd+K で検索を開く
2. 「テスト」と入力
3. 検索結果をクリック

## 期待する動作
クリックしたページが開く

## 実際の動作
何も起きない

## 環境
- OS: macOS Sonoma 14.2
- Browser: Chrome 120
- Zedi: v0.1.0

## スクリーンショット
[スクリーンショットをここに貼り付け]
```

---

## Suggesting Features

新機能のアイデアがあれば、Issue を作成してください。

### 提案に含める情報

1. **概要** — 何を追加したいか
2. **動機** — なぜこの機能が必要か
3. **詳細** — 機能の詳しい説明
4. **代替案** — 検討した他の方法

---

## Questions?

質問がある場合は、Issue を作成するか、Discussions でお気軽にお問い合わせください。

---

Thank you for contributing to Zedi! 🎉
