#!/usr/bin/env bash
# 基準ブランチにマージ済みのローカルブランチと origin 上のリモートブランチを安全に削除する。
# 使用例: ./scripts/delete-merged-branches.sh [基準ブランチ] [--dry-run]

set -e

DRY_RUN=false
BASE_BRANCH=""
for arg in "$@"; do
  if [ "$arg" = "--dry-run" ]; then
    DRY_RUN=true
  elif [ -z "$BASE_BRANCH" ]; then
    BASE_BRANCH="$arg"
  fi
done

echo "Fetching and pruning remote refs..."
git fetch origin --prune

origin_default="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"
if [ -z "$BASE_BRANCH" ]; then
  if git rev-parse --verify develop >/dev/null 2>&1; then
    BASE_BRANCH="develop"
  else
    BASE_BRANCH="${origin_default:-main}"
  fi
fi
base_remote="origin/$BASE_BRANCH"
if ! git rev-parse --verify "$base_remote" >/dev/null 2>&1; then
  echo "Error: base branch ref $base_remote does not exist." >&2
  exit 1
fi
current_branch="$(git branch --show-current)"
# 保護ブランチ: 基準・main/master/develop・現在・origin のデフォルト
protected="$BASE_BRANCH main master develop $current_branch $origin_default"

is_protected() {
  local b="$1"
  for p in $protected; do
    [ "$b" = "$p" ] && return 0
  done
  return 1
}

merged_file=""
closed_unmerged_file=""
if command -v gh >/dev/null 2>&1; then
  merged_file="$(mktemp 2>/dev/null || echo "/tmp/merged-prs.$$")"
  closed_unmerged_file="$(mktemp 2>/dev/null || echo "/tmp/closed-unmerged-prs.$$")"
  trap 'rm -f "$merged_file" "$closed_unmerged_file"' EXIT
  gh pr list --state merged --base "$BASE_BRANCH" --limit 200 --json headRefName,headRefOid,number \
    --jq '.[] | "\(.headRefName)\t\(.headRefOid)\t\(.number)"' 2>/dev/null >"$merged_file" || true
  # クローズ済み（未マージ）PR のブランチ名・headRefOid・番号。--base は付けずリポジトリ全体から取得。同一リポジトリの PR のみ（fork を除外）。
  # origin tip と headRefOid が一致する場合のみ削除候補にする（クローズ後に push されたブランチを誤削除しないため）。
  gh pr list --state closed --limit 500 --json headRefName,headRefOid,number,mergedAt,isCrossRepository \
    --jq '.[] | select(.mergedAt == null and (.isCrossRepository | not)) | "\(.headRefName)\t\(.headRefOid)\t\(.number)"' 2>/dev/null >"$closed_unmerged_file" || true
fi

# merged 一覧から branch の oid と number を取得（1行 "oid number" を返す）。見つからない場合は何も出力せず return 0（set -e で落ちないように）
get_merged_oid_and_num() {
  local branch="$1"
  if [ -z "$merged_file" ] || [ ! -s "$merged_file" ]; then
    return 0
  fi
  local oid num
  oid="$(awk -v b="$branch" 'BEGIN{FS="\t"} $1==b {print $2; exit}' "$merged_file" 2>/dev/null)"
  num="$(awk -v b="$branch" 'BEGIN{FS="\t"} $1==b {print $3; exit}' "$merged_file" 2>/dev/null)"
  [ -z "$oid" ] && return 0
  echo "$oid $num"
}

echo "Base branch: $BASE_BRANCH ($base_remote)"
echo "Current branch: $current_branch"
[ "$DRY_RUN" = true ] && echo "(dry-run: no branches will be deleted)"
echo ""

deleted_remote_only=""

# ローカル削除候補を列挙（branch:reason の行を蓄積）
local_candidates=""
remote_delete_names=""

while IFS= read -r branch; do
  [ -z "$branch" ] && continue
  is_protected "$branch" && continue
  reason=""
  oid_num=""
  if git merge-base --is-ancestor "$branch" "$base_remote" 2>/dev/null; then
    reason="merged by ancestry"
  else
    oid_num="$(get_merged_oid_and_num "$branch")"
    if [ -n "$oid_num" ]; then
      tip="$(git rev-parse "$branch" 2>/dev/null)"
      oid="${oid_num%% *}"
      num="${oid_num#* }"
      if [ "$oid" = "$tip" ]; then
        reason="merged PR #${num} (squash/rebase-safe)"
      fi
    fi
  fi
  if [ -n "$reason" ]; then
    local_candidates="${local_candidates}${local_candidates:+$'\n'}${branch}:${reason}"
    if git rev-parse --verify "origin/$branch" >/dev/null 2>&1; then
      remote_tip="$(git rev-parse "origin/$branch" 2>/dev/null)"
      safe_remote=false
      if git merge-base --is-ancestor "origin/$branch" "$base_remote" 2>/dev/null; then
        safe_remote=true
      elif [ -n "$oid_num" ]; then
        oid="${oid_num%% *}"
        [ "$oid" = "$remote_tip" ] && safe_remote=true
      fi
      if [ "$safe_remote" = true ] && ! has_open_pr "$branch"; then
        remote_delete_names="${remote_delete_names}${remote_delete_names:+$'\n'}${branch}:local:${reason}"
      fi
    fi
  fi
done < <(git for-each-ref refs/heads --format='%(refname:short)')

# リモート専用の削除候補（ローカルに ref が無く、origin にあり）
# (1) merged PR で tip 一致 → 削除可
# (2) クローズ済み未マージ PR のブランチ（GitHub Copilot 等が作ってクローズしたブランチ）→ origin tip が headRefOid と一致する場合のみ削除可
get_closed_unmerged_oid_and_num() {
  local branch="$1"
  if [ -z "$closed_unmerged_file" ] || [ ! -s "$closed_unmerged_file" ]; then
    return 0
  fi
  local oid num
  oid="$(awk -v b="$branch" 'BEGIN{FS="\t"} $1==b {print $2; exit}' "$closed_unmerged_file" 2>/dev/null)"
  num="$(awk -v b="$branch" 'BEGIN{FS="\t"} $1==b {print $3; exit}' "$closed_unmerged_file" 2>/dev/null)"
  [ -z "$oid" ] && return 0
  echo "$oid $num"
}

# 指定ブランチに open PR があるか（同名の open PR があると削除しない）。ブランチ単位で照会し件数上限に依存しない。
has_open_pr() {
  local branch="$1"
  local count
  if ! count="$(gh pr list --state open --head "$branch" --limit 1 --json number --jq 'length' 2>/dev/null)"; then
    return 0   # gh 失敗時は安全のため「open PR あり」とみなして削除しない
  fi
  [ "${count:-0}" -gt 0 ] && return 0
  return 1
}
while IFS= read -r ref; do
  if [ -z "$ref" ] || [ "$ref" = "HEAD" ]; then
    continue
  fi
  is_protected "$ref" && continue
  git rev-parse --verify "refs/heads/$ref" >/dev/null 2>&1 && continue
  if ! git rev-parse --verify "origin/$ref" >/dev/null 2>&1; then
    continue
  fi
  oid_num="$(get_merged_oid_and_num "$ref")"
  if [ -n "$oid_num" ]; then
    tip="$(git rev-parse "origin/$ref" 2>/dev/null)"
    oid="${oid_num%% *}"
    num="${oid_num#* }"
    if [ "$oid" = "$tip" ] && ! has_open_pr "$ref"; then
      deleted_remote_only="${deleted_remote_only}${deleted_remote_only:+$'\n'}${ref}:merged PR #${num} (remote-only)"
      remote_delete_names="${remote_delete_names}${remote_delete_names:+$'\n'}${ref}:remote-only:merged PR #${num} (remote-only)"
    fi
  else
    closed_oid_num="$(get_closed_unmerged_oid_and_num "$ref")"
    if [ -n "$closed_oid_num" ] && ! has_open_pr "$ref"; then
      tip="$(git rev-parse "origin/$ref" 2>/dev/null)"
      closed_oid="${closed_oid_num%% *}"
      closed_num="${closed_oid_num#* }"
      if [ "$closed_oid" = "$tip" ]; then
        deleted_remote_only="${deleted_remote_only}${deleted_remote_only:+$'\n'}${ref}:closed PR #${closed_num} (remote-only)"
        remote_delete_names="${remote_delete_names}${remote_delete_names:+$'\n'}${ref}:remote-only:closed PR #${closed_num} (remote-only)"
      fi
    fi
  fi
done < <(git for-each-ref refs/remotes/origin --format='%(refname:short)' | sed 's|^origin/||')

# 報告用に削除予定を表示
report_local=""
report_remote=""
count_local=0

while IFS= read -r line; do
  [ -z "$line" ] && continue
  branch="${line%%:*}"
  reason="${line#*:}"
  report_local="${report_local}${report_local:+$'\n'}- \`${branch}\` - ${reason}"
  ((count_local++)) || true
done <<< "$local_candidates"

# リモート削除候補はすべて表示（:local と :remote-only の両方）
while IFS= read -r line; do
  [ -z "$line" ] && continue
  name="${line%%:*}"
  rest="${line#*:}"
  rest="${rest#*:}" # branch:local:reason or branch:remote-only:reason -> reason
  report_remote="${report_remote}${report_remote:+$'\n'}- \`${name}\` - ${rest}"
done <<< "$remote_delete_names"

total_remote=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  ((total_remote++)) || true
done <<< "$remote_delete_names"

if [ -z "$report_local" ] && [ -z "$report_remote" ]; then
  echo "No branches to delete."
  exit 0
fi

echo "--- Candidates ---"
[ -n "$report_local" ] && echo "Deleted (local):" && echo "$report_local" && echo ""
[ -n "$report_remote" ] && echo "Deleted (remote):" && echo "$report_remote" && echo ""

if [ "$DRY_RUN" = true ]; then
  echo "Dry-run: would delete $count_local local branch(es) and $total_remote remote branch(es)."
  exit 0
fi

echo "Delete $count_local local and $total_remote remote branch(es)? [y/N]"
read -r confirm
case "$confirm" in
  [yY]|[yY][eE][sS]) ;;
  *) echo "Aborted."; exit 0 ;;
esac

deleted_local_count=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  branch="${line%%:*}"
  if git branch -d "$branch" 2>/dev/null || git branch -D "$branch" 2>/dev/null; then
    ((deleted_local_count++)) || true
  fi
done <<< "$local_candidates"

deleted_remote_count=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  name="${line%%:*}"
  if git rev-parse --verify "origin/$name" >/dev/null 2>&1; then
    if git push origin --delete "$name" 2>/dev/null; then
      ((deleted_remote_count++)) || true
    fi
  fi
done <<< "$remote_delete_names"

echo ""
echo "Done. Deleted $deleted_local_count local and $deleted_remote_count remote branch(es)."
