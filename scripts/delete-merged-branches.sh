#!/usr/bin/env bash
# 後方互換ラッパー。実体はグローバル Skill に移行済み。
exec "${DELETE_MERGED_BRANCHES_SCRIPT:-$HOME/.cursor/skills/delete-merged-branches/scripts/delete-merged-branches.sh}" "$@"
