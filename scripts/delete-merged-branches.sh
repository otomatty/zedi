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
if command -v gh >/dev/null 2>&1; then
  merged_file="$(mktemp 2>/dev/null || echo "/tmp/merged-prs.$$")"
  trap 'rm -f "$merged_file"' EXIT
  gh pr list --state merged --base "$BASE_BRANCH" --limit 200 --json headRefName,headRefOid,number \
    --jq '.[] | "\(.headRefName)\t\(.headRefOid)\t\(.number)"' 2>/dev/null >"$merged_file" || true
fi

# merged 一覧から branch の oid と number を取得（1行 "oid number" を返す）。見つからない場合は何も出力せず return 0（set -e で落ちないように）
get_merged_oid_and_num() {
  local branch="$1"
  [ -z "$merged_file" ] || [ ! -s "$merged_file" ] && return 0
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

deleted_local=""
deleted_remote_only=""
deleted_remote_with_local=""
skipped=""

# ローカル削除候補を列挙（branch:reason の行を蓄積）
local_candidates=""
remote_delete_names=""

for branch in $(git for-each-ref refs/heads --format='%(refname:short)'); do
  is_protected "$branch" && continue
  reason=""
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
      remote_delete_names="${remote_delete_names}${remote_delete_names:+$'\n'}${branch}:local"
    fi
  fi
done

# リモート専用の削除候補（ローカルに ref が無く、origin にあり、merged PR で tip 一致）
for ref in $(git for-each-ref refs/remotes/origin --format='%(refname:short)' | sed 's|^origin/||'); do
  [ "$ref" = "HEAD" ] && continue
  is_protected "$ref" && continue
  git rev-parse --verify "refs/heads/$ref" >/dev/null 2>&1 && continue
  if ! git rev-parse --verify "origin/$ref" >/dev/null 2>&1; then
    continue
  fi
  oid_num="$(get_merged_oid_and_num "$ref")"
  [ -z "$oid_num" ] && continue
  tip="$(git rev-parse "origin/$ref" 2>/dev/null)"
  oid="${oid_num%% *}"
  num="${oid_num#* }"
  if [ "$oid" = "$tip" ]; then
    deleted_remote_only="${deleted_remote_only}${deleted_remote_only:+$'\n'}${ref}:merged PR #${num} (remote-only)"
    remote_delete_names="${remote_delete_names}${remote_delete_names:+$'\n'}${ref}:remote-only"
  fi
done

# 報告用に削除予定を表示
report_local=""
report_remote=""
report_skipped=""
count_local=0
count_remote_only=0

while IFS= read -r line; do
  [ -z "$line" ] && continue
  branch="${line%%:*}"
  reason="${line#*:}"
  report_local="${report_local}${report_local:+$'\n'}- \`${branch}\` - ${reason}"
  ((count_local++)) || true
done <<< "$local_candidates"

while IFS= read -r line; do
  [ -z "$line" ] && continue
  branch="${line%%:*}"
  reason="${line#*:}"
  report_remote="${report_remote}${report_remote:+$'\n'}- \`${branch}\` - ${reason}"
  ((count_remote_only++)) || true
done <<< "$deleted_remote_only"

if [ -z "$report_local" ] && [ -z "$report_remote" ]; then
  echo "No branches to delete."
  exit 0
fi

echo "--- Candidates ---"
[ -n "$report_local" ] && echo "Deleted (local):" && echo "$report_local" && echo ""
[ -n "$report_remote" ] && echo "Deleted (remote only):" && echo "$report_remote" && echo ""

total_remote=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  ((total_remote++)) || true
done <<< "$remote_delete_names"

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
