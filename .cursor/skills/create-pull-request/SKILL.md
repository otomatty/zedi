---
name: create-pull-request
description: >
  Run on the develop branch: create a new branch (name or issue number),
  then create a pull request with a well-structured description following the
  project PR template. Use when the user asks to "create a PR", "make a pull
  request", "open a PR", or "PRを作成して". Branch name or issue number
  (e.g. "feature/add-login" or "123" → feature/123) should be obtained from
  the user message or requested if missing.
---

# Create Pull Request

This skill is intended to be run **on the develop branch**. It **always creates a new branch** from develop, then creates (or updates) a PR. Obtain the branch name from the user (e.g. `feature/add-login`) or derive it from an issue number (e.g. `123` → `feature/123`). If neither is provided, ask the user.

## Preflight

```bash
git status                          # current state
git branch --show-current           # must be develop (or will switch in Step 1)
gh auth status                      # GitHub CLI authenticated
```

## Step 1: Prepare develop and create the feature branch

1. **Ensure we're on develop and up to date**
   - If current branch is not `develop`: `git checkout develop` (uncommitted changes will carry over).
   - Run `git pull origin develop`.

2. **Determine the new branch name**
   - From user: e.g. `feature/add-login` or issue-only `123` → use `feature/123`.
   - If missing, ask: "ブランチ名（例: feature/add-login）またはイシュー番号（例: 123）を教えてください。"

3. **Create the branch**
   - `git checkout -b <ブランチ名>` so all current (including uncommitted) work is on the new branch.

4. **Commit if working tree is dirty**
   - Commit with an appropriate message (Conventional Commits recommended). If the user already described the change, use that for the message; otherwise derive from changed files.

## Step 2: Investigation workflow

Run **Phase 1** commands in parallel (they are independent), then **Phase 2**.

### Phase 1: Gather context (run in parallel)

```bash
BASE_BRANCH="develop"
CURRENT=$(git branch --show-current)
echo "Branch: $CURRENT -> $BASE_BRANCH"

# 1b. Commit list (chronological)
git log ${BASE_BRANCH}..HEAD --format="%h %s" --reverse

# 1c. Changed files summary
git diff ${BASE_BRANCH}..HEAD --stat

# 1d. Changes grouped by directory
git diff ${BASE_BRANCH}..HEAD --dirstat=files,0

# 1e. Commit type breakdown (Conventional Commits)
git log ${BASE_BRANCH}..HEAD --format="%s" | grep -oP '^\w+(\(\w+\))?' | sort | uniq -c | sort -rn

# 1f. Related issue numbers
git log ${BASE_BRANCH}..HEAD --format="%s" | grep -oP '#\d+' | sort -u

# 1g. Check for existing PR
gh pr list --base ${BASE_BRANCH} --head ${CURRENT} --state all --json number,title,state

# 1h. Recent PRs for style reference
git log ${BASE_BRANCH} --oneline -5
```

### Phase 2: Detect breaking changes and review points

```bash
# 2a. DB migrations
git diff ${BASE_BRANCH}..HEAD --name-only -- '*.sql' '**/drizzle/**' '**/migrations/**'

# 2b. Environment variable changes
git diff ${BASE_BRANCH}..HEAD -- '*.env.example' '*.env.sample'

# 2c. Package dependency changes
git diff ${BASE_BRANCH}..HEAD -- '**/package.json' '**/bun.lockb' '**/pnpm-lock.yaml'

# 2d. Schema / type changes
git diff ${BASE_BRANCH}..HEAD -- '**/schema/**' '**/*.d.ts'

# 2e. API route changes
git diff ${BASE_BRANCH}..HEAD --name-only -- '**/routes/**' '**/api/**'

# 2f. CI / workflow changes
git diff ${BASE_BRANCH}..HEAD --name-only -- '.github/**'

# 2g. Terraform / infra changes
git diff ${BASE_BRANCH}..HEAD --name-only -- '**/terraform/**'
```

### Phase 3: Read the PR template

```bash
cat .github/PULL_REQUEST_TEMPLATE.md
```

Always use the project's PR template as the output format.

## Step 3: Pre-push checks

Run before pushing:

```bash
bun run lint
bun run format:check
bun run test:run
```

If any command fails, fix the issues and amend or add a commit, then re-run until all pass.

## Step 4: PR description assembly

Using the investigation results, fill in the PR template. Follow these rules:

### 概要 (Summary)

- 1-3 sentences explaining **what** changed and **why**.
- Mention the feature/fix name clearly.

### 変更点 (Changes)

- Group changes by area (e.g., `admin/`, `server/api/`, `terraform/`, `docs/`).
- Each group: 1-line heading + bullet list of key changes.
- For large PRs (>30 files), use a table format:

```markdown
| 領域          | 主な変更                             |
| ------------- | ------------------------------------ |
| `admin/`      | 管理画面UI、認証ガード、AIモデル管理 |
| `server/api/` | admin用ミドルウェア、ロール追加      |
```

### 変更の種類 (Change type)

- Check the boxes based on commit type breakdown from Phase 1-1e.

### テスト方法 (Test plan)

- Provide concrete steps a reviewer can follow to verify the changes.
- Include setup steps if migrations or new env vars are required.

### チェックリスト (Checklist)

- Confirm lint/format/test were run in Step 3 and note that in the checklist.

### スクリーンショット

- If UI changes exist (files in `admin/src/pages/`, `src/components/`, etc.), note that screenshots should be added.

### 関連 Issue

- Use `Closes #NNN` for each related issue found in Phase 1-1f.
- Use `Related to #NNN` for issues that are referenced but not fully resolved.

## Step 5: Push and create or update the PR

### New PR

```bash
git push -u origin HEAD

gh pr create \
  --base "${BASE_BRANCH}" \
  --title "PR title here" \
  --body "$(cat <<'EOF'
<assembled PR body here>
EOF
)"
```

### Existing PR (update description only)

If Phase 1-1g found an existing PR for this branch, update its body instead of creating a new one:

```bash
gh pr edit <NUMBER> --body "$(cat <<'EOF'
<assembled PR body here>
EOF
)"
```

## Title convention

Derive the PR title from commit messages:

- Single-topic PR: use the main commit message as-is.
- Multi-topic PR: write a summary title covering all areas.
- Follow Conventional Commits if all commits use it.
- Write in the same language as the majority of commit messages (Japanese or English).

## Decision points

| Situation                    | Action                                             |
| ---------------------------- | -------------------------------------------------- |
| Not on develop               | Checkout develop, pull, then create the new branch |
| Branch name / issue missing  | Ask user for branch name or issue number           |
| Working tree dirty on branch | Commit on the new branch before investigation      |
| Existing PR found            | Update that PR's body instead of creating a new PR |
| Base branch not specified    | Default to `develop`                               |
| PR is very large (>50 files) | Suggest splitting, but proceed if user confirms    |
| Lint/format/test fail        | Fix, commit, then re-run Step 3 before pushing     |

## Response format

After creating or updating the PR, return:

1. PR URL
2. Summary of what was included (branch name, main changes)
3. Any items that need manual attention (screenshots, env vars to set, migrations to run)
