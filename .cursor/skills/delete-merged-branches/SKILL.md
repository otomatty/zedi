---
name: delete-merged-branches
description: >
  指定した基準ブランチ（develop / main など）に取り込まれたローカルブランチを安全に削除する。
  通常の merge commit に加え、squash merge / rebase merge は GitHub のマージ済み PR の
  headRefOid 一致で判定する。"マージ済みブランチを削除", "delete merged branches",
  "ローカルブランチを掃除", "ブランチ整理" などで使う。
---

# マージ済みローカルブランチの削除

`git branch --merged` は「ブランチ先頭が基準の祖先か」だけを見るため、
squash merge / rebase merge では取り込み済みでも未マージ扱いになる。本スキルでは祖先判定に加え、GitHub の merged PR の `headRefOid` 一致で安全に削除対象を決める。

## 基本方針

1. 基準ブランチ（例: develop）を決める。ユーザー指定がなければ、ローカルに develop があれば develop、なければ origin/HEAD。
2. 各ローカルブランチについて、まず Git の祖先関係で判定。
3. 祖先で判定できない場合のみ、`gh pr list --base <基準>` で merged PR を取得し、`headRefOid` がローカル tip と一致する場合だけ削除候補にする。
4. `headRefOid` が一致しない場合は削除しない（merge 後にローカルで進んだ可能性あり）。

## 事前確認

```bash
git fetch origin --prune
git branch --show-current
gh auth status
```

`gh auth status` が失敗する場合は、祖先で merged と判定できるブランチのみ削除し、それ以外はスキップする。

## 手順

### 1. 基準ブランチの決定

**優先順位:**

1. ユーザーが「develop にマージ済み」「main を基準に」などと指定していればそのブランチ
2. 未指定なら: ローカルに `develop` が存在すれば `develop`
3. それ以外: `origin/HEAD` の短縮名（`git symbolic-ref --short refs/remotes/origin/HEAD | sed 's@^origin/@@'`）

```bash
# 例: 自動で develop を選ぶ場合
origin_default="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"
if git rev-parse --verify develop >/dev/null 2>&1; then
  base_branch="develop"
else
  base_branch="${origin_default:-main}"
fi
base_remote="origin/$base_branch"
current_branch="$(git branch --show-current)"
```

`base_remote` が存在しない（例: リモートに develop がない）場合は中断し、ユーザーに確認する。

### 2. ローカルブランチ一覧の取得

```bash
git for-each-ref refs/heads --format='%(refname:short)'
```

対象外: 現在のブランチ、基準ブランチ（`base_branch`）と同名のブランチ。加えて、`main` / `master` / `develop` および `origin/HEAD` が指すブランチ名は常に対象外とする（保護ブランチ）。

### 3. 各ブランチの削除可否を判定

#### A. 通常 merge（祖先）の判定

```bash
git merge-base --is-ancestor "<branch>" "$base_remote"
```

成功したら削除候補。理由は `merged by ancestry`。

#### B. squash merge / rebase merge の判定

A で削除候補にならず、`gh` が使える場合のみ実行。

```bash
tip_sha="$(git rev-parse "<branch>")"
gh pr list --state merged --head "<branch>" --base "$base_branch" --json number,headRefOid --limit 1
```

- `gh pr list` はデフォルトで更新が新しい順のため、`--limit 1` で最新の merged PR 1 件を取得する。その **`headRefOid` が `tip_sha` と一致**する場合のみ削除候補。理由は `merged PR #<number> (squash/rebase-safe)`。
- merged PR なし、または `headRefOid` 不一致の場合は削除しない。

### 4. 削除の実行

削除候補一覧をユーザーに提示し、削除してよいか確認を取ったうえで、次の方針で削除する。

- 理由が `merged by ancestry` のブランチ: `git branch -d "<branch>"` を使う（Git 上もマージ済みと判定されているため強制削除は不要）。
- 理由が `merged PR #<number> (squash/rebase-safe)` のブランチ: まず `git branch -d "<branch>"` を試し、エラーになる場合のみ `git branch -D "<branch>"` を使う。

## 報告形式

```markdown
基準ブランチ: develop（または main 等）

Deleted:

- `feature/foo` - merged by ancestry
- `feature/bar` - merged PR #123 (squash/rebase-safe)

Skipped:

- `feature/baz` - current branch
- `feature/qux` - PR merged but local branch advanced after merge
```

削除件数とスキップ理由を必ず添える。

## 注意点

- `git branch --merged` だけでは squash/rebase merge を拾えない。
- merged PR があっても `headRefOid` とローカル tip が違う場合は削除しない。
- 利用 remote が `origin` でない場合は、対象 remote をユーザーに確認する。
