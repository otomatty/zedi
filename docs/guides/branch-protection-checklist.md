# ブランチ保護設定チェックリスト

このドキュメントは、GitHubでブランチ保護を設定する際のクイックリファレンスです。

## 📋 mainブランチの保護設定

### 必須設定

- [ ] **Require a pull request before merging**
  - [ ] Require approvals: **1** (または2)
  - [ ] Dismiss stale pull request approvals when new commits are pushed
  - [ ] Require review from Code Owners (コードオーナーが設定されている場合)

- [ ] **Require status checks to pass before merging**
  - [ ] Require branches to be up to date before merging
  - [ ] 必須チェックを選択:
    - [ ] `lint-and-test`
    - [ ] `e2e-tests`

- [ ] **Require conversation resolution before merging**
  - [ ] すべてのコメントが解決されるまでマージをブロック

- [ ] **Include administrators**
  - [ ] 管理者にも保護ルールを適用

### 推奨設定（オプション）

- [ ] **Require linear history**
  - [ ] マージコミットを禁止し、リベースマージを強制

- [ ] **Restrict who can push to matching branches**
  - [ ] 特定のユーザー/チームのみ許可（必要に応じて）

---

## 📋 developブランチの保護設定

### 必須設定

- [ ] **Require a pull request before merging**
  - [ ] Require approvals: **1**
  - [ ] Dismiss stale pull request approvals when new commits are pushed

- [ ] **Require status checks to pass before merging**
  - [ ] Require branches to be up to date before merging
  - [ ] 必須チェックを選択:
    - [ ] `lint-and-test`
    - [ ] `e2e-tests`

- [ ] **Include administrators**
  - [ ] 管理者にも保護ルールを適用

---

## 🔧 設定手順

### GitHubでの設定方法

1. リポジトリにアクセス
2. **Settings** → **Branches** に移動
3. **Add branch protection rule** をクリック
4. **Branch name pattern** にブランチ名を入力（`main` または `develop`）
5. 上記のチェックリストに従って設定を有効化
6. **Create** をクリック

### 設定の確認

設定後、以下の方法で保護が有効になっているか確認できます：

1. 保護されたブランチに直接プッシュを試みる（エラーになるはず）
2. PRを作成して、必須チェックが表示されることを確認
3. PRをマージしようとして、承認が必要であることを確認

---

## 📝 注意事項

- 保護ルールは、設定したブランチ名パターンに一致するすべてのブランチに適用されます
- 管理者も保護ルールの対象にすることを強く推奨します（`Include administrators`）
- CIワークフロー（`.github/workflows/ci.yml`）が正しく設定されていることを確認してください
- 保護ルールを変更する場合は、チームに通知してください

---

## 🔗 関連ドキュメント

- [ブランチ戦略ガイド](./branch-strategy.md)
- [developブランチのセットアップ手順](./setup-develop-branch.md)
- [GitHub公式ドキュメント](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)

---

**最終更新**: 2025-01-02
