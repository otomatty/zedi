#!/usr/bin/env bash
# リモートでマージ済みのローカルブランチを削除する。
# 使用例: ./scripts/delete-merged-branches.sh

set -e

echo "Fetching and pruning remote refs..."
git fetch origin --prune

# リモートのデフォルトブランチ（例: main）
default_branch="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"
if [ -z "$default_branch" ]; then
  echo "Error: Could not determine the default branch for remote 'origin'." >&2
  echo "Please ensure 'origin/HEAD' is set correctly on your remote." >&2
  exit 1
fi
default_remote="origin/$default_branch"
current="$(git branch --show-current)"

echo "Default branch: $default_branch (merged into $default_remote)"
echo "Current branch: $current"
echo ""

merged_list="$(git branch --merged "$default_remote" | sed 's/^[* ]*//' | grep -v '^$')"
deleted=0

while IFS= read -r branch; do
  [ -z "$branch" ] && continue
  if [ "$branch" = "$current" ]; then
    echo "Skip (current): $branch"
    continue
  fi
  if [ "$branch" = "$default_branch" ]; then
    echo "Skip (default): $branch"
    continue
  fi
  if git branch -d "$branch" 2>/dev/null; then
    ((deleted++)) || true
  else
    echo "Skip (not fully merged or error): $branch"
  fi
done <<< "$merged_list"

echo ""
echo "Done. Deleted $deleted local branch(es)."
