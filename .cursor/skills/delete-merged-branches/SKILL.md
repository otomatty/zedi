---
name: delete-merged-branches
description: >
  指定した基準ブランチ（develop / main など）に取り込まれたローカルおよび origin 上の
  リモートブランチを安全に削除する。通常 merge は祖先判定、squash/rebase merge は
  GitHub のマージ済み PR の headRefOid 一致で判定。あわせて、基準ブランチ向けに
  **リポジトリ全体**のクローズ済み（未マージ）PR のリモートブランチも削除候補にする
  （基準以外向けの sub-PR や GitHub Copilot 等が作ってクローズしたブランチも掃除できる）。"マージ済みブランチを削除",
  "delete merged branches", "ローカル/リモートブランチを掃除", "ブランチ整理" などで使う。
---

# マージ済みローカル・リモートブランチの削除

`git branch --merged` は祖先関係のみ見るため、squash/rebase merge では未マージ扱いになる。本スキルでは祖先判定に加え、GitHub の merged PR の `headRefOid` 一致でローカル・リモート両方の削除対象を安全に決める。あわせて、**クローズされた（未マージ）PR** のブランチは**リモートのみ**削除候補とする（ローカルは対象にしない）。クローズ PR は `gh pr list --state closed` でリポジトリ全体から取得するため、基準以外のブランチ向けに作られた sub-PR（例: copilot/sub-pr-\*）も候補になる。主 remote は `origin` を前提とする。

## 推奨: スクリプトで一括実行

事前に `git fetch origin --prune` と `gh auth status` が通ることを確認したうえで、以下で候補列挙・確認・削除まで行う。

```bash
git fetch origin --prune
./scripts/delete-merged-branches.sh [基準ブランチ] [--dry-run]
```

- **基準ブランチ**: 省略時はローカルに `develop` があれば `develop`、なければ `origin/HEAD` の短縮名（例: main）。
- **--dry-run**: 削除はせず、削除候補一覧と理由だけ表示する。
- **非対話で実行する場合**（CI やエージェントから確認なしで削除する場合）: `echo y | ./scripts/delete-merged-branches.sh` で確認プロンプトに自動で `y` を送る。

スクリプトは (1) merged PR を `gh pr list --state merged --base <基準>` で一括取得し `headRefName` / `headRefOid` で照合する。(2) クローズ済み未マージ PR を `gh pr list --state closed`（**--base なし**、リポジトリ全体）から `mergedAt == null` かつ同一リポジトリ（fork は `isCrossRepository` で除外）で抽出する。ローカル候補は祖先 or merged PR の headRefOid 一致のみ。リモート専用候補は「merged PR で tip 一致」に加え、**クローズ済み未マージ PR については** origin の tip が当該 PR の `headRefOid` と一致する場合のみ（かつ `mergedAt == null`）削除候補に含め、さらに同名ブランチに open PR がある場合は削除しない。確認後にローカル削除 → リモート削除の順で実行する。

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
   `git for-each-ref refs/remotes/origin --format='%(refname:short)' | sed 's|^origin/||'` で一覧。保護ブランチ・ローカルに存在するブランチは除外。(a) merged PR の JSON でそのブランチの `headRefOid` が origin の tip と一致する場合。(b) 別途 `gh pr list --state closed`（--base なし）から `mergedAt == null` かつ同一リポジトリの PR の `headRefName` と `headRefOid` を取得し、**origin の tip が headRefOid と一致する**リモートブランチのみ対象とする。このとき、同名ブランチに open PR がある場合は削除しない（基準以外向けの sub-PR や Copilot ブランチを含む）。

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
- `sub` - closed PR #XXX (remote-only)

Skipped:

- `feature/baz` - current branch
- `feature/adv` - PR merged but tip advanced after merge
```

削除件数とスキップ理由を必ず添える。

## 現状把握（調査時）

リモートブランチ一覧と PR 状態を確認する例:

```bash
git fetch origin --prune
git for-each-ref refs/remotes/origin --format='%(refname:short)' | sed 's|^origin/||' | grep -v '^HEAD$' | sort
# 各ブランチの PR 状態: gh pr list --state all --head <branch> --limit 1 --json state,number,mergedAt,baseRefName
```

削除候補の洗い出しには `./scripts/delete-merged-branches.sh --dry-run` が使える。

## 注意点

- merged PR があっても、ローカルまたはリモートの tip が `headRefOid` と一致しない場合は削除しない（merge 後に進んだ可能性あり）。
- クローズ済み未マージ PR のブランチは**リモート削除のみ**対象。ローカルに同じ名前のブランチがあっても、merged でない限りローカルは削除しない（安全のため）。
- 主 remote が `origin` でない構成では手順を流用するかユーザーに確認する。
- `gh` が使えない場合は、祖先で merged と判定できるローカルブランチと、その同名の `origin` 上のリモートブランチを ancestry ベースでのみ削除し、PR の `headRefOid` による squash/rebase 判定およびクローズ済み PR の取得は行わない。
