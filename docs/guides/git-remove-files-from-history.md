# 過去のコミットからファイルを完全に削除する方法

リポジトリの**履歴全体**から特定のファイルを削除する手順です。  
「追跡をやめる」だけでなく、**過去のコミットからも存在を消したい**場合に使います。

---

## 1. なぜ履歴から削除するか

- **機密性**: tfplan やビルド成果物に環境依存の情報が含まれる可能性がある
- **リポジトリ肥大化**: 大きなバイナリ（lambda.zip など）が履歴に残ると clone/fetch が重くなる
- **ポリシー**: 成果物や plan ファイルはリポジトリに含めない方針を徹底したい

※ 履歴の書き換えは **force push** が必要になるため、共有ブランチでは実施前にチームと合意してください。

---

## 2. 実施前の準備（必須）

### 2.1 バックアップ

履歴を書き換えるため、失敗に備えてバックアップを取ります。

```bash
# 別ディレクトリにバックアップ clone（推奨）
cd ..
git clone --mirror zedi zedi-backup.git
# または 現在のリポジトリを zip で保存
```

### 2.2 作業用のクリーンな状態

未コミットの変更があると filter-repo が止まることがあります。

```bash
cd zedi
git status   # クリーンであることを確認
# 変更がある場合は stash または別ブランチで退避
git stash push -m "backup before history rewrite"
```

### 2.3 ツールのインストール

**git-filter-repo**（Git 公式が推奨）を使う方法を説明します。

- **Windows (scoop)**  
  `scoop install git-filter-repo`
- **Windows (pip)**  
  `pip install git-filter-repo`
- **macOS (Homebrew)**  
  `brew install git-filter-repo`

インストール確認:

```bash
git filter-repo --version
```

※ `git filter-branch` は非推奨のため、ここでは使いません。

---

## 3. 削除対象のファイル一覧

このリポジトリで履歴から外したいファイルは以下です。

| 種類 | パス |
|------|------|
| Lambda zip | `terraform/modules/ai-api/lambda.zip` |
| | `terraform/modules/api/lambda.zip` |
| | `terraform/modules/subscription/lambda.zip` |
| | `terraform/modules/thumbnail-api/lambda.zip` |
| Terraform plan | `terraform/tfplan` |
| | `terraform/tfplan-api` |
| | `terraform/tfplan-cdn` |
| | `terraform/tfplan-cdn2` |
| | `terraform/tfplan-custom-domain` |
| | `terraform/tfplan-scalezero` |
| | `terraform/tfplan-ws` |

---

## 4. git-filter-repo で履歴から削除する手順

### 4.1 削除用のパスリストを用意する

一時ファイルに「削除したいパス」を 1 行 1 パスで書きます。  
（Windows の cmd の場合は `%TEMP%\paths-to-remove.txt` やリポジトリ直下の `paths-to-remove.txt` でも可）

```bash
cd /c/Users/saedg/apps/zedi

# Git Bash の場合（/tmp が使える）
cat << 'EOF' > /tmp/paths-to-remove.txt
terraform/modules/ai-api/lambda.zip
terraform/modules/api/lambda.zip
terraform/modules/subscription/lambda.zip
terraform/modules/thumbnail-api/lambda.zip
terraform/tfplan
terraform/tfplan-api
terraform/tfplan-cdn
terraform/tfplan-cdn2
terraform/tfplan-custom-domain
terraform/tfplan-scalezero
terraform/tfplan-ws
EOF
```

### 4.2 filter-repo を実行する

**重要**: `git filter-repo` は **リモートの設定を削除** します。実行前に `git remote -v` で origin の URL をメモしておいてください。

```bash
# リモート URL をメモ（あとで再設定する）
git remote -v

# 履歴から指定パスのファイルを削除
git filter-repo --invert-paths --path-list /tmp/paths-to-remove.txt --force
```

- `--invert-paths`: リストに書いたパスを**削除**する
- `--path-list`: 削除するパスの一覧ファイル
- `--force`: 既存の filter-repo 用バックアップがない場合の警告を無視（初回実行で必要）

### 4.3 リモートを再設定する

filter-repo 実行後は `origin` が消えているので、再度追加します。

```bash
# メモした URL で再設定（例）
git remote add origin https://github.com/your-org/zedi.git
# または
git remote add origin git@github.com:your-org/zedi.git
```

### 4.4 削除ができているか確認する

```bash
# 対象ファイルが履歴に残っていないか検索（何も出なければ成功）
git log --all --full-history -- terraform/modules/api/lambda.zip
git log --all --full-history -- terraform/tfplan
```

どちらもコミットが表示されなければ、履歴からは削除できています。

---

## 5. リモートに反映する（force push）

履歴を書き換えたので、通常の `git push` では反映されません。**force push** が必要です。

```bash
# develop を書き換えた場合の例
git push origin develop --force
```

**注意**

- `--force` は **そのブランチのリモート履歴を上書き** します。
- 他の人が同じブランチを pull している場合、その人たちは **再 clone または `git fetch && git reset --hard origin/develop`** などで合わせる必要があります。
- **main や保護されたブランチ** の場合は、 force push が禁止されていることがあるので、設定とチームの合意を確認してください。

---

## 6. 他のメンバーが取るべき対応

履歴が書き換わったあと、すでに clone している人は次のどちらかで合わせます。

**方法 A: そのブランチをリモートに合わせて捨てる**

```bash
git fetch origin
git checkout develop
git reset --hard origin/develop
```

**方法 B: クリーンにやり直す**

```bash
cd ..
rm -rf zedi
git clone https://github.com/your-org/zedi.git
cd zedi
```

---

## 7. 別の方法: BFG Repo-Cleaner を使う場合

[BFG](https://rtyley.github.io/bfg-repo-cleaner/) を使う場合は、次の流れになります。

1. リポジトリを mirror clone  
   `git clone --mirror https://github.com/your-org/zedi.git zedi-mirror && cd zedi-mirror`
2. 削除したいパスを列挙したファイル `paths.txt` を用意
3. 実行  
   `bfg --delete-files paths.txt` の要領（BFG のバージョンによりオプションが異なるため、公式ドキュメントを参照）
4. `git reflog expire --expire=now --all && git gc --prune=now --aggressive`
5. `git push --force`

細かいオプションは BFG のドキュメントを確認してください。一般的には **git-filter-repo の方が扱いやすい**です。

---

## 8. まとめチェックリスト

- [ ] バックアップを取った（mirror clone または zip）
- [ ] `git status` がクリーン（または変更を stash）
- [ ] `git filter-repo` をインストール
- [ ] `origin` の URL をメモ
- [ ] `paths-to-remove.txt` を作成
- [ ] `git filter-repo --invert-paths --path-list ... --force` を実行
- [ ] `git remote add origin <URL>` でリモートを再設定
- [ ] `git log --all --full-history -- <path>` で履歴から消えたことを確認
- [ ] チームに force push する旨を共有
- [ ] `git push origin <branch> --force` で反映
- [ ] 他のメンバーに「再 clone または reset --hard」を案内

これで、過去のコミットからも該当ファイルが削除された状態になります。  
`.gitignore` の更新はすでに済んでいるため、今後はこれらのファイルが誤ってコミットされることも防げます。
