> **Language:** English | [日本語](DOCUMENTATION.ja.md)

# Public documentation policy

This repository keeps **user-facing GitHub entry docs** in English (canonical) with **full Japanese pairs** (`.ja.md`). This is separate from [SPECIFICATION_POLICY.md](SPECIFICATION_POLICY.md): API contracts and behavior live in **TSDoc/JSDoc and tests**, not in Markdown trees.

## Scope

| English (default)                                                | Japanese pair                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [README.md](README.md)                                           | [README.ja.md](README.ja.md)                                           |
| [CONTRIBUTING.md](CONTRIBUTING.md)                               | [CONTRIBUTING.ja.md](CONTRIBUTING.ja.md)                               |
| [SECURITY.md](SECURITY.md)                                       | [SECURITY.ja.md](SECURITY.ja.md)                                       |
| [DOCUMENTATION.md](DOCUMENTATION.md)                             | [DOCUMENTATION.ja.md](DOCUMENTATION.ja.md)                             |
| [extension/README.md](extension/README.md)                       | [extension/README.ja.md](extension/README.ja.md)                       |
| [server/mcp/README.md](server/mcp/README.md)                     | [server/mcp/README.ja.md](server/mcp/README.ja.md)                     |
| [admin/README.md](admin/README.md)                               | [admin/README.ja.md](admin/README.ja.md)                               |
| [terraform/cloudflare/README.md](terraform/cloudflare/README.md) | [terraform/cloudflare/README.ja.md](terraform/cloudflare/README.ja.md) |

**Out of scope:** [AGENTS.md](AGENTS.md), [SPECIFICATION_POLICY.md](SPECIFICATION_POLICY.md), [CLAUDE.md](CLAUDE.md), [CHANGELOG.md](CHANGELOG.md), gitignored local `docs/`.

## Naming

- GitHub shows `README.md` (etc.) by default — always English.
- Japanese full versions use the same basename + `.ja.md` (e.g. `README.ja.md`).

## Language banner (required)

First lines of each file:

**English:**

```markdown
> **Language:** English | [日本語](README.ja.md)
```

**Japanese:**

```markdown
> **言語:** [English](README.md) | 日本語
```

Use relative links to the paired file. In subdirectories, link to the sibling pair in the same folder.

## Update workflow

1. **English is canonical** — write or change English first.
2. **Same PR** — update the `.ja.md` pair in the same pull request (full parity).
3. For large doc-only PRs, note in the PR body: `Doc parity: EN updated, JA follows in this PR`.

## What belongs in public docs

- Project overview, setup, contribution, security reporting
- Pointers to TSDoc/tests for detailed contracts

## What does not belong here

- Module acceptance criteria or non-goals (→ TSDoc)
- Detailed behavior specs (→ tests)
- Long drafts (→ local gitignored `docs/` only)

## CI check

```bash
bun run docs:check-pairs
```

Verifies pair files exist and language banners are present.
