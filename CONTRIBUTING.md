> **Language:** English | [日本語](CONTRIBUTING.ja.md)

# Contributing to Zedi

Thank you for your interest in contributing to Zedi!

This guide explains how to contribute to the project.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Questions?](#questions)

---

## Code of Conduct

We expect all participants to treat each other with respect and maintain an inclusive environment. Harassment and discriminatory behavior are not tolerated.

---

## Getting Started

### 1. Fork the repository

Fork this repository on GitHub.

### 2. Clone locally

```bash
git clone https://github.com/<your-username>/zedi.git
cd zedi
```

### 3. Setup

```bash
# Recommended: run setup script
bash scripts/setup.sh

# Or manually
bun install
```

### 4. Configure upstream

```bash
git remote add upstream https://github.com/otomatty/zedi.git
```

### 5. Start the dev server

```bash
bun run dev
```

---

## Development Workflow

### Branch naming

| Type          | Format                                                                                                 | Example                 |
| ------------- | ------------------------------------------------------------------------------------------------------ | ----------------------- |
| Feature       | `feature/description`                                                                                  | `feature/add-backlinks` |
| Bug Fix       | `fix/description`                                                                                      | `fix/search-crash`      |
| Refactor      | `refactor/description`                                                                                 | `refactor/editor-hooks` |
| Documentation | `chore/description` or `documentation/description` (avoid `docs/` — easily confused with folder names) | `chore/update-readme`   |

### Development flow

> 📖 **Branches, PRs, and merge policy**: See root [AGENTS.md](./AGENTS.md).

1. **Sync latest from `develop`**

   ```bash
   git fetch origin
   git checkout develop
   git pull origin develop
   ```

2. **Create a feature branch**

   ```bash
   git checkout -b feature/your-feature
   ```

3. **Implement changes**
   - Write code
   - Add tests
   - Update documentation (English canonical + Japanese `.ja.md` pair when applicable — see [DOCUMENTATION.md](./DOCUMENTATION.md))

4. **Run tests and quality checks**

   ```bash
   # Unit tests
   bun run test

   # E2E tests
   bun run test:e2e

   # Lint
   bun run lint

   # Format
   bun run format

   # Format check (same as CI)
   bun run format:check
   ```

   > **Note:** [husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) run lint and format on commit.
   > Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/) ([commitlint](https://commitlint.js.org/) validates them).

5. **Commit and push**

   ```bash
   git add .
   git commit -m "feat: add backlinks feature"
   git push origin feature/your-feature
   ```

6. **Open a Pull Request**
   - Base branch: `develop`
   - CI runs automatically — ensure all checks pass

---

## Pull Request Process

### Before opening a PR

- [ ] All tests pass
- [ ] No lint errors
- [ ] Link related Issues if any
- [ ] Update documentation when needed (EN canonical + JA pair if applicable)

### PR template

```markdown
## Summary

Brief description of changes

## Changes

- Change 1
- Change 2

## How to test

Steps to verify this change

## Screenshots (if UI changes)

## Related Issue

Closes #123
```

### Review process

1. Maintainers review your PR after you open it
2. Address feedback as needed
3. Merge after approval

---

## Coding Standards

### TypeScript

- Use explicit types
- Avoid `any`
- Specify return types on functions

```typescript
// ✅ Good
function getPage(id: string): Page | undefined {
  return pages.find((p) => p.id === id);
}

// ❌ Bad
function getPage(id) {
  return pages.find((p) => p.id === id);
}
```

### React

- Use function components
- Extract logic into custom hooks
- Explicit prop types

```typescript
// ✅ Good
interface PageCardProps {
  page: Page;
  onClick: (id: string) => void;
}

export function PageCard({ page, onClick }: PageCardProps) {
  return <div onClick={() => onClick(page.id)}>{page.title}</div>;
}
```

### File layout

```
src/
├── components/
│   └── feature/
│       ├── FeatureComponent.tsx
│       └── FeatureComponent.test.tsx
├── hooks/
│   └── useFeature.ts
└── lib/
    └── featureUtils.ts
```

### Styling

- Use Tailwind CSS
- Prefer shadcn/ui components
- Keep custom styles minimal

---

## Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Type

| Type       | Description                              |
| ---------- | ---------------------------------------- |
| `feat`     | New feature                              |
| `fix`      | Bug fix                                  |
| `docs`     | Documentation only                       |
| `style`    | Formatting, no code meaning change       |
| `refactor` | Code change that is not a fix or feature |
| `perf`     | Performance improvement                  |
| `test`     | Add or update tests                      |
| `chore`    | Build process or tooling                 |

### Examples

```bash
feat(editor): add WikiLink autocomplete
fix(search): resolve crash on empty query
docs(readme): update installation instructions
refactor(hooks): simplify usePageQueries
```

---

## Reporting Bugs

Open an Issue when you find a bug.

### Include in the Issue

1. **Summary** — What is wrong
2. **Steps to reproduce**
3. **Expected behavior**
4. **Actual behavior**
5. **Environment**
   - OS and version
   - Browser and version
   - Zedi version
6. **Screenshots** — If possible

### Template

```markdown
## Bug summary

Clicking a search result does not open the page

## Steps to reproduce

1. Open search with Cmd+K
2. Type "test"
3. Click a result

## Expected behavior

The clicked page opens

## Actual behavior

Nothing happens

## Environment

- OS: macOS Sonoma 14.2
- Browser: Chrome 120
- Zedi: v0.1.0

## Screenshots

[Paste screenshot here]
```

---

## Suggesting Features

Open an Issue for feature ideas.

### Include in the proposal

1. **Summary** — What you want to add
2. **Motivation** — Why it is needed
3. **Details** — Detailed description
4. **Alternatives** — Other approaches considered

---

## Questions?

Open an Issue or ask in Discussions.

---

Thank you for contributing to Zedi! 🎉
