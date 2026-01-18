# developブランチのセットアップ手順

このガイドでは、既存のプロジェクトに`develop`ブランチを導入する手順を説明します。

## 📋 前提条件

- リポジトリへの管理者権限
- ローカルにリポジトリがクローンされていること

## 🚀 セットアップ手順

### 1. ローカルでdevelopブランチを作成

```bash
# mainブランチに切り替え
git checkout main

# 最新の状態を取得
git pull origin main

# developブランチを作成（mainから分岐）
git checkout -b develop

# リモートにプッシュ
git push -u origin develop
```

### 2. GitHubでdevelopブランチをデフォルトブランチに設定（オプション）

開発中のプロジェクトの場合、`develop`をデフォルトブランチに設定することを推奨します：

1. GitHubリポジトリにアクセス
2. **Settings** → **Branches** に移動
3. **Default branch** セクションで **Switch to another branch** をクリック
4. `develop` を選択して **Update** をクリック
5. 確認ダイアログで **I understand, update the default branch** をクリック

> **注意**: 既存のPRやIssueが`main`を参照している場合は、デフォルトブランチを変更しないことをお勧めします。

### 3. ブランチ保護ルールの設定

#### developブランチの保護設定

1. GitHubリポジトリにアクセス
2. **Settings** → **Branches** に移動
3. **Add branch protection rule** をクリック
4. **Branch name pattern** に `develop` を入力
5. 以下の設定を有効化：

   **必須の設定:**
   - ✅ **Require a pull request before merging**
     - Require approvals: **1**
     - ✅ Dismiss stale pull request approvals when new commits are pushed
   
   - ✅ **Require status checks to pass before merging**
     - ✅ Require branches to be up to date before merging
     - 必須チェックを選択:
       - `lint-and-test`
       - `e2e-tests`
   
   - ✅ **Include administrators**
     - 管理者にも保護ルールを適用

6. **Create** をクリック

#### mainブランチの保護設定（まだ設定していない場合）

1. 同じ **Branches** ページで、**Add branch protection rule** をクリック
2. **Branch name pattern** に `main` を入力
3. 以下の設定を有効化：

   **必須の設定:**
   - ✅ **Require a pull request before merging**
     - Require approvals: **1** (または2)
     - ✅ Dismiss stale pull request approvals when new commits are pushed
   
   - ✅ **Require status checks to pass before merging**
     - ✅ Require branches to be up to date before merging
     - 必須チェックを選択:
       - `lint-and-test`
       - `e2e-tests`
   
   - ✅ **Require conversation resolution before merging**
     - すべてのコメントが解決されるまでマージをブロック
   
   - ✅ **Include administrators**
     - 管理者にも保護ルールを適用

4. **Create** をクリック

### 4. 既存の機能ブランチの対応

現在`main`に向いているPRがある場合、以下のいずれかの方法で対応します：

#### 方法A: PRのベースブランチを変更（推奨）

1. GitHubのPRページを開く
2. **Edit** ボタンをクリック
3. **Base branch** を `develop` に変更
4. **Update branch** をクリック

#### 方法B: 新しいPRをdevelopに対して作成

1. 既存のPRをクローズ
2. 同じブランチから新しいPRを作成
3. ベースブランチを `develop` に設定

### 5. ローカルの設定を更新

チームメンバーは、以下のコマンドでローカル環境を更新してください：

```bash
# developブランチを取得
git fetch origin

# developブランチをチェックアウト
git checkout develop

# 最新の状態を取得
git pull origin develop
```

## ✅ 確認事項

セットアップが完了したら、以下を確認してください：

- [ ] `develop`ブランチがリモートに存在する
- [ ] `develop`ブランチの保護ルールが設定されている
- [ ] `main`ブランチの保護ルールが設定されている
- [ ] CIワークフロー（`.github/workflows/ci.yml`）が存在する
- [ ] 既存のPRが適切に更新されている

## 🔄 今後の開発フロー

セットアップ完了後は、以下のフローで開発を進めます：

1. **機能開発**: `feature/*` → `develop`
2. **バグ修正**: `fix/*` → `develop`
3. **リリース**: `develop` → `main`
4. **緊急修正**: `hotfix/*` → `main` と `develop`

詳細は [ブランチ戦略ガイド](./branch-strategy.md) を参照してください。

## 🆘 トラブルシューティング

### developブランチが表示されない

```bash
# リモートブランチを取得
git fetch origin

# すべてのブランチを確認
git branch -a
```

### 保護ルールが適用されない

- GitHubの設定ページで、保護ルールが正しく保存されているか確認
- ブランチ名のパターンが正確か確認（`develop`、`main`など）
- CIワークフローが正しく設定されているか確認

### CIが実行されない

- `.github/workflows/ci.yml` がリポジトリに存在するか確認
- GitHub Actionsが有効になっているか確認（Settings → Actions → General）

---

**最終更新**: 2025-01-02
