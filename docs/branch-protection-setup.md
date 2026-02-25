# ブランチ保護ルールの設定手順

`main` と `develop` ブランチに対して、直接のコミット・マージを禁止し、PR 経由でのみマージできるようにする設定手順です。

## 適用されるルール

| ルール                   | 内容                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------ |
| **PR 必須**              | 変更は必ず Pull Request を経由してマージする必要があります。直接 push はできません。 |
| **削除防止**             | ブランチの削除を防止します。                                                         |
| **フォースプッシュ防止** | フォースプッシュを禁止し、履歴の改ざんを防ぎます。                                   |

## 設定方法（ルールセットのインポート）

### 前提条件

- リポジトリの **Admin** 権限を持つアカウントでログインしていること
- `develop` ブランチが存在すること（存在しない場合は先に作成してください）

### 手順

1. リポジトリの **Settings** を開く
2. 左サイドバーの **Code and automation** 配下で **Rules** → **Rulesets** をクリック
3. **New ruleset** をクリック
4. **Import a ruleset** を選択
5. ローカルの `.github/rulesets/main-develop-branch-protection.json` を選択してインポート
6. 内容を確認し、**Create** をクリック

### インポート後の確認

- `main` または `develop` に直接 push しようとすると拒否されること
- フィーチャーブランチから `main` / `develop` への PR を作成し、マージできること

## 代替: GitHub UI で手動作成

ルールセットのインポートが使えない場合は、以下の手順で手動設定できます。

1. **Settings** → **Rules** → **Rulesets** → **New ruleset** → **New branch ruleset**
2. **Ruleset name**: `main/develop ブランチ保護`
3. **Target branches** → **Add target** → **Include by pattern** で以下を追加:
   - `main`
   - `develop`
4. **Branch protections** で以下を有効化:
   - ✅ **Require a pull request before merging**（承認数は 0 のまま可）
   - ✅ **Block force pushes**
   - ✅ **Restrict deletions**
5. **Create** をクリック

## 注意事項

- **develop ブランチが未作成の場合**: ルールセットの `include` に `refs/heads/develop` が含まれているため、`develop` を作成した時点で自動的に保護対象になります。
- **管理者のバイパス**: 必要に応じて、Settings の Bypass list で Repository admins にバイパス権限を付与できます（緊急時の直接 push 用）。デフォルトではバイパスは設定していません。
