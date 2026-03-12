---
name: delete-merged-branches
description: >
  指定した基準ブランチ（develop / main など）に取り込まれたローカルおよび origin 上の
  リモートブランチを安全に削除する。通常 merge は祖先判定、squash/rebase merge は
  GitHub のマージ済み PR の headRefOid 一致で判定。"マージ済みブランチを削除",
  "delete merged branches", "ローカル/リモートブランチを掃除", "ブランチ整理" などで使う。
---

# マージ済みローカル・リモートブランチの削除

`git branch --merged` は祖先関係のみ見るため、squash/rebase merge では未マージ扱いになる。本スキルでは祖先判定に加え、GitHub の merged PR の `headRefOid` 一致でローカル・リモート両方の削除対象を安全に決める。主 remote は `origin` を前提とする。

## 推奨: スクリプトで一括実行

事前に `git fetch origin --prune` と `gh auth status` が通ることを確認したうえで、以下で候補列挙・確認・削除まで行う。

```bash
git fetch origin --prune
./scripts/delete-merged-branches.sh [基準ブランチ] [--dry-run]
```

- **基準ブランチ**: 省略時はローカルに `develop` があれば `develop`、なければ `origin/HEAD` の短縮名（例: main）。
- **--dry-run**: 削除はせず、削除候補一覧と理由だけ表示する。

スクリプトは merged PR を **1 回だけ** `gh pr list --state merged --base <基準>` で一括取得し、`headRefName` / `headRefOid` で照合する。ローカル候補（祖先 or headRefOid 一致）とリモート専用候補（origin にのみ存在し headRefOid 一致）の両方を判定し、確認後にローカル削除 → リモート削除の順で実行する。

## 手動で行う場合（フォールバック）

スクリプトを使わないときは以下を参考にする。

1. **事前確認**  
   `git fetch origin --prune` と `gh auth status`。主 remote が `origin` でない場合はユーザーに確認する。

2. **基準ブランチ**  
   ユーザー指定 > ローカル `develop` > `origin/HEAD` の短縮名。`base_remote=origin/<基準>` が存在しない場合は中断して確認。

3. **merged PR の一括取得**  
   ブランチごとに `gh pr list` を叩かず、1 回だけ取得する。

   ```bash
   gh pr list --state merged --base "$base_branch" --limit 200 --json headRefName,headRefOid,number
   ```

4. **ローカル候補**  
   `git for-each-ref refs/heads --format='%(refname:short)'` で一覧。現在ブランチ・基準・main/master/develop・origin/HEAD 先は除外。各ブランチについて:
   - `git merge-base --is-ancestor <branch> "$base_remote"` で成功 → 削除可（merged by ancestry）
   - 失敗時は上記 JSON からそのブランチ名の `headRefOid` を探し、`$(git rev-parse <branch>)` と一致する場合のみ削除可（merged PR #N）。

5. **リモート専用候補**  
   `git for-each-ref refs/remotes/origin --format='%(refname:short)' | sed 's|^origin/||'` で一覧。保護ブランチ・ローカルに存在するブランチは除外。`refs/remotes/origin/<branch>` の tip が、上記 JSON のそのブランチの `headRefOid` と一致する場合のみ `git push origin --delete <branch>` の対象とする。

6. **削除**  
   候補を提示し確認後、ローカルは `git branch -d`（必要なら `-D`）、リモートは `git push origin --delete <branch>`。

## 報告形式

```markdown
基準ブランチ: develop

Deleted (local):

- `feature/foo` - merged by ancestry
- `feature/bar` - merged PR #123 (squash/rebase-safe)

Deleted (remote):

- `feature/qux` - merged PR #124 (remote-only)

Skipped:

- `feature/baz` - current branch
- `feature/adv` - PR merged but tip advanced after merge
```

削除件数とスキップ理由を必ず添える。

## 注意点

- merged PR があっても、ローカルまたはリモートの tip が `headRefOid` と一致しない場合は削除しない（merge 後に進んだ可能性あり）。
- 主 remote が `origin` でない構成では手順を流用するかユーザーに確認する。
- `gh` が使えない場合は、祖先で merged と判定できるローカルブランチのみ削除し、リモート削除と squash/rebase 判定は行わない。
