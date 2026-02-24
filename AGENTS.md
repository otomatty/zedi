# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Zedi is an AI-native knowledge management SPA (React 18 + TypeScript + Vite). Data is stored locally in an in-browser SQLite database; no external database or Docker is needed for development.

### Runtime & Package Manager

- **Bun** is the primary runtime and package manager (`bun.lock`). Install with `curl -fsSL https://bun.sh/install | bash`.
- After installing Bun, ensure it's on PATH: `export BUN_INSTALL="$HOME/.bun" && export PATH="$BUN_INSTALL/bin:$PATH"`.

### Authentication Bypass

The app requires Clerk authentication by default. For local development without Clerk API keys, set `VITE_E2E_TEST=true` to use the mock auth provider. Either:
- Create `.env` with `VITE_E2E_TEST=true`, or
- Pass it inline: `VITE_E2E_TEST=true bun run dev`

### Key Commands

See `package.json` scripts for the full list. The most important ones:

| Task | Command |
|------|---------|
| Dev server | `VITE_E2E_TEST=true bun run dev` (port 30000) |
| Lint | `bun run lint` |
| Unit tests | `bun run test:run` |
| Build | `bun run build` |

### Gotchas

- `Header.tsx` was fixed to use mock-aware auth hooks (`@/hooks/useAuth`) instead of direct `@clerk/clerk-react` imports. If auth errors appear in E2E mode, check whether any component is importing Clerk hooks directly instead of from `@/hooks/useAuth`.
- The optional Cloudflare Workers (`workers/ai-api/`, `workers/thumbnail-api/`) use npm (not Bun) and are only needed for AI generation and thumbnail features.
- The Vite dev server defaults to port 30000 (not the usual 5173). Port can be changed via `VITE_PORT` env var.
