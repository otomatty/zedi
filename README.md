> **Language:** English | [日本語](README.ja.md)

<p align="center">
  <img src="public/favicon.svg" alt="Zedi Logo" width="120" height="120" />
</p>

<h1 align="center">Zedi</h1>

<p align="center">
  <strong>Zero-Friction Knowledge Network</strong><br />
  An AI-native knowledge app that expands your thinking like the universe
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#demo">Demo</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#roadmap">Roadmap</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-alpha-orange" alt="Status: Alpha" />
  <img src="https://img.shields.io/badge/license-BSL%201.1-blue" alt="License: BSL 1.1" />
  <img src="https://img.shields.io/badge/PRs-welcome-brightgreen" alt="PRs Welcome" />
</p>

---

## 🌟 Overview

**Zedi** is a knowledge app that frees you from the stress of writing and the obligation to organize.

Traditional note apps force you to classify information into folders and create links by hand. Zedi uses AI scaffolding and a WikiLink network so your thinking can grow naturally.

### 💡 Design Principles

- **Speed & Flow** — Zero startup delay, no manual save. Write at the speed of thought
- **Context over Folder** — No folders. Organize naturally through time and links
- **Atomic & Constraint** — One idea per page. Connect small pieces
- **Scaffolding by AI** — AI automatically builds scaffolding for your knowledge
- **Dormant Seeds** — Unorganized notes are allowed as seeds waiting to sprout

---

## ✨ Features

### 📅 Date Grid

Pages grouped by date in a grid view. See at a glance when you wrote what.

### 🔗 WikiLinks

Link pages with `[[Page Title]]` syntax. Autocomplete helps you reach existing pages quickly.

### 🤖 AI Wiki Generator

Select a keyword and let AI generate an explanation with related topic links inserted automatically. Your knowledge network grows on its own.

### 🌐 Web Clipper

Enter a URL to extract the page body automatically. Link keywords at your own pace later.

### 🔍 Global Search

Press `Cmd+K` / `Ctrl+K` for full-text search. Find pages containing your keywords instantly.

### 🔀 Linked Pages

Related pages appear at the bottom of each page:

- **Outgoing Links** — Pages this page links to
- **Backlinks** — Pages that link here
- **2-hop Links** — Follow links from linked pages

### ⌨️ Keyboard Shortcuts

- `Cmd/Ctrl + K` — Global search
- `Cmd/Ctrl + N` — Create new page
- `Cmd/Ctrl + H` — Go home
- `Cmd/Ctrl + /` — Shortcut list

### 📝 Markdown Editor

Tiptap-based rich editor with seamless Markdown shortcuts:

- `# ` → Heading
- `- ` → Bullet list
- `> ` → Blockquote
- `**text**` → Bold
- `` ` `` → Code block

---

## 🎬 Demo

> 🚧 **Coming Soon** — Screenshots and demo video are in preparation

<!--
Demo screenshots: place assets under public/ when available. Tracked prose lives in source (TSDoc); optional local docs/ is gitignored — see AGENTS.md.
-->

---

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.0 or later (required)
- [Node.js](https://nodejs.org/) v24 or later (optional; used by CI and some scripts — see `.nvmrc` / `engines.node`)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/otomatty/zedi.git
cd zedi

# First-time setup (deps, hooks, .env, build verify, agent mirrors)
bun run init

# Start the dev server
bun run dev
```

### Manual Setup

```bash
git clone https://github.com/otomatty/zedi.git
cd zedi
bun run init
bun run dev
```

Open http://localhost:30000 in your browser (default port).

### Port Configuration

When running multiple app instances in parallel, you can change the port:

```bash
# Option 1: environment variable
VITE_PORT=30001 bun run dev

# Option 2: .env.local file
echo "VITE_PORT=30001" > .env.local
bun run dev
```

If the port is in use, the next available port is chosen automatically.

### Parallel Development with Docker (Optional)

To run multiple application instances in parallel:

```bash
# Build Docker image
bun run docker:build

# Start all instances (3 at once)
bun run docker:up

# Start in background
bun run docker:up:d

# Stop
bun run docker:down

# View logs
bun run docker:logs
```

After startup, access:

- Instance 1: http://localhost:30000
- Instance 2: http://localhost:30001
- Instance 3: http://localhost:30002

When running multiple Docker instances, offset ports as needed (share the procedure within your team).

> **Note:** Docker requires at least 8 GB RAM (16 GB+ recommended). For lightweight parallel dev, port configuration via environment variables is simpler.

### Desktop App (Tauri)

Zedi can also run as a desktop app via [Tauri 2.0](https://v2.tauri.app/).

#### Desktop Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) (install stable via rustup)
- **Windows**: Microsoft C++ Build Tools + Windows 11 SDK
- **macOS**: Xcode Command Line Tools (`xcode-select --install`)
- **Linux**: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, etc. ([details](https://v2.tauri.app/guides/prerequisites/))

#### Running the Desktop App

```bash
# Dev mode (Vite dev server + Tauri WebView)
bun run tauri:dev

# Production build (generates installer)
bun run tauri:build
```

- **Claude Code sidecar** ([Issue #456](https://github.com/otomatty/zedi/issues/456)): Tauri bundles a compiled helper under `src-tauri/binaries/` (`externalBin`). On first `bun run tauri:dev`, a missing binary is built automatically; run `bun run sidecar:build` manually if needed.

> **Windows + Git Bash**: If MSVC build tools are not on PATH, run from Developer Command Prompt for VS 2022 or set `LIB`, `INCLUDE`, and `PATH` in `.bashrc`. See [Issue #49](https://github.com/otomatty/zedi/issues/49).
>
> **Note**: The desktop edition is currently Phase D (in development). Storage temporarily uses IndexedDB; Tauri-native storage (SQLite) is planned in [#50](https://github.com/otomatty/zedi/issues/50).

### Environment Variables (Optional)

For AI features, authentication, and API integration, create `.env.local`. See [.env.example](.env.example).

```bash
# REST API (Hono on Bun: server/api). Base URL the frontend calls.
VITE_API_BASE_URL=http://localhost:3000

# Real-time collaboration (Hocuspocus / Y.js: server/hocuspocus)
VITE_REALTIME_URL=ws://localhost:1234   # Production: wss://realtime.zedi-note.app etc.

# Pro plan billing (Polar, optional)
# VITE_POLAR_PRO_MONTHLY_PRODUCT_ID=...
# VITE_POLAR_PRO_YEARLY_PRODUCT_ID=...
```

On the server (`server/api`), configure Better Auth (`BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`), PostgreSQL, Polar `POLAR_ACCESS_TOKEN`, email `RESEND_API_KEY`, etc. See [.env.example](.env.example).

> **Note:** The frontend runs locally without env vars (some data in IndexedDB). AI features can use provider API keys entered in the app settings.

---

## 🛠 Tech Stack

| Category          | Technology                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| **Frontend**      | React 19 + TypeScript 6 / React Router v7                                                               |
| **Build Tool**    | Vite 8 (`@vitejs/plugin-react-swc`) / Bun                                                               |
| **Desktop**       | Tauri 2.0 (Rust) — `src-tauri/`                                                                         |
| **Editor**        | Tiptap 3 (ProseMirror) — tables / math (KaTeX) / code (lowlight) / collaboration (Y.js)                 |
| **Styling**       | Tailwind CSS v4 + shadcn/ui (Radix UI primitives) / `next-themes`                                       |
| **State / Data**  | Zustand 5 + TanStack Query 5 / React Hook Form + Zod                                                    |
| **i18n**          | i18next + react-i18next                                                                                 |
| **Visualization** | Recharts / `@xyflow/react` (React Flow) / Mermaid / KaTeX / Tesseract.js (OCR)                          |
| **Auth**          | [Better Auth](https://better-auth.com/) (OAuth / session cookies)                                       |
| **API**           | `server/api` — Hono on Bun + Drizzle ORM (PostgreSQL)                                                   |
| **Database**      | PostgreSQL (Drizzle migrations: `server/api/drizzle/`) / IndexedDB (local browser)                      |
| **Realtime**      | `server/hocuspocus` — Hocuspocus (Y.js) real-time collaboration                                         |
| **MCP**           | `server/mcp` — Claude Code integration (stdio / HTTP; see [server/mcp/README.md](server/mcp/README.md)) |
| **Storage**       | AWS S3 (upload via API, `@aws-sdk/client-s3`)                                                           |
| **Billing**       | [Polar](https://polar.sh/) (`@polar-sh/sdk`) — Pro plan                                                 |
| **Email**         | Resend                                                                                                  |
| **AI**            | OpenAI / Anthropic / Google Gemini (pricing via OpenRouter)                                             |
| **Browser Ext.**  | `extension/` — Manifest v3 (Chrome extension)                                                           |
| **Admin**         | `admin/` — separate Vite + React app                                                                    |
| **Workspaces**    | Bun workspaces: `packages/ui` (shadcn), `packages/claude-sidecar` / `admin`                             |
| **Deploy**        | Cloudflare Pages (frontend) + Railway (`server/api`, `hocuspocus`, `mcp`) / Terraform (Cloudflare)      |
| **CI/CD**         | GitHub Actions (lint / typecheck / test / mutation / deploy)                                            |
| **Testing**       | Vitest 4 + Testing Library / Playwright / Stryker (mutation testing)                                    |
| **Tooling**       | ESLint 9 / Prettier / Husky + lint-staged / commitlint / Knip                                           |

---

## 🗺 Roadmap

### ✅ Completed

- [x] React + Vite foundation
- [x] Page CRUD
- [x] Date Grid UI
- [x] WikiLinks (with suggestions)
- [x] AI Wiki Generator
- [x] Web Clipper
- [x] Global Search
- [x] Keyboard shortcuts
- [x] Better Auth (OAuth / session cookies)
- [x] Markdown export
- [x] Backlinks / 2-hop Links
- [x] Linked Pages cards

See Issues / Discussions for roadmap details.

---

## 🧪 Testing

```bash
# Unit tests
bun run test

# E2E tests
bun run test:e2e

# Coverage
bun run test:coverage

# Mutation testing (Stryker; mutation score is the primary quality metric)
bun run test:mutation:dry
bun run test:mutation
```

Quality metrics, testing policy, and how to write specifications: [AGENTS.md](AGENTS.md) and [SPECIFICATION_POLICY.md](SPECIFICATION_POLICY.md).

---

## 📁 Project Structure

```
src/                     # Frontend (React + Vite)
├── components/          # React components (editor / page / search / layout / ui etc.)
├── hooks/               # Custom hooks
├── lib/                 # Utilities (`claudeCode/` = Tauri↔Claude Code bridge)
├── pages/               # Route page components (React Router v7)
├── stores/              # Zustand stores
└── types/               # TypeScript types

src-tauri/               # Tauri 2.0 desktop backend (Rust)
├── src/
│   ├── main.rs          # Desktop entry point
│   ├── lib.rs           # Tauri app + command definitions
│   └── claude_sidecar.rs # Claude Code sidecar process (Issue #456)
├── binaries/            # externalBin (`bun run sidecar:build`, gitignored)
├── capabilities/        # Security capability definitions
├── icons/               # App icons (per OS)
├── Cargo.toml           # Rust dependencies
└── tauri.conf.json      # Tauri config

server/                  # Bun projects deployed separately on Railway
├── api/                 # REST / Auth API (Hono on Bun + Better Auth + Drizzle ORM)
├── hocuspocus/          # Real-time collaboration (Hocuspocus / Y.js)
└── mcp/                 # MCP server — Claude Code (stdio / HTTP). See [server/mcp/README.md](server/mcp/README.md)

packages/                # Bun workspaces (shared libraries)
├── ui/                  # `@zedi/ui` — shadcn/ui shared components
└── claude-sidecar/      # Claude Code client for Tauri sidecar

admin/                   # Admin SPA (separate Vite + React + Tailwind / `@zedi/ui`)
extension/               # Browser extension (Manifest v3, Web Clipper)
server/api/drizzle/      # PostgreSQL migrations (drizzle-kit source of truth)
terraform/cloudflare/    # Cloudflare infrastructure
e2e/                     # Playwright E2E tests
scripts/                 # Setup / sidecar build / Stryker / extension build scripts
.github/workflows/       # GitHub Actions (lint / typecheck / test / mutation / deploy)
```

---

## 🤝 Contributing

Contributions are welcome!

1. Fork this repository
2. Create a feature branch from `develop` (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request against `develop`

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md) (branch, PR, and merge policy).

---

## 📄 License

This project is released under the **Business Source License 1.1 (BSL 1.1)** (source-available). Commercial competing services are restricted; personal use, internal use, modification, and redistribution are allowed. It automatically converts to [Mozilla Public License 2.0 (MPL 2.0)](https://www.mozilla.org/en-US/MPL/2.0/) **four years** after first publication. See [LICENSE](LICENSE).

---

## 🙏 Acknowledgments

- [Tiptap](https://tiptap.dev/) — Editor framework (ProseMirror)
- [shadcn/ui](https://ui.shadcn.com/) / [Radix UI](https://www.radix-ui.com/) — UI components
- [Hocuspocus](https://hocuspocus.dev/) / [Y.js](https://yjs.dev/) — Real-time collaboration
- [Better Auth](https://better-auth.com/) — Authentication (OAuth / session cookies)
- [Hono](https://hono.dev/) — API framework (on Bun)
- [Drizzle ORM](https://orm.drizzle.team/) — TypeScript ORM
- [Polar](https://polar.sh/) — Pro plan billing
- [Tauri](https://tauri.app/) — Cross-platform desktop
- [Cloudflare Pages](https://pages.cloudflare.com/) / [Railway](https://railway.com/) — Hosting

---

<p align="center">
  Made with ❤️ by Saedgewell
</p>
