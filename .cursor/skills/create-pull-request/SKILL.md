---
name: create-pull-request
description: >
  Investigate branch changes and create a pull request with a well-structured
  description following the project PR template. Use when the user asks to
  "create a PR", "make a pull request", "open a PR", or "PRを作成して".
---

# Create Pull Request

## Preflight

Before starting, verify prerequisites:

```bash
git status                          # clean working tree
git branch --show-current           # current branch name
gh auth status                      # GitHub CLI authenticated
```

If working tree is dirty, ask the user whether to commit or stash first.

## Investigation workflow

Run **Phase 1** commands in parallel (they are independent), then **Phase 2**.

### Phase 1: Gather context (run in parallel)

```bash
# 1a. Branch info
BASE_BRANCH="develop"   # default; override if user specifies
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

## PR description assembly

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

- Verify each item by running:
  ```bash
  bun run lint          # lint check
  bun run format:check  # format check
  bun run test          # unit tests (if available)
  ```

### スクリーンショット

- If UI changes exist (files in `admin/src/pages/`, `src/components/`, etc.), note that screenshots should be added.

### 関連 Issue

- Use `Closes #NNN` for each related issue found in Phase 1-1f.
- Use `Related to #NNN` for issues that are referenced but not fully resolved.

## Creating the PR

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

### Existing PR (update description)

If Phase 1-1g found an existing PR, update it instead:

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

| Situation                    | Action                                          |
| ---------------------------- | ----------------------------------------------- |
| Working tree is dirty        | Ask user: commit, stash, or abort               |
| Existing PR found            | Update existing PR body instead of creating new |
| Base branch not specified    | Default to `develop`                            |
| PR is very large (>50 files) | Suggest splitting, but proceed if user confirms |
| CI checks exist              | Run lint/format/test before creating PR         |

## Response format

After creating or updating the PR, return:

1. PR URL
2. Summary of what was included
3. Any items that need manual attention (screenshots, env vars to set, migrations to run)
