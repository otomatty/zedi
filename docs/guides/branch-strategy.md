# ブランチ戦略とブランチ保護ガイド

このドキュメントでは、Zediプロジェクトで採用しているGit Flowベースのブランチ戦略と、GitHubでのブランチ保護設定について説明します。

## 📋 目次

- [ブランチ戦略の概要](#ブランチ戦略の概要)
- [ブランチの種類](#ブランチの種類)
- [開発フロー](#開発フロー)
- [ブランチ保護の設定](#ブランチ保護の設定)
- [よくある質問](#よくある質問)

---

## ブランチ戦略の概要

Zediプロジェクトでは、**Git Flow**をベースにしたブランチ戦略を採用しています。これにより、安定した本番環境（`main`）と継続的な開発環境（`develop`）を分離し、安全で効率的な開発を実現します。

### ブランチ構造

```
main (本番環境)
  ↑
develop (開発環境)
  ↑
feature/* (機能開発)
fix/* (バグ修正)
```

---

## ブランチの種類

### 1. `main` ブランチ

- **目的**: 本番環境にデプロイ可能な安定したコードを保持
- **保護**: 最も厳格な保護設定を適用
- **マージ**: `develop`ブランチからのみマージ可能（リリース時）

### 2. `develop` ブランチ

- **目的**: 次期リリースに向けた開発中のコードを統合
- **保護**: 基本的な保護設定を適用
- **マージ**: 機能ブランチやバグ修正ブランチからマージ

### 3. `feature/*` ブランチ

- **目的**: 新機能の開発
- **命名規則**: `feature/description` (例: `feature/image-storage-ux`)
- **マージ先**: `develop`ブランチ

### 4. `fix/*` ブランチ

- **目的**: バグ修正
- **命名規則**: `fix/description` (例: `fix/search-crash`)
- **マージ先**: `develop`ブランチ（緊急時は`main`にも直接マージ可能）

### 5. `hotfix/*` ブランチ

- **目的**: 本番環境の緊急バグ修正
- **命名規則**: `hotfix/description` (例: `hotfix/security-patch`)
- **マージ先**: `main`と`develop`の両方

---

## 開発フロー

### 新機能開発の流れ

1. **developブランチから最新を取得**
   ```bash
   git checkout develop
   git pull origin develop
   ```

2. **機能ブランチを作成**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **開発とコミット**
   ```bash
   # 変更を実装
   git add .
   git commit -m "feat: add new feature"
   ```

4. **リモートにプッシュ**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Pull Requestを作成**
   - ベースブランチ: `develop`
   - CIが自動的に実行され、チェックが通ることを確認

6. **レビューとマージ**
   - レビューが承認されたら、`develop`ブランチにマージ

### リリースの流れ

1. **developブランチが安定したら、mainにマージ**
   ```bash
   git checkout main
   git merge develop
   git push origin main
   ```

2. **タグを作成（オプション）**
   ```bash
   git tag -a v1.0.0 -m "Release version 1.0.0"
   git push origin v1.0.0
   ```

### 緊急バグ修正の流れ（hotfix）

1. **mainブランチからhotfixブランチを作成**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b hotfix/critical-bug
   ```

2. **修正を実装してコミット**
   ```bash
   # 修正を実装
   git add .
   git commit -m "fix: critical bug fix"
   ```

3. **mainとdevelopの両方にマージ**
   ```bash
   # mainにマージ
   git checkout main
   git merge hotfix/critical-bug
   git push origin main
   
   # developにもマージ
   git checkout develop
   git merge hotfix/critical-bug
   git push origin develop
   ```

---

## ブランチ保護の設定

GitHubのブランチ保護機能を使用して、重要なブランチを保護します。

### mainブランチの保護設定

GitHubリポジトリの設定で、以下の保護ルールを適用してください：

#### 必須の設定

1. **Require a pull request before merging**
   - ✅ Require approvals: **1** (または2)
   - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require review from Code Owners (コードオーナーが設定されている場合)

2. **Require status checks to pass before merging**
   - ✅ Require branches to be up to date before merging
   - 必須チェック:
     - `lint-and-test`
     - `e2e-tests`

3. **Require conversation resolution before merging**
   - ✅ すべてのコメントが解決されるまでマージをブロック

4. **Require linear history**
   - ✅ マージコミットを禁止し、リベースマージを強制（オプション）

5. **Include administrators**
   - ✅ 管理者にも保護ルールを適用

6. **Restrict who can push to matching branches**
   - 必要に応じて特定のユーザー/チームのみ許可

#### 設定手順

1. GitHubリポジトリにアクセス
2. **Settings** → **Branches** に移動
3. **Add branch protection rule** をクリック
4. **Branch name pattern** に `main` を入力
5. 上記の設定を適用
6. **Create** をクリック

### developブランチの保護設定

`develop`ブランチにも同様の保護を適用しますが、`main`より緩やかに設定できます：

1. **Require a pull request before merging**
   - ✅ Require approvals: **1**
   - ✅ Dismiss stale pull request approvals when new commits are pushed

2. **Require status checks to pass before merging**
   - ✅ Require branches to be up to date before merging
   - 必須チェック:
     - `lint-and-test`
     - `e2e-tests`

3. **Include administrators**
   - ✅ 管理者にも保護ルールを適用

---

## よくある質問

### Q: developブランチがまだ存在しない場合は？

A: 以下の手順で`develop`ブランチを作成できます：

```bash
# mainブランチからdevelopを作成
git checkout main
git pull origin main
git checkout -b develop
git push -u origin develop
```

その後、GitHubで`develop`ブランチの保護設定を適用してください。

### Q: 既存の機能ブランチをdevelopにマージしたい場合は？

A: 現在`main`に向いているPRがある場合：

1. PRのベースブランチを`develop`に変更
2. または、新しいPRを`develop`に対して作成

### Q: CIが失敗した場合は？

A: ローカルで以下を実行して問題を確認してください：

```bash
# Lintチェック
bun run lint

# テスト実行
bun run test:run

# E2Eテスト
bun run test:e2e

# ビルド確認
bun run build
```

### Q: 緊急でmainに直接マージする必要がある場合は？

A: 通常は`hotfix/*`ブランチを使用しますが、管理者権限で一時的に保護を解除することも可能です（推奨されません）。

---

## 参考リンク

- [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)
- [GitHub Branch Protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [Conventional Commits](https://www.conventionalcommits.org/)

---

**最終更新**: 2025-01-02
