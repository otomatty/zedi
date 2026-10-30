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

### Environment Variables (Optional)

The old backend (`server/api`, `server/hocuspocus`, `server/mcp`) has been removed, so the current frontend has no API to sign in to or sync with. [.env.example](.env.example) only holds the values it needs to build. The rebuilt app in `app/` keeps its settings in `app/.dev.vars` (see [app/README.md](app/README.md)).

> **Note:** The frontend runs locally without env vars (some data in IndexedDB). AI features can use provider API keys entered in the app settings.

---

## 🛠 Tech Stack

| Category          | Technology                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| **Frontend**      | React 19 + TypeScript 6 / React Router v7                                                            |
| **Build Tool**    | Vite 8 (`@vitejs/plugin-react-swc`) / Bun                                                            |
| **Editor**        | Tiptap 3 (ProseMirror) — tables / math (KaTeX) / code (lowlight) / collaboration (Y.js)              |
| **Styling**       | Tailwind CSS v4 + shadcn/ui (Radix UI primitives) / `next-themes`                                    |
| **State / Data**  | Zustand 5 + TanStack Query 5 / React Hook Form + Zod                                                 |
| **i18n**          | i18next + react-i18next                                                                              |
| **Visualization** | Recharts / `@xyflow/react` (React Flow) / Mermaid / KaTeX / Tesseract.js (OCR)                       |
| **Auth**          | [Better Auth](https://better-auth.com/) (OAuth / session cookies)                                    |
| **Backend**       | `app/` (rebuild) — one Cloudflare Worker: Hono + Better Auth + D1 (Drizzle) + Durable Objects (Y.js) |
| **Database**      | D1 (migrations: `app/migrations/`) / IndexedDB (local browser)                                       |
| **AI**            | OpenAI / Anthropic / Google Gemini (pricing via OpenRouter)                                          |
| **Admin**         | `admin/` — separate Vite + React app                                                                 |
| **Workspaces**    | Bun workspaces: `packages/ui` (shadcn), `packages/shared` / `admin`                                  |
| **Deploy**        | None at the moment; the rebuilt `app/` will deploy as one Cloudflare Worker (`wrangler deploy`)      |
| **CI/CD**         | GitHub Actions (lint / typecheck / test / mutation)                                                  |
| **Testing**       | Vitest 4 + Testing Library / Playwright / Stryker (mutation testing)                                 |
| **Tooling**       | ESLint 9 / Prettier / Husky + lint-staged / commitlint / Knip                                        |

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

Quality metrics, testing policy (TDD / mutation), and how to write specifications: [AGENTS.md](AGENTS.md).

---

## 📁 Project Structure

Zedi is being rebuilt in `app/` on a single Cloudflare Worker (hono/jsx/dom, Hono, Better Auth, D1, Durable Objects). Once it covers the current app's features it replaces `src/` and `admin/`. The old backend (`server/*`) has been removed. See [app/README.md](app/README.md).

```
app/                     # The rebuilt app (one Worker; outside the root workspace)
src/                     # Frontend (React + Vite)
├── components/          # React components (editor / page / search / layout / ui etc.)
├── hooks/               # Custom hooks
├── lib/                 # Utilities
├── pages/               # Route page components (React Router v7)
├── stores/              # Zustand stores
└── types/               # TypeScript types

packages/                # Bun workspaces (shared libraries)
└── ui/                  # `@zedi/ui` — shadcn/ui shared components

admin/                   # Admin SPA (separate Vite + React + Tailwind / `@zedi/ui`)
e2e/                     # Playwright E2E tests
scripts/                 # Setup / Stryker / maintenance scripts
.github/workflows/       # GitHub Actions (lint / typecheck / test / mutation)
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
- [Y.js](https://yjs.dev/) / [PartyServer](https://github.com/cloudflare/partykit) — Real-time collaboration
- [Better Auth](https://better-auth.com/) — Authentication (OAuth / session cookies)
- [Hono](https://hono.dev/) — API framework (on Cloudflare Workers)
- [Drizzle ORM](https://orm.drizzle.team/) — TypeScript ORM
- [Polar](https://polar.sh/) — Pro plan billing
- [Cloudflare](https://www.cloudflare.com/) — Hosting

---

<p align="center">
  Made with ❤️ by Saedgewell
</p>
