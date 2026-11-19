> **Language:** English | [日本語](tauriRemoval.ja.md)

# Dropping Tauri: inventory of desktop-only features (current app)

> Written during the verification (`poc/honoJsx/`). "This PoC" below means what is now `app/`. Applying migrations on deploy was later dropped together with Railway.

Decision: Zedi becomes a web app only (PWA, with offline support). This document lists everything in the current app (`/`, not this PoC) that depends on Tauri or exists only for the desktop app.

**Status: everything below has been deleted**, including the items that needed a product decision (the owner chose to delete them too). Stored documents keep their content: hocuspocus converts executable code blocks, MCP resource embeds and `@file:` marks into web nodes when it loads a document (`server/hocuspocus/src/desktopContentMigration.ts`). Migration `0034_remove_desktop_pdf_reader.sql` drops PDF highlights and `pdf_local` sources when it is deployed.

How it is wired today: every Tauri call in the front end sits behind `isTauriDesktop()` (`src/lib/platform.ts`, about 40 call sites; `src/lib/storageAdapter/createStorageAdapter.ts` has its own copy of the check). Web users therefore never see these features. The real coupling is in node types stored in documents, the server's PDF tables, and build/CI.

## Inventory

| #   | Item                                                   | What it does                                                                      | Web counterpart                                                                              | If removed                                                                                                                                                                                            |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tauri shell (`src-tauri/`)                             | Native window, 16 IPC commands, dialog/shell/store/updater plugins                | —                                                                                            | Items 3, 7, 10, 11 call its commands                                                                                                                                                                  |
| 2   | Platform detection (`src/lib/platform.ts`)             | Desktop vs web switch                                                             | —                                                                                            | Remove once its callers are gone                                                                                                                                                                      |
| 3   | Claude Code sidecar (`packages/claude-sidecar`)        | Runs the Claude Agent SDK on the user's machine                                   | None                                                                                         | Items 4–9 go through it                                                                                                                                                                               |
| 4   | "Claude Code" AI mode / provider                       | AI chat through the local Claude CLI subscription                                 | **Yes**: server mode and own-API-key mode                                                    | Unreachable branches to clean up; no settings migration needed (web never stores this mode)                                                                                                           |
| 5   | MCP client server settings                             | Add MCP servers for Claude Code (incl. import from `~/.claude.json`)              | None                                                                                         | Only visible in Claude Code mode. Not to be confused with `server/mcp` (Zedi's own MCP server), which stays                                                                                           |
| 6   | MCP resource embed node                                | Embeds a resource fetched over MCP                                                | None (web shows "desktop only")                                                              | **Stored in documents**: keep the schema with a read-only view, or migrate                                                                                                                            |
| 7   | Agent slash commands (`/analyze`, `/run`, `/review` …) | Runs a Claude agent on the note or local files                                    | None                                                                                         | explain / summarize / research could move to server AI; git-summary / run / test cannot                                                                                                               |
| 8   | Executable code block                                  | Notebook-style cell run through Claude's Bash tool                                | None (renders, cannot run)                                                                   | **Stored in documents** and referenced by `server/hocuspocus` (`ydocWikiLinkNormalizer.ts`): keep the schema or migrate to `codeBlock`. Its settings toggle shows on web today, where it does nothing |
| 9   | AI chat "Workflow" tab                                 | Multi-step Claude Code runs that write into the note                              | None (tab hidden)                                                                            | Could be ported onto server-side agents                                                                                                                                                               |
| 10  | Note workspace (link a local folder)                   | Working directory for Claude, `@file:` previews and path completion               | None                                                                                         | The `fileReference` mark is **stored in documents**. Port: File System Access API (Chromium only)                                                                                                     |
| 11  | Local PDF reader                                       | Opens a local PDF, highlights, makes pages from highlights (bytes never uploaded) | Partly: only file register/read/verify is native; pdf.js, highlights and API work on the web | Deleting it drops `server/api/src/routes/pdfSources.ts`, two tables (migrations `0025`/`0026`), highlight search, an E2E test and pdf.js assets                                                       |
| 12  | Auto-update                                            | Signed desktop updates                                                            | Not needed on the web                                                                        | No front-end code; `TAURI_SIGNING_*` secrets                                                                                                                                                          |
| 13  | Unused plugins                                         | `@tauri-apps/plugin-store`, `plugin-shell`, `plugin-updater` never imported       | —                                                                                            | None                                                                                                                                                                                                  |
| 14  | Build, CI, docs                                        | Desktop release pipeline                                                          | —                                                                                            | `tauri-release.yml`, release-please `extra-files` and Cargo.lock job, `package.json` scripts and deps, `vite.config.ts` `TAURI_*` settings, ignore files, README and AGENTS.md                        |

Not found (nothing to remove): deep links, global shortcuts, tray, notifications, Tauri file system plugin. Leftover help text only: the `zedi://oauth/callback` desktop callback in the Gyazo settings. No `tauri://` origin appears in code (CORS comes from the `CORS_ORIGIN` env; check the deployed values).

Note on the current PWA: it is a manifest only (`public/site.webmanifest`) with no service worker. The offline design proven in this PoC (README, "Offline (PWA)") would be new work.

## Recommendation

**Delete (no impact on web users):**

1. Release pipeline: `tauri-release.yml`, the Cargo.lock job and `extra-files` in release-please, `scripts/inject-tauri-updater-pubkey.mjs`, the `TAURI_SIGNING_*` secrets
2. `src-tauri/` (icons included), `tauri*` scripts, `@tauri-apps/cli` and the unused plugins, Tauri settings in `vite.config.ts` and ignore files
3. `packages/claude-sidecar` and its scripts, plus its entries in tests, coverage, knip and CI
4. Claude Code mode (4) and MCP client settings (5): invisible on the web, and the existing modes cover AI chat
5. The desktop sections of README / AGENTS.md

Keep `@tauri-apps/api` and `plugin-dialog` installed until the files that import them statically are gone (`src/lib/claudeCode/bridge.ts`, `src/lib/workspace/bridge.ts`, `src/lib/noteWorkspace/*`), or the web build breaks.

**Needs a product decision:**

- **PDF reader (11)**: the best candidate to port (open with `<input type=file>` plus a hash check, or upload to R2). Deleting it means dropping server routes, tables and search integration.
- **Nodes stored in documents (6, 8, 10)**: documents created on the desktop sync to the web, so the schemas must stay read-only or be migrated, whichever way the features go.
- **Workflows and agent slash commands (7, 9)**: port to server-side AI or delete.
- **Local folders (10)**: port with File System Access (Chromium only) or delete.

In the from-scratch rebuild this PoC explores, none of these exist yet, so the decision is mainly whether to carry each one over.
